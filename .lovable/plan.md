

## Shared Post-Add Enrichment for Watchlist Entries

### Overview
Extract the screen cross-referencing and FMP market cap enrichment logic into a shared utility, then call it from both the Bulk Import and single Add to Watchlist flows. This ensures every new watchlist entry gets screen tags and market data regardless of how it was added.

### New File: `src/lib/watchlist-enrichment.ts`

A shared async function that takes a user ID, list of symbols, an FMP API key (optional), and an onComplete callback:

```
enrichWatchlistEntries(userId, symbols, fmpApiKey?, onComplete?)
```

It performs two tasks:

1. **Screen cross-referencing** -- Fetches the user's watchlist entry IDs for the given symbols, then queries all `screen_runs` with `auto_tag_id`. For each match between a symbol and a screen run's `all_symbols`, upserts a `watchlist_entry_tags` record (with `ignoreDuplicates`).

2. **FMP enrichment** -- For each symbol, calls `lookupSymbol` to get market cap, sector, and industry. Updates the `watchlist_entries` row with those values and the computed `market_cap_category`.

Both tasks are best-effort (errors are caught and logged, never block the caller).

### Changes to `src/components/BulkWatchlistImportModal.tsx`

- Remove the inline screen cross-referencing code (lines 170-212) and the inline FMP enrichment code (lines 224-249)
- Remove imports for `lookupSymbol` and `getMarketCapCategory`
- Import and call `enrichWatchlistEntries` after the upsert succeeds, passing the imported symbols
- The enrichment runs asynchronously after the modal closes (existing behavior preserved)

### Changes to `src/hooks/use-watchlist.ts`

- Import `enrichWatchlistEntries` from the new utility
- After a successful single `addEntry` insert (line 183, after the toast), fire off the enrichment asynchronously for the single symbol
- Since the Add to Watchlist modal already fetches FMP data and passes it in `data`, the FMP enrichment will be a no-op if market_cap is already set. But screen cross-referencing will now run, which it currently does not.
- Call `fetchAll()` again after enrichment completes to refresh screen tags

### Technical Details

**Utility function signature:**
```typescript
export async function enrichWatchlistEntries(
  userId: string,
  symbols: string[],
  fmpApiKey?: string,
  onComplete?: () => void
): Promise<void>
```

**Screen tag logic** (moved from BulkWatchlistImportModal):
- Query `watchlist_entries` for the given symbols to get entry IDs
- Query `screen_runs` where `auto_tag_id` is not null
- Build tag assignments for matching symbols
- Upsert into `watchlist_entry_tags` with `ignoreDuplicates`

**FMP enrichment logic** (moved from BulkWatchlistImportModal):
- For each symbol, call `lookupSymbol`
- If profile has market cap data, update the entry with `market_cap`, `market_cap_category`, `sector`, `industry`
- For single-add flow, this will fill in data only if the Add modal did not already provide it (the update is idempotent)

**Integration in single-add flow:**
- After `addEntry` returns an ID successfully, call `enrichWatchlistEntries` in fire-and-forget mode
- This adds screen tag cross-referencing that was previously missing from single adds
- The FMP data is typically already set by the modal, so the update is harmless

**Integration in bulk import:**
- Replace ~80 lines of inline enrichment with a single function call
- Behavior is identical: modal closes immediately, enrichment runs in background, `onImportComplete` called when done

