
import { useForm, UseFormReturn, FieldValues, DefaultValues, UseFormProps, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState, useCallback } from "react";
import useCharacterStore from "@/lib/stores/useCharacterStore";
import { Character } from "@/lib/stores/useCharacterStore";
import { debounce } from "lodash";
import { getAbilityModifier, calculateForcePoints, calculateTechPoints } from "@/lib/sw5e/rules";

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
  powers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["force", "tech"]),
      level: z.number().int().min(1).max(5),
      description: z.string().optional()
    })
  ).optional(),
  equipment: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      quantity: z.number().int().min(1)
    })
  ).optional(),
  notes: z.string().optional(),
  backstory: z.string().optional(),
  credits: z.number().optional(),
  experience: z.number().optional(),
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
  powers: [],
  equipment: [],
  notes: "",
  backstory: "",
  credits: 0,
  experience: 0,
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
    powers: character.powers,
    equipment: character.equipment,
    notes: character.notes,
    backstory: character.backstory,
    credits: character.credits,
    experience: character.experience,
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
    powers: formData.powers || [],
    equipment: formData.equipment || [],
    notes: formData.notes || "",
    backstory: formData.backstory || "",
    credits: formData.credits || 0,
    experience: formData.experience || 0,
  };
};

interface UseCharacterFormOptions<TFormValues extends FieldValues = CharacterFormData> {
  characterId?: string;
  mode?: "create" | "edit";
  onSaved?: (characterId: string) => void;
  onChange?: (data: TFormValues) => void;
  // Custom validation schema to extend the base schema
  schema?: z.ZodType<TFormValues>;
  defaultValues?: DefaultValues<TFormValues>;
  // Conditionally disable certain fields
  disabledFields?: string[];
  // Conditionally show fields based on other field values
  conditionalFields?: Record<string, (formData: TFormValues) => boolean>;
  // Auto-save debounce time in ms (0 to disable)
  autoSaveDebounce?: number;
  // Additional form options
  formOptions?: Omit<UseFormProps<TFormValues>, 'resolver' | 'defaultValues'>;
}

/**
 * A hook to manage character form state, integrating with the Zustand character store
 * with support for two-way binding, validation, and conditional fields
 */
