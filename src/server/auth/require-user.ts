import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getSessionFromRequest } from "@/server/auth/session";

export async function requireUser(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

  return user ?? null;
}
