import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, ChevronDown, ChevronLeft, ChevronRight, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { parseGenericCSV, detectSymbolColumn, type GenericCSVResult } from "@/lib/csv-generic-parser";
import { type Screen, type useScreens } from "@/hooks/use-screens";
import { type WatchlistEntry, type Tag } from "@/hooks/use-watchlist";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3 | 4;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screens: Screen[];
  entries: WatchlistEntry[];
  tags: Tag[];
  createScreen: ReturnType<typeof useScreens>["createScreen"];
  createRun: ReturnType<typeof useScreens>["createRun"];
  addEntry: (data: { symbol: string; tag_ids?: string[] }) => Promise<void>;
  refetchWatchlist: () => Promise<void>;
}

export function ScreenUploadModal({
  open, onOpenChange, screens, entries, tags, createScreen, createRun, addEntry, refetchWatchlist,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // Step 1: Screen selection
  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  // Step 2: CSV upload
  const [csvData, setCsvData] = useState<GenericCSVResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3: Column selection
  const [symbolColIdx, setSymbolColIdx] = useState(0);

  // Step 4: Results
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{
    totalSymbols: number;
    matchCount: number;
    matched: string[];
    unmatched: string[];
    tagCode: string;
    tagId: string | null;
  } | null>(null);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [nonMatchOpen, setNonMatchOpen] = useState(false);

  const resetState = useCallback(() => {
    setStep(1);
    setSelectedScreenId("");
    setCreateNew(false);
    setNewName("");
    setNewCode("");
    setCsvData(null);
    setFileName("");
    setSymbolColIdx(0);
    setResults(null);
    setProcessing(false);
    setAddingSymbol(null);
    setNonMatchOpen(false);
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o) resetState();
    onOpenChange(o);
  };

  const activeScreen = useMemo(
    () => screens.find((s) => s.id === selectedScreenId),
    [screens, selectedScreenId]
  );

  // Step 1 → 2
  const handleStep1Next = async () => {
    if (createNew) {
      if (!newName.trim() || !newCode.trim()) return;
      const screen = await createScreen(newName, newCode);
      if (!screen) {
        toast({ title: "Error", description: "Screen short code may already exist.", variant: "destructive" });
        return;
      }
      setSelectedScreenId(screen.id);
    }
    if (!selectedScreenId && !createNew) return;
    setStep(2);
  };

  // File handling
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseGenericCSV(text);
      setCsvData(parsed);
      setFileName(file.name);
      const detected = detectSymbolColumn(parsed.headers, parsed.rows);
      setSymbolColIdx(detected);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
  };

  // Step 3 → 4: Process
  const handleProcess = async () => {
    if (!csvData || !user) return;
    setProcessing(true);

    const symbols = csvData.rows
      .map((r) => (r[symbolColIdx] ?? "").trim().toUpperCase())
      .filter((s) => s.length > 0 && s.length <= 10 && /^[A-Z.]+$/.test(s));

    const uniqueSymbols = [...new Set(symbols)];
    const watchlistSymbols = new Set(entries.map((e) => e.symbol.toUpperCase()));

    const matched = uniqueSymbols.filter((s) => watchlistSymbols.has(s));
    const unmatched = uniqueSymbols.filter((s) => !watchlistSymbols.has(s));

    // Determine the screen for tag code
    const screen = activeScreen ?? screens.find((s) => s.id === selectedScreenId);
    const shortCode = screen?.short_code ?? "SCR";
    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${String(today.getFullYear()).slice(-2)}`;
    const tagCode = `${shortCode}-${dateStr}`;

    // Create the auto-tag
    let tagId: string | null = null;
    if (matched.length > 0) {
      const { data: tagData } = await supabase
        .from("tags")
        .insert({
          user_id: user.id,
          short_code: tagCode,
          full_name: `${screen?.name ?? "Screen"} – ${dateStr}`,
          color: "#6366F1",
          is_system_tag: true,
        })
        .select()
        .single();
      tagId = tagData?.id ?? null;

      // Apply tag to matched watchlist entries
      if (tagId) {
        const matchedEntries = entries.filter((e) => matched.includes(e.symbol.toUpperCase()));
        const tagAssociations = matchedEntries.map((e) => ({
          watchlist_entry_id: e.id,
          tag_id: tagId!,
        }));
        if (tagAssociations.length > 0) {
          await supabase.from("watchlist_entry_tags").insert(tagAssociations);
        }
      }
    }

    // Create the screen run record
    await createRun({
      screen_id: selectedScreenId,
      run_date: today.toISOString().split("T")[0],
      run_number: 1,
      total_symbols: uniqueSymbols.length,
      match_count: matched.length,
      matched_symbols: matched,
      auto_tag_id: tagId,
      auto_tag_code: tagCode,
    });

    setResults({
      totalSymbols: uniqueSymbols.length,
      matchCount: matched.length,
      matched,
      unmatched,
      tagCode,
      tagId,
    });

    await refetchWatchlist();
    setProcessing(false);
    setStep(4);
  };

  const handleQuickAdd = async (symbol: string) => {
    setAddingSymbol(symbol);
    await addEntry({
      symbol,
      tag_ids: results?.tagId ? [results.tagId] : [],
    });
    setResults((prev) =>
      prev
        ? {
            ...prev,
            matched: [...prev.matched, symbol],
            unmatched: prev.unmatched.filter((s) => s !== symbol),
            matchCount: prev.matchCount + 1,
          }
        : prev
    );
    setAddingSymbol(null);
  };

  // Preview of selected column values
  const columnPreview = useMemo(() => {
    if (!csvData) return [];
    return csvData.rows.slice(0, 8).map((r) => (r[symbolColIdx] ?? "").trim()).filter(Boolean);
  }, [csvData, symbolColIdx]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Select Screen"}
            {step === 2 && "Upload CSV"}
            {step === 3 && "Select Symbol Column"}
            {step === 4 && "Results"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select or Create Screen */}
        {step === 1 && (
          <div className="space-y-4">
            {screens.length > 0 && (
              <RadioGroup
                value={createNew ? "" : selectedScreenId}
                onValueChange={(v) => {
                  setSelectedScreenId(v);
                  setCreateNew(false);
                }}
              >
                {screens.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <RadioGroupItem value={s.id} id={`screen-${s.id}`} />
                    <Label htmlFor={`screen-${s.id}`} className="cursor-pointer">
                      {s.name} <span className="text-muted-foreground text-xs">({s.short_code})</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            <button
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded border w-full text-left transition-colors ${
                createNew ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              }`}
              onClick={() => {
                setCreateNew(true);
                setSelectedScreenId("");
              }}
            >
              <Plus className="h-4 w-4" />
              Create new screen
            </button>

            {createNew && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="e.g. Motley Fool"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Short Code</Label>
                  <Input
                    placeholder="e.g. MF"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="h-8"
                    maxLength={20}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleStep1Next}
                disabled={!createNew && !selectedScreenId}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              {fileName ? (
                <p className="text-sm font-medium">{fileName} — {csvData?.rows.length} rows</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Drop CSV file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports any CSV with a symbol/ticker column</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!csvData}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Select Symbol Column */}
        {step === 3 && csvData && (
          <div className="space-y-4">
            <RadioGroup
              value={String(symbolColIdx)}
              onValueChange={(v) => setSymbolColIdx(Number(v))}
            >
              {csvData.headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <RadioGroupItem value={String(i)} id={`col-${i}`} />
                  <Label htmlFor={`col-${i}`} className="cursor-pointer">{h || `Column ${i + 1}`}</Label>
                </div>
              ))}
            </RadioGroup>

            {columnPreview.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Preview of selected column:</p>
                <div className="flex flex-wrap gap-1">
                  {columnPreview.map((v, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
                  ))}
                  {csvData.rows.length > 8 && (
                    <Badge variant="outline" className="text-xs">+{csvData.rows.length - 8} more</Badge>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleProcess} disabled={processing}>
                {processing ? "Processing..." : "Process"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && results && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-bold">{results.totalSymbols}</p>
                <p className="text-xs text-muted-foreground">Total Symbols</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{results.matchCount}</p>
                <p className="text-xs text-muted-foreground">Matched</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{results.unmatched.length}</p>
                <p className="text-xs text-muted-foreground">Not on Watchlist</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Auto-tag <Badge variant="secondary" className="text-xs">{results.tagCode}</Badge> applied to matched entries
            </div>

            {/* Matched table */}
            {results.matched.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Matched Watchlist Stocks</p>
                <div className="max-h-40 overflow-y-auto border rounded">
                  <Table>
                    <TableBody>
                      {results.matched.map((s) => (
                        <TableRow key={s}>
                          <TableCell className="py-1.5 font-medium text-sm">{s}</TableCell>
                          <TableCell className="py-1.5 text-right">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Non-matched collapsible */}
            {results.unmatched.length > 0 && (
              <Collapsible open={nonMatchOpen} onOpenChange={setNonMatchOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-sm font-medium w-full text-left hover:underline">
                    <ChevronDown className={`h-4 w-4 transition-transform ${nonMatchOpen ? "rotate-180" : ""}`} />
                    Not on Watchlist ({results.unmatched.length})
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="max-h-40 overflow-y-auto border rounded mt-1">
                    <Table>
                      <TableBody>
                        {results.unmatched.map((s) => (
                          <TableRow key={s}>
                            <TableCell className="py-1.5 font-medium text-sm">{s}</TableCell>
                            <TableCell className="py-1.5 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                disabled={addingSymbol === s}
                                onClick={() => handleQuickAdd(s)}
                              >
                                {addingSymbol === s ? "Adding..." : (
                                  <>
                                    <Plus className="mr-1 h-3 w-3" />
                                    Add
                                  </>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
