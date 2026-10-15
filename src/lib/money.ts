export function toCents(input: number) {
  return Math.round(input * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

export function formatCurrency(cents: number, currency: string) {
  const amount = fromCents(cents);
  const normalized = currency.trim().toUpperCase();

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const fallback = new Intl.NumberFormat("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

    return `${normalized || "CUR"} ${fallback}`;
  }
}
