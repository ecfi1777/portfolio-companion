import type { WatchlistEntry } from "@/hooks/use-watchlist";

/* ── Formatters ── */
export const fmtPrice = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

export const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

export const fmtDollar = (n: number) =>
  (n >= 0 ? "+$" : "-$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CAP_COLORS: Record<string, string> = {
  MEGA: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  LARGE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  MID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  SMALL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  MICRO: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  NANO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export const CAP_ORDER = ["MEGA", "LARGE", "MID", "SMALL", "MICRO", "NANO"];

/* ── Helpers ── */
export function calcDayChg(e: WatchlistEntry) {
  return e.current_price != null && e.previous_close != null && e.previous_close > 0
    ? ((e.current_price - e.previous_close) / e.previous_close) * 100
    : null;
}

export function calcSinceAdded(e: WatchlistEntry) {
  return e.current_price != null && e.price_when_added != null && e.price_when_added > 0
    ? ((e.current_price - e.price_when_added) / e.price_when_added) * 100
    : null;
}

export function pctColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}
