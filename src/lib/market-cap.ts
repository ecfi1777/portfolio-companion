export function getMarketCapCategory(marketCap: number | null): string | null {
  if (marketCap == null) return null;
  if (marketCap > 200_000_000_000) return "MEGA";
  if (marketCap >= 10_000_000_000) return "LARGE";
  if (marketCap >= 2_000_000_000) return "MID";
  if (marketCap >= 300_000_000) return "SMALL";
  if (marketCap >= 50_000_000) return "MICRO";
  return "NANO";
}

export function formatMarketCap(marketCap: number | null): string {
  if (marketCap == null) return "—";
  if (marketCap >= 1_000_000_000_000) return `$${(marketCap / 1_000_000_000_000).toFixed(1)}T`;
  if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(1)}B`;
  if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(0)}M`;
  return `$${marketCap.toLocaleString()}`;
}
