
/**
 * Shared logic library for SW5E
 * This contains pure logic functions usable on both client and server
 */

// Basic ability score modification
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Calculate proficiency bonus based on level
export function calculateProficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2;
}

// Simple dice roller
export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

// Format speed for display
export function formatSpeed(speed: number, unit: string = 'ft'): string {
  return `${speed} ${unit}`;
}

// Calculate encumbrance
export function calculateEncumbrance(
  weight: number, 
  strength: number
): { encumbered: boolean; heavilyEncumbered: boolean; maxCapacity: number } {
  const maxCapacity = strength * 15;
  const encumberedThreshold = strength * 5;
  const heavilyEncumberedThreshold = strength * 10;
  
  return {
    encumbered: weight > encumberedThreshold,
    heavilyEncumbered: weight > heavilyEncumberedThreshold,
    maxCapacity
  };
}

// Calculate basic armor class
export function calculateArmorClass(
  dexterityModifier: number,
  baseAC: number = 10,
  wearingArmor: boolean = false,
  armorType?: string
): number {
  if (!wearingArmor) {
    return baseAC + dexterityModifier;
  }
  
  // Rules for different armor types
  switch (armorType) {
    case 'light':
      return baseAC + dexterityModifier;
    case 'medium':
      return baseAC + Math.min(dexterityModifier, 2);
    case 'heavy':
      return baseAC; // No dex bonus
    default:
      return baseAC + dexterityModifier;
  }
}

// Calculate passive perception
export function calculatePassivePerception(
  wisdomModifier: number,
  proficient: boolean,
  proficiencyBonus: number,
  hasAdvantage: boolean = false
): number {
  let base = 10 + wisdomModifier;
  if (proficient) {
    base += proficiencyBonus;
  }
  if (hasAdvantage) {
    base += 5;
  }
  return base;
}

/**
 * This file will be expanded as logic is consolidated from:
 * - client/src/lib/sw5e/rules.ts
 * - client/src/lib/sw5e/characterCalculation.ts
 * - client/src/utils/formatSpeed.ts
 * - And other utility functions scattered throughout the codebase
 */
