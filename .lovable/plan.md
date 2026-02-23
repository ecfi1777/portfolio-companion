

## Fix: Derive `previousClose` from `price - change`

### Problem
The FMP `/stable/profile` endpoint does NOT return a `previousClose` field. The raw API response contains `price`, `change`, and `changePercentage` instead. The current code maps `p.previousClose` which is always `undefined`, falling back to `0`. This is why "Day %" always shows dashes -- you can't calculate a day change from a previous close of 0.

### Solution
Calculate `previousClose` as `price - change` from the API response. For example:
- UA: price=7.465, change=-0.415 => previousClose = 7.88
- ORLA: price=19.04, change=0.35 => previousClose = 18.69

### Changes in `src/lib/fmp-api.ts`

**1. Update `lookupSymbol` (line 59):**
Change:
```typescript
previousClose: p.previousClose ?? p.previousClosePrice ?? 0,
```
To:
```typescript
previousClose: p.previousClose ?? p.previousClosePrice ?? (p.price != null && p.change != null ? p.price - p.change : 0),
```

**2. Update `fetchProfilesBatched` mapping (line 159):**
Same change -- derive from `price - change` when `previousClose` is not present.

**3. Remove the two temporary debug `console.log` statements** (lines 54 and 150-153).

### Files modified
- `src/lib/fmp-api.ts` -- fix previousClose derivation in two places, remove debug logs
