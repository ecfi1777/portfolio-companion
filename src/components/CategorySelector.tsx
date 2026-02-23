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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePortfolioSettings, getPerPositionTarget, type CategoryConfig } from "@/hooks/use-portfolio-settings";
import { Check, Settings } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Enums"]["position_category"] | null;
type Tier = string | null;

interface CategorySelectorProps {
  positionId: string;
  category: Category;
  tier: Tier;
  onUpdate: (category: Category, tier: Tier) => void;
  tierCounts?: Record<string, number>;
  portfolioTotal?: number;
}

export function CategorySelector({ positionId, category, tier, onUpdate, tierCounts = {}, portfolioTotal }: CategorySelectorProps) {
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
      .update({ category: newCategory, tier: newTier })
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
    for (const cat of settings.categories) {
      const found = cat.tiers.find((t) => t.key === val);
      if (found) {
        updateField(cat.key as Category, found.key);
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

  const currentLabel = (() => {
    if (!currentTierConfig) return null;
    return `${currentTierConfig.cat.display_name} · ${currentTierConfig.tier.name}`;
  })();

  const handleSaveTier = async () => {
    if (!currentTierConfig || editAlloc == null || editMax == null) return;
    setTierSaving(true);
    try {
      const newCategories = settings.categories.map((cat) => {
        if (cat.key !== currentTierConfig.cat.key) return cat;
        return {
          ...cat,
          tiers: cat.tiers.map((t) => {
            if (t.key !== currentTierConfig.tier.key) return t;
            return { ...t, allocation_pct: editAlloc, max_positions: Math.max(1, Math.floor(editMax)) };
          }),
        };
      });

      // Check total
      const total = newCategories.reduce(
        (sum, cat) => sum + cat.tiers.reduce((s, t) => s + t.allocation_pct, 0),
        0
      );
      if (Math.abs(total - 100) > 0.01) {
        toast({ title: "Cannot save", description: `Total allocation would be ${total.toFixed(1)}% (must be 100%).`, variant: "destructive" });
        setTierSaving(false);
        return;
      }

      await updateSettings({ ...settings, categories: newCategories });
      setTierSaved(true);
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
    <Select value={tier ?? ""} onValueChange={handleTierSelect} disabled={saving}>
      <SelectTrigger className="h-7 w-[130px] text-xs border-none shadow-none bg-transparent hover:bg-muted/50 px-2">
        <SelectValue placeholder={<span className="text-muted-foreground/50">Assign</span>}>
          {currentLabel && <span>{currentLabel}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {settings.categories.map((cat) => (
          <SelectGroup key={cat.key}>
            <SelectLabel className="text-xs text-muted-foreground">{cat.display_name}</SelectLabel>
            {cat.tiers.map((t) => {
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
            })}
          </SelectGroup>
        ))}
        <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
      </SelectContent>
    </Select>
  );

  if (!currentTierConfig) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {selectElement}
      </div>
    );
  }

  const perPos = getPerPositionTarget(currentTierConfig.tier);
  const perPosDollar = portfolioTotal != null ? (perPos / 100) * portfolioTotal : null;
  const count = tierCounts[currentTierConfig.tier.key] ?? 0;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <HoverCard
        openDelay={300}
        closeDelay={200}
        onOpenChange={(open) => {
          if (open && currentTierConfig) {
            setEditAlloc(currentTierConfig.tier.allocation_pct);
            setEditMax(currentTierConfig.tier.max_positions);
            setTierSaved(false);
          }
        }}
      >
        <HoverCardTrigger asChild>
          {selectElement}
        </HoverCardTrigger>
        <HoverCardContent className="w-64 p-3" side="left" align="start">
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
                    step="0.5"
                    min="0"
                    value={editAlloc ?? currentTierConfig.tier.allocation_pct}
                    onChange={(e) => setEditAlloc(Number(e.target.value))}
                    className="h-7 text-xs"
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
              {editAlloc != null && editMax != null && editMax > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  → {fmtPct(editAlloc / editMax)} per position
                  {portfolioTotal != null && (
                    <span> · {fmtDollar((editAlloc / 100 / editMax) * portfolioTotal)}</span>
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
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
