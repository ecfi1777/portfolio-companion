ALTER TABLE positions 
  ALTER COLUMN category TYPE varchar(50) USING category::text;
DROP TYPE IF EXISTS position_category;