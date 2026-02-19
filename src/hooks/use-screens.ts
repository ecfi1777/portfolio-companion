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

  const deleteScreen = async (screenId: string): Promise<boolean> => {
    if (!user) return false;
    // Get runs for this screen to find auto_tag_ids to clean up
    const screenRuns = runs.filter((r) => r.screen_id === screenId);
    const tagIds = screenRuns.map((r) => r.auto_tag_id).filter(Boolean) as string[];

    // Delete runs first (FK constraint)
    await supabase.from("screen_runs").delete().eq("screen_id", screenId);

    // Delete the screen
    const { error } = await supabase.from("screens").delete().eq("id", screenId);
    if (error) return false;

    // Clean up auto-generated tags and their assignments
    if (tagIds.length > 0) {
      await supabase.from("watchlist_entry_tags").delete().in("tag_id", tagIds);
      await supabase.from("tags").delete().in("id", tagIds);
    }

    // Update local state
    setScreens((prev) => prev.filter((s) => s.id !== screenId));
    setRuns((prev) => prev.filter((r) => r.screen_id !== screenId));
    return true;
  };

  return { screens, runs: enrichedRuns, loading, createScreen, createRun, deleteScreen, refetch: fetchAll };
}
