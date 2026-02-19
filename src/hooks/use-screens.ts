import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Screen {
  id: string;
  user_id: string;
  name: string;
  short_code: string;
  created_at: string;
}

export interface ScreenRun {
  id: string;
  user_id: string;
  screen_id: string;
  run_date: string;
  run_number: number;
  total_symbols: number;
  match_count: number;
  matched_symbols: string[];
  auto_tag_id: string | null;
  auto_tag_code: string | null;
  created_at: string;
  screen?: Screen;
}

export function useScreens() {
  const { user } = useAuth();
  const [screens, setScreens] = useState<Screen[]>([]);
  const [runs, setRuns] = useState<ScreenRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [screensRes, runsRes] = await Promise.all([
      supabase.from("screens").select("*").order("created_at", { ascending: false }),
      supabase.from("screen_runs").select("*").order("created_at", { ascending: false }),
    ]);
    setScreens((screensRes.data ?? []) as Screen[]);
    setRuns((runsRes.data ?? []) as ScreenRun[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Enrich runs with screen info
  const enrichedRuns = runs.map((r) => ({
    ...r,
    screen: screens.find((s) => s.id === r.screen_id),
  }));

  const createScreen = async (name: string, shortCode: string): Promise<Screen | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("screens")
      .insert({ user_id: user.id, name: name.trim(), short_code: shortCode.toUpperCase().trim() })
      .select()
      .single();
    if (error) return null;
    const screen = data as Screen;
    setScreens((prev) => [screen, ...prev]);
    return screen;
  };

  const createRun = async (run: {
    screen_id: string;
    run_date: string;
    run_number: number;
    total_symbols: number;
    match_count: number;
    matched_symbols: string[];
    auto_tag_id: string | null;
    auto_tag_code: string;
  }): Promise<ScreenRun | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("screen_runs")
      .insert({ ...run, user_id: user.id })
      .select()
      .single();
    if (error) return null;
    const newRun = data as ScreenRun;
    setRuns((prev) => [newRun, ...prev]);
    return newRun;
  };

  return { screens, runs: enrichedRuns, loading, createScreen, createRun, refetch: fetchAll };
}
