

# Expandable Row Details -- Remaining Work

## Overview
The basic expand/collapse mechanism and per-account breakdown already work. This plan adds the missing pieces: position metadata display, inline-editable notes and source fields, and quick action buttons (Reclassify and Remove), with updated behavior for removals and a new `first_seen_at` tracking column.

---

## What Needs to Be Built

### 1. Enriched Expanded Row Content
When a stock position row is expanded, show a structured detail section below the account breakdown:

**Position Metadata:**
- **Date first tracked** -- displayed as a formatted read-only date (e.g., "Tracked since Jan 15, 2025"). If null (for positions that existed before this feature), show a dash.
- **Notes field** -- editable inline text. Saves automatically on blur. If empty, show a muted placeholder like "Add a note..."
- **Source field** -- same behavior as notes: editable inline, saves on blur. Placeholder: "Where did you find this pick?" Useful for Consensus positions but visible for all.

**Quick Actions:**
- **Reclassify button** -- opens the same category/tier selector already in the table, presented as a deliberate action in the detail view. Uses the existing CategorySelector component.
- **Remove from portfolio button** -- styled as destructive/outline. Opens a confirmation dialog: "Are you sure you want to remove [SYMBOL] from your portfolio? This cannot be undone." The dialog includes a note: "This position may reappear if it's still in your brokerage data on the next import." On confirm, deletes the position from the database.

### 2. Behavior Details
- Only stock positions show the full detail view. The CASH row continues to expand only to show per-account breakdown (no notes, no source, no remove button).
- Expanded detail section is visually separated from the account sub-rows (subtle border or background change).
- After removing a position, the row disappears and portfolio totals recalculate immediately. Note: if a removed position still exists in a brokerage account, it will reappear on the next CSV import. This is expected behavior -- the Remove button is for manual cleanup of positions that were sold but weren't caught by a CSV update, not a permanent block. A brief toast confirms the removal.
- Only one row can be expanded at a time.

---

## Database Changes
Two new columns added to the `positions` table via a single migration:

- **`source`** -- text, nullable. Stores where a recommendation came from (primarily for Consensus picks).
- **`first_seen_at`** -- timestamp with time zone, nullable. Set to `now()` on initial insert only. Preserved (never overwritten) during CSV re-imports/updates.

The CSV import logic must be updated to avoid overwriting `first_seen_at` on existing rows. For new positions being inserted, `first_seen_at` should default to `now()`. For updates to existing positions, the column should be excluded from the update so the original value is preserved.

---

## No New Routes or Pages
Everything is contained within the expanded row in the existing Portfolio page.

