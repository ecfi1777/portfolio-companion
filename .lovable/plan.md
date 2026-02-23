

## Enrichment Error Reporting, Rate Limiting, and Re-enrich Button

### 1. Update `enrichWatchlistEntries` in `src/lib/watchlist-enrichment.ts`

**Rate limiting**: Add a 200ms delay between each FMP API call using a simple `await new Promise(r => setTimeout(r, 200))`.

**Error tracking**: Instead of silently catching errors, track success/fail counts during the FMP enrichment loop. Return a result object `{ succeeded: number; failed: number; total: number }` so callers can display appropriate notifications.

Updated signature:
```text
export async function enrichWatchlistEntries(
  userId: string,
  symbols: string[],
  fmpApiKey?: string,
  onComplete?: (result: EnrichmentResult) => void
): Promise<EnrichmentResult>

type EnrichmentResult = { succeeded: number; failed: number; total: number }
```

Key changes:
- Add `await delay(200)` between each FMP call
- Count successes and failures in the FMP loop
- Pass the result to `onComplete` and return it
- Screen cross-referencing remains best-effort (errors logged, not counted in result)

### 2. Update `src/components/BulkWatchlistImportModal.tsx`

No structural changes needed. The `enrichWatchlistEntries` call already fires after import. The `onImportComplete` callback will now receive the enrichment result, but since `BulkWatchlistImportModal` passes `onImportComplete` directly (which is `refetchWatchlist`), the toast notification will be handled at the hook/page level instead.

Update: wrap the enrichment call so it shows a toast after completion if there were failures:
- Import `toast` from `@/hooks/use-toast`
- After `enrichWatchlistEntries` resolves, check the result and show a toast like: "Market data enrichment: X of Y succeeded, Z failed (API limit). Use Re-enrich to retry."

### 3. Update `src/hooks/use-watchlist.ts`

In the `addEntry` function's fire-and-forget enrichment call:
- Handle the enrichment result from the callback
- Show a toast if any symbols failed enrichment

### 4. Add "Re-enrich" button in `src/pages/Watchlist.tsx`

Place a "Re-enrich" button next to the existing "Refresh" button in the watchlist header.

Behavior:
- Only enabled when there are entries with `market_cap === null` and an FMP API key is set
- On click, queries entries where `market_cap` is null, collects their symbols
- Calls `enrichWatchlistEntries` with only those symbols
- Shows a spinner while running
- On completion, shows a toast with success/fail counts
- Calls `refetchWatchlist` to refresh the table

The button will show a count badge (e.g., "Re-enrich (42)") indicating how many entries are missing market cap data.

### Technical Details

**New helper in `watchlist-enrichment.ts`:**
```typescript
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
```

**FMP loop changes:**
```text
let succeeded = 0;
let failed = 0;
for (const sym of symbols) {
  try {
    const profile = await lookupSymbol(sym, fmpApiKey);
    if (profile?.mktCap) {
      await supabase.from("watchlist_entries").update({...}).eq(...);
      succeeded++;
    } else {
      failed++;
    }
  } catch {
    failed++;
  }
  if (sym !== symbols[symbols.length - 1]) await delay(200);
}
```

**Re-enrich button in Watchlist.tsx:**
- New state: `reEnriching: boolean`
- Compute `nullCapCount` from entries where `market_cap` is null
- Button disabled when `nullCapCount === 0` or no API key or already running
- On click: gather null-cap symbols, call `enrichWatchlistEntries`, show result toast, refetch

**Toast notification format:**
- All succeeded: "Market data enrichment complete: X symbols updated."
- Some failed: "Market data enrichment: X of Y succeeded, Z failed (API limit). Use Re-enrich to retry."
- No FMP key: button shows tooltip "Set FMP API key in Settings"

