

## Clarify the "Progress" Percentage on Category Cards

**Problem:** The "Current" row displays something like `$72,903 (82.33%)` -- the percentage represents how far along the category is toward its target allocation, but it reads as if it's a portfolio share (which would conflict with the target of 50%).

**Solution:** Replace the single ambiguous percentage with two clearer data points:

### Proposed Card Layout

```text
Current     $72,903 — 41.17% of portfolio
Target      $75,857 — 50.00% of portfolio  [pencil]
Progress    82.33% of target
Delta       ▼ $2,954 under
Positions   6 / 10
```

### Changes

**Row 1 -- "Current":** Show the dollar value and the category's *actual portfolio share* (i.e., `c.value / totalEquity * 100`). Label it clearly: `$72,903 -- 41.17% of portfolio`.

**Row 2 -- "Target":** Already shows the target percentage; append "of portfolio" for consistency.

**Row 3 -- New "Progress" row:** Add a dedicated row showing the progress percentage (`currentValue / targetValue * 100`), labeled "Progress" on the left and `82.33% of target` on the right. This isolates the "how far along" metric from the portfolio share.

Alternatively, if an extra row feels too crowded, the progress percentage could be shown as a small progress bar under the card header, making it instantly visual rather than numerical.

### Technical Details

- In `src/pages/Portfolio.tsx`, around lines 1087-1155 (the card rendering block):
  - Compute `progressPct = c.target > 0 ? (c.pct / c.target) * 100 : 0`
  - Update the "Current" row to show `{fmt(c.value)} -- {fmtPct(c.pct)} of portfolio`
  - Update the "Target" row similarly
  - Insert a new "Progress" row between Target and Delta showing `{fmtPct(progressPct)} of target`
  - Optionally add a thin `<Progress>` bar (already available in `ui/progress.tsx`) below the header for a quick visual read

- No database or backend changes required -- purely a display change.
