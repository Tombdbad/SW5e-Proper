/**
 * Canonical SW5e rules data, shared by client and server.
 *
 * shared/data/sw5e/*.json is generated from the sw5e.com API by shared/scripts/import-sw5e.ts
 * (npm run import:sw5e) and covers the core books and the expanded content. Do not edit those
 * files and do not define rules content anywhere else: client/src/lib/sw5e/*.ts are views over
 * this data, and the world generator in shared/logic reads it through the catalog below.
 */
import manifest from "./sw5e/manifest.json";

export const sw5eManifest = manifest;

// One loader per dataset: a separate chunk each in the client bundle, read on demand on the server
export const datasets = {
  species: () => import("./sw5e/species.json"),
  classes: () => import("./sw5e/classes.json"),
  archetypes: () => import("./sw5e/archetypes.json"),
  backgrounds: () => import("./sw5e/backgrounds.json"),
  feats: () => import("./sw5e/feats.json"),
  powers: () => import("./sw5e/powers.json"),
  equipment: () => import("./sw5e/equipment.json"),
  enhancedItems: () => import("./sw5e/enhancedItems.json"),
  monsters: () => import("./sw5e/monsters.json"),
  maneuvers: () => import("./sw5e/maneuvers.json"),
  fightingStyles: () => import("./sw5e/fightingStyles.json"),
  fightingMasteries: () => import("./sw5e/fightingMasteries.json"),
  lightsaberForms: () => import("./sw5e/lightsaberForms.json"),
  classImprovements: () => import("./sw5e/classImprovements.json"),
  multiclassImprovements: () => import("./sw5e/multiclassImprovements.json"),
  splashclassImprovements: () => import("./sw5e/splashclassImprovements.json"),
  weaponFocuses: () => import("./sw5e/weaponFocuses.json"),
  weaponSupremacies: () => import("./sw5e/weaponSupremacies.json"),
  weaponProperties: () => import("./sw5e/weaponProperties.json"),
  armorProperties: () => import("./sw5e/armorProperties.json"),
  skills: () => import("./sw5e/skills.json"),
  conditions: () => import("./sw5e/conditions.json"),
  characterAdvancement: () => import("./sw5e/characterAdvancement.json"),
  referenceTables: () => import("./sw5e/referenceTables.json"),
  starshipSizes: () => import("./sw5e/starshipSizes.json"),
  starshipDeployments: () => import("./sw5e/starshipDeployments.json"),
  starshipEquipment: () => import("./sw5e/starshipEquipment.json"),
  starshipModifications: () => import("./sw5e/starshipModifications.json"),
  starshipVentures: () => import("./sw5e/starshipVentures.json"),
  rulesPlayersHandbook: () => import("./sw5e/rulesPlayersHandbook.json"),
  rulesStarships: () => import("./sw5e/rulesStarships.json"),
  rulesWretchedHives: () => import("./sw5e/rulesWretchedHives.json"),
  rulesVariant: () => import("./sw5e/rulesVariant.json"),
  rulesExpandedContent: () => import("./sw5e/rulesExpandedContent.json"),
  travel: () => import("./sw5e/travel.json"),
  transport: () => import("./sw5e/transport.json"),
  tools: () => import("./sw5e/tools.json"),
  lookups: () => import("./sw5e/lookups.json"),
} as const;

export type DatasetName = keyof typeof datasets;

export const datasetNames = Object.keys(datasets) as DatasetName[];

export async function loadDataset<T = any>(name: DatasetName): Promise<T> {
  const module: any = await datasets[name]();
  return (module.default ?? module) as T;
}

// Records as the importer writes them. Only the fields code relies on are typed.
export interface Sw5eRecord {
  id: string;
  name: string;
  contentType?: string;
  contentSource?: string; // PHB, SnV, SotG, WH or EC (expanded content)
  [key: string]: any;
}

export interface Sw5eMonster extends Sw5eRecord {
  size: string;
  types: string[];
  alignment: string;
  armorClass: number;
  armorType?: string;
  hitPoints: number;
  hitPointRoll?: string;
  speed: number;
  speeds?: string;
  challengeRating: string;
  experiencePoints: number;
  behaviors?: {
    name: string;
    monsterBehaviorType: string; // Trait, Action, Reaction, Legendary
    description?: string;
    attackType?: string; // MeleeWeapon, RangedWeapon, None
    attackBonus?: number;
    range?: string; // "range 100/400 ft.", "reach 5 ft."
    damageRoll?: string;
    damageType?: string;
  }[];
}

export interface Sw5eEquipment extends Sw5eRecord {
  cost: number;
  weight?: string;
  equipmentCategory: string;
  weaponClassification?: string;
  armorClassification?: string;
  damageNumberOfDice?: number;
  damageDieType?: number;
  damageType?: string;
  ac?: string;
  properties?: string[];
}

export interface Sw5eEnhancedItem extends Sw5eRecord {
  type: string;
  searchableRarity: string; // Standard, Premium, Prototype, Advanced, Legendary, Artifact
  subtype?: string;
  text?: string;
}

export interface Sw5eTravel {
  regions: string[];
  hyperspaceHours: Record<string, Record<string, number>>;
  realspaceTravel: { distance: string; time: string }[];
  starshipSizes: { name: string; space: string; stockCost?: number; modificationSlots?: number; fuelCapacity?: number }[];
}

// First sentence of a book text, without markdown markup
export function summarize(markdown: string | undefined, maxLength = 180): string {
  const text = (markdown ?? "")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#") && !line.trim().startsWith("|"))
    .join(" ")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = (text.match(/^.*?[.!?](\s|$)/) ?? [text])[0].trim();
  return sentence.length > maxLength ? sentence.slice(0, maxLength - 1).trimEnd() + "…" : sentence;
}
