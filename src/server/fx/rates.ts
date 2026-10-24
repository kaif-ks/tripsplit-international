type FxQuote = {
  rate: number;
  quotedAt: string;
  source: "frankfurter" | "identity";
};

type CachedQuote = {
  rate: number;
  quotedAtMs: number;
};

const cache = new Map<string, CachedQuote>();
const CACHE_TTL_MS = 1000 * 60 * 60;

function pairKey(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}:${toCurrency}`;
}

export async function getFxQuote(fromCurrency: string, toCurrency: string): Promise<FxQuote | null> {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();

  if (!from || !to) {
    return null;
  }

  if (from === to) {
    return {
      rate: 1,
      quotedAt: new Date().toISOString(),
      source: "identity",
    };
  }

  const key = pairKey(from, to);
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.quotedAtMs < CACHE_TTL_MS) {
    return {
      rate: cached.rate,
      quotedAt: new Date(cached.quotedAtMs).toISOString(),
      source: "frankfurter",
    };
  }

  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    rates?: Record<string, number>;
  };

  const rate = data.rates?.[to];

  if (!Number.isFinite(rate) || !rate || rate <= 0) {
    return null;
  }

  cache.set(key, {
    rate,
    quotedAtMs: now,
  });

  return {
    rate,
    quotedAt: new Date(now).toISOString(),
    source: "frankfurter",
  };
}
