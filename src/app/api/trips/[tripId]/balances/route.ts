import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { db } from "@/server/db";
import { tripMembers, trips } from "@/server/db/schema";
import { getFxQuote } from "@/server/fx/rates";
import { forbidden, ok, unauthorized } from "@/server/http";
import { computeTripSettlementPlan } from "@/server/services/ledger";

type Params = {
  params: Promise<{ tripId: string }>;
};

export async function GET(request: NextRequest, context: Params) {
  const user = await requireUser(request);

  if (!user) {
    return unauthorized();
  }

  const { tripId } = await context.params;
  const [membership] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return forbidden();
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const simplifyParam = request.nextUrl.searchParams.get("simplify");
  const simplify = simplifyParam ? simplifyParam === "true" : (trip?.simplifyTransfers ?? true);

  const plan = await computeTripSettlementPlan(tripId, simplify);

  const preferredCurrencyByMemberId = new Map(
    plan.members.map((member) => [member.memberId, member.preferredSettlementCurrency])
  );

  const uniquePairs = new Set<string>();

  for (const transfer of plan.transfers) {
    const preferredCurrency = preferredCurrencyByMemberId.get(transfer.toMemberId);

    if (!preferredCurrency || preferredCurrency === transfer.currency) {
      continue;
    }

    uniquePairs.add(`${transfer.currency}:${preferredCurrency}`);
  }

  const quotesByPair = new Map<string, Awaited<ReturnType<typeof getFxQuote>>>();

  await Promise.all(
    [...uniquePairs].map(async (pair) => {
      const [fromCurrency, toCurrency] = pair.split(":");
      const quote = await getFxQuote(fromCurrency, toCurrency);
      quotesByPair.set(pair, quote);
    })
  );

  const transferFx = plan.transfers
    .map((transfer) => {
      const preferredCurrency = preferredCurrencyByMemberId.get(transfer.toMemberId);

      if (!preferredCurrency || preferredCurrency === transfer.currency) {
        return null;
      }

      const pair = `${transfer.currency}:${preferredCurrency}`;
      const quote = quotesByPair.get(pair);

      if (!quote) {
        return null;
      }

      return {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        sourceCurrency: transfer.currency,
        sourceAmountCents: transfer.amountCents,
        targetCurrency: preferredCurrency,
        targetAmountCents: Math.round(transfer.amountCents * quote.rate),
        rate: quote.rate,
        quotedAt: quote.quotedAt,
        source: quote.source,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return ok({ ...plan, transferFx });
}
