import { Fragment, useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, ChevronRight, Banknote } from "lucide-react";
import { CategorySelector } from "@/components/CategorySelector";
import { fmt, fmtShares, fmtPct, getAccountBreakdowns, getPositionGoal, getCapitalToGoal } from "@/lib/portfolio-utils";
import { PositionDetailPanel, TagBadge } from "@/components/portfolio/PositionDetailPanel";
import type { Tables } from "@/integrations/supabase/types";
import type { PortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";

type Position = Tables<"positions">;
type TagRow = Tables<"tags">;
type Category = string | null;
type Tier = string | null;
type SortKey = "symbol" | "current_value" | "gainLossDollar" | "gainLossPct" | "weight" | "category";

/** Floating scrollbar wrapper */
function PortfolioTableWithFloatingScrollbar({ children }: { children: (ref: React.RefObject<HTMLDivElement>) => React.ReactNode }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [proxyLeft, setProxyLeft] = useState(0);
  const [proxyWidth, setProxyWidth] = useState(0);
  const syncing = useRef(false);

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

interface PortfolioTableProps {
  positions: Position[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  settings: PortfolioSettings;
  CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string }>;
  grandTotal: number;
  tierCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  allTags: TagRow[];
  positionTagMap: Record<string, string[]>;
  onCategoryUpdate: (id: string, category: Category, tier: Tier) => void;
  onDeletePosition: (id: string) => void;
  onUpdatePosition: (id: string, updates: Partial<Position>) => void;
  onAddTag: (positionId: string, tagId: string) => void;
  onRemoveTag: (positionId: string, tagId: string) => void;
  onTierSettingsChanged: () => void;
  getTagsForPosition: (positionId: string) => TagRow[];
}

export function PortfolioTable({
  positions,
  sortKey,
  sortDir,
  onSort,
  expandedId,
  onExpand,
  settings,
  CATEGORY_COLORS,
  grandTotal,
  tierCounts,
  categoryCounts,
  allTags,
  positionTagMap,
  onCategoryUpdate,
  onDeletePosition,
  onUpdatePosition,
  onAddTag,
  onRemoveTag,
  onTierSettingsChanged,
  getTagsForPosition,
}: PortfolioTableProps) {
  const { toast } = useToast();

  const SortableHead = ({ label, sortKeyName, className = "" }: { label: string; sortKeyName: SortKey; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => onSort(sortKeyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyName ? "text-foreground" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  if (positions.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">No positions yet. Import a Fidelity CSV to get started.</p>
        </div>
      </Card>
    );
  }

  return (
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
                {positions.map((p) => {
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
                        onClick={() => hasAccounts && onExpand(isExpanded ? null : p.id)}
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
                              onUpdate={(cat, tier) => onCategoryUpdate(p.id, cat, tier)}
                              onTierSettingsChanged={onTierSettingsChanged}
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
                              onUpdate={(updates) => onUpdatePosition(p.id, updates)}
                              onDelete={() => {
                                onDeletePosition(p.id);
                                toast({ title: `${p.symbol} removed from portfolio` });
                              }}
                              onCategoryUpdate={(cat, tier) => onCategoryUpdate(p.id, cat, tier)}
                              tierCounts={tierCounts}
                              categoryCounts={categoryCounts}
                              positionTags={pTags}
                              allTags={allTags}
                              onAddTag={(tagId) => onAddTag(p.id, tagId)}
                              onRemoveTag={(tagId) => onRemoveTag(p.id, tagId)}
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
  );
}
