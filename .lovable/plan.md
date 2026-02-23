

## Replace batch-quote-short with /stable/profile for Price Refresh

### Problem
The `refreshPrices` function uses FMP's `/stable/batch-quote-short` endpoint, which returns 402 (Restricted Endpoint) on the Basic plan. This means `current_price` and `previous_close` never update, so Day % and Since Add % always show dashes.

### Solution

#### 1. New function in `src/lib/fmp-api.ts`: `fetchProfilesBatched`

Add a new exported function that fetches price and profile data using the `/stable/profile` endpoint (which works on the Basic plan):

- Accepts a list of symbols, an API key, and an optional `onProgress` callback
- First attempts comma-separated batches of 20 symbols (e.g., `/stable/profile?symbol=AAPL,GOOGL,...&apikey=KEY`)
- If the first batch returns empty/error, falls back to one-at-a-time mode with 200ms delays
- Calls `onProgress(completed, total)` after each successful/failed fetch
- Returns an array of `ProfileData` results (reuses existing `ProfileData` interface, adding a `previousClose` field)
- Populates the profile cache as a side benefit

Update the `ProfileData` interface to include `previousClose`:
```
export interface ProfileData {
  symbol: string;
  companyName: string;
  price: number;
  previousClose: number;  // NEW
  industry: string;
  sector: string;
  mktCap: number;
}
```

Also update `lookupSymbol` to map `previousClose` from the API response.

#### 2. Rewrite `refreshPrices` in `src/hooks/use-watchlist.ts`

Replace the current implementation that calls `fetchQuotes` with:

- Accept an optional `onProgress` callback parameter: `refreshPrices(apiKey: string, onProgress?: (done: number, total: number) => void)`
- Call `fetchProfilesBatched(symbols, apiKey, onProgress)` instead of `fetchQuotes`
- Map profile results to DB updates: `current_price`, `previous_close`, `last_price_update`, plus `market_cap`, `market_cap_category`, `company_name`, `sector`, `industry` (re-enrichment as a side benefit)
- Return an `EnrichmentResult` object (`{ succeeded, failed, total }`) instead of just a count
- Update local state for immediate UI feedback

#### 3. Progress indicator in `src/pages/Watchlist.tsx`

- Add state: `refreshProgress: { done: number; total: number } | null`
- Pass a progress callback to `refreshPrices` that updates this state
- Display progress on or near the Refresh button: when refreshing, show "Refreshing 45/250..." text instead of just a spinner
- Clear progress state when refresh completes
- Show a toast on completion with success/fail counts (same pattern as Re-enrich)

#### 4. Auto-refresh on page load

No changes to trigger logic (lines 349-355). The `refreshPrices` call already happens there. Since the function signature gains an optional parameter, existing call sites still work. The progress indicator will show during auto-refresh too.

### What does NOT change

- Day %, Since Add %, and all display column calculations remain untouched
- Refresh button placement and general UI unchanged
- Re-enrich button remains separate and unchanged
- The `fetchQuotes` function stays in `fmp-api.ts` (not removed, just no longer called from `refreshPrices`)

### Technical Details

**`fetchProfilesBatched` logic:**
```text
1. Split symbols into batches of 20
2. For first batch, try comma-separated: /stable/profile?symbol=SYM1,SYM2,...&apikey=KEY
3. If response is OK and returns array with data -> batch mode works, continue with remaining batches
4. If response fails or returns empty -> switch to single-symbol mode for all remaining symbols
5. In single-symbol mode: call lookupSymbol() one at a time with 200ms delay
6. Call onProgress after each batch or single-symbol call
```

**DB update per symbol in refreshPrices:**
```text
current_price      <- profile.price
previous_close     <- profile.previousClose
market_cap         <- profile.mktCap
market_cap_category <- getMarketCapCategory(profile.mktCap)
company_name       <- profile.companyName (if truthy)
sector             <- profile.sector (if truthy)
industry           <- profile.industry (if truthy)
last_price_update  <- now()
```

**Files modified:**
- `src/lib/fmp-api.ts` -- add `previousClose` to `ProfileData`, add `fetchProfilesBatched`, update `lookupSymbol`
- `src/hooks/use-watchlist.ts` -- rewrite `refreshPrices` to use profiles, add progress callback, return `EnrichmentResult`
- `src/pages/Watchlist.tsx` -- add progress state, pass callback, display progress text, show result toast

