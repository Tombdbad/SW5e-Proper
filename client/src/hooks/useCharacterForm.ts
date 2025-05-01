
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import useCharacterStore from "@/lib/stores/useCharacterStore";
import { Character } from "@/lib/stores/useCharacterStore";

// Character form validation schema
export const CharacterFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  class: z.string().min(1, "Class is required"),
  level: z.number().int().min(1).max(20),
  background: z.string().optional(),
  alignment: z.string().optional(),
  abilityScores: z.object({
    strength: z.number().int().min(3).max(20),
    dexterity: z.number().int().min(3).max(20),
    constitution: z.number().int().min(3).max(20),
    intelligence: z.number().int().min(3).max(20),
    wisdom: z.number().int().min(3).max(20),
    charisma: z.number().int().min(3).max(20),
  }),
  skills: z.record(z.string(), z.boolean()).optional(),
  notes: z.string().optional(),
  backstory: z.string().optional(),
});

export type CharacterFormData = z.infer<typeof CharacterFormSchema>;

const defaultFormValues: CharacterFormData = {
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
  notes: "",
  backstory: "",
};

// Map character from store to form data
const mapCharacterToForm = (character: Character): CharacterFormData => {
  return {
    name: character.name,
    species: character.species,
    class: character.class,
    level: character.level,
    background: character.background,
    alignment: character.alignment,
    abilityScores: character.abilityScores,
    skills: character.skills,
    notes: character.notes,
    backstory: character.backstory,
  };
};

// Map form data to character store structure
const mapFormToCharacter = (formData: CharacterFormData): Partial<Character> => {
  return {
    name: formData.name,
    species: formData.species,
    class: formData.class,
    level: formData.level,
    background: formData.background || "",
    alignment: formData.alignment || "",
    abilityScores: formData.abilityScores,
    skills: formData.skills || {},
    notes: formData.notes || "",
    backstory: formData.backstory || "",
  };
};

interface UseCharacterFormOptions {
  characterId?: string;
  mode?: "create" | "edit";
  onSaved?: (characterId: string) => void;
  onChange?: (data: CharacterFormData) => void;
}

/**
 * A hook to manage character form state, integrating with the Zustand character store
 */
export const useCharacterForm = (options: UseCharacterFormOptions = {}): UseFormReturn<CharacterFormData> & {
  onSubmit: () => Promise<void>;
  isLoading: boolean;
  hasChanges: boolean;
  resetForm: () => void;
  saveCharacter: () => Promise<string>;
} => {
  const { characterId, mode = "create", onSaved, onChange } = options;
  
  // Character store selectors
  const character = useCharacterStore(
    (state) => characterId ? state.characters[characterId] : null
  );
  const isLoading = useCharacterStore((state) => state.isLoading);
  const error = useCharacterStore((state) => state.error);
  const { createCharacter, updateCharacter } = useCharacterStore((state) => state.actions);
  
  // Initialize form with character data or defaults
  const methods = useForm<CharacterFormData>({
    resolver: zodResolver(CharacterFormSchema),
    defaultValues: character ? mapCharacterToForm(character) : defaultFormValues,
  });
  
  const { reset, handleSubmit, formState, watch } = methods;
  
  // Watch for changes to character data in the store and update form
  useEffect(() => {
    if (character && mode === "edit") {
      reset(mapCharacterToForm(character));
    }
  }, [character, reset, mode]);
  
  // Track form changes for onChange callback
  useEffect(() => {
    const subscription = watch((data) => {
      if (onChange && data) {
        onChange(data as CharacterFormData);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [watch, onChange]);
  
  // Save character to store
  const saveCharacter = async (): Promise<string> => {
    const data = methods.getValues();
    
    try {
      if (mode === "edit" && characterId) {
        updateCharacter(characterId, mapFormToCharacter(data));
        return characterId;
      } else {
        const newCharacterId = createCharacter(mapFormToCharacter(data));
        return newCharacterId;
      }
    } catch (err) {
      console.error("Error saving character:", err);
      throw err;
    }
  };
  
  // Handle form submission
  const onSubmit = handleSubmit(async (data) => {
    try {
      const id = await saveCharacter();
      if (onSaved) {
        onSaved(id);
      }
    } catch (err) {
      console.error("Form submission error:", err);
    }
  });
  
  return {
    ...methods,
    onSubmit: async () => onSubmit(),
    isLoading,
    hasChanges: Object.keys(formState.dirtyFields).length > 0,
    resetForm: () => reset(character ? mapCharacterToForm(character) : defaultFormValues),
    saveCharacter,
  };
};

/**
 * A hook specifically for multi-step character creation forms
 */
export const useMultiStepCharacterForm = (options: UseCharacterFormOptions = {}) => {
  const characterForm = useCharacterForm(options);
  const [storeActiveCharacterId, storeSetActiveCharacter] = useCharacterStore(
    (state) => [state.activeCharacterId, state.actions.setActiveCharacter]
  );
  
  // Create a temporary character if none exists for the form
  useEffect(() => {
    const initializeCharacter = async () => {
      // If we're editing an existing character, nothing to do
      if (options.characterId) return;
      
      // If there's no active character in the store, create a temp one
      if (!storeActiveCharacterId) {
        const newId = await characterForm.saveCharacter();
        storeSetActiveCharacter(newId);
      }
    };
    
    initializeCharacter();
  }, [options.characterId, storeActiveCharacterId]);
  
  return {
    ...characterForm,
    activeCharacterId: options.characterId || storeActiveCharacterId,
  };
};

export default useCharacterForm;
