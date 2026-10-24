import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expenses, settlements, tripMembers, trips } from "@/server/db/schema";
import { badRequest, forbidden, notFound, ok, unauthorized } from "@/server/http";

type Params = {
  params: Promise<{ tripId: string; expenseId: string }>;
};

export async function POST(request: NextRequest, context: Params) {
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

  if (!existingExpense.deletedAt) {
    return ok({ ok: true });
  }

  const canRestore =
    membership.role === "owner" ||
    membership.role === "admin" ||
    existingExpense.createdByMemberId === membership.id;

  if (!canRestore) {
    return forbidden("Only owner/admin or expense creator can restore this expense");
  }

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
      return forbidden("Trip is locked for expense restores after settlements started");
    }
  }

  await db
    .update(expenses)
    .set({
      deletedAt: null,
      deletedByMemberId: null,
    })
    .where(eq(expenses.id, expenseId));

  return ok({ ok: true });
}
