

# Capital Deployment Guide + Settings

## Overview
Add weight progress tracking, goal-based capital deployment guidance, and a Settings page so you can see how each position is progressing toward its target weight and know where to deploy cash next.

---

## What Gets Built

### 1. Settings Page
A new page accessible from the sidebar where you can customize:
- **Category allocation targets** -- Core / Titan / Consensus percentages (must sum to 100%, defaults: 50/25/25)
- **Position count target range** -- default 25-35
- **Per-tier weight targets** -- C1: 8.5%, C2: 6%, C3: 5%, Titan: 2.5%, Consensus min 1% / max 5%

Settings are saved automatically and used across all calculations. Default values apply until you customize.

**First-load behavior:** If no settings exist for the user yet, the default settings row is automatically inserted on first visit to the Settings page or on first portfolio load. This prevents edge cases where calculations try to read settings that don't exist.

### 2. Weight Progress Indicators (in positions table)
Each categorized position gets a small progress bar showing current weight vs its goal weight based on tier. For example, a C1 position at 4.2% shows progress toward the 8.5% target. Unassigned positions and CASH show no progress bar. The tone is encouraging -- "you're 60% of the way there" -- not a warning.

### 3. Capital to Goal Column (in positions table)
A new column showing the dollar amount needed to reach goal weight:
- Below goal: muted text like "$4,883 to goal"
- At or above goal: small green checkmark with "At goal"
- Consensus above 5%: amber text "Above 5% cap -- consider trimming or reclassifying to Core"

### 4. Deploy Capital Guide
A collapsible section below the positions table (visible when cash exists) that answers "I have cash to invest -- where should it go?" It lists all below-goal positions ranked by conviction tier priority: C1 first, then C2, C3, TT, CON. Each entry shows symbol, current weight, goal weight, and dollars needed. Sorted by conviction tier, not by gap size.

### 5. Category Allocation Overview
Below the summary cards, a visual comparison of current allocation vs target allocation for each category (Core/Titan/Consensus). Shows current % next to target % with a subtle progress bar. No warnings -- just informational planning guidelines.

### 6. Minimal Alerts
Only two things get visual urgency:
- Consensus positions above 5% cap (amber indicator suggesting trim or reclassify)
- Positions still unassigned (existing behavior)

Everything else is progress tracking with an encouraging tone.

---

## Database

**New table: `portfolio_settings`**
- `id` (uuid, primary key)
- `user_id` (uuid, unique, not null)
- `settings` (jsonb) -- stores all targets as a single JSON object
- `created_at`, `updated_at` timestamps
- RLS policies: users can only read/write their own settings

**Default settings JSON structure:**
```text
{
  "categoryTargets": { "CORE": 50, "TITAN": 25, "CONSENSUS": 25 },
  "positionCountRange": { "min": 25, "max": 35 },
  "tierGoals": {
    "C1": 8.5, "C2": 6, "C3": 5,
    "TT": 2.5,
    "CON_MIN": 1, "CON_MAX": 5
  }
}
```

