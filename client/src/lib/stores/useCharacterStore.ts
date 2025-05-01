
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { produce } from 'immer';
import { z } from 'zod';
import { getAbilityModifier } from '@/lib/sw5e/rules';

// Type definitions
export interface Character {
  id: string;
  name: string;
  species: string;
  class: string;
  level: number;
  background: string;
  alignment: string;
  abilityScores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  skills: Record<string, boolean>; // Proficient skills
  powers: Array<{
    id: string;
    name: string;
    type: 'force' | 'tech';
    level: number;
    description?: string;
  }>;
  equipment: Array<{
    id: string;
    name: string;
    type: string;
    quantity: number;
  }>;
  credits: number;
  experience: number;
  hitPoints: {
    current: number;
    maximum: number;
    temporary: number;
  };
  personality: {
    traits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
    appearance: string;
    backstory: string;
  };
  notes: string;
  backstory: string;
  classes: Array<{
    id: string;
    name: string;
    level: number;
    archetype?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type CharacterInput = Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'version'>;

export interface DerivedCharacterState {
  abilityModifiers: Record<string, number>;
  proficiencyBonus: number;
  savingThrows: Record<string, number>;
  skillModifiers: Record<string, number>;
  armorClass: number;
  initiative: number;
  hitPointsMaximum: number;
  passivePerception: number;
  forcePoints: number;
  techPoints: number;
  maxPowerLevel: number;
}

export interface CharacterState {
  // Base state
  characters: Record<string, Character>;
  activeCharacterId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Derived state (calculated)
  derived: DerivedCharacterState | null;
  
  // History tracking
  history: {
    past: Array<Record<string, Character>>;
    future: Array<Record<string, Character>>;
    tracking: boolean;
  };
  
  // Actions
  actions: {
    // Character CRUD
    createCharacter: (characterData: Partial<CharacterInput>) => string;
    updateCharacter: (id: string, updates: Partial<Character>) => void;
    deleteCharacter: (id: string) => void;
    setActiveCharacter: (id: string) => void;

    // Character modifications
    updateAbilityScore: (ability: keyof Character['abilityScores'], value: number) => void;
    updatePersonality: (id: string, personalityData: Partial<Character['personality']>) => void;
    addPower: (power: Character['powers'][0]) => void;
    removePower: (powerId: string) => void;
    addEquipment: (item: Character['equipment'][0]) => void;
    removeEquipment: (itemId: string) => void;
    updateEquipmentQuantity: (itemId: string, quantity: number) => void;
    
    // Class management
    addClassLevel: (classId: string) => void;
    removeClassLevel: (classId: string) => void;
    setArchetype: (classId: string, archetype: string) => void;
    
    // History management
    undo: () => void;
    redo: () => void;
    startHistoryTracking: () => void;
    stopHistoryTracking: () => void;
    
    // Misc
    calculateDerivedStats: () => void;
    exportCharacter: (id: string) => string;
    importCharacter: (characterJson: string) => string;
    duplicateCharacter: (id: string) => string;
  };
}

// Initial derived state
const initialDerivedState: DerivedCharacterState = {
  abilityModifiers: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
  proficiencyBonus: 2,
  savingThrows: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
  skillModifiers: {},
  armorClass: 10,
  initiative: 0,
  hitPointsMaximum: 0,
  passivePerception: 10,
  forcePoints: 0,
  techPoints: 0,
  maxPowerLevel: 0,
};

// Create a custom storage with error handling, versioning and multi-tab sync
const createCustomStorage = () => {
  // Check if BroadcastChannel is available for multi-tab sync
  const syncChannel = typeof BroadcastChannel !== 'undefined' 
    ? new BroadcastChannel('sw5e-character-sync')
    : null;
    
  // Listen for changes from other tabs if channel exists
  if (syncChannel) {
    syncChannel.onmessage = (event) => {
      const { action, key, value, source } = event.data;
      
      // Only process messages from other tabs
      if (source !== 'current-tab') {
        console.info('[Storage] Received sync from another tab:', action);
        
        // Dispatch an event for the store to handle
        if (action === 'update') {
          window.dispatchEvent(
            new CustomEvent('sw5e-storage-update', { 
              detail: { key, value } 
            })
          );
        }
      }
    };
  }

  return {
    getItem: (name: string) => {
      try {
        const value = localStorage.getItem(name);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Error retrieving from storage:', error);
        return null;
      }
    },
    setItem: (name: string, value: unknown) => {
      try {
        // Add version metadata to storage
        const valueWithMeta = {
          data: value,
          version: Date.now(),
          lastUpdated: new Date().toISOString()
        };
        
        localStorage.setItem(name, JSON.stringify(valueWithMeta));
        
        // Notify other tabs if channel exists
        if (syncChannel) {
          syncChannel.postMessage({
            action: 'update',
            key: name,
            value: valueWithMeta,
            source: 'current-tab'
          });
        }
      } catch (error) {
        console.error('Error saving to storage:', error);
      }
    },
    removeItem: (name: string) => {
      try {
        localStorage.removeItem(name);
        
        // Notify other tabs if channel exists
        if (syncChannel) {
          syncChannel.postMessage({
            action: 'remove',
            key: name,
            source: 'current-tab'
          });
        }
      } catch (error) {
        console.error('Error removing from storage:', error);
      }
    },
  };
};

// Calculate derived state
const calculateDerivedState = (character: Character | null): DerivedCharacterState => {
  if (!character) {
    return initialDerivedState;
  }

  // Calculate ability modifiers
  const abilityModifiers = Object.entries(character.abilityScores).reduce(
    (acc, [ability, score]) => {
      acc[ability] = getAbilityModifier(score);
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate proficiency bonus based on level
  const characterLevel = character.level;
  const proficiencyBonus = Math.ceil(1 + characterLevel / 4);

  // Calculate saving throws (base ability modifier + proficiency if proficient)
  const savingThrows = { ...abilityModifiers };

  // Calculate skill modifiers
  const skillModifiers: Record<string, number> = {
    // These are examples, populate with all SW5E skills
    acrobatics: abilityModifiers.dexterity + (character.skills.acrobatics ? proficiencyBonus : 0),
    athletics: abilityModifiers.strength + (character.skills.athletics ? proficiencyBonus : 0),
    deception: abilityModifiers.charisma + (character.skills.deception ? proficiencyBonus : 0),
    // ...other skills
  };

  // Calculate armor class (base 10 + DEX mod, not considering armor here)
  const armorClass = 10 + abilityModifiers.dexterity;

  // Calculate initiative
  const initiative = abilityModifiers.dexterity;

  // Calculate max HP (base on class + CON mod per level)
  const conModifier = abilityModifiers.constitution;
  const hitPointsMaximum = calculateHitPointsMaximum(character, conModifier);

  // Passive perception (10 + perception skill modifier)
  const passivePerception = 10 + (skillModifiers.perception || abilityModifiers.wisdom);

  // Calculate force and tech points based on class and level
  const forcePoints = calculateForcePoints(character, abilityModifiers);
  const techPoints = calculateTechPoints(character, abilityModifiers);
  
  // Max power level based on character level
  const maxPowerLevel = Math.min(5, Math.ceil(characterLevel / 4));

  return {
    abilityModifiers,
    proficiencyBonus,
    savingThrows,
    skillModifiers,
    armorClass,
    initiative,
    hitPointsMaximum,
    passivePerception,
    forcePoints,
    techPoints,
    maxPowerLevel,
  };
};

const calculateHitPointsMaximum = (
  character: Character,
  conModifier: number
): number => {
  // This is a placeholder implementation
  // For a real implementation, this would consider class hit dice
  const baseHp = 8; // Default base HP
  return baseHp + conModifier * character.level;
};

const calculateForcePoints = (
  character: Character,
  abilityModifiers: Record<string, number>
): number => {
  // Placeholder implementation
  // For a real implementation, this would check if the class can use Force powers
  const forceClasses = ["consular", "guardian", "sentinel"];
  if (forceClasses.includes(character.class.toLowerCase())) {
    return character.level + abilityModifiers.wisdom;
  }
  return 0;
};

const calculateTechPoints = (
  character: Character,
  abilityModifiers: Record<string, number>
): number => {
  // Placeholder implementation
  // For a real implementation, this would check if the class can use Tech powers
  const techClasses = ["engineer", "scholar", "scout"];
  if (techClasses.includes(character.class.toLowerCase())) {
    return character.level + abilityModifiers.intelligence;
  }
  return 0;
};

// Character Validation Schema
const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  class: z.string().min(1, "Class is required"),
  level: z.number().int().min(1).max(20),
  background: z.string(),
  alignment: z.string(),
  abilityScores: z.object({
    strength: z.number().int().min(3).max(20),
    dexterity: z.number().int().min(3).max(20),
    constitution: z.number().int().min(3).max(20),
    intelligence: z.number().int().min(3).max(20),
    wisdom: z.number().int().min(3).max(20),
    charisma: z.number().int().min(3).max(20),
  }),
  // Add more validations as needed
});

const validateCharacter = (character: Character): boolean => {
  try {
    CharacterSchema.parse(character);
    return true;
  } catch (error) {
    console.error("Character validation failed:", error);
    return false;
  }
};

// Default character template
const getDefaultCharacter = (): Partial<Character> => ({
  name: "",
  species: "",
  class: "",
  level: 1,
  background: "",
  alignment: "",
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  skills: {},
  powers: [],
  equipment: [],
  credits: 0,
  experience: 0,
  hitPoints: {
    current: 0,
    maximum: 0,
    temporary: 0,
  },
  personality: {
    traits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    appearance: "",
    backstory: ""
  },
  notes: "",
  backstory: "",
  classes: [],
});

// Create the store
const useCharacterStore = create<CharacterState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        characters: {},
        activeCharacterId: null,
        isLoading: false,
        error: null,
        derived: null,
        history: {
          past: [],
          future: [],
          tracking: true,
        },

        // Actions
        actions: {
          // Character CRUD operations
          createCharacter: (characterData) => {
            const id = uuidv4();
            const now = new Date().toISOString();
            
            const newCharacter: Character = {
              ...getDefaultCharacter(),
              ...characterData,
              id,
              createdAt: now,
              updatedAt: now,
              version: 1,
            } as Character;

            // Validate before adding
            if (!validateCharacter(newCharacter)) {
              set(state => {
                state.error = "Invalid character data";
              });
              return id;
            }

            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Add character to state
              state.characters[id] = newCharacter;
              
              // If this is the first character, make it active
              if (!state.activeCharacterId) {
                state.activeCharacterId = id;
              }
              
              state.error = null;
            });
            
            // Calculate derived stats for the new character
            if (get().activeCharacterId === id) {
              get().actions.calculateDerivedStats();
            }
            
            return id;
          },
          
