import { AbilityType } from './abilities';
import { Class } from './classes';
import { Species } from './species';
import { Skill } from './skills';
import { Background } from './backgrounds';

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

// Calculate force points based on character class and wisdom modifier
export const calculateForcePoints = (
  character: any, 
  classFeatures: { forceUser: boolean }, 
  level: number,
  abilityScores: any
): number => {
  if (!classFeatures.forceUser) return 0;

  const wisdomModifier = getAbilityModifier(abilityScores.wisdom);
  return level + wisdomModifier;
};

// Calculate tech points based on character class and intelligence modifier
export const calculateTechPoints = (
  character: any, 
  classFeatures: { techUser: boolean }, 
  level: number,
  abilityScores: any
): number => {
  if (!classFeatures.techUser) return 0;

  const intelligenceModifier = getAbilityModifier(abilityScores.intelligence);
  return level + intelligenceModifier;
};

// Calculate maximum force/tech power level based on character level
export const calculateMaxPowerLevel = (level: number): number => {
  return Math.min(5, Math.ceil(level / 4));
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
export const ABILITY_SCORE_COSTS = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
};

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

// Calculate armor class based on armor, dexterity, and other bonuses
export const calculateArmorClass = (
  abilityScores: AbilityScores,
  armorType: string | null,
  shield: boolean,
  armorBonus: number = 0
): number => {
  const dexModifier = getAbilityModifier(abilityScores.dexterity);

  // No armor (unarmored defense)
  if (!armorType) {
    return 10 + dexModifier + armorBonus;
  }

  // Different armor types
  switch (armorType.toLowerCase()) {
    case 'light armor':
      return 11 + dexModifier + armorBonus; // Base for light armor
    case 'medium armor':
      return 14 + Math.min(2, dexModifier) + armorBonus; // Cap dex bonus at +2 for medium
    case 'heavy armor':
      return 16 + armorBonus; // No dex bonus for heavy armor
    default:
      return 10 + dexModifier + armorBonus;
  }

  // Add shield bonus if applicable
  if (shield) {
    return (10 + dexModifier + armorBonus) + 2;
  }
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

// Calculate the power slots available at a given level for a particular class
export const calculatePowerSlots = (
  characterClass: Class,
  level: number,
  isMulticlass: boolean = false
): Record<number, number> => {
  // If the class doesn't have force or tech powers, return empty slots
  if (!characterClass.forceUser && !characterClass.techUser) {
    return {};
  }

  // Slot table indexed by level and slot level
  const fullCasterTable = {
    1: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
    2: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    3: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    4: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    5: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    6: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    7: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 0 },
    8: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0 },
    9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3 },
    19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3 }
  };

  const halfCasterTable = {
    1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    2: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
    3: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    4: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    5: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    6: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    7: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    8: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    9: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    10: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    11: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    12: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    13: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 0 },
    14: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 0 },
    15: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0 },
    16: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 0 },
    17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }
  };

  const thirdCasterTable = {
    1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    3: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
    4: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    5: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    6: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0 },
    7: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    8: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    9: { 1: 4, 2: 2, 3: 0, 4: 0, 5: 0 },
    10: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    11: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    12: { 1: 4, 2: 3, 3: 0, 4: 0, 5: 0 },
    13: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    14: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    15: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 0 },
    16: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    17: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    18: { 1: 4, 2: 3, 3: 3, 4: 0, 5: 0 },
    19: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 0 },
    20: { 1: 4, 2: 3, 3: 3, 4: 1, 5: 0 }
  };

  // Choose the appropriate table based on class casting type
  let powerTable;

  if (characterClass.spellcastingType === 'full') {
    powerTable = fullCasterTable;
  } else if (characterClass.spellcastingType === 'half') {
    powerTable = halfCasterTable;
  } else {
    powerTable = thirdCasterTable;
  }

  // Cap at level 20
  const cappedLevel = Math.min(level, 20);

  return powerTable[cappedLevel];
};

// Enhancement: Character advancement tracking
export const calculateExperienceForLevel = (level: number): number => {
  const experienceTable = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];

  if (level < 1) return 0;
  if (level > 20) return experienceTable[19];

  return experienceTable[level - 1];
};

// Calculate experience needed for next level
export const experienceToNextLevel = (currentLevel: number): number => {
  if (currentLevel >= 20) return 0; // Already max level

  const currentLevelXP = calculateExperienceForLevel(currentLevel);
  const nextLevelXP = calculateExperienceForLevel(currentLevel + 1);

  return nextLevelXP - currentLevelXP;
};

// Validate weapon proficiencies
export const hasWeaponProficiency = (
  character: Character,
  weaponType: string,
  classes: Class[]
): boolean => {
  // Check if any class grants proficiency with this weapon type
  for (const characterClass of classes) {
    if (characterClass.weaponProficiencies?.includes(weaponType)) {
      return true;
    }
  }

  return false;
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

// Calculate starting credits based on class and background
export const calculateStartingCredits = (
  characterClass: Class,
  background: Background,
  rollResult?: number
): number => {
  // Base credits from background
  let credits = background.startingCredits || 0;

  // Add class-based credits (either rolled or average)
  if (rollResult) {
    credits += rollResult;
  } else {
    // Use average class starting credits
    const dieType = characterClass.startingCreditsDie || 4;
    const dieCount = characterClass.startingCreditsMultiplier || 3;

    // Average roll is (dieType + 1) / 2
    const averageRoll = (dieType + 1) / 2;
    credits += Math.floor(averageRoll * dieCount) * 10;
  }

  return credits;
};

// Utility function to check power prerequisites

// Calculate maximum power points available based on character level and casting ability
export const calculateMaxPowerPoints = (
  level: number,
  abilityModifier: number,
  isFull: boolean = true,
  isHalf: boolean = false,
  isThird: boolean = false
): number => {
  // Base power points are level + ability modifier
  let basePoints = level + abilityModifier;

  // Full casters get full points
  if (isFull) {
    return Math.max(1, basePoints);
  }

  // Half casters get half points (min 1)
  if (isHalf) {
    return Math.max(1, Math.floor(basePoints / 2));
  }

  // Third casters get one-third points (min 1)
  if (isThird) {
    return Math.max(1, Math.floor(basePoints / 3));
  }

  // Default to full caster calculation
  return Math.max(1, basePoints);
};