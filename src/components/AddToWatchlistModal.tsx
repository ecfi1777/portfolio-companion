import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Bell } from "lucide-react";
import { lookupSymbol, type ProfileData } from "@/lib/fmp-api";
import { formatMarketCap, getMarketCapCategory } from "@/lib/market-cap";
import type { Tag } from "@/hooks/use-watchlist";
import type { AlertType } from "@/hooks/use-alerts";

export interface AddToWatchlistData {
  symbol: string;
  company_name?: string;
  price_when_added?: number;
  notes?: string;
  tag_ids?: string[];
  industry?: string;
  sector?: string;
  market_cap?: number;
}

export interface PendingAlertData {
  alert_type: AlertType;
  target_value: number;
  reference_price?: number;
  notify_time?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  fmpApiKey?: string;
  initialSymbol?: string;
  onSave: (data: AddToWatchlistData, alert?: PendingAlertData) => Promise<void>;
}

const ALERT_LABELS: Record<AlertType, string> = {
  PRICE_ABOVE: "Price Above",
  PRICE_BELOW: "Price Below",
  PCT_CHANGE_UP: "% Up From Current",
  PCT_CHANGE_DOWN: "% Down From Current",
};

export function AddToWatchlistModal({ open, onOpenChange, tags, fmpApiKey, initialSymbol, onSave }: Props) {
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

  // Alert fields
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertType, setAlertType] = useState<AlertType>("PRICE_ABOVE");
  const [alertValue, setAlertValue] = useState("");
  const [alertNotifyTime, setAlertNotifyTime] = useState("");

  useEffect(() => {
    if (open && initialSymbol) {
      const sym = initialSymbol.trim().toUpperCase();
      setSymbol(sym);
      if (fmpApiKey && sym) {
        setLooking(true);
        lookupSymbol(sym, fmpApiKey).then((data) => {
          setLooking(false);
          if (data) {
            setPreview(data);
            setCompanyName(data.companyName);
            setPrice(data.price.toString());
            setIndustry(data.industry);
            setSector(data.sector);
            setMarketCap(data.mktCap);
          }
        });
      }
    }
    if (!open) {
      setSymbol(""); setCompanyName(""); setPrice(""); setNotes("");
      setSelectedTags([]); setPreview(null); setIndustry(""); setSector("");
      setMarketCap(null); setAlertEnabled(false); setAlertType("PRICE_ABOVE"); setAlertValue(""); setAlertNotifyTime("");
    }
  }, [open, initialSymbol, fmpApiKey]);

  const activeTags = tags.filter((t) => t.is_active);
  const toggleTag = (id: string) => setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

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
      setIndustry(data.industry); setSector(data.sector); setMarketCap(data.mktCap);
    } else {
      setPreview(null);
    }
  };

  const handleSave = async () => {
    if (!symbol.trim()) return;
    setSaving(true);

    const alertData: PendingAlertData | undefined =
      alertEnabled && alertValue
        ? {
            alert_type: alertType,
            target_value: parseFloat(alertValue),
            reference_price:
              (alertType === "PCT_CHANGE_UP" || alertType === "PCT_CHANGE_DOWN") && price
                ? parseFloat(price)
                : undefined,
            notify_time: alertNotifyTime || undefined,
          }
        : undefined;

    await onSave(
      {
        symbol: symbol.trim(),
        company_name: companyName.trim() || undefined,
        price_when_added: price ? parseFloat(price) : undefined,
        notes: notes.trim() || undefined,
        tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
        industry: industry || undefined,
        sector: sector || undefined,
        market_cap: marketCap ?? undefined,
      },
      alertData
    );
    setSaving(false);
    onOpenChange(false);
  };

  const isPctAlert = alertType === "PCT_CHANGE_UP" || alertType === "PCT_CHANGE_DOWN";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol *</Label>
            <div className="relative">
              <Input id="symbol" placeholder="AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} onBlur={handleSymbolBlur} />
              {looking && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

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
                  <><span>·</span><Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getMarketCapCategory(preview.mktCap)} — {formatMarketCap(preview.mktCap)}</Badge></>
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
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${selectedTags.includes(tag.id) ? "ring-2 ring-ring ring-offset-1" : "opacity-60 hover:opacity-100"}`}
                    style={{ backgroundColor: tag.color ? `${tag.color}20` : undefined, color: tag.color ?? undefined, borderColor: tag.color ? `${tag.color}40` : undefined }}>
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

          {/* Price Alert */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="alert-toggle" className="text-sm font-medium cursor-pointer">Price Alert</Label>
              </div>
              <Switch id="alert-toggle" checked={alertEnabled} onCheckedChange={setAlertEnabled} />
            </div>
            {alertEnabled && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Alert Type</Label>
                  <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ALERT_LABELS) as AlertType[]).map((t) => (
                        <SelectItem key={t} value={t}>{ALERT_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isPctAlert ? "Percentage Threshold" : "Target Price"}</Label>
                  <div className="relative">
                    <Input type="number" step={isPctAlert ? "1" : "0.01"} placeholder={isPctAlert ? "10" : "200.00"} value={alertValue} onChange={(e) => setAlertValue(e.target.value)} className="pr-7" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{isPctAlert ? "%" : "$"}</span>
                  </div>
                  {isPctAlert && price && (
                    <p className="text-[11px] text-muted-foreground">
                      Reference: ${parseFloat(price).toFixed(2)} → triggers at $
                      {alertType === "PCT_CHANGE_UP"
                        ? (parseFloat(price) * (1 + (parseFloat(alertValue) || 0) / 100)).toFixed(2)
                        : (parseFloat(price) * (1 - (parseFloat(alertValue) || 0) / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notify Time (ET, optional)</Label>
                  <Input type="time" value={alertNotifyTime} onChange={(e) => setAlertNotifyTime(e.target.value)} className="h-8 text-sm w-32" />
                  <p className="text-[11px] text-muted-foreground">Leave blank for default from Settings</p>
                </div>
              </div>
            )}
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
