
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";
import { produce } from "immer"; // Make sure we use immer directly too
import { devtools } from "zustand/middleware";
import { z } from "zod";
import { createJSONStorage } from "zustand/middleware";
import { idbStorage } from "../stores/persistence";
import { createSelectors } from "../stores/selectors";
import { validateSchema } from "../stores/middleware";
import { calculateModifier, calculateProficiencyBonus } from "../sw5e/rules";
import { apiRequest } from "../queryClient";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";

// Character schema for validation
export const CharacterSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  class: z.string().min(1, "Class is required"),
  subclass: z.string().optional(),
  level: z.number().min(1).max(20).default(1),
  background: z.string().min(1, "Background is required"),
  alignment: z.string().min(1, "Alignment is required"),
  abilityScores: z.object({
    strength: z.number().min(3).max(20),
    dexterity: z.number().min(3).max(20),
    constitution: z.number().min(3).max(20),
    intelligence: z.number().min(3).max(20),
    wisdom: z.number().min(3).max(20),
    charisma: z.number().min(3).max(20),
  }),
  maxHp: z.number().min(1),
  currentHp: z.number().min(0),
  temporaryHp: z.number().min(0).default(0),
  armorClass: z.number().min(1),
  speed: z.number().min(1),
  skillProficiencies: z.array(z.string()),
  savingThrowProficiencies: z.array(z.string()),
  equipment: z.array(z.string()),
  credits: z.number().min(0).default(1000),
  backstory: z.string().optional(),
  notes: z.string().optional(),
  startingLocation: z.string().min(1),
  currentLocation: z.string().optional(),
  experience: z.number().min(0).default(0),
  multiclass: z.array(z.object({
    class: z.string(),
    level: z.number(),
    archetype: z.string().optional(),
  })).optional().default([]),
  forcePowers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    level: z.number(),
    description: z.string(),
  })).optional().default([]),
  techPowers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    level: z.number(),
    description: z.string(),
  })).optional().default([]),
  feats: z.array(z.string()).optional().default([]),
  weapons: z.array(z.any()).optional().default([]),
  armor: z.any().optional(),
  languages: z.array(z.string()).optional().default([]),
  forceAlignment: z.string().optional(),
  maxForcePoints: z.number().min(0).default(0),
  currentForcePoints: z.number().min(0).default(0),
  version: z.number().default(1),
  lastUpdated: z.string().optional(),
  syncStatus: z.enum(["synced", "local", "conflict"]).default("local"),
});

export type Character = z.infer<typeof CharacterSchema>;

export interface CharacterState {
  // Base state
  characters: Record<string, Character>;
  activeCharacterId: string | null;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  
  // History tracking for undo/redo
  history: {
    past: Array<Record<string, Character>>;
    future: Array<Record<string, Character>>;
  };
  
  // Derived state (calculated)
  derived: {
    activeCharacter: Character | null;
    abilityModifiers: Record<string, number>;
    proficiencyBonus: number;
    savingThrows: Record<string, number>;
    skillModifiers: Record<string, number>;
    initiativeBonus: number;
    passivePerception: number;
    spellSaveDC: number;
    spellAttackBonus: number;
    encumbrance: number;
    experienceToNextLevel: number;
  };
  
