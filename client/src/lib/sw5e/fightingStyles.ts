// Fighting styles: a view over shared/data/sw5e/fightingStyles.json (generated, see shared/data/index.ts)
import fightingStyleData from "@shared/data/sw5e/fightingStyles.json";

export interface FightingStyle {
  id: string;
  name: string;
  description: string;
}

export const fightingStyles: FightingStyle[] = (fightingStyleData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? "",
}));
