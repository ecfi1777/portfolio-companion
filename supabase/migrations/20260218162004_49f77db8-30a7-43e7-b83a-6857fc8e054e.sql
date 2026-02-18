
-- watchlist_entries table
CREATE TABLE public.watchlist_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol varchar NOT NULL,
  company_name varchar,
  date_added timestamptz NOT NULL DEFAULT now(),
  price_when_added numeric,
  current_price numeric,
  previous_close numeric,
  industry varchar,
  sector varchar,
  market_cap bigint,
  market_cap_category varchar,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE public.watchlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlist entries"
  ON public.watchlist_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watchlist entries"
  ON public.watchlist_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlist entries"
  ON public.watchlist_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlist entries"
  ON public.watchlist_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_watchlist_entries_updated_at
  BEFORE UPDATE ON public.watchlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- tags table
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  short_code varchar(20) NOT NULL,
  full_name varchar(100),
  color varchar(7),
  is_active boolean NOT NULL DEFAULT true,
  is_system_tag boolean NOT NULL DEFAULT false,
  screen_id uuid,
  screen_name varchar,
  screen_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, short_code)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- watchlist_entry_tags junction table
CREATE TABLE public.watchlist_entry_tags (
  watchlist_entry_id uuid NOT NULL REFERENCES public.watchlist_entries(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_entry_id, tag_id)
);

ALTER TABLE public.watchlist_entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entry tags"
  ON public.watchlist_entry_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_entries
      WHERE id = watchlist_entry_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own entry tags"
  ON public.watchlist_entry_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlist_entries
      WHERE id = watchlist_entry_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own entry tags"
  ON public.watchlist_entry_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_entries
      WHERE id = watchlist_entry_id AND user_id = auth.uid()
    )
  );
