
import { Character, DerivedCharacterState } from "./useCharacterStore";

/**
 * This file contains memoized selectors for the character store
 * to optimize performance by preventing unnecessary rerenders.
 */

// Basic selectors
export const selectCharacters = (state: { characters: Record<string, Character> }) => 
  state.characters;

export const selectActiveCharacterId = (state: { activeCharacterId: string | null }) => 
  state.activeCharacterId;

export const selectActiveCharacter = (state: { 
  characters: Record<string, Character>;
  activeCharacterId: string | null;
}) => 
  state.activeCharacterId ? state.characters[state.activeCharacterId] : null;

export const selectDerivedStats = (state: { derived: DerivedCharacterState | null }) => 
  state.derived;

export const selectIsLoading = (state: { isLoading: boolean }) => 
  state.isLoading;

export const selectError = (state: { error: string | null }) => 
  state.error;

// Character selectors
export const selectCharacterById = (id: string) => 
  (state: { characters: Record<string, Character> }) => 
    state.characters[id];

export const selectCharacterAbilityScores = (id: string) => 
  (state: { characters: Record<string, Character> }) => 
    state.characters[id]?.abilityScores;

export const selectCharacterClasses = (id: string) => 
  (state: { characters: Record<string, Character> }) => 
    state.characters[id]?.classes;

export const selectCharacterPowers = (id: string) => 
  (state: { characters: Record<string, Character> }) => 
    state.characters[id]?.powers;

export const selectCharacterEquipment = (id: string) => 
  (state: { characters: Record<string, Character> }) => 
    state.characters[id]?.equipment;

// Derived stats selectors
export const selectAbilityModifiers = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.abilityModifiers;

export const selectProficiencyBonus = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.proficiencyBonus;

export const selectSkillModifiers = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.skillModifiers;

export const selectArmorClass = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.armorClass;

export const selectInitiative = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.initiative;

export const selectHitPointsMaximum = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.hitPointsMaximum;

export const selectForcePoints = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.forcePoints;

export const selectTechPoints = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.techPoints;

export const selectMaxPowerLevel = (state: { derived: DerivedCharacterState | null }) => 
  state.derived?.maxPowerLevel;

// History selectors
export const selectCanUndo = (state: { history: { past: any[] } }) => 
  state.history.past.length > 0;

export const selectCanRedo = (state: { history: { future: any[] } }) => 
  state.history.future.length > 0;

export const selectHistoryTracking = (state: { history: { tracking: boolean } }) => 
  state.history.tracking;

// List selectors with computed properties
export const selectCharactersList = (state: { characters: Record<string, Character> }) => 
  Object.values(state.characters).map(character => ({
    id: character.id,
    name: character.name,
    species: character.species,
    class: character.class,
    level: character.level,
    updatedAt: character.updatedAt,
  }));

export const selectCharacterSummary = (id: string) => 
  (state: { characters: Record<string, Character> }) => {
    const character = state.characters[id];
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
    };
  };
