import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { COMMON_CURRENCIES } from "@/lib/finance-options";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers } from "@/server/db/schema";
import { badRequest, forbidden, ok, unauthorized } from "@/server/http";

type Params = {
  params: Promise<{ tripId: string }>;
};

const updatePreferredCurrencySchema = z.object({
  preferredSettlementCurrency: z.enum(COMMON_CURRENCIES).nullable(),
});

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

  const members = await db
    .select({
      id: tripMembers.id,
      email: tripMembers.email,
      displayName: tripMembers.displayName,
      preferredSettlementCurrency: tripMembers.preferredSettlementCurrency,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
      createdAt: tripMembers.createdAt,
    })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));

  return ok({ members });
}

export async function PATCH(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;
  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const body = await request.json();
  const parsed = updatePreferredCurrencySchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  await db
    .update(tripMembers)
    .set({ preferredSettlementCurrency: parsed.data.preferredSettlementCurrency })
    .where(eq(tripMembers.id, membership.id));

  return ok({ preferredSettlementCurrency: parsed.data.preferredSettlementCurrency });
}
