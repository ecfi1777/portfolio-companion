

## Add Debug Log to Identify FMP Profile Field Names

### What
Add a temporary `console.log` in `fetchProfilesBatched` (line ~148 in `src/lib/fmp-api.ts`) to log the raw API response object for the first symbol. This will reveal the exact field names FMP returns so we can fix the `previousClose` mapping.

### Change

In `src/lib/fmp-api.ts`, inside `fetchProfilesBatched`, right after the line `if (Array.isArray(data) && data.length > 0) {` (line 148), add:

```typescript
// TEMP DEBUG: Log raw API response to identify field names
if (bi === 0) {
  console.log("[FMP DEBUG] Raw /stable/profile response for first symbol:", JSON.stringify(data[0], null, 2));
}
```

Also add the same log inside `lookupSymbol` (line 53, after `const p = data[0];`):

```typescript
console.log("[FMP DEBUG] Raw /stable/profile single response:", JSON.stringify(p, null, 2));
```

### Next Steps
1. After deploying, click Refresh on the Watchlist page
2. Open browser console and look for `[FMP DEBUG]` log entries
3. Identify the correct field name for previous close price
4. Update the mapping and remove the debug logs

### Files Modified
- `src/lib/fmp-api.ts` -- two temporary console.log lines added

