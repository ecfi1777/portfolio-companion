import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortfolioSettings, DEFAULT_SETTINGS, getPerPositionTarget, CATEGORY_COLOR_PALETTE, type PortfolioSettings, type CategoryConfig, type TierConfig } from "@/hooks/use-portfolio-settings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Save, Eye, EyeOff, Key, Mail, Check, Plus, Trash2 } from "lucide-react";
import { ManagePortfolioSection } from "@/components/ManagePortfolioSection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type SectionKey = "tiers" | "api" | "notifications";

export default function Settings() {
  const { settings, updateSettings, loading } = usePortfolioSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PortfolioSettings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
  const [savedSection, setSavedSection] = useState<SectionKey | null>(null);
  const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("positions")
        .select("current_value");
      if (data) {
        const total = data.reduce((sum, p) => sum + (p.current_value ?? 0), 0);
        setPortfolioTotal(total);
      }
    })();
  }, []);

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

  // Compute total of all tier allocations + tier-less category target_pct
  const tierTotal = draft.categories.reduce(
    (sum, cat) => {
      if (cat.tiers.length > 0) {
        return sum + cat.tiers.reduce((s, t) => s + t.allocation_pct, 0);
      }
      return sum + (cat.target_pct ?? 0);
    },
    0
  );
  const tierValid = Math.abs(tierTotal - 100) < 0.01;


  const saveSection = async (section: SectionKey) => {
    let next: PortfolioSettings;
    switch (section) {
      case "tiers":
        if (!tierValid) {
          setTierError(`Allocation targets must total 100% to save. Current total: ${tierTotal.toFixed(1)}%.`);
          toast({ title: "Cannot save", description: `Allocation targets must total 100%. Current total: ${tierTotal.toFixed(1)}%.`, variant: "destructive" });
          return;
        }
        setTierError(null);
        next = { ...settings, categories: draft.categories };
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
    if (section === "tiers") {
      toast({ title: "Allocation targets saved successfully" });
    }
    showSaved(section);
  };

  const resetSection = async (section: SectionKey) => {
    let patch: Partial<PortfolioSettings>;
    switch (section) {
      case "tiers":
        patch = { categories: DEFAULT_SETTINGS.categories };
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
        tiers: [...cat.tiers, { key: newKey, name: newKey, allocation_pct: 0, max_positions: 1 }],
        target_pct: undefined, // Clear category-level allocation when adding tiers
      };
      return { ...d, categories: cats };
    });
  };

  const removeTier = (catIdx: number, tierIdx: number) => {
    setDraft((d) => {
      const cats = [...d.categories];
      const tiers = cats[catIdx].tiers.filter((_, i) => i !== tierIdx);
      cats[catIdx] = { ...cats[catIdx], tiers };
      // If no tiers left, initialize target_pct to 0
      if (tiers.length === 0) {
        cats[catIdx] = { ...cats[catIdx], target_pct: 0 };
      }
      return { ...d, categories: cats };
    });
  };

  const addCategory = () => {
    setDraft((d) => {
      if (d.categories.length >= 10) return d;
      const usedColors = d.categories.map((c) => c.color);
      const nextColor = CATEGORY_COLOR_PALETTE.find((c) => !usedColors.includes(c)) ?? CATEGORY_COLOR_PALETTE[d.categories.length % CATEGORY_COLOR_PALETTE.length];
      const idx = d.categories.length + 1;
      const key = `CAT_${idx}`;
      const newCat: CategoryConfig = {
        key,
        display_name: `Category ${idx}`,
        color: nextColor,
        target_positions: 1,
        tiers: [{ key: `${key.substring(0, 3)}1`, name: `${key.substring(0, 3)}1`, allocation_pct: 0, max_positions: 1 }],
      };
      return { ...d, categories: [...d.categories, newCat] };
    });
  };

  const removeCategory = (catIdx: number) => {
    setDraft((d) => {
      if (d.categories.length <= 1) return d;
      return { ...d, categories: d.categories.filter((_, i) => i !== catIdx) };
    });
  };

  const fmtDollar = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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

      {/* Portfolio Categories & Tiers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Portfolio Categories & Tiers</CardTitle>
              <CardDescription>
                Set categories, colors, allocation %, and max positions per tier. Per-position weight is auto-calculated.{" "}
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
            <SectionActions section="tiers" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {draft.categories.map((cat, catIdx) => {
            const catTotal = cat.tiers.length > 0
              ? cat.tiers.reduce((s, t) => s + t.allocation_pct, 0)
              : (cat.target_pct ?? 0);
            return (
              <div key={cat.key} className="space-y-3">
                {/* Category header row */}
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        disabled={draft.categories.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove category "{cat.display_name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Any positions assigned to this category will become unassigned. This change takes effect when you save.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeCategory(catIdx)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Color picker */}
                <div className="flex items-center gap-2 pl-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Color</Label>
                  <div className="flex items-center gap-1.5">
                    {CATEGORY_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                        onClick={() => updateCategory(catIdx, { color })}
                      >
                        {cat.color === color && <Check className="h-3 w-3 text-white" />}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={cat.color}
                    onChange={(e) => updateCategory(catIdx, { color: e.target.value })}
                    className="h-7 text-xs w-24 ml-2"
                    placeholder="#hex"
                  />
                </div>

                {/* Target positions */}
                <div className="flex items-center gap-2 pl-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Target Positions</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={cat.target_positions}
                    onChange={(e) => updateCategory(catIdx, { target_positions: Math.max(1, Math.floor(Number(e.target.value))) })}
                    className="h-7 text-sm w-20"
                  />
                </div>

                {/* Tiers table or tier-less allocation */}
                {cat.tiers.length > 0 ? (
                  <div className="pl-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs h-8">Tier</TableHead>
                          <TableHead className="text-xs h-8 text-right">Allocation %</TableHead>
                          <TableHead className="text-xs h-8 text-right">Max Pos.</TableHead>
                          <TableHead className="text-xs h-8 text-right">Per Position</TableHead>
                          <TableHead className="text-xs h-8 w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cat.tiers.map((tier, tierIdx) => {
                          const perPos = getPerPositionTarget(tier);
                          const perPosDollar = portfolioTotal != null ? (perPos / 100) * portfolioTotal : null;
                          return (
                            <TableRow key={tier.key}>
                              <TableCell className="py-1">
                                <Input
                                  value={tier.name}
                                  onChange={(e) => updateTier(catIdx, tierIdx, { name: e.target.value, key: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                                  className="h-7 text-sm w-20"
                                  placeholder="Tier"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <div className="relative w-20 ml-auto">
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    value={tier.allocation_pct}
                                    onChange={(e) => updateTier(catIdx, tierIdx, { allocation_pct: Number(e.target.value) })}
                                    className="h-7 text-sm pr-6"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <Input
                                  type="number"
                                  step="1"
                                  min="1"
                                  value={tier.max_positions}
                                  onChange={(e) => updateTier(catIdx, tierIdx, { max_positions: Math.max(1, Math.floor(Number(e.target.value))) })}
                                  className="h-7 text-sm w-16 ml-auto"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {perPos.toFixed(1)}%
                                  {perPosDollar != null && (
                                    <span className="text-muted-foreground/60"> · {fmtDollar(perPosDollar)}</span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="py-1">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove tier "{tier.name}"?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Any positions currently assigned to this tier will become unassigned. This change takes effect when you save.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => removeTier(catIdx, tierIdx)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        Remove
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground mt-1"
                      onClick={() => addTier(catIdx)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Tier
                    </Button>
                  </div>
                ) : (
                  /* Tier-less category: show allocation % input */
                  <div className="pl-2 flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground shrink-0">Allocation %</Label>
                    <div className="relative w-24">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={cat.target_pct ?? 0}
                        onChange={(e) => updateCategory(catIdx, { target_pct: Number(e.target.value) })}
                        className="h-7 text-sm pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                    </div>
                    <span className="text-xs text-muted-foreground">No tiers</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => addTier(catIdx)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Tier
                    </Button>
                  </div>
                )}

                {catIdx < draft.categories.length - 1 && (
                  <div className="border-b border-border/50" />
                )}
              </div>
            );
          })}

          {/* Add Category button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addCategory}
            disabled={draft.categories.length >= 10}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Category {draft.categories.length >= 10 && "(max 10)"}
          </Button>

          {/* Grand total */}
          <div className={`border-t pt-3 flex items-center justify-between rounded-md px-2 -mx-2 ${
            tierError && !tierValid ? "border-destructive bg-destructive/10 py-3" : "border-border"
          }`}>
            <span className={`text-sm font-medium ${tierError && !tierValid ? "text-destructive" : ""}`}>Total Allocation</span>
            <span className={`text-sm font-bold tabular-nums ${tierValid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {tierTotal.toFixed(1)}%
            </span>
          </div>

          {/* Error banner */}
          {tierError && !tierValid && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex items-center gap-2">
              <span className="font-medium">{tierError}</span>
            </div>
          )}
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

      {/* Manage Portfolio */}
      <div id="manage-portfolio">
        <ManagePortfolioSection />
      </div>
    </div>
  );
}
