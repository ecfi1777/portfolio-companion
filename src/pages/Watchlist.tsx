import React, { useState, useMemo, useCallback, useEffect } from "react";
import { BulkWatchlistImportModal } from "@/components/BulkWatchlistImportModal";
import { supabase } from "@/integrations/supabase/client";
import { enrichWatchlistEntries } from "@/lib/watchlist-enrichment";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Eye, Plus, Settings, RefreshCw, AlertTriangle, Clock, Upload, DatabaseZap, FolderOpen,
} from "lucide-react";
import { useWatchlist, type WatchlistEntry } from "@/hooks/use-watchlist";
import { usePortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useAlerts } from "@/hooks/use-alerts";
import { AddToWatchlistModal } from "@/components/AddToWatchlistModal";
import { ManageTagsModal } from "@/components/ManageTagsModal";
import { ManageGroupsModal } from "@/components/ManageGroupsModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

import { CAP_ORDER, calcDayChg, calcSinceAdded } from "@/lib/watchlist-utils";
import { WatchlistFilters } from "@/components/watchlist/WatchlistFilters";
import { WatchlistBulkActions } from "@/components/watchlist/WatchlistBulkActions";
import { WatchlistGroupTabs } from "@/components/watchlist/WatchlistGroupTabs";
import { WatchlistTable } from "@/components/watchlist/WatchlistTable";
import { WatchlistAlertsSection } from "@/components/watchlist/WatchlistAlertsSection";
import { AlertPopover } from "@/components/watchlist/AlertPopover";

type SortKey = "symbol" | "price" | "dayChg" | "sinceAdded" | "marketCap" | "dateAdded" | "heat";

/* ── Screen hit types ── */
type ScreenHit = {
  symbol: string;
  screen_name: string;
  screen_short_code: string;
  screen_id: string;
  screen_color: string | null;
  heat_score: number;
};

type SymbolScreenData = {
  screens: { name: string; short_code: string; color: string | null }[];
  heat_score: number;
};
type SortDir = "asc" | "desc";
type PerfFilter = "all" | "gainers" | "losers";

