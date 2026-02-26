import { useEffect, useState, useCallback, Fragment, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, TrendingUp, Hash, ChevronRight, Upload, ArrowUpDown, Tag, Banknote, ChevronDown, AlertTriangle, Trash2, Calendar, RefreshCw, Clock, Settings, X, Plus, Info, Pencil } from "lucide-react";
import { UpdatePortfolioModal } from "@/components/UpdatePortfolioModal";
import { ManagePortfolioDialog } from "@/components/ManagePortfolioSection";
import { CategorySelector } from "@/components/CategorySelector";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { usePortfolioSettings, type PortfolioSettings, type CategoryConfig, getCategoryTargets, getTierTarget, getCategoryForTier, getCategoryPerPositionTarget, buildTierOrder } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { fetchProfilesBatched } from "@/lib/fmp-api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Position = Tables<"positions">;
type PortfolioSummary = Tables<"portfolio_summary">;
type TagRow = Tables<"tags">;
type Category = string | null;
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

/** Convert hex color to rgba with opacity */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getHexCategoryColors(settings: PortfolioSettings): Record<string, { bg: string; bar: string; text: string }> {
  const map: Record<string, { bg: string; bar: string; text: string }> = {};
  for (const cat of settings.categories) {
    const hex = cat.color || "#64748b";
    map[cat.key] = {
      bg: hexToRgba(hex, 0.15),
      bar: hex,
      text: hex,
    };
  }
  map["Unassigned"] = {
    bg: "rgba(100, 116, 139, 0.1)",
    bar: "rgba(100, 116, 139, 0.3)",
    text: "rgba(100, 116, 139, 0.7)",
  };
  return map;
}

function getTierGoal(tier: Tier, settings: PortfolioSettings): number | null {
  return getTierTarget(tier, settings);
}

function getPositionGoal(p: { tier: Tier; category: Category }, settings: PortfolioSettings): number | null {
  if (p.tier) return getTierGoal(p.tier, settings);
  if (p.category) {
    const cat = settings.categories.find((c) => c.key === p.category);
    if (cat && cat.tiers.length === 0) return getCategoryPerPositionTarget(cat);
  }
  return null;
}

function getCapitalToGoal(
  weight: number,
  position: { tier: Tier; category: Category },
  currentValue: number,
  grandTotal: number,
  settings: PortfolioSettings
): { label: string; type: "below" | "at" | "above"; targetDollar: number; deltaDollar: number } | null {
  const goal = getPositionGoal(position, settings);
  if (goal == null) return null;

  const goalValue = (goal / 100) * grandTotal;
  const diff = goalValue - currentValue;
  const tolerance = goalValue * 0.02;

  if (Math.abs(diff) <= tolerance) return { label: "At goal", type: "at", targetDollar: goalValue, deltaDollar: diff };
  if (diff > 0) return { label: `↑ ${fmt(diff)}`, type: "below", targetDollar: goalValue, deltaDollar: diff };
  return { label: `↓ ${fmt(Math.abs(diff))}`, type: "above", targetDollar: goalValue, deltaDollar: -Math.abs(diff) };
}

/** Floating scrollbar wrapper — renders a viewport-sticky proxy scrollbar synced with the table's horizontal scroll */
function PortfolioTableWithFloatingScrollbar({ children }: { children: (ref: React.RefObject<HTMLDivElement>) => React.ReactNode }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [proxyLeft, setProxyLeft] = useState(0);
  const [proxyWidth, setProxyWidth] = useState(0);
  const syncing = useRef(false);

  // Observe whether table is in viewport & has overflow
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const container = scrollContainerRef.current;
    if (!wrapper || !container) return;

    const update = () => {
      const hasOverflow = container.scrollWidth > container.clientWidth + 1;
      setScrollWidth(container.scrollWidth);

      const rect = wrapper.getBoundingClientRect();
      setProxyLeft(rect.left);
      setProxyWidth(rect.width);
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      const nativeBarVisible = rect.bottom <= window.innerHeight;
      setVisible(hasOverflow && inView && !nativeBarVisible);
    };

    update();
    const io = new IntersectionObserver(update, { threshold: [0, 0.1, 0.5, 1] });
    io.observe(wrapper);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);

  // Sync scrolls
  useEffect(() => {
    const container = scrollContainerRef.current;
    const proxy = proxyRef.current;
    if (!container || !proxy) return;

    const onContainerScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      proxy.scrollLeft = container.scrollLeft;
      syncing.current = false;
    };
    const onProxyScroll = () => {
      if (syncing.current) return;
      syncing.current = true;
      container.scrollLeft = proxy.scrollLeft;
      syncing.current = false;
    };

    container.addEventListener("scroll", onContainerScroll, { passive: true });
    proxy.addEventListener("scroll", onProxyScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onContainerScroll);
      proxy.removeEventListener("scroll", onProxyScroll);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      {children(scrollContainerRef)}
      {/* Floating proxy scrollbar */}
      <div
        ref={proxyRef}
        className="floating-scrollbar-proxy"
        style={{
          position: "fixed",
          bottom: 0,
          left: proxyLeft,
          width: proxyWidth,
          overflowX: "auto",
          overflowY: "hidden",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.2s",
          zIndex: 20,
        }}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
    </div>
  );
}


