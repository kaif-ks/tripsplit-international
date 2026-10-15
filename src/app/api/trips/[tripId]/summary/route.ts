import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expensePayers, expenses, tripMembers } from "@/server/db/schema";
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
      currency: expenses.currency,
      amountCents: expenses.amountCents,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));

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

  return ok({ summaries });
}
