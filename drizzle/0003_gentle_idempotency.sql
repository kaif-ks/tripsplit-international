CREATE TABLE "settlement_request_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "trip_id" text NOT NULL,
  "created_by_member_id" text NOT NULL,
  "idempotency_key" varchar(120) NOT NULL,
  "settlement_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_request_keys"
  ADD CONSTRAINT "settlement_request_keys_trip_id_trips_id_fk"
  FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settlement_request_keys"
  ADD CONSTRAINT "settlement_request_keys_created_by_member_id_trip_members_id_fk"
  FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "settlement_request_keys_trip_idx" ON "settlement_request_keys" USING btree ("trip_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_request_keys_trip_member_key_unique"
  ON "settlement_request_keys" USING btree ("trip_id", "created_by_member_id", "idempotency_key");
