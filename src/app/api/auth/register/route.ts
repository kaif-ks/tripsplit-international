import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { badRequest } from "@/server/http";
import { registerSchema } from "@/server/validators";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { email, fullName, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    return badRequest("Email already registered");
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id,
    email: normalizedEmail,
    fullName,
    passwordHash,
  });

  const token = await createSessionToken({
    sub: id,
    email: normalizedEmail,
    fullName,
  });

  const response = NextResponse.json(
    { user: { id, email: normalizedEmail, fullName } },
    { status: 201 }
  );

  setSessionCookie(response, token);

  return response;
}
