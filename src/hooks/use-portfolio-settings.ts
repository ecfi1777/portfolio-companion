import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PortfolioSettings {
  category_targets: { CORE: number; TITAN: number; CONSENSUS: number };
  position_count_target: { min: number; max: number };
  tier_goals: {
    C1: number; C2: number; C3: number;
    TT: number; CON_MIN: number; CON_MAX: number;
  };
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  category_targets: { CORE: 50, TITAN: 25, CONSENSUS: 25 },
  position_count_target: { min: 25, max: 35 },
  tier_goals: { C1: 8.5, C2: 6, C3: 5, TT: 2.5, CON_MIN: 1, CON_MAX: 5 },
};

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
        setSettings(data.settings as unknown as PortfolioSettings);
      } else {
        // Insert default row
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
