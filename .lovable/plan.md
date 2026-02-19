
# Enhance Cross-Screen Overlap Section

Replace the current numbers-only overlap matrix with a more useful combined view that shows actual symbols and integrates with the watchlist.

---

## Changes to `src/pages/Watchlist.tsx` (ScreenOverlapMatrix component)

### 1. Expandable overlap cells
When you click an overlap count in the matrix, expand a section below the matrix showing the actual overlapping symbols between those two screens. Each symbol gets:
- A badge with the ticker name
- A checkmark if it is already in your watchlist
- A "+" add button if it is not in your watchlist (same quick-add pattern already used in the screen run expansion)

### 2. Cross-screen matches table
Below the matrix, add a new table: **"Symbols in Multiple Screens"**. This lists every symbol that appears in 2 or more screens, sorted by how many screens it appears in (descending). Columns:
- **Symbol** -- the ticker
- **Screens** -- count of screens it appears in, plus small labels of which screens
- **In Watchlist** -- checkmark if already on watchlist, or an "Add" button to quick-add it

A summary line above: e.g. "14 symbols appear in 2+ screens out of 287 unique symbols."

### 3. Watchlist matches in screens
Add a second table: **"Watchlist Matches"**. This shows every symbol from your watchlist that appears in at least one uploaded screen. Columns:
- **Symbol** -- the ticker
- **Screens** -- which screens contain it

This consolidates all the information into one section: the matrix for a quick numeric overview, the cross-screen symbols table for actionable overlap data, and the watchlist matches table.

### Technical approach
- The `ScreenOverlapMatrix` component will receive `watchlistEntries` and `addEntry` as additional props (already available in the parent)
- Clicking an off-diagonal matrix cell sets `selectedPair` state to `[rowIndex, colIndex]`, rendering the overlapping symbols below the matrix
- The cross-screen and watchlist tables are computed with `useMemo` from the existing `latestByScreen` data and watchlist entries
- The quick-add button reuses the same inline `addEntry` + `refetchWatchlist` pattern already in the codebase
