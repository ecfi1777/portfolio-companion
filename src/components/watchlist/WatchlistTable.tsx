import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, BellRing, Plus, X } from "lucide-react";
import { SortHeader } from "@/components/watchlist/SortHeader";
import { WatchlistEntryDetail } from "@/components/watchlist/WatchlistEntryDetail";
import { fmtPrice, fmtPct, CAP_COLORS, calcDayChg, calcSinceAdded, pctColor } from "@/lib/watchlist-utils";
import { type WatchlistEntry, type WatchlistGroup } from "@/hooks/use-watchlist";
import { type AlertType, type PriceAlert } from "@/hooks/use-alerts";

type SortKey = "symbol" | "price" | "dayChg" | "sinceAdded" | "marketCap" | "dateAdded" | "heat";
type SortDir = "asc" | "desc";

type SymbolScreenData = {
  screens: { name: string; short_code: string; color: string | null }[];
  heat_score: number;
};

interface Tag {
  id: string;
  short_code: string;
  full_name: string | null;
  color: string | null;
  is_active: boolean;
}

interface WatchlistTableProps {
  processed: WatchlistEntry[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  groups: WatchlistGroup[];
  tags: Tag[];
  screenHitsMap: Record<string, SymbolScreenData>;
  getAlertsForEntry: (entryId: string) => PriceAlert[];
  editingNotes: Record<string, string>;
  onEditNotes: (id: string, val: string) => void;
  onNotesBlur: (id: string) => void;
  onAddTag: (entryId: string, tagId: string) => void;
  onRemoveTag: (entryId: string, tagId: string) => void;
  onDeleteAlertConfirm: (id: string) => void;
  onAssignGroup: (entryIds: string[], groupId: string | null) => Promise<void>;
  onUnarchive: (ids: string[]) => Promise<void>;
  onDeleteConfirm: (entry: WatchlistEntry) => void;
  createAlert: (data: {
    watchlist_entry_id: string;
    symbol: string;
    alert_type: AlertType;
    target_value: number;
    reference_price?: number;
    notify_time?: string;
  }) => Promise<void>;
  AlertPopoverComponent: React.ComponentType<{
    entryId: string;
    symbol: string;
    currentPrice: number | null;
    createAlert: WatchlistTableProps["createAlert"];
  }>;
}

export function WatchlistTable({
  processed,
  sortKey,
  sortDir,
  onSort,
  expandedId,
  onExpand,
  selectedIds,
  onToggleSelect,
  allVisibleSelected,
  onToggleSelectAll,
  groups,
  tags,
  screenHitsMap,
  getAlertsForEntry,
  editingNotes,
  onEditNotes,
  onNotesBlur,
  onAddTag,
  onRemoveTag,
  onDeleteAlertConfirm,
  onAssignGroup,
  onUnarchive,
  onDeleteConfirm,
  createAlert,
  AlertPopoverComponent,
}: WatchlistTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[3%]" />
          <col className="w-[7%]" />
          <col className="w-[16%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[14%]" />
          <col className="w-[6%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={allVisibleSelected} onCheckedChange={onToggleSelectAll} />
            </TableHead>
            <SortHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="whitespace-nowrap" />
            <TableHead>Company</TableHead>
            <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-right whitespace-nowrap" />
            <SortHeader label="Day %" sortKey="dayChg" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-right whitespace-nowrap" />
            <SortHeader label="Since Add %" sortKey="sinceAdded" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-right whitespace-nowrap" />
            <SortHeader label="Mkt Cap" sortKey="marketCap" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-center whitespace-nowrap" />
            <TableHead>Group</TableHead>
            <TableHead>Tags</TableHead>
            <SortHeader label="Screens" sortKey="heat" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="whitespace-nowrap" />
            <TableHead></TableHead>
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
            const screenData = screenHitsMap[entry.symbol.toUpperCase()];
            const isArchived = !!entry.archived_at;

            return (
              <React.Fragment key={entry.id}>
                <TableRow
                  className={`cursor-pointer ${isArchived ? "opacity-50" : ""}`}
                  onClick={() => onExpand(isExpanded ? null : entry.id)}
                >
                  <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => onToggleSelect(entry.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {entry.symbol}
                      {isArchived && (
                        <Badge variant="secondary" className="text-[10px] opacity-75">Archived</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate overflow-hidden">{entry.company_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtPrice(entry.current_price)}</TableCell>
                  <TableCell className={`text-right tabular-nums whitespace-nowrap ${pctColor(dayChg)}`}>
                    {dayChg != null ? fmtPct(dayChg) : "—"}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums whitespace-nowrap ${pctColor(sinceAdded)}`}>
                    {sinceAdded != null ? fmtPct(sinceAdded) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {entry.market_cap_category ? (
                      <Badge variant="secondary" className={`text-xs ${CAP_COLORS[entry.market_cap_category] ?? ""}`}>
                        {entry.market_cap_category}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm truncate" title={groups.find(g => g.id === entry.group_id)?.name ?? undefined}>
                    {groups.find(g => g.id === entry.group_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-1">
                      {entryTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium border group/tag"
                          style={{
                            backgroundColor: tag.color ? `${tag.color}20` : undefined,
                            color: tag.color ?? undefined,
                            borderColor: tag.color ? `${tag.color}40` : undefined,
                          }}
                        >
                          {tag.short_code}
                          <button
                            onClick={() => onRemoveTag(entry.id, tag.id)}
                            className="opacity-0 group-hover/tag:opacity-100 hover:opacity-70 transition-opacity -mr-0.5"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                      {availableTags.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="inline-flex items-center justify-center rounded-full border border-dashed border-border h-5 w-5 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                              <Plus className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-1" align="start">
                            {availableTags.map((t) => (
                              <button
                                key={t.id}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                                onClick={() => onAddTag(entry.id, t.id)}
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
                  </TableCell>
                  <TableCell>
                    {screenData ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {screenData.screens.map((s, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border"
                            style={{
                              backgroundColor: s.color ? `${s.color}20` : undefined,
                              color: s.color ?? undefined,
                              borderColor: s.color ? `${s.color}40` : undefined,
                            }}
                          >
                            {s.short_code}
                          </span>
                        ))}
                        {screenData.heat_score >= 2 && (
                          <span className="text-[10px] text-muted-foreground" title={`Heat score: ${screenData.heat_score}`}>
                            {"🔥".repeat(Math.min(screenData.heat_score, 5))}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    )}
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
                    <TableCell colSpan={11} className="p-0">
                      <WatchlistEntryDetail
                        entry={entry}
                        entryTags={entryTags}
                        availableTags={availableTags}
                        entryAlerts={entryAlerts}
                        sortedGroups={groups}
                        editingNotes={editingNotes}
                        onEditNotes={onEditNotes}
                        onNotesBlur={onNotesBlur}
                        onAddTag={onAddTag}
                        onRemoveTag={onRemoveTag}
                        onDeleteAlertConfirm={onDeleteAlertConfirm}
                        onAssignGroup={onAssignGroup}
                        onUnarchive={onUnarchive}
                        onDeleteConfirm={onDeleteConfirm}
                        isArchived={isArchived}
                        AlertPopoverComponent={AlertPopoverComponent}
                        createAlert={createAlert}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
          {processed.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                No results matching your filters
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
