import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  species,
  classes,
  backgrounds,
  powers,
  equipment,
} from "@shared/compatSchema";

export async function getAllSpecies() {
  return db.select().from(species);
}

export async function getAllClasses() {
  return db.select().from(classes);
}

export async function getAllBackgrounds() {
  return db.select().from(backgrounds);
}

export async function getPowersByType(type: string) {
  return db.select().from(powers).where(eq(powers.type, type));
}

export async function getAllEquipment() {
  return db.select().from(equipment);
}
