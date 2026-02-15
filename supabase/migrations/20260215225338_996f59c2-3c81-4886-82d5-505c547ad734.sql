
-- Change account column from varchar to jsonb to store per-account breakdowns
ALTER TABLE public.positions 
  ALTER COLUMN account TYPE jsonb USING 
    CASE 
      WHEN account IS NULL OR account = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object('account', account, 'shares', shares, 'value', current_value))
    END;

-- Set default to empty array
ALTER TABLE public.positions ALTER COLUMN account SET DEFAULT '[]'::jsonb;
