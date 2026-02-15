
-- Create enums for category and tier
CREATE TYPE public.position_category AS ENUM ('CORE', 'TITAN', 'CONSENSUS');
CREATE TYPE public.position_tier AS ENUM ('C1', 'C2', 'C3', 'TT', 'CON');

-- Create positions table
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol VARCHAR NOT NULL,
  company_name VARCHAR,
  shares DECIMAL DEFAULT 0,
  current_price DECIMAL DEFAULT 0,
  current_value DECIMAL DEFAULT 0,
  cost_basis DECIMAL DEFAULT 0,
  category public.position_category DEFAULT NULL,
  tier public.position_tier DEFAULT NULL,
  account VARCHAR,
  notes TEXT,
  date_added TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- Create portfolio_summary table
CREATE TABLE public.portfolio_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  cash_balance DECIMAL DEFAULT 0,
  last_import_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_summary ENABLE ROW LEVEL SECURITY;

-- Positions RLS policies
CREATE POLICY "Users can view their own positions"
  ON public.positions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own positions"
  ON public.positions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions"
  ON public.positions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own positions"
  ON public.positions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Portfolio summary RLS policies
CREATE POLICY "Users can view their own summary"
  ON public.portfolio_summary FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own summary"
  ON public.portfolio_summary FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own summary"
  ON public.portfolio_summary FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_portfolio_summary_updated_at
  BEFORE UPDATE ON public.portfolio_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
