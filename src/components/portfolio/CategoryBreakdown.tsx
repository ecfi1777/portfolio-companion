import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, Pencil } from "lucide-react";
import { fmt, fmtPct } from "@/lib/portfolio-utils";
import type { PortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";

interface CategoryBreakdownItem {
  name: string;
  key: string;
  value: number;
  count: number;
  pct: number;
  target: number;
  targetPositions: number;
  isUnassigned: boolean;
}

interface CategoryBreakdownProps {
  categoryBreakdown: CategoryBreakdownItem[];
  cashBalance: number;
  grandTotal: number;
  totalEquity: number;
  settings: PortfolioSettings;
  CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string }>;
  onSettingsUpdate: (settings: PortfolioSettings) => Promise<void>;
}

export function CategoryBreakdown({
  categoryBreakdown,
  cashBalance,
  grandTotal,
  totalEquity,
  settings,
  CATEGORY_COLORS,
  onSettingsUpdate,
}: CategoryBreakdownProps) {
  const { toast } = useToast();
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState("");

  const handleStartCategoryTargetEdit = (categoryKey: string, currentTarget: number) => {
    setEditingCategoryKey(categoryKey);
    setTargetDraft(currentTarget.toFixed(2));
  };

  const handleSaveCategoryTarget = async (categoryKey: string) => {
    const parsed = Number(targetDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast({ title: "Invalid target", description: "Enter a percentage between 0 and 100.", variant: "destructive" });
      setEditingCategoryKey(null);
      setTargetDraft("");
      return;
    }

    const nextTarget = Number(parsed.toFixed(2));
    const nextCategories = settings.categories.map((cat) => {
      if (cat.key !== categoryKey) return cat;

      if (cat.tiers.length === 0) {
        return { ...cat, target_pct: nextTarget };
      }

      const currentTotal = cat.tiers.reduce((sum, t) => sum + t.allocation_pct, 0);
      if (currentTotal <= 0) {
        const base = Number((nextTarget / cat.tiers.length).toFixed(2));
        let allocated = 0;
        const tiers = cat.tiers.map((tier, idx) => {
          if (idx === cat.tiers.length - 1) {
            return { ...tier, allocation_pct: Number((nextTarget - allocated).toFixed(2)) };
          }
          allocated += base;
          return { ...tier, allocation_pct: base };
        });
        return { ...cat, tiers };
      }

      let running = 0;
      const tiers = cat.tiers.map((tier, idx) => {
        if (idx === cat.tiers.length - 1) {
          return { ...tier, allocation_pct: Number((nextTarget - running).toFixed(2)) };
        }
        const scaled = Number(((tier.allocation_pct / currentTotal) * nextTarget).toFixed(2));
        running += scaled;
        return { ...tier, allocation_pct: scaled };
      });
      return { ...cat, tiers };
    });

    await onSettingsUpdate({ ...settings, categories: nextCategories });
    setEditingCategoryKey(null);
    setTargetDraft("");
  };

  const investedPct = grandTotal > 0 ? (totalEquity / grandTotal) * 100 : 0;
  const cashPct = grandTotal > 0 ? (cashBalance / grandTotal) * 100 : 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Category Allocation Overview</h3>
          <Popover>
            <PopoverTrigger asChild>
              <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="How Portfolio Categories Work">
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-4" align="end">
              <div className="space-y-3 text-sm">
                <h4 className="font-semibold">How Portfolio Categories Work</h4>
                <p className="text-muted-foreground">
                  Organize your positions into custom categories to define your ideal portfolio allocation. Each category has a target percentage of your total portfolio and a maximum number of positions.
                </p>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>Set up categories and tiers in Settings — you can have 1 to 10 categories, each with optional sub-tiers for finer control.</li>
                  <li>Assign each position to a category using the dropdown in the Category column.</li>
                  <li>The Allocation Target column shows how far each position is from its per-position target.</li>
                  <li>The category cards above show your overall progress toward each category's target allocation.</li>
                  <li>The Rebalance Capital section tells you what to buy and trim to reach your targets.</li>
                </ul>
                <p className="text-muted-foreground">
                  All category assignments, tags, and notes are preserved when you update your portfolio with new CSV data.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Stacked bar — invested categories + cash */}
        <div className="flex h-3 w-full rounded-full overflow-hidden">
          {categoryBreakdown.filter((c) => c.value > 0).map((c) => {
            const widthOfGrand = grandTotal > 0 ? (c.value / grandTotal) * 100 : 0;
            return (
              <div
                key={c.key}
                className="transition-all"
                style={{ width: `${widthOfGrand}%`, backgroundColor: CATEGORY_COLORS[c.key]?.bar ?? "rgba(100,116,139,0.3)" }}
              />
            );
          })}
          {cashPct > 0 && (
            <div
              className="transition-all"
              style={{
                width: `${cashPct}%`,
                background: "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(100,116,139,0.15) 2px, rgba(100,116,139,0.15) 4px)",
                backgroundColor: "rgba(100,116,139,0.08)",
              }}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5 mb-4">
          <span className="text-xs text-muted-foreground">
            Invested: {fmt(totalEquity)} ({fmtPct(investedPct)})
          </span>
          <span className="text-xs text-muted-foreground">
            Available: {fmt(cashBalance)} ({fmtPct(cashPct)})
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categoryBreakdown.map((c) => {
            const targetValue = (c.target / 100) * grandTotal;
            const deltaDollar = targetValue - c.value;
            const tolerance = targetValue * 0.02;
            const isOnTarget = !c.isUnassigned && Math.abs(deltaDollar) <= tolerance;
            const isUnder = !c.isUnassigned && deltaDollar > tolerance;
            const isEditingTarget = editingCategoryKey === c.key;

            return (
              <div
                key={c.key}
                className="rounded-md border border-border/60 px-3 py-3"
                style={{ backgroundColor: CATEGORY_COLORS[c.key]?.bg ?? "rgba(100,116,139,0.1)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[c.key]?.bar ?? "rgba(100,116,139,0.5)" }}
                  />
                  <p className="text-sm font-semibold" style={{ color: CATEGORY_COLORS[c.key]?.text ?? "inherit" }}>{c.name}</p>
                </div>

                <div className="mt-3 divide-y divide-border">
                  <div className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-muted-foreground">Current</span>
                    <span className="font-medium text-foreground text-right tabular-nums">{fmt(c.value)} — {fmtPct(c.pct)} of portfolio</span>
                  </div>

                  <div className="group/target flex items-center justify-between py-1.5 text-xs">
                    <span className="text-muted-foreground">Target</span>
                    {c.isUnassigned ? (
                      <span className="font-medium text-muted-foreground text-right">—</span>
                    ) : isEditingTarget ? (
                      <div className="flex items-center gap-1 justify-end">
                        <Input
                          value={targetDraft}
                          onChange={(e) => setTargetDraft(e.target.value)}
                          onBlur={() => handleSaveCategoryTarget(c.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveCategoryTarget(c.key);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingCategoryKey(null);
                              setTargetDraft("");
                            }
                          }}
                          className="h-6 w-16 px-2 text-xs"
                          autoFocus
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="relative inline-flex items-center font-medium text-foreground text-right tabular-nums"
                        onClick={() => handleStartCategoryTargetEdit(c.key, c.target)}
                      >
                        <span>{fmt(targetValue)} — {fmtPct(c.target)} of portfolio</span>
                        <Pencil className="absolute -right-4 h-3 w-3 opacity-0 transition-opacity group-hover/target:opacity-100" />
                      </button>
                    )}
                  </div>

                  {!c.isUnassigned && (
                    <div className="flex items-center justify-between py-1.5 text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-foreground text-right tabular-nums">
                        {fmtPct(c.target > 0 ? (c.pct / c.target) * 100 : 0)} of target
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-muted-foreground">Delta</span>
                    <span className="text-right tabular-nums">
                    {c.isUnassigned ? (
                      <span className="text-muted-foreground">No target</span>
                    ) : isOnTarget ? (
                      <span className="text-muted-foreground">On target</span>
                    ) : isUnder ? (
                      <span className="text-emerald-600 dark:text-emerald-400">▼ {fmt(Math.abs(deltaDollar))} under</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">▲ {fmt(Math.abs(deltaDollar))} over</span>
                    )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-muted-foreground">Positions</span>
                    <span className="font-medium text-foreground text-right tabular-nums">
                    {c.isUnassigned ? (
                      <>{c.count} unassigned</>
                    ) : (
                      <>{c.count} / {c.targetPositions} positions</>
                    )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
