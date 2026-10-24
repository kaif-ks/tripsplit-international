import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expensePayers, expenses, expenseSplits, settlements, tripMembers, trips } from "@/server/db/schema";
import { computeSplitAllocations } from "@/server/ledger/split";
import { badRequest, created, forbidden, ok, unauthorized } from "@/server/http";
import { createExpenseSchema } from "@/server/validators";

type Params = {
  params: Promise<{ tripId: string }>;
};

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;
  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const rows = await db
    .select({
      id: expenses.id,
      title: expenses.title,
      category: expenses.category,
      notes: expenses.notes,
      currency: expenses.currency,
      amountCents: expenses.amountCents,
      occurredAt: expenses.occurredAt,
      splitMode: expenses.splitMode,
      createdAt: expenses.createdAt,
      createdByMemberId: expenses.createdByMemberId,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.occurredAt));

  const deletedRows = await db
    .select({
      id: expenses.id,
      title: expenses.title,
      category: expenses.category,
      notes: expenses.notes,
      currency: expenses.currency,
      amountCents: expenses.amountCents,
      occurredAt: expenses.occurredAt,
      splitMode: expenses.splitMode,
      createdAt: expenses.createdAt,
      createdByMemberId: expenses.createdByMemberId,
      deletedAt: expenses.deletedAt,
      deletedByMemberId: expenses.deletedByMemberId,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNotNull(expenses.deletedAt)))
    .orderBy(desc(expenses.deletedAt));

  return ok({ expenses: rows, deletedExpenses: deletedRows });
}

export async function POST(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;

  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const body = await request.json();
  const parsed = createExpenseSchema.safeParse({ ...body, tripId });

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const data = parsed.data;
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);

  if (!trip) {
    return badRequest("Trip not found");
  }

  if (trip.lockAfterSettlement) {
    const [existingSettlement] = await db
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.tripId, tripId), eq(settlements.status, "approved")))
      .limit(1);

    if (existingSettlement) {
      return forbidden("Trip is locked for new expenses after settlements started");
    }
  }

  const payerSum = data.payers.reduce((sum, payer) => sum + payer.amountCents, 0);

  if (payerSum !== data.amountCents) {
    return badRequest("Payer amounts must sum to expense amount");
  }

  try {
    computeSplitAllocations(data.splitMode, data.amountCents, data.splits);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid split definition");
  }

  const memberIds = new Set(
    (await db.select({ id: tripMembers.id }).from(tripMembers).where(eq(tripMembers.tripId, tripId))).map(
      (member) => member.id
    )
  );

  for (const payer of data.payers) {
    if (!memberIds.has(payer.memberId)) {
      return badRequest("Payer member does not belong to trip");
    }
  }

  for (const split of data.splits) {
    if (!memberIds.has(split.memberId)) {
      return badRequest("Split member does not belong to trip");
    }
  }

  const expenseId = nanoid();

  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({
      id: expenseId,
      tripId,
      title: data.title,
      category: data.category,
      notes: data.notes ?? null,
      currency: data.currency,
      amountCents: data.amountCents,
      occurredAt: new Date(data.occurredAt),
      splitMode: data.splitMode,
      createdByMemberId: membership.id,
    });

    await tx.insert(expensePayers).values(
      data.payers.map((payer) => ({
        id: nanoid(),
        expenseId,
        memberId: payer.memberId,
        amountCents: payer.amountCents,
      }))
    );

    await tx.insert(expenseSplits).values(
      data.splits.map((split) => ({
        id: nanoid(),
        expenseId,
        memberId: split.memberId,
        amountCents: split.amountCents ?? null,
        percentageBp: split.percentageBp ?? null,
        shares: split.shares ?? null,
      }))
    );
  });

  return created({ expenseId });
}