function TagBadge({ tag, onRemove }: { tag: TagRow; onRemove?: () => void }) {
  const color = tag.color || "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border font-medium group"
      style={{
        backgroundColor: hexToRgba(color, 0.2),
        color: color,
        borderColor: hexToRgba(color, 0.4),
      }}
    >
      {tag.short_code}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function PositionDetailPanel({
  position,
  onUpdate,
  onDelete,
  onCategoryUpdate,
  tierCounts,
  categoryCounts,
  positionTags,
  allTags,
  onAddTag,
  onRemoveTag,
}: {
  position: Position;
  onUpdate: (updates: Partial<Position>) => void;
  onDelete: () => void;
  onCategoryUpdate: (cat: Category, tier: Tier) => void;
  tierCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  positionTags: TagRow[];
  allTags: TagRow[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(position.notes ?? "");
  const [source, setSource] = useState(position.source ?? "");
  const [deleting, setDeleting] = useState(false);
  const [addTagOpen, setAddTagOpen] = useState(false);

  const assignedTagIds = new Set(positionTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id) && t.is_active);

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
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>
          {firstSeen
            ? `Tracked since ${format(new Date(firstSeen), "MMM d, yyyy")}`
            : "—"}
        </span>
      </div>

      {/* Tags section */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {positionTags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} onRemove={() => onRemoveTag(tag.id)} />
          ))}
          <Popover open={addTagOpen} onOpenChange={setAddTagOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              {availableTags.length === 0 ? (
                <p className="text-xs text-muted-foreground p-1">No more tags available</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left text-sm"
                      onClick={() => { onAddTag(tag.id); setAddTagOpen(false); }}
                    >
                      <TagBadge tag={tag} />
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

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

      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reclassify:</span>
          <CategorySelector
            positionId={position.id}
            category={position.category as Category}
            tier={position.tier}
            onUpdate={onCategoryUpdate}
            tierCounts={tierCounts}
            categoryCounts={categoryCounts}
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
  const [deployOpen, setDeployOpen] = useState(true);
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  const { settings, loading: settingsLoading, refetch: refetchSettings, updateSettings } = usePortfolioSettings();
  const fmpApiKey = settings.fmp_api_key;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [autoRefreshed, setAutoRefreshed] = useState(false);

  // Tag state
  const [allTags, setAllTags] = useState<TagRow[]>([]);
  const [positionTagMap, setPositionTagMap] = useState<Record<string, string[]>>({}); // positionId -> tagId[]
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
      // Fetch watchlist entries + their tags
      const [wlRes, wlTagsRes] = await Promise.all([
        supabase.from("watchlist_entries").select("id, symbol"),
        supabase.from("watchlist_entry_tags").select("watchlist_entry_id, tag_id"),
      ]);
      if (!wlRes.data || !wlTagsRes.data) return;

      // Build symbol -> watchlist tag IDs map
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

      // Determine tags to insert
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
          // Update local state
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
      // Remove from removed_tag_ids if present
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
      // Add to removed_tag_ids
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

  // Category breakdown — driven by settings (only settings categories + Unassigned when needed)
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

  const handleStartCategoryTargetEdit = (categoryKey: string, currentTarget: number) => {
    setEditingCategoryKey(categoryKey);
    setTargetDraft(currentTarget.toFixed(2));
  };

  const handleSaveCategoryTarget = async (categoryKey: string) => {
    const parsed = Number(targetDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast({ title: "Invalid target", description: "Enter a percentage between 0 and 100.", variant: "destructive" });
      setEditingCategoryKey(null);
      setTargetDraft("");
      return;
    }

    const nextTarget = Number(parsed.toFixed(2));
    const nextCategories = settings.categories.map((cat) => {
      if (cat.key !== categoryKey) return cat;

      if (cat.tiers.length === 0) {
        return { ...cat, target_pct: nextTarget };
      }

      const currentTotal = cat.tiers.reduce((sum, t) => sum + t.allocation_pct, 0);
      if (currentTotal <= 0) {
        const base = Number((nextTarget / cat.tiers.length).toFixed(2));
        let allocated = 0;
        const tiers = cat.tiers.map((tier, idx) => {
          if (idx === cat.tiers.length - 1) {
            return { ...tier, allocation_pct: Number((nextTarget - allocated).toFixed(2)) };
          }
          allocated += base;
          return { ...tier, allocation_pct: base };
        });
        return { ...cat, tiers };
      }

      let running = 0;
      const tiers = cat.tiers.map((tier, idx) => {
        if (idx === cat.tiers.length - 1) {
          return { ...tier, allocation_pct: Number((nextTarget - running).toFixed(2)) };
        }
        const scaled = Number(((tier.allocation_pct / currentTotal) * nextTarget).toFixed(2));
        running += scaled;
        return { ...tier, allocation_pct: scaled };
      });
      return { ...cat, tiers };
    });

    await updateSettings({ ...settings, categories: nextCategories });
    setEditingCategoryKey(null);
    setTargetDraft("");
  };

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
  }, [stockPositions, grandTotal, settings]);

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
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Category Allocation Overview</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="How Portfolio Categories Work">
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-4" align="end">
                  <div className="space-y-3 text-sm">
                    <h4 className="font-semibold">How Portfolio Categories Work</h4>
                    <p className="text-muted-foreground">
                      Organize your positions into custom categories to define your ideal portfolio allocation. Each category has a target percentage of your total portfolio and a maximum number of positions.
                    </p>
                    <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Set up categories and tiers in Settings — you can have 1 to 10 categories, each with optional sub-tiers for finer control.</li>
                      <li>Assign each position to a category using the dropdown in the Category column.</li>
                      <li>The Allocation Target column shows how far each position is from its per-position target.</li>
                      <li>The category cards above show your overall progress toward each category's target allocation.</li>
                      <li>The Rebalance Capital section tells you what to buy and trim to reach your targets.</li>
                    </ul>
                    <p className="text-muted-foreground">
                      All category assignments, tags, and notes are preserved when you update your portfolio with new CSV data.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Stacked bar — invested categories + cash */}
            {(() => {
              const investedPct = grandTotal > 0 ? (totalEquity / grandTotal) * 100 : 0;
              const cashPct = grandTotal > 0 ? (cashBalance / grandTotal) * 100 : 0;
              return (
                <>
                  <div className="flex h-3 w-full rounded-full overflow-hidden">
                    {categoryBreakdown.filter((c) => c.value > 0).map((c) => {
                      const widthOfGrand = grandTotal > 0 ? (c.value / grandTotal) * 100 : 0;
                      return (
                        <div
                          key={c.key}
                          className="transition-all"
                          style={{ width: `${widthOfGrand}%`, backgroundColor: CATEGORY_COLORS[c.key]?.bar ?? "rgba(100,116,139,0.3)" }}
                        />
                      );
                    })}
                    {cashPct > 0 && (
                      <div
                        className="transition-all"
                        style={{
                          width: `${cashPct}%`,
                          background: "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(100,116,139,0.15) 2px, rgba(100,116,139,0.15) 4px)",
                          backgroundColor: "rgba(100,116,139,0.08)",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between mt-1.5 mb-4">
                    <span className="text-xs text-muted-foreground">
                      Invested: {fmt(totalEquity)} ({fmtPct(investedPct)})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Available: {fmt(cashBalance)} ({fmtPct(cashPct)})
                    </span>
                  </div>
                </>
              );
            })()}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {categoryBreakdown.map((c) => {
                const targetValue = (c.target / 100) * grandTotal;
                const deltaDollar = targetValue - c.value;
                const tolerance = targetValue * 0.02;
                const isOnTarget = !c.isUnassigned && Math.abs(deltaDollar) <= tolerance;
                const isUnder = !c.isUnassigned && deltaDollar > tolerance;
                const isEditingTarget = editingCategoryKey === c.key;

                return (
                  <div
                    key={c.key}
                    className="rounded-md border border-border/60 px-3 py-3"
                    style={{ backgroundColor: CATEGORY_COLORS[c.key]?.bg ?? "rgba(100,116,139,0.1)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[c.key]?.bar ?? "rgba(100,116,139,0.5)" }}
                      />
                      <p className="text-sm font-semibold" style={{ color: CATEGORY_COLORS[c.key]?.text ?? "inherit" }}>{c.name}</p>
                    </div>

                    <div className="mt-3 divide-y divide-border/40">
                      <div className="flex items-center justify-between py-1.5 text-xs">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-medium text-foreground">{fmt(c.value)} ({fmtPct(c.pct)})</span>
                      </div>

                      <div className="group/target flex items-center justify-between py-1.5 text-xs">
                        <span className="text-muted-foreground">Target</span>
                        {c.isUnassigned ? (
                          <span className="font-medium text-muted-foreground">—</span>
                        ) : isEditingTarget ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={targetDraft}
                              onChange={(e) => setTargetDraft(e.target.value)}
                              onBlur={() => handleSaveCategoryTarget(c.key)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveCategoryTarget(c.key);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingCategoryKey(null);
                                  setTargetDraft("");
                                }
                              }}
                              className="h-6 w-16 px-2 text-xs"
                              autoFocus
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium text-foreground"
                            onClick={() => handleStartCategoryTargetEdit(c.key, c.target)}
                          >
                            <span>{fmt(targetValue)} ({fmtPct(c.target)})</span>
                            <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover/target:opacity-100" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-1.5 text-xs">
                        <span className="text-muted-foreground">Delta</span>
                        {c.isUnassigned ? (
                          <span className="text-muted-foreground">No target</span>
                        ) : isOnTarget ? (
                          <span className="text-muted-foreground">On target</span>
                        ) : isUnder ? (
                          <span className="text-emerald-600 dark:text-emerald-400">▼ {fmt(Math.abs(deltaDollar))} under</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">▲ {fmt(Math.abs(deltaDollar))} over</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-1.5 text-xs">
                        <span className="text-muted-foreground">Positions</span>
                        {c.isUnassigned ? (
                          <span className="font-medium text-foreground">{c.count} unassigned</span>
                        ) : (
                          <span className="font-medium text-foreground">{c.count} / {c.targetPositions} positions</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
        <PortfolioTableWithFloatingScrollbar>
          {(scrollContainerRef) => (
            <Card>
              <div ref={scrollContainerRef} className="overflow-x-auto portfolio-table-hide-scrollbar">
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
                      <TableHead className="text-right">Allocation Target</TableHead>
                      <SortableHead label="Category" sortKeyName="category" />
                      <TableHead>Tags</TableHead>
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
                      const posGoal = getPositionGoal({ tier: p.tier, category: p.category as Category }, settings);
                      const capitalToGoal = isCash ? null : getCapitalToGoal(weight, { tier: p.tier, category: p.category as Category }, p.current_value ?? 0, grandTotal, settings);
                      const catColors = CATEGORY_COLORS[(p.category as string) ?? ""];
                      const pTags = isCash ? [] : getTagsForPosition(p.id);

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
                              {posGoal != null && !isCash && (
                                <div className="mt-1 h-1 w-full min-w-[48px] rounded-full bg-muted-foreground/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all opacity-70"
                                    style={{
                                      width: `${Math.min((weight / posGoal) * 100, 100)}%`,
                                      backgroundColor: catColors?.bar ?? "hsl(var(--primary))",
                                    }}
                                  />
                                </div>
                              )}
                            </TableCell>
                            {/* Capital to Goal */}
                            <TableCell className="text-right text-xs whitespace-nowrap">
                              {isCash ? "" : capitalToGoal == null ? (
                                <span className="text-muted-foreground/40">—</span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-muted-foreground">Target: {fmt(capitalToGoal.targetDollar)}</span>
                                  {capitalToGoal.type === "at" ? (
                                    <span className="text-muted-foreground">On target</span>
                                  ) : capitalToGoal.type === "above" ? (
                                    <span className="text-amber-600 dark:text-amber-400">▲ {fmt(Math.abs(capitalToGoal.deltaDollar))} over</span>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400">▼ {fmt(Math.abs(capitalToGoal.deltaDollar))} under</span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {isCash ? (
                                <span className="text-xs text-muted-foreground/50 px-2">—</span>
                              ) : (
                                <CategorySelector
                                  positionId={p.id}
                                  category={p.category as Category}
                                  tier={p.tier}
                                  onUpdate={(cat, tier) => handleCategoryUpdate(p.id, cat, tier)}
                                  onTierSettingsChanged={refetchSettings}
                                  tierCounts={tierCounts}
                                  categoryCounts={categoryCounts}
                                  portfolioTotal={grandTotal}
                                />
                              )}
                            </TableCell>
                            {/* Tags column */}
                            <TableCell>
                              {isCash ? null : pTags.length === 0 ? (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                  {pTags.slice(0, 3).map((tag) => (
                                    <TagBadge key={tag.id} tag={tag} />
                                  ))}
                                  {pTags.length > 3 && (
                                    <span className="text-xs text-muted-foreground px-1">+{pTags.length - 3}</span>
                                  )}
                                </div>
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
                              <TableCell colSpan={7}></TableCell>
                            </TableRow>
                          ))}
                          {isExpanded && !isCash && (
                            <TableRow className="bg-muted/10 border-t border-border/50">
                              <TableCell colSpan={13} className="p-0">
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
                                  categoryCounts={categoryCounts}
                                  positionTags={pTags}
                                  allTags={allTags}
                                  onAddTag={(tagId) => handleAddTag(p.id, tagId)}
                                  onRemoveTag={(tagId) => handleRemoveTag(p.id, tagId)}
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
        </PortfolioTableWithFloatingScrollbar>
      )}

      {/* Rebalance Capital */}
      {(deployCapitalList.length > 0 || overweightList.length > 0) && (
        <Collapsible open={deployOpen} onOpenChange={setDeployOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    Rebalance Capital
                    {cashBalance > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        — {fmt(cashBalance)} cash available
                      </span>
                    )}
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${deployOpen ? "rotate-180" : ""}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-6">
                {/* Underweight — Buy */}
                {deployCapitalList.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">Underweight — Buy</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Category / Tier</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead className="text-right">To Buy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deployCapitalList.map((item) => {
                          const cat = item.category ? settings.categories.find(c => c.key === item.category) : getCategoryForTier(item.tier, settings);
                          const colors = cat ? CATEGORY_COLORS[cat.key] : null;
                          return (
                            <TableRow key={item.symbol}>
                              <TableCell className="font-medium">{item.symbol}</TableCell>
                              <TableCell>
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: colors?.bg ?? "transparent",
                                    color: colors?.text ?? "inherit",
                                  }}
                                >
                                  {item.tier}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                <div>{fmt(item.currentValue)}</div>
                                <div className="text-xs">{fmtPct(item.weight)}</div>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                <div>{fmt(item.goalValue)}</div>
                                <div className="text-xs">{fmtPct(item.goal)}</div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">{fmt(item.toBuy)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Overweight — Trim */}
                {overweightList.length > 0 && (
                  <div>
                    {deployCapitalList.length > 0 && <Separator className="mb-4" />}
                    <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">Overweight — Trim</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Category / Tier</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead className="text-right">To Trim</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overweightList.map((item) => {
                          const cat = item.category ? settings.categories.find(c => c.key === item.category) : getCategoryForTier(item.tier, settings);
                          const colors = cat ? CATEGORY_COLORS[cat.key] : null;
                          return (
                            <TableRow key={item.symbol}>
                              <TableCell className="font-medium">{item.symbol}</TableCell>
                              <TableCell>
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: colors?.bg ?? "transparent",
                                    color: colors?.text ?? "inherit",
                                  }}
                                >
                                  {item.tier}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                <div>{fmt(item.currentValue)}</div>
                                <div className="text-xs">{fmtPct(item.weight)}</div>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                <div>{fmt(item.goalValue)}</div>
                                <div className="text-xs">{fmtPct(item.goal)}</div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-amber-600 dark:text-amber-400">{fmt(item.toTrim)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
