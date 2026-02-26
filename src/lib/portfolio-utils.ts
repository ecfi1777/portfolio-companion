import type { PortfolioSettings, CategoryConfig } from "@/hooks/use-portfolio-settings";
import { getTierTarget, getCategoryPerPositionTarget } from "@/hooks/use-portfolio-settings";

type Category = string | null;
type Tier = string | null;

export interface AccountBreakdown {
  account: string;
  shares: number;
  value: number;
}

export const fmt = (n: number | null) =>
  n != null
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

export const fmtShares = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

export const fmtPct = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

export function getAccountBreakdowns(account: unknown): AccountBreakdown[] {
  if (!account) return [];
  if (Array.isArray(account)) return account as AccountBreakdown[];
  return [];
}

/** Convert hex color to rgba with opacity */
export function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function getHexCategoryColors(settings: PortfolioSettings): Record<string, { bg: string; bar: string; text: string }> {
  const map: Record<string, { bg: string; bar: string; text: string }> = {};
  for (const cat of settings.categories) {
    const hex = cat.color || "#64748b";
    map[cat.key] = {
      bg: hexToRgba(hex, 0.15),
      bar: hex,
      text: hex,
    };
  }
  map["Unassigned"] = {
    bg: "rgba(100, 116, 139, 0.1)",
    bar: "rgba(100, 116, 139, 0.3)",
    text: "rgba(100, 116, 139, 0.7)",
  };
  return map;
}

export function getTierGoal(tier: Tier, settings: PortfolioSettings): number | null {
  return getTierTarget(tier, settings);
}

export function getPositionGoal(p: { tier: Tier; category: Category }, settings: PortfolioSettings): number | null {
  if (p.tier) return getTierGoal(p.tier, settings);
  if (p.category) {
    const cat = settings.categories.find((c) => c.key === p.category);
    if (cat && cat.tiers.length === 0) return getCategoryPerPositionTarget(cat);
  }
  return null;
}

export function getCapitalToGoal(
  weight: number,
  position: { tier: Tier; category: Category },
  currentValue: number,
  grandTotal: number,
  settings: PortfolioSettings
): { label: string; type: "below" | "at" | "above"; targetDollar: number; deltaDollar: number } | null {
  const goal = getPositionGoal(position, settings);
  if (goal == null) return null;

  const goalValue = (goal / 100) * grandTotal;
  const diff = goalValue - currentValue;
  const tolerance = goalValue * 0.02;

  if (Math.abs(diff) <= tolerance) return { label: "At goal", type: "at", targetDollar: goalValue, deltaDollar: diff };
  if (diff > 0) return { label: `↑ ${fmt(diff)}`, type: "below", targetDollar: goalValue, deltaDollar: diff };
  return { label: `↓ ${fmt(Math.abs(diff))}`, type: "above", targetDollar: goalValue, deltaDollar: -Math.abs(diff) };
}
