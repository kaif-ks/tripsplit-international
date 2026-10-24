import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { settlementReceipts, settlements, tripMembers } from "@/server/db/schema";
import { badRequest, created, forbidden, unauthorized } from "@/server/http";
import { settlementReceiptCompleteSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = settlementReceiptCompleteSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { tripId, settlementId, storageKey, fileName, mimeType, sizeBytes } = parsed.data;

  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [settlement] = await db
    .select({
      id: settlements.id,
      fromMemberId: settlements.fromMemberId,
      createdByMemberId: settlements.createdByMemberId,
      status: settlements.status,
    })
    .from(settlements)
    .where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
    .limit(1);

  if (!settlement) {
    return badRequest("Settlement request not found");
  }

  if (settlement.status !== "pending") {
    return badRequest("Screenshot can be attached only while settlement is pending");
  }

  const canManageAny = membership.role === "owner" || membership.role === "admin";
  const canUpload =
    canManageAny ||
    membership.id === settlement.fromMemberId ||
    membership.id === settlement.createdByMemberId;

  if (!canUpload) {
    return forbidden("Only the requester can attach a screenshot");
  }

  await db.insert(settlementReceipts).values({
    id: nanoid(),
    settlementId,
    storageKey,
    fileName,
    mimeType,
    sizeBytes,
    uploadedByMemberId: membership.id,
  });

  return created({ ok: true });
}
