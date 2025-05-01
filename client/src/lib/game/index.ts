
/**
 * Game library for SW5E-specific game logic
 * This file serves as a re-export point for the new structure
 */

// Re-export from sw5e
export { default as SW5E } from '../sw5e/dataProvider';

// These will eventually be moved to dedicated files in this directory
export { default as useCharacterCalculation } from '../sw5e/characterCalculation';
export { default as ObjectiveGenerator } from '../sw5e/ObjectiveGenerator';
export { default as combatManagers } from '../sw5e/combatmanagers';
export { default as dice } from '../sw5e/dice';

// TODO: Move remaining sw5e logic modules to this directory
