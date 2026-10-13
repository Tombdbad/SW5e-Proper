// Humanoid stat blocks (troopers, officers, hunters, guards ...): the people among monsters.ts
import { monsters, Monster } from "./monsters";

export interface NPC {
  id: string;
  name: string;
  category: string;
  type: string;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  alignment: string;
  description: string;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  armorClass: number;
  hitPoints: number;
  speed: string;
  skills: string[];
  senses: string[];
  languages: string[];
  challengeRating: string;
  specialAbilities?: {
    name: string;
    description: string;
  }[];
  actions?: {
    name: string;
    description: string;
    attackBonus?: number;
    damage?: string;
    damageType?: string;
  }[];
  reactions?: {
    name: string;
    description: string;
  }[];
}

const toNpc = (m: Monster): NPC => ({
  id: m.id,
  name: m.name,
  category: m.type,
  type: m.type,
  size: m.size,
  alignment: m.alignment,
  description: m.description,
  stats: {
    str: m.stats.strength,
    dex: m.stats.dexterity,
    con: m.stats.constitution,
    int: m.stats.intelligence,
    wis: m.stats.wisdom,
    cha: m.stats.charisma,
  },
  armorClass: m.armorClass,
  hitPoints: m.hitPoints,
  speed: `${m.speed.walk ?? 0} ft.`,
  skills: m.skills,
  senses: m.senses,
  languages: m.languages,
  challengeRating: m.challengeRating,
  specialAbilities: m.abilities,
  actions: m.actions,
  reactions: m.reactions,
});

export const npcs: NPC[] = monsters.filter((m) => /human/i.test(m.type) && !/swarm/i.test(m.type)).map(toNpc);
