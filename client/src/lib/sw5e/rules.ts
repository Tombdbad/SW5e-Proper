import lookups from "@shared/data/sw5e/lookups.json";
import advancement from "@shared/data/sw5e/characterAdvancement.json";
import { SW5EClass, getClassById, getPowerProgression } from './classes';
import { Species } from './species';
import { Skill } from './skills';
import { Background } from './backgrounds';
import { equipment } from './equipment';

type Class = SW5EClass & Record<string, any>;

export type AbilityScores = {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};

export type Character = {
  id?: string;
  userId: string;
  name: string;
  speciesId: string;
  backgroundId: string;
  classes: CharacterClass[];
  abilityScores: AbilityScores;
  hitPoints: number;
  temporaryHitPoints: number;
  credits: number;
  level?: number;
  // Other properties...
};

export type CharacterClass = {
  classId: string;
  level: number;
  archetypeId?: string;
  hitDieResults?: number[];
};

// Ability score modifier calculation
export const getAbilityModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

// Calculate proficiency bonus based on character level
export const calculateProficiencyBonus = (level: number): number => {
  return Math.ceil(1 + (level / 4));
};

// Force or tech points: the class table's points plus the casting modifier. Force users add
// Wisdom or Charisma (their choice, so the better one); tech users add Intelligence.
export const calculatePowerPoints = (
  classId: string,
  level: number,
  abilityScores: AbilityScores
): number => {
  const progression = getPowerProgression(classId, level);
  if (progression.type === "None" || progression.points === 0) return 0;
  const modifier = progression.type === "Force"
    ? Math.max(getAbilityModifier(abilityScores.wisdom), getAbilityModifier(abilityScores.charisma))
    : getAbilityModifier(abilityScores.intelligence);
  return Math.max(0, progression.points + modifier);
};

// Powers a class knows at a level, from its class table
export const calculatePowersKnown = (classId: string, level: number): number => {
  return getPowerProgression(classId, level).powersKnown;
};

// Highest power level a class can cast at a level, from its class table
export const calculateMaxPowerLevel = (level: number, classId?: string): number => {
  return classId ? getPowerProgression(classId, level).maxPowerLevel : 0;
};

// Check if a character meets the prerequisites for a power
export const meetsPowerPrerequisites = (character: any, power: any): boolean => {
  if (!power.prerequisites) return true;

  return !power.prerequisites.some((prereq: string) => {
    if (prereq.startsWith('Level ')) {
      const requiredLevel = parseInt(prereq.split(' ')[1]);
      return character.level < requiredLevel;
    }
    // Add more prerequisite checks as needed
    return false;
  });
};

// Point buy system constants
export const MAX_POINT_BUY_POINTS = 27;
export const ABILITY_SCORE_COSTS: Record<string, number> = lookups.abilityScorePointCost;

// Aliases for getAbilityModifier for backward compatibility
export const calculateModifier = getAbilityModifier;
export const getAbilityModifiers = getAbilityModifier; // Add plural version for compatibility

  // Define MAX_POINT_BUY_POINTS for ability score point-buy system


// Calculate total character level from all classes
export const getCharacterLevel = (classes: CharacterClass[]): number => {
  return classes.reduce((total, characterClass) => total + characterClass.level, 0);
};

// Alias for getCharacterLevel
export const calculateCharacterLevel = getCharacterLevel;


