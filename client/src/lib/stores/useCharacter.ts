import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { CharacterSchema } from '@shared/unifiedSchema';
import { z } from 'zod';
import { withHistory, withValidation } from './middleware';
import { createPersistOptions } from './persistence';
import { createStoreWithSelectors } from './selectors';
import { Character } from '@shared/unifiedSchema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getCharacter,
  getCharacters,
} from '@/lib/api/character';

// Define state shape with TypeScript
export interface CharacterState {
  // Normalized data structure
  characters: Record<string, Character>;
  activeCharacterId: string | null;
  isLoading: boolean;
  error: string | null;

  // Version tracking
  lastSync: number | null;

  // Derived state (calculated properties)
  derived: {
    activeCharacter: Character | null;
    abilityModifiers: Record<string, number> | null;
    proficiencyBonus: number | null;
    armorClass: number | null;
    initiative: number | null;
    savingThrows: Record<string, number> | null;
    skillModifiers: Record<string, number> | null;
    maxHitPoints: number | null;
    maxForcePoints: number | null;
    passivePerception: number | null;
  };
}

// Define actions interface
export interface CharacterActions {
  // Character CRUD
  fetchCharacters: () => Promise<void>;
  fetchCharacter: (id: string) => Promise<void>;
  addCharacter: (character: Partial<Character>) => Promise<void>;
  removeCharacter: (id: string) => Promise<void>;
  updateCharacterData: (id: string, updates: Partial<Character>) => Promise<void>;

  // Local state management
  setActiveCharacter: (id: string | null) => void;
  calculateDerivedStats: (characterId?: string) => void;

  // Optimistic updates
  optimisticAddCharacter: (character: Character) => void;
  optimisticUpdateCharacter: (id: string, updates: Partial<Character>) => void;
  optimisticRemoveCharacter: (id: string) => void;

  // Character versioning and history
  restoreCharacterVersion: (id: string, version: number) => Promise<void>;
  exportCharacter: (id: string) => string;
  importCharacter: (data: string) => Promise<void>;
  duplicateCharacter: (id: string) => Promise<void>;

  // Sync and error handling
  setError: (error: string | null) => void;
  syncWithServer: () => Promise<void>;
}

// Helper function to calculate ability modifiers
const getAbilityModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

// Helper function to calculate proficiency bonus
const calculateProficiencyBonus = (level: number): number => {
  return Math.floor((level - 1) / 4) + 2;
};

