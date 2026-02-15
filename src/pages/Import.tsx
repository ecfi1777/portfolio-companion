import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { parseFidelityCSVs, type ParsedPosition, type ParseResult } from "@/lib/csv-parser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Check, AlertTriangle, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Import() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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
    // Reset so the same file can be re-selected
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

      toast({ title: "Import successful", description: `${parseResult.positions.length} positions imported.` });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setCsvTexts([]);
    setParseResult(null);
  };

  const hasFiles = csvTexts.length > 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Import Fidelity CSV</h1>

      {/* Upload area — always visible when no files, or compact "add another" when files exist */}
      <Card>
        <CardContent className={hasFiles ? "py-4" : "py-12"}>
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              hasFiles ? "p-6" : "p-12"
            } ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
          >
            {hasFiles ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <Plus className="h-5 w-5 text-muted-foreground" />
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
                <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">Drop your Fidelity CSV here</p>
                <p className="mb-4 text-sm text-muted-foreground">or click to browse</p>
                <label>
                  <input type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
                  <Button variant="outline" asChild>
                    <span><FileText className="mr-2 h-4 w-4" />Select File</span>
                  </Button>
                </label>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {parseResult && (
        <>
          {parseResult.errors.length > 0 && (
            <Card className="border-destructive">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  {parseResult.errors.map((err, i) => (
                    <p key={i} className="text-sm text-destructive">{err}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Positions Found</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{parseResult.positions.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Cash Detected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(parseResult.cashBalance)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
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
          </Card>

          <div className="flex gap-3">
            <Button onClick={confirmImport} disabled={importing}>
              <Check className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : "Confirm Import"}
            </Button>
            <Button variant="outline" onClick={resetImport}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
