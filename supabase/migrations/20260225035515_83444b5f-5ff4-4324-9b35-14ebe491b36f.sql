
-- Create position_tags junction table
CREATE TABLE public.position_tags (
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(position_id, tag_id)
);

-- Add removed_tag_ids to positions
ALTER TABLE public.positions ADD COLUMN removed_tag_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Enable RLS
ALTER TABLE public.position_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own position tags" ON public.position_tags
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);

CREATE POLICY "Users can insert their own position tags" ON public.position_tags
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);

CREATE POLICY "Users can delete their own position tags" ON public.position_tags
FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.positions WHERE positions.id = position_tags.position_id AND positions.user_id = auth.uid())
);
