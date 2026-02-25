

## Portfolio Position Tags with Watchlist Auto-Sync

### Overview
Add a tagging system to portfolio positions that mirrors the watchlist tag UI and automatically syncs tags from matching watchlist entries. Tags added via sync can be removed by the user and won't be re-added.

---

### 1. Database Changes

**New table: `position_tags`**
- `position_id` (uuid, references `positions.id` ON DELETE CASCADE)
- `tag_id` (uuid, references `tags.id` ON DELETE CASCADE)
- `assigned_at` (timestamptz, default now())
- UNIQUE(position_id, tag_id)
- RLS enabled, same pattern as `watchlist_entry_tags` (join to `positions.user_id = auth.uid()`)

**Alter `positions` table:**
- Add `removed_tag_ids` column (jsonb, default `'[]'`)
- This tracks tag IDs the user explicitly removed so auto-sync skips them

---

### 2. Data Fetching Updates (Portfolio.tsx)

Update `fetchData` to also load:
- `position_tags` (all rows for the user's positions)
- Reuse the already-loaded `tags` from a new fetch (or fetch tags alongside positions)

Store `positionTags` and `allTags` in component state. Build a lookup map: `positionId -> Tag[]` for rendering.

---

### 3. Auto-Sync Logic (Portfolio.tsx)

After positions and watchlist data are both available, run a background sync:

1. Fetch watchlist entries + watchlist_entry_tags for the current user
2. For each position, find the watchlist entry with the same symbol
3. Get the watchlist entry's tag IDs
4. Subtract: tags already on the position + tags in `removed_tag_ids`
5. Insert the remaining tag IDs into `position_tags`
6. Run once on load, silently in the background (no loading UI)

This is additive only -- never removes tags.

---

### 4. Portfolio Table UI

**Tags column** (added after the Category column):

In the main table row (compact view):
- Show up to 3 tag badges using the same pill style as watchlist: `short_code` with colored background at 20% opacity, colored text, colored border at 40% opacity
- If more than 3 tags, show a "+N" overflow badge

In the expanded detail panel (`PositionDetailPanel`):
- Add a "Tags" section showing all tag badges with an X button on hover to remove
- Removing a tag: deletes from `position_tags` AND adds the tag ID to the position's `removed_tag_ids` array
- "Add" button opens a popover listing unassigned tags (same pattern as watchlist)
- Adding a tag: inserts into `position_tags` AND removes the tag ID from `removed_tag_ids` (so future syncs keep it)

---

### 5. Tag Persistence Through CSV Import

No import code changes needed. The CSV import upserts positions by symbol, updating only shares/price/value/cost_basis. The `position_tags` junction table is separate and unaffected. The new `removed_tag_ids` column has a default of `'[]'` so new positions work cleanly.

---

### Technical Details

**Files to modify:**
- `supabase/migrations/` -- new migration for `position_tags` table + `removed_tag_ids` column + RLS policies
- `src/integrations/supabase/types.ts` -- auto-updated after migration
- `src/pages/Portfolio.tsx` -- add tag fetching, sync logic, tags column in table, tags section in detail panel
- No changes to `src/hooks/use-watchlist.ts` (read watchlist data directly in sync logic)

**Column count adjustment:**
- The portfolio table currently has 12 columns. Adding a Tags column makes it 13. All `colSpan` values in expanded rows need updating.

**RLS policies for `position_tags`:**
```sql
-- SELECT
CREATE POLICY "Users can view their own position tags" ON position_tags
FOR SELECT USING (
  EXISTS (SELECT 1 FROM positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);

-- INSERT
CREATE POLICY "Users can insert their own position tags" ON position_tags
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);

-- DELETE
CREATE POLICY "Users can delete their own position tags" ON position_tags
FOR DELETE USING (
  EXISTS (SELECT 1 FROM positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);
```

