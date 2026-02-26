import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getMarketCapCategory } from "@/lib/market-cap";
import { fetchProfilesBatched } from "@/lib/fmp-api";
import { enrichWatchlistEntries } from "@/lib/watchlist-enrichment";

export interface WatchlistEntry {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  date_added: string;
  price_when_added: number | null;
  current_price: number | null;
  previous_close: number | null;
  industry: string | null;
  sector: string | null;
  market_cap: number | null;
  market_cap_category: string | null;
  notes: string | null;
  last_price_update: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  user_id: string;
  short_code: string;
  full_name: string | null;
  color: string | null;
  is_active: boolean;
  is_system_tag: boolean;
  screen_id: string | null;
  screen_name: string | null;
  screen_date: string | null;
  created_at: string;
  updated_at: string;
  entry_count?: number;
}

interface EntryTag {
  watchlist_entry_id: string;
  tag_id: string;
}

const DEFAULT_TAGS = [
  { short_code: "MF", full_name: "Motley Fool", color: "#5865F2" },
  { short_code: "CQ", full_name: "Compounding Quality", color: "#57F287" },
  { short_code: "TT", full_name: "Tiny Titans", color: "#FEE75C" },
  { short_code: "Z1", full_name: "Zacks Rank #1", color: "#ED4245" },
  { short_code: "Z2", full_name: "Zacks Rank #2", color: "#EB459E" },
  { short_code: "AP", full_name: "Alpha Picks", color: "#9B59B6" },
  { short_code: "CORE", full_name: "Core Position", color: "#3498DB" },
  { short_code: "GC", full_name: "Good Companies", color: "#2ECC71" },
];

