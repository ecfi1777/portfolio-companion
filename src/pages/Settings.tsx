import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolioSettings, DEFAULT_SETTINGS, type PortfolioSettings, type CategoryConfig, type TierConfig } from "@/hooks/use-portfolio-settings";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Save, Eye, EyeOff, Key, Mail, Check, Plus, Trash2 } from "lucide-react";

type SectionKey = "tiers" | "count" | "api" | "notifications";

export default function Settings() {
  const { settings, updateSettings, loading } = usePortfolioSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PortfolioSettings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
  const [savedSection, setSavedSection] = useState<SectionKey | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const showSaved = useCallback((section: SectionKey) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  // Compute total of all tier targets
  const tierTotal = draft.categories.reduce(
    (sum, cat) => sum + cat.tiers.reduce((s, t) => s + t.target_pct, 0),
    0
  );
  const tierValid = Math.abs(tierTotal - 100) < 0.01;

  const saveSection = async (section: SectionKey) => {
    let next: PortfolioSettings;
    switch (section) {
      case "tiers":
        if (!tierValid) {
          toast({ title: "Tier targets must sum to 100%", variant: "destructive" });
          return;
        }
        next = { ...settings, categories: draft.categories };
        break;
      case "count":
        next = { ...settings, position_count_target: draft.position_count_target };
        break;
      case "api":
        next = { ...settings, fmp_api_key: draft.fmp_api_key };
        break;
      case "notifications":
        next = {
          ...settings,
          notification_email: draft.notification_email,
          default_notify_time: draft.default_notify_time,
          resend_api_key: draft.resend_api_key,
        };
        break;
    }
    await updateSettings(next);
    showSaved(section);
  };

  const resetSection = async (section: SectionKey) => {
    let patch: Partial<PortfolioSettings>;
    switch (section) {
      case "tiers":
        patch = { categories: DEFAULT_SETTINGS.categories };
        break;
      case "count":
        patch = { position_count_target: DEFAULT_SETTINGS.position_count_target };
        break;
      case "api":
        patch = { fmp_api_key: undefined };
        break;
      case "notifications":
        patch = { notification_email: undefined, default_notify_time: undefined, resend_api_key: undefined };
        break;
    }
    const next = { ...settings, ...patch };
    setDraft((d) => ({ ...d, ...patch }));
    await updateSettings(next);
    toast({ title: "Section reset to defaults" });
  };

  const setCount = (key: "min" | "max", v: number) =>
    setDraft((d) => ({ ...d, position_count_target: { ...d.position_count_target, [key]: v } }));

  // Category/tier helpers
  const updateCategory = (catIdx: number, updates: Partial<CategoryConfig>) => {
    setDraft((d) => {
      const cats = [...d.categories];
      cats[catIdx] = { ...cats[catIdx], ...updates };
      return { ...d, categories: cats };
    });
  };

  const updateTier = (catIdx: number, tierIdx: number, updates: Partial<TierConfig>) => {
    setDraft((d) => {
      const cats = [...d.categories];
      const tiers = [...cats[catIdx].tiers];
      tiers[tierIdx] = { ...tiers[tierIdx], ...updates };
      cats[catIdx] = { ...cats[catIdx], tiers };
      return { ...d, categories: cats };
    });
  };

  const addTier = (catIdx: number) => {
    setDraft((d) => {
      const cats = [...d.categories];
      const cat = cats[catIdx];
      const newKey = `${cat.key.substring(0, 3)}${cat.tiers.length + 1}`;
      cats[catIdx] = {
        ...cat,
        tiers: [...cat.tiers, { key: newKey, name: newKey, target_pct: 0 }],
      };
      return { ...d, categories: cats };
    });
  };

  const removeTier = (catIdx: number, tierIdx: number) => {
    setDraft((d) => {
      const cats = [...d.categories];
      if (cats[catIdx].tiers.length <= 1) return d;
      const tiers = cats[catIdx].tiers.filter((_, i) => i !== tierIdx);
      cats[catIdx] = { ...cats[catIdx], tiers };
      return { ...d, categories: cats };
    });
  };

  const SectionActions = ({ section, disabled }: { section: SectionKey; disabled?: boolean }) => (
    <div className="flex items-center gap-2">
      {savedSection === section ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Saved
        </span>
      ) : (
        <>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => resetSection(section)}
          >
            <span className="flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Reset</span>
          </button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveSection(section)} disabled={disabled}>
            <Save className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Portfolio Tiers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Portfolio Tiers</CardTitle>
              <CardDescription>
                Configure categories and their tiers. Tier targets must sum to 100%.{" "}
                {!tierValid && (
                  <span className="text-destructive font-medium">
                    Currently {tierTotal.toFixed(1)}%
                  </span>
                )}
                {tierValid && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ 100%
                  </span>
                )}
              </CardDescription>
            </div>
            <SectionActions section="tiers" disabled={!tierValid} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {draft.categories.map((cat, catIdx) => {
            const catTotal = cat.tiers.reduce((s, t) => s + t.target_pct, 0);
            return (
              <div key={cat.key} className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground w-16 shrink-0">Name</Label>
                  <Input
                    value={cat.display_name}
                    onChange={(e) => updateCategory(catIdx, { display_name: e.target.value })}
                    className="h-8 text-sm font-medium max-w-[200px]"
                  />
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                    Subtotal: {catTotal.toFixed(1)}%
                  </span>
                </div>

                <div className="space-y-2 pl-4 border-l-2 border-border ml-2">
                  {cat.tiers.map((tier, tierIdx) => (
                    <div key={tier.key} className="flex items-center gap-2">
                      <Input
                        value={tier.name}
                        onChange={(e) => updateTier(catIdx, tierIdx, { name: e.target.value, key: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                        className="h-8 text-sm w-24"
                        placeholder="Tier name"
                      />
                      <div className="relative w-24">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={tier.target_pct}
                          onChange={(e) => updateTier(catIdx, tierIdx, { target_pct: Number(e.target.value) })}
                          className="h-8 text-sm pr-7"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeTier(catIdx, tierIdx)}
                        disabled={cat.tiers.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => addTier(catIdx)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Tier
                  </Button>
                </div>

                {catIdx < draft.categories.length - 1 && (
                  <div className="border-b border-border/50" />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Position Count Target */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Position Count Target</CardTitle>
              <CardDescription>Target range for total positions in the portfolio.</CardDescription>
            </div>
            <SectionActions section="count" />
          </div>
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

      {/* Price Data API */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
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
            </div>
            <SectionActions section="api" />
          </div>
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
          <div className="flex items-center justify-between">
            <div>
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
            </div>
            <SectionActions section="notifications" />
          </div>
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
