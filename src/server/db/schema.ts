import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const splitModeEnum = pgEnum("split_mode", [
  "equal",
  "percentage",
  "exact",
  "shares",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)]
);

export const trips = pgTable(
  "trips",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    joinCode: varchar("join_code", { length: 12 }).notNull(),
    defaultCurrency: varchar("default_currency", { length: 3 }).default("USD").notNull(),
    description: text("description"),
    simplifyTransfers: boolean("simplify_transfers").default(true).notNull(),
    lockAfterSettlement: boolean("lock_after_settlement").default(false).notNull(),
    createdByUserId: text("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("trips_created_by_idx").on(table.createdByUserId),
    uniqueIndex("trips_join_code_unique").on(table.joinCode),
  ]
);

export const tripMembers = pgTable(
  "trip_members",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .references(() => trips.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 200 }),
    role: memberRoleEnum("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trip_members_trip_email_unique").on(table.tripId, table.email),
    index("trip_members_trip_idx").on(table.tripId),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .references(() => trips.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    category: varchar("category", { length: 40 }).default("other").notNull(),
    notes: text("notes"),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    splitMode: splitModeEnum("split_mode").notNull(),
    createdByMemberId: text("created_by_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByMemberId: text("deleted_by_member_id").references(() => tripMembers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expenses_trip_idx").on(table.tripId),
    index("expenses_currency_idx").on(table.currency),
    index("expenses_category_idx").on(table.category),
  ]
);

export const expensePayers = pgTable(
  "expense_payers",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .references(() => expenses.id, { onDelete: "cascade" })
      .notNull(),
    memberId: text("member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [index("expense_payers_expense_idx").on(table.expenseId)]
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .references(() => expenses.id, { onDelete: "cascade" })
      .notNull(),
    memberId: text("member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    percentageBp: integer("percentage_bp"),
    shares: integer("shares"),
  },
  (table) => [index("expense_splits_expense_idx").on(table.expenseId)]
);

export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .references(() => expenses.id, { onDelete: "cascade" })
      .notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: varchar("file_name", { length: 260 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedByMemberId: text("uploaded_by_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("receipts_expense_idx").on(table.expenseId)]
);

export const settlements = pgTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .references(() => trips.id, { onDelete: "cascade" })
      .notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    fromMemberId: text("from_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    toMemberId: text("to_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdByMemberId: text("created_by_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("settlements_trip_currency_idx").on(table.tripId, table.currency)]
);

export const settlementRequestKeys = pgTable(
  "settlement_request_keys",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .references(() => trips.id, { onDelete: "cascade" })
      .notNull(),
    createdByMemberId: text("created_by_member_id")
      .references(() => tripMembers.id, { onDelete: "restrict" })
      .notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    settlementId: text("settlement_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("settlement_request_keys_trip_idx").on(table.tripId),
    uniqueIndex("settlement_request_keys_trip_member_key_unique").on(
      table.tripId,
      table.createdByMemberId,
      table.idempotencyKey
    ),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  tripMembers: many(tripMembers),
}));

export const tripsRelations = relations(trips, ({ many }) => ({
  members: many(tripMembers),
  expenses: many(expenses),
  settlements: many(settlements),
  settlementRequestKeys: many(settlementRequestKeys),
}));
