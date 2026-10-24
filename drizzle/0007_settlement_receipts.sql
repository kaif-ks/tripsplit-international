CREATE TABLE IF NOT EXISTS "settlement_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "settlement_id" text NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" varchar(260) NOT NULL,
  "mime_type" varchar(120) NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_by_member_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlement_receipts_settlement_id_settlements_id_fk'
  ) THEN
    ALTER TABLE "settlement_receipts"
      ADD CONSTRAINT "settlement_receipts_settlement_id_settlements_id_fk"
      FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlement_receipts_uploaded_by_member_id_trip_members_id_fk'
  ) THEN
    ALTER TABLE "settlement_receipts"
      ADD CONSTRAINT "settlement_receipts_uploaded_by_member_id_trip_members_id_fk"
      FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_receipts_settlement_idx" ON "settlement_receipts" USING btree ("settlement_id");
