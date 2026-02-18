

# Watchlist Foundation

## Overview
Replace the placeholder Watchlist page with a fully functional feature for tracking stocks you're interested in but don't own. Includes a searchable table of entries, an "Add to Watchlist" modal, and a tag management system with default tags seeded on first use.

---

## What Gets Built

### 1. Database Tables

**watchlist_entries**
- id (uuid, primary key)
- user_id (uuid, not null)
- symbol (varchar, not null)
- company_name (varchar)
- date_added (timestamp, default now())
- price_when_added (decimal)
- current_price (decimal)
- previous_close (decimal)
- industry (varchar)
- sector (varchar)
- market_cap (bigint)
- market_cap_category (varchar -- MEGA/LARGE/MID/SMALL/MICRO/NANO)
- notes (text)
- created_at, updated_at (timestamps)
- Unique constraint on (user_id, symbol)
- RLS: users can only read/insert/update/delete their own entries

**tags**
- id (uuid, primary key)
- user_id (uuid, not null)
- short_code (varchar 20, not null)
- full_name (varchar 100)
- color (varchar 7 -- hex like #5865F2)
- is_active (boolean, default true)
- is_system_tag (boolean, default false)
- screen_id (uuid, nullable)
- screen_name (varchar, nullable)
- screen_date (date, nullable)
- created_at, updated_at (timestamps)
- Unique constraint on (user_id, short_code)
- RLS: users can only read/insert/update/delete their own tags

**watchlist_entry_tags** (junction table)
- watchlist_entry_id (uuid, FK to watchlist_entries)
- tag_id (uuid, FK to tags)
- assigned_at (timestamp, default now())
- Composite primary key on (watchlist_entry_id, tag_id)
- RLS: users can only manage tag associations for their own watchlist entries
- Foreign keys cascade on delete

All three tables get the `update_updated_at_column` trigger (where applicable).

### 2. Default Tag Seeding
On first visit to the Watchlist page, if the user has no tags, automatically insert the following system tags:

| Short Code | Full Name | Color |
|---|---|---|
| MF | Motley Fool | #5865F2 |
| CQ | Compounding Quality | #57F287 |
| TT | Tiny Titans | #FEE75C |
| Z1 | Zacks Rank #1 | #ED4245 |
| Z2 | Zacks Rank #2 | #EB459E |
| AP | Alpha Picks | #9B59B6 |
| CORE | Core Position | #3498DB |
| GC | Good Companies | #2ECC71 |

These are inserted with `is_system_tag: true`. No stocks are assigned to them initially.

Tag seeding checks if the user has any tags on first visit. If none exist, the default set is inserted. This is idempotent -- if tags already exist, nothing happens.

### 3. Watchlist Table UI
A table displaying all watchlist entries with columns:
- **Symbol** -- stock ticker
- **Company Name**
- **Current Price**
- **Day Change %** -- calculated from current_price vs previous_close, color-coded green/red
- **Change Since Added %** -- calculated from current_price vs price_when_added, color-coded
- **Market Cap Category** -- displayed as a badge (MEGA/LARGE/MID/SMALL/etc.)
- **Tags** -- shown as small colored pills using each tag's hex color
- **Alert** -- bell icon placeholder (greyed out for now, alerts come later)

A search bar above the table filters entries by symbol or company name (client-side filter).

### 4. Add to Watchlist Modal
A button opens a modal with:
- Symbol input (required)
- Company name input (manual entry for now)
- Price when added input (manual entry for now)
- Tag selector -- multi-select from the user's active tags, shown as colored pills
- Notes textarea (optional)
- Save button -- inserts into watchlist_entries and creates tag associations

### 5. Tag Management Modal
A "Manage Tags" button opens a modal where users can:
- **View** all tags (active and inactive) in a list
- **Create** a new tag: short code, full name, color picker (or hex input)
- **Edit** existing tags: update short code, full name, or color
- **Deactivate** a tag: sets is_active to false (tag is hidden from selection but data preserved; entries keep their associations)
- **Delete** a tag: confirmation dialog shows how many watchlist entries use this tag. On confirm, deletes the tag (cascade removes associations)

---

## No API Lookups Yet
Symbol, company name, and price are all manually entered. API lookup will be added later -- the UI should be structured to make that easy to swap in (the inputs can later be replaced with a search/autocomplete).

## No New Routes Needed
The Watchlist page route already exists with a placeholder. Replace its contents with the full implementation.

