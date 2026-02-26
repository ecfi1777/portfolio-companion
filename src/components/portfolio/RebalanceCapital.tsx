import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { ChevronDown } from "lucide-react";
import { fmt, fmtPct } from "@/lib/portfolio-utils";
import type { PortfolioSettings } from "@/hooks/use-portfolio-settings";
import { getCategoryForTier } from "@/hooks/use-portfolio-settings";

interface RebalanceItem {
  symbol: string;
  tier: string;
  currentValue: number;
  weight: number;
  goalValue: number;
  goal: number;
  category: string;
}

interface UnderweightItem extends RebalanceItem {
  toBuy: number;
}

interface OverweightItem extends RebalanceItem {
  toTrim: number;
}

interface RebalanceCapitalProps {
  underweightList: UnderweightItem[];
  overweightList: OverweightItem[];
  cashBalance: number;
  settings: PortfolioSettings;
  CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string }>;
  defaultOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RebalanceCapital({
  underweightList,
  overweightList,
  cashBalance,
  settings,
  CATEGORY_COLORS,
  defaultOpen,
  onOpenChange,
}: RebalanceCapitalProps) {
  if (underweightList.length === 0 && overweightList.length === 0) return null;

  return (
    <Collapsible open={defaultOpen} onOpenChange={onOpenChange}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                Rebalance Capital
                {cashBalance > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    — {fmt(cashBalance)} cash available
                  </span>
                )}
              </CardTitle>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${defaultOpen ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-6">
            {/* Underweight — Buy */}
            {underweightList.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">Underweight — Buy</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Category / Tier</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">To Buy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {underweightList.map((item) => {
                      const cat = item.category ? settings.categories.find(c => c.key === item.category) : getCategoryForTier(item.tier, settings);
                      const colors = cat ? CATEGORY_COLORS[cat.key] : null;
                      return (
                        <TableRow key={item.symbol}>
                          <TableCell className="font-medium">{item.symbol}</TableCell>
                          <TableCell>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: colors?.bg ?? "transparent",
                                color: colors?.text ?? "inherit",
                              }}
                            >
                              {item.tier}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <div>{fmt(item.currentValue)}</div>
                            <div className="text-xs">{fmtPct(item.weight)}</div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <div>{fmt(item.goalValue)}</div>
                            <div className="text-xs">{fmtPct(item.goal)}</div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">{fmt(item.toBuy)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Overweight — Trim */}
            {overweightList.length > 0 && (
              <div>
                {underweightList.length > 0 && <Separator className="mb-4" />}
                <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">Overweight — Trim</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Category / Tier</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">To Trim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overweightList.map((item) => {
                      const cat = item.category ? settings.categories.find(c => c.key === item.category) : getCategoryForTier(item.tier, settings);
                      const colors = cat ? CATEGORY_COLORS[cat.key] : null;
                      return (
                        <TableRow key={item.symbol}>
                          <TableCell className="font-medium">{item.symbol}</TableCell>
                          <TableCell>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: colors?.bg ?? "transparent",
                                color: colors?.text ?? "inherit",
                              }}
                            >
                              {item.tier}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <div>{fmt(item.currentValue)}</div>
                            <div className="text-xs">{fmtPct(item.weight)}</div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <div>{fmt(item.goalValue)}</div>
                            <div className="text-xs">{fmtPct(item.goal)}</div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-amber-600 dark:text-amber-400">{fmt(item.toTrim)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
