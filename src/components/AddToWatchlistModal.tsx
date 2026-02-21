import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { lookupSymbol, type ProfileData } from "@/lib/fmp-api";
import { formatMarketCap, getMarketCapCategory } from "@/lib/market-cap";
import type { Tag } from "@/hooks/use-watchlist";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  fmpApiKey?: string;
  onSave: (data: {
    symbol: string;
    company_name?: string;
    price_when_added?: number;
    notes?: string;
    tag_ids?: string[];
    industry?: string;
    sector?: string;
    market_cap?: number;
  }) => Promise<void>;
}

export function AddToWatchlistModal({ open, onOpenChange, tags, fmpApiKey, onSave }: Props) {
  const [symbol, setSymbol] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [preview, setPreview] = useState<ProfileData | null>(null);
  const [industry, setIndustry] = useState("");
  const [sector, setSector] = useState("");
  const [marketCap, setMarketCap] = useState<number | null>(null);

  const activeTags = tags.filter((t) => t.is_active);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleSymbolBlur = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !fmpApiKey) return;
    setLooking(true);
    const data = await lookupSymbol(sym, fmpApiKey);
    setLooking(false);
    if (data) {
      setPreview(data);
      if (!companyName) setCompanyName(data.companyName);
      if (!price) setPrice(data.price.toString());
      setIndustry(data.industry);
      setSector(data.sector);
      setMarketCap(data.mktCap);
    } else {
      setPreview(null);
    }
  };

  const handleSave = async () => {
    if (!symbol.trim()) return;
    setSaving(true);
    await onSave({
      symbol: symbol.trim(),
      company_name: companyName.trim() || undefined,
      price_when_added: price ? parseFloat(price) : undefined,
      notes: notes.trim() || undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
      industry: industry || undefined,
      sector: sector || undefined,
      market_cap: marketCap ?? undefined,
    });
    setSaving(false);
    setSymbol("");
    setCompanyName("");
    setPrice("");
    setNotes("");
    setSelectedTags([]);
    setPreview(null);
    setIndustry("");
    setSector("");
    setMarketCap(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol *</Label>
            <div className="relative">
              <Input
                id="symbol"
                placeholder="AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onBlur={handleSymbolBlur}
              />
              {looking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Preview card from FMP lookup */}
          {preview && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{preview.companyName}</span>
                <span className="font-mono">${preview.price.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {preview.sector && <span>{preview.sector}</span>}
                {preview.industry && <><span>·</span><span>{preview.industry}</span></>}
                {preview.mktCap > 0 && (
                  <>
                    <span>·</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {getMarketCapCategory(preview.mktCap)} — {formatMarketCap(preview.mktCap)}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="company">Company Name</Label>
            <Input id="company" placeholder="Apple Inc." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price When Added</Label>
            <Input id="price" type="number" step="0.01" placeholder="150.00" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          {activeTags.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {activeTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                      selectedTags.includes(tag.id)
                        ? "ring-2 ring-ring ring-offset-1"
                        : "opacity-60 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: tag.color ? `${tag.color}20` : undefined,
                      color: tag.color ?? undefined,
                      borderColor: tag.color ? `${tag.color}40` : undefined,
                    }}
                  >
                    {tag.short_code}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Why are you watching this stock?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!symbol.trim() || saving}>
            {saving ? "Saving..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
