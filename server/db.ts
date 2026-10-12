import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../shared/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (put it in .env)");
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema });

// The app has no login yet: every character and campaign belongs to user 1.
export async function ensureDefaultUser() {
  await db
    .insert(schema.users)
    .values({ id: 1, username: "player", password: "!" })
    .onConflictDoNothing();
  await db.execute(
    sql`select setval(pg_get_serial_sequence('users','id'), greatest(1,(select max(id) from users)))`,
  );
}
