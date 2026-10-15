import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

const client = postgres(databaseUrl, {
  prepare: false,
  ssl: "require",
});

export const db = drizzle(client);