// Create the store with all middlewares
export const useCharacter = create<CharacterState & CharacterActions>()(
  devtools(
    immer(
      withHistory<CharacterState>({ limit: 50 })(
        withValidation(
          // Validate the main state shape (excluding derived values which are calculated)
          z.object({
            characters: z.record(z.string(), CharacterSchema),
            activeCharacterId: z.string().nullable(),
            isLoading: z.boolean(),
            error: z.string().nullable(),
            lastSync: z.number().nullable(),
            derived: z.any(), // Skip validation on derived values
            history: z.any(), // Skip validation on history
          })
        )(
          (set, get) => ({
            // Initial state
            characters: {},
            activeCharacterId: null,
            isLoading: false,
            error: null,
            lastSync: null,
            derived: {
              activeCharacter: null,
              abilityModifiers: null,
              proficiencyBonus: null,
              armorClass: null,
              initiative: null,
              savingThrows: null,
              skillModifiers: null,
              maxHitPoints: null,
              maxForcePoints: null,
              passivePerception: null,
            },

            // Character CRUD
            fetchCharacters: async () => {
              set({ isLoading: true, error: null });
              try {
                const response = await getCharacters();
                const charactersRecord = response.reduce((acc, character) => {
                  acc[character.id!] = character;
                  return acc;
                }, {} as Record<string, Character>);

                set((state) => {
                  state.characters = charactersRecord;
                  state.isLoading = false;
                  state.lastSync = Date.now();

                  // Set active character if none is selected
                  if (!state.activeCharacterId && Object.keys(charactersRecord).length > 0) {
                    state.activeCharacterId = Object.keys(charactersRecord)[0];
                  }

                  // Calculate derived stats
                  if (state.activeCharacterId) {
                    get().calculateDerivedStats(state.activeCharacterId);
                  }
                });
              } catch (error) {
                set((state) => {
                  state.isLoading = false;
                  state.error = error instanceof Error ? error.message : 'Failed to fetch characters';
                });
                console.error('Error fetching characters:', error);
              }
            },

            fetchCharacter: async (id) => {
              set((state) => { state.isLoading = true; state.error = null; });
              try {
                const character = await getCharacter(id);
                set((state) => {
                  state.characters[id] = character;
                  state.isLoading = false;

                  // Update derived stats if this is the active character
                  if (state.activeCharacterId === id) {
                    get().calculateDerivedStats(id);
                  }
                });
              } catch (error) {
                set((state) => {
                  state.isLoading = false;
                  state.error = error instanceof Error ? error.message : 'Failed to fetch character';
                });
                console.error(`Error fetching character ${id}:`, error);
              }
            },

            addCharacter: async (characterData) => {
              const newCharacter: Character = {
                id: uuidv4(),
                name: characterData.name || 'New Character',
                species: characterData.species || '',
                class: characterData.class || '',
                level: characterData.level || 1,
                background: characterData.background || '',
                alignment: characterData.alignment || '',
                abilityScores: characterData.abilityScores || {
                  strength: 10,
                  dexterity: 10,
                  constitution: 10,
                  intelligence: 10,
                  wisdom: 10,
                  charisma: 10,
                },
                maxHp: characterData.maxHp || 10,
                currentHp: characterData.currentHp || 10,
                temporaryHp: characterData.temporaryHp || 0,
                armorClass: characterData.armorClass || 10,
                speed: characterData.speed || 30,
                skillProficiencies: characterData.skillProficiencies || [],
                savingThrowProficiencies: characterData.savingThrowProficiencies || [],
                equipment: characterData.equipment || [],
                credits: characterData.credits || 1000,
                backstory: characterData.backstory || '',
                notes: characterData.notes || '',
                startingLocation: characterData.startingLocation || 'Unknown',
                currentLocation: characterData.currentLocation || undefined,
                experience: characterData.experience || 0,
                forcePowers: characterData.forcePowers || [],
                techPowers: characterData.techPowers || [],
                feats: characterData.feats || [],
                languages: characterData.languages || [],
                forceAlignment: characterData.forceAlignment || undefined,
                maxForcePoints: characterData.maxForcePoints || 0,
                currentForcePoints: characterData.currentForcePoints || 0,
                proficiencyBonus: characterData.proficiencyBonus || 2,
                initiative: characterData.initiative || 0,
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...characterData,
              };

              // Optimistically update UI
              get().optimisticAddCharacter(newCharacter);

              try {
                // Send to server
                const savedCharacter = await createCharacter(newCharacter);

                // Update with server response
                set((state) => {
                  state.characters[savedCharacter.id!] = savedCharacter;
                  state.lastSync = Date.now();

                  // Set as active if there was no active character
                  if (state.activeCharacterId === null) {
                    state.activeCharacterId = savedCharacter.id;
                    get().calculateDerivedStats(savedCharacter.id);
                  }
                });
              } catch (error) {
                set((state) => {
                  state.error = error instanceof Error ? error.message : 'Failed to save character';
                  // Revert optimistic update if server save failed
                  delete state.characters[newCharacter.id!];
                });
                console.error('Error creating character:', error);
              }
            },

            removeCharacter: async (id) => {
              // Store the character for potential rollback
              const character = get().characters[id];
              if (!character) return;

              // Optimistically update UI
              get().optimisticRemoveCharacter(id);

              try {
                // Delete on server
                await deleteCharacter(id);

                // Update timestamp
                set((state) => {
                  state.lastSync = Date.now();
                });
              } catch (error) {
                // Revert optimistic update
                set((state) => {
                  state.characters[id] = character;
                  state.error = error instanceof Error ? error.message : 'Failed to delete character';
                });
                console.error(`Error deleting character ${id}:`, error);
              }
            },

            updateCharacterData: async (id, updates) => {
              const character = get().characters[id];
              if (!character) {
                set((state) => {
                  state.error = `Character with ID ${id} not found`;
                });
                return;
              }

              // Optimistically update UI
              get().optimisticUpdateCharacter(id, updates);

              try {
                // Update on server
                const updatedCharacter = await updateCharacter(id, updates);

                // Update with server response
                set((state) => {
                  state.characters[id] = updatedCharacter;
                  state.lastSync = Date.now();

                  // Recalculate derived stats if this is the active character
                  if (state.activeCharacterId === id) {
                    get().calculateDerivedStats(id);
                  }
                });
              } catch (error) {
                // Revert optimistic update
                set((state) => {
                  state.characters[id] = character;
                  state.error = error instanceof Error ? error.message : 'Failed to update character';
                });
                console.error(`Error updating character ${id}:`, error);
              }
            },

            // Local state management
            setActiveCharacter: (id) => {
              set((state) => {
                state.activeCharacterId = id;
                if (id) {
                  get().calculateDerivedStats(id);
                } else {
                  // Clear derived state if no character is active
                  state.derived = {
                    activeCharacter: null,
                    abilityModifiers: null,
                    proficiencyBonus: null,
                    armorClass: null,
                    initiative: null,
                    savingThrows: null,
                    skillModifiers: null,
                    maxHitPoints: null,
                    maxForcePoints: null,
                    passivePerception: null,
                  };
                }
              });
            },

            calculateDerivedStats: (characterId) => {
              const id = characterId || get().activeCharacterId;
              if (!id) return;

              const character = get().characters[id];
              if (!character) return;

              set((state) => {
                // Active character reference
                state.derived.activeCharacter = character;

                // Calculate ability modifiers
                state.derived.abilityModifiers = {
                  strength: getAbilityModifier(character.abilityScores.strength),
                  dexterity: getAbilityModifier(character.abilityScores.dexterity),
                  constitution: getAbilityModifier(character.abilityScores.constitution),
                  intelligence: getAbilityModifier(character.abilityScores.intelligence),
                  wisdom: getAbilityModifier(character.abilityScores.wisdom),
                  charisma: getAbilityModifier(character.abilityScores.charisma),
                };

                // Proficiency bonus
                state.derived.proficiencyBonus = calculateProficiencyBonus(character.level);

                // Update armor class if not explicitly set (basic calculation)
                if (!character.armorClass) {
                  state.derived.armorClass = 10 + state.derived.abilityModifiers.dexterity;
                } else {
                  state.derived.armorClass = character.armorClass;
                }

                // Initiative
                state.derived.initiative = state.derived.abilityModifiers.dexterity;

                // Saving throws
                const savingThrows: Record<string, number> = {};
                const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
                for (const ability of abilities) {
                  const isProficient = character.savingThrowProficiencies.includes(ability);
                  savingThrows[ability] = state.derived.abilityModifiers[ability as keyof typeof state.derived.abilityModifiers] + 
                    (isProficient ? state.derived.proficiencyBonus : 0);
                }
                state.derived.savingThrows = savingThrows;

                // Skill modifiers (simplified - would need actual skill-to-ability mappings)
                state.derived.skillModifiers = {};

                // Max HP and Force Points
                state.derived.maxHitPoints = character.maxHp;
                state.derived.maxForcePoints = character.maxForcePoints;

                // Passive Perception (10 + perception modifier)
                const perceptionProficient = character.skillProficiencies.includes('perception');
                state.derived.passivePerception = 10 + 
                  state.derived.abilityModifiers.wisdom + 
                  (perceptionProficient ? state.derived.proficiencyBonus : 0);
              });
            },

            // Optimistic updates
            optimisticAddCharacter: (character) => {
              set((state) => {
                state.characters[character.id!] = character;
              });
            },

            optimisticUpdateCharacter: (id, updates) => {
              set((state) => {
                if (state.characters[id]) {
                  state.characters[id] = {
                    ...state.characters[id],
                    ...updates,
                    updatedAt: new Date().toISOString(),
                    version: (state.characters[id].version || 1) + 1,
                  };

                  // Update derived stats if this is active character
                  if (state.activeCharacterId === id) {
                    get().calculateDerivedStats(id);
                  }
                }
              });
            },

            optimisticRemoveCharacter: (id) => {
              set((state) => {
                // Remove from characters list
                delete state.characters[id];

                // If this was the active character, set a new one
                if (state.activeCharacterId === id) {
                  const remainingIds = Object.keys(state.characters);
                  state.activeCharacterId = remainingIds.length > 0 ? remainingIds[0] : null;

                  // Update derived stats for new active character
                  if (state.activeCharacterId) {
                    get().calculateDerivedStats(state.activeCharacterId);
                  } else {
                    // Clear derived state
                    state.derived = {
                      activeCharacter: null,
                      abilityModifiers: null,
                      proficiencyBonus: null,
                      armorClass: null,
                      initiative: null,
                      savingThrows: null,
                      skillModifiers: null,
                      maxHitPoints: null,
                      maxForcePoints: null,
                      passivePerception: null,
                    };
                  }
                }
              });
            },

            // Character versioning and history
            restoreCharacterVersion: async (id, version) => {
              // This would typically fetch a specific version from server history
              // For now, just a placeholder to show the interface
              set((state) => {
                state.error = "Character version history not implemented yet";
              });
              return Promise.resolve();
            },

            exportCharacter: (id) => {
              const character = get().characters[id];
              if (!character) {
                set((state) => {
                  state.error = `Character with ID ${id} not found`;
                });
                return '';
              }

              try {
                return JSON.stringify(character, null, 2);
              } catch (error) {
                set((state) => {
                  state.error = `Error exporting character: ${error instanceof Error ? error.message : 'Unknown error'}`;
                });
                return '';
              }
            },

            importCharacter: async (data) => {
              try {
                const character = JSON.parse(data) as Character;

                // Validate
                const result = CharacterSchema.safeParse(character);
                if (!result.success) {
                  set((state) => {
                    state.error = `Invalid character data: ${result.error.message}`;
                  });
                  return;
                }

                // Ensure it has an ID or generate one
                const importedCharacter = {
                  ...character,
                  id: character.id || uuidv4(),
                  version: 1,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                // Add to store and server
                await get().addCharacter(importedCharacter);
              } catch (error) {
                set((state) => {
                  state.error = `Error importing character: ${error instanceof Error ? error.message : 'Invalid JSON data'}`;
                });
              }
            },

            duplicateCharacter: async (id) => {
              const character = get().characters[id];
              if (!character) {
                set((state) => {
                  state.error = `Character with ID ${id} not found`;
                });
                return;
              }

              // Create a duplicate with a new ID and updated name
              const duplicate: Character = {
                ...character,
                id: uuidv4(),
                name: `${character.name} (Copy)`,
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              // Add to store and server
              await get().addCharacter(duplicate);
            },

            // Sync and error handling
            setError: (error) => {
              set((state) => {
                state.error = error;
              });
            },

            syncWithServer: async () => {
              set((state) => {
                state.isLoading = true;
                state.error = null;
              });

              try {
                await get().fetchCharacters();

                set((state) => {
                  state.isLoading = false;
                  state.lastSync = Date.now();
                });
              } catch (error) {
                set((state) => {
                  state.isLoading = false;
                  state.error = error instanceof Error ? error.message : 'Failed to sync with server';
                });
                console.error('Error syncing with server:', error);
              }
            },
          })
        )
      )
    )
  )
);

// Create hooks to work with this store
export const useCharacterStore = createStoreWithSelectors(useCharacter);

// Create React Query hooks that use the store for optimistic updates
export function useCharacterQuery(id?: string) {
  return useQuery({
    queryKey: ['character', id],
    queryFn: async () => {
      if (!id) return null;
      return await getCharacter(id);
    },
    enabled: !!id,
  });
}

export function useCharacterListQuery() {
  return useQuery({
    queryKey: ['characters'],
    queryFn: getCharacters,
  });
}

export function useCreateCharacterMutation() {
  const queryClient = useQueryClient();
  const { optimisticAddCharacter } = useCharacter();

  return useMutation({
    mutationFn: createCharacter,
    onMutate: async (newCharacter) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['characters'] });

      // Optimistically update UI
      optimisticAddCharacter(newCharacter as Character);

      return { newCharacter };
    },
    onSuccess: (data) => {
      // Update queries
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.setQueryData(['character', data.id], data);
    },
  });
}

