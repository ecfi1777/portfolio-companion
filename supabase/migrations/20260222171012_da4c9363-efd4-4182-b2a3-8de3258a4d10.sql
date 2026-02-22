
-- Create alert_type enum
CREATE TYPE public.alert_type AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'PCT_CHANGE_UP', 'PCT_CHANGE_DOWN');

-- Create price_alerts table
CREATE TABLE public.price_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  watchlist_entry_id uuid NOT NULL REFERENCES public.watchlist_entries(id) ON DELETE CASCADE,
  symbol varchar NOT NULL,
  alert_type public.alert_type NOT NULL,
  target_value decimal NOT NULL,
  reference_price decimal,
  is_active boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  notification_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_entry_alert_type UNIQUE (user_id, watchlist_entry_id, alert_type)
);

-- Enable RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own alerts"
  ON public.price_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
  ON public.price_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON public.price_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON public.price_alerts FOR DELETE
  USING (auth.uid() = user_id);
