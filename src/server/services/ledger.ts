import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { expensePayers, expenses, expenseSplits, settlements, tripMembers } from "@/server/db/schema";
import { computeSplitAllocations } from "@/server/ledger/split";
import { simplifyCurrencyBalances } from "@/server/ledger/settlement";

export type MemberMeta = {
  memberId: string;
  email: string;
  displayName: string;
  preferredSettlementCurrency: string | null;
};

export type CurrencyBalance = {
  memberId: string;
  currency: string;
  balanceCents: number;
};

export async function computeTripBalances(tripId: string) {
  const members = await db
    .select({
      id: tripMembers.id,
      email: tripMembers.email,
      displayName: tripMembers.displayName,
      preferredSettlementCurrency: tripMembers.preferredSettlementCurrency,
    })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));

  const memberIds = members.map((member) => member.id);

  if (!memberIds.length) {
    return {
      members: [] as MemberMeta[],
      balances: [] as CurrencyBalance[],
    };
  }

  const tripExpenses = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));
  const expenseIds = tripExpenses.map((expense) => expense.id);

  const payers = expenseIds.length
    ? await db.select().from(expensePayers).where(inArray(expensePayers.expenseId, expenseIds))
    : [];

  const splits = expenseIds.length
    ? await db.select().from(expenseSplits).where(inArray(expenseSplits.expenseId, expenseIds))
    : [];

  const tripSettlements = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.tripId, tripId), eq(settlements.status, "approved")));

  const balancesMap = new Map<string, number>();
  const expenseById = new Map(tripExpenses.map((expense) => [expense.id, expense]));

  for (const payer of payers) {
    const expense = expenseById.get(payer.expenseId);

    if (!expense) {
      continue;
    }

    const key = `${payer.memberId}:${expense.currency}`;
    balancesMap.set(key, (balancesMap.get(key) ?? 0) + payer.amountCents);
  }

  const splitByExpense = new Map<string, typeof splits>();

  for (const split of splits) {
    if (!splitByExpense.has(split.expenseId)) {
      splitByExpense.set(split.expenseId, []);
    }

    splitByExpense.get(split.expenseId)!.push(split);
  }

  for (const expense of tripExpenses) {
    const expenseSplitsRows = splitByExpense.get(expense.id) ?? [];
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

    for (const [memberId, amount] of allocations.entries()) {
      const key = `${memberId}:${expense.currency}`;
      balancesMap.set(key, (balancesMap.get(key) ?? 0) - amount);
    }
  }

  for (const settlement of tripSettlements) {
    const fromKey = `${settlement.fromMemberId}:${settlement.currency}`;
    const toKey = `${settlement.toMemberId}:${settlement.currency}`;

    balancesMap.set(fromKey, (balancesMap.get(fromKey) ?? 0) + settlement.amountCents);
    balancesMap.set(toKey, (balancesMap.get(toKey) ?? 0) - settlement.amountCents);
  }

  const balances: CurrencyBalance[] = [];

  for (const [key, amount] of balancesMap.entries()) {
    if (amount === 0) {
      continue;
    }

    const [memberId, currency] = key.split(":");
    balances.push({ memberId, currency, balanceCents: amount });
  }

  return {
    members: members.map((member) => ({
      memberId: member.id,
      email: member.email,
      displayName: member.displayName ?? member.email,
      preferredSettlementCurrency: member.preferredSettlementCurrency,
    })),
    balances,
  };
}

export async function computeTripSettlementPlan(tripId: string, simplify: boolean) {
  const { members, balances } = await computeTripBalances(tripId);

  if (!simplify) {
    const transfers = simplifyCurrencyBalances(balances.map((balance) => ({
      memberId: balance.memberId,
      currency: balance.currency,
      amountCents: balance.balanceCents,
    })));

    return { members, balances, transfers };
  }

  return {
    members,
    balances,
    transfers: simplifyCurrencyBalances(
      balances.map((balance) => ({
        memberId: balance.memberId,
        currency: balance.currency,
        amountCents: balance.balanceCents,
      }))
    ),
  };
}