export const useCharacterForm = <TFormValues extends FieldValues = CharacterFormData>(
  options: UseCharacterFormOptions<TFormValues> = {}
): UseFormReturn<TFormValues> & {
  onSubmit: (handler?: SubmitHandler<TFormValues>) => Promise<void>;
  isLoading: boolean;
  hasChanges: boolean;
  resetForm: () => void;
  saveCharacter: () => Promise<string>;
  isFieldVisible: (fieldName: string) => boolean;
  isFieldDisabled: (fieldName: string) => boolean;
  derivedValues: {
    abilityModifiers: Record<string, number>;
    proficiencyBonus: number;
    forcePoints: number | null;
    techPoints: number | null;
    maxPowerLevel: number;
  };
} => {
  const { 
    characterId, 
    mode = "create", 
    onSaved, 
    onChange,
    schema = CharacterFormSchema as unknown as z.ZodType<TFormValues>,
    defaultValues = defaultFormValues as unknown as DefaultValues<TFormValues>,
    disabledFields = [],
    conditionalFields = {},
    autoSaveDebounce = 2000,
    formOptions = {}
  } = options;
  
  // Character store selectors
  const character = useCharacterStore(
    (state) => characterId ? state.characters[characterId] : null
  );
  const isLoading = useCharacterStore((state) => state.isLoading);
  const error = useCharacterStore((state) => state.error);
  const { createCharacter, updateCharacter, calculateDerivedStats } = 
    useCharacterStore((state) => state.actions);
  
  // Derived values state
  const [derivedValues, setDerivedValues] = useState({
    abilityModifiers: {} as Record<string, number>,
    proficiencyBonus: 2,
    forcePoints: null as number | null,
    techPoints: null as number | null,
    maxPowerLevel: 1
  });
  
  // Initialize form with character data or defaults
  const methods = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues: character 
      ? (mapCharacterToForm(character) as unknown as DefaultValues<TFormValues>) 
      : defaultValues,
    ...formOptions
  });
  
  const { 
    reset, 
    handleSubmit, 
    formState, 
    watch, 
    setValue,
    getValues,
    trigger
  } = methods;
  
  // Watch for changes to character data in the store and update form
  useEffect(() => {
    if (character && mode === "edit") {
      reset(mapCharacterToForm(character) as unknown as DefaultValues<TFormValues>);
      // Update derived values
      updateDerivedValues(mapCharacterToForm(character) as TFormValues);
    }
  }, [character, reset, mode]);
  
  // Auto-save functionality with debounce
  const autoSave = useCallback(
    debounce(async (data: TFormValues) => {
      if (mode === "edit" && characterId && autoSaveDebounce > 0) {
        // Validate before saving
        const isValid = await trigger();
        if (isValid && Object.keys(formState.dirtyFields).length > 0) {
          try {
            updateCharacter(characterId, mapFormToCharacter(data as unknown as CharacterFormData));
            console.log('Auto-saved character changes');
          } catch (err) {
            console.error('Auto-save failed:', err);
          }
        }
      }
    }, autoSaveDebounce),
    [characterId, mode, formState.dirtyFields, trigger, updateCharacter, autoSaveDebounce]
  );
  
  // Calculate derived values from form data
  const updateDerivedValues = useCallback((data: TFormValues) => {
    // Cast to CharacterFormData type since we know the structure
    const formData = data as unknown as CharacterFormData;
    
    if (!formData.abilityScores) return;
    
    const abilityModifiers: Record<string, number> = {};
    
    // Calculate ability modifiers
    for (const [ability, score] of Object.entries(formData.abilityScores)) {
      abilityModifiers[ability] = getAbilityModifier(score);
    }
    
    // Calculate proficiency bonus
    const level = formData.level || 1;
    const proficiencyBonus = Math.ceil(1 + level / 4);
    
    // Calculate max power level
    const maxPowerLevel = Math.min(5, Math.ceil(level / 4));
    
    // Calculate force and tech points
    const forceClassTypes = ["consular", "guardian", "sentinel"];
    const techClassTypes = ["engineer", "scholar", "scout"];
    
    // Mock class features for calculating points
    const classFeatures = {
      forceUser: forceClassTypes.includes(formData.class?.toLowerCase() || ''),
      techUser: techClassTypes.includes(formData.class?.toLowerCase() || '')
    };
    
    const forcePoints = classFeatures.forceUser 
      ? calculateForcePoints(formData, classFeatures, level, formData.abilityScores)
      : null;
      
    const techPoints = classFeatures.techUser 
      ? calculateTechPoints(formData, classFeatures, level, formData.abilityScores)
      : null;
    
    setDerivedValues({
      abilityModifiers,
      proficiencyBonus,
      forcePoints,
      techPoints,
      maxPowerLevel
    });
  }, []);
  
  // Track form changes for onChange callback and derived calculations
  useEffect(() => {
    const subscription = watch((data) => {
      if (data) {
        const formData = data as TFormValues;
        
        // Update derived values when form changes
        updateDerivedValues(formData);
        
        // Call the onChange callback if provided
        if (onChange) {
          onChange(formData);
        }
        
        // Trigger auto-save if enabled
        if (autoSaveDebounce > 0) {
          autoSave(formData);
        }
      }
    });
    
    // Initial calculation of derived values
    updateDerivedValues(getValues());
    
    return () => {
      subscription.unsubscribe();
      autoSave.cancel();
    };
  }, [watch, onChange, autoSave, updateDerivedValues, getValues, autoSaveDebounce]);
  
  // Save character to store
  const saveCharacter = async (): Promise<string> => {
    const data = getValues();
    
    try {
      if (mode === "edit" && characterId) {
        updateCharacter(characterId, mapFormToCharacter(data as unknown as CharacterFormData));
        calculateDerivedStats();
        return characterId;
      } else {
        const newCharacterId = createCharacter(mapFormToCharacter(data as unknown as CharacterFormData));
        calculateDerivedStats();
        return newCharacterId;
      }
    } catch (err) {
      console.error("Error saving character:", err);
      throw err;
    }
  };
  
  // Handle form submission
  const onSubmit = async (handler?: SubmitHandler<TFormValues>) => {
    try {
      await handleSubmit(async (data) => {
        // Call the custom handler if provided
        if (handler) {
          await handler(data);
        }
        
        // Save the character
        const id = await saveCharacter();
        
        // Call the onSaved callback if provided
        if (onSaved) {
          onSaved(id);
        }
      })();
    } catch (err) {
      console.error("Form submission error:", err);
    }
  };
  
  // Check if a field should be visible based on conditional display rules
  const isFieldVisible = (fieldName: string): boolean => {
    if (!conditionalFields[fieldName]) return true;
    return conditionalFields[fieldName](getValues());
  };
  
  // Check if a field is disabled
  const isFieldDisabled = (fieldName: string): boolean => {
    return disabledFields.includes(fieldName);
  };
  
  return {
    ...methods,
    onSubmit,
    isLoading,
    hasChanges: Object.keys(formState.dirtyFields).length > 0,
    resetForm: () => reset(
      character 
        ? (mapCharacterToForm(character) as unknown as DefaultValues<TFormValues>) 
        : defaultValues
    ),
    saveCharacter,
    isFieldVisible,
    isFieldDisabled,
    derivedValues
  };
};

