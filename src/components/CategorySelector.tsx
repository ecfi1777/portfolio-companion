import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Enums"]["position_category"] | null;
type Tier = string | null;

const TIER_MAP: Record<string, { value: string; label: string }[]> = {
  CORE: [
    { value: "C1", label: "C1" },
    { value: "C2", label: "C2" },
    { value: "C3", label: "C3" },
  ],
  TITAN: [{ value: "TT", label: "TT" }],
  CONSENSUS: [{ value: "CON", label: "CON" }],
};

interface CategorySelectorProps {
  positionId: string;
  category: Category;
  tier: Tier;
  onUpdate: (category: Category, tier: Tier) => void;
}

export function CategorySelector({ positionId, category, tier, onUpdate }: CategorySelectorProps) {
  const { toast } = useToast();
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

  const handleCategoryChange = (val: string) => {
    if (val === "__clear__") {
      updateField(null, null);
      return;
    }
    const newCat = val as Category;
    const tiers = TIER_MAP[val];
    const newTier = tiers?.length === 1 ? tiers[0].value : null;
    updateField(newCat, newTier);
  };

  const handleTierChange = (val: string) => {
    if (val === "__clear__") {
      updateField(category, null);
      return;
    }
    updateField(category, val);
  };

  const tierOptions = category ? TIER_MAP[category] ?? [] : [];

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Select value={category ?? ""} onValueChange={handleCategoryChange} disabled={saving}>
        <SelectTrigger className="h-7 w-[100px] text-xs border-none shadow-none bg-transparent hover:bg-muted/50 px-2">
          <SelectValue placeholder={<span className="text-muted-foreground/50">Assign</span>} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CORE">CORE</SelectItem>
          <SelectItem value="TITAN">TITAN</SelectItem>
          <SelectItem value="CONSENSUS">CONSENSUS</SelectItem>
          <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
        </SelectContent>
      </Select>

      {category && tierOptions.length > 1 && (
        <Select value={tier ?? ""} onValueChange={handleTierChange} disabled={saving}>
          <SelectTrigger className="h-7 w-[64px] text-xs border-none shadow-none bg-transparent hover:bg-muted/50 px-2">
            <SelectValue placeholder={<span className="text-muted-foreground/50">—</span>} />
          </SelectTrigger>
          <SelectContent>
            {tierOptions.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
            <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
          </SelectContent>
        </Select>
      )}

      {category && tierOptions.length === 1 && (
        <span className="text-xs text-muted-foreground px-1">{tierOptions[0].label}</span>
      )}
    </div>
  );
}
