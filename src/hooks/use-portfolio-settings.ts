import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface TierConfig {
  key: string;
  name: string;
  allocation_pct: number;
  max_positions: number;
}

export interface CategoryConfig {
  key: string;
  display_name: string;
  tiers: TierConfig[];
}

export interface PortfolioSettings {
  categories: CategoryConfig[];
  fmp_api_key?: string;
  notification_email?: string;
  resend_api_key?: string;
  default_notify_time?: string;
}

/** Per-position target for a tier = allocation_pct / max_positions */
export function getPerPositionTarget(tier: TierConfig): number {
  return tier.max_positions > 0 ? tier.allocation_pct / tier.max_positions : 0;
}

/** Derive category-level allocation targets (sum of tier allocation_pct) */
export function getCategoryTargets(settings: PortfolioSettings): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const cat of settings.categories) {
    targets[cat.key] = cat.tiers.reduce((sum, t) => sum + t.allocation_pct, 0);
  }
  return targets;
}

/** Find the per-position target_pct for a given tier key */
export function getTierTarget(tierKey: string | null, settings: PortfolioSettings): number | null {
  if (!tierKey) return null;
  for (const cat of settings.categories) {
    const t = cat.tiers.find((t) => t.key === tierKey);
    if (t) return getPerPositionTarget(t);
  }
  return null;
}

/** Find the tier config for a given tier key */
export function getTierConfig(tierKey: string | null, settings: PortfolioSettings): TierConfig | null {
  if (!tierKey) return null;
  for (const cat of settings.categories) {
    const t = cat.tiers.find((t) => t.key === tierKey);
    if (t) return t;
  }
  return null;
}

/** Find the category a tier belongs to */
export function getCategoryForTier(tierKey: string | null, settings: PortfolioSettings): CategoryConfig | null {
  if (!tierKey) return null;
  for (const cat of settings.categories) {
    if (cat.tiers.some((t) => t.key === tierKey)) return cat;
  }
  return null;
}

/** Build a tier ordering map from settings (first category's tiers first, etc.) */
export function buildTierOrder(settings: PortfolioSettings): Record<string, number> {
  const order: Record<string, number> = {};
  let idx = 0;
  for (const cat of settings.categories) {
    for (const t of cat.tiers) {
      order[t.key] = idx++;
    }
  }
  return order;
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  categories: [
    {
      key: "CORE",
      display_name: "Core",
      tiers: [
        { key: "C1", name: "C1", allocation_pct: 25.5, max_positions: 3 },
        { key: "C2", name: "C2", allocation_pct: 24.0, max_positions: 4 },
        { key: "C3", name: "C3", allocation_pct: 15.0, max_positions: 3 },
      ],
    },
    {
      key: "TITAN",
      display_name: "Titan",
      tiers: [{ key: "TT", name: "TT", allocation_pct: 25.0, max_positions: 10 }],
    },
    {
      key: "CONSENSUS",
      display_name: "Consensus",
      tiers: [{ key: "CON", name: "CON", allocation_pct: 10.5, max_positions: 5 }],
    },
  ],
};

/** Detect old format and convert to new categories array */
function migrateOldSettings(raw: Record<string, unknown>): PortfolioSettings {
  // Already new format with allocation_pct
  if (Array.isArray(raw.categories)) {
    const cats = raw.categories as Array<{
      key: string;
      display_name: string;
      tiers?: Array<{ key: string; name: string; target_pct?: number; allocation_pct?: number; max_positions?: number }>;
    }>;
    // Check if tiers use old target_pct format (no allocation_pct)
    const needsTierMigration = cats.some((cat) =>
      cat.tiers?.some((t) => t.target_pct !== undefined && t.allocation_pct === undefined)
    );
    if (needsTierMigration) {
      // Migrate target_pct -> allocation_pct with max_positions=1
      const migrated: CategoryConfig[] = cats.map((cat) => ({
        key: cat.key,
        display_name: cat.display_name,
        tiers: (cat.tiers || []).map((t) => ({
          key: t.key,
          name: t.name,
          allocation_pct: t.allocation_pct ?? t.target_pct ?? 0,
          max_positions: t.max_positions ?? 1,
        })),
      }));
      return {
        categories: migrated,
        fmp_api_key: raw.fmp_api_key as string | undefined,
        notification_email: raw.notification_email as string | undefined,
        resend_api_key: raw.resend_api_key as string | undefined,
        default_notify_time: raw.default_notify_time as string | undefined,
      };
    }
    return raw as unknown as PortfolioSettings;
  }

  // Legacy format with tier_goals / category_targets
  const oldTiers = (raw.tier_goals ?? {}) as Record<string, number>;

  const categories: CategoryConfig[] = [
    {
      key: "CORE",
      display_name: "Core",
      tiers: [
        { key: "C1", name: "C1", allocation_pct: oldTiers.C1 ?? 8.5, max_positions: 1 },
        { key: "C2", name: "C2", allocation_pct: oldTiers.C2 ?? 6, max_positions: 1 },
        { key: "C3", name: "C3", allocation_pct: oldTiers.C3 ?? 5, max_positions: 1 },
      ],
    },
    {
      key: "TITAN",
      display_name: "Titan",
      tiers: [{ key: "TT", name: "TT", allocation_pct: oldTiers.TT ?? 2.5, max_positions: 1 }],
    },
    {
      key: "CONSENSUS",
      display_name: "Consensus",
      tiers: [{ key: "CON", name: "CON", allocation_pct: oldTiers.CON_MIN ?? 2.0, max_positions: 1 }],
    },
  ];

  return {
    categories,
    fmp_api_key: raw.fmp_api_key as string | undefined,
    notification_email: raw.notification_email as string | undefined,
    resend_api_key: raw.resend_api_key as string | undefined,
    default_notify_time: raw.default_notify_time as string | undefined,
  };
}

export function usePortfolioSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("portfolio_settings")
          .select("settings")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const raw = data.settings as unknown as Record<string, unknown>;
          const migrated = migrateOldSettings(raw);

          // Only auto-save for legacy tier_goals format
          // Do NOT auto-save target_pct -> allocation_pct migration (let user review)
          if (!Array.isArray(raw.categories)) {
            await supabase
              .from("portfolio_settings")
              .update({ settings: migrated as unknown as Record<string, never> })
              .eq("user_id", user.id);
          }

          setSettings(migrated);
        } else {
          await supabase.from("portfolio_settings").insert([{
            user_id: user.id,
            settings: DEFAULT_SETTINGS as unknown as Record<string, never>,
          }]);
        }
      } catch (err) {
        console.error("Failed to load portfolio settings:", err);
        toast({
          title: "Settings load failed",
          description: "Could not load portfolio settings. Using defaults.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const updateSettings = useCallback(
    async (next: PortfolioSettings) => {
      if (!user) return;
      setSettings(next);
      await supabase
        .from("portfolio_settings")
        .update({ settings: next as unknown as Record<string, never> })
        .eq("user_id", user.id);
    },
    [user]
  );

  return { settings, updateSettings, loading };
}
