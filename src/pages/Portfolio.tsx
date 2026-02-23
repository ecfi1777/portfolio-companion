import { useEffect, useState, useCallback, Fragment, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, TrendingUp, Hash, ChevronRight, Upload, ArrowUpDown, Tag, Banknote, ChevronDown, Check, AlertTriangle, Trash2, Calendar, RefreshCw, Clock, Settings } from "lucide-react";
import { UpdatePortfolioModal } from "@/components/UpdatePortfolioModal";
import { ManagePortfolioDialog } from "@/components/ManagePortfolioSection";
import { CategorySelector } from "@/components/CategorySelector";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePortfolioSettings, type PortfolioSettings, getCategoryTargets, getTierTarget, getCategoryForTier, buildTierOrder } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import type { Tables, Database } from "@/integrations/supabase/types";
import { fetchQuotes } from "@/lib/fmp-api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Position = Tables<"positions">;
type PortfolioSummary = Tables<"portfolio_summary">;
type Category = Database["public"]["Enums"]["position_category"] | null;
type Tier = string | null;

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

const COLOR_PALETTE = [
  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", bar: "bg-blue-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500" },
];
const UNASSIGNED_COLORS = { bg: "bg-muted", text: "text-muted-foreground", bar: "bg-muted-foreground/30" };

function getCategoryColors(settings: PortfolioSettings): Record<string, { bg: string; text: string; bar: string }> {
  const map: Record<string, { bg: string; text: string; bar: string }> = {};
  settings.categories.forEach((cat, i) => {
    map[cat.key] = COLOR_PALETTE[i % COLOR_PALETTE.length];
  });
  map["Unassigned"] = UNASSIGNED_COLORS;
  return map;
}

function getTierGoal(tier: Tier, settings: PortfolioSettings): number | null {
  return getTierTarget(tier, settings);
}

function getCapitalToGoal(
  weight: number,
  tier: Tier,
  currentValue: number,
  grandTotal: number,
  settings: PortfolioSettings
): { label: string; type: "below" | "at" | "above" } | null {
  if (!tier) return null;
  const goal = getTierGoal(tier, settings);
  if (goal == null) return null;

  const goalValue = (goal / 100) * grandTotal;
  const diff = goalValue - currentValue;
  const tolerance = goalValue * 0.02; // ±2% band

  if (Math.abs(diff) <= tolerance) return { label: "At goal", type: "at" };
  if (diff > 0) return { label: `↑ ${fmt(diff)}`, type: "below" };
  return { label: `↓ ${fmt(Math.abs(diff))}`, type: "above" };
}

