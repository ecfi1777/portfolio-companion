import { useEffect, useState, useCallback, Fragment, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, Hash, ChevronRight, Upload, ArrowUpDown, Tag, Banknote, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { UpdatePortfolioModal } from "@/components/UpdatePortfolioModal";
import { CategorySelector } from "@/components/CategorySelector";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePortfolioSettings, type PortfolioSettings } from "@/hooks/use-portfolio-settings";
import type { Tables, Database } from "@/integrations/supabase/types";

type Position = Tables<"positions">;
type PortfolioSummary = Tables<"portfolio_summary">;
type Category = Database["public"]["Enums"]["position_category"] | null;
type Tier = Database["public"]["Enums"]["position_tier"] | null;

interface AccountBreakdown {
  account: string;
  shares: number;
  value: number;
}

const fmt = (n: number | null) =>
  n != null
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const fmtShares = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

const fmtPct = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

function getAccountBreakdowns(account: unknown): AccountBreakdown[] {
  if (!account) return [];
  if (Array.isArray(account)) return account as AccountBreakdown[];
  return [];
}

type SortKey = "symbol" | "current_value" | "gainLossDollar" | "gainLossPct" | "weight" | "category";
type SortDir = "asc" | "desc";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  CORE: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", bar: "bg-blue-500" },
  TITAN: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  CONSENSUS: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500" },
  Unassigned: { bg: "bg-muted", text: "text-muted-foreground", bar: "bg-muted-foreground/30" },
};

const TIER_ORDER: Record<string, number> = { C1: 0, C2: 1, C3: 2, TT: 3, CON: 4 };

function getTierGoal(tier: Tier, settings: PortfolioSettings): number | null {
  if (!tier) return null;
  if (tier === "CON") return settings.tier_goals.CON_MIN;
  return settings.tier_goals[tier] ?? null;
}

function getCapitalToGoal(
  weight: number,
  tier: Tier,
  currentValue: number,
  grandTotal: number,
  settings: PortfolioSettings
): { label: string; type: "below" | "at" | "above_cap" } | null {
  if (!tier) return null;
  const goal = getTierGoal(tier, settings);
  if (goal == null) return null;

  if (tier === "CON" && weight > settings.tier_goals.CON_MAX) {
    return { label: `Above ${settings.tier_goals.CON_MAX}% cap`, type: "above_cap" };
  }

  const goalValue = (goal / 100) * grandTotal;
  const diff = goalValue - currentValue;
  if (diff <= 0) return { label: "At goal", type: "at" };
  return { label: `${fmt(diff)} to goal`, type: "below" };
}

