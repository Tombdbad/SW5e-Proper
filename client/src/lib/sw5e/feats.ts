// Feats: a view over shared/data/sw5e/feats.json (generated, see shared/data/index.ts)
import featData from "@shared/data/sw5e/feats.json";

export interface Feat {
  id: string;
  name: string;
  description: string;
  prerequisite?: string;
  // Abilities the feat can raise by 1
  attributesIncreased: string[];
  source: string;
}

export const feats: Feat[] = (featData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  description: row.text ?? "",
  prerequisite: row.prerequisite && row.prerequisite !== "None" ? row.prerequisite : undefined,
  attributesIncreased: row.attributesIncreased ?? [],
  source: row.contentSource,
}));

// Export for UI usage
export const FEATS = feats.map((f) => ({ id: f.id, name: f.name }));

// Helper to find a feat by ID
export function findFeatById(id: string): Feat | undefined {
  return feats.find(feat => feat.id === id);
}

export function findFeatByName(name: string): Feat | undefined {
  return feats.find((feat) => feat.name.toLowerCase() === name.toLowerCase());
}
