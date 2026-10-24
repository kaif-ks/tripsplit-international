ALTER TABLE "trip_members"
  ADD COLUMN IF NOT EXISTS "preferred_settlement_currency" varchar(3);
