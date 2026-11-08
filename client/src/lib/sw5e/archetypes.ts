// Archetypes: a view over shared/data/sw5e/archetypes.json (generated, see shared/data/index.ts)
import archetypeData from "@shared/data/sw5e/archetypes.json";
import { summarize } from "@shared/data/text";

export interface ClassArchetype {
  id: string;
  name: string;
  parentClass: string;
  description: string;
  flavorText: string;
  // Archetypes that grant casting to a class without it
  casterType: "Force" | "Tech" | "None";
  // What the archetype's own caster table grants by character level (powers known, points before the ability modifier, highest power level); empty when it has none
  casting: Record<number, { known: number; points: number; maxLevel: number }>;
  source: string;
  features: {
    level: number;
    name: string;
    description: string;
  }[];
}

// A cell of the table as a number: "4" -> 4, "2nd" -> 2
const cell = (cells: any[], pattern: RegExp): number => Number((String(cells.find((c) => pattern.test(c.key))?.value ?? "").match(/\d+/) ?? [0])[0]);
function castingTable(row: any): ClassArchetype["casting"] {
  const table: ClassArchetype["casting"] = {};
  if (row.casterType !== "Force" && row.casterType !== "Tech") return table;
  for (const [level, cells] of Object.entries<any[]>(row.leveledTable ?? {})) {
    table[Number(level)] = { known: cell(cells, /Powers Known/i), points: cell(cells, /Points/i), maxLevel: cell(cells, /Max Power Level/i) };
  }
  return table;
}

export const archetypes: ClassArchetype[] = (archetypeData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  parentClass: String(row.className).toLowerCase(),
  description: summarize(row.text, 400),
  flavorText: row.text ?? "",
  casterType: row.casterType === "Force" || row.casterType === "Tech" ? row.casterType : "None",
  casting: castingTable(row),
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
