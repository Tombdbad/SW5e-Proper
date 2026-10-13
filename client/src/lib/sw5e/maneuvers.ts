// Maneuvers: a view over shared/data/sw5e/maneuvers.json (generated, see shared/data/index.ts)
import maneuverData from "@shared/data/sw5e/maneuvers.json";

export interface Maneuver {
  id: string;
  name: string;
  type: "General" | "Mental" | "Physical";
  prerequisite?: string;
  description: string;
  source: string;
}

export const maneuvers: Maneuver[] = (maneuverData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  prerequisite: row.prerequisite && row.prerequisite !== "None" ? row.prerequisite : undefined,
  description: row.description ?? "",
  source: row.contentSource,
}));
