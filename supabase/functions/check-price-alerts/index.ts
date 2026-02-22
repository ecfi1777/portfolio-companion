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

    // Current time in ET for notify_time window check
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const nowMinutes = nowET.getHours() * 60 + nowET.getMinutes();

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

      // Default notify_time from settings (format "HH:MM")
      const defaultNotifyTime = settings?.default_notify_time ?? "09:30";

      const symbols = [...new Set(userAlerts.map((a: any) => a.symbol))];

      // Fetch prices via /stable/profile
      const quotes = new Map<string, number>();
      for (const sym of symbols) {
        try {
          const url = `${FMP_BASE}/profile?symbol=${sym}&apikey=${fmpApiKey}`;
          console.log(`[FMP] Fetching profile for ${sym}`);
          const res = await fetch(url);
          const rawText = await res.text();
          console.log(`[FMP] ${sym} Status: ${res.status}, Response: ${rawText.substring(0, 300)}`);
          if (!res.ok) continue;
          const data = JSON.parse(rawText);
          if (Array.isArray(data) && data.length > 0) {
            quotes.set(data[0].symbol, data[0].price ?? 0);
            console.log(`[FMP] ${sym} price: ${data[0].price}`);
          }
        } catch (fetchErr) {
          console.error(`[FMP] Fetch error for ${sym}:`, fetchErr);
        }
      }

      // Check each alert
      for (const alert of userAlerts) {
        const currentPrice = quotes.get(alert.symbol);
        console.log(`[ALERT] ${alert.symbol}: type=${alert.alert_type}, target=${alert.target_value}, currentPrice=${currentPrice}, refPrice=${alert.reference_price}`);
        if (currentPrice == null || currentPrice === 0) {
          console.log(`[ALERT] ${alert.symbol}: Skipping - no price available`);
          continue;
        }

        // Skip if already notified within last 24 hours
        if (alert.last_notified_at) {
          const lastNotified = new Date(alert.last_notified_at).getTime();
          const hoursSince = (Date.now() - lastNotified) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            console.log(`[ALERT] ${alert.symbol}: Skipping - notified ${hoursSince.toFixed(1)}h ago`);
            continue;
          }
        }

        // Check notify_time window (±10 minutes)
        const alertNotifyTime = alert.notify_time ?? defaultNotifyTime;
        const [ntH, ntM] = (alertNotifyTime as string).split(":").map(Number);
        const notifyMinutes = ntH * 60 + ntM;
        const timeDiff = Math.abs(nowMinutes - notifyMinutes);
        const withinWindow = timeDiff <= 10 || timeDiff >= (24 * 60 - 10); // handle midnight wrap
        if (!withinWindow) {
          console.log(`[ALERT] ${alert.symbol}: Skipping - outside notify window (now=${nowET.toTimeString().slice(0,5)} ET, notify=${alertNotifyTime})`);
          continue;
        }

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
        console.log(`[ALERT] ${alert.symbol}: triggered=${triggered} (${currentPrice} ${alert.alert_type === 'PRICE_BELOW' ? '<=' : '>='} ${alert.target_value})`);

        if (triggered) {
          totalTriggered++;
          const nowIso = new Date().toISOString();

          // Record trigger time and last_notified_at — but do NOT deactivate
          await supabase
            .from("price_alerts")
            .update({ triggered_at: nowIso, last_notified_at: nowIso })
            .eq("id", alert.id);

          // Try to send email
          const resendKey = settings?.resend_api_key;
          const notificationEmail = settings?.notification_email;

          if (resendKey && notificationEmail) {
            try {
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
                  <p style="color: #666; font-size: 14px;">This alert will fire again tomorrow if the condition is still met. Deactivate or delete the alert from your watchlist to stop notifications.</p>
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