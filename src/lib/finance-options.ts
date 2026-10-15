export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "LKR",
  "JPY",
  "CAD",
  "AUD",
  "SGD",
  "AED",
  "CHF",
] as const;

export const EXPENSE_CATEGORIES = [
  "accommodation",
  "food",
  "transport",
  "activities",
  "shopping",
  "utilities",
  "health",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
