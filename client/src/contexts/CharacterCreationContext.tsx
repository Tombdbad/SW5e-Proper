
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AbilityScores } from '@/lib/sw5e/rules';

// Define types for character creation state
interface CharacterCreationState {
  // Basic information
  name: string;
  gender: string;
  age: number;
  alignment: string;

  // Core attributes
  species: string | null;
  class: string | null;
  level: number;
  background: string | null;
  archetype: string | null;

  // Abilities
  abilityScores: AbilityScores;

  // Skills
  skillProficiencies: string[];
  savingThrowProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];

  // Powers
  selectedForcePowers: string[];
  selectedTechPowers: string[];
  availablePowerPoints: number;
  maxPowerLevel: number;

  // Equipment and resources
  equipment: string[];
  weapons: string[];
  armor: string | null;
  credits: number;

  // Character development
  feats: string[];
  traits: string[];

  // Backstory
  backstory: string;
  personality: {
    traits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  };

  // Derived stats
  hitPoints: number;
  armorClass: number;
  speed: number;
  initiative: number;
  proficiencyBonus: number;
}

// Define possible actions for the reducer
type CharacterCreationAction =
  // Basic information actions
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_GENDER'; gender: string }
  | { type: 'SET_AGE'; age: number }
  | { type: 'SET_ALIGNMENT'; alignment: string }

  // Core attributes actions
  | { type: 'SET_SPECIES'; species: string }
  | { type: 'SET_CLASS'; class: string }
  | { type: 'SET_LEVEL'; level: number }
  | { type: 'SET_BACKGROUND'; background: string }
  | { type: 'SET_ARCHETYPE'; archetype: string }

  // Abilities actions
  | { type: 'SET_ABILITY_SCORE'; ability: keyof AbilityScores; score: number }
  | { type: 'SET_ALL_ABILITY_SCORES'; scores: AbilityScores }

  // Skills actions
  | { type: 'ADD_SKILL_PROFICIENCY'; skill: string }
  | { type: 'REMOVE_SKILL_PROFICIENCY'; skill: string }
  | { type: 'SET_SKILL_PROFICIENCIES'; skills: string[] }
  | { type: 'ADD_SAVING_THROW_PROFICIENCY'; savingThrow: string }
  | { type: 'REMOVE_SAVING_THROW_PROFICIENCY'; savingThrow: string }
  | { type: 'SET_SAVING_THROW_PROFICIENCIES'; savingThrows: string[] }
  | { type: 'ADD_TOOL_PROFICIENCY'; tool: string }
  | { type: 'REMOVE_TOOL_PROFICIENCY'; tool: string }
  | { type: 'ADD_LANGUAGE'; language: string }
  | { type: 'REMOVE_LANGUAGE'; language: string }
  | { type: 'SET_LANGUAGES'; languages: string[] }

  // Powers actions
  | { type: 'ADD_FORCE_POWER'; powerId: string }
  | { type: 'REMOVE_FORCE_POWER'; powerId: string }
  | { type: 'ADD_TECH_POWER'; powerId: string }
  | { type: 'REMOVE_TECH_POWER'; powerId: string }
  | { type: 'RESET_POWERS' }
  | { type: 'SET_AVAILABLE_POWER_POINTS'; points: number }
  | { type: 'SET_MAX_POWER_LEVEL'; level: number }

  // Equipment actions
  | { type: 'ADD_EQUIPMENT'; item: string }
  | { type: 'REMOVE_EQUIPMENT'; item: string }
  | { type: 'SET_EQUIPMENT'; items: string[] }
  | { type: 'ADD_WEAPON'; weapon: string }
  | { type: 'REMOVE_WEAPON'; weapon: string }
  | { type: 'SET_WEAPONS'; weapons: string[] }
  | { type: 'SET_ARMOR'; armor: string | null }
  | { type: 'SET_CREDITS'; credits: number }

  // Character development actions
  | { type: 'ADD_FEAT'; feat: string }
  | { type: 'REMOVE_FEAT'; feat: string }
  | { type: 'SET_FEATS'; feats: string[] }
  | { type: 'ADD_TRAIT'; trait: string }
  | { type: 'REMOVE_TRAIT'; trait: string }
  | { type: 'SET_TRAITS'; traits: string[] }

  // Backstory actions
  | { type: 'SET_BACKSTORY'; backstory: string }
  | { type: 'ADD_PERSONALITY_TRAIT'; trait: string }
  | { type: 'REMOVE_PERSONALITY_TRAIT'; trait: string }
  | { type: 'ADD_IDEAL'; ideal: string }
  | { type: 'REMOVE_IDEAL'; ideal: string }
  | { type: 'ADD_BOND'; bond: string }
  | { type: 'REMOVE_BOND'; bond: string }
  | { type: 'ADD_FLAW'; flaw: string }
  | { type: 'REMOVE_FLAW'; flaw: string }

  // Derived stats actions
  | { type: 'SET_HIT_POINTS'; hitPoints: number }
  | { type: 'SET_ARMOR_CLASS'; armorClass: number }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_INITIATIVE'; initiative: number }
  | { type: 'SET_PROFICIENCY_BONUS'; bonus: number }

  // Full character actions
  | { type: 'RESET_CHARACTER' }
  | { type: 'IMPORT_CHARACTER'; character: Partial<CharacterCreationState> };

