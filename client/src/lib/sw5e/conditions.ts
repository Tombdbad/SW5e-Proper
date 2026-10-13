// Conditions: a view over shared/data/sw5e/conditions.json (generated, see shared/data/index.ts)
import conditionData from "@shared/data/sw5e/conditions.json";

export interface Condition {
  id: string;
  name: string;
  description: string;
  effects: string[];
}

export const conditions: Condition[] = (conditionData as any[]).map((row) => {
  const lines = String(row.description ?? "").split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  return { id: row.id, name: row.name, description: row.description ?? "", effects: lines };
});

// Helper functions
export function getConditionById(id: string): Condition | undefined {
  return conditions.find((condition) => condition.id === id);
}

export function getConditionsByIds(ids: string[]): Condition[] {
  return conditions.filter((condition) => ids.includes(condition.id));
}
