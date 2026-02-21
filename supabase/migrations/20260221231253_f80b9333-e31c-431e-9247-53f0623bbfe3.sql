
CREATE TABLE public.portfolio_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{"category_targets":{"CORE":50,"TITAN":25,"CONSENSUS":25},"position_count_target":{"min":25,"max":35},"tier_goals":{"C1":8.5,"C2":6,"C3":5,"TT":2.5,"CON_MIN":1,"CON_MAX":5}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON public.portfolio_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON public.portfolio_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.portfolio_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_settings_updated_at
  BEFORE UPDATE ON public.portfolio_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
