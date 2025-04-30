
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Character, emptyCharacter } from '../shared/schema/character';

interface CharacterState {
  // Character data
  character: Character;

  // Character creation flow state
  currentStep: number;
  completedSteps: Record<number, boolean>;
  isDirty: boolean;
  isSaving: boolean;

  // Actions
  setCharacter: (character: Character) => void;
  updateCharacter: <K extends keyof Character>(key: K, value: Character[K]) => void;
  updateNestedCharacter: (path: string[], value: any) => void;
  resetCharacter: () => void;

  // Creation flow actions
  setCurrentStep: (step: number) => void;
  markStepComplete: (step: number, isComplete: boolean) => void;

  // Persistence actions
  saveCharacter: () => Promise<void>;
  loadCharacter: (id: string) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      // Initial state
      character: emptyCharacter,
      currentStep: 0,
      completedSteps: {},
      isDirty: false,
      isSaving: false,

      // Basic character update actions
      setCharacter: (character) => set({ 
        character,
        isDirty: true
      }),

      updateCharacter: (key, value) => set((state) => ({
        character: { ...state.character, [key]: value },
        isDirty: true
      })),

      updateNestedCharacter: (path, value) => set((state) => {
        // Create a deep copy of the character
        const updatedCharacter = JSON.parse(JSON.stringify(state.character));

        // Navigate to the nested property
        let current = updatedCharacter;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }

        // Update the value
        current[path[path.length - 1]] = value;

        return {
          character: updatedCharacter,
          isDirty: true
        };
      }),

      resetCharacter: () => set({
        character: emptyCharacter,
        currentStep: 0,
        completedSteps: {},
        isDirty: false
      }),

      // Creation flow state management
      setCurrentStep: (step) => set({ currentStep: step }),

      markStepComplete: (step, isComplete) => set((state) => ({
        completedSteps: { ...state.completedSteps, [step]: isComplete }
      })),

      // Persistence methods (to be implemented with API integration)
      saveCharacter: async () => {
        const { character } = get();
        set({ isSaving: true });

        try {
          // API call would go here
          // const response = await api.saveCharacter(character);

          // For now, just simulate an API call
          await new Promise(resolve => setTimeout(resolve, 500));

          set({ 
            isDirty: false,
            isSaving: false
          });

          return Promise.resolve();
        } catch (error) {
          set({ isSaving: false });
          return Promise.reject(error);
        }
      },

      loadCharacter: async (id) => {
        set({ isSaving: true });

        try {
          // API call would go here
          // const loadedCharacter = await api.getCharacter(id);

          // For now, just simulate an API call
          await new Promise(resolve => setTimeout(resolve, 500));
          const loadedCharacter = { ...emptyCharacter, id };

          set({ 
            character: loadedCharacter,
            isDirty: false,
            isSaving: false
          });

          return Promise.resolve();
        } catch (error) {
          set({ isSaving: false });
          return Promise.reject(error);
        }
      }
    }),
    {
      name: 'sw5e-character-storage', // localStorage key
      partialize: (state) => ({
        character: state.character,
        // Only persist the character data, not the UI state
      }),
    }
  )
);

// Create a hook for form integration with react-hook-form
export const useCharacterForm = () => {
  const { character, updateCharacter, updateNestedCharacter } = useCharacterStore();

  // Used for initializing form values
  const getFormValues = () => {
    return character;
  };

  // Used as a submit handler
  const saveFormValues = (values: Character) => {
    useCharacterStore.getState().setCharacter(values);
    return useCharacterStore.getState().saveCharacter();
  };

  // Field-level change handler for form integration
  const handleFieldChange = (fieldName: string, value: any) => {
    // Handle nested paths like "abilities.strength"
    if (fieldName.includes('.')) {
      const path = fieldName.split('.');
      updateNestedCharacter(path, value);
    } else {
      updateCharacter(fieldName as keyof Character, value);
    }
  };

  return {
    getFormValues,
    saveFormValues,
    handleFieldChange,
  };
};

// Utility functions for character data manipulation
export const characterUtils = {
  // Calculate ability score modifier
  calculateModifier: (score: number): number => {
    return Math.floor((score - 10) / 2);
  },

  // Calculate proficiency bonus based on level
  calculateProficiencyBonus: (level: number): number => {
    return Math.floor((level - 1) / 4) + 2;
  },

  // Calculate passive perception
  calculatePassivePerception: (character: Character): number => {
    const wisdomMod = characterUtils.calculateModifier(character.abilityScores.wisdom);
    const profBonus = characterUtils.calculateProficiencyBonus(character.level);
    const hasPerceptionProf = character.proficiencies.includes('perception');

    return 10 + wisdomMod + (hasPerceptionProf ? profBonus : 0);
  },

  // Calculate max hit points
  calculateMaxHp: (character: Character): number => {
    if (!character.class) return 0;

    const conModifier = characterUtils.calculateModifier(character.abilityScores.constitution);

    // Base HP depends on class
    let baseHp = 0;
    switch (character.class) {
      case 'berserker':
      case 'guardian':
        baseHp = 12;
        break;
      case 'fighter':
      case 'sentinel':
        baseHp = 10;
        break;
      case 'scout':
      case 'engineer':
        baseHp = 8;
        break;
      case 'consular':
      case 'scoundrel':
        baseHp = 6;
        break;
      default:
        baseHp = 8;
    }

    // First level is max HP
    let maxHp = baseHp + conModifier;

    // Add HP for each level beyond first
    if (character.level > 1) {
      // Average HP per level based on hit die
      const avgHpPerLevel = Math.floor(baseHp / 2) + 1;
      maxHp += (character.level - 1) * (avgHpPerLevel + conModifier);
    }

    return Math.max(1, maxHp);
  },

  // Calculate armor class
  calculateArmorClass: (character: Character): number => {
    const dexModifier = characterUtils.calculateModifier(character.abilityScores.dexterity);

    // Base AC is 10 + DEX modifier (may be modified by armor, etc.)
    return 10 + dexModifier;
  },

  // Calculate force points for force users
  calculateForcePoints: (character: Character): number => {
    if (!character.class) return 0;

    const wisModifier = characterUtils.calculateModifier(character.abilityScores.wisdom);
    const isForceUser = ['consular', 'guardian', 'sentinel'].includes(character.class);

    if (!isForceUser) return 0;

    return Math.max(1, character.level + wisModifier);
  }
};
