import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ise_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = {
  sub: string;
  email: string;
  fullName: string;
};

function getSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());

  return {
    userId: payload.sub as string,
    email: payload.email as string,
    fullName: payload.fullName as string,
  };
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export { SESSION_COOKIE };
