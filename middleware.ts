import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/app"];
const authPages = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const session = request.cookies.get("ise_session")?.value;
  const path = request.nextUrl.pathname;

  if (protectedPrefixes.some((prefix) => path.startsWith(prefix)) && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (authPages.includes(path) && session) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/register"],
};
