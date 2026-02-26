import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell } from "lucide-react";
import type { AlertType } from "@/hooks/use-alerts";

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  PRICE_ABOVE: "Price Above",
  PRICE_BELOW: "Price Below",
  PCT_CHANGE_UP: "% Up",
  PCT_CHANGE_DOWN: "% Down",
};

interface AlertPopoverProps {
  entryId: string;
  symbol: string;
  currentPrice: number | null;
  createAlert: (data: {
    watchlist_entry_id: string;
    symbol: string;
    alert_type: AlertType;
    target_value: number;
    reference_price?: number;
    notify_time?: string;
  }) => Promise<void>;
}

export function AlertPopover({ entryId, symbol, currentPrice, createAlert }: AlertPopoverProps) {
  const [alertType, setAlertType] = useState<AlertType>("PRICE_ABOVE");
  const [value, setValue] = useState("");
  const [notifyTime, setNotifyTime] = useState("");
  const [open, setOpen] = useState(false);

  const isPct = alertType === "PCT_CHANGE_UP" || alertType === "PCT_CHANGE_DOWN";

  const handleAdd = async () => {
    if (!value) return;
    await createAlert({
      watchlist_entry_id: entryId,
      symbol,
      alert_type: alertType,
      target_value: parseFloat(value),
      reference_price: isPct && currentPrice ? currentPrice : undefined,
      notify_time: notifyTime || undefined,
    });
    setValue("");
    setNotifyTime("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Bell className="h-3 w-3" />
          Add Alert
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="start">
        <div className="space-y-1">
          <Label className="text-xs">Alert Type</Label>
          <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{ALERT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isPct ? "Threshold (%)" : "Target Price ($)"}</Label>
          <Input type="number" step={isPct ? "1" : "0.01"} value={value} onChange={(e) => setValue(e.target.value)} className="h-7 text-xs" placeholder={isPct ? "10" : "200.00"} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notify Time (ET)</Label>
          <Input type="time" value={notifyTime} onChange={(e) => setNotifyTime(e.target.value)} className="h-7 text-xs w-28" />
          <p className="text-[10px] text-muted-foreground">Blank = use default</p>
        </div>
        <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd} disabled={!value}>
          Set Alert
        </Button>
      </PopoverContent>
    </Popover>
  );
}
