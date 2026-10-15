import { pgTable, text, serial, integer, boolean, json, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { Coordinates } from "./coordinates";

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

// Characters schema - Enhanced with SW5E specifics
export const characters = pgTable("characters", {
  // Identity & Meta
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  // Basic Character Info
  name: text("name").notNull(),
  species: text("species").notNull(),
  class: text("class").notNull(),
  subclass: text("subclass"), // Already correctly defined as text
  level: integer("level").notNull().default(1),
  background: text("background").notNull(),
  alignment: text("alignment").notNull(),
  
  // Core Stats
  abilityScores: json("ability_scores").notNull(), // { strength, dexterity, constitution, intelligence, wisdom, charisma }
  proficiencyBonus: integer("proficiency_bonus").notNull().default(2),
  
  // Health & Defense
  maxHp: integer("max_hp").notNull(),
  currentHp: integer("current_hp").notNull(),
  temporaryHp: integer("temporary_hp").notNull().default(0),
  // Hit Dice spent on short rests; half the total come back on a long rest
  hitDiceUsed: integer("hit_dice_used").notNull().default(0),
  armorClass: integer("armor_class").notNull(),
  
  // Force Powers
  maxForcePoints: integer("max_force_points").notNull().default(0),
  currentForcePoints: integer("current_force_points").notNull().default(0),
  forcePowers: json("force_powers"), // [{ name, level, description, castingTime, range, duration, usesRemaining, maxUses }]
  techPowers: json("tech_powers"), // Similar structure to forcePowers
  
  // Movement & Combat
  speed: integer("speed").notNull().default(30),
  initiative: integer("initiative"),
  
  // Proficiencies
  savingThrowProficiencies: json("saving_throw_proficiencies").notNull(), // Array of ability names
  skillProficiencies: json("skill_proficiencies").notNull(), // { skillName: proficiencyLevel (0=none, 1=proficient, 2=expertise) }
  toolProficiencies: json("tool_proficiencies"), // Array of tool names
  weaponProficiencies: json("weapon_proficiencies"), // Array of weapon types
  armorProficiencies: json("armor_proficiencies"), // Array of armor types
  languages: json("languages"), // Array of known languages
  
  // Equipment & Inventory
  credits: integer("credits").notNull().default(1000),
  equipment: json("equipment").notNull(), // Array of standard equipment items
  weapons: json("weapons"), // [{ name, damage, damageType, properties, equipped, proficient }]
  armor: json("armor"), // What is equipped once the player has chosen: { weapons: names, body: name | null, shield: name | null }; absent: everything carried is in use
  customItems: json("custom_items"), // For homebrew/custom items
  encumbrance: integer("encumbrance").default(0),
  carryingCapacity: integer("carrying_capacity"),
  
  // Character Development
  personalityTraits: json("personality_traits"), // Array of traits
  ideals: json("ideals"), // Array of ideals
  bonds: json("bonds"), // Array of bonds
  flaws: json("flaws"), // Array of flaws
  backstory: text("backstory"),
  // How the character looks: { gender, age, height, weight, description }
  appearance: json("appearance"),
  notes: text("notes"),
  
  // Campaign Information
  campaignId: integer("campaign_id"),
  experience: integer("experience").notNull().default(0),
  startingLocation: text("starting_location").notNull(),
  currentLocation: text("current_location"),
  factionReputations: json("faction_reputations"), // { factionName: reputationValue }
  
  // SW5E-specific
  forceAlignment: text("force_alignment"), // Light, Dark, Universal, etc.
  deployments: json("deployments"), // For soldier class
  modifications: json("modifications"), // For engineer class
  companionData: json("companion_data"), // The companions that go with the character (shared/logic Companion[])
  // What the character is in the middle of: kit charges, a tool's boon until the next rest, a
  // substance's high or low and the level of addiction (see "Gear" in REVIVAL_NOTES.md)
  playState: json("play_state"),
  
  // Conditions & Status Effects
  conditions: json("conditions"), // Array of current conditions
  exhaustionLevel: integer("exhaustion_level").default(0),
  
  // Customization Options
  feats: json("feats"), // Array of feat names or objects
  fighterManeuvers: json("fighter_maneuvers"), // For fighter class
  scholarFormulae: json("scholar_formulae"), // For scholar class
});

export const insertCharacterSchema = z.object({
  userId: z.number().optional(),
  name: z.string().min(2, { message: "Character name must be at least 2 characters." }),
  species: z.string().min(1, { message: "Please select a species." }),
  class: z.string().min(1, { message: "Please select a class." }),
  subclass: z.string().optional(),
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
  proficiencyBonus: z.number().min(2).default(2),
  maxHp: z.number().min(1),
  currentHp: z.number().min(0),
  temporaryHp: z.number().min(0).default(0),
  hitDiceUsed: z.number().min(0).optional(),
  conditions: z.array(z.string()).optional(),
  maxForcePoints: z.number().min(0),
  currentForcePoints: z.number().min(0),
  armorClass: z.number().min(1),
  speed: z.number().min(1),
  equipment: z.array(z.string()),
  weapons: z.array(z.any()).optional(),
  armor: z.any().optional(),
  customItems: z.array(z.any()).optional(),
  backstory: z.string().optional(),
  appearance: z.object({
    gender: z.string().optional(),
    age: z.number().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  startingLocation: z.string().min(1),
  currentLocation: z.string().optional(),
  notes: z.string().optional(),
  experience: z.number().min(0).default(0),
  skillProficiencies: z.array(z.string()),
  savingThrowProficiencies: z.array(z.string()),
  credits: z.number().min(0).default(1000),
  campaignId: z.number().optional(),
  forceAlignment: z.string().optional(),
  languages: z.array(z.string()).optional(),
  forcePowers: z.array(z.any()).optional(),
  techPowers: z.array(z.any()).optional(),
  feats: z.array(z.any()).optional(),
  toolProficiencies: z.array(z.string()).optional(),
  companionData: z.any().optional(),
  playState: z.any().optional(),
  // Fighting styles and maneuvers chosen: { styles: string[], maneuvers: string[] }
  fighterManeuvers: z.any().optional(),
  personalityTraits: z.array(z.string()).optional(),
  ideals: z.array(z.string()).optional(),
  bonds: z.array(z.string()).optional(),
  flaws: z.array(z.string()).optional(),
});

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof characters.$inferSelect;

// Character Star Wars specific data
export const characterStarWarsData = pgTable('character_star_wars_data', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  species: text('species'),
  homeworld: text('homeworld'),
  affiliation: text('affiliation'), // Rebellion, Empire, etc.
  forceUser: boolean('force_user').default(false),
  forcePowers: jsonb('force_powers').$type<string[]>(),
  customData: jsonb('custom_data'),
});

// Campaign schema - Enhanced with SW5E specifics
export const campaigns = pgTable("campaigns", {
  // Identity & Meta
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  // Basic Campaign Info
  name: text("name").notNull(),
  description: text("description").notNull(),
  setting: json("setting").notNull(), // { era, backstory, themes, tone }
  
  // Characters & Players
  characterId: integer("character_id"), // Main character
  playerCharacters: json("player_characters"), // [ { characterId, playerId, active } ]
  
  // Campaign Structure
  objectives: json("objectives"), // [ { title, description, status, completionCriteria, rewards } ]
  quests: json("quests").notNull(), // [ { title, description, status, location, npcGiver, rewards, linkedObjectives, deadline } ]
  arcs: json("arcs"), // [ { title, description, quests, status } ] - For story arc tracking
  factions: json("factions"), // [ { name, description, disposition, members, territories, goals } ]
  
  // World Elements
  npcs: json("npcs").notNull(), // [ { name, species, role, location, disposition, notes, stats } ]
  locations: json("locations").notNull(), // [ { name, description, type, coordinates, connections, pointsOfInterest } ]
  planets: json("planets"), // [ { name, description, climate, terrain, controllingFaction, knownLocations } ]
  
  // Navigation & Current State
  startingLocation: text("starting_location").notNull(),
  currentLocation: text("current_location"),
  galaxyMap: json("galaxy_map"), // { knownLocations, exploredSectors, currentPosition }
  
  // Time & Progress Tracking
  timeElapsed: json("time_elapsed"), // { days, hours, minutes }
  inGameCalendar: json("in_game_calendar"), // For tracking in-game dates and events
  currentGameState: json("current_game_state"), // { inCombat, currentInitiative: [ { entity, initiative, isPlayer } ] }
  
  // Session Management
  sessionLogs: json("session_logs"), // [ { date, summary, participants, locations, keyEvents, decisions } ]
  upcomingSessionNotes: json("upcoming_session_notes"), // Planning for the next session
  
  // Miscellaneous
  notes: text("notes"),
  secrets: json("secrets"), // DM-only information
  encounters: json("encounters"), // [ { title, description, location, enemies, difficulty, rewards, triggered } ]
  treasures: json("treasures"), // [ { type, description, value, location, found } ]
  
  // LLM Integration
  llmContext: json("llm_context"), // { lastContextSummary, keySummaryPoints, lastUpdated }
  aiDirection: json("ai_direction"), // Overall direction for the AI to follow for this campaign
  
  // SW5E Specific
  forcePresence: json("force_presence"), // { lightSideInfluence, darkSideInfluence, significantForceEvents }
  starships: json("starships"), // [ { name, class, stats, crew, location, status } ]
  vehicles: json("vehicles"), // Speeders the party owns: [ { id, name, model, mph, areaId, status, ... } ]
  techLevel: json("tech_level"), // Technology level and availability
  factionInfluence: json("faction_influence"), // [ { factionId, influence, territory } ]
  planetaryConditions: json("planetary_conditions"), // Environmental and atmospheric conditions
  availableResources: json("available_resources"), // Resources and trade goods
  specialRules: json("special_rules"), // House rules or campaign-specific mechanics
});

export const insertCampaignSchema = z.object({
  userId: z.number().optional(),
  characterId: z.number(),
  name: z.string().min(2),
  description: z.string(),
  setting: z.object({
    era: z.string(),
    backstory: z.string(),
    themes: z.array(z.string()),
    tone: z.string(),
  }).optional().default({
    era: "Galactic Civil War",
    backstory: "A time of conflict between the Rebel Alliance and the Galactic Empire",
    themes: ["Rebellion", "Hope", "Struggle"],
    tone: "Space Opera",
  }),
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
    coordinates: z.any().optional(),
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
      // What in the generated world completes it: { kind: "defeat" | "loot" | "reach", areaId }
      target: z.any().optional(),
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
  // The generated world (shared/logic World): areas, the paths between them, and what is in them
  galaxyMap: z.any().optional(),
  // The story told through the GM tab: [ { date, location, action, narrative, applied } ]
  sessionLogs: z.any().optional(),
  // Ships the party owns (shared/logic Ship)
  starships: z.any().optional(),
  // Speeders the party owns and where they are parked (shared/logic PartyVehicle)
  vehicles: z.any().optional(),
  // The campaign clock: { total } minutes of Galactic Standard Time (shared/logic, "Time")
  timeElapsed: z.any().optional(),
  // Renown with factions and dealings with traders (shared/logic, "Trade")
  factionInfluence: z.any().optional(),
  // What the party has bought from and sold to each trader, by day (shared/logic, "Trade")
  availableResources: z.any().optional(),
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Locations table with hierarchical coordinates
export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  coordinateString: text('coordinate_string').notNull(),
  coordinateData: jsonb('coordinate_data').$type<Coordinates>(),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// NPCs table
export const npcs = pgTable('npcs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  species: text('species'),
  description: text('description'),
  locationId: integer('location_id').references(() => locations.id),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Items table
export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type'), // weapon, tool, artifact, etc.
  ownerId: integer('owner_id').references(() => characters.id),
  locationId: integer('location_id').references(() => locations.id),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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

// Relations
export const characterRelations = relations(characters, ({ one, many }) => ({
  user: one(users, {
    fields: [characters.userId],
    references: [users.id],
  }),
  campaign: one(campaigns, {
    fields: [characters.campaignId],
    references: [campaigns.id],
  }),
  starWarsData: one(characterStarWarsData, {
    fields: [characters.id],
    references: [characterStarWarsData.characterId],
  }),
  items: many(items, { relationName: "characterItems" }),
}));

export const locationRelations = relations(locations, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [locations.campaignId],
    references: [campaigns.id],
  }),
  npcs: many(npcs),
  items: many(items),
}));

export const campaignRelations = relations(campaigns, ({ many, one }) => ({
  mainCharacter: one(characters, {
    fields: [campaigns.characterId],
    references: [characters.id],
  }),
  characters: many(characters),
  locations: many(locations),
  npcs: many(npcs),
  items: many(items),
}));