/* ── Main Component ── */
export default function Watchlist() {
  const { user } = useAuth();
  const {
    entries, tags, groups, loading, addEntry, deleteEntry, updateEntryNotes,
    addEntryTag, removeEntryTag, createTag, updateTag, deleteTag, refreshPrices, archiveEntries, unarchiveEntries,
    createGroup, updateGroup, deleteGroup, assignEntriesToGroup, refetch: refetchWatchlist,
  } = useWatchlist();
  const { settings } = usePortfolioSettings();
  const { activeAlerts, triggeredAlerts, createAlert, deleteAlert, getAlertsForEntry, refetch: refetchAlerts } = useAlerts();
  const fmpApiKey = settings.fmp_api_key;

  // Screen hits
  const [screenHitsMap, setScreenHitsMap] = useState<Record<string, SymbolScreenData>>({});
  const [screenedFilter, setScreenedFilter] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_screen_hits_for_user").then(({ data, error }) => {
      if (error || !data) return;
      const map: Record<string, SymbolScreenData> = {};
      for (const row of data as ScreenHit[]) {
        const sym = row.symbol.toUpperCase();
        if (!map[sym]) map[sym] = { screens: [], heat_score: row.heat_score };
        map[sym].screens.push({ name: row.screen_name, short_code: row.screen_short_code, color: row.screen_color });
      }
      setScreenHitsMap(map);
    });
  }, [user]);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [reEnriching, setReEnriching] = useState(false);
  const [alertTab, setAlertTab] = useState<string>("watchlist");

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<string | undefined>(undefined);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistEntry | null>(null);
  const [deleteAlertConfirm, setDeleteAlertConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Filters
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [groupTab, setGroupTab] = useState<string>("all");

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

  const groupOptions = useMemo(
    () => [
      { value: "__ungrouped__", label: "Ungrouped" },
      ...groups.map((g) => ({ value: g.id, label: g.name, color: g.color })),
    ],
    [groups]
  );

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.sort_order - b.sort_order), [groups]);

  // Filter + sort
  const processed = useMemo(() => {
    let result = entries;
    if (!showArchived) result = result.filter((e) => !e.archived_at);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.symbol.toLowerCase().includes(q) || (e.company_name?.toLowerCase().includes(q) ?? false));
    }
    if (groupTab !== "all") {
      if (groupTab === "__ungrouped__") result = result.filter((e) => !e.group_id);
      else result = result.filter((e) => e.group_id === groupTab);
    }
    if (selectedGroups.size > 0) {
      result = result.filter((e) => {
        if (selectedGroups.has("__ungrouped__") && !e.group_id) return true;
        return e.group_id ? selectedGroups.has(e.group_id) : false;
      });
    }
    if (selectedTags.size > 0) result = result.filter((e) => e.tags?.some((t) => selectedTags.has(t.id)));
    if (selectedCaps.size > 0) result = result.filter((e) => e.market_cap_category && selectedCaps.has(e.market_cap_category));
    if (selectedSectors.size > 0) result = result.filter((e) => e.sector && selectedSectors.has(e.sector));
    if (perfFilter !== "all") {
      result = result.filter((e) => {
        const chg = calcSinceAdded(e);
        if (chg == null) return false;
        return perfFilter === "gainers" ? chg >= 0 : chg < 0;
      });
    }
    if (screenedFilter) result = result.filter((e) => !!screenHitsMap[e.symbol.toUpperCase()]);

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "price": cmp = (a.current_price ?? 0) - (b.current_price ?? 0); break;
        case "dayChg": cmp = (calcDayChg(a) ?? -Infinity) - (calcDayChg(b) ?? -Infinity); break;
        case "sinceAdded": cmp = (calcSinceAdded(a) ?? -Infinity) - (calcSinceAdded(b) ?? -Infinity); break;
        case "marketCap": cmp = (a.market_cap ?? 0) - (b.market_cap ?? 0); break;
        case "dateAdded": cmp = new Date(a.date_added).getTime() - new Date(b.date_added).getTime(); break;
        case "heat": cmp = (screenHitsMap[a.symbol.toUpperCase()]?.heat_score ?? 0) - (screenHitsMap[b.symbol.toUpperCase()]?.heat_score ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [entries, search, selectedTags, selectedCaps, selectedSectors, perfFilter, screenedFilter, screenHitsMap, sortKey, sortDir, showArchived, groupTab, selectedGroups]);

  const activeFilters = selectedTags.size + selectedCaps.size + selectedSectors.size + selectedGroups.size + (perfFilter !== "all" ? 1 : 0) + (screenedFilter ? 1 : 0) + (showArchived ? 1 : 0);

  const clearFilters = () => {
    setSelectedTags(new Set()); setSelectedCaps(new Set()); setSelectedSectors(new Set()); setSelectedGroups(new Set());
    setPerfFilter("all"); setScreenedFilter(false); setShowArchived(false); setGroupTab("all");
  };

  const handleNotesBlur = async (entryId: string) => {
    const val = editingNotes[entryId];
    if (val !== undefined) {
      await updateEntryNotes(entryId, val);
      setEditingNotes((prev) => { const next = { ...prev }; delete next[entryId]; return next; });
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm) {
      await deleteEntry(deleteConfirm.id);
      if (expandedId === deleteConfirm.id) setExpandedId(null);
      setDeleteConfirm(null);
    }
  };

  // Bulk selection helpers
  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const visibleIds = useMemo(() => new Set(processed.map((e) => e.id)), [processed]);
  const allVisibleSelected = visibleIds.size > 0 && [...visibleIds].every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); visibleIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); visibleIds.forEach((id) => next.add(id)); return next; });
    }
  }, [allVisibleSelected, visibleIds]);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    for (const id of ids) await deleteEntry(id);
    setBulkDeleting(false); setBulkDeleteOpen(false); setSelectedIds(new Set()); setExpandedId(null);
    toast({ title: `Deleted ${ids.length} entries from watchlist.` });
  };

  const selectedSymbols = useMemo(() => entries.filter((e) => selectedIds.has(e.id)).map((e) => e.symbol), [entries, selectedIds]);

  // Auto-refresh prices on load
  const [autoRefreshed, setAutoRefreshed] = useState(false);
  useEffect(() => {
    if (!loading && entries.length > 0 && fmpApiKey && !autoRefreshed) {
      setAutoRefreshed(true);
      setRefreshing(true);
      refreshPrices(fmpApiKey, (done, total) => setRefreshProgress({ done, total }))
        .then((result) => {
          if (result && result.failed > 0) {
            toast({ title: "Price refresh", description: `${result.succeeded} of ${result.total} refreshed, ${result.failed} failed.`, variant: "destructive" });
          }
        })
        .finally(() => { setRefreshing(false); setRefreshProgress(null); });
    }
  }, [loading, entries.length, fmpApiKey, autoRefreshed, refreshPrices]);

  const handleManualRefresh = async () => {
    if (!fmpApiKey) return;
    setRefreshing(true);
    const result = await refreshPrices(fmpApiKey, (done, total) => setRefreshProgress({ done, total }));
    setRefreshing(false); setRefreshProgress(null);
    if (result) {
      if (result.failed > 0) toast({ title: "Price refresh", description: `${result.succeeded} of ${result.total} refreshed, ${result.failed} failed.`, variant: "destructive" });
      else if (result.succeeded > 0) toast({ title: "Prices refreshed", description: `${result.succeeded} symbol${result.succeeded !== 1 ? "s" : ""} updated.` });
    }
  };

  const nullCapCount = useMemo(() => entries.filter((e) => e.market_cap == null).length, [entries]);

  const handleReEnrich = async () => {
    if (!fmpApiKey || !user) return;
    const nullCapSymbols = entries.filter((e) => e.market_cap == null).map((e) => e.symbol);
    if (nullCapSymbols.length === 0) return;
    setReEnriching(true);
    const result = await enrichWatchlistEntries(user.id, nullCapSymbols, fmpApiKey);
    setReEnriching(false);
    await refetchWatchlist();
    if (result.failed > 0) toast({ title: "Market data enrichment", description: `${result.succeeded} of ${result.total} succeeded, ${result.failed} failed (API limit). Use Re-enrich to retry.`, variant: "destructive" });
    else if (result.succeeded > 0) toast({ title: "Market data enrichment complete", description: `${result.succeeded} symbol${result.succeeded !== 1 ? "s" : ""} updated.` });
    else toast({ title: "No updates", description: "No market data could be fetched. Your API plan may not cover these endpoints." });
  };

  // Staleness
  const latestUpdate = useMemo(() => {
    const dates = entries.map((e) => e.last_price_update).filter(Boolean).map((d: string) => new Date(d).getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }, [entries]);
  const isStale = latestUpdate ? Date.now() - latestUpdate.getTime() > 24 * 60 * 60 * 1000 : false;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p className="text-muted-foreground">Loading watchlist...</p></div>;
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
                <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={!fmpApiKey || refreshing}>
                  <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing && refreshProgress ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}...` : "Refresh"}
                </Button>
              </TooltipTrigger>
              {!fmpApiKey && <TooltipContent>Set your FMP API key in Settings</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleReEnrich} disabled={!fmpApiKey || reEnriching || nullCapCount === 0}>
                  <DatabaseZap className={`mr-1 h-4 w-4 ${reEnriching ? "animate-spin" : ""}`} />
                  Re-enrich
                  {nullCapCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{nullCapCount}</Badge>}
                </Button>
              </TooltipTrigger>
              {!fmpApiKey && <TooltipContent>Set your FMP API key in Settings</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={() => setTagsOpen(true)}><Settings className="mr-1 h-4 w-4" />Manage Tags</Button>
          <Button variant="outline" size="sm" onClick={() => setGroupsOpen(true)}><FolderOpen className="mr-1 h-4 w-4" />Manage Groups</Button>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><Upload className="mr-1 h-4 w-4" />Bulk Import</Button>
          <Button size="sm" onClick={() => { setAddPrefill(undefined); setAddOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add to Watchlist</Button>
        </div>
      </div>

      {/* Modals */}
      <AddToWatchlistModal open={addOpen} onOpenChange={setAddOpen} tags={tags} fmpApiKey={fmpApiKey} initialSymbol={addPrefill}
        onSave={async (data, alert) => {
          const entryId = await addEntry(data);
          if (entryId && alert) {
            await createAlert({ watchlist_entry_id: entryId, symbol: data.symbol.toUpperCase(), alert_type: alert.alert_type, target_value: alert.target_value, reference_price: alert.reference_price, notify_time: alert.notify_time });
          }
        }}
      />
      <ManageTagsModal open={tagsOpen} onOpenChange={setTagsOpen} tags={tags} onCreate={createTag} onUpdate={updateTag} onDelete={deleteTag} />
      <ManageGroupsModal open={groupsOpen} onOpenChange={setGroupsOpen} groups={groups} onCreate={createGroup} onUpdate={updateGroup} onDelete={deleteGroup} />
      <BulkWatchlistImportModal open={bulkOpen} onOpenChange={setBulkOpen} existingSymbols={new Set(entries.map((e) => e.symbol.toUpperCase()))} userId={user?.id ?? ""} onImportComplete={refetchWatchlist} fmpApiKey={fmpApiKey} />

      {/* Filters */}
      <WatchlistFilters search={search} onSearchChange={setSearch} tagOptions={tagOptions} capOptions={capOptions} groupOptions={groupOptions} sectorOptions={sectorOptions}
        selectedTags={selectedTags} selectedCaps={selectedCaps} selectedGroups={selectedGroups} selectedSectors={selectedSectors}
        onToggleTag={(v) => toggleSet(setSelectedTags, v)} onToggleCap={(v) => toggleSet(setSelectedCaps, v)} onToggleGroup={(v) => toggleSet(setSelectedGroups, v)} onToggleSector={(v) => toggleSet(setSelectedSectors, v)}
        perfFilter={perfFilter} onPerfFilterChange={setPerfFilter} screenedFilter={screenedFilter} onScreenedFilterChange={setScreenedFilter}
        hasScreenHits={Object.keys(screenHitsMap).length > 0} showArchived={showArchived} onShowArchivedChange={setShowArchived} activeFilters={activeFilters} onClearFilters={clearFilters}
      />

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Eye className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Your watchlist is empty</p>
            <p className="text-sm text-muted-foreground mb-4">Track symbols you're interested in but don't own yet.</p>
            <Button onClick={() => { setAddPrefill(undefined); setAddOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add Your First Stock</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <WatchlistGroupTabs sortedGroups={sortedGroups} groupTab={groupTab} onSelect={setGroupTab} />
          <Card>
            <WatchlistBulkActions selectedIds={selectedIds} entries={entries} sortedGroups={sortedGroups}
              onArchive={archiveEntries} onUnarchive={unarchiveEntries} onAssignGroup={assignEntriesToGroup}
              onDeleteClick={() => setBulkDeleteOpen(true)} onClearSelection={() => setSelectedIds(new Set())}
            />
            <WatchlistTable
              processed={processed} sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
              expandedId={expandedId} onExpand={setExpandedId}
              selectedIds={selectedIds} onToggleSelect={toggleSelectOne} allVisibleSelected={allVisibleSelected} onToggleSelectAll={toggleSelectAll}
              groups={sortedGroups} tags={tags} screenHitsMap={screenHitsMap} getAlertsForEntry={getAlertsForEntry}
              editingNotes={editingNotes} onEditNotes={(id, val) => setEditingNotes((prev) => ({ ...prev, [id]: val }))} onNotesBlur={handleNotesBlur}
              onAddTag={addEntryTag} onRemoveTag={removeEntryTag}
              onDeleteAlertConfirm={setDeleteAlertConfirm} onAssignGroup={assignEntriesToGroup} onUnarchive={unarchiveEntries} onDeleteConfirm={setDeleteConfirm}
              createAlert={createAlert} AlertPopoverComponent={AlertPopover}
            />
          </Card>
        </>
      )}

      {/* Alerts Section */}
      <WatchlistAlertsSection
        activeAlerts={activeAlerts} triggeredAlerts={triggeredAlerts}
        alertsOpen={alertsOpen} onToggleAlerts={() => setAlertsOpen((o) => !o)}
        alertTab={alertTab} onAlertTabChange={setAlertTab}
        onDeleteAlertConfirm={setDeleteAlertConfirm}
      />

      {/* Delete entry confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteConfirm?.symbol} from watchlist?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the entry and all its tag associations. Any future alerts for this symbol will also be removed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete alert confirmation */}
      <AlertDialog open={!!deleteAlertConfirm} onOpenChange={(o) => !o && setDeleteAlertConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this price alert. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteAlertConfirm) deleteAlert(deleteAlertConfirm); setDeleteAlertConfirm(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} watchlist entries?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const syms = selectedSymbols;
                if (syms.length <= 6) return `${syms.join(", ")} will be permanently removed along with their tags and price alerts.`;
                return `${syms.slice(0, 6).join(", ")} and ${syms.length - 6} others will be permanently removed along with their tags and price alerts.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
