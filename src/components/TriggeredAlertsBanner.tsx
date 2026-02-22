import { X, Bell, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PriceAlert } from "@/hooks/use-alerts";

const ALERT_LABELS: Record<string, string> = {
  PRICE_ABOVE: "price above",
  PRICE_BELOW: "price below",
  PCT_CHANGE_UP: "% up",
  PCT_CHANGE_DOWN: "% down",
};

function fmtTarget(alert: PriceAlert) {
  if (alert.alert_type === "PCT_CHANGE_UP" || alert.alert_type === "PCT_CHANGE_DOWN") {
    return `${alert.target_value}%`;
  }
  return `$${alert.target_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface Props {
  alerts: PriceAlert[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export function TriggeredAlertsBanner({ alerts, onDismiss, onDismissAll }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-medium">
          <Bell className="h-3.5 w-3.5" />
          {alerts.length} triggered alert{alerts.length > 1 ? "s" : ""}
        </div>
        {alerts.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            onClick={onDismissAll}
          >
            <XCircle className="mr-1 h-3 w-3" />
            Dismiss All
          </Button>
        )}
      </div>
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <span>
            <strong>{a.symbol}</strong> hit your {ALERT_LABELS[a.alert_type] ?? a.alert_type} target of{" "}
            {fmtTarget(a)}
            {a.triggered_at && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                {fmtTime(a.triggered_at)}
              </span>
            )}
          </span>
          <button
            onClick={() => onDismiss(a.id)}
            className="shrink-0 rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
            aria-label={`Dismiss alert for ${a.symbol}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
