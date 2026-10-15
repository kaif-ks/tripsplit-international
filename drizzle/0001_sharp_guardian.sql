ALTER TABLE "trips" ADD COLUMN "join_code" varchar(12) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trips_join_code_unique" ON "trips" USING btree ("join_code");--> statement-breakpoint
ALTER TABLE "trip_members" DROP COLUMN "invite_token";--> statement-breakpoint
ALTER TABLE "trip_members" DROP COLUMN "invite_status";--> statement-breakpoint
DROP TYPE "public"."invite_status";