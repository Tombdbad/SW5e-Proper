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
  // The background's tables to roll or choose from (an ideal reads "Charity. I always try to help ... (Light)")
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
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
    personalityTraits: (row.personalityTraitOptions ?? []).map((o: any) => o.description),
    ideals: (row.idealOptions ?? []).map((o: any) => (o.name ? `${o.name}. ${o.description}` : o.description)),
    bonds: (row.bondOptions ?? []).map((o: any) => o.description),
    flaws: (row.flawOptions ?? []).map((o: any) => o.description),
    source: row.contentSource,
  };
}

export const backgrounds: Background[] = (backgroundData as any[]).map(toBackground);

// Languages a background grants: how many of the player's choice ("Two of your choice"), or the
// one it names
export function backgroundLanguages(background?: Background): { choices: number; fixed: string[] } {
  const text = (background?.languages ?? "None").replace(/\.$/, "");
  if (!text || text === "None") return { choices: 0, fixed: [] };
  const choice = text.match(/^(\w+) of your choice/i);
  return choice ? { choices: COUNT[choice[1].toLowerCase()] ?? 1, fixed: [] } : { choices: 0, fixed: [text] };
}

// Tools a background grants. Its text either names them ("Disguise kit, Forgery kit") or leaves a
// choice ("One type of gaming set", "Your choice of demolitions kit, security kit, or slicer's
// kit"): then `options` are the tools the text allows and `choices` how many to pick.
// `tools` is the tool list from the equipment data.
export function backgroundTools(background: Background | undefined, tools: { name: string; category: string }[]): { fixed: string[]; options: string[]; choices: number } {
  const text = background?.toolProficiencies[0] ?? "";
  if (!text) return { fixed: [], options: [], choices: 0 };
  const lower = text.toLowerCase();
  const named = tools.filter((tool) => lower.includes(tool.name.toLowerCase())).map((tool) => tool.name);
  if (!/choice|choose|\bone\b|\btwo\b|\btype\b| or /i.test(text)) return { fixed: named.length ? named : [text], options: [], choices: 0 };
  const kinds = [
    ...(/gaming set/.test(lower) ? tools.filter((tool) => tool.category === "GamingSet") : []),
    ...(/instrument/.test(lower) ? tools.filter((tool) => tool.category === "MusicalInstrument") : []),
    ...(/artisan.s implements/.test(lower) ? tools.filter((tool) => /implements$/i.test(tool.name)) : []),
  ].map((tool) => tool.name);
  const options = Array.from(new Set([...named, ...kinds]));
  return {
    fixed: [],
    options: options.length ? options : tools.map((tool) => tool.name),
    choices: /\btwo\b/.test(lower) || / and |, (?:one|your)/.test(lower) ? 2 : 1,
  };
}

// Export for UI usage
export const BACKGROUNDS = backgrounds.map((b) => ({ id: b.id, name: b.name }));

export function getBackgroundById(id: string): Background | undefined {
  return backgrounds.find((b) => b.id === id);
}
