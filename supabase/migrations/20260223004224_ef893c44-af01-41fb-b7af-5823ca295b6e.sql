
-- Create import_history table to log CSV portfolio imports
CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_names TEXT[] NOT NULL DEFAULT '{}',
  total_positions INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own import history"
  ON public.import_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own import history"
  ON public.import_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import history"
  ON public.import_history FOR DELETE
  USING (auth.uid() = user_id);
