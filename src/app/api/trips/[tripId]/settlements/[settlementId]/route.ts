import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { settlements, tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, notFound, ok, unauthorized } from "@/server/http";
import { settlementApprovalSchema } from "@/server/validators";

type Params = {
  params: Promise<{ tripId: string; settlementId: string }>;
};

export async function PATCH(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId, settlementId } = await context.params;
  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const body = await request.json();
  const parsed = settlementApprovalSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
    .limit(1);

  if (!settlement) {
    return notFound("Settlement request not found");
  }

  if (settlement.toMemberId !== membership.id) {
    return forbidden("Only the receiving member can review this settlement request");
  }

  if (settlement.status !== "pending") {
    return badRequest("This settlement request has already been reviewed");
  }

  const nextStatus = parsed.data.action === "approve" ? "approved" : "rejected";

  const [updatedSettlement] = await db
    .update(settlements)
    .set({
      status: nextStatus,
      reviewedByMemberId: membership.id,
      reviewedAt: new Date(),
    })
    .where(and(eq(settlements.id, settlementId), eq(settlements.status, "pending")))
    .returning();

  if (!updatedSettlement) {
    return badRequest("This settlement request has already been reviewed");
  }

  return ok({ ok: true, settlement: updatedSettlement });
}
