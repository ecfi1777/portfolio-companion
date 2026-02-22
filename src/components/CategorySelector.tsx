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
import { useToast } from "@/hooks/use-toast";
import { usePortfolioSettings, type CategoryConfig } from "@/hooks/use-portfolio-settings";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Enums"]["position_category"] | null;
type Tier = string | null;

interface CategorySelectorProps {
  positionId: string;
  category: Category;
  tier: Tier;
  onUpdate: (category: Category, tier: Tier) => void;
}

export function CategorySelector({ positionId, category, tier, onUpdate }: CategorySelectorProps) {
  const { toast } = useToast();
  const { settings } = usePortfolioSettings();
  const [saving, setSaving] = useState(false);

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

  // Selecting a tier automatically sets the category
  const handleTierSelect = (val: string) => {
    if (val === "__clear__") {
      updateField(null, null);
      return;
    }
    // Find which category this tier belongs to
    for (const cat of settings.categories) {
      const found = cat.tiers.find((t) => t.key === val);
      if (found) {
        updateField(cat.key as Category, found.key);
        return;
      }
    }
  };

  // Build display label from current tier
  const currentLabel = (() => {
    if (!tier) return null;
    for (const cat of settings.categories) {
      const t = cat.tiers.find((t) => t.key === tier);
      if (t) return `${cat.display_name} · ${t.name}`;
    }
    return tier; // fallback if tier no longer in settings
  })();

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
              {cat.tiers.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
