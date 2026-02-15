

# Personal Investment Portfolio Manager

## Overview
A clean, modern financial dashboard for managing personal investment positions. Uses Lovable Cloud (Supabase) for authentication and database. Clean, modern light theme by default with an option to switch to dark mode. Starts with portfolio management and CSV import from Fidelity exports.

---

## 1. Authentication
- Email/password signup and login using Supabase Auth
- Clean, minimal auth pages with a professional financial feel
- No user profiles table for now (will be added later for portfolio settings/preferences)

## 2. App Layout & Navigation
- **Sidebar navigation** with two sections:
  - **Portfolio** — main feature, built first
  - **Watchlist** — placeholder page for future development
- **Clean, modern light theme** with a dark mode toggle available
- Responsive layout optimized for desktop

## 3. Database Tables

### Positions Table
- Columns: id (uuid), user_id (references auth.users), symbol (varchar), company_name (varchar), shares (decimal), current_price (decimal), current_value (decimal), cost_basis (decimal), category (enum: CORE/TITAN/CONSENSUS), tier (enum: C1/C2/C3/TT/CON), account (varchar), notes (text), date_added (timestamp), created_at, updated_at
- Category and tier default to null on import (user assigns later)
- Positions are unique per user+symbol (aggregated across accounts)
- RLS enabled — users only see their own data

### Portfolio Summary Table
- Columns: id (uuid), user_id (references auth.users, unique), cash_balance (decimal), last_import_date (timestamp), created_at, updated_at
- Stores the user's total cash balance (summed from cash equivalents during CSV import)
- RLS enabled — users only see their own record
- Upserted on each CSV import

## 4. Portfolio Dashboard
- Summary cards at the top: total portfolio value, total cash balance, number of positions
- Table view showing all stock positions with key columns (symbol, company name, shares, price, value, cost basis)
- Cash balance displayed separately from stock positions (pulled from portfolio_summary)

## 5. CSV Import Feature (Core Feature)
- **Upload page** where users drag-and-drop or select a Fidelity CSV export
- **Parsing logic**: extracts Symbol, Shares, Price, Value, Cost Basis, and Account columns from Fidelity's CSV format (handles trailing spaces in column headers)
- **Cash detection**: identifies cash equivalents (SPAXX, FDRXX, FCASH), sums them into a total cash balance
- **Preview table**: shows parsed stock positions and the detected cash total before confirming import
- **On confirm**:
  - Upserts stock positions into the `positions` table, aggregating shares/values/cost basis when the same symbol appears across multiple accounts
  - Upserts the total cash balance into the `portfolio_summary` table
  - Existing positions for the same symbol are updated, not duplicated
  - **Positions already in the database that don't appear in the uploaded CSV are left untouched** — no deletions. Cleanup/sold-position handling will be added in a future prompt once account-aware safeguards are in place

