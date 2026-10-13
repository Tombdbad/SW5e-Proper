// Stat blocks from Scum and Villainy: a view over shared/data/sw5e/monsters.json
// (generated, see shared/data/index.ts). npcs.ts, droids.ts and vehicles.ts filter this list.
import monsterData from "@shared/data/sw5e/monsters.json";

export interface Monster {
  id: string;
  name: string;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  type: string;
  alignment: string;
  armorClass: number;
  armorType?: string;
  hitPoints: number;
  hitPointRoll?: string;
  speed: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
  };
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  savingThrows: string[];
  skills: string[];
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  senses: string[];
  languages: string[];
  // As printed ("1/2", "5"), with the number for comparisons
  challengeRating: string;
  cr: number;
  experiencePoints: number;
  description: string;
  abilities: {
    name: string;
    description: string;
  }[];
  actions: {
    name: string;
    description: string;
    attackBonus?: number;
    damage?: string;
    damageType?: string;
  }[];
  reactions: {
    name: string;
    description: string;
  }[];
  legendaryActions: {
    name: string;
    description: string;
  }[];
}

export function crToNumber(cr: string): number {
  const [a, b] = String(cr).split("/").map(Number);
  return b ? a / b : a || 0;
}

function toMonster(row: any): Monster {
  const speed: Monster["speed"] = { walk: row.speed };
  for (const m of String(row.speeds ?? "").matchAll(/(fly|swim|climb|burrow) (\d+)/g)) {
    speed[m[1] as "fly" | "swim" | "climb" | "burrow"] = Number(m[2]);
  }
  const behaviors: any[] = row.behaviors ?? [];
  const of = (type: string) => behaviors.filter((b) => b.monsterBehaviorType === type);
  const plain = (b: any) => ({ name: b.name, description: String(b.description ?? "").trim() });
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    type: (row.types ?? ["unknown"])[0],
    alignment: row.alignment ?? "unaligned",
    armorClass: row.armorClass,
    armorType: row.armorType,
    hitPoints: row.hitPoints,
    hitPointRoll: row.hitPointRoll,
    speed,
    stats: {
      strength: row.strength,
      dexterity: row.dexterity,
      constitution: row.constitution,
      intelligence: row.intelligence,
      wisdom: row.wisdom,
      charisma: row.charisma,
    },
    savingThrows: row.savingThrows ?? [],
    skills: row.skills ?? [],
    damageResistances: [...(row.damageResistances ?? []), ...(row.damageResistancesOther ?? [])],
    damageImmunities: [...(row.damageImmunities ?? []), ...(row.damageImmunitiesOther ?? [])],
    conditionImmunities: [...(row.conditionImmunities ?? []), ...(row.conditionImmunitiesOther ?? [])],
    senses: row.senses ?? [],
    languages: row.languages ?? [],
    challengeRating: String(row.challengeRating),
    cr: crToNumber(row.challengeRating),
    experiencePoints: row.experiencePoints ?? 0,
    description: row.flavorText ?? row.sectionText ?? "",
    abilities: of("Trait").map(plain),
    actions: of("Action").map((b) => ({
      ...plain(b),
      attackBonus: b.attackType && b.attackType !== "None" ? b.attackBonus : undefined,
      damage: b.damageRoll,
      damageType: b.damageType && b.damageType !== "Unknown" ? String(b.damageType).toLowerCase() : undefined,
    })),
    reactions: of("Reaction").map(plain),
    legendaryActions: of("Legendary").map(plain),
  };
}

export const monsters: Monster[] = (monsterData as any[]).map(toMonster);

export function findMonsterById(id: string): Monster | undefined {
  return monsters.find((m) => m.id === id);
}

export function getMonstersByType(type: string): Monster[] {
  return monsters.filter((m) => m.type.toLowerCase().includes(type.toLowerCase()));
}
