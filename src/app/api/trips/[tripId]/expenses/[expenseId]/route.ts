import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import {
  expensePayers,
  expenses,
  expenseSplits,
  settlements,
  tripMembers,
  trips,
} from "@/server/db/schema";
import { computeSplitAllocations } from "@/server/ledger/split";
import { badRequest, forbidden, notFound, ok, unauthorized } from "@/server/http";
import { createExpenseSchema } from "@/server/validators";

type Params = {
  params: Promise<{ tripId: string; expenseId: string }>;
};

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, expenseId } = await context.params;

  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)))
    .limit(1);

  if (!expense) {
    return notFound("Expense not found");
  }

  if (expense.deletedAt) {
    return badRequest("Expense is deleted");
  }

  const payers = await db.select().from(expensePayers).where(eq(expensePayers.expenseId, expenseId));
  const splits = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));

  return ok({ expense, payers, splits });
}

export async function PATCH(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, expenseId } = await context.params;

  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [existingExpense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)))
    .limit(1);

  if (!existingExpense) {
    return notFound("Expense not found");
  }

  if (existingExpense.deletedAt) {
    return badRequest("Cannot edit a deleted expense");
  }

  const canEdit =
    membership.role === "owner" ||
    membership.role === "admin" ||
    existingExpense.createdByMemberId === membership.id;

  if (!canEdit) {
    return forbidden("Only owner/admin or expense creator can edit this expense");
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
      .where(eq(settlements.tripId, tripId))
      .limit(1);

    if (existingSettlement) {
      return forbidden("Trip is locked for expense edits after settlements started");
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

  await db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({
        title: data.title,
        category: data.category,
        notes: data.notes ?? null,
        currency: data.currency,
        amountCents: data.amountCents,
        occurredAt: new Date(data.occurredAt),
        splitMode: data.splitMode,
      })
      .where(eq(expenses.id, expenseId));

    await tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId));
    await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));

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

  return ok({ ok: true });
}

export async function DELETE(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, expenseId } = await context.params;

  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [existingExpense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)))
    .limit(1);

  if (!existingExpense) {
    return notFound("Expense not found");
  }

  const canDelete =
    membership.role === "owner" ||
    membership.role === "admin" ||
    existingExpense.createdByMemberId === membership.id;

  if (!canDelete) {
    return forbidden("Only owner/admin or expense creator can delete this expense");
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);

  if (!trip) {
    return badRequest("Trip not found");
  }

  if (trip.lockAfterSettlement) {
    const [existingSettlement] = await db
      .select({ id: settlements.id })
      .from(settlements)
      .where(eq(settlements.tripId, tripId))
      .limit(1);

    if (existingSettlement) {
      return forbidden("Trip is locked for expense deletions after settlements started");
    }
  }

  if (existingExpense.deletedAt) {
    return ok({ ok: true });
  }

  await db
    .update(expenses)
    .set({
      deletedAt: new Date(),
      deletedByMemberId: membership.id,
    })
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)));

  return ok({ ok: true });
}
