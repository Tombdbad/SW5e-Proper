
-- Add missing 'subclass' column to characters table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'characters' AND column_name = 'subclass'
    ) THEN
        ALTER TABLE characters ADD COLUMN subclass text;
        RAISE NOTICE 'Added subclass column to characters table';
    ELSE
        RAISE NOTICE 'subclass column already exists in characters table';
    END IF;
END $$;

-- Add missing 'setting' column to campaigns table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'campaigns' AND column_name = 'setting'
    ) THEN
        ALTER TABLE campaigns ADD COLUMN setting jsonb DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added setting column to campaigns table';
    ELSE
        RAISE NOTICE 'setting column already exists in campaigns table';
    END IF;
END $$;

-- Fix setting column type if needed
DO $$
BEGIN
    ALTER TABLE IF EXISTS campaigns 
    ALTER COLUMN setting TYPE jsonb USING 
        CASE 
            WHEN setting IS NULL THEN '{}'::jsonb
            WHEN pg_typeof(setting) = 'text'::regtype THEN setting::jsonb
            ELSE setting
        END;
    RAISE NOTICE 'Ensured setting column is jsonb type';
END $$;