export function useUpdateCharacterMutation() {
  const queryClient = useQueryClient();
  const { optimisticUpdateCharacter } = useCharacter();

  return useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<Character> }) => 
      updateCharacter(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['character', id] });

      // Save previous character
      const previousCharacter = queryClient.getQueryData<Character>(['character', id]);

      // Optimistically update
      optimisticUpdateCharacter(id, data);

      return { previousCharacter };
    },
    onSuccess: (updatedCharacter) => {
      // Update queries
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.setQueryData(['character', updatedCharacter.id], updatedCharacter);
    },
    onError: (_, { id }, context) => {
      // Rollback on error
      if (context?.previousCharacter) {
        queryClient.setQueryData(['character', id], context.previousCharacter);
      }
    },
  });
}

export function useDeleteCharacterMutation() {
  const queryClient = useQueryClient();
  const { optimisticRemoveCharacter } = useCharacter();

  return useMutation({
    mutationFn: deleteCharacter,
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['characters'] });
      await queryClient.cancelQueries({ queryKey: ['character', id] });

      // Save previous state
      const previousCharacters = queryClient.getQueryData<Character[]>(['characters']);

      // Optimistically update
      optimisticRemoveCharacter(id);

      return { previousCharacters };
    },
    onSuccess: (_, id) => {
      // Update queries
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.removeQueries({ queryKey: ['character', id] });
    },
  });
}

export default useCharacter;