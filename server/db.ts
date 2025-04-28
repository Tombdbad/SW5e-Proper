// server/db.ts
import { drizzle } from "drizzle-orm/neon-http"; // <-- not neon-serverless
import { neon } from "@neondatabase/serverless"; // still use this
import * as schema from "../shared/compatSchema";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
