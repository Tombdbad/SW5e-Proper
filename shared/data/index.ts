
/**
 * Shared data library for SW5E
 * This will contain canonical data definitions used by both client and server
 */

// Export types from unifiedSchema for use with this data
export {
  Character,
  Campaign,
  AbilityScores,
  ForcePower,
  TechPower,
  Weapon,
  Armor,
  Multiclass,
  Location,
  NPC,
  Quest,
  QuestObjective,
  Setting,
  CombatState,
  CombatEntity
} from '../unifiedSchema';

// TODO: Move data from client/src/lib/sw5e to this directory

/**
 * This file will be expanded as data is consolidated from:
 * - client/src/lib/sw5e
 * - client/src/lib/data
 * - server/sw5eData.ts
 * 
 * Initially it will just re-export, but eventually the consolidated
 * data will live here directly
 */
