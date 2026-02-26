

## Watchlist Archive / Hide Entries

### Database Change

Add an `archived_at` column to `watchlist_entries`:

```sql
ALTER TABLE public.watchlist_entries
  ADD COLUMN archived_at timestamptz DEFAULT NULL;
```

### Code Changes

**1. `src/hooks/use-watchlist.ts` -- Hook updates**

- Add `archived_at` to the `WatchlistEntry` interface (nullable string)
- Add an `archiveEntries(ids: string[])` function that sets `archived_at = now()` on selected entries
- Add an `unarchiveEntries(ids: string[])` function that sets `archived_at = null` on selected entries
- Modify `refreshPrices` to only refresh entries where `archived_at` is null (filter the `symbols` array before calling `fetchProfilesBatched`)

**2. `src/pages/Watchlist.tsx` -- UI updates**

- **Filter state**: Add a `showArchived` boolean state (default `false`)
- **Filtering logic**: In the `processed` memo, when `showArchived` is OFF, filter out entries where `archived_at` is not null. When ON, show all entries.
- **Show Archived toggle**: Add a `Switch` component next to the existing filter controls (Tags, Mkt Cap, Sector, Performance) labeled "Show Archived"
- **Bulk action bar**: When entries are selected:
  - If any selected entries are archived, show "Unarchive Selected" (outline button with `EyeOff` icon)
  - Otherwise show "Archive Selected" (outline button with `Archive` icon) next to the existing "Delete Selected" button
  - Archive action: call `archiveEntries`, clear selection, toast "Archived X entries"
  - Unarchive action: call `unarchiveEntries`, clear selection, toast "Unarchived X entries"
- **Archived row styling**: When an entry has `archived_at` set, apply `opacity-50` to the table row and show an "Archived" badge (muted style) next to the symbol
- **Expanded row unarchive**: In the expanded detail panel for archived entries, show an "Unarchive" button (secondary) in the Notes/Actions section, above the "Remove from Watchlist" delete button
- **Auto-refresh exclusion**: The auto-refresh `useEffect` already calls `refreshPrices` from the hook, which will be updated to skip archived entries

### Summary of files changed

| File | Change |
|------|--------|
| Migration SQL | Add `archived_at` column |
| `src/hooks/use-watchlist.ts` | Add `archived_at` to interface, add archive/unarchive functions, filter archived from price refresh |
| `src/pages/Watchlist.tsx` | Add show-archived toggle, bulk archive/unarchive buttons, archived row styling, individual unarchive button |

