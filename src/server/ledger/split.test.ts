import assert from "node:assert/strict";
import test from "node:test";
import { computeSplitAllocations } from "@/server/ledger/split";

test("equal split distributes remainder and preserves total", () => {
  const allocations = computeSplitAllocations("equal", 100, [
    { memberId: "m1" },
    { memberId: "m2" },
    { memberId: "m3" },
  ]);

  assert.equal((allocations.get("m1") ?? 0) + (allocations.get("m2") ?? 0) + (allocations.get("m3") ?? 0), 100);
  assert.deepEqual(
    [...allocations.values()].sort((a, b) => b - a),
    [34, 33, 33]
  );
});

test("negative totals keep sign across percentage split", () => {
  const allocations = computeSplitAllocations("percentage", -1000, [
    { memberId: "m1", percentageBp: 2500 },
    { memberId: "m2", percentageBp: 7500 },
  ]);

  assert.equal(allocations.get("m1"), -250);
  assert.equal(allocations.get("m2"), -750);
});

test("percentage split requires exactly 100%", () => {
  assert.throws(
    () =>
      computeSplitAllocations("percentage", 1000, [
        { memberId: "m1", percentageBp: 5000 },
        { memberId: "m2", percentageBp: 4000 },
      ]),
    /must total 100%/
  );
});

test("exact split must match total", () => {
  assert.throws(
    () =>
      computeSplitAllocations("exact", 1000, [
        { memberId: "m1", amountCents: 300 },
        { memberId: "m2", amountCents: 300 },
      ]),
    /must match total amount/
  );
});
