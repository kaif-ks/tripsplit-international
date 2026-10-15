ALTER TABLE "expenses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deleted_by_member_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_member_id_trip_members_id_fk" FOREIGN KEY ("deleted_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE set null ON UPDATE no action;