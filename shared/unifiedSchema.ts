
import { z } from 'zod';

// Basic schemas for reusable components
export const AbilityScoresSchema = z.object({
  strength: z.number().min(3).max(20),
  dexterity: z.number().min(3).max(20),
  constitution: z.number().min(3).max(20),
  intelligence: z.number().min(3).max(20),
  wisdom: z.number().min(3).max(20),
  charisma: z.number().min(3).max(20),
});

export const ForcePowerSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  description: z.string(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  duration: z.string().optional(),
  usesRemaining: z.number().optional(),
  maxUses: z.number().optional(),
});

export const TechPowerSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  description: z.string(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  duration: z.string().optional(),
  usesRemaining: z.number().optional(),
  maxUses: z.number().optional(),
});

export const WeaponSchema = z.object({
  name: z.string(),
  damage: z.string(),
  damageType: z.string(),
  properties: z.array(z.string()),
  equipped: z.boolean().default(false),
  proficient: z.boolean().default(true),
});

export const ArmorSchema = z.object({
  name: z.string(),
  type: z.string(),
  armorClass: z.number(),
  equipped: z.boolean().default(false),
});

export const MulticlassSchema = z.object({
  class: z.string(),
  level: z.number().min(1).max(19),
  archetype: z.string().optional(),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).optional().default([]),
});

// Character schema
export const CharacterSchema = z.object({
  id: z.string().optional(),
  userId: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  class: z.string().min(1, "Class is required"),
  subclass: z.string().optional(),
  level: z.number().min(1).max(20).default(1),
  background: z.string().min(1, "Background is required"),
  alignment: z.string().min(1, "Alignment is required"),
  abilityScores: AbilityScoresSchema,
  maxHp: z.number().min(1),
  currentHp: z.number().min(0),
  temporaryHp: z.number().min(0).default(0),
  armorClass: z.number().min(1),
  speed: z.number().min(1),
  skillProficiencies: z.array(z.string()),
  savingThrowProficiencies: z.array(z.string()),
  equipment: z.array(z.string()),
  weapons: z.array(WeaponSchema).optional(),
  armor: ArmorSchema.optional(),
  credits: z.number().min(0).default(1000),
  backstory: z.string().optional(),
  notes: z.string().optional(),
  startingLocation: z.string().min(1),
  currentLocation: z.string().optional(),
  experience: z.number().min(0).default(0),
  multiclass: z.array(MulticlassSchema).optional().default([]),
  forcePowers: z.array(ForcePowerSchema).optional().default([]),
  techPowers: z.array(TechPowerSchema).optional().default([]),
  feats: z.array(z.string()).optional().default([]),
  languages: z.array(z.string()).optional().default([]),
  forceAlignment: z.string().optional(),
  maxForcePoints: z.number().min(0).default(0),
  currentForcePoints: z.number().min(0).default(0),
  proficiencyBonus: z.number().min(2).default(2),
  initiative: z.number().optional(),
  version: z.number().default(1),
  lastUpdated: z.string().optional(),
  syncStatus: z.enum(["synced", "local", "conflict"]).default("local"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Helper for inserting characters into the database
export const insertCharacterSchema = CharacterSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  lastUpdated: true,
  syncStatus: true,
}).partial();

// Location schema
export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
  }).optional(),
  mapData: z.any().optional(),
});

// NPC schema
export const NPCSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  role: z.string(),
  description: z.string(),
  stats: z.any().optional(),
});

// Quest objective schema
export const QuestObjectiveSchema = z.object({
  description: z.string(),
  completed: z.boolean(),
});

// Quest schema
export const QuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["inactive", "active", "completed"]),
  objectives: z.array(QuestObjectiveSchema),
  reward: z.object({
    credits: z.number(),
    items: z.array(z.string()),
    experience: z.number(),
  }).optional(),
});

// Setting schema
export const SettingSchema = z.object({
  era: z.string(),
  backstory: z.string(),
  themes: z.array(z.string()),
  tone: z.string(),
});

// Campaign schema
export const CampaignSchema = z.object({
  id: z.string().optional(),
  userId: z.number().optional(),
  characterId: z.string(),
  name: z.string().min(2),
  description: z.string(),
  setting: SettingSchema.optional().default({
    era: "Galactic Civil War",
    backstory: "A time of conflict between the Rebel Alliance and the Galactic Empire",
    themes: ["Rebellion", "Hope", "Struggle"],
    tone: "Space Opera",
  }),
  npcs: z.array(NPCSchema),
  locations: z.array(LocationSchema),
  quests: z.array(QuestSchema),
  startingLocation: z.string(),
  currentLocation: z.string().optional(),
  notes: z.string().optional(),
  version: z.number().default(1),
  lastUpdated: z.string().optional(),
  syncStatus: z.enum(["synced", "local", "conflict"]).default("local"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Helper for inserting campaigns into the database
export const insertCampaignSchema = CampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  lastUpdated: true,
  syncStatus: true,
}).partial();

// Combat entity schema
export const CombatEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  initiative: z.number(),
  hp: z.number(),
  maxHp: z.number(),
  temporaryHp: z.number().default(0),
  armorClass: z.number(),
  conditions: z.array(z.string()).default([]),
  isCharacter: z.boolean().default(false),
  isAlly: z.boolean().default(false),
});

// Combat state schema
export const CombatStateSchema = z.object({
  active: z.boolean().default(false),
  round: z.number().default(1),
  currentTurn: z.number().default(0),
  entities: z.array(CombatEntitySchema).default([]),
  log: z.array(z.string()).default([]),
});

// Export all schemas
export const Schemas = {
  Character: CharacterSchema,
  Campaign: CampaignSchema,
  Combat: CombatStateSchema,
  AbilityScores: AbilityScoresSchema,
  ForcePower: ForcePowerSchema,
  TechPower: TechPowerSchema,
  Weapon: WeaponSchema,
  Armor: ArmorSchema,
  Multiclass: MulticlassSchema,
  Location: LocationSchema,
  NPC: NPCSchema,
  QuestObjective: QuestObjectiveSchema,
  Quest: QuestSchema,
  Setting: SettingSchema,
  CombatEntity: CombatEntitySchema,
};

// Export types for usage throughout the application
export type Character = z.infer<typeof CharacterSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type AbilityScores = z.infer<typeof AbilityScoresSchema>;
export type ForcePower = z.infer<typeof ForcePowerSchema>;
export type TechPower = z.infer<typeof TechPowerSchema>;
export type Weapon = z.infer<typeof WeaponSchema>;
export type Armor = z.infer<typeof ArmorSchema>;
export type Multiclass = z.infer<typeof MulticlassSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type NPC = z.infer<typeof NPCSchema>;
export type Quest = z.infer<typeof QuestSchema>;
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;
export type Setting = z.infer<typeof SettingSchema>;
export type CombatState = z.infer<typeof CombatStateSchema>;
export type CombatEntity = z.infer<typeof CombatEntitySchema>;
export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
