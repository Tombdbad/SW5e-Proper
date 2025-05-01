
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to database
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
  process.exit(1);
}

const sql_client = neon(DATABASE_URL);
const db = drizzle(sql_client);

async function runMigration(path: string): Promise<void> {
  try {
    console.log(`Running migration: ${path}`);
    const sqlContent = fs.readFileSync(path, 'utf8');
    await db.execute(sql`${sqlContent}`);
    console.log(`✅ Migration ${path} completed successfully!`);
    return Promise.resolve();
  } catch (error) {
    console.error(`❌ Error running migration ${path}:`, error);
    return Promise.reject(error);
  }
}

async function runMigrations() {
  console.log("🚀 Starting database migration process...");

  try {
    await runMigration('./migrations/0004_fix_missing_columns.sql');
    await runMigration('./migrations/0005_add_proficiency_and_player_chars.sql');
    console.log("✨ All migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration process failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigrations();
