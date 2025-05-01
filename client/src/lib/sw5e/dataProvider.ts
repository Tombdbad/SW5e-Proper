
import { abilities } from './abilities';
import { classes, CLASSES, getClassById, getClassFeaturesByLevel } from './classes';
import { species, SPECIES, getSpeciesById, getSpeciesNames, getSubspeciesBySpeciesId } from './species';
import { backgrounds } from './backgrounds';
import { forcePowers } from './forcePowers';
import { techPowers } from './techPowers';
import { equipment } from './equipment';
import { feats } from './feats';
import { getAbilityModifier, calculateProficiencyBonus } from './rules';
import { skills } from './skills';
import { maneuvers } from './maneuvers';
import { fightingStyles } from './fightingStyles';
import { archetypes } from './archetypes';

// Create rules object based on imported functions
const rules = {
  getAbilityModifier,
  calculateProficiencyBonus
};

/**
 * Central provider for all SW5E data
 * This approach ensures we only import data once and make it available consistently
 */
export const SW5E = {
  // Raw data objects
  data: {
    abilities,
    classes,
    species,
    backgrounds,
    forcePowers,
    techPowers,
    equipment,
    feats,
    skills,
    maneuvers,
    fightingStyles,
    archetypes,
  },

  // UI-ready lists
  ui: {
    CLASSES,
    SPECIES,
    getClassNames: () => CLASSES,
    getSpeciesNames,
  },

  // Helper functions
  helpers: {
    getClassById,
    getClassFeaturesByLevel,
    getSpeciesById,
    getSubspeciesBySpeciesId,
    getAbilityModifier,
    calculateProficiencyBonus,
  },

  // Rules
  rules
};

// Export rules to match the import in other files
export { rules };

// Export default for easy import
export default SW5E;
