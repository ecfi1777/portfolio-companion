import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Tag } from "lucide-react";
import { fmt, fmtPct } from "@/lib/portfolio-utils";

interface PortfolioSummaryCardsProps {
  grandTotal: number;
  cashBalance: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  stockPositionsCount: number;
  assignedCount: number;
}

export function PortfolioSummaryCards({
  grandTotal,
  cashBalance,
  totalGainLoss,
  totalGainLossPct,
  stockPositionsCount,
  assignedCount,
}: PortfolioSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(grandTotal)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Cash Balance</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(cashBalance)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Gain/Loss</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {fmt(totalGainLoss)}
          </div>
          <p className={`text-xs ${totalGainLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {totalGainLoss >= 0 ? "+" : ""}{fmtPct(totalGainLossPct)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Categorized</CardTitle>
          <Tag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{assignedCount} <span className="text-base font-normal text-muted-foreground">of {stockPositionsCount}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
