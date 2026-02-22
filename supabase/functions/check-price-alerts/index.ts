import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FMP_BASE = "https://financialmodelingprep.com/stable";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all active alerts
    const { data: alerts, error: alertsErr } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("is_active", true);

    if (alertsErr || !alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active alerts", error: alertsErr?.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs to fetch their API keys
    const userIds = [...new Set(alerts.map((a: any) => a.user_id))];

    // Fetch settings for all users with alerts
    const { data: settingsRows } = await supabase
      .from("portfolio_settings")
      .select("user_id, settings")
      .in("user_id", userIds);

    const userSettings = new Map<string, any>();
    for (const row of settingsRows ?? []) {
      userSettings.set(row.user_id, row.settings);
    }

    // Group alerts by user to batch price fetches
    const alertsByUser = new Map<string, any[]>();
    for (const alert of alerts) {
      if (!alertsByUser.has(alert.user_id)) alertsByUser.set(alert.user_id, []);
      alertsByUser.get(alert.user_id)!.push(alert);
    }

    let totalTriggered = 0;

    for (const [userId, userAlerts] of alertsByUser) {
      const settings = userSettings.get(userId);
      const fmpApiKey = settings?.fmp_api_key;
      if (!fmpApiKey) continue;

      const symbols = [...new Set(userAlerts.map((a: any) => a.symbol))];

      // Fetch quotes in batches of 50
      const quotes = new Map<string, number>();
      for (let i = 0; i < symbols.length; i += 50) {
        const batch = symbols.slice(i, i + 50);
        try {
          const res = await fetch(
            `${FMP_BASE}/batch-quote-short?symbols=${batch.join(",")}&apikey=${fmpApiKey}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data)) {
            for (const q of data) {
              quotes.set(q.symbol, q.price ?? 0);
            }
          }
        } catch {
          // continue
        }
      }

      // Check each alert
      for (const alert of userAlerts) {
        const currentPrice = quotes.get(alert.symbol);
        if (currentPrice == null || currentPrice === 0) continue;

        let triggered = false;
        switch (alert.alert_type) {
          case "PRICE_ABOVE":
            triggered = currentPrice >= alert.target_value;
            break;
          case "PRICE_BELOW":
            triggered = currentPrice <= alert.target_value;
            break;
          case "PCT_CHANGE_UP":
            if (alert.reference_price && alert.reference_price > 0) {
              triggered = currentPrice >= alert.reference_price * (1 + alert.target_value / 100);
            }
            break;
          case "PCT_CHANGE_DOWN":
            if (alert.reference_price && alert.reference_price > 0) {
              triggered = currentPrice <= alert.reference_price * (1 - alert.target_value / 100);
            }
            break;
        }

        if (triggered) {
          totalTriggered++;
          const nowIso = new Date().toISOString();

          // Deactivate alert
          await supabase
            .from("price_alerts")
            .update({ is_active: false, triggered_at: nowIso })
            .eq("id", alert.id);

          // Try to send email
          const resendKey = settings?.resend_api_key;
          const notificationEmail = settings?.notification_email;

          if (resendKey && notificationEmail) {
            try {
              // Get watchlist entry for additional context
              const { data: entry } = await supabase
                .from("watchlist_entries")
                .select("company_name, price_when_added, current_price")
                .eq("id", alert.watchlist_entry_id)
                .maybeSingle();

              const alertTypeLabel = alert.alert_type.replace(/_/g, " ");
              const targetLabel = alert.alert_type.startsWith("PCT")
                ? `${alert.target_value}%`
                : `$${alert.target_value.toFixed(2)}`;

              const subject = `🔔 Price Alert: ${alert.symbol} ${alertTypeLabel} ${targetLabel}`;

              let changeSinceAdded = "";
              if (entry?.price_when_added && entry.price_when_added > 0) {
                const pct = ((currentPrice - entry.price_when_added) / entry.price_when_added * 100).toFixed(2);
                changeSinceAdded = `<p>Change since added: ${Number(pct) >= 0 ? "+" : ""}${pct}%</p>`;
              }

              const html = `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Price Alert Triggered</h2>
                  <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0;">${alert.symbol}${entry?.company_name ? ` — ${entry.company_name}` : ""}</h3>
                    <p style="margin: 4px 0;"><strong>Alert:</strong> ${alertTypeLabel} ${targetLabel}</p>
                    <p style="margin: 4px 0;"><strong>Current Price:</strong> $${currentPrice.toFixed(2)}</p>
                    ${changeSinceAdded}
                    <p style="margin: 4px 0; color: #666; font-size: 14px;">Triggered at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
                  </div>
                  <p style="color: #666; font-size: 14px;">This alert has been deactivated. Set a new alert from your watchlist.</p>
                </div>
              `;

              const emailRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                  from: "Price Alerts <onboarding@resend.dev>",
                  to: [notificationEmail],
                  subject,
                  html,
                }),
              });

              if (emailRes.ok) {
                await supabase
                  .from("price_alerts")
                  .update({ notification_sent: true })
                  .eq("id", alert.id);
              }
            } catch (emailErr) {
              console.error("Email send failed:", emailErr);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Checked ${alerts.length} alerts, triggered ${totalTriggered}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Alert check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
