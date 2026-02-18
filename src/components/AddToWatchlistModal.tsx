import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Tag } from "@/hooks/use-watchlist";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  onSave: (data: { symbol: string; company_name?: string; price_when_added?: number; notes?: string; tag_ids?: string[] }) => Promise<void>;
}

export function AddToWatchlistModal({ open, onOpenChange, tags, onSave }: Props) {
  const [symbol, setSymbol] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const activeTags = tags.filter((t) => t.is_active);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
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
    });
    setSaving(false);
    setSymbol("");
    setCompanyName("");
    setPrice("");
    setNotes("");
    setSelectedTags([]);
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
            <Input id="symbol" placeholder="AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </div>
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
