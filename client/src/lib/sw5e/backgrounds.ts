// Backgrounds: a view over shared/data/sw5e/backgrounds.json (generated, see shared/data/index.ts)
import backgroundData from "@shared/data/sw5e/backgrounds.json";
import { summarize } from "@shared/data";

export interface Background {
  id: string;
  name: string;
  summary: string;
  description: string;
  feature: string;
  featureDescription: string;
  // "Choose two from A, B, C, and D": the options and how many to pick
  skillProficiencies: string[];
  numSkillChoices: number;
  toolProficiencies: string[];
  languages: string;
  equipment: string[];
  // Every background grants one feat from this list at 1st level
  featOptions: string[];
  suggestedCharacteristics: string[];
  source: string;
}

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

function toBackground(row: any): Background {
  const skills = String(row.skillProficiencies ?? "");
  const choice = skills.match(/^Choose (\w+) from (.+)$/i);
  const list = (choice ? choice[2] : skills).split(/,\s*(?:and\s+)?|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    summary: summarize(row.flavorText),
    description: row.flavorText ?? "",
    feature: row.featureName ?? "",
    featureDescription: row.featureText ?? "",
    skillProficiencies: list,
    numSkillChoices: choice ? COUNT[choice[1].toLowerCase()] ?? 2 : list.length,
    toolProficiencies: row.toolProficiencies && row.toolProficiencies !== "None" ? [row.toolProficiencies] : [],
    languages: row.languages ?? "None",
    equipment: row.equipment ? [row.equipment] : [],
    featOptions: (row.featOptions ?? []).map((f: any) => f.name),
    suggestedCharacteristics: row.suggestedCharacteristics ? [row.suggestedCharacteristics] : [],
    source: row.contentSource,
  };
}

export const backgrounds: Background[] = (backgroundData as any[]).map(toBackground);

// Export for UI usage
export const BACKGROUNDS = backgrounds.map((b) => ({ id: b.id, name: b.name }));

export function getBackgroundById(id: string): Background | undefined {
  return backgrounds.find((b) => b.id === id);
}
