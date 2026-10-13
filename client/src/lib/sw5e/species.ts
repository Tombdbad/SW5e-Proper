// Species: a view over shared/data/sw5e/species.json (generated, see shared/data/index.ts)
import speciesData from "@shared/data/sw5e/species.json";
import { summarize } from "@shared/data";

// One ability increase as the books give it: a named ability, a choice between the named
// abilities, or "Any one" / "Any two" / "Any four"
export interface AbilityIncrease {
  abilities: string[];
  amount: number;
}

export interface Species {
  id: string;
  name: string;
  summary: string;
  description: string;
  // Increases that involve no choice, keyed by lowercase ability
  abilityScoreIncrease: {
    [key: string]: number;
  };
  // Every alternative set of increases, choices included
  abilityScoreOptions: AbilityIncrease[][];
  size: string;
  speed: {
    walk: number;
    [key: string]: number;
  };
  vision: {
    type: string;
    range?: number;
  };
  traits: {
    name: string;
    description: string;
  }[];
  languages: string[];
  source: string;
  homeworld?: string;
  commonClasses?: string[];
  subspecies?: Subspecies[];
}

export interface Subspecies {
  id: string;
  name: string;
  description: string;
  abilityScoreIncrease: {
    ability: string;
    value: number;
  }[];
  traits: {
    name: string;
    description: string;
  }[];
}

// Traits every species has; they are shown as fields, not as special traits
const STANDARD_TRAITS = new Set(["Ability Score Increase", "Age", "Alignment", "Size", "Speed", "Languages", "Type"]);

const isChoice = (increase: AbilityIncrease) => increase.abilities.length !== 1 || /^any /i.test(increase.abilities[0]);

function toSpecies(row: any): Species {
  const trait = (name: string): string => row.traits?.find((t: any) => t.name === name)?.description ?? "";
  const options: AbilityIncrease[][] = (row.abilitiesIncreased ?? []).map((set: any[]) =>
    set.map((i) => ({ abilities: i.abilities, amount: i.amount })),
  );
  const fixed: Record<string, number> = {};
  for (const increase of options[0] ?? []) {
    if (!isChoice(increase)) fixed[increase.abilities[0].toLowerCase()] = increase.amount;
  }
  const speedText = trait("Speed");
  const speed: Species["speed"] = { walk: Number((speedText.match(/walking speed is (\d+)/) ?? [])[1] ?? 30) };
  const modes: Record<string, string> = { swimming: "swim", climbing: "climb", flying: "fly", burrowing: "burrow" };
  for (const m of speedText.matchAll(/(\w+) speed of (\d+)/g)) {
    if (modes[m[1]]) speed[modes[m[1]]] = Number(m[2]);
  }
  const darkvision = row.traits?.find((t: any) => /darkvision/i.test(t.name));
  const spoken = (trait("Languages").match(/(?:speak, read, and write|speak and understand|write)\s+(.+?)\./i) ?? [])[1];
  const special = [
    ...(row.traits ?? []).filter((t: any) => !STANDARD_TRAITS.has(t.name)),
    ...(row.features ?? []).map((f: any) => ({ name: f.name, description: f.text })),
  ];
  return {
    id: row.id,
    name: row.name,
    summary: [row.distinctions, row.homeworld && `Homeworld: ${row.homeworld}`].filter(Boolean).join(". ") || summarize(row.flavorText),
    description: row.flavorText ?? "",
    abilityScoreIncrease: fixed,
    abilityScoreOptions: options,
    size: row.size ?? "Medium",
    speed,
    vision: darkvision
      ? { type: "Darkvision", range: Number((darkvision.description.match(/(\d+) feet/) ?? [])[1] ?? 60) }
      : { type: "Normal" },
    traits: special.map((t: any) => ({ name: t.name, description: t.description })),
    languages: spoken ? spoken.split(/,\s*(?:and\s+)?|\s+and\s+/).map((l: string) => l.trim()).filter(Boolean) : ["Galactic Basic", row.language].filter(Boolean),
    source: row.contentSource,
    homeworld: row.homeworld,
  };
}

export const species: Species[] = (speciesData as any[]).map(toSpecies);

// Helper functions
export function getSpeciesById(id: string): Species | undefined {
  return species.find((s) => s.id === id);
}

export function getSpeciesNames(): { id: string; name: string }[] {
  return species.map((s) => ({ id: s.id, name: s.name }));
}

export function getSubspeciesBySpeciesId(speciesId: string): Subspecies[] {
  const speciesData = getSpeciesById(speciesId);
  return speciesData?.subspecies || [];
}

// Does this set of increases leave something for the player to choose?
export function hasAbilityChoice(set: AbilityIncrease[]): boolean {
  return set.some(isChoice);
}

// The abilities one increase may go to, lowercase; "Any ..." allows all six
export function increaseChoices(increase: AbilityIncrease): { abilities: string[]; count: number } {
  const all = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  const any = increase.abilities[0].match(/^any (one|two|three|four|five|six)/i);
  if (any) return { abilities: all, count: ["one", "two", "three", "four", "five", "six"].indexOf(any[1].toLowerCase()) + 1 };
  return { abilities: increase.abilities.map((a) => a.toLowerCase()), count: 1 };
}

// Export named constant for use in UI
export const SPECIES = species.map(s => ({
  id: s.id,
  name: s.name,
  summary: s.summary,
  abilityScoreIncrease: s.abilityScoreIncrease
}));
