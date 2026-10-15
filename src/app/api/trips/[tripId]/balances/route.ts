import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";
import { forbidden, ok, unauthorized } from "@/server/http";
import { computeTripSettlementPlan } from "@/server/services/ledger";

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
  const simplifyParam = request.nextUrl.searchParams.get("simplify");
  const simplify = simplifyParam ? simplifyParam === "true" : (trip?.simplifyTransfers ?? true);

  const plan = await computeTripSettlementPlan(tripId, simplify);

  return ok(plan);
}
