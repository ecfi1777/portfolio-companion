import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Eye, Plus, Settings, Search, Bell, ChevronDown, ChevronUp, ArrowUpDown, Trash2, X, Tag as TagIcon,
} from "lucide-react";
import { useWatchlist, type WatchlistEntry } from "@/hooks/use-watchlist";
import { AddToWatchlistModal } from "@/components/AddToWatchlistModal";
import { ManageTagsModal } from "@/components/ManageTagsModal";
import { formatMarketCap } from "@/lib/market-cap";

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
    addEntryTag, removeEntryTag, createTag, updateTag, deleteTag,
  } = useWatchlist();

  const [addOpen, setAddOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WatchlistEntry | null>(null);

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
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTagsOpen(true)}>
            <Settings className="mr-1 h-4 w-4" />
            Manage Tags
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add to Watchlist
          </Button>
        </div>
      </div>

      <AddToWatchlistModal open={addOpen} onOpenChange={setAddOpen} tags={tags} onSave={addEntry} />
      <ManageTagsModal open={tagsOpen} onOpenChange={setTagsOpen} tags={tags} onCreate={createTag} onUpdate={updateTag} onDelete={deleteTag} />

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
            <Button onClick={() => setAddOpen(true)}>
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
                          <Bell className="h-4 w-4 text-muted-foreground/30" />
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

      {/* Delete confirmation */}
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
    </div>
  );
}
