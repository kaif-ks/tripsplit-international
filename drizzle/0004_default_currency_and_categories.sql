ALTER TABLE "trips"
  ADD COLUMN "default_currency" varchar(3) DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses"
  ADD COLUMN "category" varchar(40) DEFAULT 'other' NOT NULL;
--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");
