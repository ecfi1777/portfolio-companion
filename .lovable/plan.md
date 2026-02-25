

## Redesign Portfolio Import -- Preview Before Commit with Position Removal

### Overview
Restructure the import flow from "upload then confirm then see summary" to "upload then preview all changes then confirm." The post-import summary screen is removed entirely. Positions missing from the CSV will now be flagged for deletion and removed on confirm.

---

### Flow Changes

**Current flow:** Upload → Click "Update Portfolio" (writes to DB immediately) → See post-import summary → Click "Done"

**New flow:** Upload → See full change preview (nothing written yet) → Click "Confirm Import" (writes to DB + deletes removed positions) → Modal closes with success toast

---

### Implementation Details (single file: `src/components/UpdatePortfolioModal.tsx`)

**1. Change the phase model**

Replace `"upload" | "summary"` with `"upload" | "preview"`. Remove the `SummaryView` component entirely.

**2. Expand `ChangeSummary` to include removals**

Add a `removedPositions` array containing positions in the database but NOT in the CSV (and not CASH). Each entry stores symbol, current value, and position ID (needed for deletion).

Add `oldTotal` and `newTotal` fields for showing portfolio value change.

**3. Move DB fetch to BEFORE commit (the preview step)**

When the user clicks a new "Preview Changes" button (replaces the current "Update Portfolio" button):
- Fetch existing positions and portfolio summary from the database
- Build the full `ChangeSummary` including removals, new, updated, unchanged, cash diff, and total value diff
- Switch to the `"preview"` phase
- Nothing is written to the database yet

**4. Build the preview UI**

The preview phase displays four sections in order:

1. **Positions to Remove** (red/destructive styling): Header shows "Removing X positions". Table lists symbol and current value for each. Only shown if there are removals.

2. **New Positions** (green/emerald styling): Same table as current summary view -- symbol, value, accounts.

3. **Updated Positions** (amber styling): Same diff table as current summary -- symbol with field-by-field old (strikethrough) to new changes.

4. **Unchanged Positions** (muted text): Just a count line, same as current.

5. **Cash Balance**: Old to new with diff badge (same styling as current summary).

6. **Total Portfolio Value**: Old total to new total with dollar and percentage change badge.

Two buttons at the bottom:
- "Cancel" (outline) -- closes modal, nothing saved
- "Confirm Import" (primary) -- executes all DB operations

**5. Confirm Import logic**

When "Confirm Import" is clicked:
- Delete positions flagged for removal (by their IDs) -- cascade handles `position_tags`
- Upsert all CSV positions (same as current)
- Upsert CASH position row (same as current)
- Upsert portfolio summary (same as current)
- Log to import history (same as current)
- Show success toast: "Portfolio updated: X added, Y updated, Z removed"
- Call `onSuccess()` and close the modal immediately (no summary phase)

**6. CASH exclusion from removal logic**

When computing removed positions, filter out any existing position with symbol "CASH" -- it is handled separately via the cash balance upsert.

**7. Preserved fields on update**

The upsert continues to only set: `shares`, `current_price`, `current_value`, `cost_basis`, `company_name`, `account`. Fields like `category`, `tier`, `notes`, `removed_tag_ids` are untouched.

---

### No database changes needed

The deletion uses the existing `positions` table DELETE RLS policy (already allows users to delete their own). The `position_tags` cascade handles tag cleanup automatically. No new migrations required.

