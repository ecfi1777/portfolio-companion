import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Plus, Settings, Search, Bell } from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import { AddToWatchlistModal } from "@/components/AddToWatchlistModal";
import { ManageTagsModal } from "@/components/ManageTagsModal";

const fmtPrice = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const CAP_COLORS: Record<string, string> = {
  MEGA: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  LARGE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  MID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  SMALL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  MICRO: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  NANO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function Watchlist() {
  const { entries, tags, loading, addEntry, createTag, updateTag, deleteTag } = useWatchlist();
  const [addOpen, setAddOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.symbol.toLowerCase().includes(q) ||
        (e.company_name?.toLowerCase().includes(q) ?? false)
    );
  }, [entries, search]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading watchlist...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by symbol or company..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Eye className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Your watchlist is empty</p>
            <p className="text-sm text-muted-foreground mb-4">
              Track symbols you're interested in but don't own yet.
            </p>
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
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Day Chg %</TableHead>
                  <TableHead className="text-right">Since Added %</TableHead>
                  <TableHead>Mkt Cap</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => {
                  const dayChg =
                    entry.current_price != null && entry.previous_close != null && entry.previous_close > 0
                      ? ((entry.current_price - entry.previous_close) / entry.previous_close) * 100
                      : null;
                  const sinceAdded =
                    entry.current_price != null && entry.price_when_added != null && entry.price_when_added > 0
                      ? ((entry.current_price - entry.price_when_added) / entry.price_when_added) * 100
                      : null;
                  const dayColor =
                    dayChg == null
                      ? "text-muted-foreground"
                      : dayChg >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400";
                  const addedColor =
                    sinceAdded == null
                      ? "text-muted-foreground"
                      : sinceAdded >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400";

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.company_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtPrice(entry.current_price)}</TableCell>
                      <TableCell className={`text-right ${dayColor}`}>
                        {dayChg != null ? fmtPct(dayChg) : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${addedColor}`}>
                        {sinceAdded != null ? fmtPct(sinceAdded) : "—"}
                      </TableCell>
                      <TableCell>
                        {entry.market_cap_category ? (
                          <Badge variant="secondary" className={`text-xs ${CAP_COLORS[entry.market_cap_category] ?? ""}`}>
                            {entry.market_cap_category}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(entry.tags ?? []).map((tag) => (
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
                  );
                })}
                {filtered.length === 0 && entries.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No results for "{search}"
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
