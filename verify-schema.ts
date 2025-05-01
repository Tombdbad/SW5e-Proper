
import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
  process.exit(1);
}

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

async function verifySchema() {
  try {
    console.log("🔍 Verifying database schema...");

    const subclassExists = await db.execute(sql`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'characters' AND column_name = 'subclass'
    `);

    const settingExists = await db.execute(sql`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'setting'
    `);

    const subclassStatus = subclassExists.length > 0 ? "Exists" : "Missing";
    const settingStatus = settingExists.length > 0 ? "Exists" : "Missing";

    console.log(`Subclass column: ${subclassStatus}`);
    console.log(`Setting column: ${settingStatus}`);

    const success = subclassExists.length > 0 && settingExists.length > 0;
    console.log(success ? "✅ Schema is up to date!" : "❌ Schema validation failed!");

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("Error verifying schema:", error);
    process.exit(1);
  }
}

verifySchema();