/**
 * A hook specifically for multi-step character creation forms
 * with support for step validation and progress tracking
 */
export const useMultiStepCharacterForm = (options: UseCharacterFormOptions = {}) => {
  const characterForm = useCharacterForm(options);
  const [storeActiveCharacterId, storeSetActiveCharacter] = useCharacterStore(
    (state) => [state.activeCharacterId, state.actions.setActiveCharacter]
  );
  
  // Track completion state for each step
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [currentStep, setCurrentStep] = useState<string>('');
  
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
  }, [options.characterId, storeActiveCharacterId, storeSetActiveCharacter, characterForm]);
  
  // Mark a step as completed
  const markStepComplete = (stepId: string, isComplete: boolean = true) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepId]: isComplete
    }));
  };
  
  // Validate a specific step
  const validateStep = async (stepId: string): Promise<boolean> => {
    // Get the fields relevant to this step
    const stepFields = getStepFields(stepId);
    
    // Trigger validation only for the fields in this step
    const isValid = await characterForm.trigger(stepFields as any);
    
    // Mark the step as complete if valid
    if (isValid) {
      markStepComplete(stepId, true);
    }
    
    return isValid;
  };
  
  // Helper to get fields for a specific step
  const getStepFields = (stepId: string): string[] => {
    // Map step IDs to their relevant form fields
    // This would need to be customized for your application's step structure
    const stepFieldMap: Record<string, string[]> = {
      basicInfo: ['name', 'alignment'],
      species: ['species'],
      class: ['class', 'level'],
      abilities: ['abilityScores'],
      background: ['background', 'backstory'],
      skills: ['skills'],
      equipment: ['equipment', 'credits'],
      powers: ['powers'],
    };
    
    return stepFieldMap[stepId] || [];
  };
  
  // Calculate overall completion percentage
  const getCompletionPercentage = (): number => {
    const totalSteps = Object.keys(getStepFields('all')).length;
    const completedCount = Object.values(completedSteps).filter(Boolean).length;
    return Math.round((completedCount / totalSteps) * 100);
  };
  
  return {
    ...characterForm,
    activeCharacterId: options.characterId || storeActiveCharacterId,
    completedSteps,
    currentStep,
    setCurrentStep,
    markStepComplete,
    validateStep,
    getCompletionPercentage
  };
};

export default useCharacterForm;
