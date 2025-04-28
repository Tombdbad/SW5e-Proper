import { pgTable, text, serial, integer, boolean, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Characters schema
export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  species: text("species").notNull(),
  class: text("class").notNull(),
  background: text("background").notNull(),
  alignment: text("alignment").notNull(),
  level: integer("level").notNull().default(1),
  abilityScores: json("ability_scores").notNull(),
  maxHp: integer("max_hp").notNull(),
  currentHp: integer("current_hp").notNull(),
  maxForcePoints: integer("max_force_points").notNull().default(0),
  currentForcePoints: integer("current_force_points").notNull().default(0),
  armorClass: integer("armor_class").notNull(),
  speed: integer("speed").notNull().default(30),
  equipment: json("equipment").notNull(),
  customItems: json("custom_items"),
  backstory: text("backstory"),
  startingLocation: text("starting_location").notNull(),
  notes: text("notes"),
  experience: integer("experience").notNull().default(0),
  skillProficiencies: json("skill_proficiencies").notNull(),
  savingThrowProficiencies: json("saving_throw_proficiencies").notNull(),
  credits: integer("credits").notNull().default(1000),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCharacterSchema = z.object({
  userId: z.number().optional(),
  name: z.string().min(2, { message: "Character name must be at least 2 characters." }),
  species: z.string().min(1, { message: "Please select a species." }),
  class: z.string().min(1, { message: "Please select a class." }),
  background: z.string().min(1, { message: "Please select a background." }),
  alignment: z.string().min(1, { message: "Please select an alignment." }),
  level: z.number().min(1).default(1),
  abilityScores: z.object({
    strength: z.number().min(3).max(20),
    dexterity: z.number().min(3).max(20),
    constitution: z.number().min(3).max(20),
    intelligence: z.number().min(3).max(20),
    wisdom: z.number().min(3).max(20),
    charisma: z.number().min(3).max(20),
  }),
  maxHp: z.number().min(1),
  currentHp: z.number().min(0),
  maxForcePoints: z.number().min(0),
  currentForcePoints: z.number().min(0),
  armorClass: z.number().min(1),
  speed: z.number().min(1),
  equipment: z.array(z.string()),
  customItems: z.array(z.any()).optional(),
  backstory: z.string().optional(),
  startingLocation: z.string().min(1),
  notes: z.string().optional(),
  experience: z.number().min(0).default(0),
  skillProficiencies: z.array(z.string()),
  savingThrowProficiencies: z.array(z.string()),
  credits: z.number().min(0).default(1000),
});

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof characters.$inferSelect;

// Campaign schema
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  characterId: integer("character_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  npcs: json("npcs").notNull(),
  locations: json("locations").notNull(),
  quests: json("quests").notNull(),
  startingLocation: text("starting_location").notNull(),
  currentLocation: text("current_location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = z.object({
  userId: z.number().optional(),
  characterId: z.number(),
  name: z.string().min(2),
  description: z.string(),
  npcs: z.array(z.object({
    id: z.string(),
    name: z.string(),
    species: z.string(),
    role: z.string(),
    description: z.string(),
    stats: z.any().optional(),
  })),
  locations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
    coordinates: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }).optional(),
    mapData: z.any().optional(),
  })),
  quests: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(["inactive", "active", "completed"]),
    objectives: z.array(z.object({
      description: z.string(),
      completed: z.boolean(),
    })),
    reward: z.object({
      credits: z.number(),
      items: z.array(z.string()),
      experience: z.number(),
    }).optional(),
  })),
  startingLocation: z.string(),
  currentLocation: z.string().optional(),
  notes: z.string().optional(),
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Debriefs schema for LLM communication
export const debriefs = pgTable("debriefs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  sessionId: text("session_id").notNull(),
  content: json("content").notNull(),
  response: json("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDebriefSchema = z.object({
  campaignId: z.number(),
  sessionId: z.string(),
  content: z.record(z.any()),
  response: z.record(z.any()).optional(),
});

export type InsertDebrief = z.infer<typeof insertDebriefSchema>;
export type Debrief = typeof debriefs.$inferSelect;
