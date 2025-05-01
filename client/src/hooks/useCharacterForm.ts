import { useForm, FormProvider, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { CharacterSchema, Character, useCharacter } from '../lib/stores/useCharacter';
import { calculateModifier } from '../lib/sw5e/rules';

// Schema for form validation
const formSchema = CharacterSchema;
type CharacterFormValues = z.infer<typeof formSchema>;

interface UseCharacterFormProps {
  characterId?: string;
  defaultValues?: Partial<CharacterFormValues>;
  onSubmit?: (data: CharacterFormValues) => void;
}

export function useCharacterForm({
  characterId,
  defaultValues,
  onSubmit,
}: UseCharacterFormProps = {}) {
  // Get character store
  const { characters, activeCharacterId, actions } = useCharacter();
  const activeCharacter = useCharacter.use.derived.activeCharacter();

  // Set up form with schema validation
  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues || {
      name: '',
      species: '',
      class: '',
      level: 1,
      background: '',
      alignment: '',
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      maxHp: 10,
      currentHp: 10,
      armorClass: 10,
      speed: 30,
      skillProficiencies: [],
      savingThrowProficiencies: [],
      equipment: [],
      credits: 1000,
      startingLocation: '',
      experience: 0,
    },
    mode: 'onChange',
  });

  // Set form loading state
  const [isFormLoading, setIsFormLoading] = useState(false);

  // Track field dependencies for derived values
  const [fieldDependencies, setFieldDependencies] = useState<Record<string, string[]>>({
    maxHp: ['constitution', 'class', 'level'],
    armorClass: ['dexterity'],
    spellSaveDC: ['intelligence', 'wisdom', 'charisma', 'class', 'level'],
    passivePerception: ['wisdom', 'skillProficiencies'],
  });

  // Load character data into form
  useEffect(() => {
    // If a specific characterId is provided, use that
    const targetId = characterId || activeCharacterId;
    if (!targetId) return;

    const character = characters[targetId];
    if (character) {
      setIsFormLoading(true);

      // Reset form with character data
      form.reset(character);

      setIsFormLoading(false);
    }
  }, [characterId, activeCharacterId, characters, form.reset]);

  // Calculate derived values when dependencies change
  const calculateDerivedValues = useCallback((formValues: Partial<CharacterFormValues>) => {
    if (!formValues.abilityScores) return {};

    const updates: Partial<CharacterFormValues> = {};

    // Calculate Constitution-based Max HP
    if (formValues.level && formValues.class && formValues.abilityScores.constitution) {
      const conModifier = calculateModifier(formValues.abilityScores.constitution);
      let baseHp = 0;

      // Different classes have different hit dice
      switch(formValues.class) {
        case 'fighter':
        case 'sentinel':
          baseHp = 10 + (formValues.level - 1) * 6; // d10 hit die
          break;
        case 'berserker':
        case 'guardian':
          baseHp = 12 + (formValues.level - 1) * 7; // d12 hit die
          break;
        case 'engineer':
        case 'scout': 
          baseHp = 8 + (formValues.level - 1) * 5; // d8 hit die
          break;
        default: // scholar, consular, operative
          baseHp = 6 + (formValues.level - 1) * 4; // d6 hit die
      }

      // Add Constitution modifier for each level
      baseHp += conModifier * formValues.level;

      updates.maxHp = Math.max(1, baseHp); // Ensure at least 1 HP

      // Also set current HP if it's not already set or is higher than max
      if (!formValues.currentHp || formValues.currentHp > baseHp) {
        updates.currentHp = baseHp;
      }
    }

    // Calculate Dexterity-based Armor Class (10 + DEX modifier)
    if (formValues.abilityScores.dexterity) {
      const dexModifier = calculateModifier(formValues.abilityScores.dexterity);
      updates.armorClass = 10 + dexModifier;
    }

    return updates;
  }, []);

  // Watch form values to update derived fields
  useEffect(() => {
    const subscription = form.watch((formValues, { name, type }) => {
      // Only recalculate when a dependency field changes
      if (!name || type !== 'change') return;

      // Find fields that depend on the changed field
      const fieldsToUpdate: string[] = [];
      Object.entries(fieldDependencies).forEach(([field, dependencies]) => {
        if (dependencies.some(dep => name.includes(dep))) {
          fieldsToUpdate.push(field);
        }
      });

      if (fieldsToUpdate.length > 0) {
        // Calculate new values
        const updates = calculateDerivedValues(formValues as Partial<CharacterFormValues>);

        // Update form fields without triggering validation
        Object.entries(updates).forEach(([field, value]) => {
          if (fieldsToUpdate.includes(field)) {
            form.setValue(field as any, value, { shouldValidate: false });
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, fieldDependencies, calculateDerivedValues]);

  // Handle form submission
  const handleSubmit = async (data: CharacterFormValues) => {
    try {
      // Validate with schema
      const validatedData = formSchema.parse(data);

      // If we have an active character, update it
      if (characterId || activeCharacterId) {
        const id = characterId || activeCharacterId!;
        await actions.updateCharacter(id, validatedData);
      } else {
        // Otherwise create a new character
        await actions.createCharacter(validatedData);
      }

      // Call custom onSubmit handler if provided
      if (onSubmit) {
        onSubmit(validatedData);
      }

      return true;
    } catch (error) {
      console.error('Form submission error:', error);
      return false;
    }
  };

  // Set up conditional field visibility
  const getConditionalFieldProps = useCallback((fieldName: string, condition: (formData: any) => boolean) => {
    const formValues = form.getValues();
    const isVisible = condition(formValues);

    return {
      className: isVisible ? '' : 'hidden',
      'aria-hidden': !isVisible,
      disabled: !isVisible,
    };
  }, [form]);

  // Create multi-step form state
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<string[]>([
    'basic-info',
    'ability-scores',
    'skills-proficiencies',
    'equipment',
    'powers',
    'background',
    'review',
  ]);

  const moveToNextStep = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const moveToPreviousStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, steps.length - 1)));
  }, [steps.length]);

  // Check if step is valid before allowing navigation
  const isStepValid = useCallback(async (step: number) => {
    const formData = form.getValues();

    // Define validations for each step
    const stepValidations: Record<number, (data: any) => Promise<boolean>> = {
      0: async (data) => { // Basic info
        const basicInfoSchema = z.object({
          name: z.string().min(1),
          species: z.string().min(1),
          class: z.string().min(1),
          background: z.string().min(1),
          alignment: z.string().min(1),
        });

        try {
          basicInfoSchema.parse(data);
          return true;
        } catch (error) {
          return false;
        }
      },
      1: async (data) => { // Ability scores
        const abilityScoresSchema = z.object({
          abilityScores: z.object({
            strength: z.number().min(3).max(20),
            dexterity: z.number().min(3).max(20),
            constitution: z.number().min(3).max(20),
            intelligence: z.number().min(3).max(20),
            wisdom: z.number().min(3).max(20),
            charisma: z.number().min(3).max(20),
          }),
        });

        try {
          abilityScoresSchema.parse(data);
          return true;
        } catch (error) {
          return false;
        }
      },
      // Add validation for other steps as needed
    };

    // If we have validation for this step, run it
    if (stepValidations[step]) {
      return await stepValidations[step](formData);
    }

    // Default to true if no validation defined
    return true;
  }, [form]);

  // Helper to try to navigate to next step with validation
  const tryMoveToNextStep = useCallback(async () => {
    // Validate current step
    const isValid = await isStepValid(currentStep);

    if (isValid) {
      moveToNextStep();
      return true;
    } else {
      // Trigger form validation to show errors
      await form.trigger();
      return false;
    }
  }, [currentStep, form, isStepValid, moveToNextStep]);

  // Calculate validation progress
  const validationProgress = useMemo(() => {
    const formData = form.getValues();
    const errors = form.formState.errors;

    // Count required fields
    const requiredFields = [
      'name', 'species', 'class', 'background', 'alignment',
      'abilityScores.strength', 'abilityScores.dexterity', 'abilityScores.constitution',
      'abilityScores.intelligence', 'abilityScores.wisdom', 'abilityScores.charisma',
      'maxHp', 'armorClass', 'speed', 'startingLocation'
    ];

    const filledFields = requiredFields.filter(field => {
      const fieldParts = field.split('.');
      let value;

      if (fieldParts.length === 1) {
        value = formData[field as keyof typeof formData];
      } else if (fieldParts.length === 2) {
        const [obj, prop] = fieldParts;
        value = formData[obj as keyof typeof formData]?.[prop];
      }

      return value !== undefined && value !== null && value !== '';
    });

    // Calculate progress percentage
    return Math.round((filledFields.length / requiredFields.length) * 100);
  }, [form]);

  return {
    form,
    FormProvider,
    isLoading: isFormLoading,
    handleSubmit: form.handleSubmit(handleSubmit),
    getConditionalFieldProps,
    watch: form.watch,
    setValue: form.setValue,
    getValues: form.getValues,
    trigger: form.trigger,
    formState: form.formState,
    errors: form.formState.errors,
    register: form.register,
    reset: form.reset,
    control: form.control,

    // Multi-step form
    currentStep,
    moveToNextStep: tryMoveToNextStep,
    moveToPreviousStep,
    goToStep,
    steps,
    setSteps,
    isStepValid,
    validationProgress,

    // Character data
    character: activeCharacter,
    characterId: characterId || activeCharacterId,
  };
}

// Additional hook for character form field-level validation
export function useCharacterFieldValidation(fieldName: string) {
  const { formState, register, watch } = useForm();
  const fieldValue = watch(fieldName);
  const error = formState.errors[fieldName as keyof typeof formState.errors];

  return {
    register,
    value: fieldValue,
    error,
    isValid: !error,
    isDirty: formState.dirtyFields[fieldName as keyof typeof formState.dirtyFields],
  };
}

export default useCharacterForm;