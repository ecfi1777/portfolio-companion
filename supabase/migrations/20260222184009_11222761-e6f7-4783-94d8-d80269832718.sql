
-- Add last_notified_at and notify_time columns to price_alerts
ALTER TABLE public.price_alerts
  ADD COLUMN last_notified_at timestamptz DEFAULT NULL,
  ADD COLUMN notify_time time DEFAULT '09:30';
