import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BellRing, ChevronDown, X } from "lucide-react";

interface Alert {
  id: string;
  symbol: string;
  alert_type: string;
  target_value: number;
  reference_price: number | null;
  triggered_at: string | null;
  notification_sent: boolean;
  is_active: boolean;
  acknowledged_at: string | null;
}

interface WatchlistAlertsSectionProps {
  activeAlerts: Alert[];
  triggeredAlerts: Alert[];
  alertsOpen: boolean;
  onToggleAlerts: () => void;
  alertTab: string;
  onAlertTabChange: (tab: string) => void;
  onDeleteAlertConfirm: (id: string) => void;
}

export function WatchlistAlertsSection({
  activeAlerts,
  triggeredAlerts,
  alertsOpen,
  onToggleAlerts,
  alertTab,
  onAlertTabChange,
  onDeleteAlertConfirm,
}: WatchlistAlertsSectionProps) {
  if (activeAlerts.length === 0 && triggeredAlerts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={onToggleAlerts}
      >
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          Price Alerts
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${alertsOpen ? "rotate-180" : ""}`} />
        </h2>
      </div>
      {alertsOpen && (
        <Tabs value={alertTab} onValueChange={onAlertTabChange}>
          <TabsList>
            <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
            <TabsTrigger value="active">Active ({activeAlerts.length})</TabsTrigger>
            <TabsTrigger value="triggered">Triggered ({triggeredAlerts.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            {activeAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No active alerts.</p>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Alert Type</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeAlerts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.symbol}</TableCell>
                          <TableCell className="text-sm">{a.alert_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-sm">
                            {a.alert_type.startsWith("PCT") ? `${a.target_value}%` : `$${a.target_value}`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.reference_price ? `$${a.reference_price}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDeleteAlertConfirm(a.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="triggered">
            {triggeredAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No triggered alerts yet.</p>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Alert Type</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Triggered At</TableHead>
                        <TableHead>Notified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {triggeredAlerts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.symbol}</TableCell>
                          <TableCell className="text-sm">{a.alert_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-sm">
                            {a.alert_type.startsWith("PCT") ? `${a.target_value}%` : `$${a.target_value}`}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            {a.notification_sent ? (
                              <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
