import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expensePayers, expenses, expenseSplits, tripMembers, trips } from "@/server/db/schema";
import { getFxQuote } from "@/server/fx/rates";
import { forbidden, ok, unauthorized } from "@/server/http";
import { computeSplitAllocations } from "@/server/ledger/split";
import { computeTripBalances } from "@/server/services/ledger";

type Params = {
  params: Promise<{ tripId: string }>;
};

type CurrencySummary = {
  currency: string;
  totalExpenseCents: number;
  youPaidCents: number;
  yourNetCents: number;
};

type MemberTripTotalSummary = {
  memberId: string;
  currency: string;
  totalTripCents: number;
};

type MemberTripTotalApproxSummary = {
  memberId: string;
  targetCurrency: string;
  totalApproxCents: number;
  approximateConversionCount: number;
  unconvertedCurrencyCount: number;
};

type CategorySummary = {
  category: string;
  spentCents: number;
  refundCents: number;
  netCents: number;
};

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;
  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const tripMemberRows = await db
    .select({
      id: tripMembers.id,
      preferredSettlementCurrency: tripMembers.preferredSettlementCurrency,
    })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));

  const preferredCurrencyByMemberId = new Map(
    tripMemberRows.map((row) => [row.id, row.preferredSettlementCurrency])
  );

  const tripExpenses = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      currency: expenses.currency,
      amountCents: expenses.amountCents,
      splitMode: expenses.splitMode,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));

  const [trip] = await db
    .select({ defaultCurrency: trips.defaultCurrency })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  const defaultCurrency = trip?.defaultCurrency ?? "USD";

  const expenseIds = tripExpenses.map((expense) => expense.id);
  const payers = expenseIds.length
    ? await db
        .select({
          expenseId: expensePayers.expenseId,
          memberId: expensePayers.memberId,
          amountCents: expensePayers.amountCents,
        })
        .from(expensePayers)
        .where(inArray(expensePayers.expenseId, expenseIds))
    : [];

  const splits = expenseIds.length
    ? await db
        .select({
          expenseId: expenseSplits.expenseId,
          memberId: expenseSplits.memberId,
          amountCents: expenseSplits.amountCents,
          percentageBp: expenseSplits.percentageBp,
          shares: expenseSplits.shares,
        })
        .from(expenseSplits)
        .where(inArray(expenseSplits.expenseId, expenseIds))
    : [];

  const expenseById = new Map(tripExpenses.map((expense) => [expense.id, expense]));
  const totalByCurrency = new Map<string, number>();
  const paidByYouByCurrency = new Map<string, number>();

  for (const expense of tripExpenses) {
    totalByCurrency.set(expense.currency, (totalByCurrency.get(expense.currency) ?? 0) + expense.amountCents);
  }

  for (const payer of payers) {
    if (payer.memberId !== membership.id) {
      continue;
    }

    const expense = expenseById.get(payer.expenseId);

    if (!expense) {
      continue;
    }

    paidByYouByCurrency.set(
      expense.currency,
      (paidByYouByCurrency.get(expense.currency) ?? 0) + payer.amountCents
    );
  }

  const memberTripTotalByCurrency = new Map<string, number>();

  const splitsByExpenseId = new Map<string, typeof splits>();

  for (const split of splits) {
    if (!splitsByExpenseId.has(split.expenseId)) {
      splitsByExpenseId.set(split.expenseId, []);
    }

    splitsByExpenseId.get(split.expenseId)!.push(split);
  }

  for (const expense of tripExpenses) {
    const expenseSplitsRows = splitsByExpenseId.get(expense.id) ?? [];
    const allocations = computeSplitAllocations(
      expense.splitMode,
      expense.amountCents,
      expenseSplitsRows.map((split) => ({
        memberId: split.memberId,
        amountCents: split.amountCents ?? undefined,
        percentageBp: split.percentageBp ?? undefined,
        shares: split.shares ?? undefined,
      }))
    );

    for (const [memberId, amountCents] of allocations.entries()) {
      const key = `${memberId}:${expense.currency}`;
      memberTripTotalByCurrency.set(key, (memberTripTotalByCurrency.get(key) ?? 0) + amountCents);
    }
  }

  const memberTripTotals: MemberTripTotalSummary[] = [...memberTripTotalByCurrency.entries()]
    .map(([key, totalTripCents]) => {
      const [memberId, currency] = key.split(":");

      return {
        memberId,
        currency,
        totalTripCents,
      };
    })
    .sort(
      (left, right) =>
        left.memberId.localeCompare(right.memberId) || left.currency.localeCompare(right.currency)
    );

  const { balances } = await computeTripBalances(tripId);
  const netByCurrency = new Map<string, number>();

  for (const balance of balances) {
    if (balance.memberId !== membership.id) {
      continue;
    }

    netByCurrency.set(balance.currency, balance.balanceCents);
  }

  const currencies = new Set<string>([
    ...totalByCurrency.keys(),
    ...paidByYouByCurrency.keys(),
    ...netByCurrency.keys(),
  ]);

  const summaries: CurrencySummary[] = [...currencies]
    .sort((a, b) => a.localeCompare(b))
    .map((currency) => ({
      currency,
      totalExpenseCents: totalByCurrency.get(currency) ?? 0,
      youPaidCents: paidByYouByCurrency.get(currency) ?? 0,
      yourNetCents: netByCurrency.get(currency) ?? 0,
    }));

  const conversionPairs = new Set<string>();

  for (const expense of tripExpenses) {
    if (expense.currency === defaultCurrency) {
      continue;
    }

    conversionPairs.add(`${expense.currency}:${defaultCurrency}`);
  }

  for (const row of memberTripTotals) {
    const targetCurrency = preferredCurrencyByMemberId.get(row.memberId);

    if (!targetCurrency || targetCurrency === row.currency) {
      continue;
    }

    conversionPairs.add(`${row.currency}:${targetCurrency}`);
  }

  const quotesByPair = new Map<string, Awaited<ReturnType<typeof getFxQuote>>>();

  await Promise.all(
    [...conversionPairs].map(async (pair) => {
      const [fromCurrency, toCurrency] = pair.split(":");
      const quote = await getFxQuote(fromCurrency, toCurrency);
      quotesByPair.set(pair, quote);
    })
  );

  const categoryTotals = new Map<string, { spentCents: number; refundCents: number }>();
  let approximateConversionCount = 0;
  let unconvertedExpenseCount = 0;

  for (const expense of tripExpenses) {
    const pair = `${expense.currency}:${defaultCurrency}`;
    const quote = expense.currency === defaultCurrency ? null : quotesByPair.get(pair);

    if (expense.currency !== defaultCurrency && !quote) {
      unconvertedExpenseCount += 1;
      continue;
    }

    const convertedAmountCents = quote
      ? Math.round(expense.amountCents * quote.rate)
      : expense.amountCents;

    if (quote) {
      approximateConversionCount += 1;
    }

    const current = categoryTotals.get(expense.category) ?? { spentCents: 0, refundCents: 0 };

    if (convertedAmountCents >= 0) {
      current.spentCents += convertedAmountCents;
    } else {
      current.refundCents += Math.abs(convertedAmountCents);
    }

    categoryTotals.set(expense.category, current);
  }

  const rankedCategories: CategorySummary[] = [...categoryTotals.entries()]
    .map(([category, totals]) => ({
      category,
      spentCents: totals.spentCents,
      refundCents: totals.refundCents,
      netCents: totals.spentCents - totals.refundCents,
    }))
    .sort((left, right) => right.netCents - left.netCents);

  const totalSpentCents = rankedCategories.reduce((sum, row) => sum + row.spentCents, 0);
  const topSpentCents = rankedCategories[0]?.spentCents ?? 0;
  const totalNetCents = rankedCategories.reduce((sum, row) => sum + row.netCents, 0);
  const topNetCents = rankedCategories[0]?.netCents ?? 0;

  const memberTripTotalsApproxByMemberId = new Map<string, MemberTripTotalApproxSummary>();

  for (const row of memberTripTotals) {
    const targetCurrency = preferredCurrencyByMemberId.get(row.memberId);

    if (!targetCurrency) {
      continue;
    }

    const existing = memberTripTotalsApproxByMemberId.get(row.memberId) ?? {
      memberId: row.memberId,
      targetCurrency,
      totalApproxCents: 0,
      approximateConversionCount: 0,
      unconvertedCurrencyCount: 0,
    };

    if (row.currency === targetCurrency) {
      existing.totalApproxCents += row.totalTripCents;
      memberTripTotalsApproxByMemberId.set(row.memberId, existing);
      continue;
    }

    const pair = `${row.currency}:${targetCurrency}`;
    const quote = quotesByPair.get(pair);

    if (!quote) {
      existing.unconvertedCurrencyCount += 1;
      memberTripTotalsApproxByMemberId.set(row.memberId, existing);
      continue;
    }

    existing.totalApproxCents += Math.round(row.totalTripCents * quote.rate);

    if (quote.source !== "identity") {
      existing.approximateConversionCount += 1;
    }

    memberTripTotalsApproxByMemberId.set(row.memberId, existing);
  }

  const memberTripTotalsApprox = [...memberTripTotalsApproxByMemberId.values()].sort((left, right) =>
    left.memberId.localeCompare(right.memberId)
  );

  return ok({
    summaries,
    memberTripTotals,
    memberTripTotalsApprox,
    categoryCumulative: {
      currency: defaultCurrency,
      ranked: rankedCategories,
      totalSpentCents,
      topSpentCents,
      totalNetCents,
      topNetCents,
      approximateConversionCount,
      unconvertedExpenseCount,
    },
  });
}
