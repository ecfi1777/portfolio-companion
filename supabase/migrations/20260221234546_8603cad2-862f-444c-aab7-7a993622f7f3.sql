ALTER TABLE public.watchlist_entries
  ADD COLUMN last_price_update timestamptz;

ALTER TABLE public.positions
  ADD COLUMN last_price_update timestamptz;