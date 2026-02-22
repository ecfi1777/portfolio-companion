import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolioSettings, DEFAULT_SETTINGS, type PortfolioSettings } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Save, Eye, EyeOff, Key, Mail } from "lucide-react";

export default function Settings() {
  const { settings, updateSettings, loading } = usePortfolioSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PortfolioSettings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  const catSum =
    draft.category_targets.CORE +
    draft.category_targets.TITAN +
    draft.category_targets.CONSENSUS;
  const catValid = Math.abs(catSum - 100) < 0.01;

  const handleSave = async () => {
    if (!catValid) {
      toast({ title: "Category targets must sum to 100%", variant: "destructive" });
      return;
    }
    await updateSettings(draft);
    toast({ title: "Settings saved" });
  };

  const handleReset = async () => {
    setDraft(DEFAULT_SETTINGS);
    await updateSettings(DEFAULT_SETTINGS);
    toast({ title: "Settings reset to defaults" });
  };

  const setCat = (key: keyof PortfolioSettings["category_targets"], v: number) =>
    setDraft((d) => ({ ...d, category_targets: { ...d.category_targets, [key]: v } }));

  const setTier = (key: keyof PortfolioSettings["tier_goals"], v: number) =>
    setDraft((d) => ({ ...d, tier_goals: { ...d.tier_goals, [key]: v } }));

  const setCount = (key: "min" | "max", v: number) =>
    setDraft((d) => ({ ...d, position_count_target: { ...d.position_count_target, [key]: v } }));

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!catValid}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {/* Category Allocation Targets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category Allocation Targets</CardTitle>
          <CardDescription>
            Must sum to 100%.{" "}
            {!catValid && (
              <span className="text-destructive font-medium">
                Currently {catSum.toFixed(1)}%
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          {(["CORE", "TITAN", "CONSENSUS"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <Label>{key}</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={draft.category_targets[key]}
                  onChange={(e) => setCat(key, Number(e.target.value))}
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Position Count Target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Position Count Target</CardTitle>
          <CardDescription>Target range for total positions in the portfolio.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Min</Label>
            <Input
              type="number"
              min="1"
              value={draft.position_count_target.min}
              onChange={(e) => setCount("min", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Max</Label>
            <Input
              type="number"
              min="1"
              value={draft.position_count_target.max}
              onChange={(e) => setCount("max", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-Tier Weight Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Tier Weight Goals</CardTitle>
          <CardDescription>Target weight for each conviction tier as a percentage of total portfolio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {(["C1", "C2", "C3"] as const).map((key) => (
              <div key={key} className="space-y-1">
                <Label>Core {key}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={draft.tier_goals[key]}
                    onChange={(e) => setTier(key, Number(e.target.value))}
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Titan (TT)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.tier_goals.TT}
                  onChange={(e) => setTier("TT", Number(e.target.value))}
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Consensus Min</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.tier_goals.CON_MIN}
                  onChange={(e) => setTier("CON_MIN", Number(e.target.value))}
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Consensus Max</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={draft.tier_goals.CON_MAX}
                  onChange={(e) => setTier("CON_MAX", Number(e.target.value))}
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Data API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            Price Data API
          </CardTitle>
          <CardDescription>
            Enter your Financial Modeling Prep (FMP) API key to enable live price lookups and refreshes.
            Get a free key at{" "}
            <a href="https://financialmodelingprep.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              financialmodelingprep.com
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label htmlFor="fmp-key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="fmp-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Your FMP API key"
                  value={draft.fmp_api_key ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, fmp_api_key: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure email notifications for price alerts. Requires a Resend API key — get one free at{" "}
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              resend.com
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="notification-email">Notification Email</Label>
            <Input
              id="notification-email"
              type="email"
              placeholder="you@example.com"
              value={draft.notification_email ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notification_email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="default-notify-time">Default Alert Notification Time (ET)</Label>
            <Input
              id="default-notify-time"
              type="time"
              value={draft.default_notify_time ?? "09:30"}
              onChange={(e) => setDraft((d) => ({ ...d, default_notify_time: e.target.value }))}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              Alerts will only fire within ±10 minutes of this time. Individual alerts can override this.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="resend-key">Resend API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="resend-key"
                  type={showResendKey ? "text" : "password"}
                  placeholder="re_..."
                  value={draft.resend_api_key ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, resend_api_key: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResendKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showResendKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
