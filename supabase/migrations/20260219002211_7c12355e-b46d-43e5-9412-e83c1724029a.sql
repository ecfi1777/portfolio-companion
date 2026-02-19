
-- Screens table
CREATE TABLE public.screens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  short_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, short_code)
);

ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own screens" ON public.screens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own screens" ON public.screens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own screens" ON public.screens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own screens" ON public.screens FOR DELETE USING (auth.uid() = user_id);

-- Screen runs table
CREATE TABLE public.screen_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_number INTEGER NOT NULL DEFAULT 1,
  total_symbols INTEGER NOT NULL DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  matched_symbols TEXT[] DEFAULT '{}',
  auto_tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  auto_tag_code VARCHAR(30),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.screen_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own screen runs" ON public.screen_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own screen runs" ON public.screen_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own screen runs" ON public.screen_runs FOR DELETE USING (auth.uid() = user_id);
