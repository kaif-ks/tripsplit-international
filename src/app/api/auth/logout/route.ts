import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
