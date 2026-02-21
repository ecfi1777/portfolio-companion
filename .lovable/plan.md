

# Settings Page + Portfolio Settings + Capital Deployment Guide

This is a large feature that creates the foundation (settings table + page) and then layers on weight tracking, capital-to-goal calculations, a deploy capital guide, and category allocation vs targets -- all in the Portfolio dashboard.

---

## Step 1: Create `portfolio_settings` table

A new database table with one row per user, storing all targets as JSONB.

**Schema:**
- `id` uuid, primary key, default `gen_random_uuid()`
- `user_id` uuid, not null, unique
- `settings` jsonb, not null, default (see below)
- `created_at` timestamptz, default `now()`
- `updated_at` timestamptz, default `now()`

**Default JSONB value:**
```json
{
  "category_targets": { "CORE": 50, "TITAN": 25, "CONSENSUS": 25 },
  "position_count_target": { "min": 25, "max": 35 },
  "tier_goals": {
    "C1": 8.5, "C2": 6, "C3": 5, "TT": 2.5, "CON_MIN": 1, "CON_MAX": 5
  }
}
```

**RLS policies:** Users can SELECT, INSERT, UPDATE their own rows (matching `auth.uid() = user_id`).

**Trigger:** Attach the existing `update_updated_at_column` trigger.

---

## Step 2: Create a custom hook -- `src/hooks/use-portfolio-settings.ts`

- Fetches the user's `portfolio_settings` row on mount
- If no row exists, inserts one with defaults and returns the defaults
- Exposes `settings`, `updateSettings(partial)`, and `loading`
- Defines a TypeScript `PortfolioSettings` interface matching the JSONB shape

---

## Step 3: Create the Settings page -- `src/pages/Settings.tsx`

- Add `/settings` route in `App.tsx` as a protected route
- Add a "Settings" nav item (with a `Settings` icon) to `AppLayout.tsx` sidebar
- The page displays editable fields grouped into cards:
  - **Category Allocation Targets** -- three number inputs for Core/Titan/Consensus %, with validation they sum to 100
  - **Position Count Target** -- min/max inputs (default 25-35)
  - **Per-Tier Weight Goals** -- inputs for C1 (8.5%), C2 (6%), C3 (5%), TT (2.5%), CON min (1%), CON max (5%)
- A "Save" button persists changes via the hook
- A "Reset to Defaults" button restores defaults

---

## Step 4: Enhance the Portfolio page -- `src/pages/Portfolio.tsx`

All of the following features use the saved settings from `use-portfolio-settings`.

### 4a. Weight Progress Bars (per position row)
- In the Weight column, for categorized positions, show a small progress bar below the weight percentage
- The bar's target comes from the tier goal (e.g., C1 = 8.5%, TT = 2.5%)
- Unassigned or CASH positions show no bar
- Friendly/informational style -- muted colors, no red warnings

### 4b. Capital to Goal Column
- New column after Weight: "To Goal"
- For positions below their tier target: show `$X,XXX to goal` in muted text
- For positions at or above target: show a green checkmark and "At goal"
- Special case: Consensus positions above 5% (CON_MAX) show an amber message: "Above 5% cap -- consider trimming or reclassifying to Core"
- CASH row shows nothing

### 4c. Category Allocation Overview (below summary cards)
- Update the existing category breakdown card to show target percentages alongside current ones
- Each category legend item shows: current % / target % with a subtle progress indicator
- No warnings -- just informational data display

### 4d. Deploy Capital Guide (collapsible section below positions table)
- Only visible when `cashBalance > 0`
- Collapsible panel using the Collapsible component, titled "Deploy Capital"
- Lists all below-goal positions sorted by conviction tier priority: C1 first, then C2, C3, TT, CON
- Each row shows: symbol, current weight, goal weight, dollar amount to reach goal
- Answers "I have $X to invest -- where should it go?"

---

## Files to create
1. `src/hooks/use-portfolio-settings.ts` -- settings hook
2. `src/pages/Settings.tsx` -- settings page

## Files to modify
1. Database migration -- new `portfolio_settings` table
2. `src/App.tsx` -- add `/settings` route
3. `src/components/AppLayout.tsx` -- add Settings nav item
4. `src/pages/Portfolio.tsx` -- add weight bars, capital-to-goal column, allocation overview, deploy capital guide

