
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import fs from 'fs';

// Connect to database
const sql_client = neon(process.env.DATABASE_URL!);
const db = drizzle(sql_client);

async function runMigrations() {
  console.log("Running migrations...");

  try {
    // Read and execute 0002_add_missing_columns.sql
    console.log("Running migration: 0002_add_missing_columns.sql");
    const sql1 = fs.readFileSync('./migrations/0002_add_missing_columns.sql', 'utf8');
    await db.execute(sql`${sql1}`);

    // Read and execute 0003_align_column_types.sql
    console.log("Running migration: 0003_align_column_types.sql");
    const sql2 = fs.readFileSync('./migrations/0003_align_column_types.sql', 'utf8');
    await db.execute(sql`${sql2}`);

    // Read and execute 0004_fix_missing_columns.sql
    console.log("Running migration: 0004_fix_missing_columns.sql");
    const sql3 = fs.readFileSync('./migrations/0004_fix_missing_columns.sql', 'utf8');
    await db.execute(sql`${sql3}`);

    // Read and execute 0005_add_proficiency_and_player_chars.sql
    console.log("Running migration: 0005_add_proficiency_and_player_chars.sql");
    const sql4 = fs.readFileSync('./migrations/0005_add_proficiency_and_player_chars.sql', 'utf8');
    await db.execute(sql`${sql4}`);

    console.log("Migrations completed successfully!");
  } catch (error) {
    console.error("Error running migrations:", error);
  } finally {
    process.exit(0);
  }
}

runMigrations();
