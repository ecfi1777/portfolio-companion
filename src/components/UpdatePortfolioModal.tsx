import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseFidelityCSVs, type ParseResult, type ParsedPosition } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Check, AlertTriangle, Plus, Info, CirclePlus, RefreshCw, Minus } from "lucide-react";
import type { Tables, Json } from "@/integrations/supabase/types";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtShares = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 4 });

interface FieldChange {
  field: string;
  old: string;
  new: string;
}

interface NewPosition {
  symbol: string;
  value: number;
  accounts: string;
}

interface UpdatedPosition {
  symbol: string;
  changes: FieldChange[];
}

interface ChangeSummary {
  newPositions: NewPosition[];
  updatedPositions: UpdatedPosition[];
  unchangedCount: number;
  oldCash: number | null;
  newCash: number;
}

function buildChangeSummary(
  existingPositions: Tables<"positions">[],
  parsedPositions: ParsedPosition[],
  oldCash: number | null,
  newCash: number
): ChangeSummary {
  const existingMap = new Map(existingPositions.map((p) => [p.symbol, p]));

  const newPositions: NewPosition[] = [];
  const updatedPositions: UpdatedPosition[] = [];
  let unchangedCount = 0;

  for (const parsed of parsedPositions) {
    const existing = existingMap.get(parsed.symbol);

    if (!existing) {
      newPositions.push({
        symbol: parsed.symbol,
        value: parsed.currentValue,
        accounts: parsed.accounts.map((a) => a.account).join(", ") || "—",
      });
      continue;
    }

    const changes: FieldChange[] = [];
    const check = (field: string, oldVal: number | null, newVal: number, formatter: (n: number) => string) => {
      const o = oldVal ?? 0;
      if (Math.abs(o - newVal) > 0.001) {
        changes.push({ field, old: formatter(o), new: formatter(newVal) });
      }
    };

    check("Shares", existing.shares, parsed.shares, fmtShares);
    check("Price", existing.current_price, parsed.currentPrice, fmt);
    check("Value", existing.current_value, parsed.currentValue, fmt);
    check("Cost Basis", existing.cost_basis, parsed.costBasis, fmt);

    if (changes.length > 0) {
      updatedPositions.push({ symbol: parsed.symbol, changes });
    } else {
      unchangedCount++;
    }
  }

  return { newPositions, updatedPositions, unchangedCount, oldCash, newCash };
}

interface UpdatePortfolioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  fileNames?: string[];
}

type ModalPhase = "upload" | "summary";

