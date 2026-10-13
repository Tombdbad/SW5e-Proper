// Equipment: a view over shared/data/sw5e/equipment.json (generated, see shared/data/index.ts)
import equipmentData from "@shared/data/sw5e/equipment.json";

export interface Equipment {
  id: string;
  name: string;
  // Coarse group for the creation tabs; `kind` keeps the book's own category
  category: "Weapon" | "Armor" | "Ammunition" | "Adventuring Gear" | "Tool";
  kind: string;
  description: string;
  price: number;
  weight?: number;
  properties?: string[];
  damage?: string;
  armorClass?: string;
  weaponClassification?: string;
  armorClassification?: string;
  strRequirement?: string;
  stealthDisadvantage?: boolean;
  source: string;
}

const TOOL_KINDS = new Set(["Tool", "Kit", "GamingSet", "MusicalInstrument"]);

function toEquipment(row: any): Equipment {
  const kind: string = row.equipmentCategory;
  const isWeapon = kind === "Weapon";
  const isArmor = kind === "Armor";
  return {
    id: row.id,
    name: row.name,
    category: isWeapon ? "Weapon" : isArmor ? "Armor" : kind === "Ammunition" ? "Ammunition" : TOOL_KINDS.has(kind) ? "Tool" : "Adventuring Gear",
    kind,
    description: row.description ?? "",
    price: row.cost ?? 0,
    weight: row.weight !== undefined ? Number(row.weight) || undefined : undefined,
    properties: row.properties,
    damage: isWeapon && row.damageNumberOfDice ? `${row.damageNumberOfDice}d${row.damageDieType} ${String(row.damageType).toLowerCase()}` : undefined,
    armorClass: isArmor ? row.ac : undefined,
    weaponClassification: isWeapon ? row.weaponClassification : undefined,
    armorClassification: isArmor ? row.armorClassification : undefined,
    strRequirement: row.strengthRequirement,
    stealthDisadvantage: isArmor ? !!row.stealthDisadvantage : undefined,
    source: row.contentSource,
  };
}

export const equipment: Equipment[] = (equipmentData as any[]).map(toEquipment);

// Export for UI usage
export const EQUIPMENT = equipment.map((e) => ({ id: e.id, name: e.name, type: e.category.toLowerCase() }));

export function findEquipmentByName(name: string): Equipment | undefined {
  const wanted = name.toLowerCase();
  return equipment.find((e) => e.name.toLowerCase() === wanted);
}
