import { and, eq } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { settlementReceipts, settlements, tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, notFound, unauthorized } from "@/server/http";
import { getS3Bucket, getS3Client } from "@/server/storage/s3";

type Params = {
  params: Promise<{ tripId: string; settlementId: string; receiptId: string }>;
};

function sanitizeFileName(name: string) {
  return name.replaceAll('"', "");
}

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, settlementId, receiptId } = await context.params;

  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [settlement] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
    .limit(1);

  if (!settlement) {
    return badRequest("Settlement request not found");
  }

  const [receipt] = await db
    .select({
      id: settlementReceipts.id,
      storageKey: settlementReceipts.storageKey,
      fileName: settlementReceipts.fileName,
      mimeType: settlementReceipts.mimeType,
    })
    .from(settlementReceipts)
    .where(and(eq(settlementReceipts.id, receiptId), eq(settlementReceipts.settlementId, settlementId)))
    .limit(1);

  if (!receipt) {
    return notFound("Settlement screenshot not found");
  }

  const command = new GetObjectCommand({
    Bucket: getS3Bucket(),
    Key: receipt.storageKey,
    ResponseContentType: receipt.mimeType,
    ResponseContentDisposition: `inline; filename="${sanitizeFileName(receipt.fileName)}"`,
  });

  const downloadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 5 });

  return NextResponse.redirect(downloadUrl, { status: 302 });
}
