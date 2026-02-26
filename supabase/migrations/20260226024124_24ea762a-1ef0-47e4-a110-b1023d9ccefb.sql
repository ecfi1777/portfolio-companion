-- Create watchlist_groups table
CREATE TABLE public.watchlist_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  color varchar(7) DEFAULT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.watchlist_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own groups"
  ON public.watchlist_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own groups"
  ON public.watchlist_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own groups"
  ON public.watchlist_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own groups"
  ON public.watchlist_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Add group_id to watchlist_entries
ALTER TABLE public.watchlist_entries
  ADD COLUMN group_id uuid DEFAULT NULL
  REFERENCES public.watchlist_groups(id) ON DELETE SET NULL;