  // Actions
  actions: {
    // Character CRUD
    createCharacter: (characterData: Partial<Character>) => Promise<Character>;
    loadCharacter: (id: string) => Promise<Character>;
    updateCharacter: (id: string, updates: Partial<Character>) => Promise<Character>;
    deleteCharacter: (id: string) => Promise<void>;
    setActiveCharacter: (id: string | null) => void;
    
    // Ability score management
    updateAbilityScore: (ability: string, value: number) => void;
    
    // Hit points and health management
    updateHitPoints: (current: number, temp?: number) => void;
    takeDamage: (amount: number) => void;
    heal: (amount: number) => void;
    
    // Class and level management
    addClassLevel: (classId: string) => void;
    
    // Equipment and inventory
    addEquipment: (item: string) => void;
    removeEquipment: (itemIndex: number) => void;
    updateCredits: (amount: number) => void;
    
    // Powers management
    addForcePower: (power: any) => void;
    removeForcePower: (powerId: string) => void;
    addTechPower: (power: any) => void;
    removeTechPower: (powerId: string) => void;
    
    // History actions
    undo: () => void;
    redo: () => void;
    
    // Sync actions
    syncCharacter: (id: string) => Promise<void>;
    importCharacter: (characterData: Character) => void;
    exportCharacter: (id: string) => Character;
    
    // Utility actions
    resetCharacter: () => void;
    resetError: () => void;
  };
}