function PositionDetailPanel({
  position,
  onUpdate,
  onDelete,
  onCategoryUpdate,
  tierCounts,
}: {
  position: Position;
  onUpdate: (updates: Partial<Position>) => void;
  onDelete: () => void;
  onCategoryUpdate: (cat: Category, tier: Tier) => void;
  tierCounts: Record<string, number>;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(position.notes ?? "");
  const [source, setSource] = useState(position.source ?? "");
  const [deleting, setDeleting] = useState(false);

  const saveField = async (field: "notes" | "source", value: string) => {
    const update: Record<string, string | null> = { [field]: value || null };
    const { error } = await supabase
      .from("positions")
      .update(update)
      .eq("id", position.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      onUpdate({ [field]: value || null });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("positions").delete().eq("id", position.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setDeleting(false);
    } else {
      onDelete();
    }
  };

  const firstSeen = position.first_seen_at;

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Metadata */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>
          {firstSeen
            ? `Tracked since ${format(new Date(firstSeen), "MMM d, yyyy")}`
            : "—"}
        </span>
      </div>

      {/* Editable fields */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (position.notes ?? "")) saveField("notes", notes);
            }}
            placeholder="Add a note..."
            className="min-h-[60px] text-sm resize-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Source</label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => {
              if (source !== (position.source ?? "")) saveField("source", source);
            }}
            placeholder="Where did you find this pick?"
            className="text-sm"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reclassify:</span>
          <CategorySelector
            positionId={position.id}
            category={position.category}
            tier={position.tier}
            onUpdate={onCategoryUpdate}
            tierCounts={tierCounts}
          />
        </div>
        <div className="ml-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {position.symbol} from portfolio?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. This position may reappear if it's still in your brokerage data on the next import.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Removing..." : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("current_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deployOpen, setDeployOpen] = useState(false);
  const { settings, loading: settingsLoading, refetch: refetchSettings } = usePortfolioSettings();
  const fmpApiKey = settings.fmp_api_key;
  const [refreshing, setRefreshing] = useState(false);

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

  const CATEGORY_COLORS = useMemo(() => getCategoryColors(settings), [settings]);
  const tierOrder = useMemo(() => buildTierOrder(settings), [settings]);
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of stockPositions) {
      if (p.tier) counts[p.tier] = (counts[p.tier] ?? 0) + 1;
    }
    return counts;
  }, [stockPositions]);

  // Category breakdown — driven by settings
  const categoryBreakdown = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const cat of settings.categories) groups[cat.key] = 0;
    groups["Unassigned"] = 0;
    for (const p of stockPositions) {
      const key = p.category ?? "Unassigned";
      groups[key] = (groups[key] ?? 0) + (p.current_value ?? 0);
    }
    const catTargets = getCategoryTargets(settings);
    return Object.entries(groups).map(([key, value]) => {
      const catConfig = settings.categories.find((c) => c.key === key);
      return {
        name: catConfig?.display_name ?? key,
        key,
        value,
        pct: totalEquity > 0 ? (value / totalEquity) * 100 : 0,
        target: key !== "Unassigned" ? (catTargets[key] ?? 0) : 0,
      };
    });
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
      .sort((a, b) => (tierOrder[a!.tier] ?? 99) - (tierOrder[b!.tier] ?? 99)) as {
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

  // Staleness
  const latestPriceUpdate = useMemo(() => {
    const dates = positions
      .map((p) => p.last_price_update)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }, [positions]);
  const isPriceStale = latestPriceUpdate ? Date.now() - latestPriceUpdate.getTime() > 24 * 60 * 60 * 1000 : false;

  if (loading || settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading portfolio...</p>
      </div>
    );
  }

  // Portfolio price refresh
  const handleRefreshPrices = async () => {
    if (!fmpApiKey || !user) return;
    setRefreshing(true);
    const symbols = stockPositions.map((p) => p.symbol);
    const quotes = await fetchQuotes(symbols, fmpApiKey);
    if (quotes.length > 0) {
      const now = new Date().toISOString();
      for (const q of quotes) {
        const pos = positions.find((p) => p.symbol === q.symbol);
        if (!pos) continue;
        const newValue = (pos.shares ?? 0) * q.price;
        await supabase
          .from("positions")
          .update({
            current_price: q.price,
            current_value: newValue,
            last_price_update: now,
          })
          .eq("id", pos.id);
      }
      setPositions((prev) =>
        prev.map((p) => {
          const q = quotes.find((qq) => qq.symbol === p.symbol);
          if (!q) return p;
          return { ...p, current_price: q.price, current_value: (p.shares ?? 0) * q.price, last_price_update: now };
        })
      );
      toast({ title: "Prices updated", description: `Updated ${quotes.length} positions.` });
    }
    setRefreshing(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Portfolio</h1>
          {latestPriceUpdate && (
            <span className={`flex items-center gap-1 text-xs ${isPriceStale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {isPriceStale && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              Prices as of {latestPriceUpdate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={handleRefreshPrices}
                  disabled={!fmpApiKey || refreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh Prices
                </Button>
              </TooltipTrigger>
              {!fmpApiKey && <TooltipContent>Set your FMP API key in Settings</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          <Button onClick={() => setModalOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Update Portfolio
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <Settings className="mr-1.5 h-4 w-4" />
            Manage
          </Button>
        </div>
      </div>

      <UpdatePortfolioModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={fetchData} />
      <ManagePortfolioDialog open={manageOpen} onOpenChange={setManageOpen} />

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
                  key={c.key}
                  className={`${CATEGORY_COLORS[c.key]?.bar ?? "bg-muted"} transition-all`}
                  style={{ width: `${c.pct}%` }}
                />
              ))}
            </div>
            {/* Legend with targets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoryBreakdown.map((c) => (
                <div key={c.key} className={`rounded-md px-3 py-2 ${CATEGORY_COLORS[c.key]?.bg ?? "bg-muted"}`}>
                  <p className={`text-xs font-medium ${CATEGORY_COLORS[c.key]?.text ?? "text-muted-foreground"}`}>{c.name}</p>
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
                        className={`h-full rounded-full ${CATEGORY_COLORS[c.key]?.bar ?? "bg-muted"} opacity-60 transition-all`}
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
                  <SortableHead label="Portfolio Weight" sortKeyName="weight" className="text-right" />
                  <TableHead className="text-right">Category Goal</TableHead>
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
                          ) : capitalToGoal.type === "above" ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              {capitalToGoal.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              {capitalToGoal.label}
                            </span>
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
                              onTierSettingsChanged={refetchSettings}
                              tierCounts={tierCounts}
                              portfolioTotal={grandTotal}
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
                      {isExpanded && !isCash && (
                        <TableRow className="bg-muted/10 border-t border-border/50">
                          <TableCell colSpan={12} className="p-0">
                            <PositionDetailPanel
                              position={p}
                              onUpdate={(updates) => {
                                setPositions((prev) =>
                                  prev.map((pos) => (pos.id === p.id ? { ...pos, ...updates } : pos))
                                );
                              }}
                              onDelete={() => {
                                setPositions((prev) => prev.filter((pos) => pos.id !== p.id));
                                setExpandedId(null);
                                toast({ title: `${p.symbol} removed from portfolio` });
                              }}
                              onCategoryUpdate={(cat, tier) => handleCategoryUpdate(p.id, cat, tier)}
                              tierCounts={tierCounts}
                            />
                          </TableCell>
                        </TableRow>
                      )}
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
                          {(() => {
                            const cat = getCategoryForTier(item.tier, settings);
                            const colors = cat ? CATEGORY_COLORS[cat.key] : null;
                            return (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${colors?.bg ?? ""} ${colors?.text ?? ""}`}>
                                {item.tier}
                              </span>
                            );
                          })()}
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
