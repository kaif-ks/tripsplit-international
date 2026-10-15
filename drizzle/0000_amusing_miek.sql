CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('equal', 'percentage', 'exact', 'shares');--> statement-breakpoint
CREATE TABLE "expense_payers" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"member_id" text NOT NULL,
	"amount_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_splits" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"member_id" text NOT NULL,
	"amount_cents" bigint,
	"percentage_bp" integer,
	"shares" integer
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"title" varchar(220) NOT NULL,
	"notes" text,
	"currency" varchar(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"split_mode" "split_mode" NOT NULL,
	"created_by_member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" varchar(260) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"from_member_id" text NOT NULL,
	"to_member_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_by_member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"user_id" text,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(200),
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"invite_token" text,
	"invite_status" "invite_status" DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"simplify_transfers" boolean DEFAULT true NOT NULL,
	"lock_after_settlement" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_member_id_trip_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_member_id_trip_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_member_id_trip_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_uploaded_by_member_id_trip_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_id_trip_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_id_trip_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_member_id_trip_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payers_expense_idx" ON "expense_payers" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_splits_expense_idx" ON "expense_splits" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_currency_idx" ON "expenses" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "receipts_expense_idx" ON "receipts" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "settlements_trip_currency_idx" ON "settlements" USING btree ("trip_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_members_trip_email_unique" ON "trip_members" USING btree ("trip_id","email");--> statement-breakpoint
CREATE INDEX "trip_members_trip_idx" ON "trip_members" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trips_created_by_idx" ON "trips" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");