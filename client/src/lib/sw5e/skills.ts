// Skills: a view over shared/data/sw5e/skills.json (generated, see shared/data/index.ts)
import skillData from "@shared/data/sw5e/skills.json";

export interface Skill {
  id: string;
  name: string;
  ability: string;
}

export const skills: Skill[] = (skillData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  ability: String(row.baseAttribute).toLowerCase(),
}));
