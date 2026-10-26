import { z } from "zod";
import { COMMON_CURRENCIES, EXPENSE_CATEGORIES } from "@/lib/finance-options";

export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const receiptMimeTypeSchema = z.enum(RECEIPT_MIME_TYPES);

export const registerSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(200),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const createTripSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(2000).optional(),
  defaultCurrency: z.enum(COMMON_CURRENCIES).default("USD"),
  simplifyTransfers: z.boolean().default(true),
  lockAfterSettlement: z.boolean().default(false),
});

export const joinTripByCodeSchema = z.object({
  joinCode: z
    .string()
    .min(6)
    .max(12)
    .transform((value) => value.trim().toUpperCase()),
});

export const createExpenseSchema = z.object({
  tripId: z.string().min(8),
  title: z.string().min(1).max(220),
  category: z.enum(EXPENSE_CATEGORIES),
  notes: z.string().max(5000).optional(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  amountCents: z.number().int(),
  occurredAt: z.string().datetime(),
  splitMode: z.enum(["equal", "percentage", "exact", "shares"]),
  payers: z
    .array(
      z.object({
        memberId: z.string(),
        amountCents: z.number().int(),
      })
    )
    .min(1),
  splits: z
    .array(
      z.object({
        memberId: z.string(),
        amountCents: z.number().int().optional(),
        percentageBp: z.number().int().optional(),
        shares: z.number().int().optional(),
      })
    )
    .min(1),
});

export const createSettlementSchema = z.object({
  tripId: z.string().min(8),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  fromMemberId: z.string(),
  toMemberId: z.string(),
  amountCents: z.number().int().positive(),
  paidAt: z.string().datetime(),
  notes: z.string().max(1500).optional(),
});

export const settlementApprovalSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const tripSettingsSchema = z.object({
  defaultCurrency: z.enum(COMMON_CURRENCIES),
  simplifyTransfers: z.boolean(),
  lockAfterSettlement: z.boolean(),
});

export const receiptPresignSchema = z.object({
  tripId: z.string().min(8),
  expenseId: z.string().min(8),
  fileName: z.string().min(1).max(260),
  mimeType: receiptMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});

export const receiptCompleteSchema = z.object({
  tripId: z.string().min(8),
  expenseId: z.string().min(8),
  storageKey: z.string().min(5),
  fileName: z.string().min(1).max(260),
  mimeType: receiptMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});

export const settlementReceiptPresignSchema = z.object({
  tripId: z.string().min(8),
  settlementId: z.string().min(8),
  fileName: z.string().min(1).max(260),
  mimeType: receiptMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});

export const settlementReceiptCompleteSchema = z.object({
  tripId: z.string().min(8),
  settlementId: z.string().min(8),
  storageKey: z.string().min(5),
  fileName: z.string().min(1).max(260),
  mimeType: receiptMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});
