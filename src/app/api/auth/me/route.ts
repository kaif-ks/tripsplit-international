import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { ok, unauthorized } from "@/server/http";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  return ok({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
  });
}
