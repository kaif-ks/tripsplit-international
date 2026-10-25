import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expensePayers, expenses, tripMembers, trips } from "@/server/db/schema";
import { getFxQuote } from "@/server/fx/rates";
import { forbidden, ok, unauthorized } from "@/server/http";
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

type MemberSpendSummary = {
  memberId: string;
  currency: string;
  totalPaidCents: number;
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

  const tripExpenses = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      currency: expenses.currency,
      amountCents: expenses.amountCents,
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

  const memberSpendByCurrency = new Map<string, number>();

  for (const payer of payers) {
    const expense = expenseById.get(payer.expenseId);

    if (!expense) {
      continue;
    }

    const key = `${payer.memberId}:${expense.currency}`;
    memberSpendByCurrency.set(key, (memberSpendByCurrency.get(key) ?? 0) + payer.amountCents);
  }

  const memberSpendTotals: MemberSpendSummary[] = [...memberSpendByCurrency.entries()]
    .map(([key, totalPaidCents]) => {
      const [memberId, currency] = key.split(":");

      return {
        memberId,
        currency,
        totalPaidCents,
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

  return ok({
    summaries,
    memberSpendTotals,
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
