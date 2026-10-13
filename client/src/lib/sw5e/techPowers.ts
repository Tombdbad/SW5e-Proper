// Tech powers: a view over shared/data/sw5e/powers.json (generated, see shared/data/index.ts)
import powerData from "@shared/data/sw5e/powers.json";

export interface TechPower {
  id: string;
  name: string;
  level: number; // 0 for at-will, 1-9 for leveled powers
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  description: string;
  higherLevelDescription?: string;
  prerequisite?: string;
  source: string;
}

export const techPowers: TechPower[] = (powerData as any[])
  .filter((row) => row.powerType === "Tech")
  .map((row) => ({
    id: row.id,
    name: row.name,
    level: row.level,
    castingTime: row.castingPeriodText ?? row.castingPeriod ?? "",
    range: row.range ?? "",
    duration: row.duration ?? "",
    concentration: !!row.concentration,
    description: row.description ?? "",
    higherLevelDescription: row.higherLevelDescription,
    prerequisite: row.prerequisite && row.prerequisite !== "None" ? row.prerequisite : undefined,
    source: row.contentSource,
  }));

// Export for UI usage
export const TECH_POWERS = techPowers.map((p) => ({ id: p.id, name: p.name }));

// Helper function to get powers by level
export function getPowersByLevel(level: number): TechPower[] {
  return techPowers.filter(power => power.level === level);
}

// Helper to find a power by ID
export function findPowerById(id: string): TechPower | undefined {
  return techPowers.find(power => power.id === id);
}