          updateCharacter: (id, updates) => {
            const { characters, activeCharacterId } = get();
            
            if (!characters[id]) {
              set(state => { state.error = `Character with ID ${id} not found`; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Update the character
              state.characters[id] = {
                ...state.characters[id],
                ...updates,
                updatedAt: new Date().toISOString(),
                version: state.characters[id].version + 1,
              };
              
              state.error = null;
            });
            
            // Recalculate derived stats if this is the active character
            if (activeCharacterId === id) {
              get().actions.calculateDerivedStats();
            }
          },
          
          deleteCharacter: (id) => {
            const { characters, activeCharacterId } = get();
            
            if (!characters[id]) {
              set(state => { state.error = `Character with ID ${id} not found`; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Delete the character
              const newCharacters = { ...state.characters };
              delete newCharacters[id];
              state.characters = newCharacters;
              
              // If the active character was deleted, set a new active character
              if (state.activeCharacterId === id) {
                const characterIds = Object.keys(state.characters);
                state.activeCharacterId = characterIds.length > 0 ? characterIds[0] : null;
                // Recalculate derived stats for the new active character
                if (state.activeCharacterId) {
                  state.derived = calculateDerivedState(state.characters[state.activeCharacterId]);
                } else {
                  state.derived = null;
                }
              }
              
              state.error = null;
            });
          },
          
          setActiveCharacter: (id) => {
            const { characters } = get();
            
            if (!characters[id]) {
              set(state => { state.error = `Character with ID ${id} not found`; });
              return;
            }
            
            set(state => {
              state.activeCharacterId = id;
              state.derived = calculateDerivedState(state.characters[id]);
              state.error = null;
            });
          },
          
          // Character modifications
          updateAbilityScore: (ability, value) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Update the ability score
              state.characters[activeCharacterId].abilityScores[ability] = value;
              state.characters[activeCharacterId].updatedAt = new Date().toISOString();
              state.characters[activeCharacterId].version += 1;
              
              // Recalculate derived stats
              state.derived = calculateDerivedState(state.characters[activeCharacterId]);
              
              state.error = null;
            });
          },
          
          addPower: (power) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Add the power
              state.characters[activeCharacterId].powers.push(power);
              state.characters[activeCharacterId].updatedAt = new Date().toISOString();
              state.characters[activeCharacterId].version += 1;
              
              state.error = null;
            });
          },
          
          removePower: (powerId) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Remove the power
              const character = state.characters[activeCharacterId];
              character.powers = character.powers.filter(p => p.id !== powerId);
              character.updatedAt = new Date().toISOString();
              character.version += 1;
              
              state.error = null;
            });
          },
          
          addEquipment: (item) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Check if item already exists and update quantity
              const character = state.characters[activeCharacterId];
              const existingItemIndex = character.equipment.findIndex(e => e.id === item.id);
              
              if (existingItemIndex >= 0) {
                character.equipment[existingItemIndex].quantity += item.quantity;
              } else {
                character.equipment.push(item);
              }
              
              character.updatedAt = new Date().toISOString();
              character.version += 1;
              
              state.error = null;
            });
          },
          
          removeEquipment: (itemId) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Remove the item
              const character = state.characters[activeCharacterId];
              character.equipment = character.equipment.filter(e => e.id !== itemId);
              character.updatedAt = new Date().toISOString();
              character.version += 1;
              
              state.error = null;
            });
          },
          
          updateEquipmentQuantity: (itemId, quantity) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Update the quantity or remove if quantity is 0
              const character = state.characters[activeCharacterId];
              const itemIndex = character.equipment.findIndex(e => e.id === itemId);
              
              if (itemIndex >= 0) {
                if (quantity <= 0) {
                  character.equipment = character.equipment.filter(e => e.id !== itemId);
                } else {
                  character.equipment[itemIndex].quantity = quantity;
                }
                
                character.updatedAt = new Date().toISOString();
                character.version += 1;
                  }

                  state.error = null;
                });
              },

              updatePersonality: (id, personalityData) => {
                const { characters } = get();

                if (!characters[id]) {
                  set(state => { state.error = `Character with ID ${id} not found`; });
                  return;
                }

                set(state => {
                  // Add to history if tracking is enabled
                  if (state.history.tracking) {
                    state.history.past.push({ ...state.characters });
                    state.history.future = [];
                  }

                  // Update the character's personality
                  const character = state.characters[id];
                  const currentPersonality = character.personality || {
                    traits: [],
                    ideals: [],
                    bonds: [],
                    flaws: [],
                    appearance: '',
                    backstory: ''
                  };

                  character.personality = {
                    ...currentPersonality,
                    ...personalityData
                  };

                  // If backstory is provided in personality data, update the character's backstory as well
                  if (personalityData.backstory) {
                    character.backstory = personalityData.backstory;
                  }

                  character.updatedAt = new Date().toISOString();
                  character.version += 1;

                  state.error = null;
            });
          },
          
          // Class management
          addClassLevel: (classId) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Add or update the class level
              const character = state.characters[activeCharacterId];
              const classIndex = character.classes.findIndex(c => c.id === classId);
              
              if (classIndex >= 0) {
                character.classes[classIndex].level += 1;
              } else {
                // Add new class (assuming classId is the name for simplicity)
                character.classes.push({
                  id: classId,
                  name: classId, // This should be replaced with actual class name lookup
                  level: 1,
                });
              }
              
              // Update total character level
              character.level = character.classes.reduce((sum, cls) => sum + cls.level, 0);
              character.updatedAt = new Date().toISOString();
              character.version += 1;
              
              // Recalculate derived stats
              state.derived = calculateDerivedState(character);
              
              state.error = null;
            });
          },
          
          removeClassLevel: (classId) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Remove a level from the class
              const character = state.characters[activeCharacterId];
              const classIndex = character.classes.findIndex(c => c.id === classId);
              
              if (classIndex >= 0) {
                if (character.classes[classIndex].level > 1) {
                  character.classes[classIndex].level -= 1;
                } else {
                  character.classes = character.classes.filter(c => c.id !== classId);
                }
                
                // Update total character level
                character.level = character.classes.reduce((sum, cls) => sum + cls.level, 0);
                character.updatedAt = new Date().toISOString();
                character.version += 1;
                
                // Recalculate derived stats
                state.derived = calculateDerivedState(character);
              }
              
              state.error = null;
            });
          },
          
          setArchetype: (classId, archetype) => {
            const { activeCharacterId } = get();
            
            if (!activeCharacterId) {
              set(state => { state.error = "No active character selected"; });
              return;
            }
            
            set(state => {
              // Add to history if tracking is enabled
              if (state.history.tracking) {
                state.history.past.push({ ...state.characters });
                state.history.future = [];
              }
              
              // Set the archetype for the class
              const character = state.characters[activeCharacterId];
              const classIndex = character.classes.findIndex(c => c.id === classId);
              
              if (classIndex >= 0) {
                character.classes[classIndex].archetype = archetype;
                character.updatedAt = new Date().toISOString();
                character.version += 1;
              }
              
              state.error = null;
            });
          },
          
          // History management
          undo: () => {
            const { history, activeCharacterId } = get();
            
            if (history.past.length === 0) {
              return;
            }
            
            set(state => {
              // Get the last state from the past
              const previous = history.past[history.past.length - 1];
              const newPast = history.past.slice(0, -1);
              
              // Save current state to future
              state.history.future = [{ ...state.characters }, ...state.history.future];
              
              // Restore the previous state
              state.characters = previous;
              state.history.past = newPast;
              
              // Recalculate derived stats for the active character
              if (state.activeCharacterId && state.characters[state.activeCharacterId]) {
                state.derived = calculateDerivedState(state.characters[state.activeCharacterId]);
              } else if (activeCharacterId && state.characters[activeCharacterId]) {
                state.activeCharacterId = activeCharacterId;
                state.derived = calculateDerivedState(state.characters[activeCharacterId]);
              } else {
                const characterIds = Object.keys(state.characters);
                state.activeCharacterId = characterIds.length > 0 ? characterIds[0] : null;
                state.derived = state.activeCharacterId 
                  ? calculateDerivedState(state.characters[state.activeCharacterId]) 
                  : null;
              }
            });
          },
          
          redo: () => {
            const { history } = get();
            
            if (history.future.length === 0) {
              return;
            }
            
            set(state => {
              // Get the first state from the future
              const next = history.future[0];
              const newFuture = history.future.slice(1);
              
              // Save current state to past
              state.history.past = [...state.history.past, { ...state.characters }];
              
              // Restore the next state
              state.characters = next;
              state.history.future = newFuture;
              
              // Recalculate derived stats for the active character
              if (state.activeCharacterId && state.characters[state.activeCharacterId]) {
                state.derived = calculateDerivedState(state.characters[state.activeCharacterId]);
              } else {
                const characterIds = Object.keys(state.characters);
                state.activeCharacterId = characterIds.length > 0 ? characterIds[0] : null;
                state.derived = state.activeCharacterId 
                  ? calculateDerivedState(state.characters[state.activeCharacterId]) 
                  : null;
              }
            });
          },
          
          startHistoryTracking: () => {
            set(state => {
              state.history.tracking = true;
            });
          },
          
          stopHistoryTracking: () => {
            set(state => {
              state.history.tracking = false;
            });
          },
          
          // Recalculate derived stats
          calculateDerivedStats: () => {
            const { activeCharacterId, characters } = get();
            
            if (!activeCharacterId || !characters[activeCharacterId]) {
              set(state => { 
                state.derived = null;
                state.error = "No active character to calculate stats for";
              });
              return;
            }
            
            const character = characters[activeCharacterId];
            const derivedStats = calculateDerivedState(character);
            
            set(state => {
              state.derived = derivedStats;
              
              // Update character's hitPoints.maximum based on calculated value
              if (state.characters[activeCharacterId].hitPoints.maximum !== derivedStats.hitPointsMaximum) {
                state.characters[activeCharacterId].hitPoints.maximum = derivedStats.hitPointsMaximum;
                
                // If current HP is not set or greater than max, set it to max
                if (!state.characters[activeCharacterId].hitPoints.current || 
                    state.characters[activeCharacterId].hitPoints.current > derivedStats.hitPointsMaximum) {
                  state.characters[activeCharacterId].hitPoints.current = derivedStats.hitPointsMaximum;
                }
              }
            });
          },
          
          // Import/Export
          exportCharacter: (id) => {
            const { characters } = get();
            
            if (!characters[id]) {
              set(state => { state.error = `Character with ID ${id} not found`; });
              return '';
            }
            
            try {
              const character = characters[id];
              
              // Create an export schema with metadata for versioning
              const exportData = {
                schemaVersion: "1.0",
                exportDate: new Date().toISOString(),
                character: character,
                applicationName: "SW5E Character Creator"
              };
              
              return JSON.stringify(exportData, null, 2);
            } catch (error) {
              console.error('Error exporting character:', error);
              set(state => { state.error = 'Failed to export character'; });
              return '';
            }
          },
          
          importCharacter: (characterJson) => {
            try {
              // Define schema for character exports
              const importSchema = z.object({
                schemaVersion: z.string().optional(),
                exportDate: z.string().optional(),
                applicationName: z.string().optional(),
                character: CharacterSchema
              }).or(CharacterSchema);
              
              // Parse and validate the imported JSON
              const parsedData = JSON.parse(characterJson);
              
              let character: Character;
              
              // Handle both direct character objects and wrapped exports
              if (parsedData.character) {
                // This is a wrapped export with metadata
                const validatedImport = importSchema.parse(parsedData);
                character = validatedImport.character as Character;
              } else {
                // This is a direct character object
                character = CharacterSchema.parse(parsedData) as Character;
              }
              
              // Generate a new ID for the import to avoid collisions
              const id = uuidv4();
              character.id = id;
              character.updatedAt = new Date().toISOString();
              character.version = (character.version || 0) + 1;
              
              set(state => {
                // Add to history if tracking is enabled
                if (state.history.tracking) {
                  state.history.past.push({ ...state.characters });
                  state.history.future = [];
                }
                
                // Add the imported character
                state.characters[id] = character;
                state.error = null;
              });
              
              return id;
            } catch (error) {
              console.error('Error importing character:', error);
              
              // Provide more specific error messages for validation failures
              if (error instanceof z.ZodError) {
                const errorMessage = error.errors.map(e => 
                  `${e.path.join('.')}: ${e.message}`
                ).join(', ');
                
                set(state => { 
                  state.error = `Invalid character data: ${errorMessage}`; 
                });
              } else {
                set(state => { 
                  state.error = 'Failed to import character: Invalid data format'; 
                });
              }
              
              return '';
            }
          },
          
          duplicateCharacter: (id) => {
            const { characters } = get();
            
            if (!characters[id]) {
              set(state => { state.error = `Character with ID ${id} not found`; });
              return '';
            }
            
            try {
              // Create a copy of the character with a new ID
              const originalCharacter = characters[id];
              const newId = uuidv4();
              const now = new Date().toISOString();
              
              const duplicatedCharacter: Character = {
                ...JSON.parse(JSON.stringify(originalCharacter)), // Deep clone
                id: newId,
                name: `${originalCharacter.name} (Copy)`,
                createdAt: now,
                updatedAt: now,
                version: 1,
              };
              
              set(state => {
                // Add to history if tracking is enabled
                if (state.history.tracking) {
                  state.history.past.push({ ...state.characters });
                  state.history.future = [];
                }
                
                // Add the duplicated character
                state.characters[newId] = duplicatedCharacter;
                state.error = null;
              });
              
              return newId;
            } catch (error) {
              console.error('Error duplicating character:', error);
              set(state => { state.error = 'Failed to duplicate character'; });
              return '';
            }
          },
        },
      })),
      {
        name: 'sw5e-character-storage',
        storage: createCustomStorage(),
        partialize: (state) => ({
          characters: state.characters,
          activeCharacterId: state.activeCharacterId,
          // Omit derived state and history which can be recalculated/reinitialized
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Recalculate derived stats for the active character
            if (state.activeCharacterId && state.characters[state.activeCharacterId]) {
              state.derived = calculateDerivedState(state.characters[state.activeCharacterId]);
            }
            // Initialize history
            state.history = {
              past: [],
              future: [],
              tracking: true,
            };
          }
        },
      }
    )
  )
);

export default useCharacterStore;
