

# FMP Price API Integration

Adds real-time price data to the watchlist and portfolio using the Financial Modeling Prep API, with user-managed API key storage, auto-lookup on watchlist add, batch price refresh, and staleness indicators.

---

## Step 1: Database Migration

Add `last_price_update` timestamp column to both `watchlist_entries` and `positions`:

```sql
ALTER TABLE public.watchlist_entries
  ADD COLUMN last_price_update timestamptz;

ALTER TABLE public.positions
  ADD COLUMN last_price_update timestamptz;
```

No default needed -- existing rows stay null (showing "never refreshed").

---

## Step 2: Extend Portfolio Settings for API Key

Update the `PortfolioSettings` type in `src/hooks/use-portfolio-settings.ts` to include an optional `fmp_api_key` string. The key is stored in the existing `portfolio_settings` JSONB column alongside allocation targets. No migration needed -- JSONB is flexible.

Update the Settings page (`src/pages/Settings.tsx`) to add a "Price Data API" card with:
- A password-type input (masked by default) for the FMP API key
- An eye toggle button to reveal/hide the key
- The key saves alongside all other settings when the user clicks Save

---

## Step 3: Create FMP API Helper (`src/lib/fmp-api.ts`)

A utility module that handles all FMP API interactions with built-in caching:

- `lookupSymbol(symbol, apiKey)` -- calls `/api/v3/profile/{symbol}` and returns company name, industry, sector, market cap, and current price
- `fetchQuotes(symbols[], apiKey)` -- calls `/api/v3/quote/{sym1,sym2,...}` for batch price fetching (price, previous close, day change)
- **Price cache**: In-memory Map with 60-second TTL so rapid page refreshes or re-renders don't make redundant calls
- **Company info cache**: Separate Map with 24-hour TTL for industry/sector/market cap data
- Both caches are module-level (persist for the session, cleared on page reload)

All calls are made client-side with the API key as a query parameter. If FMP returns an error or the key is missing, functions return null gracefully so the UI falls back to manual/existing data.

---

## Step 4: Watchlist -- Auto-Lookup on Add (`src/components/AddToWatchlistModal.tsx`)

When the user finishes typing a symbol (on blur of the symbol field), if an FMP API key is configured:

1. Call `lookupSymbol(symbol, apiKey)`
2. Show a compact preview card below the symbol field with the fetched data (company name, price, sector, market cap)
3. Auto-populate the company name and price fields with fetched values
4. The user can still manually override any auto-filled field
5. If the lookup fails or no API key is configured, the form works exactly as it does today (manual entry)

The modal will accept the API key as a prop, passed from the Watchlist page which reads it from `usePortfolioSettings`.

Update `addEntry` in `use-watchlist.ts` to also accept and persist `industry`, `sector`, and `market_cap` fields so auto-looked-up data gets saved.

---

## Step 5: Watchlist -- Price Refresh on Page Load (`src/pages/Watchlist.tsx`)

When the watchlist page loads and an FMP API key is configured:

1. Collect all symbols from watchlist entries
2. Call `fetchQuotes(symbols, apiKey)` in batches (FMP supports comma-separated symbols)
3. Update each entry's `current_price`, `previous_close`, and `last_price_update` in the database
4. Update local state so the UI reflects live prices immediately
5. The 60-second cache in the FMP helper prevents redundant calls on rapid navigation

This runs as a `useEffect` after initial data loads. A small loading indicator shows during the refresh. If no API key is set, this step is skipped entirely.

---

## Step 6: Portfolio -- Manual Price Refresh (`src/pages/Portfolio.tsx`)

Add a "Refresh Prices" button next to the "Update Portfolio" button in the portfolio header:

1. On click, collect all stock position symbols (exclude CASH)
2. Call `fetchQuotes(symbols, apiKey)` 
3. Update each position's `current_price`, recalculate `current_value` (shares x new price), and set `last_price_update`
4. Persist updates to the database and refresh local state
5. Show a toast on completion: "Prices updated for X positions"
6. Button shows a spinner while fetching; disabled if no API key is configured (with a tooltip: "Set your FMP API key in Settings")

---

## Step 7: Staleness Indicator

Add a small timestamp display below the summary cards on both the Watchlist and Portfolio pages:

- Format: "Prices as of 2:34 PM" (using the most recent `last_price_update` across all entries/positions)
- If the most recent update is more than 24 hours old, show with an amber warning icon and "Prices may be stale" text
- If no prices have ever been refreshed (`last_price_update` is null for all), show "Prices not yet refreshed" with a subtle prompt to configure the API key (if missing)

---

## Files Affected

1. **Database migration** -- adds `last_price_update` to `watchlist_entries` and `positions`
2. `src/hooks/use-portfolio-settings.ts` -- extend `PortfolioSettings` type with optional `fmp_api_key`
3. `src/pages/Settings.tsx` -- add API key input card
4. `src/lib/fmp-api.ts` -- new file: FMP API helper with caching
5. `src/components/AddToWatchlistModal.tsx` -- auto-lookup on symbol blur with preview card
6. `src/hooks/use-watchlist.ts` -- extend `addEntry` to accept industry/sector/market_cap; add batch price refresh function
7. `src/pages/Watchlist.tsx` -- trigger price refresh on load, show staleness indicator
8. `src/pages/Portfolio.tsx` -- add "Refresh Prices" button, show staleness indicator

---

## Technical Notes

- FMP API calls are made directly from the browser. The API key is stored in the user's RLS-protected settings row, so it is not exposed to other users. However, it will be visible in browser network requests -- this is standard for client-side API keys and matches the user's requested approach.
- The batch quote endpoint supports multiple symbols in a single call (`/v3/quote/AAPL,MSFT,GOOG`), minimizing API usage.
- Caching is in-memory only (module-level Maps) -- simple, no persistence needed. Cleared naturally on page reload.
- Portfolio price refresh is intentionally manual (button click) per the requirements. The CSV import remains the primary data source for portfolio positions.

