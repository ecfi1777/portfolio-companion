

## Further Split of Watchlist.tsx (1,050 -> ~350 lines)

Portfolio.tsx (566 lines) is already well-split from the previous refactor -- all UI rendering is delegated to sub-components. The remaining bulk is state, data fetching, and derived computations which belong in the parent. No further changes needed there.

Watchlist.tsx still has ~700 lines of inline rendering that can be extracted. Here's the plan:

### 1. Create `src/components/watchlist/WatchlistTable.tsx` (~250 lines)

Extract the entire table rendering block (lines 579-784):
- The `<Table>` with `<colgroup>`, `<TableHeader>`, and `<TableBody>`
- Each row's cells: checkbox, symbol, company, price, day%, since add%, mkt cap, group, tags (with inline tag add/remove popover), screens, alert icon
- The expanded row rendering that delegates to `WatchlistEntryDetail`
- The "No results" empty row

Props:
- `processed` (filtered/sorted entries array)
- `sortKey`, `sortDir`, `onSort`
- `expandedId`, `onExpand`
- `selectedIds`, `onToggleSelect`, `allVisibleSelected`, `onToggleSelectAll`
- `groups`, `tags`, `screenHitsMap`
- `getAlertsForEntry`
- `editingNotes`, `onEditNotes`, `onNotesBlur`
- `onAddTag`, `onRemoveTag`
- `onDeleteAlertConfirm`, `onAssignGroup`, `onUnarchive`, `onDeleteConfirm`
- `createAlert`
- `AlertPopoverComponent`

### 2. Create `src/components/watchlist/AlertPopover.tsx` (~85 lines)

Extract the `AlertPopover` function component (lines 967-1050) and the `ALERT_TYPE_LABELS` constant into its own file. It's already self-contained with its own local state.

### 3. Create `src/components/watchlist/WatchlistAlertsSection.tsx` (~110 lines)

Extract the collapsible "Price Alerts" section (lines 787-891):
- The collapsible header with chevron toggle
- The Tabs component with Active and Triggered tabs
- The active alerts table and triggered alerts table

Props:
- `activeAlerts`, `triggeredAlerts`
- `alertsOpen`, `onToggleAlerts`
- `alertTab`, `onAlertTabChange`
- `onDeleteAlertConfirm`

### 4. Slim down `src/pages/Watchlist.tsx` to ~350 lines

After extraction, Watchlist.tsx will contain:
- Imports
- Type definitions (ScreenHit, SymbolScreenData, etc.)
- All useState/useCallback/useMemo hooks (state management stays in parent)
- Data fetching (screen hits, auto-refresh, re-enrich)
- Filter/sort logic (already compact)
- JSX composing: Header bar, modals, `WatchlistFilters`, empty state, `WatchlistGroupTabs`, `WatchlistBulkActions`, `WatchlistTable`, `WatchlistAlertsSection`, and the three `AlertDialog` modals

### Files summary

| Action | File | Lines |
|--------|------|-------|
| Create | `src/components/watchlist/WatchlistTable.tsx` | ~250 |
| Create | `src/components/watchlist/AlertPopover.tsx` | ~85 |
| Create | `src/components/watchlist/WatchlistAlertsSection.tsx` | ~110 |
| Edit | `src/pages/Watchlist.tsx` | 1050 -> ~350 |
| No change | `src/pages/Portfolio.tsx` | Already 566, well-split |

No behavior changes -- pure extraction with props passed from the parent.
