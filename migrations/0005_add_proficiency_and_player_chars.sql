
-- Add missing 'proficiency_bonus' column to characters table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'characters' AND column_name = 'proficiency_bonus'
    ) THEN
        ALTER TABLE characters ADD COLUMN proficiency_bonus integer;
        RAISE NOTICE 'Added proficiency_bonus column to characters table';
    ELSE
        RAISE NOTICE 'proficiency_bonus column already exists in characters table';
    END IF;
END $$;

-- Add missing 'player_characters' column to campaigns table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campaigns' AND column_name = 'player_characters'
    ) THEN
        ALTER TABLE campaigns ADD COLUMN player_characters jsonb DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added player_characters column to campaigns table';
    ELSE
        RAISE NOTICE 'player_characters column already exists in campaigns table';
    END IF;
END $$;

-- Fix player_characters column type if needed
DO $$
BEGIN
    ALTER TABLE IF EXISTS campaigns 
    ALTER COLUMN player_characters TYPE jsonb USING 
        CASE 
            WHEN player_characters IS NULL THEN '[]'::jsonb
            WHEN pg_typeof(player_characters) = 'text'::regtype THEN player_characters::jsonb
            ELSE player_characters
        END;
    RAISE NOTICE 'Ensured player_characters column is jsonb type';
END $$;
