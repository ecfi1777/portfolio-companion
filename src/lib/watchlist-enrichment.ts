import { supabase } from "@/integrations/supabase/client";
import { lookupSymbol } from "@/lib/fmp-api";
import { getMarketCapCategory } from "@/lib/market-cap";

/**
 * Shared post-add enrichment for watchlist entries.
 * Runs screen cross-referencing and FMP market cap enrichment.
 * Best-effort: errors are caught and logged, never block the caller.
 */
export async function enrichWatchlistEntries(
  userId: string,
  symbols: string[],
  fmpApiKey?: string,
  onComplete?: () => void
): Promise<void> {
  if (symbols.length === 0) return;

  try {
    // --- Screen cross-referencing ---
    try {
      const { data: entries } = await supabase
        .from("watchlist_entries")
        .select("id, symbol")
        .eq("user_id", userId)
        .in("symbol", symbols);

      if (entries && entries.length > 0) {
        const { data: screenRuns } = await supabase
          .from("screen_runs")
          .select("all_symbols, auto_tag_id")
          .eq("user_id", userId)
          .not("auto_tag_id", "is", null);

        if (screenRuns && screenRuns.length > 0) {
          const entryMap = new Map(entries.map((e) => [e.symbol, e.id]));
          const tagAssignments: { watchlist_entry_id: string; tag_id: string }[] = [];

          for (const run of screenRuns) {
            const runSymbols = new Set(run.all_symbols ?? []);
            for (const [symbol, entryId] of entryMap) {
              if (runSymbols.has(symbol) && run.auto_tag_id) {
                tagAssignments.push({ watchlist_entry_id: entryId, tag_id: run.auto_tag_id });
              }
            }
          }

          if (tagAssignments.length > 0) {
            await supabase
              .from("watchlist_entry_tags")
              .upsert(tagAssignments, { onConflict: "watchlist_entry_id,tag_id", ignoreDuplicates: true });
          }
        }
      }
    } catch (e) {
      console.error("Screen tag cross-reference failed:", e);
    }

    // --- FMP enrichment ---
    if (fmpApiKey) {
      for (const sym of symbols) {
        try {
          const profile = await lookupSymbol(sym, fmpApiKey);
          if (profile && profile.mktCap) {
            await supabase
              .from("watchlist_entries")
              .update({
                market_cap: profile.mktCap,
                market_cap_category: getMarketCapCategory(profile.mktCap),
                sector: profile.sector || null,
                industry: profile.industry || null,
              })
              .eq("user_id", userId)
              .eq("symbol", sym);
          }
        } catch {
          // Best-effort, continue with next symbol
        }
      }
    }
  } finally {
    onComplete?.();
  }
}
