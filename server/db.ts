import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "../shared/schema";

// Check for environment variable
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Configure the SQL client with Neon
const sql = neon(process.env.DATABASE_URL);

// Create the database instance with Drizzle
export const db = drizzle(sql, { schema });
