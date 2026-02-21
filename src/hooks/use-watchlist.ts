import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getMarketCapCategory } from "@/lib/market-cap";
import { fetchQuotes } from "@/lib/fmp-api";

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
  }) => {
    if (!user) return;
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
      return;
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

  const refreshPrices = useCallback(async (apiKey: string) => {
    if (!user || entries.length === 0 || !apiKey) return;
    const symbols = entries.map((e) => e.symbol);
    const quotes = await fetchQuotes(symbols, apiKey);
    if (quotes.length === 0) return;
    const now = new Date().toISOString();
    for (const q of quotes) {
      await supabase
        .from("watchlist_entries")
        .update({
          current_price: q.price,
          previous_close: q.previousClose,
          last_price_update: now,
        } as any)
        .eq("user_id", user.id)
        .eq("symbol", q.symbol);
    }
    // Update local state
    setEntries((prev) =>
      prev.map((e) => {
        const q = quotes.find((qq) => qq.symbol === e.symbol);
        if (!q) return e;
        return { ...e, current_price: q.price, previous_close: q.previousClose, last_price_update: now };
      })
    );
    return quotes.length;
  }, [user, entries]);

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
    refetch: fetchAll,
  };
}
