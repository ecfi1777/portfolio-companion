import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Loader2 } from "lucide-react";
import { lookupSymbol } from "@/lib/fmp-api";
import { toast } from "@/hooks/use-toast";

interface OverlapDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenA: { name: string; color: string; symbols: string[] };
  screenB: { name: string; color: string; symbols: string[] };
  watchlistSymbols: Set<string>;
  portfolioSymbols: Set<string>;
  fmpApiKey?: string;
  onAdd: (data: {
    symbol: string;
    company_name?: string;
    price_when_added?: number;
    industry?: string;
    sector?: string;
    market_cap?: number;
  }) => Promise<string | null>;
}

export function OverlapDetailModal({
  open, onOpenChange, screenA, screenB, watchlistSymbols, portfolioSymbols, fmpApiKey, onAdd,
}: OverlapDetailModalProps) {
  const [addedSymbols, setAddedSymbols] = useState<Set<string>>(new Set());
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);

  const overlap = useMemo(() => {
    const setA = new Set(screenA.symbols.map((s) => s.toUpperCase()));
    return screenB.symbols
      .map((s) => s.toUpperCase())
      .filter((s) => setA.has(s))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();
  }, [screenA.symbols, screenB.symbols]);

  const handleAdd = async (symbol: string) => {
    setAddingSymbol(symbol);
    try {
      // Enrich with FMP data if API key is available
      let enrichedData: Parameters<typeof onAdd>[0] = { symbol };
      if (fmpApiKey) {
        const profile = await lookupSymbol(symbol, fmpApiKey);
        if (profile) {
          enrichedData = {
            symbol,
            company_name: profile.companyName || undefined,
            price_when_added: profile.price || undefined,
            industry: profile.industry || undefined,
            sector: profile.sector || undefined,
            market_cap: profile.mktCap || undefined,
          };
        }
      }
      const id = await onAdd(enrichedData);
      if (id) {
        setAddedSymbols((prev) => new Set(prev).add(symbol.toUpperCase()));
      }
    } catch (err) {
      toast({ title: "Error", description: `Failed to add ${symbol}`, variant: "destructive" });
    }
    setAddingSymbol(null);
  };

  // Reset added symbols when modal closes
  const handleOpenChange = (v: boolean) => {
    if (!v) setAddedSymbols(new Set());
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: screenA.color }} />
            {screenA.name}
            <span className="text-muted-foreground">∩</span>
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: screenB.color }} />
            {screenB.name}
            <span className="text-muted-foreground">— {overlap.length} symbols</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Symbols appearing in both screens
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {overlap.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No overlapping symbols.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overlap.map((sym) => {
                  const onWatchlist = watchlistSymbols.has(sym) || addedSymbols.has(sym);
                  const inPortfolio = portfolioSymbols.has(sym);
                  return (
                    <TableRow key={sym}>
                      <TableCell className="font-medium text-sm">{sym}</TableCell>
                      <TableCell className="text-right">
                        {onWatchlist ? (
                          <Check className="h-4 w-4 text-green-500 inline-block" />
                        ) : inPortfolio ? (
                          <Badge variant="secondary" className="text-xs">Held</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={addingSymbol === sym}
                            onClick={() => handleAdd(sym)}
                          >
                            {addingSymbol === sym ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            {addingSymbol === sym ? "" : "Add"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
