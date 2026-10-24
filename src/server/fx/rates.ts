type FxQuote = {
  rate: number;
  quotedAt: string;
  source: "frankfurter" | "open-er-api" | "identity";
};

type CachedQuote = {
  rate: number;
  quotedAtMs: number;
  source: FxQuote["source"];
};

type OpenErApiResponse = {
  result?: string;
  time_last_update_unix?: number;
  rates?: Record<string, number>;
};

type OpenErApiUsdSnapshot = {
  rates: Record<string, number>;
  quotedAtMs: number;
  fetchedAtMs: number;
};

const cache = new Map<string, CachedQuote>();
const CACHE_TTL_MS = 1000 * 60 * 60;
let openErApiUsdSnapshot: OpenErApiUsdSnapshot | null = null;

function pairKey(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}:${toCurrency}`;
}

async function getFrankfurterQuote(from: string, to: string): Promise<FxQuote | null> {
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

  return {
    rate,
    quotedAt: new Date().toISOString(),
    source: "frankfurter",
  };
}

async function getOpenErApiUsdRates() {
  const now = Date.now();

  if (openErApiUsdSnapshot && now - openErApiUsdSnapshot.fetchedAtMs < CACHE_TTL_MS) {
    return openErApiUsdSnapshot;
  }

  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OpenErApiResponse;

  if (data.result !== "success" || !data.rates) {
    return null;
  }

  const quotedAtMs = data.time_last_update_unix ? data.time_last_update_unix * 1000 : now;

  openErApiUsdSnapshot = {
    rates: data.rates,
    quotedAtMs,
    fetchedAtMs: now,
  };

  return openErApiUsdSnapshot;
}

async function getOpenErApiQuote(from: string, to: string): Promise<FxQuote | null> {
  const snapshot = await getOpenErApiUsdRates();

  if (!snapshot) {
    return null;
  }

  const fromRate = from === "USD" ? 1 : snapshot.rates[from];
  const toRate = to === "USD" ? 1 : snapshot.rates[to];

  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || !fromRate || fromRate <= 0 || !toRate || toRate <= 0) {
    return null;
  }

  return {
    rate: toRate / fromRate,
    quotedAt: new Date(snapshot.quotedAtMs).toISOString(),
    source: "open-er-api",
  };
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
      source: cached.source,
    };
  }

  const frankfurterQuote = await getFrankfurterQuote(from, to);

  if (frankfurterQuote) {
    cache.set(key, {
      rate: frankfurterQuote.rate,
      quotedAtMs: Date.parse(frankfurterQuote.quotedAt),
      source: frankfurterQuote.source,
    });

    return frankfurterQuote;
  }

  const openErApiQuote = await getOpenErApiQuote(from, to);

  if (openErApiQuote) {
    cache.set(key, {
      rate: openErApiQuote.rate,
      quotedAtMs: Date.parse(openErApiQuote.quotedAt),
      source: openErApiQuote.source,
    });

    return openErApiQuote;
  }

  return null;
}