// Calculate maximum hit points based on class, level, constitution, and species
  export const calculateHitPoints = (
    character: Character,
    characterClasses: { class: Class; level: number }[] | undefined,
    abilityScores: AbilityScores,
    species: Species,
    hitDiceResults?: number[][]
  ): number => {
    const constitutionModifier = getAbilityModifier(abilityScores.constitution);
    let totalHP = 0;

    // Process each class the character has levels in
    if (!characterClasses || characterClasses.length === 0) {
      // Default calculation if no classes are provided
      return Math.max(1, 8 + constitutionModifier); // Use default hit die of 8
    }

  if (!characterClasses || characterClasses.length === 0) {
    // Default calculation if no classes are provided
    return Math.max(1, 8 + constitutionModifier); // Use default hit die of 8
  }

  // Process each class the character has levels in
  characterClasses.forEach((classInfo, classIndex) => {
    const { class: charClass, level } = classInfo;

    // For first level in first class, maximum hit points are granted
    if (classIndex === 0) {
      totalHP += charClass.hitDie + constitutionModifier;

      // For remaining levels, either use provided hit dice results or average
      if (level > 1) {
        for (let i = 1; i < level; i++) {
          if (hitDiceResults && hitDiceResults[classIndex] && hitDiceResults[classIndex][i]) {
            totalHP += hitDiceResults[classIndex][i] + constitutionModifier;
          } else {
            // Use average hit points if no results provided
            totalHP += Math.floor(charClass.hitDie / 2) + 1 + constitutionModifier;
          }
        }
      }
    } else {
      // For multiclass levels, calculate HP for each level
      for (let i = 0; i < level; i++) {
        if (hitDiceResults && hitDiceResults[classIndex] && hitDiceResults[classIndex][i]) {
          totalHP += hitDiceResults[classIndex][i] + constitutionModifier;
        } else {
          // Use average hit points if no results provided
          totalHP += Math.floor(charClass.hitDie / 2) + 1 + constitutionModifier;
        }
      }
    }
  });

  // Apply any species-specific HP bonuses
  if (species.hpBonus) {
    totalHP += species.hpBonus;
  }

  return totalHP;
};

// Calculate skill modifier based on ability scores and proficiencies
export const calculateSkillModifier = (
  abilityScores: AbilityScores,
  skill: Skill,
  proficiencyBonus: number,
  isProficient: boolean,
  hasExpertise: boolean
): number => {
  const abilityModifier = getAbilityModifier(abilityScores[skill.ability as keyof AbilityScores]);

  if (hasExpertise) {
    return abilityModifier + (proficiencyBonus * 2);
  } else if (isProficient) {
    return abilityModifier + proficiencyBonus;
  }

  return abilityModifier;
};

// Calculate saving throw modifier
export const calculateSavingThrowModifier = (
  abilityScores: AbilityScores,
  ability: keyof AbilityScores,
  proficiencyBonus: number,
  isProficient: boolean
): number => {
  const abilityModifier = getAbilityModifier(abilityScores[ability]);

  if (isProficient) {
    return abilityModifier + proficiencyBonus;
  }

  return abilityModifier;
};

// Calculate initiative modifier
export const calculateInitiativeModifier = (
  abilityScores: AbilityScores,
  bonusInitiative: number = 0
): number => {
  return getAbilityModifier(abilityScores.dexterity) + bonusInitiative;
};

// Calculate carrying capacity based on strength and size
export const calculateCarryingCapacity = (
  abilityScores: AbilityScores,
  species: Species
): { normal: number; heavy: number; maximum: number } => {
  // Base carrying capacity is strength score × 15
  let baseCapacity = abilityScores.strength * 15;

  // Adjust for size
  const sizeMultipliers = {
    tiny: 0.5,
    small: 0.75,
    medium: 1,
    large: 2,
    huge: 4,
    gargantuan: 8
  };

  const sizeMultiplier = sizeMultipliers[species.size.toLowerCase() as keyof typeof sizeMultipliers] || 1;
  baseCapacity *= sizeMultiplier;

  return {
    normal: baseCapacity,
    heavy: baseCapacity * 2,
    maximum: baseCapacity * 3
  };
};

// Calculate passive perception
export const calculatePassivePerception = (
  abilityScores: AbilityScores,
  proficiencyBonus: number,
  isProficient: boolean,
  hasExpertise: boolean
): number => {
  const wisdomModifier = getAbilityModifier(abilityScores.wisdom);
  let bonus = 0;

  if (hasExpertise) {
    bonus = proficiencyBonus * 2;
  } else if (isProficient) {
    bonus = proficiencyBonus;
  }

  return 10 + wisdomModifier + bonus;
};

