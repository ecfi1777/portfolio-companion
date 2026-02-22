import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TierConfig {
  key: string;
  name: string;
  target_pct: number;
}

export interface CategoryConfig {
  key: string;
  display_name: string;
  tiers: TierConfig[];
}

export interface PortfolioSettings {
  categories: CategoryConfig[];
  position_count_target: { min: number; max: number };
  fmp_api_key?: string;
  notification_email?: string;
  resend_api_key?: string;
  default_notify_time?: string;
}

/** Derive old-style category_targets from categories array */
export function getCategoryTargets(settings: PortfolioSettings): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const cat of settings.categories) {
    targets[cat.key] = cat.tiers.reduce((sum, t) => sum + t.target_pct, 0);
  }
  return targets;
}

/** Derive old-style tier_goals from categories array */
export function getTierGoals(settings: PortfolioSettings): Record<string, number> {
  const goals: Record<string, number> = {};
  for (const cat of settings.categories) {
    for (const t of cat.tiers) {
      goals[t.key] = t.target_pct;
    }
  }
  return goals;
}

/** Find the tier target_pct for a given tier key */
export function getTierTarget(tierKey: string | null, settings: PortfolioSettings): number | null {
  if (!tierKey) return null;
  for (const cat of settings.categories) {
    const t = cat.tiers.find((t) => t.key === tierKey);
    if (t) return t.target_pct;
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
        { key: "C1", name: "C1", target_pct: 8.5 },
        { key: "C2", name: "C2", target_pct: 6 },
        { key: "C3", name: "C3", target_pct: 5 },
      ],
    },
    {
      key: "TITAN",
      display_name: "Titan",
      tiers: [{ key: "TT", name: "TT", target_pct: 2.5 }],
    },
    {
      key: "CONSENSUS",
      display_name: "Consensus",
      tiers: [{ key: "CON", name: "CON", target_pct: 2.0 }],
    },
  ],
  position_count_target: { min: 25, max: 35 },
};

/** Detect old format and convert to new categories array */
function migrateOldSettings(raw: Record<string, unknown>): PortfolioSettings {
  // Already new format
  if (Array.isArray(raw.categories)) {
    return raw as unknown as PortfolioSettings;
  }

  // Old format detected — convert
  const oldTiers = (raw.tier_goals ?? {}) as Record<string, number>;
  const oldCats = (raw.category_targets ?? {}) as Record<string, number>;

  const categories: CategoryConfig[] = [
    {
      key: "CORE",
      display_name: "Core",
      tiers: [
        { key: "C1", name: "C1", target_pct: oldTiers.C1 ?? 8.5 },
        { key: "C2", name: "C2", target_pct: oldTiers.C2 ?? 6 },
        { key: "C3", name: "C3", target_pct: oldTiers.C3 ?? 5 },
      ],
    },
    {
      key: "TITAN",
      display_name: "Titan",
      tiers: [{ key: "TT", name: "TT", target_pct: oldTiers.TT ?? 2.5 }],
    },
    {
      key: "CONSENSUS",
      display_name: "Consensus",
      tiers: [{ key: "CON", name: "CON", target_pct: oldTiers.CON_MIN ?? 2.0 }],
    },
  ];

  return {
    categories,
    position_count_target: (raw.position_count_target as { min: number; max: number }) ?? DEFAULT_SETTINGS.position_count_target,
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
      const { data } = await supabase
        .from("portfolio_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        const raw = data.settings as unknown as Record<string, unknown>;
        const migrated = migrateOldSettings(raw);

        // If we migrated from old format, persist the new format
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
      setLoading(false);
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
