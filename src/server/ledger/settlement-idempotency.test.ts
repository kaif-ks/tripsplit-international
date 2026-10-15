import assert from "node:assert/strict";
import test from "node:test";
import { simplifyCurrencyBalances } from "@/server/ledger/settlement";

type Entry = {
  memberId: string;
  currency: string;
  amountCents: number;
};

function applySettlements(entries: Entry[], settlements: Array<{ fromMemberId: string; toMemberId: string; currency: string; amountCents: number }>) {
  const balances = new Map<string, number>();

  for (const entry of entries) {
    balances.set(`${entry.memberId}:${entry.currency}`, (balances.get(`${entry.memberId}:${entry.currency}`) ?? 0) + entry.amountCents);
  }

  for (const settlement of settlements) {
    const fromKey = `${settlement.fromMemberId}:${settlement.currency}`;
    const toKey = `${settlement.toMemberId}:${settlement.currency}`;

    balances.set(fromKey, (balances.get(fromKey) ?? 0) + settlement.amountCents);
    balances.set(toKey, (balances.get(toKey) ?? 0) - settlement.amountCents);
  }

  return [...balances.entries()].map(([key, amountCents]) => {
    const [memberId, currency] = key.split(":");
    return { memberId, currency, amountCents };
  });
}

test("recomputing transfers is idempotent after applying plan once", () => {
  const initial: Entry[] = [
    { memberId: "alice", currency: "USD", amountCents: 900 },
    { memberId: "bob", currency: "USD", amountCents: -300 },
    { memberId: "cara", currency: "USD", amountCents: -600 },
  ];

  const firstPlan = simplifyCurrencyBalances(initial);
  assert.equal(firstPlan.length, 2);

  const afterFirstSettlement = applySettlements(initial, firstPlan);
  const secondPlan = simplifyCurrencyBalances(afterFirstSettlement);

  assert.equal(secondPlan.length, 0);
});

test("settlement plans remain separated per currency", () => {
  const initial: Entry[] = [
    { memberId: "alice", currency: "USD", amountCents: 500 },
    { memberId: "bob", currency: "USD", amountCents: -500 },
    { memberId: "alice", currency: "EUR", amountCents: -200 },
    { memberId: "bob", currency: "EUR", amountCents: 200 },
  ];

  const plan = simplifyCurrencyBalances(initial);
  const currencies = [...new Set(plan.map((item) => item.currency))].sort();

  assert.deepEqual(currencies, ["EUR", "USD"]);
  assert.equal(plan.length, 2);
});
