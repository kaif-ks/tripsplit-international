import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { trips } from "@/server/db/schema";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 8) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }

  return code;
}

export async function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = randomCode(8);

    const [existing] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.joinCode, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Unable to generate unique join code");
}
