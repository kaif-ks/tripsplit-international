DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'settlement_status'
  ) THEN
    CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'approved', 'rejected');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD COLUMN IF NOT EXISTS "status" "settlement_status" DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD COLUMN IF NOT EXISTS "reviewed_by_member_id" text;
--> statement-breakpoint
ALTER TABLE "settlements"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlements_reviewed_by_member_id_trip_members_id_fk'
  ) THEN
    ALTER TABLE "settlements"
      ADD CONSTRAINT "settlements_reviewed_by_member_id_trip_members_id_fk"
      FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_trip_status_idx" ON "settlements" USING btree ("trip_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_to_member_status_idx" ON "settlements" USING btree ("to_member_id", "status");
