// Archetypes: a view over shared/data/sw5e/archetypes.json (generated, see shared/data/index.ts)
import archetypeData from "@shared/data/sw5e/archetypes.json";
import { summarize } from "@shared/data";

export interface ClassArchetype {
  id: string;
  name: string;
  parentClass: string;
  description: string;
  flavorText: string;
  // Archetypes that grant casting to a class without it
  casterType: "Force" | "Tech" | "None";
  source: string;
  features: {
    level: number;
    name: string;
    description: string;
  }[];
}

export const archetypes: ClassArchetype[] = (archetypeData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  parentClass: String(row.className).toLowerCase(),
  description: summarize(row.text, 400),
  flavorText: row.text ?? "",
  casterType: row.casterType === "Force" || row.casterType === "Tech" ? row.casterType : "None",
  source: row.contentSource,
  features: (row.features ?? []).map((f: any) => ({ level: f.level, name: f.name, description: f.text })),
}));

// Helper functions
export function getArchetypesByClass(className: string): ClassArchetype[] {
  return archetypes.filter(
    (archetype) =>
      archetype.parentClass.toLowerCase() === className.toLowerCase(),
  );
}

export function findArchetypeById(id: string): ClassArchetype | undefined {
  return archetypes.find((archetype) => archetype.id === id);
}

export function getArchetypeFeaturesByLevel(
  archetypeId: string,
  level: number,
): ClassArchetype["features"] {
  const archetype = findArchetypeById(archetypeId);
  if (!archetype) return [];

  return archetype.features.filter((feature) => feature.level <= level);
}
