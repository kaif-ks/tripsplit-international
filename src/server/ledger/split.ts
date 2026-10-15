type SplitMode = "equal" | "percentage" | "exact" | "shares";

type SplitInput = {
  memberId: string;
  amountCents?: number;
  percentageBp?: number;
  shares?: number;
};

function splitByRatio(total: number, ratios: Array<{ memberId: string; ratio: number }>) {
  const totalRatio = ratios.reduce((sum, item) => sum + item.ratio, 0);

  if (totalRatio <= 0) {
    throw new Error("Invalid split ratio");
  }

  const raw = ratios.map((item) => {
    const exact = (total * item.ratio) / totalRatio;

    return {
      memberId: item.memberId,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  const floorSum = raw.reduce((sum, item) => sum + item.floor, 0);
  let remainderUnits = total - floorSum;

  raw.sort((a, b) => b.remainder - a.remainder);

  const allocations = new Map<string, number>();

  for (const item of raw) {
    allocations.set(item.memberId, item.floor);
  }

  for (let index = 0; index < raw.length && remainderUnits > 0; index += 1) {
    const item = raw[index];
    allocations.set(item.memberId, (allocations.get(item.memberId) ?? 0) + 1);
    remainderUnits -= 1;
  }

  return allocations;
}

export function computeSplitAllocations(
  splitMode: SplitMode,
  totalAmountCents: number,
  splits: SplitInput[]
) {
  if (!splits.length) {
    throw new Error("At least one split member is required");
  }

  const sign = totalAmountCents < 0 ? -1 : 1;
  const absoluteTotal = Math.abs(totalAmountCents);

  if (splitMode === "equal") {
    const allocations = splitByRatio(
      absoluteTotal,
      splits.map((item) => ({ memberId: item.memberId, ratio: 1 }))
    );

    for (const [memberId, amount] of allocations.entries()) {
      allocations.set(memberId, amount * sign);
    }

    return allocations;
  }

  if (splitMode === "percentage") {
    const totalBp = splits.reduce((sum, item) => sum + (item.percentageBp ?? 0), 0);

    if (totalBp !== 10000) {
      throw new Error("Percentage split must total 100%");
    }

    const allocations = splitByRatio(
      absoluteTotal,
      splits.map((item) => ({ memberId: item.memberId, ratio: item.percentageBp ?? 0 }))
    );

    for (const [memberId, amount] of allocations.entries()) {
      allocations.set(memberId, amount * sign);
    }

    return allocations;
  }

  if (splitMode === "shares") {
    const allocations = splitByRatio(
      absoluteTotal,
      splits.map((item) => ({ memberId: item.memberId, ratio: item.shares ?? 0 }))
    );

    for (const [memberId, amount] of allocations.entries()) {
      allocations.set(memberId, amount * sign);
    }

    return allocations;
  }

  const map = new Map<string, number>();
  let totalExact = 0;

  for (const item of splits) {
    const amount = item.amountCents ?? 0;
    map.set(item.memberId, amount);
    totalExact += amount;
  }

  if (totalExact !== totalAmountCents) {
    throw new Error("Exact split must match total amount");
  }

  return map;
}
