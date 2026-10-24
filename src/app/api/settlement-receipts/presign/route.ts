import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { settlements, tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, ok, unauthorized } from "@/server/http";
import { getS3Bucket, getS3Client } from "@/server/storage/s3";
import { settlementReceiptPresignSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = settlementReceiptPresignSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { tripId, settlementId, fileName, mimeType, sizeBytes } = parsed.data;
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

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const key = `settlement-receipts/${tripId}/${settlementId}/${nanoid()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 5 });

  return ok({ uploadUrl, storageKey: key });
}
