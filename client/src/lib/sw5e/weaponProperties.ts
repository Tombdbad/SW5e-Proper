// Weapon properties: a view over shared/data/sw5e/weaponProperties.json (generated, see shared/data/index.ts)
import weaponPropertyData from "@shared/data/sw5e/weaponProperties.json";

export interface WeaponProperty {
  id: string;
  name: string;
  description: string;
}

export const weaponProperties: WeaponProperty[] = (weaponPropertyData as any[]).map((row) => ({
  id: row.id,
  name: row.name,
  description: String(row.content ?? "").replace(/^#+\s*.*\n/, "").trim(),
}));
