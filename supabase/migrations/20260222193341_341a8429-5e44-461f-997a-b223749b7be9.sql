
-- Step 1: Convert position_tier enum column to varchar, preserving existing data
ALTER TABLE public.positions
  ALTER COLUMN tier TYPE varchar(20) USING tier::text;

-- Step 2: Drop the old enum type
DROP TYPE IF EXISTS public.position_tier;
