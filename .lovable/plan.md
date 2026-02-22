

## Cleanup: Type Safety and Error Handling

This is a code quality pass that removes all `as any` casts from application code, fixes a dynamic import anti-pattern, and adds error handling to the settings fetch. No functionality changes.

---

### 1. Remove `as any` casts

**6 files affected, ~15 cast sites total:**

**`src/pages/Portfolio.tsx`** (6 casts)
- Line 97: Remove `& { source?: string | null; first_seen_at?: string | null }` from the `PositionDetailPanel` prop type -- `Position` (which is `Tables<"positions">`) already includes `source`, `first_seen_at`, and `last_price_update`.
- Line 104: `(position as any).source` becomes `position.source`
- Line 110: `.update({ [field]: value || null } as any)` -- use a properly typed `TablesUpdate<"positions">` partial object instead of a dynamic key cast. Since the fields being updated (`notes`, `source`) are valid position columns, we can type this with an explicit union or use a typed helper.
- Line 115: `onUpdate({ [field]: value || null } as any)` -- same fix, type as `Partial<Position>`
- Line 130: `(position as any).first_seen_at` becomes `position.first_seen_at`
- Line 164: `(position as any).source` becomes `position.source`
- Line 364: `(p as any).last_price_update` becomes `p.last_price_update`
- Lines 393-397: `.update({ current_price, current_value, last_price_update } as any)` -- all three fields exist on `positions.Update` type, so cast is unnecessary.
- Line 404: `{ ...p, ... } as any` in the `setPositions` mapping -- the spread already produces a `Position`, so the cast can be removed.

**`src/hooks/use-alerts.ts`** (4 casts)
- Line 62: `.insert({ ... } as any)` -- all fields (`user_id`, `watchlist_entry_id`, `symbol`, `alert_type`, `target_value`, `reference_price`, `notify_time`) exist on `price_alerts.Insert`. Remove cast.
- Line 85: `.update(data as any)` -- the `data` partial contains fields from `PriceAlert` (`target_value`, `alert_type`, `reference_price`, `is_active`), all of which exist on `price_alerts.Update`. Remove cast.
- Lines 111, 125: `.update({ acknowledged_at: ... } as any)` -- `acknowledged_at` exists on `price_alerts.Update`. Remove cast.

**`src/hooks/use-watchlist.ts`** (1 cast)
- Line 249: `.update({ current_price, previous_close, last_price_update } as any)` -- all three fields exist on `watchlist_entries.Update`. Remove cast.

**`src/pages/Watchlist.tsx`** (1 cast)
- Line 319: `(e as any).last_price_update` -- `last_price_update` exists on `watchlist_entries.Row`. Remove cast.

**`src/components/UpdatePortfolioModal.tsx`** (2 casts)
- Lines 175, 195: `account: ... as any` -- the `account` column is typed as `Json | null`. The array value being passed is valid JSON. Cast to `Json` from the Supabase types instead of `any`.

**`src/hooks/use-portfolio-settings.ts`** (2 casts)
- Lines 111, 113: `raw.categories as any[]` and `cat: any`, `t: any` -- type these with inline interfaces or the existing `CategoryConfig`/`TierConfig` types during migration detection.

---

### 2. Fix dynamic import in Settings

**`src/pages/Settings.tsx`** (lines 27-28)

Replace:
```ts
const { data } = await (await import("@/integrations/supabase/client")).supabase
```
With a static import at the top of the file:
```ts
import { supabase } from "@/integrations/supabase/client";
```
Then use `supabase` directly in the `useEffect`. Also remove the `p: any` cast on line 32 and type it properly.

---

### 3. Add error handling to settings fetch

**`src/hooks/use-portfolio-settings.ts`** (lines 180-211)

Wrap the async fetch in a `try/catch`:
- On error: set `loading` to `false`, call `toast` with an error message, and leave `settings` at `DEFAULT_SETTINGS` (the initial state).
- Import `useToast` from `@/hooks/use-toast` and wire it into the hook.

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/pages/Portfolio.tsx` | Remove ~8 `as any` casts, remove redundant type intersection |
| `src/hooks/use-alerts.ts` | Remove 4 `as any` casts from insert/update calls |
| `src/hooks/use-watchlist.ts` | Remove 1 `as any` cast from update call |
| `src/pages/Watchlist.tsx` | Remove 1 `as any` cast on `last_price_update` |
| `src/components/UpdatePortfolioModal.tsx` | Replace 2 `as any` with `as Json` |
| `src/hooks/use-portfolio-settings.ts` | Remove 2 `as any` in migration, add try/catch + toast for fetch errors |
| `src/pages/Settings.tsx` | Replace dynamic import with static import, type the reduce callback |

No database changes, no UI changes, no behavior changes.

