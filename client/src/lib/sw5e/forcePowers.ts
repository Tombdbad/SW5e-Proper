// Force powers: a view over shared/data/sw5e/powers.json (generated, see shared/data/index.ts)
import powerData from "@shared/data/sw5e/powers.json";

export interface ForcePower {
  id: string;
  name: string;
  level: number; // 0 for at-will, 1-9 for leveled powers
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  forceAlignment: "Light" | "Dark" | "Universal";
  description: string;
  higherLevelDescription?: string;
  prerequisite?: string;
  source: string;
}

export const forcePowers: ForcePower[] = (powerData as any[])
  .filter((row) => row.powerType === "Force")
  .map((row) => ({
    id: row.id,
    name: row.name,
    level: row.level,
    castingTime: row.castingPeriodText ?? row.castingPeriod ?? "",
    range: row.range ?? "",
    duration: row.duration ?? "",
    concentration: !!row.concentration,
    forceAlignment: row.forceAlignment,
    description: row.description ?? "",
    higherLevelDescription: row.higherLevelDescription,
    prerequisite: row.prerequisite && row.prerequisite !== "None" ? row.prerequisite : undefined,
    source: row.contentSource,
  }));

// Export for UI usage
export const FORCE_POWERS = forcePowers.map((p) => ({ id: p.id, name: p.name, alignment: p.forceAlignment.toLowerCase() }));

// Helper function to get powers by level
export function getPowersByLevel(level: number): ForcePower[] {
  return forcePowers.filter(power => power.level === level);
}

// Helper function to get powers by alignment
export function getPowersByAlignment(alignment: ForcePower['forceAlignment']): ForcePower[] {
  return forcePowers.filter(power => power.forceAlignment === alignment);
}

// Helper to find a power by ID
export function findPowerById(id: string): ForcePower | undefined {
  return forcePowers.find(power => power.id === id);
}
