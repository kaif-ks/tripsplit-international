import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { badRequest, unauthorized } from "@/server/http";
import { loginSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!user) {
    return unauthorized();
  }

  const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!isValid) {
    return unauthorized();
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
  });

  const response = NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName },
  });

  setSessionCookie(response, token);

  return response;
}
