
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Function to run schema verification
async function verifySchema(): Promise<boolean> {
  try {
    console.log('Running schema verification...');
    execSync('tsx verify-schema.ts', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Schema verification failed:', error);
    return false;
  }
}

// Function to run migrations
async function runMigrations(): Promise<boolean> {
  try {
    console.log('Running migrations...');
    execSync('tsx run-migrations.ts', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

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

// Main function to orchestrate the migration process
async function migrateWithVerification() {
  console.log('🚀 Starting migration process with verification');

  // Step 1: Pre-migration schema verification
  console.log('\n📋 Step 1: Pre-migration schema verification');
  const preVerification = await verifySchema();

  if (!preVerification) {
    console.log('⚠️ Pre-migration schema verification has issues, but continuing with caution');
  }

  // Step 2: Database backup
  console.log('\n📋 Step 2: Creating database backup');
  const backupSuccess = await backupDatabase();

  if (!backupSuccess) {
    console.error('❌ Failed to create database backup. Aborting migration for safety.');
    process.exit(1);
  }

  // Step 3: Run migrations
  console.log('\n📋 Step 3: Running migrations');
  const migrationSuccess = await runMigrations();

  if (!migrationSuccess) {
    console.error('❌ Migration failed. Check migration logs for details.');
    console.log('⚠️ Consider restoring from backup if necessary.');
    process.exit(1);
  }

  // Step 4: Post-migration schema verification
  console.log('\n📋 Step 4: Post-migration schema verification');
  const postVerification = await verifySchema();

  if (!postVerification) {
    console.error('❌ Post-migration schema verification failed.');
    console.log('⚠️ Database might be in an inconsistent state. Consider restoring from backup.');
    process.exit(1);
  }

  console.log('\n✅ Migration completed successfully with schema verification!');
}

// Run the full migration process
migrateWithVerification();
import { db } from '../../server/db';
import { characters, species, equipment } from '../../shared/schema';
import { eq } from 'drizzle-orm';

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

export default verifyMigration;
