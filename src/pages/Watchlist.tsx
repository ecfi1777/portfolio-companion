import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye, Plus, Settings, Search, Bell, BellRing, ChevronDown, ChevronUp, ArrowUpDown, Trash2, X, Tag as TagIcon, Upload, FileSearch, RefreshCw, AlertTriangle, Clock,
} from "lucide-react";
import { useWatchlist, type WatchlistEntry } from "@/hooks/use-watchlist";
import { useScreens } from "@/hooks/use-screens";
import { usePortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useAlerts, type AlertType, type PriceAlert } from "@/hooks/use-alerts";
import { AddToWatchlistModal, type AddToWatchlistData, type PendingAlertData } from "@/components/AddToWatchlistModal";
import { ManageTagsModal } from "@/components/ManageTagsModal";
import { ScreenUploadModal } from "@/components/ScreenUploadModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMarketCap } from "@/lib/market-cap";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── Formatters ── */
const fmtPrice = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const fmtDollar = (n: number) =>
  (n >= 0 ? "+$" : "-$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CAP_COLORS: Record<string, string> = {
  MEGA: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  LARGE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  MID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  SMALL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  MICRO: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  NANO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const CAP_ORDER = ["MEGA", "LARGE", "MID", "SMALL", "MICRO", "NANO"];

/* ── Helpers ── */
function calcDayChg(e: WatchlistEntry) {
  return e.current_price != null && e.previous_close != null && e.previous_close > 0
    ? ((e.current_price - e.previous_close) / e.previous_close) * 100
    : null;
}

function calcSinceAdded(e: WatchlistEntry) {
  return e.current_price != null && e.price_when_added != null && e.price_when_added > 0
    ? ((e.current_price - e.price_when_added) / e.price_when_added) * 100
    : null;
}

function pctColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

type SortKey = "symbol" | "price" | "dayChg" | "sinceAdded" | "marketCap" | "dateAdded";
type SortDir = "asc" | "desc";
type PerfFilter = "all" | "gainers" | "losers";

/* ── Multi-select filter dropdown ── */
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string; color?: string | null }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const count = selected.size;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {label}
          {count > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
            <Checkbox
              checked={selected.has(opt.value)}
              onCheckedChange={() => onToggle(opt.value)}
            />
            {opt.color && (
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
            )}
            {opt.label}
          </label>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">None available</p>}
      </PopoverContent>
    </Popover>
  );
}

