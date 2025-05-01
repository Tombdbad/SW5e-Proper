
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
