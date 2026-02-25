import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePortfolioSettings, getPerPositionTarget, getCategoryPerPositionTarget, type CategoryConfig } from "@/hooks/use-portfolio-settings";
import { Check, Settings, Info } from "lucide-react";

type Category = string | null;
type Tier = string | null;

interface CategorySelectorProps {
  positionId: string;
  category: Category;
  tier: Tier;
  onUpdate: (category: Category, tier: Tier) => void;
  onTierSettingsChanged?: () => void;
  tierCounts?: Record<string, number>;
  categoryCounts?: Record<string, number>;
  portfolioTotal?: number;
}

export function CategorySelector({ positionId, category, tier, onUpdate, onTierSettingsChanged, tierCounts = {}, categoryCounts = {}, portfolioTotal }: CategorySelectorProps) {
  const { toast } = useToast();
  const { settings, updateSettings } = usePortfolioSettings();
  const [saving, setSaving] = useState(false);

  // Inline tier edit state
  const [editAlloc, setEditAlloc] = useState<number | null>(null);
  const [editMax, setEditMax] = useState<number | null>(null);
  const [tierSaving, setTierSaving] = useState(false);
  const [tierSaved, setTierSaved] = useState(false);

  const updateField = async (newCategory: Category, newTier: Tier) => {
    setSaving(true);
    const { error } = await supabase
      .from("positions")
      .update({ category: newCategory, tier: newTier } as any)
      .eq("id", positionId);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      onUpdate(newCategory, newTier);
    }
    setSaving(false);
  };

  const handleTierSelect = (val: string) => {
    if (val === "__clear__") {
      updateField(null, null);
      return;
    }
    // Check if it's a tier-less category (prefixed with "cat:")
    if (val.startsWith("cat:")) {
      const catKey = val.substring(4);
      updateField(catKey, null);
      return;
    }
    for (const cat of settings.categories) {
      const found = cat.tiers.find((t) => t.key === val);
      if (found) {
        updateField(cat.key, found.key);
        return;
      }
    }
  };

  // Find current tier config
  const currentTierConfig = (() => {
    if (!tier) return null;
    for (const cat of settings.categories) {
      const t = cat.tiers.find((t) => t.key === tier);
      if (t) return { cat, tier: t };
    }
    return null;
  })();

  // For tier-less categories, find the category config
  const currentCatOnly = (() => {
    if (currentTierConfig) return null;
    if (!category) return null;
    return settings.categories.find((c) => c.key === category) ?? null;
  })();

  const currentLabel = (() => {
    if (currentTierConfig) return `${currentTierConfig.cat.display_name} · ${currentTierConfig.tier.name}`;
    if (currentCatOnly) return currentCatOnly.display_name;
    return null;
  })();

  // Determine select value
  const selectValue = tier ?? (category && !tier ? `cat:${category}` : "");

  const handleSaveTier = async () => {
    if (!currentTierConfig || editMax == null) return;
    setTierSaving(true);
    try {
      const newCategories = settings.categories.map((cat) => {
        if (cat.key !== currentTierConfig.cat.key) return cat;
        return {
          ...cat,
          tiers: cat.tiers.map((t) => {
            if (t.key !== currentTierConfig.tier.key) return t;
            return { ...t, max_positions: Math.max(1, Math.floor(editMax)) };
          }),
        };
      });

      await updateSettings({ ...settings, categories: newCategories });
      setTierSaved(true);
      onTierSettingsChanged?.();
      setTimeout(() => setTierSaved(false), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTierSaving(false);
    }
  };

  const fmtDollar = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const fmtPct = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

  const selectElement = (
    <Select value={selectValue} onValueChange={handleTierSelect} disabled={saving}>
      <SelectTrigger className="h-7 w-[130px] text-xs border-none shadow-none bg-transparent hover:bg-muted/50 px-2">
        <SelectValue placeholder={<span className="text-muted-foreground/50">Assign</span>}>
          {currentLabel && <span>{currentLabel}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {settings.categories.map((cat) => (
          <SelectGroup key={cat.key}>
            <SelectLabel className="text-xs text-muted-foreground">{cat.display_name}</SelectLabel>
            {cat.tiers.length > 0 ? (
              cat.tiers.map((t) => {
                const count = tierCounts[t.key] ?? 0;
                const isFull = count >= t.max_positions && t.key !== tier;
                return (
                  <SelectItem key={t.key} value={t.key} disabled={isFull}>
                    <span className={isFull ? "text-muted-foreground" : ""}>
                      {t.name}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {count}/{t.max_positions}
                      </span>
                    </span>
                  </SelectItem>
                );
              })
            ) : (
              (() => {
                const catCount = categoryCounts[cat.key] ?? 0;
                const isFull = catCount >= cat.target_positions && category !== cat.key;
                return (
                  <SelectItem key={`cat:${cat.key}`} value={`cat:${cat.key}`} disabled={isFull}>
                    <span className={isFull ? "text-muted-foreground" : ""}>
                      {cat.display_name}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {catCount}/{cat.target_positions}
                      </span>
                    </span>
                  </SelectItem>
                );
              })()
            )}
          </SelectGroup>
        ))}
        <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
      </SelectContent>
    </Select>
  );

  if (!currentTierConfig && !currentCatOnly) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {selectElement}
      </div>
    );
  }

  // Info popover content for tier-based
  if (currentTierConfig) {
    const perPos = getPerPositionTarget(currentTierConfig.tier);
    const perPosDollar = portfolioTotal != null ? (perPos / 100) * portfolioTotal : null;
    const count = tierCounts[currentTierConfig.tier.key] ?? 0;

    return (
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {selectElement}
        <Popover
          onOpenChange={(open) => {
            if (open && currentTierConfig) {
              setEditAlloc(currentTierConfig.tier.allocation_pct);
              setEditMax(currentTierConfig.tier.max_positions);
              setTierSaved(false);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" side="left" align="start">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{currentTierConfig.cat.display_name} · {currentTierConfig.tier.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Target: <span className="font-medium text-foreground">{fmtPct(perPos)}</span> per position
                  {perPosDollar != null && (
                    <span className="text-muted-foreground"> · {fmtDollar(perPosDollar)}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Slots: <span className="font-medium text-foreground">{count}/{currentTierConfig.tier.max_positions}</span> filled
                </p>
              </div>

              <div className="border-t border-border pt-2 space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Adjust Tier</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Allocation %</Label>
                    <Input
                      type="number"
                      value={currentTierConfig.tier.allocation_pct}
                      readOnly
                      disabled
                      className="h-7 text-xs opacity-60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Max Positions</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={editMax ?? currentTierConfig.tier.max_positions}
                      onChange={(e) => setEditMax(Math.max(1, Math.floor(Number(e.target.value))))}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                {editMax != null && editMax > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    → {fmtPct(currentTierConfig.tier.allocation_pct / editMax)} per position
                    {portfolioTotal != null && (
                      <span> · {fmtDollar((currentTierConfig.tier.allocation_pct / 100 / editMax) * portfolioTotal)}</span>
                    )}
                  </p>
                )}
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={handleSaveTier}
                  disabled={tierSaving || tierSaved}
                >
                  {tierSaved ? (
                    <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>
                  ) : tierSaving ? "Saving..." : (
                    <span className="flex items-center gap-1"><Settings className="h-3 w-3" /> Save Tier</span>
                  )}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Info popover for tier-less category
  if (currentCatOnly) {
    const perPos = getCategoryPerPositionTarget(currentCatOnly);
    const perPosDollar = portfolioTotal != null ? (perPos / 100) * portfolioTotal : null;
    const count = categoryCounts[currentCatOnly.key] ?? 0;

    return (
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {selectElement}
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" side="left" align="start">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{currentCatOnly.display_name}</p>
              {currentCatOnly.target_pct != null && (
                <p className="text-xs text-muted-foreground">
                  Target: <span className="font-medium text-foreground">{fmtPct(perPos)}</span> per position
                  {perPosDollar != null && (
                    <span className="text-muted-foreground"> · {fmtDollar(perPosDollar)}</span>
                  )}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Slots: <span className="font-medium text-foreground">{count}/{currentCatOnly.target_positions}</span> filled
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return null;
}
