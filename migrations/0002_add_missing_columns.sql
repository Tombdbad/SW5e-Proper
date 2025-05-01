
-- Add missing 'subclass' column to characters table
ALTER TABLE "characters" ADD COLUMN "subclass" text;

-- Add missing 'setting' column to campaigns table
ALTER TABLE "campaigns" ADD COLUMN "setting" text;
