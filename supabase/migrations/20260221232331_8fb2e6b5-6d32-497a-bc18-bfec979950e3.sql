ALTER TABLE public.positions
  ADD COLUMN source text,
  ADD COLUMN first_seen_at timestamptz;

ALTER TABLE public.positions
  ALTER COLUMN first_seen_at SET DEFAULT now();