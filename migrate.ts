import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import * as schema from './shared/schema';

// Database migration script
async function runMigration() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for migration');
  }

  console.log('Starting database migration...');
  
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  // Run migrations
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  
  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});