// Armor class from the armor and shield actually carried (names as in the equipment data).
// Armor entries read "11 + Dex modifier", "13 + Dex modifier (max 2)" or "17"; shields "+1".
export const calculateArmorClass = (
  abilityScores: AbilityScores,
  carried: string[] = [],
  armorBonus: number = 0
): number => {
  const dexModifier = getAbilityModifier(abilityScores.dexterity);
  const names = carried.map((n) => String(n).toLowerCase());
  const owned = equipment.filter((e) => e.category === "Armor" && names.includes(e.name.toLowerCase()));
  let best = 10 + dexModifier;
  for (const armor of owned.filter((e) => e.armorClassification !== "Shield")) {
    const base = Number((String(armor.armorClass).match(/^\d+/) ?? [0])[0]);
    const cap = String(armor.armorClass).match(/max (\d+)/);
    const dex = !/dex/i.test(String(armor.armorClass)) ? 0 : cap ? Math.min(Number(cap[1]), dexModifier) : dexModifier;
    best = Math.max(best, base + dex);
  }
  const shield = Math.max(0, ...owned.filter((e) => e.armorClassification === "Shield").map((e) => Number((String(e.armorClass).match(/\d+/) ?? [0])[0])));
  return best + shield + armorBonus;
};

// Check if character meets prerequisites for multiclassing
export const checkMulticlassPrerequisites = (
  abilityScores: AbilityScores,
  targetClass: Class
): boolean => {
  if (!targetClass.multiclassPrerequisites) {
    return true;
  }

  for (const [ability, minScore] of Object.entries(targetClass.multiclassPrerequisites)) {
    if (abilityScores[ability as keyof AbilityScores] < minScore) {
      return false;
    }
  }

  return true;
};

// Enhancement: Character advancement tracking
export const calculateExperienceForLevel = (level: number): number => {
  const table = (advancement as any[]).map((row) => row.experiencePoints as number);
  return table[Math.min(table.length, Math.max(1, level)) - 1];
};

// Calculate experience needed for next level
export const experienceToNextLevel = (currentLevel: number): number => {
  if (currentLevel >= 20) return 0; // Already max level

  const currentLevelXP = calculateExperienceForLevel(currentLevel);
  const nextLevelXP = calculateExperienceForLevel(currentLevel + 1);

  return nextLevelXP - currentLevelXP;
};

