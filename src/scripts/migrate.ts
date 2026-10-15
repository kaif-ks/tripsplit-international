import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/server/db";

async function run() {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
