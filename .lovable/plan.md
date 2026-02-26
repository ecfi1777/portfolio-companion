
## Add Group Column to Watchlist Table

### Current column order
Checkbox | Symbol | Company | Price | Day% | Since Add% | Mkt Cap | Tags | Screens | Alert

### New column order
Checkbox | Symbol | Company | Price | Day% | Since Add% | Mkt Cap | **Group** | Tags | Screens | Alert

### Changes in `src/pages/Watchlist.tsx`

**1. Colgroup (lines 813-824):** Add a `col` for Group (~8% width), reduce Tags from 15% to 10% and Screens from 17% to 14% to make room:

| Column | Before | After |
|--------|--------|-------|
| Tags | 15% | 10% |
| Screens | 17% | 14% |
| Group | — | 8% (new) |

**2. Table header (lines 825-839):** Add `<TableHead>Group</TableHead>` after the Mkt Cap header.

**3. Table body -- Symbol cell (lines 869-883):** Remove the colored group badge from the Symbol cell entirely. Keep the Archived badge.

**4. Table body -- new Group cell (after line 903):** Add a plain text cell:
```
<TableCell className="text-muted-foreground text-sm truncate">
  {groups.find(g => g.id === entry.group_id)?.name ?? "—"}
</TableCell>
```

**5. Filter dropdown order (lines ~643-646):** Move the Group filter before Sector so the order is: Tags | Mkt Cap | Group | Sector.

Only `src/pages/Watchlist.tsx` is modified.
