// Lists for pickers, all read from shared/data/sw5e (generated, see shared/data/index.ts)
import lookups from "@shared/data/sw5e/lookups.json";
import skillData from "@shared/data/sw5e/skills.json";
import fightingStyleData from "@shared/data/sw5e/fightingStyles.json";
import backgroundData from "@shared/data/sw5e/backgrounds.json";
import equipmentData from "@shared/data/sw5e/equipment.json";

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();

// Society and morality, as in the Player's Handbook: "Lawful Light" ... "Neutral Balanced"
export const ALIGNMENTS: string[] = lookups.alignments;

export const ABILITY_NAMES = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
};

export const SKILLS = (skillData as any[]).map((s) => ({ name: s.name as string, ability: String(s.baseAttribute).toLowerCase() }));

export const LANGUAGES: string[] = lookups.languages;

export const TOOL_PROFICIENCIES = unique(
  (equipmentData as any[]).filter((e) => ["Tool", "Kit", "GamingSet", "MusicalInstrument"].includes(e.equipmentCategory)).map((e) => e.name),
);

export const BACKGROUND_OPTIONS = (backgroundData as any[]).map((b) => b.name as string);

export const ARMOR_TYPES = unique((equipmentData as any[]).filter((e) => e.equipmentCategory === "Armor").map((e) => e.armorClassification));

export const WEAPON_CATEGORIES = unique((equipmentData as any[]).filter((e) => e.equipmentCategory === "Weapon").map((e) => e.weaponClassification));

export const FIGHTING_STYLES = (fightingStyleData as any[]).map((f) => f.name as string);

export const FORCE_ALIGNMENTS = ["Universal", "Light", "Dark"];

export const POWER_SOURCES = ["Force", "Tech"];