// Define the context type
interface CharacterCreationContextType {
  state: CharacterCreationState;
  dispatch: React.Dispatch<CharacterCreationAction>;
}

// Initial state
const initialState: CharacterCreationState = {
  // Basic information
  name: '',
  gender: '',
  age: 25,
  alignment: 'Neutral',

  // Core attributes
  species: null,
  class: null,
  level: 1,
  background: null,
  archetype: null,

  // Abilities
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },

  // Skills
  skillProficiencies: [],
  savingThrowProficiencies: [],
  toolProficiencies: [],
  languages: ['Basic'],

  // Powers
  selectedForcePowers: [],
  selectedTechPowers: [],
  availablePowerPoints: 0,
  maxPowerLevel: 0,

  // Equipment and resources
  equipment: [],
  weapons: [],
  armor: null,
  credits: 1000,

  // Character development
  feats: [],
  traits: [],

  // Backstory
  backstory: '',
  personality: {
    traits: [],
    ideals: [],
    bonds: [],
    flaws: [],
  },

  // Derived stats
  hitPoints: 0,
  armorClass: 10,
  speed: 30,
  initiative: 0,
  proficiencyBonus: 2,
};

// Create context with default value
const CharacterCreationContext = createContext<CharacterCreationContextType | undefined>(undefined);

