import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { expenses, tripMembers } from "@/server/db/schema";
import { forbidden, unauthorized } from "@/server/http";

type Params = {
  params: Promise<{ tripId: string }>;
};

function normalizeTimeZone(value: string | null) {
  if (!value) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function buildTimeZoneFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateTimeInTimeZone(date: Date, formatter: Intl.DateTimeFormat, timeZone: string) {
  return `${formatter.format(date)} ${timeZone}`;
}

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;
  const [membership] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const timeZone = normalizeTimeZone(request.nextUrl.searchParams.get("tz"));
  const timeZoneFormatter = buildTimeZoneFormatter(timeZone);

  const rows = await db
    .select({
      id: expenses.id,
      title: expenses.title,
      currency: expenses.currency,
      amountCents: expenses.amountCents,
      splitMode: expenses.splitMode,
      occurredAt: expenses.occurredAt,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));

  const csv = [
    [
      "expense_id",
      "title",
      "currency",
      "amount",
      "split_mode",
      "occurred_at_iso",
      "occurred_at_local",
      "created_at_iso",
      "created_at_local",
      "local_timezone",
    ].join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.title.replaceAll('"', '""'),
        row.currency,
        (row.amountCents / 100).toFixed(2),
        row.splitMode,
        row.occurredAt.toISOString(),
        formatDateTimeInTimeZone(row.occurredAt, timeZoneFormatter, timeZone),
        row.createdAt.toISOString(),
        formatDateTimeInTimeZone(row.createdAt, timeZoneFormatter, timeZone),
        timeZone,
      ]
        .map((value) => `"${value}"`)
        .join(",")
    ),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trip-${tripId}-expenses.csv"`,
    },
  });
}
