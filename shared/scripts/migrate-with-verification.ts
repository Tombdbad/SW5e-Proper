import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { schema } from '../unifiedSchema';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { db } from '../../server/db';
import { characters, species, equipment } from '../../shared/schema';
import { eq } from 'drizzle-orm';


// Function to backup the database (simplified - in production would use pg_dump)
async function backupDatabase(): Promise<boolean> {
  try {
    console.log('Creating database backup (simulation)...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'db-backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // In a real implementation, this would execute pg_dump
    // For now, we just create a marker file
    fs.writeFileSync(
      path.join(backupDir, `backup-${timestamp}.txt`),
      `Database backup simulation created at ${timestamp}`
    );

    console.log(`Backup simulation saved to db-backups/backup-${timestamp}.txt`);
    return true;
  } catch (error) {
    console.error('Backup failed:', error);
    return false;
  }
}

const runMigrationWithVerification = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  console.log('Starting migration...');

  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migration completed successfully');

    // Verify critical tables
    const tables = ['characters', 'campaigns', 'equipment', 'combat_logs'];
    for (const table of tables) {
      const result = await sql`SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = ${table}
      );`;
      console.log(`Table ${table} exists: ${result[0].exists}`);
    }

    // Verify column types
    const characterColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'characters';
    `;
    console.log('Character table schema:', characterColumns);

  } catch (error) {
    console.error('Migration verification failed:', error);
    process.exit(1);
  }
};

async function verifyMigration() {
  console.log('Starting migration verification...');

  // Verify character data
  const characterResults = await db.select().from(characters);
  console.log(`Verifying ${characterResults.length} characters...`);

  for (const char of characterResults) {
    if (!char.name || !char.species || !char.class) {
      console.error(`Invalid character data found: ${char.id}`);
      throw new Error('Character validation failed');
    }
  }

  // Verify species data
  const speciesResults = await db.select().from(species);
  console.log(`Verifying ${speciesResults.length} species...`);

  for (const sp of speciesResults) {
    if (!sp.name || !sp.traits || !sp.abilityScoreIncrease) {
      console.error(`Invalid species data found: ${sp.id}`);
      throw new Error('Species validation failed');
    }
  }

  // Verify equipment data
  const equipmentResults = await db.select().from(equipment);
  console.log(`Verifying ${equipmentResults.length} equipment items...`);

  for (const eq of equipmentResults) {
    if (!eq.name || !eq.type || !eq.cost) {
      console.error(`Invalid equipment data found: ${eq.id}`);
      throw new Error('Equipment validation failed');
    }
  }

  console.log('Migration verification completed successfully');
}


runMigrationWithVerification().catch(console.error);
export default verifyMigration;