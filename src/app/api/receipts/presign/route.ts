import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expenses, tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, ok, unauthorized } from "@/server/http";
import { getS3Bucket, getS3Client } from "@/server/storage/s3";
import { receiptPresignSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = receiptPresignSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { tripId, expenseId, fileName, mimeType, sizeBytes } = parsed.data;
  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [expense] = await db
    .select({ id: expenses.id, tripId: expenses.tripId })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!expense) {
    return badRequest("Expense not found");
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const key = `receipts/${tripId}/${expenseId}/${nanoid()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 * 5 });

  const publicBase = process.env.S3_PUBLIC_BASE_URL;
  const fileUrl = publicBase ? `${publicBase}/${key}` : null;

  return ok({ uploadUrl, storageKey: key, fileUrl });
}
