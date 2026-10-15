type LedgerEntry = {
  memberId: string;
  currency: string;
  amountCents: number;
};

type Transfer = {
  fromMemberId: string;
  toMemberId: string;
  currency: string;
  amountCents: number;
};

export function simplifyCurrencyBalances(entries: LedgerEntry[]) {
  const byCurrency = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    if (!byCurrency.has(entry.currency)) {
      byCurrency.set(entry.currency, new Map());
    }

    const balanceMap = byCurrency.get(entry.currency)!;
    balanceMap.set(entry.memberId, (balanceMap.get(entry.memberId) ?? 0) + entry.amountCents);
  }

  const transfers: Transfer[] = [];

  for (const [currency, balanceMap] of byCurrency.entries()) {
    const debtors: Array<{ memberId: string; amount: number }> = [];
    const creditors: Array<{ memberId: string; amount: number }> = [];

    for (const [memberId, balance] of balanceMap.entries()) {
      if (balance < 0) {
        debtors.push({ memberId, amount: Math.abs(balance) });
      } else if (balance > 0) {
        creditors.push({ memberId, amount: balance });
      }
    }

    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const settledAmount = Math.min(debtor.amount, creditor.amount);

      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        currency,
        amountCents: settledAmount,
      });

      debtor.amount -= settledAmount;
      creditor.amount -= settledAmount;

      if (debtor.amount === 0) {
        debtorIndex += 1;
      }

      if (creditor.amount === 0) {
        creditorIndex += 1;
      }
    }
  }

  return transfers;
}