// Create the store with middleware
const useCharacterStoreBase = create<CharacterState>()(
  devtools(
    persist(
      immer(
        (set, get) => ({
          // Base state
          characters: {},
          activeCharacterId: null,
          isSaving: false,
          isLoading: false,
          error: null,
          
          // History tracking
          history: {
            past: [],
            future: [],
          },
          
          // Derived state with initial values
          derived: {
            activeCharacter: null,
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
            initiativeBonus: 0,
            passivePerception: 10,
            spellSaveDC: 8,
            spellAttackBonus: 0,
            encumbrance: 0,
            experienceToNextLevel: 300,
          },
          
          // Actions
          actions: {
            // Character CRUD operations
            createCharacter: async (characterData) => {
              try {
                set((state) => {
                  state.isSaving = true;
                  state.error = null;
                });
                
                // Add a locally generated ID if none provided
                const newCharacter: Character = {
                  ...characterData,
                  id: characterData.id || uuidv4(),
                  version: 1,
                  lastUpdated: new Date().toISOString(),
                  syncStatus: "local",
                } as Character;
                
                // Validate with schema
                CharacterSchema.parse(newCharacter);
                
                // Add to store optimistically
                set((state) => {
                  // Save current state to history
                  state.history.past.push({...state.characters});
                  state.history.future = [];
                  
                  // Add the new character
                  state.characters[newCharacter.id!] = newCharacter;
                  state.activeCharacterId = newCharacter.id!;
                  
                  // Update derived state
                  state.derived.activeCharacter = newCharacter;
                });
                
                // Try to persist to server
                try {
                  const savedCharacter = await apiRequest("POST", "/api/characters", newCharacter);
                  
                  // Update with server data
                  set((state) => {
                    state.characters[savedCharacter.id] = {
                      ...savedCharacter,
                      syncStatus: "synced",
                    };
                    state.isSaving = false;
                  });
                  
                  return savedCharacter;
                } catch (error) {
                  console.error("Error creating character:", error);
                  // Keep local version but mark as not synced
                  set((state) => {
                    state.characters[newCharacter.id!].syncStatus = "local";
                    state.isSaving = false;
                    state.error = "Failed to save to server, changes saved locally";
                  });
                  
                  return newCharacter;
                }
              } catch (error) {
                console.error("Error creating character:", error);
                set((state) => {
                  state.isSaving = false;
                  state.error = error instanceof Error ? error.message : "Unknown error creating character";
                });
                throw error;
              }
            },
            
            loadCharacter: async (id) => {
              try {
                set((state) => {
                  state.isLoading = true;
                  state.error = null;
                });
                
                // Check if we have it cached locally
                const localCharacter = get().characters[id];
                
                // If we have a synced version, use it immediately
                if (localCharacter && localCharacter.syncStatus === "synced") {
                  set((state) => {
                    state.activeCharacterId = id;
                    state.derived.activeCharacter = localCharacter;
                    state.isLoading = false;
                  });
                  return localCharacter;
                }
                
                // Otherwise fetch from server
                const fetchedCharacter = await apiRequest("GET", `/api/characters/${id}`);
                
                if (fetchedCharacter) {
                  // Handle conflict if we have local changes
                  if (localCharacter && localCharacter.syncStatus === "local") {
                    if (localCharacter.version >= fetchedCharacter.version) {
                      // Local is newer, mark conflict
                      set((state) => {
                        state.characters[id] = {
                          ...localCharacter,
                          syncStatus: "conflict",
                        };
                        state.activeCharacterId = id;
                        state.derived.activeCharacter = state.characters[id];
                        state.isLoading = false;
                      });
                      return localCharacter;
                    }
                  }
                  
                  // Server version is newer or no conflict
                  set((state) => {
                    state.characters[id] = {
                      ...fetchedCharacter,
                      syncStatus: "synced",
                    };
                    state.activeCharacterId = id;
                    state.derived.activeCharacter = state.characters[id];
                    state.isLoading = false;
                  });
                  return fetchedCharacter;
                } else {
                  throw new Error("Character not found");
                }
              } catch (error) {
                console.error("Error loading character:", error);
                set((state) => {
                  state.isLoading = false;
                  state.error = error instanceof Error ? error.message : "Unknown error loading character";
                });
                throw error;
              }
            },
            
            updateCharacter: async (id, updates) => {
              try {
                set((state) => {
                  state.isSaving = true;
                  state.error = null;
                });
                
                const currentCharacter = get().characters[id];
                if (!currentCharacter) {
                  throw new Error("Character not found");
                }
                
                // Create updated character
                const updatedCharacter = {
                  ...currentCharacter,
                  ...updates,
                  version: currentCharacter.version + 1,
                  lastUpdated: new Date().toISOString(),
                  syncStatus: "local",
                };
                
                // Validate with schema
                CharacterSchema.parse(updatedCharacter);
                
                // Update locally first (optimistic update)
                set((state) => {
                  // Save current state to history
                  state.history.past.push({...state.characters});
                  state.history.future = [];
                  
                  // Update the character
                  state.characters[id] = updatedCharacter;
                  
                  // Update derived state if this is the active character
                  if (state.activeCharacterId === id) {
                    state.derived.activeCharacter = updatedCharacter;
                  }
                });
                
                // Try to persist to server
                try {
                  const savedCharacter = await apiRequest("PUT", `/api/characters/${id}`, updatedCharacter);
                  
                  // Update with server data
                  set((state) => {
                    state.characters[id] = {
                      ...savedCharacter,
                      syncStatus: "synced",
                    };
                    state.isSaving = false;
                  });
                  
                  return savedCharacter;
                } catch (error) {
                  console.error("Error updating character:", error);
                  // Keep local version but mark as not synced
                  set((state) => {
                    state.characters[id].syncStatus = "local";
                    state.isSaving = false;
                    state.error = "Failed to save to server, changes saved locally";
                  });
                  
                  return updatedCharacter;
                }
              } catch (error) {
                console.error("Error updating character:", error);
                set((state) => {
                  state.isSaving = false;
                  state.error = error instanceof Error ? error.message : "Unknown error updating character";
                });
                throw error;
              }
            },
            
            deleteCharacter: async (id) => {
              try {
                set((state) => {
                  state.isSaving = true;
                  state.error = null;
                });
                
                // Save current state to history
                set((state) => {
                  state.history.past.push({...state.characters});
                  state.history.future = [];
                });
                
                // Delete locally first
                set((state) => {
                  // If deleting the active character, clear it
                  if (state.activeCharacterId === id) {
                    state.activeCharacterId = null;
                    state.derived.activeCharacter = null;
                  }
                  
                  // Delete the character
                  delete state.characters[id];
                });
                
                // Try to delete from server
                try {
                  await apiRequest("DELETE", `/api/characters/${id}`);
                  set((state) => {
                    state.isSaving = false;
                  });
                } catch (error) {
                  console.error("Error deleting character from server:", error);
                  // Since delete is not idempotent, we don't roll back
                  // but inform the user there may be server data remaining
                  set((state) => {
                    state.isSaving = false;
                    state.error = "Character deleted locally but may not be removed from the server";
                  });
                }
              } catch (error) {
                console.error("Error deleting character:", error);
                set((state) => {
                  state.isSaving = false;
                  state.error = error instanceof Error ? error.message : "Unknown error deleting character";
                });
                throw error;
              }
            },
            
            setActiveCharacter: (id) => {
              set((state) => {
                state.activeCharacterId = id;
                state.derived.activeCharacter = id ? state.characters[id] || null : null;
                
                // If we have an active character, recalculate derived properties
                if (id && state.characters[id]) {
                  const character = state.characters[id];
                  
                  // Calculate ability modifiers
                  Object.keys(character.abilityScores).forEach((ability) => {
                    const score = character.abilityScores[ability as keyof typeof character.abilityScores];
                    state.derived.abilityModifiers[ability] = calculateModifier(score);
                  });
                  
                  // Calculate proficiency bonus
                  state.derived.proficiencyBonus = calculateProficiencyBonus(character.level);
                  
                  // Calculate saving throws
                  Object.keys(character.abilityScores).forEach((ability) => {
                    const isProficient = character.savingThrowProficiencies.includes(ability);
                    const modifier = state.derived.abilityModifiers[ability];
                    state.derived.savingThrows[ability] = isProficient 
                      ? modifier + state.derived.proficiencyBonus 
                      : modifier;
                  });
                  
                  // Calculate initiative bonus (dexterity modifier)
                  state.derived.initiativeBonus = state.derived.abilityModifiers.dexterity;
                  
                  // Calculate passive perception (10 + wisdom modifier + proficiency if proficient)
                  const wisdomMod = state.derived.abilityModifiers.wisdom;
                  const perceptionProficient = character.skillProficiencies.includes("perception");
                  state.derived.passivePerception = 10 + wisdomMod + (perceptionProficient ? state.derived.proficiencyBonus : 0);
                  
                  // Spell Save DC and Spell Attack Bonus
                  let spellcastingAbility = "wisdom"; // Default for Force users
                  if (character.class === "engineer" || character.class === "scholar") {
                    spellcastingAbility = "intelligence";
                  } else if (character.class === "guardian" || character.class === "sentinel") {
                    spellcastingAbility = "wisdom";
                  } else if (character.class === "consular") {
                    spellcastingAbility = "charisma";
                  }
                  
                  const spellMod = state.derived.abilityModifiers[spellcastingAbility];
                  state.derived.spellSaveDC = 8 + state.derived.proficiencyBonus + spellMod;
                  state.derived.spellAttackBonus = state.derived.proficiencyBonus + spellMod;
                  
                  // Determine XP to next level based on current level
                  const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
                  const currentLevel = character.level;
                  if (currentLevel < 20) {
                    state.derived.experienceToNextLevel = xpThresholds[currentLevel] - character.experience;
                  } else {
                    state.derived.experienceToNextLevel = 0; // Max level
                  }
                }
              });
            },
            
            // Ability score management
            updateAbilityScore: (ability, value) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Update the ability score
                const character = state.characters[activeId];
                if (character && character.abilityScores) {
                  character.abilityScores = {
                    ...character.abilityScores,
                    [ability]: value
                  };
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                    
                    // Recalculate modifier
                    state.derived.abilityModifiers[ability] = calculateModifier(value);
                    
                    // Recalculate saving throw
                    const isProficient = character.savingThrowProficiencies.includes(ability);
                    state.derived.savingThrows[ability] = isProficient 
                      ? state.derived.abilityModifiers[ability] + state.derived.proficiencyBonus 
                      : state.derived.abilityModifiers[ability];
                  }
                }
              });
            },
            
            // Hit point management
            updateHitPoints: (current, temp = 0) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Update HP
                const character = state.characters[activeId];
                if (character) {
                  character.currentHp = current;
                  character.temporaryHp = temp;
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            takeDamage: (amount) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Apply damage
                const character = state.characters[activeId];
                if (character) {
                  // First apply to temporary HP
                  let remainingDamage = amount;
                  let newTempHp = character.temporaryHp;
                  
                  if (newTempHp > 0) {
                    if (newTempHp >= remainingDamage) {
                      newTempHp -= remainingDamage;
                      remainingDamage = 0;
                    } else {
                      remainingDamage -= newTempHp;
                      newTempHp = 0;
                    }
                  }
                  
                  // Then apply to current HP
                  let newCurrentHp = character.currentHp;
                  if (remainingDamage > 0) {
                    newCurrentHp = Math.max(0, newCurrentHp - remainingDamage);
                  }
                  
                  // Update character
                  character.currentHp = newCurrentHp;
                  character.temporaryHp = newTempHp;
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            heal: (amount) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Apply healing
                const character = state.characters[activeId];
                if (character) {
                  character.currentHp = Math.min(character.maxHp, character.currentHp + amount);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            // Class and level management
            addClassLevel: (classId) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Update level
                const character = state.characters[activeId];
                if (character) {
                  // Check if this is multiclassing or primary class
                  if (character.class === classId) {
                    // Primary class level up
                    character.level += 1;
                  } else {
                    // Multiclass
                    const existingMulticlass = character.multiclass?.find(mc => mc.class === classId);
                    if (existingMulticlass) {
                      // Increase existing multiclass level
                      existingMulticlass.level += 1;
                    } else {
                      // Add new multiclass
                      if (!character.multiclass) {
                        character.multiclass = [];
                      }
                      character.multiclass.push({
                        class: classId,
                        level: 1
                      });
                    }
                  }
                  
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Recalculate proficiency bonus
                  const totalLevel = character.level + (character.multiclass?.reduce((sum, mc) => sum + mc.level, 0) || 0);
                  state.derived.proficiencyBonus = calculateProficiencyBonus(totalLevel);
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            // Equipment management
            addEquipment: (item) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Add equipment
                const character = state.characters[activeId];
                if (character) {
                  character.equipment.push(item);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            removeEquipment: (itemIndex) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Remove equipment
                const character = state.characters[activeId];
                if (character && itemIndex >= 0 && itemIndex < character.equipment.length) {
                  character.equipment.splice(itemIndex, 1);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            updateCredits: (amount) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Update credits
                const character = state.characters[activeId];
                if (character) {
                  character.credits = Math.max(0, character.credits + amount);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            // Powers management
            addForcePower: (power) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Add force power
                const character = state.characters[activeId];
                if (character) {
                  if (!character.forcePowers) {
                    character.forcePowers = [];
                  }
                  
                  const newPower = {
                    ...power,
                    id: power.id || uuidv4()
                  };
                  
                  character.forcePowers.push(newPower);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            removeForcePower: (powerId) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Remove force power
                const character = state.characters[activeId];
                if (character && character.forcePowers) {
                  character.forcePowers = character.forcePowers.filter(power => power.id !== powerId);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            addTechPower: (power) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Add tech power
                const character = state.characters[activeId];
                if (character) {
                  if (!character.techPowers) {
                    character.techPowers = [];
                  }
                  
                  const newPower = {
                    ...power,
                    id: power.id || uuidv4()
                  };
                  
                  character.techPowers.push(newPower);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            removeTechPower: (powerId) => {
              const activeId = get().activeCharacterId;
              if (!activeId) return;
              
              set((state) => {
                // Save current state to history
                state.history.past.push({...state.characters});
                state.history.future = [];
                
                // Remove tech power
                const character = state.characters[activeId];
                if (character && character.techPowers) {
                  character.techPowers = character.techPowers.filter(power => power.id !== powerId);
                  character.syncStatus = "local";
                  character.lastUpdated = new Date().toISOString();
                  
                  // Update derived state
                  if (state.derived.activeCharacter) {
                    state.derived.activeCharacter = character;
                  }
                }
              });
            },
            
            // History actions for undo/redo
            undo: () => {
              const past = get().history.past;
              
              if (past.length === 0) return;
              
              set((state) => {
                // Get the last state from history
                const previousState = past[past.length - 1];
                
                // Save current state to future
                state.history.future.unshift({...state.characters});
                
                // Restore previous state
                state.characters = previousState;
                state.history.past.pop();
                
                // Update active character if it exists
                if (state.activeCharacterId) {
                  state.derived.activeCharacter = state.characters[state.activeCharacterId] || null;
                }
              });
            },
            
            redo: () => {
              const future = get().history.future;
              
              if (future.length === 0) return;
              
              set((state) => {
                // Get the next state from future
                const nextState = future[0];
                
                // Save current state to history
                state.history.past.push({...state.characters});
                
                // Restore next state
                state.characters = nextState;
                state.history.future.shift();
                
                // Update active character if it exists
                if (state.activeCharacterId) {
                  state.derived.activeCharacter = state.characters[state.activeCharacterId] || null;
                }
              });
            },
            
            // Sync actions
            syncCharacter: async (id) => {
              try {
                const character = get().characters[id];
                if (!character) {
                  throw new Error("Character not found");
                }
                
                set((state) => {
                  state.isSaving = true;
                  state.error = null;
                });
                
                // Push to server
                const savedCharacter = await apiRequest("PUT", `/api/characters/${id}`, character);
                
                // Update with server data
                set((state) => {
                  state.characters[id] = {
                    ...savedCharacter,
                    syncStatus: "synced",
                  };
                  state.isSaving = false;
                  
                  // Update derived state if active
                  if (state.activeCharacterId === id) {
                    state.derived.activeCharacter = state.characters[id];
                  }
                });
              } catch (error) {
                console.error("Error syncing character:", error);
                set((state) => {
                  state.isSaving = false;
                  state.error = error instanceof Error ? error.message : "Unknown error syncing character";
                });
                throw error;
              }
            },
            
            importCharacter: (characterData) => {
              try {
                // Validate with schema
                const validatedCharacter = CharacterSchema.parse(characterData);
                
                // Ensure it has an ID
                const id = validatedCharacter.id || uuidv4();
                
                set((state) => {
                  // Save current state to history
                  state.history.past.push({...state.characters});
                  state.history.future = [];
                  
                  // Add the character
                  state.characters[id] = {
                    ...validatedCharacter,
                    id,
                    syncStatus: "local",
                    lastUpdated: new Date().toISOString(),
                  };
                  
                  // Update derived state if active
                  if (state.activeCharacterId === id) {
                    state.derived.activeCharacter = state.characters[id];
                  }
                });
              } catch (error) {
                console.error("Error importing character:", error);
                set((state) => {
                  state.error = error instanceof Error ? error.message : "Invalid character data";
                });
                throw error;
              }
            },
            
            exportCharacter: (id) => {
              const character = get().characters[id];
              if (!character) {
                throw new Error("Character not found");
              }
              
              return character;
            },
            
            // Utility actions
            resetCharacter: () => {
              set((state) => {
                state.activeCharacterId = null;
                state.derived.activeCharacter = null;
                state.error = null;
              });
            },
            
            resetError: () => {
              set((state) => {
                state.error = null;
              });
            },
          }
        }),
        {
          name: "sw5e-character-storage",
          storage: createJSONStorage(() => idbStorage),
          partialize: (state) => ({
            characters: state.characters,
            activeCharacterId: state.activeCharacterId,
          }),
        }
      )
    )
  )
);

// Add selectors for easier state access
export const useCharacter = createSelectors(useCharacterStoreBase);

// For importing in other files with direct access to actions
export const CharacterActions = {
  ...useCharacterStoreBase.getState().actions,
};

// Export store for usage in middleware or plugins
export const characterStore = useCharacterStoreBase;
