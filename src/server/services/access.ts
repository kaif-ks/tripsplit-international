import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";

export async function getMembershipByUser(tripId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);

  return membership ?? null;
}

export async function getTripById(tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);

  return trip ?? null;
}
