import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload, FileSearch, ChevronDown, ChevronUp, Trash2, Plus,
} from "lucide-react";
import { useScreens, type ScreenRun } from "@/hooks/use-screens";
import { useWatchlist, type WatchlistEntry } from "@/hooks/use-watchlist";
import { AddToWatchlistModal, type AddToWatchlistData } from "@/components/AddToWatchlistModal";
import { ScreenUploadModal } from "@/components/ScreenUploadModal";
import { OverlapDetailModal } from "@/components/OverlapDetailModal";
import { usePortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useAlerts } from "@/hooks/use-alerts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type Position = Tables<"positions">;

const SCREEN_COLORS = ["#5865F2", "#57F287", "#FEE75C", "#ED4245", "#EB459E", "#9B59B6", "#3498DB", "#E67E22"];

export default function Screens() {
  const { user } = useAuth();
  const { screens, runs, createScreen, createRun, deleteScreen, loading } = useScreens();
  const { entries, tags, addEntry, refetch: refetchWatchlist } = useWatchlist();
  const { settings } = usePortfolioSettings();
  const { createAlert } = useAlerts();
  const fmpApiKey = settings.fmp_api_key;

  const [screenOpen, setScreenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<string | undefined>(undefined);

  // Screen history state
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [deleteScreenConfirm, setDeleteScreenConfirm] = useState<{ id: string; name: string } | null>(null);

  // Overlap sections
  const [screenOverlapOpen, setScreenOverlapOpen] = useState(true);
  const [portfolioOverlapOpen, setPortfolioOverlapOpen] = useState(true);
  const [watchlistOverlapOpen, setWatchlistOverlapOpen] = useState(true);
  const [overlapModal, setOverlapModal] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  // Portfolio positions
  const [positions, setPositions] = useState<Position[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from("positions").select("*").then(({ data }) => {
      if (data) setPositions(data as Position[]);
    });
  }, [user]);

  const onQuickAdd = (sym: string) => {
    setAddPrefill(sym);
    setAddOpen(true);
  };

  // Latest run per screen
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

  const watchlistSymbolSet = useMemo(() => new Set(entries.map((e) => e.symbol.toUpperCase())), [entries]);
  const portfolioSymbolSet = useMemo(() => new Set(positions.map((p) => p.symbol.toUpperCase())), [positions]);

  // Total portfolio value for weight calc
  const totalPortfolioValue = useMemo(
    () => positions.reduce((sum, p) => sum + (p.current_value ?? 0), 0),
    [positions]
  );

  // Cross-screen symbols (2+ screens)
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

  // Portfolio overlap
  const portfolioOverlapData = useMemo(() => {
    const symbolScreens = new Map<string, number[]>();
    latestByScreen.forEach((run, idx) => {
      for (const sym of getSymbols(run)) {
        const upper = sym.toUpperCase();
        if (portfolioSymbolSet.has(upper)) {
          if (!symbolScreens.has(upper)) symbolScreens.set(upper, []);
          if (!symbolScreens.get(upper)!.includes(idx)) symbolScreens.get(upper)!.push(idx);
        }
      }
    });
    return Array.from(symbolScreens.entries())
      .map(([symbol, indices]) => {
        const pos = positions.find((p) => p.symbol.toUpperCase() === symbol);
        const weight = totalPortfolioValue > 0 && pos?.current_value
          ? (pos.current_value / totalPortfolioValue) * 100 : 0;
        return { symbol, screenIndices: indices.sort(), weight };
      })
      .sort((a, b) => b.screenIndices.length - a.screenIndices.length || a.symbol.localeCompare(b.symbol));
  }, [latestByScreen, portfolioSymbolSet, positions, totalPortfolioValue]);

  // Watchlist matches
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

  // Overlap matrix helpers
  const overlapCount = (a: typeof runs[number], b: typeof runs[number]) => {
    const setA = new Set(getSymbols(a).map((s) => s.toUpperCase()));
    return getSymbols(b).filter((s) => setA.has(s.toUpperCase())).length;
  };

  const fmtPct = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading screens...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Screens</h1>
        <Button size="sm" onClick={() => setScreenOpen(true)}>
          <Upload className="mr-1 h-4 w-4" />
          Upload Screen
        </Button>
      </div>

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
              notify_time: alert.notify_time,
            });
          }
        }}
      />

      {/* ── Screen Upload & History ── */}
      <div className="space-y-3">
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setHistoryOpen((o) => !o)}
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Screen History
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
          </h2>
          {historyOpen && (
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

        {historyOpen && (
          <>
            {runs.length > 0 && (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="whitespace-nowrap">Screen</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total Symbols</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Watchlist Matches</TableHead>
                        <TableHead className="whitespace-nowrap">Auto Tag</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs
                        .filter((r) => historyFilter === "all" || r.screen_id === historyFilter)
                        .map((run) => {
                          const isRunExpanded = expandedRunId === run.id;
                          const matchedSymbols = run.matched_symbols ?? [];
                          const matchedSet = new Set(matchedSymbols.map((s) => s.toUpperCase()));
                          const wlSymbols = new Set(entries.map((e) => e.symbol.toUpperCase()));
                          return (
                            <React.Fragment key={run.id}>
                              <TableRow
                                className="cursor-pointer"
                                onClick={() => setExpandedRunId(isRunExpanded ? null : run.id)}
                              >
                                <TableCell className="w-8">
                                  {isRunExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </TableCell>
                                <TableCell className="text-sm whitespace-nowrap">{new Date(run.run_date).toLocaleDateString()}</TableCell>
                                <TableCell className="text-sm font-medium whitespace-nowrap">{run.screen?.name ?? "—"}</TableCell>
                                <TableCell className="text-right text-sm">{run.total_symbols}</TableCell>
                                <TableCell className="text-right text-sm">{run.match_count}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {run.auto_tag_code && (
                                    <Badge variant="secondary" className="text-xs">{run.auto_tag_code}</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="w-10 text-right">
                                  <button
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const screen = screens.find((s) => s.id === run.screen_id);
                                      if (screen) setDeleteScreenConfirm({ id: screen.id, name: screen.name });
                                    }}
                                    title="Delete screen"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TableCell>
                              </TableRow>
                              {isRunExpanded && (() => {
                                const allSyms = (run.all_symbols ?? []).length > 0 ? run.all_symbols! : matchedSymbols;
                                const inWl = allSyms.filter((s) => wlSymbols.has(s.toUpperCase()));
                                const notInWl = allSyms.filter((s) => !wlSymbols.has(s.toUpperCase()));
                                return (
                                  <TableRow>
                                    <TableCell colSpan={7} className="bg-muted/30 p-4">
                                      <div className="space-y-4">
                                        {inWl.length > 0 && (
                                          <div>
                                            <h4 className="text-sm font-medium mb-2">In Your Watchlist ({inWl.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                              {inWl.map((sym) => (
                                                <Badge key={sym} variant="default" className="text-xs">{sym}</Badge>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {inWl.length > 0 && notInWl.length > 0 && (
                                          <div className="border-t border-border" />
                                        )}
                                        {notInWl.length > 0 && (
                                          <div>
                                            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Not in Watchlist ({notInWl.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                              {notInWl.map((sym) => (
                                                <div key={sym} className="flex items-center gap-1">
                                                  <Badge variant="outline" className="text-xs opacity-60">{sym}</Badge>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 w-5 p-0"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      onQuickAdd(sym);
                                                    }}
                                                    title={`Add ${sym} to watchlist`}
                                                  >
                                                    <Plus className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })()}
                            </React.Fragment>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Screen-to-Screen Overlap ── */}
      {latestByScreen.length >= 2 && (
        <div className="space-y-3">
          <div
            className="flex items-center cursor-pointer select-none gap-2"
            onClick={() => setScreenOverlapOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Screen-to-Screen Overlap
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${screenOverlapOpen ? "rotate-180" : ""}`} />
            </h2>
          </div>
          {screenOverlapOpen && (
            <div className="space-y-4">
              {/* Matrix (numeric only, no click-expand) */}
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
                            const count = ri === ci ? getSymbols(row).length : overlapCount(row, col);
                            const isDiag = ri === ci;
                            const maxPossible = Math.min(getSymbols(row).length, getSymbols(col).length);
                            const intensity = !isDiag && maxPossible > 0 ? count / maxPossible : 0;
                            return (
                              <TableCell
                                key={col.id}
                                className={`text-center text-sm tabular-nums ${isDiag ? "bg-muted font-medium" : "cursor-pointer hover:ring-1 hover:ring-primary/50"}`}
                                style={
                                  !isDiag && intensity > 0
                                    ? { backgroundColor: `hsl(var(--primary) / ${(intensity * 0.3 + 0.05).toFixed(2)})` }
                                    : undefined
                                }
                                onClick={!isDiag && count > 0 ? () => setOverlapModal({ rowIdx: ri, colIdx: ci }) : undefined}
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
              </Card>

              {overlapModal && (() => {
                const rowRun = latestByScreen[overlapModal.rowIdx];
                const colRun = latestByScreen[overlapModal.colIdx];
                return (
                  <OverlapDetailModal
                    open={true}
                    onOpenChange={(v) => { if (!v) setOverlapModal(null); }}
                    screenA={{
                      name: rowRun.screen?.name ?? "Screen",
                      color: SCREEN_COLORS[overlapModal.rowIdx % SCREEN_COLORS.length],
                      symbols: getSymbols(rowRun),
                    }}
                    screenB={{
                      name: colRun.screen?.name ?? "Screen",
                      color: SCREEN_COLORS[overlapModal.colIdx % SCREEN_COLORS.length],
                      symbols: getSymbols(colRun),
                    }}
                    watchlistSymbols={watchlistSymbolSet}
                    portfolioSymbols={portfolioSymbolSet}
                    fmpApiKey={fmpApiKey}
                    onAdd={(data) => addEntry(data)}
                  />
                );
              })()}

              {/* Symbols in Multiple Screens */}
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
                          <TableHead className="whitespace-nowrap">Symbol</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Signal Count</TableHead>
                          <TableHead className="whitespace-nowrap">Screens</TableHead>
                          <TableHead className="w-20 whitespace-nowrap">Watchlist</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {crossScreenData.map(({ symbol, screenIndices }) => {
                          const inWatchlist = watchlistSymbolSet.has(symbol);
                          return (
                            <TableRow key={symbol}>
                              <TableCell className="font-medium text-sm">{symbol}</TableCell>
                              <TableCell className="text-right text-sm">{screenIndices.length}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 flex-nowrap">
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
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onQuickAdd(symbol)}>
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
            </div>
          )}
        </div>
      )}

      {/* ── Screen-to-Portfolio Overlap ── */}
      {latestByScreen.length > 0 && portfolioOverlapData.length > 0 && (
        <div className="space-y-3">
          <div
            className="flex items-center cursor-pointer select-none gap-2"
            onClick={() => setPortfolioOverlapOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Screen-to-Portfolio Overlap
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${portfolioOverlapOpen ? "rotate-180" : ""}`} />
            </h2>
          </div>
          {portfolioOverlapOpen && (
            <Card>
              <div className="p-4 pb-2">
                <h3 className="text-sm font-semibold">Portfolio Holdings in Screens</h3>
                <p className="text-xs text-muted-foreground">
                  {portfolioOverlapData.length} portfolio positions found across uploaded screens.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Signal Count</TableHead>
                      <TableHead>Screen Sources</TableHead>
                      <TableHead className="text-right">Portfolio Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioOverlapData.map(({ symbol, screenIndices, weight }) => (
                      <TableRow key={symbol}>
                        <TableCell className="font-medium text-sm">{symbol}</TableCell>
                        <TableCell className="text-sm">{screenIndices.length}</TableCell>
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
                        <TableCell className="text-right text-sm">{fmtPct(weight)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Screen-to-Watchlist Overlap ── */}
      {latestByScreen.length > 0 && watchlistMatches.length > 0 && (
        <div className="space-y-3">
          <div
            className="flex items-center cursor-pointer select-none gap-2"
            onClick={() => setWatchlistOverlapOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Screen-to-Watchlist Overlap
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${watchlistOverlapOpen ? "rotate-180" : ""}`} />
            </h2>
          </div>
          {watchlistOverlapOpen && (
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
      )}

      {/* Empty state */}
      {screens.length === 0 && runs.length === 0 && (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <FileSearch className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">No screens uploaded yet</p>
            <p className="text-sm text-muted-foreground mb-4">Upload a CSV from a stock screener to cross-reference against your portfolio and watchlist.</p>
            <Button onClick={() => setScreenOpen(true)}>
              <Upload className="mr-1 h-4 w-4" />
              Upload Your First Screen
            </Button>
          </div>
        </Card>
      )}

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
