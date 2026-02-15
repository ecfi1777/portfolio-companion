import { useEffect, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, Hash, ChevronRight } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Position = Tables<"positions">;
type PortfolioSummary = Tables<"portfolio_summary">;

interface AccountBreakdown {
  account: string;
  shares: number;
  value: number;
}

const fmt = (n: number | null) =>
  n != null
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const fmtShares = (n: number | null) =>
  n != null ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

function getAccountBreakdowns(account: unknown): AccountBreakdown[] {
  if (!account) return [];
  if (Array.isArray(account)) return account as AccountBreakdown[];
  return [];
}

export default function Portfolio() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [posRes, sumRes] = await Promise.all([
        supabase
          .from("positions")
          .select("*")
          .order("current_value", { ascending: false }),
        supabase
          .from("portfolio_summary")
          .select("*")
          .maybeSingle(),
      ]);

      if (posRes.data) setPositions(posRes.data);
      if (sumRes.data) setSummary(sumRes.data);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const totalValue = positions.reduce((sum, p) => sum + (p.current_value ?? 0), 0);
  const cashBalance = summary?.cash_balance ?? 0;
  const grandTotal = totalValue + cashBalance;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Positions</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      {positions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No positions yet. Import a Fidelity CSV to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Cost Basis</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => {
                const accounts = getAccountBreakdowns(p.account);
                const isExpanded = expandedId === p.id;
                const hasAccounts = accounts.length > 0;

                return (
                  <Fragment key={p.id}>
                    <TableRow
                      className={hasAccounts ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => hasAccounts && setExpandedId(isExpanded ? null : p.id)}
                    >
                      <TableCell className="w-8 px-2">
                        {hasAccounts && (
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">{p.company_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtShares(p.shares)}</TableCell>
                      <TableCell className="text-right">{fmt(p.current_price)}</TableCell>
                      <TableCell className="text-right">{fmt(p.current_value)}</TableCell>
                      <TableCell className="text-right">{fmt(p.cost_basis)}</TableCell>
                      <TableCell>{p.category ?? "—"}</TableCell>
                      <TableCell>{p.tier ?? "—"}</TableCell>
                    </TableRow>
                    {isExpanded && accounts.map((acct, i) => (
                      <TableRow key={`${p.id}-acct-${i}`} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-sm text-muted-foreground pl-4">↳ {acct.account}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtShares(acct.shares)}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmt(acct.value)}</TableCell>
                        <TableCell colSpan={3}></TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
