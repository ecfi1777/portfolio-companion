

## Clickable Overlap Matrix Cells

### Overview
Make off-diagonal cells in the Screen-to-Screen Overlap matrix clickable. Clicking opens a modal showing the overlapping symbols between the two screens, with the ability to add symbols to the watchlist inline.

### Changes

**1. New Component: `OverlapDetailModal.tsx`**
- A dialog component that receives two screen runs and computes overlapping symbols
- Header: "[Screen A] ∩ [Screen B] -- X symbols"
- Table with columns: Symbol, Status
- Status logic:
  - Already on watchlist: green checkmark
  - Already in portfolio: "Held" badge
  - Neither: "+ Add" button
- "+ Add" inserts a minimal `watchlist_entries` row (symbol + user_id + date_added) via `supabase.from("watchlist_entries").insert(...)`, then updates local state to show green checkmark without closing modal
- Tracks newly-added symbols in local state so the button flips to checkmark immediately

**2. Modify `src/pages/Screens.tsx`**
- Add state for the selected cell: `overlapModal` storing `{ rowIdx, colIdx } | null`
- Make off-diagonal `TableCell` elements clickable with `cursor-pointer` and `onClick` handler
- Render the `OverlapDetailModal` at the bottom, passing:
  - The two screen runs (`latestByScreen[rowIdx]` and `latestByScreen[colIdx]`)
  - Screen names and colors
  - `watchlistSymbolSet` and `portfolioSymbolSet` for status checks
  - The `getSymbols` helper output for each run
  - A callback to add to watchlist (reusing `addEntry` from `useWatchlist` with minimal data, or direct insert for speed)
- Diagonal cells remain non-clickable (no cursor change, no onClick)

### Technical Details

**Overlap computation** (inside the modal):
```
const setA = new Set(getSymbols(runA).map(s => s.toUpperCase()));
const overlap = getSymbols(runB).filter(s => setA.has(s.toUpperCase()));
```

**Quick-add behavior**: Use `addEntry({ symbol })` from the existing `useWatchlist` hook, which handles duplicate detection and toasts. Track added symbols in a local `Set` within the modal so the UI updates instantly. After closing the modal, the watchlist refetches automatically.

**Cell styling**: Off-diagonal cells get `cursor-pointer hover:ring-1 hover:ring-primary/50` to indicate clickability. Diagonal cells unchanged.

### Files to create/modify
- Create: `src/components/OverlapDetailModal.tsx`
- Modify: `src/pages/Screens.tsx` (add state, click handler, render modal)

