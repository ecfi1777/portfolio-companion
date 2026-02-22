// FMP (Financial Modeling Prep) API helper with in-memory caching

const FMP_BASE = "https://financialmodelingprep.com/stable";

// Cache entries with TTL
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const priceCache = new Map<string, CacheEntry<QuoteData>>();
const profileCache = new Map<string, CacheEntry<ProfileData>>();

const PRICE_TTL = 60 * 1000; // 60 seconds
const PROFILE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface ProfileData {
  symbol: string;
  companyName: string;
  price: number;
  industry: string;
  sector: string;
  mktCap: number;
}

export interface QuoteData {
  symbol: string;
  price: number;
  previousClose: number;
  changesPercentage: number;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

export async function lookupSymbol(symbol: string, apiKey: string): Promise<ProfileData | null> {
  if (!apiKey || !symbol) return null;

  const cached = getCached(profileCache, symbol.toUpperCase());
  if (cached) return cached;

  try {
    const res = await fetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const p = data[0];
    const result: ProfileData = {
      symbol: p.symbol,
      companyName: p.companyName ?? "",
      price: p.price ?? 0,
      industry: p.industry ?? "",
      sector: p.sector ?? "",
      mktCap: p.marketCap ?? p.mktCap ?? 0,
    };

    profileCache.set(symbol.toUpperCase(), { data: result, expiry: Date.now() + PROFILE_TTL });
    return result;
  } catch {
    return null;
  }
}

export async function fetchQuotes(symbols: string[], apiKey: string): Promise<QuoteData[]> {
  if (!apiKey || symbols.length === 0) return [];

  // Check cache, collect misses
  const results: QuoteData[] = [];
  const misses: string[] = [];

  for (const sym of symbols) {
    const cached = getCached(priceCache, sym.toUpperCase());
    if (cached) {
      results.push(cached);
    } else {
      misses.push(sym.toUpperCase());
    }
  }

  if (misses.length === 0) return results;

  // Batch fetch in groups of 50 (FMP limit)
  const BATCH_SIZE = 50;
  for (let i = 0; i < misses.length; i += BATCH_SIZE) {
    const batch = misses.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${FMP_BASE}/batch-quote-short?symbols=${batch.join(",")}&apikey=${apiKey}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      for (const q of data) {
        const quote: QuoteData = {
          symbol: q.symbol,
          price: q.price ?? 0,
          previousClose: q.previousClose ?? 0,
          changesPercentage: q.changesPercentage ?? q.changePercentage ?? 0,
        };
        priceCache.set(q.symbol, { data: quote, expiry: Date.now() + PRICE_TTL });
        results.push(quote);
      }
    } catch {
      // silently continue
    }
  }

  return results;
}
