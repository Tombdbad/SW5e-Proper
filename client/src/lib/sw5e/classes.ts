// Classes: a view over shared/data/sw5e/classes.json (generated, see shared/data/index.ts)
import classData from "@shared/data/sw5e/classes.json";
import skillData from "@shared/data/sw5e/skills.json";

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
}

// Classes data for SW5E
export interface SW5EClass {
  id: string;
  name: string;
  summary: string;
  description: string;
  // The book's advice for making one: the short recipe, and the questions to ask yourself
  quickBuild: string;
  creating: string;
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: string[];
  numSkillChoices: number;
  equipmentChoices: string[];
  startingWealth: string;
  features: ClassFeature[];
  archetypeLevel: number;
  // Power use: full, two-thirds and half casters differ only in their level tables
  casterType: "Force" | "Tech" | "None";
  casterRatio: number;
  // The class table: level -> column -> value, exactly as printed
  levelTable: Record<string, Record<string, string>>;
  source: string;
}

const ALL_SKILLS = (skillData as any[]).map((s) => s.name);

function toClass(row: any): SW5EClass {
  const listed: string[] = row.skillChoicesList ?? [];
  return {
    id: row.id,
    name: row.name,
    summary: row.summary ?? "",
    description: row.flavorText ?? "",
    quickBuild: String(row.quickBuildText ?? "").trim(),
    creating: String(row.creatingText ?? "").trim(),
    hitDie: row.hitDiceDieType,
    primaryAbility: String(row.primaryAbility ?? "").split(/\s+or\s+|,\s*|\s+and\s+/).filter(Boolean),
    savingThrows: row.savingThrows ?? [],
    armorProficiencies: row.armorProficiencies ?? [],
    weaponProficiencies: row.weaponProficiencies ?? [],
    toolProficiencies: row.toolProficiencies ?? [],
    skillChoices: listed.includes("Any") ? ALL_SKILLS : listed,
    numSkillChoices: Number(row.numSkillChoices) || 0,
    equipmentChoices: row.equipmentLines ?? [],
    startingWealth: row.startingWealthVariant ?? "",
    features: (row.features ?? []).map((f: any) => ({ name: f.name, level: f.level, description: f.text })),
    archetypeLevel: 3,
    casterType: row.casterType === "Force" || row.casterType === "Tech" ? row.casterType : "None",
    casterRatio: Number(row.casterRatio) || 0,
    levelTable: row.levelChanges ?? {},
    source: row.contentSource,
  };
}

export const classes: SW5EClass[] = (classData as any[]).map(toClass);

// Export for UI usage
export const CLASSES = classes.map((c) => ({ id: c.id, name: c.name }));

// Helper functions
export function getClassById(id: string): SW5EClass | undefined {
  return classes.find(c => c.id === id);
}

export function getClassFeaturesByLevel(classId: string, level: number): ClassFeature[] {
  const characterClass = getClassById(classId);
  if (!characterClass) return [];

  return characterClass.features.filter(feature => feature.level <= level);
}

export function getClassNames(): {id: string, name: string}[] {
  return classes.map(c => ({ id: c.id, name: c.name }));
}

// A cell of the class table as a number: "4" -> 4, "2nd" -> 2, "d6" -> 6, a dash -> 0
export function getClassLevelValue(classId: string, level: number, column: string): number {
  const cell = getClassById(classId)?.levelTable[String(Math.min(20, Math.max(1, level)))]?.[column];
  return Number((String(cell ?? "").match(/\d+/) ?? [0])[0]);
}

// What the class table grants a caster at this level. Points exclude the ability modifier.
export function getPowerProgression(classId: string, level: number) {
  const type = getClassById(classId)?.casterType ?? "None";
  if (type === "None") return { type, points: 0, powersKnown: 0, maxPowerLevel: 0 };
  return {
    type,
    points: getClassLevelValue(classId, level, `${type} Points`),
    powersKnown: getClassLevelValue(classId, level, `${type} Powers Known`),
    maxPowerLevel: getClassLevelValue(classId, level, "Max Power Level"),
  };
}
