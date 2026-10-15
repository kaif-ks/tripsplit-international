import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";
import { badRequest, forbidden, notFound, ok, unauthorized } from "@/server/http";
import { tripSettingsSchema } from "@/server/validators";

type Params = {
  params: Promise<{ tripId: string }>;
};

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

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);

  if (!trip) {
    return notFound();
  }

  return ok({ trip, membership });
}

export async function PATCH(request: NextRequest, context: Params) {
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

  if (!(membership.role === "owner" || membership.role === "admin")) {
    return forbidden("Only owner/admin can change settings");
  }

  const body = await request.json();
  const parsed = tripSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  await db
    .update(trips)
    .set({
      defaultCurrency: parsed.data.defaultCurrency,
      simplifyTransfers: parsed.data.simplifyTransfers,
      lockAfterSettlement: parsed.data.lockAfterSettlement,
    })
    .where(eq(trips.id, tripId));

  return ok({ ok: true });
}
