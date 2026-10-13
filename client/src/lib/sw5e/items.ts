// Items for inventories: the same equipment data as equipment.ts, in the shape the inventory uses
import { equipment, Equipment } from "./equipment";

export interface Item {
  id: string;
  name: string;
  type: string;
  category: string;
  rarity: 'Standard' | 'Premium' | 'Prototype' | 'Advanced' | 'Legendary';
  description: string;
  cost: number;
  weight?: number;
  properties?: string[];
  requiresAttunement?: boolean;
  additionalInfo?: string;
}

export interface Weapon extends Item {
  damageType: string;
  damageDice: string;
  weaponClassification: string;
  weaponGroup: string;
  proficiencyGroup: string;
}

export interface Armor extends Item {
  armorClass: string;
  strengthRequirement?: number;
  stealthDisadvantage?: boolean;
  armorClassification: string;
}

export interface Gear extends Item {
  uses?: number;
}

const base = (e: Equipment, type: string): Item => ({
  id: e.id,
  name: e.name,
  type,
  category: e.kind,
  rarity: "Standard",
  description: e.description,
  cost: e.price,
  weight: e.weight,
  properties: e.properties,
});

export const weapons: Weapon[] = equipment
  .filter((e) => e.category === "Weapon")
  .map((e) => {
    const [dice, damageType] = (e.damage ?? "").split(" ");
    const classification = e.weaponClassification ?? "";
    return {
      ...base(e, "weapon"),
      damageDice: dice ?? "",
      damageType: damageType ?? "",
      weaponClassification: classification,
      weaponGroup: classification.replace(/^(Simple|Martial|Exotic)/, ""),
      proficiencyGroup: (classification.match(/^(Simple|Martial|Exotic)/) ?? [""])[0],
    };
  });

export const armors: Armor[] = equipment
  .filter((e) => e.category === "Armor")
  .map((e) => ({
    ...base(e, "armor"),
    armorClass: e.armorClass ?? "",
    stealthDisadvantage: e.stealthDisadvantage,
    armorClassification: e.armorClassification ?? "",
  }));

export const adventuringGear: Gear[] = equipment
  .filter((e) => e.category !== "Weapon" && e.category !== "Armor")
  .map((e) => base(e, "gear"));

// Helper function to get all items in a single array
export function getAllItems(): Item[] {
  return [
    ...weapons,
    ...armors,
    ...adventuringGear
  ];
}

// Helper to find an item by ID
export function findItemById(id: string): Item | undefined {
  return getAllItems().find(item => item.id === id);
}

// Helper to find an item by its name, as stored on characters
export function findItemByName(name: string): Item | undefined {
  const wanted = name.toLowerCase();
  return getAllItems().find((item) => item.name.toLowerCase() === wanted);
}

// Helper to filter items by type
export function getItemsByType(type: 'weapon' | 'armor' | 'gear'): Item[] {
  return getAllItems().filter(item => item.type === type);
}

// Helper to filter items by rarity
export function getItemsByRarity(rarity: Item['rarity']): Item[] {
  return getAllItems().filter(item => item.rarity === rarity);
}
