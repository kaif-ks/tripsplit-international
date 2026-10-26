import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expenses, receipts, tripMembers } from "@/server/db/schema";
import { badRequest, created, forbidden, unauthorized } from "@/server/http";
import { receiptCompleteSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = receiptCompleteSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { tripId, expenseId, storageKey, fileName, mimeType, sizeBytes } = parsed.data;

  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!expense) {
    return badRequest("Expense not found");
  }

  await db.insert(receipts).values({
    id: nanoid(),
    expenseId,
    storageKey,
    fileName,
    mimeType,
    sizeBytes,
    uploadedByMemberId: membership.id,
  });

  return created({ ok: true });
}
