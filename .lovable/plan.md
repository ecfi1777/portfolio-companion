

## Bulk Import to Watchlist

### Overview
Add a "Bulk Import" button next to the existing "Add to Watchlist" button on the Watchlist page. It opens a modal where users can upload a CSV file with Symbol, Company Name, and Price columns. The modal previews parsed rows, flags duplicates, and imports new entries in bulk.

### New File: `src/components/BulkWatchlistImportModal.tsx`

A new modal component with the following flow:

1. **File Upload Zone** -- Drag-and-drop area or click-to-browse, restricted to `.csv` files. Uses a standard `<input type="file" accept=".csv">` with a styled drop zone.

2. **CSV Parsing** -- On file selection, read the file with `FileReader`, parse using the existing `parseGenericCSV` from `src/lib/csv-generic-parser.ts`. Auto-detect columns for Symbol, Company Name, and Price using header keyword matching (similar to `detectSymbolColumn`).

3. **Duplicate Detection** -- Compare parsed symbols against `entries` (passed as a prop from the Watchlist page). Mark duplicates as "Skipped -- already on watchlist" (grayed out, unchecked, not selectable).

4. **Preview Table** -- Show all parsed rows in a table with columns: Checkbox, Symbol, Company Name, Price, Status. New rows are checked by default. Duplicate rows show a muted "Already on watchlist" badge and are disabled.

5. **Import Logic** -- On confirm, insert each selected new entry into `watchlist_entries` via Supabase:
   - `symbol`: from CSV
   - `company_name`: from CSV
   - `price_when_added` and `current_price`: Price from CSV
   - `date_added`: current timestamp (database default)
   - No tags, no category, no alerts

6. **Summary Toast** -- After import, show: "Added X new stocks, Y skipped (already on watchlist)." Close modal on success. Call `refetchWatchlist()` to refresh the list.

### Changes to `src/pages/Watchlist.tsx`

- Import the new `BulkWatchlistImportModal` component
- Add state: `const [bulkOpen, setBulkOpen] = useState(false)`
- Add a "Bulk Import" button next to the existing "Add to Watchlist" button in the header
- Render the modal, passing `entries` (for duplicate detection), `user`, and `refetchWatchlist` as the post-import callback

### Technical Details

**Column Detection Logic:**
- Symbol: headers containing "symbol", "ticker", "stock"
- Company Name: headers containing "name", "company", "description", "security"
- Price: headers containing "price", "last", "close", "value"
- Falls back to column indices 0, 1, 2 if no matches

**Insert Strategy:**
- Batch insert using `supabase.from("watchlist_entries").insert([...rows])` for efficiency
- Each row includes `user_id` from auth context
- Uses the existing `market_cap_category` as null (no FMP lookup during bulk import)

**Error Handling:**
- If any row fails (e.g., unique constraint on duplicate symbol), it is caught and counted as skipped
- Toast shows final tally of added vs skipped

