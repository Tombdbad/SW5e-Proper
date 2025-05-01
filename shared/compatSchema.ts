// shared/compatSchema.ts
// This file provides compatibility between our Zod schemas and Drizzle ORM

import { pgTable, text, serial, integer, boolean, json, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { Schemas } from "./unifiedSchema";

// Re-export the tables from schema.ts
export { users, characters, campaigns, debriefs, characterStarWarsData, locations, npcs, items } from "./schema";

// Re-export the relations from schema.ts
export { characterRelations, locationRelations, campaignRelations } from "./schema";

// Define additional helper schemas for creating and updating records
export const characterHelpers = {
  // Simple utility for creating a character with defaults
  createCharacter: (data: z.infer<typeof Schemas.Character>) => {
    // Set default values and prepare for database insertion
    return {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  // Utility for updating a character
  updateCharacter: (existingCharacter: z.infer<typeof Schemas.Character>, updates: Partial<z.infer<typeof Schemas.Character>>) => {
    return {
      ...existingCharacter,
      ...updates,
      updatedAt: new Date(),
      version: (existingCharacter.version || 1) + 1,
    };
  },

  // Transform between database and application schemas
  fromDb: (dbCharacter: any): z.infer<typeof Schemas.Character> => {
    // Transform DB record to application schema
    return {
      ...dbCharacter,
      // Add any necessary transformations
    };
  },

  toDb: (character: z.infer<typeof Schemas.Character>): any => {
    // Transform application object to DB record
    return {
      ...character,
      // Remove any fields not in the DB schema
      syncStatus: undefined,
      // Transform any fields that need conversion
    };
  }
};

export const campaignHelpers = {
  // Simple utility for creating a campaign with defaults
  createCampaign: (data: z.infer<typeof Schemas.Campaign>) => {
    return {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  // Utility for updating a campaign
  updateCampaign: (existingCampaign: z.infer<typeof Schemas.Campaign>, updates: Partial<z.infer<typeof Schemas.Campaign>>) => {
    return {
      ...existingCampaign,
      ...updates,
      updatedAt: new Date(),
      version: (existingCampaign.version || 1) + 1,
    };
  },

  // Transform between database and application schemas
  fromDb: (dbCampaign: any): z.infer<typeof Schemas.Campaign> => {
    return {
      ...dbCampaign,
      // Add any necessary transformations
    };
  },

  toDb: (campaign: z.infer<typeof Schemas.Campaign>): any => {
    return {
      ...campaign,
      // Remove any fields not in the DB schema
      syncStatus: undefined,
      // Transform any fields that need conversion
    };
  }
};

// Export validators based on Drizzle schemas
export const validators = {
  character: Schemas.Character,
  campaign: Schemas.Campaign,
  combat: Schemas.Combat,
};

// Export types for usage throughout the application
export type Character = z.infer<typeof Schemas.Character>;
export type Campaign = z.infer<typeof Schemas.Campaign>;
export type CombatState = z.infer<typeof Schemas.Combat>;