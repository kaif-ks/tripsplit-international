import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { settlementRequestKeys, settlements, tripMembers } from "@/server/db/schema";
import { badRequest, created, forbidden, ok, unauthorized } from "@/server/http";
import { createSettlementSchema } from "@/server/validators";

type Params = {
  params: Promise<{ tripId: string }>;
};

function readIdempotencyKey(request: NextRequest) {
  const fromStandardHeader = request.headers.get("idempotency-key")?.trim();
  const fromXHeader = request.headers.get("x-idempotency-key")?.trim();
  const value = fromStandardHeader || fromXHeader;

  if (!value) {
    return null;
  }

  return value;
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "23505";
}

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

  const rows = await db.select().from(settlements).where(eq(settlements.tripId, tripId));

  return ok({ settlements: rows });
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
  const parsed = createSettlementSchema.safeParse({ ...body, tripId });

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  if (parsed.data.fromMemberId === parsed.data.toMemberId) {
    return badRequest("fromMemberId and toMemberId cannot be same");
  }

  const idempotencyKey = readIdempotencyKey(request);

  if (idempotencyKey && idempotencyKey.length > 120) {
    return badRequest("Idempotency key is too long");
  }

  if (idempotencyKey) {
    const [existingRequest] = await db
      .select({ settlementId: settlementRequestKeys.settlementId })
      .from(settlementRequestKeys)
      .where(
        and(
          eq(settlementRequestKeys.tripId, tripId),
          eq(settlementRequestKeys.createdByMemberId, membership.id),
          eq(settlementRequestKeys.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);

    if (existingRequest) {
      return ok({ ok: true, idempotent: true, settlementId: existingRequest.settlementId });
    }
  }

  const settlementId = nanoid();

  if (idempotencyKey) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(settlementRequestKeys).values({
          id: nanoid(),
          tripId,
          createdByMemberId: membership.id,
          idempotencyKey,
          settlementId,
        });

        await tx.insert(settlements).values({
          id: settlementId,
          tripId,
          currency: parsed.data.currency,
          fromMemberId: parsed.data.fromMemberId,
          toMemberId: parsed.data.toMemberId,
          amountCents: parsed.data.amountCents,
          paidAt: new Date(parsed.data.paidAt),
          notes: parsed.data.notes ?? null,
          createdByMemberId: membership.id,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [existingRequest] = await db
          .select({ settlementId: settlementRequestKeys.settlementId })
          .from(settlementRequestKeys)
          .where(
            and(
              eq(settlementRequestKeys.tripId, tripId),
              eq(settlementRequestKeys.createdByMemberId, membership.id),
              eq(settlementRequestKeys.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);

        if (existingRequest) {
          return ok({ ok: true, idempotent: true, settlementId: existingRequest.settlementId });
        }
      }

      throw error;
    }

    return created({ ok: true, idempotent: false, settlementId });
  }

  await db.insert(settlements).values({
    id: settlementId,
    tripId,
    currency: parsed.data.currency,
    fromMemberId: parsed.data.fromMemberId,
    toMemberId: parsed.data.toMemberId,
    amountCents: parsed.data.amountCents,
    paidAt: new Date(parsed.data.paidAt),
    notes: parsed.data.notes ?? null,
    createdByMemberId: membership.id,
  });

  return created({ ok: true, idempotent: false, settlementId });
}

export async function DELETE(request: NextRequest, context: Params) {
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

  if (membership.role !== "owner" && membership.role !== "admin") {
    return forbidden("Only owners/admins can undo settlements");
  }

  const [latestSettlement] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(eq(settlements.tripId, tripId))
    .orderBy(desc(settlements.paidAt), desc(settlements.createdAt), desc(settlements.id))
    .limit(1);

  if (!latestSettlement) {
    return badRequest("No settlements to undo");
  }

  await db.delete(settlements).where(eq(settlements.id, latestSettlement.id));

  return ok({ ok: true, undoneSettlementId: latestSettlement.id });
}
