import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EyeOff, Trash2, X, Tag as TagIcon, Bell, BellRing } from "lucide-react";
import { fmtPrice, fmtPct, fmtDollar, pctColor, calcDayChg, calcSinceAdded, CAP_COLORS } from "@/lib/watchlist-utils";
import { formatMarketCap } from "@/lib/market-cap";
import type { WatchlistEntry, WatchlistGroup } from "@/hooks/use-watchlist";
import type { PriceAlert, AlertType } from "@/hooks/use-alerts";
import { toast } from "@/hooks/use-toast";

interface WatchlistEntryDetailProps {
  entry: WatchlistEntry;
  entryTags: { id: string; short_code: string; color: string | null; full_name: string | null }[];
  availableTags: { id: string; short_code: string; color: string | null; full_name: string | null; is_active: boolean }[];
  entryAlerts: PriceAlert[];
  sortedGroups: WatchlistGroup[];
  editingNotes: Record<string, string>;
  onEditNotes: (id: string, value: string) => void;
  onNotesBlur: (id: string) => void;
  onAddTag: (entryId: string, tagId: string) => void;
  onRemoveTag: (entryId: string, tagId: string) => void;
  onDeleteAlertConfirm: (alertId: string) => void;
  onAssignGroup: (ids: string[], groupId: string | null) => Promise<void>;
  onUnarchive: (ids: string[]) => Promise<void>;
  onDeleteConfirm: (entry: WatchlistEntry) => void;
  isArchived: boolean;
  AlertPopoverComponent: React.ComponentType<{
    entryId: string;
    symbol: string;
    currentPrice: number | null;
    createAlert: (data: {
      watchlist_entry_id: string;
      symbol: string;
      alert_type: AlertType;
      target_value: number;
      reference_price?: number;
      notify_time?: string;
    }) => Promise<void>;
  }>;
  createAlert: (data: {
    watchlist_entry_id: string;
    symbol: string;
    alert_type: AlertType;
    target_value: number;
    reference_price?: number;
    notify_time?: string;
  }) => Promise<void>;
}

export function WatchlistEntryDetail({
  entry,
  entryTags,
  availableTags,
  entryAlerts,
  sortedGroups,
  editingNotes,
  onEditNotes,
  onNotesBlur,
  onAddTag,
  onRemoveTag,
  onDeleteAlertConfirm,
  onAssignGroup,
  onUnarchive,
  onDeleteConfirm,
  isArchived,
  AlertPopoverComponent,
  createAlert,
}: WatchlistEntryDetailProps) {
  const sinceAdded = calcSinceAdded(entry);

  return (
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

        {/* Group section */}
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Group</h4>
        <Select
          value={entry.group_id ?? "__none__"}
          onValueChange={async (v) => {
            await onAssignGroup([entry.id], v === "__none__" ? null : v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue placeholder="Ungrouped" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">Ungrouped</SelectItem>
            {sortedGroups.map((g) => (
              <SelectItem key={g.id} value={g.id} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color ?? "#888" }} />
                  {g.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
                onClick={() => onRemoveTag(entry.id, tag.id)}
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
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDeleteAlertConfirm(a.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No alerts set</p>
        )}
        <AlertPopoverComponent entryId={entry.id} symbol={entry.symbol} currentPrice={entry.current_price} createAlert={createAlert} />
      </div>

      {/* Notes + Actions */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
        <Textarea
          className="text-sm min-h-[80px] resize-none"
          placeholder="Add notes..."
          value={editingNotes[entry.id] ?? entry.notes ?? ""}
          onChange={(e) => onEditNotes(entry.id, e.target.value)}
          onBlur={() => onNotesBlur(entry.id)}
        />
        {isArchived && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full mt-2"
            onClick={async () => {
              await onUnarchive([entry.id]);
              toast({ title: `Unarchived ${entry.symbol}` });
            }}
          >
            <EyeOff className="mr-1 h-4 w-4" />
            Unarchive
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          className="w-full mt-2"
          onClick={() => onDeleteConfirm(entry)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Remove from Watchlist
        </Button>
      </div>
    </div>
  );
}
