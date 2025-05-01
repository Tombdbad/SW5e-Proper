
// server/db.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "../shared/schema";

// Ensure we have a valid DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

// Configure the Neon client
neonConfig.fetchConnectionCache = true;

// Create SQL client
export const sql = neon(DATABASE_URL);

// Create a database instance with proper schema reference
export const db = drizzle(sql, { schema });
