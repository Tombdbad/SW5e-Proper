
import { Character, DerivedCharacterState } from "./useCharacterStore";
import { createSelector } from 'reselect';

/**
 * This file contains memoized selectors for the character store
 * to optimize performance by preventing unnecessary rerenders.
 */

// Basic selectors
export const selectCharacters = (state: { characters: Record<string, Character> }) => 
  state.characters;

export const selectActiveCharacterId = (state: { activeCharacterId: string | null }) => 
  state.activeCharacterId;

// Memoized selectors using reselect
export const selectActiveCharacter = createSelector(
  [selectCharacters, selectActiveCharacterId],
  (characters, activeCharacterId) => 
    activeCharacterId ? characters[activeCharacterId] : null
);

export const selectDerivedStats = (state: { derived: DerivedCharacterState | null }) => 
  state.derived;

export const selectIsLoading = (state: { isLoading: boolean }) => 
  state.isLoading;

export const selectError = (state: { error: string | null }) => 
  state.error;

// Character selectors with memoization
export const makeSelectCharacterById = (id: string) => 
  createSelector(
    [selectCharacters],
    (characters) => characters[id]
  );

export const makeSelectCharacterAbilityScores = (id: string) => 
  createSelector(
    [makeSelectCharacterById(id)],
    (character) => character?.abilityScores
  );

export const makeSelectCharacterClasses = (id: string) => 
  createSelector(
    [makeSelectCharacterById(id)],
    (character) => character?.classes
  );

export const makeSelectCharacterPowers = (id: string) => 
  createSelector(
    [makeSelectCharacterById(id)],
    (character) => character?.powers
  );

export const makeSelectCharacterEquipment = (id: string) => 
  createSelector(
    [makeSelectCharacterById(id)],
    (character) => character?.equipment
  );

// Derived stats selectors
export const selectAbilityModifiers = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.abilityModifiers
);

export const selectProficiencyBonus = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.proficiencyBonus
);

export const selectSkillModifiers = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.skillModifiers
);

export const selectArmorClass = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.armorClass
);

export const selectInitiative = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.initiative
);

export const selectHitPointsMaximum = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.hitPointsMaximum
);

export const selectForcePoints = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.forcePoints
);

export const selectTechPoints = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.techPoints
);

export const selectMaxPowerLevel = createSelector(
  [selectDerivedStats],
  (derivedStats) => derivedStats?.maxPowerLevel
);

// History selectors
export const selectCanUndo = (state: { history: { past: any[] } }) => 
  state.history.past.length > 0;

export const selectCanRedo = (state: { history: { future: any[] } }) => 
  state.history.future.length > 0;

export const selectHistoryTracking = (state: { history: { tracking: boolean } }) => 
  state.history.tracking;

// List selectors with computed properties
export const selectCharactersList = createSelector(
  [selectCharacters],
  (characters) => 
    Object.values(characters).map(character => ({
      id: character.id,
      name: character.name,
      species: character.species,
      class: character.class,
      level: character.level,
      updatedAt: character.updatedAt,
    }))
);

export const makeSelectCharacterSummary = (id: string) => 
  createSelector(
    [makeSelectCharacterById(id)],
    (character) => {
      if (!character) return null;
      
      return {
        id: character.id,
        name: character.name,
        species: character.species,
        class: character.class,
        level: character.level,
        abilities: character.abilityScores,
        powerCount: character.powers.length,
        equipmentCount: character.equipment.length,
        version: character.version,
        lastUpdated: character.updatedAt
      };
    }
  );

// Performance optimization selectors
export const selectIsForceCaster = createSelector(
  [selectActiveCharacter],
  (character) => {
    if (!character) return false;
    const forceClasses = ["consular", "guardian", "sentinel"];
    return forceClasses.includes(character.class.toLowerCase());
  }
);

export const selectIsTechCaster = createSelector(
  [selectActiveCharacter],
  (character) => {
    if (!character) return false;
    const techClasses = ["engineer", "scholar", "scout"];
    return techClasses.includes(character.class.toLowerCase());
  }
);

// Create a selector to filter powers by type
export const makeSelectPowersByType = (type: 'force' | 'tech') => 
  createSelector(
    [selectActiveCharacter],
    (character) => 
      character?.powers?.filter(power => power.type === type) || []
  );

// Create a selector for equipment by category
export const makeSelectEquipmentByCategory = (category: string) => 
  createSelector(
    [selectActiveCharacter],
    (character) => 
      character?.equipment?.filter(item => item.type === category) || []
  );

// Debugging selector that logs renders when used
export const createDebugSelector = <T,>(
  selector: (state: any) => T,
  name: string
) => {
  return (state: any) => {
    const value = selector(state);
    console.log(`[Debug Selector] ${name} rendered`, value);
    return value;
  };
};