export default function Portfolio() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deployOpen, setDeployOpen] = useState(false);
  const { settings, loading: settingsLoading } = usePortfolioSettings();

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [posRes, sumRes] = await Promise.all([
      supabase.from("positions").select("*"),
      supabase.from("portfolio_summary").select("*").maybeSingle(),
    ]);
    if (posRes.data) setPositions(posRes.data);
    if (sumRes.data) setSummary(sumRes.data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived calculations
  const stockPositions = positions.filter((p) => p.symbol !== "CASH");
  const cashPosition = positions.find((p) => p.symbol === "CASH");
  const totalEquity = stockPositions.reduce((sum, p) => sum + (p.current_value ?? 0), 0);
  const totalCostBasis = stockPositions.reduce((sum, p) => sum + (p.cost_basis ?? 0), 0);
  const cashBalance = cashPosition?.current_value ?? summary?.cash_balance ?? 0;
  const grandTotal = totalEquity + cashBalance;
  const totalGainLoss = totalEquity - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const assignedCount = stockPositions.filter((p) => p.category != null).length;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const groups: Record<string, number> = { CORE: 0, TITAN: 0, CONSENSUS: 0, Unassigned: 0 };
    for (const p of stockPositions) {
      const key = p.category ?? "Unassigned";
      groups[key] = (groups[key] ?? 0) + (p.current_value ?? 0);
    }
    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
      pct: totalEquity > 0 ? (value / totalEquity) * 100 : 0,
      target: name !== "Unassigned" ? (settings.category_targets as Record<string, number>)[name] ?? 0 : 0,
    }));
  }, [stockPositions, totalEquity, settings]);

  // Deploy capital data
  const deployCapitalList = useMemo(() => {
    if (cashBalance <= 0 || grandTotal <= 0) return [];
    return stockPositions
      .filter((p) => p.tier != null)
      .map((p) => {
        const weight = ((p.current_value ?? 0) / grandTotal) * 100;
        const goal = getTierGoal(p.tier, settings);
        if (goal == null) return null;
        const goalValue = (goal / 100) * grandTotal;
        const diff = goalValue - (p.current_value ?? 0);
        if (diff <= 0) return null;
        return {
          symbol: p.symbol,
          tier: p.tier!,
          weight,
          goal,
          toGoal: diff,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (TIER_ORDER[a!.tier] ?? 99) - (TIER_ORDER[b!.tier] ?? 99)) as {
      symbol: string; tier: string; weight: number; goal: number; toGoal: number;
    }[];
  }, [stockPositions, cashBalance, grandTotal, settings]);

  // Sorting
  const sortedPositions = useMemo(() => {
    const arr = [...positions];
    arr.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sortKey) {
        case "symbol":
          aVal = a.symbol; bVal = b.symbol;
          return sortDir === "asc" ? (aVal as string).localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string);
        case "current_value":
          aVal = a.current_value ?? 0; bVal = b.current_value ?? 0; break;
        case "gainLossDollar":
          aVal = (a.current_value ?? 0) - (a.cost_basis ?? 0);
          bVal = (b.current_value ?? 0) - (b.cost_basis ?? 0); break;
        case "gainLossPct":
          aVal = (a.cost_basis ?? 0) > 0 ? ((a.current_value ?? 0) - (a.cost_basis ?? 0)) / (a.cost_basis ?? 1) : 0;
          bVal = (b.cost_basis ?? 0) > 0 ? ((b.current_value ?? 0) - (b.cost_basis ?? 0)) / (b.cost_basis ?? 1) : 0; break;
        case "weight":
          aVal = grandTotal > 0 ? (a.current_value ?? 0) / grandTotal : 0;
          bVal = grandTotal > 0 ? (b.current_value ?? 0) / grandTotal : 0; break;
        case "category":
          aVal = a.category ?? "zzz"; bVal = b.category ?? "zzz";
          return sortDir === "asc" ? (aVal as string).localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return arr;
  }, [positions, sortKey, sortDir, grandTotal]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "category" ? "asc" : "desc");
    }
  };

  const handleCategoryUpdate = (id: string, category: Category, tier: Tier) => {
    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, category, tier } : p))
    );
  };

  const SortableHead = ({ label, sortKeyName, className = "" }: { label: string; sortKeyName: SortKey; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => toggleSort(sortKeyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyName ? "text-foreground" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  if (loading || settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Update Portfolio
        </Button>
      </div>

      <UpdatePortfolioModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={fetchData} />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(grandTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(cashBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gain/Loss</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {fmt(totalGainLoss)}
            </div>
            <p className={`text-xs ${totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {totalGainLoss >= 0 ? "+" : ""}{fmtPct(totalGainLossPct)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categorized</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedCount} <span className="text-base font-normal text-muted-foreground">of {stockPositions.length}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Category Allocation Overview */}
      {positions.length > 0 && (
        <Card>
          <CardContent className="py-4">
            {/* Stacked bar */}
            <div className="flex h-3 w-full rounded-full overflow-hidden mb-4">
              {categoryBreakdown.filter((c) => c.value > 0).map((c) => (
                <div
                  key={c.name}
                  className={`${CATEGORY_COLORS[c.name]?.bar ?? "bg-muted"} transition-all`}
                  style={{ width: `${c.pct}%` }}
                />
              ))}
            </div>
            {/* Legend with targets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoryBreakdown.map((c) => (
                <div key={c.name} className={`rounded-md px-3 py-2 ${CATEGORY_COLORS[c.name]?.bg ?? "bg-muted"}`}>
                  <p className={`text-xs font-medium ${CATEGORY_COLORS[c.name]?.text ?? "text-muted-foreground"}`}>{c.name}</p>
                  <p className="text-sm font-bold">{fmt(c.value)}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{fmtPct(c.pct)}</span>
                    {c.target > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground/50">/</span>
                        <span className="text-xs text-muted-foreground">{fmtPct(c.target)} target</span>
                      </>
                    )}
                  </div>
                  {c.target > 0 && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-muted-foreground/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${CATEGORY_COLORS[c.name]?.bar ?? "bg-muted"} opacity-60 transition-all`}
                        style={{ width: `${Math.min((c.pct / c.target) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      {positions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No positions yet. Import a Fidelity CSV to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <SortableHead label="Symbol" sortKeyName="symbol" />
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <SortableHead label="Value" sortKeyName="current_value" className="text-right" />
                  <TableHead className="text-right">Cost Basis</TableHead>
                  <SortableHead label="G/L ($)" sortKeyName="gainLossDollar" className="text-right" />
                  <SortableHead label="G/L (%)" sortKeyName="gainLossPct" className="text-right" />
                  <SortableHead label="Weight" sortKeyName="weight" className="text-right" />
                  <TableHead className="text-right">To Goal</TableHead>
                  <SortableHead label="Category" sortKeyName="category" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPositions.map((p) => {
                  const accounts = getAccountBreakdowns(p.account);
                  const isExpanded = expandedId === p.id;
                  const hasAccounts = accounts.length > 0;
                  const isCash = p.symbol === "CASH";
                  const gl = isCash ? 0 : (p.current_value ?? 0) - (p.cost_basis ?? 0);
                  const glPct = isCash ? 0 : (p.cost_basis ?? 0) > 0 ? (gl / (p.cost_basis ?? 1)) * 100 : 0;
                  const weight = grandTotal > 0 ? ((p.current_value ?? 0) / grandTotal) * 100 : 0;
                  const glColor = isCash ? "text-muted-foreground" : gl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
                  const tierGoal = getTierGoal(p.tier, settings);
                  const capitalToGoal = isCash ? null : getCapitalToGoal(weight, p.tier, p.current_value ?? 0, grandTotal, settings);

                  return (
                    <Fragment key={p.id}>
                      <TableRow
                        className={`${hasAccounts ? "cursor-pointer hover:bg-muted/50" : ""} ${isCash ? "bg-muted/30 border-dashed" : ""}`}
                        onClick={() => hasAccounts && setExpandedId(isExpanded ? null : p.id)}
                      >
                        <TableCell className="w-8 px-2">
                          {hasAccounts && (
                            <ChevronRight
                              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {isCash && <Banknote className="h-4 w-4 text-muted-foreground" />}
                            {p.symbol}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.company_name ?? "—"}</TableCell>
                        <TableCell className="text-right">{isCash ? fmt(p.shares) : fmtShares(p.shares)}</TableCell>
                        <TableCell className="text-right">{isCash ? "—" : fmt(p.current_price)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(p.current_value)}</TableCell>
                        <TableCell className="text-right">{isCash ? "—" : fmt(p.cost_basis)}</TableCell>
                        <TableCell className={`text-right font-medium ${glColor}`}>
                          {isCash ? "$0.00" : `${gl >= 0 ? "+" : ""}${fmt(gl)}`}
                        </TableCell>
                        <TableCell className={`text-right ${glColor}`}>
                          {isCash ? "0.00%" : `${gl >= 0 ? "+" : ""}${fmtPct(glPct)}`}
                        </TableCell>
                        {/* Weight + progress bar */}
                        <TableCell className="text-right">
                          <span className="text-muted-foreground">{fmtPct(weight)}</span>
                          {tierGoal != null && !isCash && (
                            <div className="mt-1 h-1 w-full min-w-[48px] rounded-full bg-muted-foreground/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  CATEGORY_COLORS[p.category ?? ""]?.bar ?? "bg-primary"
                                } opacity-70`}
                                style={{ width: `${Math.min((weight / tierGoal) * 100, 100)}%` }}
                              />
                            </div>
                          )}
                        </TableCell>
                        {/* Capital to Goal */}
                        <TableCell className="text-right text-xs whitespace-nowrap">
                          {isCash ? "" : capitalToGoal == null ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : capitalToGoal.type === "at" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3 w-3" /> At goal
                            </span>
                          ) : capitalToGoal.type === "above_cap" ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Consider trimming or reclassifying to Core">
                              <AlertTriangle className="h-3 w-3" /> {capitalToGoal.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{capitalToGoal.label}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isCash ? (
                            <span className="text-xs text-muted-foreground/50 px-2">—</span>
                          ) : (
                            <CategorySelector
                              positionId={p.id}
                              category={p.category}
                              tier={p.tier}
                              onUpdate={(cat, tier) => handleCategoryUpdate(p.id, cat, tier)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && accounts.map((acct, i) => (
                        <TableRow key={`${p.id}-acct-${i}`} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-sm text-muted-foreground pl-4">↳ {acct.account}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{isCash ? fmt(acct.shares) : fmtShares(acct.shares)}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{fmt(acct.value)}</TableCell>
                          <TableCell colSpan={6}></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Deploy Capital Guide */}
      {cashBalance > 0 && deployCapitalList.length > 0 && (
        <Collapsible open={deployOpen} onOpenChange={setDeployOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Deploy Capital
                    <span className="text-sm font-normal text-muted-foreground">
                      — {fmt(cashBalance)} available
                    </span>
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${deployOpen ? "rotate-180" : ""}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Goal</TableHead>
                      <TableHead className="text-right">To Goal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployCapitalList.map((item) => (
                      <TableRow key={item.symbol}>
                        <TableCell className="font-medium">{item.symbol}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            CATEGORY_COLORS[item.tier.startsWith("C") ? "CORE" : item.tier === "TT" ? "TITAN" : "CONSENSUS"]?.bg ?? ""
                          } ${
                            CATEGORY_COLORS[item.tier.startsWith("C") ? "CORE" : item.tier === "TT" ? "TITAN" : "CONSENSUS"]?.text ?? ""
                          }`}>
                            {item.tier}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtPct(item.weight)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtPct(item.goal)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(item.toGoal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
