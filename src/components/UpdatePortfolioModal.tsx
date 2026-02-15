import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseFidelityCSVs, type ParseResult } from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Check, AlertTriangle, Plus, Info } from "lucide-react";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface UpdatePortfolioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UpdatePortfolioModal({ open, onOpenChange, onSuccess }: UpdatePortfolioModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [csvTexts, setCsvTexts] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const addFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
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
              account: p.accounts as any,
            },
            { onConflict: "user_id,symbol" }
          );
        if (error) throw error;
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

      toast({ title: "Portfolio updated", description: `${parseResult.positions.length} positions updated.` });
      resetState();
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resetState = () => {
    setCsvTexts([]);
    setParseResult(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const hasFiles = csvTexts.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Portfolio</DialogTitle>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
