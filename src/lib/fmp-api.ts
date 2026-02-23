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
  previousClose: number;
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
      previousClose: p.previousClose ?? p.previousClosePrice ?? (p.price != null && p.change != null ? p.price - p.change : 0),
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

// Fetch profiles in batches using /stable/profile (works on Basic plan)
export async function fetchProfilesBatched(
  symbols: string[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void
): Promise<ProfileData[]> {
  if (!apiKey || symbols.length === 0) return [];

  const total = symbols.length;
  const results: ProfileData[] = [];
  let useBatchMode = true;
  const BATCH_SIZE = 20;
  const batches: string[][] = [];

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];

    if (useBatchMode) {
      try {
        const res = await fetch(
          `${FMP_BASE}/profile?symbol=${batch.map(encodeURIComponent).join(",")}&apikey=${apiKey}`
        );
        if (!res.ok) {
          // Batch mode not supported, switch to single
          useBatchMode = false;
        } else {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            for (const p of data) {
              const profile: ProfileData = {
                symbol: p.symbol,
                companyName: p.companyName ?? "",
                price: p.price ?? 0,
                previousClose: p.previousClose ?? p.previousClosePrice ?? (p.price != null && p.change != null ? p.price - p.change : 0),
                industry: p.industry ?? "",
                sector: p.sector ?? "",
                mktCap: p.marketCap ?? p.mktCap ?? 0,
              };
              profileCache.set(profile.symbol.toUpperCase(), {
                data: profile,
                expiry: Date.now() + PROFILE_TTL,
              });
              results.push(profile);
            }
            onProgress?.(Math.min(results.length, total), total);
            continue;
          } else if (bi === 0) {
            // First batch returned empty — batch mode may not work
            useBatchMode = false;
          }
        }
      } catch {
        useBatchMode = false;
      }
    }

    // Single-symbol fallback for this batch
    for (const sym of batch) {
      const cached = getCached(profileCache, sym.toUpperCase());
      if (cached) {
        results.push(cached);
        onProgress?.(Math.min(results.length, total), total);
        continue;
      }
      const profile = await lookupSymbol(sym, apiKey);
      if (profile) {
        results.push(profile);
      }
      onProgress?.(Math.min(results.length + (profile ? 0 : 1), total), total);
      // 200ms delay between single calls
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