// Reducer function to handle state updates
function characterCreationReducer(
  state: CharacterCreationState,
  action: CharacterCreationAction
): CharacterCreationState {
  switch (action.type) {
    // Basic information
    case 'SET_NAME':
      return { ...state, name: action.name };
    case 'SET_GENDER':
      return { ...state, gender: action.gender };
    case 'SET_AGE':
      return { ...state, age: action.age };
    case 'SET_ALIGNMENT':
      return { ...state, alignment: action.alignment };

    // Core attributes
    case 'SET_SPECIES':
      return { ...state, species: action.species };
    case 'SET_CLASS':
      return { ...state, class: action.class };
    case 'SET_LEVEL':
      return { ...state, level: action.level };
    case 'SET_BACKGROUND':
      return { ...state, background: action.background };
    case 'SET_ARCHETYPE':
      return { ...state, archetype: action.archetype };

    // Abilities
    case 'SET_ABILITY_SCORE':
      return {
        ...state,
        abilityScores: {
          ...state.abilityScores,
          [action.ability]: action.score
        }
      };
    case 'SET_ALL_ABILITY_SCORES':
      return { ...state, abilityScores: action.scores };

    // Skills
    case 'ADD_SKILL_PROFICIENCY':
      return {
        ...state,
        skillProficiencies: [...state.skillProficiencies, action.skill]
      };
    case 'REMOVE_SKILL_PROFICIENCY':
      return {
        ...state,
        skillProficiencies: state.skillProficiencies.filter(skill => skill !== action.skill)
      };
    case 'SET_SKILL_PROFICIENCIES':
      return { ...state, skillProficiencies: action.skills };
    case 'ADD_SAVING_THROW_PROFICIENCY':
      return {
        ...state,
        savingThrowProficiencies: [...state.savingThrowProficiencies, action.savingThrow]
      };
    case 'REMOVE_SAVING_THROW_PROFICIENCY':
      return {
        ...state,
        savingThrowProficiencies: state.savingThrowProficiencies.filter(
          save => save !== action.savingThrow
        )
      };
    case 'SET_SAVING_THROW_PROFICIENCIES':
      return { ...state, savingThrowProficiencies: action.savingThrows };
    case 'ADD_TOOL_PROFICIENCY':
      return {
        ...state,
        toolProficiencies: [...state.toolProficiencies, action.tool]
      };
    case 'REMOVE_TOOL_PROFICIENCY':
      return {
        ...state,
        toolProficiencies: state.toolProficiencies.filter(tool => tool !== action.tool)
      };
    case 'ADD_LANGUAGE':
      return {
        ...state,
        languages: [...state.languages, action.language]
      };
    case 'REMOVE_LANGUAGE':
      return {
        ...state,
        languages: state.languages.filter(lang => lang !== action.language)
      };
    case 'SET_LANGUAGES':
      return { ...state, languages: action.languages };

    // Powers
    case 'ADD_FORCE_POWER':
      return {
        ...state,
        selectedForcePowers: [...state.selectedForcePowers, action.powerId],
      };
    case 'REMOVE_FORCE_POWER':
      return {
        ...state,
        selectedForcePowers: state.selectedForcePowers.filter(id => id !== action.powerId),
      };
    case 'ADD_TECH_POWER':
      return {
        ...state,
        selectedTechPowers: [...state.selectedTechPowers, action.powerId],
      };
    case 'REMOVE_TECH_POWER':
      return {
        ...state,
        selectedTechPowers: state.selectedTechPowers.filter(id => id !== action.powerId),
      };
    case 'RESET_POWERS':
      return {
        ...state,
        selectedForcePowers: [],
        selectedTechPowers: [],
      };
    case 'SET_AVAILABLE_POWER_POINTS':
      return {
        ...state,
        availablePowerPoints: action.points,
      };
    case 'SET_MAX_POWER_LEVEL':
      return {
        ...state,
        maxPowerLevel: action.level,
      };

    // Equipment
    case 'ADD_EQUIPMENT':
      return {
        ...state,
        equipment: [...state.equipment, action.item]
      };
    case 'REMOVE_EQUIPMENT':
      return {
        ...state,
        equipment: state.equipment.filter(item => item !== action.item)
      };
    case 'SET_EQUIPMENT':
      return { ...state, equipment: action.items };
    case 'ADD_WEAPON':
      return {
        ...state,
        weapons: [...state.weapons, action.weapon]
      };
    case 'REMOVE_WEAPON':
      return {
        ...state,
        weapons: state.weapons.filter(weapon => weapon !== action.weapon)
      };
    case 'SET_WEAPONS':
      return { ...state, weapons: action.weapons };
    case 'SET_ARMOR':
      return { ...state, armor: action.armor };
    case 'SET_CREDITS':
      return { ...state, credits: action.credits };

    // Character development
    case 'ADD_FEAT':
      return {
        ...state,
        feats: [...state.feats, action.feat]
      };
    case 'REMOVE_FEAT':
      return {
        ...state,
        feats: state.feats.filter(feat => feat !== action.feat)
      };
    case 'SET_FEATS':
      return { ...state, feats: action.feats };
    case 'ADD_TRAIT':
      return {
        ...state,
        traits: [...state.traits, action.trait]
      };
    case 'REMOVE_TRAIT':
      return {
        ...state,
        traits: state.traits.filter(trait => trait !== action.trait)
      };
    case 'SET_TRAITS':
      return { ...state, traits: action.traits };

    // Backstory
    case 'SET_BACKSTORY':
      return { ...state, backstory: action.backstory };
    case 'ADD_PERSONALITY_TRAIT':
      return {
        ...state,
        personality: {
          ...state.personality,
          traits: [...state.personality.traits, action.trait]
        }
      };
    case 'REMOVE_PERSONALITY_TRAIT':
      return {
        ...state,
        personality: {
          ...state.personality,
          traits: state.personality.traits.filter(trait => trait !== action.trait)
        }
      };
    case 'ADD_IDEAL':
      return {
        ...state,
        personality: {
          ...state.personality,
          ideals: [...state.personality.ideals, action.ideal]
        }
      };
    case 'REMOVE_IDEAL':
      return {
        ...state,
        personality: {
          ...state.personality,
          ideals: state.personality.ideals.filter(ideal => ideal !== action.ideal)
        }
      };
    case 'ADD_BOND':
      return {
        ...state,
        personality: {
          ...state.personality,
          bonds: [...state.personality.bonds, action.bond]
        }
      };
    case 'REMOVE_BOND':
      return {
        ...state,
        personality: {
          ...state.personality,
          bonds: state.personality.bonds.filter(bond => bond !== action.bond)
        }
      };
    case 'ADD_FLAW':
      return {
        ...state,
        personality: {
          ...state.personality,
          flaws: [...state.personality.flaws, action.flaw]
        }
      };
    case 'REMOVE_FLAW':
      return {
        ...state,
        personality: {
          ...state.personality,
          flaws: state.personality.flaws.filter(flaw => flaw !== action.flaw)
        }
      };

    // Derived stats
    case 'SET_HIT_POINTS':
      return { ...state, hitPoints: action.hitPoints };
    case 'SET_ARMOR_CLASS':
      return { ...state, armorClass: action.armorClass };
    case 'SET_SPEED':
      return { ...state, speed: action.speed };
    case 'SET_INITIATIVE':
      return { ...state, initiative: action.initiative };
    case 'SET_PROFICIENCY_BONUS':
      return { ...state, proficiencyBonus: action.bonus };

    // Full character actions
    case 'RESET_CHARACTER':
      return initialState;
    case 'IMPORT_CHARACTER':
      return { ...state, ...action.character };

    default:
      return state;
  }
}

// Provider component
export function CharacterCreationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(characterCreationReducer, initialState);

  return (
    <CharacterCreationContext.Provider value={{ state, dispatch }}>
      {children}
    </CharacterCreationContext.Provider>
  );
}

// Custom hook for consuming the context
export function useCharacterCreation() {
  const context = useContext(CharacterCreationContext);

  if (context === undefined) {
    throw new Error('useCharacterCreation must be used within a CharacterCreationProvider');
  }

  return context;
}
