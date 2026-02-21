

# Expanded Row Enrichment for Portfolio

Adds `source` and `first_seen_at` columns to positions, then enriches the expanded row UI with metadata display, inline-editable fields, and quick action buttons.

---

## Step 1: Database Migration

Add two new columns to `positions` using the user's exact approach -- add `first_seen_at` without a default so existing rows stay `NULL`, then set the default for future inserts:

```sql
ALTER TABLE public.positions
  ADD COLUMN source text,
  ADD COLUMN first_seen_at timestamptz;

ALTER TABLE public.positions
  ALTER COLUMN first_seen_at SET DEFAULT now();
```

This means existing positions show a dash for "Date first tracked" while newly imported ones get a timestamp automatically.

---

## Step 2: Update CSV Import Logic (`src/components/UpdatePortfolioModal.tsx`)

The current upsert call (line ~163-178) sends all fields on conflict. For updates to existing rows, `first_seen_at` must not be overwritten. The fix:

- Do NOT include `first_seen_at` in the upsert payload at all. Since the column has a `DEFAULT now()`, new inserts automatically get a timestamp. For updates (conflict on `user_id,symbol`), the column is simply not touched, preserving the original value.
- Similarly, `source` should not be included in the import upsert -- it is a user-edited field and should never be overwritten by CSV data.

No changes to `notes` handling needed -- it is already excluded from the upsert.

---

## Step 3: Enrich Expanded Rows in Portfolio (`src/pages/Portfolio.tsx`)

Currently, expanded rows only show per-account breakdowns (lines 439-449). For stock positions (not CASH), add a detail section below the account rows:

### 3a. Position Metadata
- **Date first tracked**: Read-only. If `first_seen_at` is set, format as "Tracked since Jan 15, 2025". If null, show a dash.

### 3b. Inline-Editable Fields
- **Notes**: A text input pre-filled with `p.notes`. Placeholder: "Add a note..." Saves to the database on blur via a direct `supabase.from("positions").update({ notes }).eq("id", p.id)` call, then updates local state.
- **Source**: Same pattern. Placeholder: "Where did you find this pick?" Saves `source` on blur.

Both fields use a simple `<Input>` or `<Textarea>` component with local state initialized from the position, and an `onBlur` handler that persists changes.

### 3c. Quick Actions
- **Reclassify button**: Renders the existing `<CategorySelector>` component in the detail area, giving a deliberate way to re-categorize from the expanded view.
- **Remove from portfolio button**: Styled as `variant="destructive"` outline. On click, opens an `AlertDialog` with:
  - Title: "Remove [SYMBOL] from portfolio?"
  - Description: "This cannot be undone. This position may reappear if it's still in your brokerage data on the next import."
  - Confirm button deletes the row via `supabase.from("positions").delete().eq("id", p.id)`, removes it from local state, shows a success toast, and collapses the row.

### 3d. Layout
- Account sub-rows render first (existing behavior).
- Below them, a visually separated detail panel (subtle top border, slightly different background) contains the metadata, editable fields, and action buttons.
- The CASH row continues to show only account breakdowns -- no detail panel.

### 3e. Single-expand behavior
Already implemented (`expandedId` state) -- only one row can be open at a time.

---

## Files affected
1. **Database migration** -- adds `source` and `first_seen_at` columns
2. `src/components/UpdatePortfolioModal.tsx` -- no changes needed (upsert already excludes `source`, `notes`, and `first_seen_at` since they aren't in the payload)
3. `src/pages/Portfolio.tsx` -- expanded row detail section with metadata, editable fields, and remove/reclassify actions