export function UpdatePortfolioModal({ open, onOpenChange, onSuccess, fileNames: _externalFileNames }: UpdatePortfolioModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [csvTexts, setCsvTexts] = useState<string[]>([]);
  const [csvFileNames, setCsvFileNames] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<ModalPhase>("upload");
  const [changeSummary, setChangeSummary] = useState<ChangeSummary | null>(null);

  const addFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvFileNames((prev) => [...prev, file.name]);
      setCsvTexts((prev) => {
        const next = [...prev, text];
        const result = parseFidelityCSVs(next);
        setParseResult(result);
        if (result.errors.length > 0) {
          toast({
            title: "Parsing warnings",
            description: result.errors.join("; "),
            variant: "destructive",
          });
        }
        return next;
      });
    };
    reader.readAsText(file);
  }, [toast]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) addFile(file);
    },
    [addFile]
  );

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addFile(file);
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!user || !parseResult) return;
    setImporting(true);

    try {
      // Fetch existing data for diff
      const [posRes, sumRes] = await Promise.all([
        supabase.from("positions").select("*"),
        supabase.from("portfolio_summary").select("*").maybeSingle(),
      ]);

      const existingPositions = posRes.data ?? [];
      const oldCash = sumRes.data?.cash_balance ?? null;

      // Perform upserts
      for (const p of parseResult.positions) {
        const { error } = await supabase
          .from("positions")
          .upsert(
            {
              user_id: user.id,
              symbol: p.symbol,
              company_name: p.companyName,
              shares: p.shares,
              current_price: p.currentPrice,
              current_value: p.currentValue,
              cost_basis: p.costBasis,
              account: p.accounts as unknown as Json,
            },
            { onConflict: "user_id,symbol" }
          );
        if (error) throw error;
      }

      // Upsert CASH position row
      if (parseResult.cashBalance > 0) {
        const { error: cashPosError } = await supabase
          .from("positions")
          .upsert(
            {
              user_id: user.id,
              symbol: "CASH",
              company_name: "Cash Balance",
              shares: parseResult.cashBalance,
              current_price: 1,
              current_value: parseResult.cashBalance,
              cost_basis: parseResult.cashBalance,
              account: (parseResult.cashAccounts ?? []) as unknown as Json,
            },
            { onConflict: "user_id,symbol" }
          );
        if (cashPosError) throw cashPosError;
      }

      const { error: sumError } = await supabase
        .from("portfolio_summary")
        .upsert(
          {
            user_id: user.id,
            cash_balance: parseResult.cashBalance,
            last_import_date: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (sumError) throw sumError;

      // Build summary and switch phase
      const summary = buildChangeSummary(existingPositions, parseResult.positions, oldCash, parseResult.cashBalance);

      // Log import history
      const totalValue = parseResult.positions.reduce((s, p) => s + p.currentValue, 0) + parseResult.cashBalance;
      await supabase.from("import_history").insert({
        user_id: user.id,
        file_names: csvFileNames,
        total_positions: parseResult.positions.length,
        total_value: totalValue,
      });

      setChangeSummary(summary);
      setPhase("summary");
      onSuccess();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setCsvTexts([]);
    setCsvFileNames([]);
    setParseResult(null);
    setPhase("upload");
    setChangeSummary(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleDone = () => {
    resetState();
    onOpenChange(false);
  };

  const hasFiles = csvTexts.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{phase === "summary" ? "Update Complete" : "Update Portfolio"}</DialogTitle>
        </DialogHeader>

        {phase === "summary" && changeSummary ? (
          <SummaryView summary={changeSummary} onDone={handleDone} />
        ) : (
          <div className="space-y-4">
            {/* Upload area */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                hasFiles ? "p-4" : "p-10"
              } ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            >
              {hasFiles ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Add another CSV file</p>
                    <Badge variant="secondary">{csvTexts.length} {csvTexts.length === 1 ? "file" : "files"} loaded</Badge>
                  </div>
                  <label>
                    <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
                    <Button variant="outline" size="sm" asChild>
                      <span><FileText className="mr-2 h-4 w-4" />Select File</span>
                    </Button>
                  </label>
                </>
              ) : (
                <>
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="mb-1 text-base font-medium">Drop your Fidelity CSV here</p>
                  <p className="mb-3 text-sm text-muted-foreground">or click to browse</p>
                  <label>
                    <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
                    <Button variant="outline" size="sm" asChild>
                      <span><FileText className="mr-2 h-4 w-4" />Select File</span>
                    </Button>
                  </label>
                </>
              )}
            </div>

            {/* Preview */}
            {parseResult && (
              <>
                {parseResult.errors.length > 0 && (
                  <div className="flex items-start gap-3 rounded-md border border-destructive p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                    <div>
                      {parseResult.errors.map((err, i) => (
                        <p key={i} className="text-sm text-destructive">{err}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 grid-cols-2">
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Positions Found</CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-xl font-bold">{parseResult.positions.length}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Cash Detected</CardTitle>
                    </CardHeader>
                    <CardContent><div className="text-xl font-bold">{fmt(parseResult.cashBalance)}</div></CardContent>
                  </Card>
                </div>

                <div className="rounded-md border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Cost Basis</TableHead>
                        <TableHead>Accounts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parseResult.positions.map((p) => (
                        <TableRow key={p.symbol}>
                          <TableCell className="font-medium">{p.symbol}</TableCell>
                          <TableCell className="text-muted-foreground">{p.companyName || "—"}</TableCell>
                          <TableCell className="text-right">{p.shares.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{fmt(p.currentPrice)}</TableCell>
                          <TableCell className="text-right">{fmt(p.currentValue)}</TableCell>
                          <TableCell className="text-right">{fmt(p.costBasis)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {p.accounts.length > 0
                              ? p.accounts.map((a) => a.account).join(", ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Warning banner */}
                <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                    This will update all position data (shares, prices, values, cost basis) with the data from your uploaded files. Existing category assignments and notes will be preserved. No positions will be deleted.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmImport} disabled={importing}>
                    <Check className="mr-2 h-4 w-4" />
                    {importing ? "Updating..." : "Update Portfolio"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Summary View ---------- */

function SummaryView({ summary, onDone }: { summary: ChangeSummary; onDone: () => void }) {
  const cashChanged = summary.oldCash !== null && Math.abs((summary.oldCash ?? 0) - summary.newCash) > 0.01;
  const cashDiff = summary.newCash - (summary.oldCash ?? 0);

  return (
    <div className="space-y-5">
      {/* Cash change */}
      {cashChanged && (
        <div className="rounded-md border p-3 flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Cash:</span>
          <span className="text-sm">
            {fmt(summary.oldCash ?? 0)} → {fmt(summary.newCash)}
          </span>
          <Badge variant={cashDiff >= 0 ? "default" : "destructive"} className={cashDiff >= 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : ""}>
            {cashDiff >= 0 ? "+" : ""}{fmt(cashDiff)}
          </Badge>
        </div>
      )}

      {/* New positions */}
      {summary.newPositions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CirclePlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              New Positions ({summary.newPositions.length})
            </h3>
          </div>
          <div className="rounded-md border border-emerald-200 dark:border-emerald-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-50/50 dark:bg-emerald-950/20">
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                  <TableHead className="text-xs">Accounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.newPositions.map((p) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-right">{fmt(p.value)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.accounts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Updated positions */}
      {summary.updatedPositions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Updated Positions ({summary.updatedPositions.length})
            </h3>
          </div>
          <div className="rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50/50 dark:bg-amber-950/20">
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.updatedPositions.map((p) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="font-medium align-top">{p.symbol}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {p.changes.map((c, i) => (
                          <span key={i} className="text-sm">
                            <span className="text-muted-foreground">{c.field}:</span>{" "}
                            <span className="line-through text-muted-foreground/60">{c.old}</span>{" "}
                            <span>→</span>{" "}
                            <span className="font-medium">{c.new}</span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Unchanged count */}
      {summary.unchangedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Minus className="h-4 w-4" />
          <span>{summary.unchangedCount} position{summary.unchangedCount !== 1 ? "s" : ""} unchanged</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onDone}>
          <Check className="mr-2 h-4 w-4" />
          Done
        </Button>
      </div>
    </div>
  );
}
