import React, { useState, useMemo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { parseGenericCSV } from "@/lib/csv-generic-parser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ParsedRow {
  symbol: string;
  companyName: string;
  price: number | null;
  isDuplicate: boolean;
}

interface BulkWatchlistImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSymbols: Set<string>;
  userId: string;
  onImportComplete: () => void;
}

function detectColumnIndex(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (keywords.some((k) => h.includes(k))) return i;
  }
  return -1;
}

export function BulkWatchlistImportModal({
  open,
  onOpenChange,
  existingSymbols,
  userId,
  onImportComplete,
}: BulkWatchlistImportModalProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRows([]);
    setSelected(new Set());
    setError(null);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) reset();
      onOpenChange(v);
    },
    [onOpenChange, reset]
  );

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Please upload a .csv file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers, rows: csvRows } = parseGenericCSV(text);
        if (headers.length === 0 || csvRows.length === 0) {
          setError("Could not parse any rows from the CSV.");
          return;
        }

        const symIdx = detectColumnIndex(headers, ["symbol", "ticker", "stock", "sym"]);
        const nameIdx = detectColumnIndex(headers, ["name", "company", "description", "security"]);
        const priceIdx = detectColumnIndex(headers, ["price", "last", "close", "value"]);

        const sIdx = symIdx >= 0 ? symIdx : 0;
        const nIdx = nameIdx >= 0 ? nameIdx : Math.min(1, headers.length - 1);
        const pIdx = priceIdx >= 0 ? priceIdx : Math.min(2, headers.length - 1);

        const parsed: ParsedRow[] = [];
        const newIdxs = new Set<number>();

        for (const row of csvRows) {
          const symbol = (row[sIdx] ?? "").trim().toUpperCase();
          if (!symbol) continue;
          const companyName = (row[nIdx] ?? "").trim();
          const rawPrice = (row[pIdx] ?? "").replace(/[^0-9.\-]/g, "");
          const price = rawPrice ? parseFloat(rawPrice) : null;
          const isDuplicate = existingSymbols.has(symbol);
          const idx = parsed.length;
          parsed.push({ symbol, companyName, price: price && !isNaN(price) ? price : null, isDuplicate });
          if (!isDuplicate) newIdxs.add(idx);
        }

        setRows(parsed);
        setSelected(newIdxs);
      };
      reader.readAsText(file);
    },
    [existingSymbols]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const toggleRow = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const newRows = useMemo(() => rows.filter((r) => !r.isDuplicate), [rows]);
  const selectedCount = selected.size;
  const duplicateCount = rows.filter((r) => r.isDuplicate).length;

  const handleImport = useCallback(async () => {
    const toInsert = rows
      .filter((_, i) => selected.has(i) && !rows[i].isDuplicate)
      .map((r) => ({
        user_id: userId,
        symbol: r.symbol,
        company_name: r.companyName || null,
        price_when_added: r.price,
        current_price: r.price,
      }));

    if (toInsert.length === 0) return;

    setImporting(true);
    const { error: insertError } = await supabase.from("watchlist_entries").upsert(toInsert, { onConflict: "user_id,symbol", ignoreDuplicates: true });
    setImporting(false);

    if (insertError) {
      toast({ title: "Import failed", description: insertError.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Bulk import complete",
      description: `Added ${toInsert.length} new stock${toInsert.length !== 1 ? "s" : ""}${duplicateCount > 0 ? `, ${duplicateCount} skipped (already on watchlist)` : ""}.`,
    });

    onImportComplete();
    handleClose(false);
  }, [rows, selected, userId, duplicateCount, toast, onImportComplete, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import to Watchlist</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Expected columns: Symbol, Company Name, Price</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>
        ) : (
          <div className="flex-1 overflow-auto min-h-0">
            <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {rows.length} rows parsed — {newRows.length} new, {duplicateCount} already on watchlist
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i} className={row.isDuplicate ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(i)}
                        disabled={row.isDuplicate}
                        onCheckedChange={() => toggleRow(i)}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium">{row.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{row.companyName || "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {row.isDuplicate ? (
                        <Badge variant="secondary" className="text-xs">Already on watchlist</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">New</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter className="gap-2">
          {rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={reset}>
              Choose Different File
            </Button>
          )}
          <Button
            size="sm"
            disabled={rows.length === 0 || selectedCount === 0 || importing}
            onClick={handleImport}
          >
            {importing ? "Importing..." : `Import ${selectedCount} Stock${selectedCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