export function useWatchlist() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [entryTags, setEntryTags] = useState<EntryTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase.from("tags").select("*").order("short_code");
    return (data ?? []) as Tag[];
  }, [user]);

  const seedDefaultTags = useCallback(async () => {
    if (!user || seeding) return;
    setSeeding(true);
    const existing = await fetchTags();
    if (existing.length === 0) {
      const rows = DEFAULT_TAGS.map((t) => ({
        ...t,
        user_id: user.id,
        is_system_tag: true,
      }));
      await supabase.from("tags").insert(rows);
    }
    setSeeding(false);
  }, [user, seeding, fetchTags]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [entriesRes, tagsRes, etRes] = await Promise.all([
      supabase.from("watchlist_entries").select("*").order("date_added", { ascending: false }),
      supabase.from("tags").select("*").order("short_code"),
      supabase.from("watchlist_entry_tags").select("*"),
    ]);

    const fetchedTags = (tagsRes.data ?? []) as Tag[];

    if (fetchedTags.length === 0 && !seeding) {
      await seedDefaultTags();
      const { data: seededTags } = await supabase.from("tags").select("*").order("short_code");
      setTags((seededTags ?? []) as Tag[]);
    } else {
      setTags(fetchedTags);
    }

    setEntries((entriesRes.data ?? []) as WatchlistEntry[]);
    setEntryTags((etRes.data ?? []) as EntryTag[]);
    setLoading(false);
  }, [user, seeding, seedDefaultTags]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Enrich entries with their tags and auto-calculate market_cap_category
  const enrichedEntries = entries.map((entry) => {
    const tagIds = entryTags
      .filter((et) => et.watchlist_entry_id === entry.id)
      .map((et) => et.tag_id);
    const autoCategory = getMarketCapCategory(entry.market_cap);
    return {
      ...entry,
      market_cap_category: autoCategory ?? entry.market_cap_category,
      tags: tags.filter((t) => tagIds.includes(t.id)),
    };
  });

  const tagsWithCounts = tags.map((tag) => ({
    ...tag,
    entry_count: entryTags.filter((et) => et.tag_id === tag.id).length,
  }));

  const addEntry = async (data: {
    symbol: string;
    company_name?: string;
    price_when_added?: number;
    notes?: string;
    tag_ids?: string[];
    industry?: string;
    sector?: string;
    market_cap?: number;
  }): Promise<string | null> => {
    if (!user) return null;
    const mktCapCategory = data.market_cap ? getMarketCapCategory(data.market_cap) : null;
    const { data: inserted, error } = await supabase
      .from("watchlist_entries")
      .insert({
        user_id: user.id,
        symbol: data.symbol.toUpperCase().trim(),
        company_name: data.company_name || null,
        price_when_added: data.price_when_added ?? null,
        current_price: data.price_when_added ?? null,
        notes: data.notes || null,
        industry: data.industry || null,
        sector: data.sector || null,
        market_cap: data.market_cap ?? null,
        market_cap_category: mktCapCategory,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already on watchlist", description: `${data.symbol.toUpperCase()} is already in your watchlist.`, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return null;
    }

    if (inserted && data.tag_ids?.length) {
      await supabase.from("watchlist_entry_tags").insert(
        data.tag_ids.map((tag_id) => ({
          watchlist_entry_id: inserted.id,
          tag_id,
        }))
      );
    }

    toast({ title: "Added", description: `${data.symbol.toUpperCase()} added to watchlist.` });
    await fetchAll();

    // Fire-and-forget: screen cross-referencing + FMP enrichment
    if (inserted) {
      enrichWatchlistEntries(user.id, [data.symbol.toUpperCase().trim()], undefined, (result) => {
        fetchAll();
        if (result.failed > 0) {
          toast({
            title: "Market data enrichment",
            description: `Failed to fetch market data for ${data.symbol.toUpperCase()}. Use Re-enrich to retry.`,
            variant: "destructive",
          });
        }
      });
    }

    return inserted?.id ?? null;
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("watchlist_entries").delete().eq("id", id);
    toast({ title: "Removed", description: "Entry removed from watchlist." });
    await fetchAll();
  };

  const updateEntryNotes = async (id: string, notes: string) => {
    await supabase.from("watchlist_entries").update({ notes: notes || null }).eq("id", id);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, notes: notes || null } : e)));
  };

  const addEntryTag = async (entryId: string, tagId: string) => {
    const { error } = await supabase.from("watchlist_entry_tags").insert({ watchlist_entry_id: entryId, tag_id: tagId });
    if (!error) {
      setEntryTags((prev) => [...prev, { watchlist_entry_id: entryId, tag_id: tagId }]);
    }
  };

  const removeEntryTag = async (entryId: string, tagId: string) => {
    await supabase.from("watchlist_entry_tags").delete().eq("watchlist_entry_id", entryId).eq("tag_id", tagId);
    setEntryTags((prev) => prev.filter((et) => !(et.watchlist_entry_id === entryId && et.tag_id === tagId)));
  };

  const createTag = async (data: { short_code: string; full_name: string; color: string }) => {
    if (!user) return;
    const { error } = await supabase.from("tags").insert({
      user_id: user.id,
      short_code: data.short_code.toUpperCase().trim(),
      full_name: data.full_name.trim(),
      color: data.color,
    });
    if (error) {
      toast({ title: "Error", description: error.code === "23505" ? "Tag short code already exists." : error.message, variant: "destructive" });
      return;
    }
    await fetchAll();
  };

  const updateTag = async (id: string, data: { short_code?: string; full_name?: string; color?: string; is_active?: boolean }) => {
    await supabase.from("tags").update(data).eq("id", id);
    await fetchAll();
  };

  const deleteTag = async (id: string) => {
    await supabase.from("tags").delete().eq("id", id);
    await fetchAll();
  };

  const refreshPrices = useCallback(async (
    apiKey: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ succeeded: number; failed: number; total: number }> => {
    if (!user || entries.length === 0 || !apiKey) return { succeeded: 0, failed: 0, total: 0 };
    const activeEntries = entries.filter((e) => !e.archived_at);
    const symbols = activeEntries.map((e) => e.symbol);
    const profiles = await fetchProfilesBatched(symbols, apiKey, onProgress);
    if (profiles.length === 0) return { succeeded: 0, failed: 0, total: symbols.length };
    const now = new Date().toISOString();
    const profileMap = new Map(profiles.map((p) => [p.symbol.toUpperCase(), p]));

    for (const p of profiles) {
      const updateData: Record<string, unknown> = {
        current_price: p.price,
        previous_close: p.previousClose,
        last_price_update: now,
      };
      if (p.mktCap) {
        updateData.market_cap = p.mktCap;
        updateData.market_cap_category = getMarketCapCategory(p.mktCap);
      }
      if (p.companyName) updateData.company_name = p.companyName;
      if (p.sector) updateData.sector = p.sector;
      if (p.industry) updateData.industry = p.industry;

      await supabase
        .from("watchlist_entries")
        .update(updateData)
        .eq("user_id", user.id)
        .eq("symbol", p.symbol);
    }

    // Update local state
    setEntries((prev) =>
      prev.map((e) => {
        const p = profileMap.get(e.symbol.toUpperCase());
        if (!p) return e;
        return {
          ...e,
          current_price: p.price,
          previous_close: p.previousClose,
          last_price_update: now,
          ...(p.mktCap ? { market_cap: p.mktCap, market_cap_category: getMarketCapCategory(p.mktCap) } : {}),
          ...(p.companyName ? { company_name: p.companyName } : {}),
          ...(p.sector ? { sector: p.sector } : {}),
          ...(p.industry ? { industry: p.industry } : {}),
        };
      })
    );

    return { succeeded: profiles.length, failed: symbols.length - profiles.length, total: symbols.length };
  }, [user, entries]);

  const archiveEntries = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const now = new Date().toISOString();
    await supabase.from("watchlist_entries").update({ archived_at: now } as any).in("id", ids);
    setEntries((prev) => prev.map((e) => ids.includes(e.id) ? { ...e, archived_at: now } : e));
  };

  const unarchiveEntries = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    await supabase.from("watchlist_entries").update({ archived_at: null } as any).in("id", ids);
    setEntries((prev) => prev.map((e) => ids.includes(e.id) ? { ...e, archived_at: null } : e));
  };

  return {
    entries: enrichedEntries,
    tags: tagsWithCounts,
    loading,
    addEntry,
    deleteEntry,
    updateEntryNotes,
    addEntryTag,
    removeEntryTag,
    createTag,
    updateTag,
    deleteTag,
    refreshPrices,
    archiveEntries,
    unarchiveEntries,
    refetch: fetchAll,
  };
}
