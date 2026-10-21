import { and, eq } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expenses, receipts, tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, notFound, unauthorized } from "@/server/http";
import { getS3Bucket, getS3Client } from "@/server/storage/s3";

type Params = {
  params: Promise<{ tripId: string; expenseId: string; receiptId: string }>;
};

function sanitizeFileName(name: string) {
  return name.replaceAll('"', "");
}

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, expenseId, receiptId } = await context.params;

  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId)))
    .limit(1);

  if (!expense) {
    return badRequest("Expense not found");
  }

  const [receipt] = await db
    .select({
      id: receipts.id,
      storageKey: receipts.storageKey,
      fileName: receipts.fileName,
      mimeType: receipts.mimeType,
    })
    .from(receipts)
    .where(and(eq(receipts.id, receiptId), eq(receipts.expenseId, expenseId)))
    .limit(1);

  if (!receipt) {
    return notFound("Receipt not found");
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
