import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Trash2, Database, History, Building2, AlertTriangle } from "lucide-react";
import type { Tables, Json } from "@/integrations/supabase/types";

type Position = Tables<"positions">;

interface AccountBreakdown {
  account: string;
  shares: number;
  value: number;
}

function getAccountBreakdowns(account: unknown): AccountBreakdown[] {
  if (!account) return [];
  if (Array.isArray(account)) return account as AccountBreakdown[];
  return [];
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ManagePortfolioSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [sectionOpen, setSectionOpen] = useState(false);
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  // Remove account state
  const [removeAccount, setRemoveAccount] = useState<string | null>(null);
  const [removingAccount, setRemovingAccount] = useState(false);

  // Clear all state
  const [clearStep, setClearStep] = useState<"idle" | "confirm">("idle");
  const [clearInput, setClearInput] = useState("");
  const [clearing, setClearing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [histRes, posRes] = await Promise.all([
      supabase.from("import_history").select("*").order("imported_at", { ascending: false }),
      supabase.from("positions").select("*"),
    ]);
    setImportHistory(histRes.data ?? []);
    setPositions(posRes.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (sectionOpen) fetchData();
  }, [sectionOpen, fetchData]);

  // Compute distinct accounts
  const accountSummary = useMemo(() => {
    const map = new Map<string, { count: number; totalValue: number }>();
    for (const pos of positions) {
      const breakdowns = getAccountBreakdowns(pos.account);
      for (const b of breakdowns) {
        const name = b.account;
        if (!name) continue;
        const existing = map.get(name) ?? { count: 0, totalValue: 0 };
        existing.count += 1;
        existing.totalValue += b.value ?? 0;
        map.set(name, existing);
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [positions]);

  const handleRemoveAccount = async () => {
    if (!user || !removeAccount) return;
    setRemovingAccount(true);

    try {
      const affected = positions.filter((p) =>
        getAccountBreakdowns(p.account).some((b) => b.account === removeAccount)
      );

      for (const pos of affected) {
        const breakdowns = getAccountBreakdowns(pos.account);
        const remaining = breakdowns.filter((b) => b.account !== removeAccount);

        if (remaining.length === 0) {
          // Delete position entirely
          await supabase.from("positions").delete().eq("id", pos.id);
        } else {
          // Recalculate aggregates
          const newShares = remaining.reduce((s, b) => s + (b.shares ?? 0), 0);
          const newValue = remaining.reduce((s, b) => s + (b.value ?? 0), 0);
          const price = newShares > 0 ? newValue / newShares : (pos.current_price ?? 0);
          // Approximate cost basis reduction
          const oldTotal = breakdowns.reduce((s, b) => s + (b.value ?? 0), 0);
          const removedValue = breakdowns.find((b) => b.account === removeAccount)?.value ?? 0;
          const ratio = oldTotal > 0 ? (oldTotal - removedValue) / oldTotal : 1;
          const newCostBasis = (pos.cost_basis ?? 0) * ratio;

          await supabase.from("positions").update({
            account: remaining as unknown as Json,
            shares: newShares,
            current_value: newValue,
            current_price: price,
            cost_basis: newCostBasis,
          }).eq("id", pos.id);
        }
      }

      toast({ title: "Account removed", description: `${removeAccount} has been removed from all positions.` });
      setRemoveAccount(null);
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRemovingAccount(false);
    }
  };

  const handleClearAll = async () => {
    if (!user) return;
    setClearing(true);
    try {
      await Promise.all([
        supabase.from("positions").delete().eq("user_id", user.id),
        supabase.from("portfolio_summary").delete().eq("user_id", user.id),
      ]);
      toast({ title: "Portfolio cleared", description: "All portfolio data has been deleted." });
      setClearStep("idle");
      setClearInput("");
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Manage Portfolio
                </CardTitle>
                <CardDescription>
                  Import history, account management, and data controls.
                </CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${sectionOpen ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-8">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                {/* 1. Import History */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Import History
                  </h3>
                  {importHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No imports yet.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Files</TableHead>
                            <TableHead className="text-xs text-right">Positions</TableHead>
                            <TableHead className="text-xs text-right">Total Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importHistory.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="text-sm">
                                {new Date(h.imported_at).toLocaleDateString("en-US", {
                                  month: "short", day: "numeric", year: "numeric",
                                  hour: "numeric", minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {(h.file_names ?? []).length > 0
                                  ? (h.file_names as string[]).join(", ")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-sm text-right">{h.total_positions}</TableCell>
                              <TableCell className="text-sm text-right">{fmt(h.total_value ?? 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* 2. Accounts */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Accounts
                  </h3>
                  {accountSummary.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No account data found in positions.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Account</TableHead>
                            <TableHead className="text-xs text-right">Positions</TableHead>
                            <TableHead className="text-xs text-right">Total Value</TableHead>
                            <TableHead className="text-xs w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accountSummary.map((a) => (
                            <TableRow key={a.name}>
                              <TableCell className="text-sm font-medium">{a.name}</TableCell>
                              <TableCell className="text-sm text-right">{a.count}</TableCell>
                              <TableCell className="text-sm text-right">{fmt(a.totalValue)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setRemoveAccount(a.name)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Remove Account Dialog */}
                  <AlertDialog open={!!removeAccount} onOpenChange={(v) => { if (!v) setRemoveAccount(null); }}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove "{removeAccount}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {removeAccount}'s holdings from all positions. Positions held only in this account will be deleted. Positions held in other accounts will have their shares and values reduced accordingly. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleRemoveAccount}
                          disabled={removingAccount}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {removingAccount ? "Removing..." : "Remove Account"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* 3. Clear All Portfolio Data */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Danger Zone
                  </h3>
                  <div className="rounded-md border border-destructive/30 p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Permanently delete all positions and portfolio summary data. This cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setClearStep("confirm")}
                    >
                      Clear All Portfolio Data
                    </Button>
                  </div>

                  <AlertDialog open={clearStep === "confirm"} onOpenChange={(v) => { if (!v) { setClearStep("idle"); setClearInput(""); } }}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Portfolio Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all positions and portfolio summary data for your account. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 px-1">
                        <p className="text-sm text-muted-foreground">
                          Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm:
                        </p>
                        <Input
                          value={clearInput}
                          onChange={(e) => setClearInput(e.target.value)}
                          placeholder="DELETE"
                          className="font-mono"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleClearAll}
                          disabled={clearInput !== "DELETE" || clearing}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {clearing ? "Clearing..." : "Clear Everything"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