// Validate weapon proficiencies
// The class's list reads "All blasters", "simple vibroweapons", "martial vibroweapons with the
// finesse property" or "martial blasters that lack the auto, special, strength, and two-handed
// properties"; a weapon is classed "SimpleBlaster", "MartialVibroweapon" and so on.
export const hasWeaponProficiency = (
  classId: string,
  weapon: { weaponClassification?: string; properties?: string[] }
): boolean => {
  const [, tier, kind] = (weapon.weaponClassification ?? "").match(/^(Simple|Martial|Exotic)(\w+)$/) ?? [];
  if (!tier) return false;
  const has = (weapon.properties ?? []).map((p) => p.toLowerCase().replace(/\s*(\(.*|\d.*)$/, ""));
  const list = (getClassById(classId)?.weaponProficiencies ?? []).join(", ").toLowerCase();
  const clauses = list.split(/,? ?(?=(?:all|simple|martial|exotic) \w+s\b)/).filter(Boolean);
  return clauses.some((clause) => {
    const [, which, kinds, how, named] = clause.match(/^(all|simple|martial|exotic) (\w+)s(?: (with the|that lack the) (.*) propert(?:y|ies))?/) ?? [];
    if (kinds !== kind.toLowerCase()) return false;
    // "All" covers simple and martial weapons; exotic ones are learned one by one
    if (which === "all" ? tier === "Exotic" : which !== tier.toLowerCase()) return false;
    const properties = (named ?? "").split(/,\s*|\s+and\s+/).map((p) => p.replace(/^and /, "").trim()).filter(Boolean);
    return how === "with the" ? properties.every((p) => has.includes(p)) : !properties.some((p) => has.includes(p));
  });
};

// Validate armor proficiencies
export const hasArmorProficiency = (
  character: Character,
  armorType: string,
  classes: Class[]
): boolean => {
  // Check if any class grants proficiency with this armor type
  for (const characterClass of classes) {
    if (characterClass.armorProficiencies?.includes(armorType)) {
      return true;
    }
  }

  return false;
};

// Get starting equipment based on class and background
export const getStartingEquipment = (
  characterClass: Class,
  background: Background
): string[] => {
  const equipment: string[] = [];

  // Add class starting equipment
  if (characterClass.startingEquipment) {
    equipment.push(...characterClass.startingEquipment);
  }

  // Add background equipment
  if (background.equipment) {
    equipment.push(...background.equipment);
  }

  return equipment;
};

// Starting wealth by class (Player's Handbook variant), e.g. "8d4 x 100 cr": the roll, or its average
export const calculateStartingCredits = (classId: string, rollResult?: number): number => {
  const wealth = (getClassById(classId)?.startingWealth ?? "").match(/(\d+)d(\d+)\s*x\s*(\d+)/);
  if (!wealth) return 0;
  const [dice, die, multiplier] = [Number(wealth[1]), Number(wealth[2]), Number(wealth[3])];
  return (rollResult ?? Math.floor((dice * (die + 1)) / 2)) * multiplier;
};

// ---------------------------------------------------------------------------------------------
// Casting. Powers are stored on the character as chosen in creation (name, level, description,
// and forceAlignment for force powers). What a power does is read from its description.
// ---------------------------------------------------------------------------------------------

export interface PowerEffect {
  // attack: the caster rolls to hit; save: the target saves against the caster's DC;
  // heal: the caster regains hit points; other: nothing the app can resolve by itself
  kind: "attack" | "save" | "heal" | "other";
  dice?: string;
  damageType?: string;
  save?: keyof AbilityScores;
  halfOnSave?: boolean;
  summary: string;
}

// Points a power costs: its level + 1; at-will powers (level 0) are free
export const powerCost = (power: { level: number }): number => (power.level > 0 ? power.level + 1 : 0);

export function powerEffect(power: { level: number; description?: string }, casterLevel: number): PowerEffect {
  const text = power.description ?? "";
  const heal = text.match(/regains? (?:a number of )?hit points equal to (\d+)d(\d+)/i);
  const damage = text.match(/(\d+)d(\d+)(?:\s*\+\s*\d+)? (\w+) damage/i);
  // At-will powers grow at 5th, 11th and 17th level
  const steps = power.level === 0 && /5th level/.test(text) ? 1 + [5, 11, 17].filter((l) => casterLevel >= l).length : 1;
  if (heal) {
    const dice = `${Number(heal[1]) * steps}d${heal[2]}`;
    return { kind: "heal", dice, summary: `heals ${dice} + casting modifier` };
  }
  if (!damage) return { kind: "other", summary: "effect described in its text" };
  const dice = `${Number(damage[1]) * steps}d${damage[2]}`;
  const damageType = damage[3].toLowerCase();
  if (/(ranged|melee) (force|tech) attack/i.test(text)) {
    return { kind: "attack", dice, damageType, summary: `power attack, ${dice} ${damageType}` };
  }
  const save = text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
  if (save) {
    const halfOnSave = /half as much damage on a successful/i.test(text);
    return {
      kind: "save",
      dice,
      damageType,
      save: save[1].toLowerCase() as keyof AbilityScores,
      halfOnSave,
      summary: `${save[1]} save, ${dice} ${damageType}${halfOnSave ? " (half on a save)" : ""}`,
    };
  }
  return { kind: "other", summary: "effect described in its text" };
}

// The caster's modifier, attack bonus and save DC for a power. Force powers use Wisdom (light),
// Charisma (dark) or the better of the two (universal); tech powers use Intelligence.
export function castingStats(
  abilityScores: AbilityScores,
  level: number,
  power: { forceAlignment?: string },
): { modifier: number; attack: number; dc: number } {
  const wis = getAbilityModifier(abilityScores.wisdom);
  const cha = getAbilityModifier(abilityScores.charisma);
  const modifier = !("forceAlignment" in power)
    ? getAbilityModifier(abilityScores.intelligence)
    : power.forceAlignment === "Light" ? wis : power.forceAlignment === "Dark" ? cha : Math.max(wis, cha);
  const proficiency = calculateProficiencyBonus(level);
  return { modifier, attack: proficiency + modifier, dc: 8 + proficiency + modifier };
}
