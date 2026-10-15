import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";
import { badRequest, created, ok, unauthorized } from "@/server/http";
import { generateUniqueJoinCode } from "@/server/trips/join-code";
import { createTripSchema } from "@/server/validators";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const memberships = await db
    .select({
      tripId: tripMembers.tripId,
      memberId: tripMembers.id,
      role: tripMembers.role,
      name: trips.name,
      joinCode: trips.joinCode,
      description: trips.description,
      defaultCurrency: trips.defaultCurrency,
      simplifyTransfers: trips.simplifyTransfers,
      lockAfterSettlement: trips.lockAfterSettlement,
      createdAt: trips.createdAt,
    })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId))
    .where(eq(tripMembers.userId, user.id))
    .orderBy(desc(trips.createdAt));

  return ok({ trips: memberships });
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const body = await request.json();
  const parsed = createTripSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const tripId = nanoid();
  const memberId = nanoid();
  const joinCode = await generateUniqueJoinCode();

  await db.transaction(async (tx) => {
    await tx.insert(trips).values({
      id: tripId,
      name: parsed.data.name,
      joinCode,
      description: parsed.data.description ?? null,
      defaultCurrency: parsed.data.defaultCurrency,
      simplifyTransfers: parsed.data.simplifyTransfers,
      lockAfterSettlement: parsed.data.lockAfterSettlement,
      createdByUserId: user.id,
    });

    await tx.insert(tripMembers).values({
      id: memberId,
      tripId,
      userId: user.id,
      email: user.email,
      displayName: user.fullName,
      role: "owner",
      joinedAt: new Date(),
    });
  });

  return created({ tripId, memberId, joinCode });
}
