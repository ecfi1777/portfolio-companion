import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Upload, RefreshCw, Clock, Settings, AlertTriangle } from "lucide-react";
import { UpdatePortfolioModal } from "@/components/UpdatePortfolioModal";
import { ManagePortfolioDialog } from "@/components/ManagePortfolioSection";
import { usePortfolioSettings, type PortfolioSettings, getCategoryTargets, buildTierOrder } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { fetchProfilesBatched } from "@/lib/fmp-api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getHexCategoryColors, getPositionGoal } from "@/lib/portfolio-utils";

import { PortfolioSummaryCards } from "@/components/portfolio/PortfolioSummaryCards";
import { CategoryBreakdown } from "@/components/portfolio/CategoryBreakdown";
import { RebalanceCapital } from "@/components/portfolio/RebalanceCapital";
import { PortfolioTable } from "@/components/portfolio/PortfolioTable";

type Position = Tables<"positions">;
type PortfolioSummary = Tables<"portfolio_summary">;
type TagRow = Tables<"tags">;
type Category = string | null;
type Tier = string | null;
type SortKey = "symbol" | "current_value" | "gainLossDollar" | "gainLossPct" | "weight" | "category";
type SortDir = "asc" | "desc";

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
  const [deployOpen, setDeployOpen] = useState(true);
  const { settings, loading: settingsLoading, refetch: refetchSettings, updateSettings } = usePortfolioSettings();
  const fmpApiKey = settings.fmp_api_key;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoRefreshed, setAutoRefreshed] = useState(false);

  // Tag state
  const [allTags, setAllTags] = useState<TagRow[]>([]);
  const [positionTagMap, setPositionTagMap] = useState<Record<string, string[]>>({});
  const syncedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [posRes, sumRes, tagsRes, ptRes] = await Promise.all([
      supabase.from("positions").select("*"),
      supabase.from("portfolio_summary").select("*").maybeSingle(),
      supabase.from("tags").select("*"),
      supabase.from("position_tags").select("position_id, tag_id"),
    ]);
    if (posRes.data) setPositions(posRes.data);
    if (sumRes.data) setSummary(sumRes.data);
    if (tagsRes.data) setAllTags(tagsRes.data);
    if (ptRes.data) {
      const map: Record<string, string[]> = {};
      for (const row of ptRes.data) {
        if (!map[row.position_id]) map[row.position_id] = [];
        map[row.position_id].push(row.tag_id);
      }
      setPositionTagMap(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-sync tags from watchlist (runs once after data loads)
  useEffect(() => {
    if (loading || syncedRef.current || !user || positions.length === 0) return;
    syncedRef.current = true;

    (async () => {
      const [wlRes, wlTagsRes] = await Promise.all([
        supabase.from("watchlist_entries").select("id, symbol"),
        supabase.from("watchlist_entry_tags").select("watchlist_entry_id, tag_id"),
      ]);
      if (!wlRes.data || !wlTagsRes.data) return;

      const wlTagsByEntryId: Record<string, string[]> = {};
      for (const row of wlTagsRes.data) {
        if (!wlTagsByEntryId[row.watchlist_entry_id]) wlTagsByEntryId[row.watchlist_entry_id] = [];
        wlTagsByEntryId[row.watchlist_entry_id].push(row.tag_id);
      }

      const symbolToWlTags: Record<string, string[]> = {};
      for (const entry of wlRes.data) {
        const tags = wlTagsByEntryId[entry.id];
        if (tags?.length) symbolToWlTags[entry.symbol.toUpperCase()] = tags;
      }

      const toInsert: { position_id: string; tag_id: string }[] = [];

      for (const pos of positions) {
        const wlTags = symbolToWlTags[pos.symbol.toUpperCase()];
        if (!wlTags?.length) continue;

        const existingTagIds = new Set(positionTagMap[pos.id] || []);
        const removedTagIds = new Set<string>(
          Array.isArray(pos.removed_tag_ids) ? (pos.removed_tag_ids as string[]) : []
        );

        for (const tagId of wlTags) {
          if (!existingTagIds.has(tagId) && !removedTagIds.has(tagId)) {
            toInsert.push({ position_id: pos.id, tag_id: tagId });
          }
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("position_tags").insert(toInsert);
        if (!error) {
          setPositionTagMap((prev) => {
            const next = { ...prev };
            for (const row of toInsert) {
              if (!next[row.position_id]) next[row.position_id] = [];
              next[row.position_id] = [...next[row.position_id], row.tag_id];
            }
            return next;
          });
        }
      }
    })();
  }, [loading, user, positions, positionTagMap]);

  // Tag helpers
  const getTagsForPosition = useCallback(
    (positionId: string): TagRow[] => {
      const tagIds = positionTagMap[positionId] || [];
      return tagIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean) as TagRow[];
    },
    [positionTagMap, allTags]
  );

  const handleAddTag = useCallback(
    async (positionId: string, tagId: string) => {
      const { error } = await supabase.from("position_tags").insert({ position_id: positionId, tag_id: tagId });
      if (error) {
        toast({ title: "Failed to add tag", description: error.message, variant: "destructive" });
        return;
      }
      const pos = positions.find((p) => p.id === positionId);
      const removedIds = Array.isArray(pos?.removed_tag_ids) ? (pos.removed_tag_ids as string[]) : [];
      if (removedIds.includes(tagId)) {
        const newRemoved = removedIds.filter((id) => id !== tagId);
        await supabase.from("positions").update({ removed_tag_ids: newRemoved }).eq("id", positionId);
        setPositions((prev) =>
          prev.map((p) => (p.id === positionId ? { ...p, removed_tag_ids: newRemoved } : p))
        );
      }
      setPositionTagMap((prev) => ({
        ...prev,
        [positionId]: [...(prev[positionId] || []), tagId],
      }));
    },
    [positions, toast]
  );

  const handleRemoveTag = useCallback(
    async (positionId: string, tagId: string) => {
      const { error } = await supabase.from("position_tags").delete().eq("position_id", positionId).eq("tag_id", tagId);
      if (error) {
        toast({ title: "Failed to remove tag", description: error.message, variant: "destructive" });
        return;
      }
      const pos = positions.find((p) => p.id === positionId);
      const removedIds = Array.isArray(pos?.removed_tag_ids) ? (pos.removed_tag_ids as string[]) : [];
      if (!removedIds.includes(tagId)) {
        const newRemoved = [...removedIds, tagId];
        await supabase.from("positions").update({ removed_tag_ids: newRemoved }).eq("id", positionId);
        setPositions((prev) =>
          prev.map((p) => (p.id === positionId ? { ...p, removed_tag_ids: newRemoved } : p))
        );
      }
      setPositionTagMap((prev) => ({
        ...prev,
        [positionId]: (prev[positionId] || []).filter((id) => id !== tagId),
      }));
    },
    [positions, toast]
  );

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

  const CATEGORY_COLORS = useMemo(() => getHexCategoryColors(settings), [settings]);
  const tierOrder = useMemo(() => buildTierOrder(settings), [settings]);
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of stockPositions) {
      if (p.tier) counts[p.tier] = (counts[p.tier] ?? 0) + 1;
    }
    return counts;
  }, [stockPositions]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of stockPositions) {
      if (p.category) counts[p.category as string] = (counts[p.category as string] ?? 0) + 1;
    }
    return counts;
  }, [stockPositions]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const settingsKeys = new Set(settings.categories.map((c) => c.key));
    const grouped: Record<string, { value: number; count: number }> = {};

    for (const cat of settings.categories) grouped[cat.key] = { value: 0, count: 0 };
    grouped["Unassigned"] = { value: 0, count: 0 };

    for (const p of stockPositions) {
      const rawKey = p.category as string | null;
      const key = rawKey && settingsKeys.has(rawKey) ? rawKey : "Unassigned";
      grouped[key].value += p.current_value ?? 0;
      grouped[key].count += 1;
    }

    const catTargets = getCategoryTargets(settings);
    const categories = settings.categories.map((cat) => ({
      name: cat.display_name,
      key: cat.key,
      value: grouped[cat.key]?.value ?? 0,
      count: grouped[cat.key]?.count ?? 0,
      pct: totalEquity > 0 ? ((grouped[cat.key]?.value ?? 0) / totalEquity) * 100 : 0,
      target: catTargets[cat.key] ?? 0,
      targetPositions: cat.target_positions,
      isUnassigned: false,
    }));

    const unassigned = grouped["Unassigned"];
    if (unassigned.count > 0) {
      categories.push({
        name: "Unassigned",
        key: "Unassigned",
        value: unassigned.value,
        count: unassigned.count,
        pct: totalEquity > 0 ? (unassigned.value / totalEquity) * 100 : 0,
        target: 0,
        targetPositions: 0,
        isUnassigned: true,
      });
    }

    return categories;
  }, [stockPositions, totalEquity, settings]);

  // Underweight positions (buy list)
  const deployCapitalList = useMemo(() => {
    if (grandTotal <= 0) return [];
    return stockPositions
      .filter((p) => p.tier != null || (p.category != null && settings.categories.find(c => c.key === p.category)?.tiers.length === 0))
      .map((p) => {
        const currentVal = p.current_value ?? 0;
        const weight = (currentVal / grandTotal) * 100;
        const goal = getPositionGoal({ tier: p.tier, category: p.category as Category }, settings);
        if (goal == null) return null;
        const goalValue = (goal / 100) * grandTotal;
        const diff = goalValue - currentVal;
        const tolerance = goalValue * 0.02;
        if (diff <= tolerance) return null;
        return {
          symbol: p.symbol,
          tier: p.tier ?? (p.category as string),
          currentValue: currentVal,
          weight,
          goalValue,
          goal,
          toBuy: diff,
          category: p.category as string,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aOrder = a!.tier ? (tierOrder[a!.tier] ?? 99) : 99;
        const bOrder = b!.tier ? (tierOrder[b!.tier] ?? 99) : 99;
        return aOrder - bOrder;
      }) as {
      symbol: string; tier: string; currentValue: number; weight: number; goalValue: number; goal: number; toBuy: number; category: string;
    }[];
  }, [stockPositions, grandTotal, settings, tierOrder]);

  // Overweight positions (trim list)
  const overweightList = useMemo(() => {
    if (grandTotal <= 0) return [];
    return stockPositions
      .filter((p) => p.tier != null || (p.category != null && settings.categories.find(c => c.key === p.category)?.tiers.length === 0))
      .map((p) => {
        const currentVal = p.current_value ?? 0;
        const weight = (currentVal / grandTotal) * 100;
        const goal = getPositionGoal({ tier: p.tier, category: p.category as Category }, settings);
        if (goal == null) return null;
        const goalValue = (goal / 100) * grandTotal;
        const excess = currentVal - goalValue;
        const tolerance = goalValue * 0.02;
        if (excess <= tolerance) return null;
        return {
          symbol: p.symbol,
          tier: p.tier ?? (p.category as string),
          currentValue: currentVal,
          weight,
          goalValue,
          goal: goal,
          toTrim: excess,
          category: p.category as string,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.toTrim - a!.toTrim) as {
      symbol: string; tier: string; currentValue: number; weight: number; goalValue: number; goal: number; toTrim: number; category: string;
    }[];
  }, [stockPositions, grandTotal, settings]);

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
          aVal = (a.category as string) ?? "zzz"; bVal = (b.category as string) ?? "zzz";
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
      prev.map((p) => (p.id === id ? { ...p, category: category as any, tier } : p))
    );
  };

  // Staleness
  const latestPriceUpdate = useMemo(() => {
    const dates = positions
      .map((p) => p.last_price_update)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }, [positions]);
  const isPriceStale = latestPriceUpdate ? Date.now() - latestPriceUpdate.getTime() > 24 * 60 * 60 * 1000 : false;

  // Portfolio price refresh
  const handleRefreshPrices = useCallback(async () => {
    if (!fmpApiKey || !user) return;
    setRefreshing(true);
    setRefreshProgress(null);
    const syms = positions.filter((p) => p.symbol !== "CASH").map((p) => p.symbol);
    const profiles = await fetchProfilesBatched(syms, fmpApiKey, (done, total) =>
      setRefreshProgress({ done, total })
    );

    const now = new Date().toISOString();
    let succeeded = 0;

    for (const prof of profiles) {
      const pos = positions.find((p) => p.symbol.toUpperCase() === prof.symbol.toUpperCase());
      if (!pos) continue;
      const newValue = (pos.shares ?? 0) * prof.price;
      const { error } = await supabase
        .from("positions")
        .update({
          current_price: prof.price,
          current_value: newValue,
          last_price_update: now,
        })
        .eq("id", pos.id);
      if (!error) succeeded++;
    }

    setPositions((prev) =>
      prev.map((p) => {
        const prof = profiles.find((pr) => pr.symbol.toUpperCase() === p.symbol.toUpperCase());
        if (!prof) return p;
        return { ...p, current_price: prof.price, current_value: (p.shares ?? 0) * prof.price, last_price_update: now };
      })
    );

    const failed = syms.length - succeeded;
    if (failed > 0) {
      toast({
        title: "Price refresh",
        description: `${succeeded} of ${syms.length} refreshed, ${failed} failed.`,
        variant: "destructive",
      });
    } else if (succeeded > 0) {
      toast({
        title: "Prices refreshed",
        description: `${succeeded} position${succeeded !== 1 ? "s" : ""} updated.`,
      });
    }
    setRefreshing(false);
    setRefreshProgress(null);
  }, [fmpApiKey, user, positions, toast]);

  // Auto-refresh on page load
  useEffect(() => {
    if (!loading && stockPositions.length > 0 && fmpApiKey && !autoRefreshed) {
      setAutoRefreshed(true);
      handleRefreshPrices();
    }
  }, [loading, stockPositions.length, fmpApiKey, autoRefreshed, handleRefreshPrices]);

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
                  {refreshing && refreshProgress
                    ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}...`
                    : "Refresh Prices"}
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
      <PortfolioSummaryCards
        grandTotal={grandTotal}
        cashBalance={cashBalance}
        totalGainLoss={totalGainLoss}
        totalGainLossPct={totalGainLossPct}
        stockPositionsCount={stockPositions.length}
        assignedCount={assignedCount}
      />

      {/* Category Allocation Overview */}
      {positions.length > 0 && (
        <CategoryBreakdown
          categoryBreakdown={categoryBreakdown}
          cashBalance={cashBalance}
          grandTotal={grandTotal}
          totalEquity={totalEquity}
          settings={settings}
          CATEGORY_COLORS={CATEGORY_COLORS}
          onSettingsUpdate={updateSettings}
        />
      )}

      {/* Positions Table */}
      <PortfolioTable
        positions={sortedPositions}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        expandedId={expandedId}
        onExpand={setExpandedId}
        settings={settings}
        CATEGORY_COLORS={CATEGORY_COLORS}
        grandTotal={grandTotal}
        tierCounts={tierCounts}
        categoryCounts={categoryCounts}
        allTags={allTags}
        positionTagMap={positionTagMap}
        onCategoryUpdate={handleCategoryUpdate}
        onDeletePosition={(id) => {
          setPositions((prev) => prev.filter((pos) => pos.id !== id));
          setExpandedId(null);
        }}
        onUpdatePosition={(id, updates) => {
          setPositions((prev) =>
            prev.map((pos) => (pos.id === id ? { ...pos, ...updates } : pos))
          );
        }}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onTierSettingsChanged={refetchSettings}
        getTagsForPosition={getTagsForPosition}
      />

      {/* Rebalance Capital */}
      <RebalanceCapital
        underweightList={deployCapitalList}
        overweightList={overweightList}
        cashBalance={cashBalance}
        settings={settings}
        CATEGORY_COLORS={CATEGORY_COLORS}
        defaultOpen={deployOpen}
        onOpenChange={setDeployOpen}
      />
    </div>
  );
}
