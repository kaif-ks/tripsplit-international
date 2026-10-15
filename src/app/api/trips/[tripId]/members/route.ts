import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers } from "@/server/db/schema";
import { forbidden, ok, unauthorized } from "@/server/http";

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

  const members = await db
    .select({
      id: tripMembers.id,
      email: tripMembers.email,
      displayName: tripMembers.displayName,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
      createdAt: tripMembers.createdAt,
    })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));

  return ok({ members });
}
