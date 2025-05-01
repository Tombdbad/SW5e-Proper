
-- Ensure subclass column in characters table is text type
ALTER TABLE IF EXISTS characters 
ALTER COLUMN subclass TYPE text;

-- Ensure setting column in campaigns table is json type
ALTER TABLE IF EXISTS campaigns 
ALTER COLUMN setting TYPE jsonb USING setting::jsonb;
