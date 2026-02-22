import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export type AlertType = "PRICE_ABOVE" | "PRICE_BELOW" | "PCT_CHANGE_UP" | "PCT_CHANGE_DOWN";

export interface PriceAlert {
  id: string;
  user_id: string;
  watchlist_entry_id: string;
  symbol: string;
  alert_type: AlertType;
  target_value: number;
  reference_price: number | null;
  is_active: boolean;
  triggered_at: string | null;
  acknowledged_at: string | null;
  notification_sent: boolean;
  created_at: string;
  last_notified_at: string | null;
  notify_time: string | null;
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("price_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    setAlerts((data ?? []) as PriceAlert[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const createAlert = useCallback(
    async (data: {
      watchlist_entry_id: string;
      symbol: string;
      alert_type: AlertType;
      target_value: number;
      reference_price?: number;
      notify_time?: string;
    }) => {
      if (!user) return;
      const { error } = await supabase.from("price_alerts").insert({
        user_id: user.id,
        watchlist_entry_id: data.watchlist_entry_id,
        symbol: data.symbol.toUpperCase(),
        alert_type: data.alert_type,
        target_value: data.target_value,
        reference_price: data.reference_price ?? null,
        notify_time: data.notify_time ?? null,
      } as any);

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Alert exists",
            description: `A ${data.alert_type} alert already exists for ${data.symbol}.`,
            variant: "destructive",
          });
        } else {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "Alert created", description: `${data.alert_type} alert set for ${data.symbol}.` });
      await fetchAlerts();
    },
    [user, fetchAlerts]
  );

  const updateAlert = useCallback(
    async (id: string, data: Partial<Pick<PriceAlert, "target_value" | "alert_type" | "reference_price" | "is_active">>) => {
      if (!user) return;
      await supabase.from("price_alerts").update(data as any).eq("id", id);
      await fetchAlerts();
    },
    [user, fetchAlerts]
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      if (!user) return;
      await supabase.from("price_alerts").delete().eq("id", id);
      toast({ title: "Alert deleted" });
      await fetchAlerts();
    },
    [user, fetchAlerts]
  );

  const getAlertsForEntry = useCallback(
    (entryId: string) => alerts.filter((a) => a.watchlist_entry_id === entryId),
    [alerts]
  );

  const acknowledgeAlert = useCallback(
    async (id: string) => {
      if (!user) return;
      await supabase
        .from("price_alerts")
        .update({ acknowledged_at: new Date().toISOString() } as any)
        .eq("id", id);
      await fetchAlerts();
    },
    [user, fetchAlerts]
  );

  const acknowledgeAllAlerts = useCallback(
    async () => {
      if (!user) return;
      const unacked = alerts.filter((a) => a.triggered_at != null && a.acknowledged_at == null);
      if (unacked.length === 0) return;
      await supabase
        .from("price_alerts")
        .update({ acknowledged_at: new Date().toISOString() } as any)
        .in("id", unacked.map((a) => a.id));
      await fetchAlerts();
    },
    [user, alerts, fetchAlerts]
  );

  const activeAlerts = alerts.filter((a) => a.is_active);
  const triggeredAlerts = alerts.filter((a) => a.triggered_at != null).sort(
    (a, b) => new Date(b.triggered_at!).getTime() - new Date(a.triggered_at!).getTime()
  );
  const unacknowledgedAlerts = triggeredAlerts.filter((a) => a.acknowledged_at == null);

  return {
    alerts,
    activeAlerts,
    triggeredAlerts,
    unacknowledgedAlerts,
    loading,
    createAlert,
    updateAlert,
    deleteAlert,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    getAlertsForEntry,
    refetch: fetchAlerts,
  };
}
