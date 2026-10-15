import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";
import { badRequest, created, forbidden, ok, unauthorized } from "@/server/http";
import { joinTripByCodeSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = joinTripByCodeSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const [trip] = await db
    .select({ id: trips.id, name: trips.name })
    .from(trips)
    .where(eq(trips.joinCode, parsed.data.joinCode))
    .limit(1);

  if (!trip) {
    return badRequest("Invalid trip code");
  }

  const [existingMemberByUser] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, trip.id), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (existingMemberByUser) {
    return ok({ tripId: trip.id, alreadyJoined: true });
  }

  const [existingMemberByEmail] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, trip.id), eq(tripMembers.email, user.email)))
    .limit(1);

  if (existingMemberByEmail) {
    return forbidden("This email already exists in the trip with another account");
  }

  const memberId = nanoid();

  await db.insert(tripMembers).values({
    id: memberId,
    tripId: trip.id,
    userId: user.id,
    email: user.email,
    displayName: user.fullName,
    role: "member",
    joinedAt: new Date(),
  });

  return created({ tripId: trip.id, memberId, tripName: trip.name });
}
