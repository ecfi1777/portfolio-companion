ALTER TABLE public.watchlist_entries
  ADD COLUMN archived_at timestamptz DEFAULT NULL;