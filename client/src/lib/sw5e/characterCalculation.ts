
import { getCharacterLevel, getAbilityModifier, getProficiencyBonus } from './rules';
import { AbilityType } from './abilities';
import { Species } from './species';
import { Class } from './classes';
import { Background } from './backgrounds';

/**
 * Calculates all derived statistics for a character
 * This is a central function that calls other specific calculation functions
 */
export const calculateCharacterStats = (character: any, species?: Species, classes?: Class[], background?: Background) => {
  if (!character || !character.abilityScores) {
    return null;
  }

  const characterLevel = getCharacterLevel(character.classes);
  const proficiencyBonus = getProficiencyBonus(characterLevel);

  // Get ability modifiers for all abilities
  const abilityModifiers = Object.entries(character.abilityScores).reduce((acc, [ability, score]) => {
    acc[ability] = getAbilityModifier(score as number);
    return acc;
  }, {} as Record<string, number>);

  // Calculate other derived statistics
  return {
    level: characterLevel,
    proficiencyBonus,
    abilityModifiers,
    initiative: abilityModifiers.dexterity,
    armorClass: 10 + abilityModifiers.dexterity, // Basic unarmored AC
    passivePerception: 10 + abilityModifiers.wisdom,
    speedDisplay: formatSpeedForDisplay(species?.speed || 30),
    savingThrows: calculateSavingThrows(character.abilityScores, proficiencyBonus, character.savingThrowProficiencies || [])
  };
};

/**
 * Calculate saving throw modifiers for all abilities
 */
const calculateSavingThrows = (
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  savingThrowProficiencies: string[]
) => {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  
  return abilities.reduce((acc, ability) => {
    const score = abilityScores[ability] || 10;
    const modifier = getAbilityModifier(score);
    const isProficient = savingThrowProficiencies.includes(ability);
    
    acc[ability] = modifier + (isProficient ? proficiencyBonus : 0);
    return acc;
  }, {} as Record<string, number>);
};

/**
 * Format speed for display
 */
export const formatSpeedForDisplay = (speed: number): string => {
  return `${speed} ft.`;
};

/**
 * Calculate experience points needed for a level up
 */
export const calculateExperienceForNextLevel = (currentLevel: number, currentExperience: number): number => {
  const experienceThresholds = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];
  
  if (currentLevel >= 20) return 0;
  
  const nextLevelThreshold = experienceThresholds[currentLevel];
  return nextLevelThreshold - currentExperience;
};

/**
 * Check if a character qualifies for level up
 */
export const canLevelUp = (currentLevel: number, currentExperience: number): boolean => {
  if (currentLevel >= 20) return false;
  
  const experienceThresholds = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];
  
  return currentExperience >= experienceThresholds[currentLevel];
};

/**
 * Generate ability score array using the standard array method
 */
export const getStandardAbilityArray = (): number[] => {
  return [15, 14, 13, 12, 10, 8];
};

/**
 * Generate random ability scores using 4d6 drop lowest method
 */
export const generateRandomAbilityScores = (): number[] => {
  const scores: number[] = [];
  
  for (let i = 0; i < 6; i++) {
    // Roll 4d6
    const rolls = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];
    
    // Sort and drop the lowest roll
    rolls.sort((a, b) => a - b);
    rolls.shift();
    
    // Sum the remaining 3 dice
    scores.push(rolls.reduce((sum, roll) => sum + roll, 0));
  }
  
  return scores.sort((a, b) => b - a); // Sort from highest to lowest
};

/**
 * Check if a feature is available at the current level
 */
export const isFeatureAvailableAtLevel = (featureLevel: number, characterLevel: number): boolean => {
  return characterLevel >= featureLevel;
};

/**
 * Get the number of ability score improvements available
 */
export const getAvailableASICount = (character: any): number => {
  if (!character || !character.classes) return 0;
  
  return character.classes.reduce((total: number, charClass: any) => {
    // Most classes get ASIs at levels 4, 8, 12, 16, and 19
    const asiLevels = [4, 8, 12, 16, 19];
    const classLevel = charClass.level || 0;
    
    // Count how many ASI levels the character has reached in this class
    const asiCount = asiLevels.filter(level => classLevel >= level).length;
    
    return total + asiCount;
  }, 0);
};