/* ── Sortable header ── */
function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <TableHead className={`cursor-pointer select-none group ${className ?? ""}`} onClick={() => onSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {active ? (
          currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </div>
    </TableHead>
  );
}

/* ── Main Component ── */
export default function Watchlist() {
  const {
    entries, tags, loading, addEntry, deleteEntry, updateEntryNotes,
    addEntryTag, removeEntryTag, createTag, updateTag, deleteTag, refreshPrices, refetch: refetchWatchlist,
  } = useWatchlist();
  const { screens, runs, createScreen, createRun, deleteScreen } = useScreens();
  const { settings } = usePortfolioSettings();
  const { activeAlerts, triggeredAlerts, createAlert, deleteAlert, getAlertsForEntry, refetch: refetchAlerts } = useAlerts();
  const fmpApiKey = settings.fmp_api_key;
  const [refreshing, setRefreshing] = useState(false);
  const [alertTab, setAlertTab] = useState<string>("watchlist");

  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<string | undefined>(undefined);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [screenOpen, setScreenOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistEntry | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [deleteScreenConfirm, setDeleteScreenConfirm] = useState<{ id: string; name: string } | null>(null);

  // Collapsible section states
  const [screenHistoryOpen, setScreenHistoryOpen] = useState(false);
  const [overlapOpen, setOverlapOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Filters
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("all");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("dateAdded");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Inline notes editing
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const toggleSet = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortDir(key === "symbol" ? "asc" : "desc");
      }
      return key;
    });
  }, []);

  // Derived filter options
  const sectorOptions = useMemo(() => {
    const sectors = new Set(entries.map((e) => e.sector).filter(Boolean) as string[]);
    return Array.from(sectors).sort().map((s) => ({ value: s, label: s }));
  }, [entries]);

  const tagOptions = useMemo(
    () => tags.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.short_code, color: t.color })),
    [tags]
  );

  const capOptions = CAP_ORDER.map((c) => ({ value: c, label: c }));

  // Filter + sort
  const processed = useMemo(() => {
    let result = entries;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => e.symbol.toLowerCase().includes(q) || (e.company_name?.toLowerCase().includes(q) ?? false)
      );
    }

    // Tag filter (ANY match)
    if (selectedTags.size > 0) {
      result = result.filter((e) => e.tags?.some((t) => selectedTags.has(t.id)));
    }

    // Market cap filter
    if (selectedCaps.size > 0) {
      result = result.filter((e) => e.market_cap_category && selectedCaps.has(e.market_cap_category));
    }

    // Sector filter
    if (selectedSectors.size > 0) {
      result = result.filter((e) => e.sector && selectedSectors.has(e.sector));
    }

    // Performance filter
    if (perfFilter !== "all") {
      result = result.filter((e) => {
        const chg = calcSinceAdded(e);
        if (chg == null) return false;
        return perfFilter === "gainers" ? chg >= 0 : chg < 0;
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "price":
          cmp = (a.current_price ?? 0) - (b.current_price ?? 0);
          break;
        case "dayChg":
          cmp = (calcDayChg(a) ?? -Infinity) - (calcDayChg(b) ?? -Infinity);
          break;
        case "sinceAdded":
          cmp = (calcSinceAdded(a) ?? -Infinity) - (calcSinceAdded(b) ?? -Infinity);
          break;
        case "marketCap":
          cmp = (a.market_cap ?? 0) - (b.market_cap ?? 0);
          break;
        case "dateAdded":
          cmp = new Date(a.date_added).getTime() - new Date(b.date_added).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [entries, search, selectedTags, selectedCaps, selectedSectors, perfFilter, sortKey, sortDir]);

  const activeFilters = selectedTags.size + selectedCaps.size + selectedSectors.size + (perfFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSelectedTags(new Set());
    setSelectedCaps(new Set());
    setSelectedSectors(new Set());
    setPerfFilter("all");
  };

  const handleNotesBlur = async (entryId: string) => {
    const val = editingNotes[entryId];
    if (val !== undefined) {
      await updateEntryNotes(entryId, val);
      setEditingNotes((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm) {
      await deleteEntry(deleteConfirm.id);
      if (expandedId === deleteConfirm.id) setExpandedId(null);
      setDeleteConfirm(null);
    }
  };

  // Auto-refresh prices on load
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  useEffect(() => {
    if (!loading && entries.length > 0 && fmpApiKey && !autoRefreshed) {
      setAutoRefreshed(true);
      setRefreshing(true);
      refreshPrices(fmpApiKey).finally(() => setRefreshing(false));
    }
  }, [loading, entries.length, fmpApiKey, autoRefreshed, refreshPrices]);

  const handleManualRefresh = async () => {
    if (!fmpApiKey) return;
    setRefreshing(true);
    const count = await refreshPrices(fmpApiKey);
    setRefreshing(false);
  };

  // Staleness
  const latestUpdate = useMemo(() => {
    const dates = entries
      .map((e) => (e as any).last_price_update)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }, [entries]);

  const isStale = latestUpdate ? Date.now() - latestUpdate.getTime() > 24 * 60 * 60 * 1000 : false;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading watchlist...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Watchlist</h1>
          {latestUpdate && (
            <span className={`flex items-center gap-1 text-xs ${isStale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {isStale && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              Prices as of {latestUpdate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {!latestUpdate && entries.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {fmpApiKey ? "Refreshing prices..." : "Set FMP API key in Settings for live prices"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={!fmpApiKey || refreshing}
                >
                  <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </TooltipTrigger>
              {!fmpApiKey && <TooltipContent>Set your FMP API key in Settings</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={() => setScreenOpen(true)}>
            <Upload className="mr-1 h-4 w-4" />
            Upload Screen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTagsOpen(true)}>
            <Settings className="mr-1 h-4 w-4" />
            Manage Tags
          </Button>
          <Button size="sm" onClick={() => { setAddPrefill(undefined); setAddOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            Add to Watchlist
          </Button>
        </div>
      </div>

      <AddToWatchlistModal
        open={addOpen}
        onOpenChange={setAddOpen}
        tags={tags}
        fmpApiKey={fmpApiKey}
        initialSymbol={addPrefill}
        onSave={async (data, alert) => {
          const entryId = await addEntry(data);
          if (entryId && alert) {
            await createAlert({
              watchlist_entry_id: entryId,
              symbol: data.symbol.toUpperCase(),
              alert_type: alert.alert_type,
              target_value: alert.target_value,
              reference_price: alert.reference_price,
            });
          }
        }}
      />
      <ManageTagsModal open={tagsOpen} onOpenChange={setTagsOpen} tags={tags} onCreate={createTag} onUpdate={updateTag} onDelete={deleteTag} />
      <ScreenUploadModal
        open={screenOpen}
        onOpenChange={setScreenOpen}
        screens={screens}
        entries={entries}
        tags={tags}
        createScreen={createScreen}
        createRun={createRun}
        addEntry={async (data) => { await addEntry(data); }}
        refetchWatchlist={refetchWatchlist}
      />

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search symbol or company..." className="pl-9 h-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <FilterDropdown label="Tags" options={tagOptions} selected={selectedTags} onToggle={(v) => toggleSet(setSelectedTags, v)} />
        <FilterDropdown label="Mkt Cap" options={capOptions} selected={selectedCaps} onToggle={(v) => toggleSet(setSelectedCaps, v)} />
        <FilterDropdown label="Sector" options={sectorOptions} selected={selectedSectors} onToggle={(v) => toggleSet(setSelectedSectors, v)} />

        {/* Performance toggle */}
        <div className="flex items-center rounded-md border border-border h-8 text-xs">
          {(["all", "gainers", "losers"] as PerfFilter[]).map((pf) => (
            <button
              key={pf}
              onClick={() => setPerfFilter(pf)}
              className={`px-3 h-full capitalize transition-colors ${
                perfFilter === pf ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              } ${pf === "all" ? "rounded-l-md" : pf === "losers" ? "rounded-r-md" : ""}`}
            >
              {pf}
            </button>
          ))}
        </div>

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            Clear filters
            <X className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Eye className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Your watchlist is empty</p>
            <p className="text-sm text-muted-foreground mb-4">Track symbols you're interested in but don't own yet.</p>
            <Button onClick={() => { setAddPrefill(undefined); setAddOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />
              Add Your First Stock
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <TableHead>Company</TableHead>
                  <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortHeader label="Day Chg %" sortKey="dayChg" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortHeader label="Since Added %" sortKey="sinceAdded" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortHeader label="Mkt Cap" sortKey="marketCap" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.map((entry) => {
                  const dayChg = calcDayChg(entry);
                  const sinceAdded = calcSinceAdded(entry);
                  const isExpanded = expandedId === entry.id;
                  const entryTags = entry.tags ?? [];
                  const availableTags = tags.filter((t) => t.is_active && !entryTags.some((et) => et.id === t.id));
                  const entryAlerts = getAlertsForEntry(entry.id);
                  const hasActiveAlert = entryAlerts.some((a) => a.is_active);
                  const hasTriggeredUnacked = entryAlerts.some((a) => a.triggered_at != null && a.acknowledged_at == null);

                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <TableCell className="font-medium">{entry.symbol}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.company_name ?? "—"}</TableCell>
                        <TableCell className="text-right">{fmtPrice(entry.current_price)}</TableCell>
                        <TableCell className={`text-right ${pctColor(dayChg)}`}>
                          {dayChg != null ? fmtPct(dayChg) : "—"}
                        </TableCell>
                        <TableCell className={`text-right ${pctColor(sinceAdded)}`}>
                          {sinceAdded != null ? fmtPct(sinceAdded) : "—"}
                        </TableCell>
                        <TableCell>
                          {entry.market_cap_category ? (
                            <Badge variant="secondary" className={`text-xs ${CAP_COLORS[entry.market_cap_category] ?? ""}`}>
                              {entry.market_cap_category}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {entryTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border"
                                style={{
                                  backgroundColor: tag.color ? `${tag.color}20` : undefined,
                                  color: tag.color ?? undefined,
                                  borderColor: tag.color ? `${tag.color}40` : undefined,
                                }}
                              >
                                {tag.short_code}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasTriggeredUnacked ? (
                            <BellRing className="h-4 w-4 text-amber-500 fill-amber-500" />
                          ) : hasActiveAlert ? (
                            <BellRing className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Bell className="h-4 w-4 text-muted-foreground/30" />
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded row */}
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={8} className="p-0">
                            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6" onClick={(e) => e.stopPropagation()}>
                              {/* Price details */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price Details</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Current Price</span>
                                    <span className="font-medium">{fmtPrice(entry.current_price)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Price When Added</span>
                                    <span>{fmtPrice(entry.price_when_added)}</span>
                                  </div>
                                  {sinceAdded != null && entry.current_price != null && entry.price_when_added != null && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Dollar Change</span>
                                        <span className={pctColor(sinceAdded)}>{fmtDollar(entry.current_price - entry.price_when_added)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">% Change</span>
                                        <span className={pctColor(sinceAdded)}>{fmtPct(sinceAdded)}</span>
                                      </div>
                                    </>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Date Added</span>
                                    <span>{new Date(entry.date_added).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Company info */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company Info</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Industry</span>
                                    <span>{entry.industry ?? "—"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Sector</span>
                                    <span>{entry.sector ?? "—"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Market Cap</span>
                                    <span>
                                      {formatMarketCap(entry.market_cap)}
                                      {entry.market_cap_category && (
                                        <Badge variant="secondary" className={`ml-1 text-[10px] ${CAP_COLORS[entry.market_cap_category] ?? ""}`}>
                                          {entry.market_cap_category}
                                        </Badge>
                                      )}
                                    </span>
                                  </div>
                                </div>

                                {/* Tags section */}
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Tags</h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {entryTags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
                                      style={{
                                        backgroundColor: tag.color ? `${tag.color}20` : undefined,
                                        color: tag.color ?? undefined,
                                        borderColor: tag.color ? `${tag.color}40` : undefined,
                                      }}
                                    >
                                      {tag.short_code}
                                      <button
                                        onClick={() => removeEntryTag(entry.id, tag.id)}
                                        className="hover:opacity-70"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                  {availableTags.length > 0 && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                                          <TagIcon className="h-3 w-3" />
                                          Add
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-1" align="start">
                                        {availableTags.map((t) => (
                                          <button
                                            key={t.id}
                                            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                                            onClick={() => addEntryTag(entry.id, t.id)}
                                          >
                                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color ?? undefined }} />
                                            {t.short_code}
                                            {t.full_name && <span className="text-muted-foreground text-xs">– {t.full_name}</span>}
                                          </button>
                                        ))}
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              </div>

                              {/* Alerts */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alerts</h4>
                                {entryAlerts.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {entryAlerts.map((a) => (
                                      <div key={a.id} className="flex items-center justify-between text-sm rounded-md border px-2 py-1.5">
                                        <div className="flex items-center gap-2">
                                          {a.is_active ? (
                                            <BellRing className="h-3.5 w-3.5 text-amber-500" />
                                          ) : (
                                            <Bell className="h-3.5 w-3.5 text-muted-foreground/50" />
                                          )}
                                          <span className="text-xs">
                                            {a.alert_type.replace(/_/g, " ")}
                                            {": "}
                                            {a.alert_type.startsWith("PCT") ? `${a.target_value}%` : `$${a.target_value}`}
                                          </span>
                                          {a.triggered_at && (
                                            <Badge variant="secondary" className="text-[10px]">Triggered</Badge>
                                          )}
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => deleteAlert(a.id)}>
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No alerts set</p>
                                )}
                                <AlertPopover entryId={entry.id} symbol={entry.symbol} currentPrice={entry.current_price} createAlert={createAlert} />
                              </div>

                              {/* Notes + Actions */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                                <Textarea
                                  className="text-sm min-h-[80px] resize-none"
                                  placeholder="Add notes..."
                                  value={editingNotes[entry.id] ?? entry.notes ?? ""}
                                  onChange={(e) => setEditingNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                                  onBlur={() => handleNotesBlur(entry.id)}
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={() => setDeleteConfirm(entry)}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  Remove from Watchlist
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
                {processed.length === 0 && entries.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No results matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}


      {/* Screen History */}
      {(runs.length > 0 || screens.length > 0) && (
        <div className="space-y-3">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setScreenHistoryOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Screen History
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${screenHistoryOpen ? "rotate-180" : ""}`} />
            </h2>
            {screenHistoryOpen && (
              <div onClick={(e) => e.stopPropagation()}>
                <Select value={historyFilter} onValueChange={setHistoryFilter}>
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue placeholder="All screens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Screens</SelectItem>
                    {screens.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {screenHistoryOpen && (<>

          {/* Screens list with delete */}
          <div className="flex flex-wrap gap-2">
            {screens.map((s) => (
              <div key={s.id} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground text-xs">({s.short_code})</span>
                <button
                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => setDeleteScreenConfirm({ id: s.id, name: s.name })}
                  title={`Delete ${s.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {runs.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Screen</TableHead>
                      <TableHead className="text-right">Total Symbols</TableHead>
                      <TableHead className="text-right">Matches</TableHead>
                      <TableHead>Auto Tag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs
                      .filter((r) => historyFilter === "all" || r.screen_id === historyFilter)
                      .map((run) => {
                        const isRunExpanded = expandedRunId === run.id;
                        const matchedSymbols = run.matched_symbols ?? [];
                        const matchedSet = new Set(matchedSymbols.map((s) => s.toUpperCase()));
                        const watchlistSymbols = new Set(entries.map((e) => e.symbol.toUpperCase()));
                        return (
                          <React.Fragment key={run.id}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => setExpandedRunId(isRunExpanded ? null : run.id)}
                            >
                              <TableCell className="w-8">
                                {isRunExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="text-sm">{new Date(run.run_date).toLocaleDateString()}</TableCell>
                              <TableCell className="text-sm font-medium">{run.screen?.name ?? "—"}</TableCell>
                              <TableCell className="text-right text-sm">{run.total_symbols}</TableCell>
                              <TableCell className="text-right text-sm">{run.match_count}</TableCell>
                              <TableCell>
                                {run.auto_tag_code && (
                                  <Badge variant="secondary" className="text-xs">{run.auto_tag_code}</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                            {isRunExpanded && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30 p-4">
                                  <div className="space-y-3">
                                    <h4 className="text-sm font-medium mb-2">
                                      All Symbols ({(run.all_symbols ?? matchedSymbols).length})
                                      <span className="ml-2 text-muted-foreground font-normal text-xs">
                                        — {matchedSymbols.length} in watchlist
                                      </span>
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                      {((run.all_symbols ?? []).length > 0 ? run.all_symbols! : matchedSymbols).map((sym) => {
                                        const inWatchlist = watchlistSymbols.has(sym.toUpperCase());
                                        const isMatch = matchedSet.has(sym.toUpperCase());
                                        return (
                                          <div key={sym} className="flex items-center gap-1">
                                            <Badge
                                              variant={isMatch ? "default" : "outline"}
                                              className={`text-xs ${isMatch ? "" : "opacity-60"}`}
                                            >
                                              {sym}
                                            </Badge>
                                            {!inWatchlist && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-5 w-5 p-0"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setAddPrefill(sym);
                                                  setAddOpen(true);
                                                }}
                                                title={`Add ${sym} to watchlist`}
                                              >
                                                <Plus className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
          </>)}
        </div>
      )}

      {/* Cross-Screen Overlap Matrix */}
      {screens.length >= 2 && (
        <div className="space-y-3">
          <div
            className="flex items-center cursor-pointer select-none gap-2"
            onClick={() => setOverlapOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Cross-Screen Overlap
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${overlapOpen ? "rotate-180" : ""}`} />
            </h2>
          </div>
          {overlapOpen && (
            <ScreenOverlapMatrix runs={runs} screens={screens} entries={entries} onQuickAdd={(sym) => { setAddPrefill(sym); setAddOpen(true); }} />
          )}
        </div>
      )}

      {/* Alerts Section */}
      {(activeAlerts.length > 0 || triggeredAlerts.length > 0) && (
        <div className="space-y-3">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setAlertsOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Price Alerts
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${alertsOpen ? "rotate-180" : ""}`} />
            </h2>
          </div>
          {alertsOpen && (
          <Tabs value={alertTab} onValueChange={setAlertTab}>
            <TabsList>
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
              <TabsTrigger value="active">Active ({activeAlerts.length})</TabsTrigger>
              <TabsTrigger value="triggered">Triggered ({triggeredAlerts.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              {activeAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No active alerts.</p>
              ) : (
                <Card>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Alert Type</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeAlerts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.symbol}</TableCell>
                            <TableCell className="text-sm">{a.alert_type.replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-sm">
                              {a.alert_type.startsWith("PCT") ? `${a.target_value}%` : `$${a.target_value}`}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {a.reference_price ? `$${a.reference_price}` : "—"}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => deleteAlert(a.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </TabsContent>
            <TabsContent value="triggered">
              {triggeredAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No triggered alerts yet.</p>
              ) : (
                <Card>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Alert Type</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Triggered At</TableHead>
                          <TableHead>Notified</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {triggeredAlerts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.symbol}</TableCell>
                            <TableCell className="text-sm">{a.alert_type.replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-sm">
                              {a.alert_type.startsWith("PCT") ? `${a.target_value}%` : `$${a.target_value}`}
                            </TableCell>
                            <TableCell className="text-sm">
                              {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell>
                              {a.notification_sent ? (
                                <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>
          )}
        </div>
      )}

      {/* Delete watchlist entry confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteConfirm?.symbol} from watchlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the entry and all its tag associations. Any future alerts for this symbol will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete screen confirmation */}
      <AlertDialog open={!!deleteScreenConfirm} onOpenChange={(o) => !o && setDeleteScreenConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete screen "{deleteScreenConfirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the screen, all its runs, and remove any auto-generated tags from your watchlist entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteScreenConfirm) {
                  await deleteScreen(deleteScreenConfirm.id);
                  if (historyFilter === deleteScreenConfirm.id) setHistoryFilter("all");
                  setDeleteScreenConfirm(null);
                  await refetchWatchlist();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Cross-Screen Overlap Matrix ── */
function ScreenOverlapMatrix({
  runs,
  screens,
  entries,
  onQuickAdd,
}: {
  runs: ReturnType<typeof import("@/hooks/use-screens").useScreens>["runs"];
  screens: ReturnType<typeof import("@/hooks/use-screens").useScreens>["screens"];
  entries: WatchlistEntry[];
  onQuickAdd: (symbol: string) => void;
}) {
  const [selectedPair, setSelectedPair] = useState<[number, number] | null>(null);

  const watchlistSymbolSet = useMemo(() => new Set(entries.map((e) => e.symbol.toUpperCase())), [entries]);

  // Get the latest run per screen
  const latestByScreen = useMemo(() => {
    const map = new Map<string, typeof runs[number]>();
    for (const run of runs) {
      const existing = map.get(run.screen_id);
      if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
        map.set(run.screen_id, run);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.screen?.name ?? "").localeCompare(b.screen?.name ?? "")
    );
  }, [runs]);

  const getSymbols = (r: typeof runs[number]) => {
    const all = r.all_symbols ?? [];
    return all.length > 0 ? all : (r.matched_symbols ?? []);
  };

  const overlapSymbols = (a: typeof runs[number], b: typeof runs[number]) => {
    const setA = new Set(getSymbols(a).map((s) => s.toUpperCase()));
    return getSymbols(b).filter((s) => setA.has(s.toUpperCase())).map((s) => s.toUpperCase());
  };

  const overlap = (a: typeof runs[number], b: typeof runs[number]) => overlapSymbols(a, b).length;

  // Selected pair symbols
  const pairSymbols = useMemo(() => {
    if (!selectedPair) return [];
    const [i, j] = selectedPair;
    return [...new Set(overlapSymbols(latestByScreen[i], latestByScreen[j]))].sort();
  }, [selectedPair, latestByScreen]);

  // Cross-screen symbols: symbols in 2+ screens
  const crossScreenData = useMemo(() => {
    const symbolScreens = new Map<string, Set<number>>();
    latestByScreen.forEach((run, idx) => {
      for (const sym of getSymbols(run)) {
        const upper = sym.toUpperCase();
        if (!symbolScreens.has(upper)) symbolScreens.set(upper, new Set());
        symbolScreens.get(upper)!.add(idx);
      }
    });
    const results: { symbol: string; screenIndices: number[] }[] = [];
    for (const [symbol, indices] of symbolScreens) {
      if (indices.size >= 2) {
        results.push({ symbol, screenIndices: Array.from(indices).sort() });
      }
    }
    results.sort((a, b) => b.screenIndices.length - a.screenIndices.length || a.symbol.localeCompare(b.symbol));
    return results;
  }, [latestByScreen]);

  const totalUniqueSymbols = useMemo(() => {
    const all = new Set<string>();
    latestByScreen.forEach((run) => getSymbols(run).forEach((s) => all.add(s.toUpperCase())));
    return all.size;
  }, [latestByScreen]);

  // Watchlist matches: watchlist symbols that appear in any screen
  const watchlistMatches = useMemo(() => {
    const symbolScreens = new Map<string, number[]>();
    latestByScreen.forEach((run, idx) => {
      for (const sym of getSymbols(run)) {
        const upper = sym.toUpperCase();
        if (watchlistSymbolSet.has(upper)) {
          if (!symbolScreens.has(upper)) symbolScreens.set(upper, []);
          if (!symbolScreens.get(upper)!.includes(idx)) symbolScreens.get(upper)!.push(idx);
        }
      }
    });
    return Array.from(symbolScreens.entries())
      .map(([symbol, indices]) => ({ symbol, screenIndices: indices.sort() }))
      .sort((a, b) => b.screenIndices.length - a.screenIndices.length || a.symbol.localeCompare(b.symbol));
  }, [latestByScreen, watchlistSymbolSet]);

  const handleQuickAdd = (symbol: string) => {
    onQuickAdd(symbol);
  };

  if (latestByScreen.length < 2) return null;

  const SCREEN_COLORS = ["#5865F2", "#57F287", "#FEE75C", "#ED4245", "#EB459E", "#9B59B6", "#3498DB", "#E67E22"];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cross-Screen Overlap</h2>
      <p className="text-sm text-muted-foreground">
        Pairwise symbol overlap between the latest run of each screen. Click a cell to see the overlapping symbols.
      </p>

      {/* Matrix */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]" />
                {latestByScreen.map((r, idx) => (
                  <TableHead key={r.id} className="text-center text-xs whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SCREEN_COLORS[idx % SCREEN_COLORS.length] }} />
                      {r.screen?.name ?? r.screen_id.slice(0, 6)}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {new Date(r.run_date).toLocaleDateString()}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestByScreen.map((row, ri) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-sm whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SCREEN_COLORS[ri % SCREEN_COLORS.length] }} />
                      {row.screen?.name ?? row.screen_id.slice(0, 6)}
                      <span className="text-muted-foreground text-xs">({getSymbols(row).length})</span>
                    </div>
                  </TableCell>
                  {latestByScreen.map((col, ci) => {
                    const count = ri === ci ? getSymbols(row).length : overlap(row, col);
                    const isDiag = ri === ci;
                    const isSelected = selectedPair && ((selectedPair[0] === ri && selectedPair[1] === ci) || (selectedPair[0] === ci && selectedPair[1] === ri));
                    const maxPossible = Math.min(getSymbols(row).length, getSymbols(col).length);
                    const intensity = !isDiag && maxPossible > 0 ? count / maxPossible : 0;
                    return (
                      <TableCell
                        key={col.id}
                        className={`text-center text-sm tabular-nums ${isDiag ? "bg-muted font-medium" : "cursor-pointer hover:ring-2 hover:ring-primary/50"} ${isSelected ? "ring-2 ring-primary" : ""}`}
                        style={
                          !isDiag && intensity > 0
                            ? { backgroundColor: `hsl(var(--primary) / ${(intensity * 0.3 + 0.05).toFixed(2)})` }
                            : undefined
                        }
                        onClick={() => {
                          if (!isDiag) {
                            const pair: [number, number] = ri < ci ? [ri, ci] : [ci, ri];
                            setSelectedPair((prev) =>
                              prev && prev[0] === pair[0] && prev[1] === pair[1] ? null : pair
                            );
                          }
                        }}
                      >
                        {count}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Expanded pair overlap */}
        {selectedPair && pairSymbols.length > 0 && (
          <div className="border-t p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>Overlap between</span>
              <Badge variant="secondary" className="text-xs" style={{ backgroundColor: `${SCREEN_COLORS[selectedPair[0] % SCREEN_COLORS.length]}30`, color: SCREEN_COLORS[selectedPair[0] % SCREEN_COLORS.length] }}>
                {latestByScreen[selectedPair[0]].screen?.name}
              </Badge>
              <span>&</span>
              <Badge variant="secondary" className="text-xs" style={{ backgroundColor: `${SCREEN_COLORS[selectedPair[1] % SCREEN_COLORS.length]}30`, color: SCREEN_COLORS[selectedPair[1] % SCREEN_COLORS.length] }}>
                {latestByScreen[selectedPair[1]].screen?.name}
              </Badge>
              <span className="text-muted-foreground">— {pairSymbols.length} symbols</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pairSymbols.map((sym) => {
                const inWatchlist = watchlistSymbolSet.has(sym);
                return (
                  <div key={sym} className="flex items-center gap-0.5">
                    <Badge variant={inWatchlist ? "default" : "outline"} className="text-xs">
                      {sym}
                      {inWatchlist && <span className="ml-1">✓</span>}
                    </Badge>
                    {!inWatchlist && (
                      <Button
                        variant="ghost" size="sm" className="h-5 w-5 p-0"
                        
                        onClick={() => handleQuickAdd(sym)}
                        title={`Add ${sym} to watchlist`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Cross-Screen Matches Table */}
      {crossScreenData.length > 0 && (
        <Card>
          <div className="p-4 pb-2">
            <h3 className="text-sm font-semibold">Symbols in Multiple Screens</h3>
            <p className="text-xs text-muted-foreground">
              {crossScreenData.length} symbols appear in 2+ screens out of {totalUniqueSymbols} unique symbols.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Screens</TableHead>
                  <TableHead className="w-24">Watchlist</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crossScreenData.map(({ symbol, screenIndices }) => {
                  const inWatchlist = watchlistSymbolSet.has(symbol);
                  return (
                    <TableRow key={symbol}>
                      <TableCell className="font-medium text-sm">{symbol}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted-foreground">{screenIndices.length}×</span>
                          {screenIndices.map((idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${SCREEN_COLORS[idx % SCREEN_COLORS.length]}20`,
                                color: SCREEN_COLORS[idx % SCREEN_COLORS.length],
                              }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SCREEN_COLORS[idx % SCREEN_COLORS.length] }} />
                              {latestByScreen[idx].screen?.name ?? "?"}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {inWatchlist ? (
                          <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
                        ) : (
                          <Button
                            variant="ghost" size="sm" className="h-6 px-2 text-xs"
                            
                            onClick={() => handleQuickAdd(symbol)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Watchlist Matches Table */}
      {watchlistMatches.length > 0 && (
        <Card>
          <div className="p-4 pb-2">
            <h3 className="text-sm font-semibold">Watchlist Matches</h3>
            <p className="text-xs text-muted-foreground">
              {watchlistMatches.length} watchlist symbols found across uploaded screens.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Screens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchlistMatches.map(({ symbol, screenIndices }) => (
                  <TableRow key={symbol}>
                    <TableCell className="font-medium text-sm">{symbol}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {screenIndices.map((idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${SCREEN_COLORS[idx % SCREEN_COLORS.length]}20`,
                              color: SCREEN_COLORS[idx % SCREEN_COLORS.length],
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SCREEN_COLORS[idx % SCREEN_COLORS.length] }} />
                            {latestByScreen[idx].screen?.name ?? "?"}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Alert Popover for expanded rows ── */
const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  PRICE_ABOVE: "Price Above",
  PRICE_BELOW: "Price Below",
  PCT_CHANGE_UP: "% Up",
  PCT_CHANGE_DOWN: "% Down",
};

function AlertPopover({
  entryId,
  symbol,
  currentPrice,
  createAlert,
}: {
  entryId: string;
  symbol: string;
  currentPrice: number | null;
  createAlert: (data: {
    watchlist_entry_id: string;
    symbol: string;
    alert_type: AlertType;
    target_value: number;
    reference_price?: number;
  }) => Promise<void>;
}) {
  const [alertType, setAlertType] = useState<AlertType>("PRICE_ABOVE");
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const isPct = alertType === "PCT_CHANGE_UP" || alertType === "PCT_CHANGE_DOWN";

  const handleAdd = async () => {
    if (!value) return;
    await createAlert({
      watchlist_entry_id: entryId,
      symbol,
      alert_type: alertType,
      target_value: parseFloat(value),
      reference_price: isPct && currentPrice ? currentPrice : undefined,
    });
    setValue("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Bell className="h-3 w-3" />
          Add Alert
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="start">
        <div className="space-y-1">
          <Label className="text-xs">Alert Type</Label>
          <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{ALERT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isPct ? "Threshold (%)" : "Target Price ($)"}</Label>
          <Input type="number" step={isPct ? "1" : "0.01"} value={value} onChange={(e) => setValue(e.target.value)} className="h-7 text-xs" placeholder={isPct ? "10" : "200.00"} />
        </div>
        <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd} disabled={!value}>
          Set Alert
        </Button>
      </PopoverContent>
    </Popover>
  );
}
