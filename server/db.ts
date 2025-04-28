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
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { characters, locations, campaigns } from '../shared/schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

// Character queries
export const createCharacter = async (data: any) => {
  return db.insert(characters).values(data).returning();
};

export const getCharacter = async (id: number) => {
  return db.select().from(characters).where(eq(characters.id, id));
};

export const updateCharacter = async (id: number, data: any) => {
  return db.update(characters).set(data).where(eq(characters.id, id)).returning();
};

// Campaign queries
export const createCampaign = async (data: any) => {
  return db.insert(campaigns).values(data).returning();
};

export const getCampaign = async (id: number) => {
  return db.select().from(campaigns).where(eq(campaigns.id, id));
};

export const updateCampaign = async (id: number, data: any) => {
  return db.update(campaigns).set(data).where(eq(campaigns.id, id)).returning();
};
