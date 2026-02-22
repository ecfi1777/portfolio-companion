CREATE OR REPLACE FUNCTION public.get_screen_hits_for_user()
RETURNS TABLE(
  symbol text,
  screen_name text,
  screen_short_code text,
  screen_id uuid,
  screen_color text,
  heat_score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hits AS (
    SELECT DISTINCT
      ws.symbol,
      s.name AS screen_name,
      s.short_code AS screen_short_code,
      s.id AS screen_id,
      s.color AS screen_color
    FROM screen_runs sr
    JOIN screens s ON s.id = sr.screen_id
    JOIN watchlist_entries ws
      ON ws.symbol = ANY(sr.all_symbols)
      AND ws.user_id = auth.uid()
    WHERE sr.user_id = auth.uid()
  )
  SELECT
    h.symbol,
    h.screen_name,
    h.screen_short_code,
    h.screen_id,
    h.screen_color,
    COUNT(*) OVER (PARTITION BY h.symbol) AS heat_score
  FROM hits h
  ORDER BY heat_score DESC, h.symbol, h.screen_name;
$$;