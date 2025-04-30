
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

// Database configuration
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/sw5e";

// Initialize Postgres client
const migrationClient = postgres(databaseUrl, { max: 1 });

// Apply migrations
async function main() {
  try {
    console.log("Starting database migrations...");
    
    const db = drizzle(migrationClient);
    
    // Run migrations
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "migrations") });
    
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    // Close connection
    await migrationClient.end();
  }
}

main();
