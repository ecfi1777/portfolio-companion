

## Dynamic Portfolio Categories

This plan converts the fixed 3-category system (Core, Titan, Consensus) into a fully dynamic system where users can create, rename, delete, and color-code 1-10 categories, with optional tiers.

---

### 1. Database Migration

Convert `positions.category` from the `position_category` enum to `varchar(50)`, preserving existing data, then drop the old enum type.

```text
SQL Migration:
  ALTER TABLE positions 
    ALTER COLUMN category TYPE varchar(50) USING category::text;
  DROP TYPE IF EXISTS position_category;
```

---

### 2. TypeScript Type Updates

**Portfolio.tsx (line 24):**
Change `type Category = Database["public"]["Enums"]["position_category"] | null` to `type Category = string | null`

**CategorySelector.tsx (line 21):**
Same change: `type Category = string | null`

---

### 3. Settings Data Structure Updates

**`src/hooks/use-portfolio-settings.ts`:**

- Add `color`, `target_positions`, and optional `target_pct` fields to `CategoryConfig`:

```text
CategoryConfig {
  key: string
  display_name: string
  color: string              // NEW - hex color
  target_positions: number   // NEW - category-level position target
  target_pct?: number        // NEW - allocation % for tier-less categories
  tiers: TierConfig[]
}
```

- Update `DEFAULT_SETTINGS` to include colors:
  - Core: `#1e40af`, Titan: `#166534`, Consensus: `#7e22ce`

- Update `getCategoryTargets()`: for categories with tiers, sum tier `allocation_pct`; for tier-less categories, use `target_pct`.

- Update migration function to add default colors/target_positions to legacy data.

- Define the color palette constant:
  `["#1e40af", "#166534", "#7e22ce", "#b45309", "#be123c", "#0f766e", "#c2410c", "#4338ca", "#a16207", "#64748b"]`

---

### 4. Settings Page Changes

**`src/pages/Settings.tsx`:**

- Rename card title from "Portfolio Tiers" to "Portfolio Categories and Tiers"

- Add color picker per category: a row of 10 small circular swatches (the preset hex colors) plus a hex text input. Selected swatch shows a checkmark.

- Add "Target Positions" number input per category.

- Add "Remove Category" button per category (disabled when only 1 remains). Confirmation dialog warns that positions will become unassigned.

- Add "Add Category" button below the category list. Creates a new category with auto-generated name, next unused color, one default tier (0%, 1 pos). Disabled at 10 categories.

- Allow removing all tiers from a category: when the last tier is removed (remove the `tiers.length <= 1` guard), show a single "Allocation %" input on the category itself instead of the tier table.

- Update the 100% validation to sum both tier `allocation_pct` values (from tiered categories) and category-level `target_pct` values (from tier-less categories).

---

### 5. Portfolio Page Color System

**`src/pages/Portfolio.tsx`:**

- Remove the `COLOR_PALETTE` and `UNASSIGNED_COLORS` constants and the `getCategoryColors()` function.

- Replace with a `getHexCategoryColors()` function that reads hex colors from settings and generates inline styles:
  - `bg`: hex color at 15% opacity (for light card backgrounds)
  - `bar`: full hex color (for progress bars)
  - `text`: hex color at full opacity (for labels)

- Update all places that reference `CATEGORY_COLORS[key]?.bg`, `.bar`, `.text` to use inline `style={}` instead of Tailwind class names.

- Keep "Unassigned" as a neutral gray style.

---

### 6. CategorySelector Updates

**`src/components/CategorySelector.tsx`:**

- Support tier-less categories in the dropdown: when a category has no tiers, show the category itself as a selectable option (assigning `category = cat.key, tier = null`).

- For tier-less categories, the "full" check uses `target_positions` from the category config instead of `max_positions` from a tier.

---

### Files Modified

| File | Changes |
|------|---------|
| Database migration | Convert `category` enum to varchar, drop old type |
| `src/hooks/use-portfolio-settings.ts` | Add `color`, `target_positions`, `target_pct` to CategoryConfig; update defaults, migration, getCategoryTargets |
| `src/pages/Settings.tsx` | Rename card, add color picker, add/remove category, tier-less allocation input, updated validation |
| `src/pages/Portfolio.tsx` | Replace Tailwind color palette with hex-based inline styles, update Category type |
| `src/components/CategorySelector.tsx` | Update Category type, support tier-less categories |

