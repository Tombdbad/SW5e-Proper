
import { useForm, FormProvider, UseFormReturn, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useCharacter } from '@/lib/stores/useCharacter';
import { Character, CharacterSchema } from '@shared/unifiedSchema';
import { useToast } from '@/components/ui/toast';
import { usePerformance } from '@/lib/performance/monitor';
import { v4 as uuidv4 } from 'uuid';

// Define the form steps for character creation
export type CharacterFormStep = 
  | 'basicInfo'
  | 'species'
  | 'class'
  | 'abilities'
  | 'skills'
  | 'equipment'
  | 'powers'
  | 'background'
  | 'appearance'
  | 'review';

// Basic initial form values
const defaultValues: Partial<Character> = {
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
  temporaryHp: 0,
  armorClass: 10,
  speed: 30,
  skillProficiencies: [],
  savingThrowProficiencies: [],
  equipment: [],
  credits: 1000,
  backstory: '',
  startingLocation: 'Unknown',
  experience: 0,
  forcePowers: [],
  techPowers: [],
  feats: [],
  languages: [],
  maxForcePoints: 0,
  currentForcePoints: 0,
  proficiencyBonus: 2,
};

export interface UseCharacterFormProps {
  characterId?: string;  // For editing existing character
  initialStep?: CharacterFormStep;
  onComplete?: (character: Character) => void;
  autoSave?: boolean;    // Whether to auto-save as draft
  autoSaveInterval?: number;  // How often to auto-save (ms)
}

export default function useCharacterForm({
  characterId,
  initialStep = 'basicInfo',
  onComplete,
  autoSave = true,
  autoSaveInterval = 30000, // Default 30 seconds
}: UseCharacterFormProps = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    characters, 
    addCharacter, 
    updateCharacterData, 
    fetchCharacter 
  } = useCharacter();
  const { measureOperation, measureAsyncOperation } = usePerformance('characterForm');

  // Current step state
  const [currentStep, setCurrentStep] = useState<CharacterFormStep>(initialStep);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSaveTimestamp, setAutoSaveTimestamp] = useState<number | null>(null);
  const [validatedSteps, setValidatedSteps] = useState<Record<CharacterFormStep, boolean>>({
    basicInfo: false,
    species: false,
    class: false,
    abilities: false,
    skills: false,
    equipment: false,
    powers: false,
    background: false,
    appearance: false,
    review: false,
  });

  // Initialize form with default values or existing character
  const existingCharacter = characterId ? characters[characterId] : null;
  
  // Create form with Zod validation
  const form = useForm<Character>({
    resolver: zodResolver(CharacterSchema),
    defaultValues: existingCharacter || defaultValues,
    mode: 'onChange',
  });
  
  // Fetch character data if editing
  useEffect(() => {
    if (characterId && !existingCharacter) {
      fetchCharacter(characterId);
    }
  }, [characterId, existingCharacter, fetchCharacter]);
  
  // Update form if character data changes
  useEffect(() => {
    if (characterId && existingCharacter) {
      form.reset(existingCharacter);
    }
  }, [characterId, existingCharacter, form]);
  
  // Set up auto-save if enabled
  useEffect(() => {
    if (!autoSave) return;
    
    const timer = setInterval(() => {
      const formData = form.getValues();
      const isValid = Object.keys(form.formState.errors).length === 0;
      
      if (isValid && form.formState.isDirty) {
        handleAutoSave();
      }
    }, autoSaveInterval);
    
    return () => clearInterval(timer);
  }, [autoSave, autoSaveInterval, form]);
  
  // Auto-save current form data
  const handleAutoSave = useCallback(async () => {
    const formData = form.getValues();
    
    try {
      // For new characters
      if (!characterId) {
        // Generate a temporary ID
        const tempCharacter: Character = {
          ...formData,
          id: uuidv4(),
          version: 1,
          syncStatus: 'local',
        };
        
        await addCharacter(tempCharacter);
        setAutoSaveTimestamp(Date.now());
        
        toast({
          title: "Draft saved",
          description: "Your character has been saved as a draft.",
          variant: "default",
        });
      } 
      // For existing characters
      else {
        await updateCharacterData(characterId, formData);
        setAutoSaveTimestamp(Date.now());
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast({
        title: "Auto-save failed",
        description: "Could not save your progress. Please save manually.",
        variant: "destructive",
      });
    }
  }, [addCharacter, characterId, form, toast, updateCharacterData]);
  
  // Watch all fields for two-way binding with store
  const formValues = useWatch({ control: form.control });
  
  // Update character in store if it exists and form changes
  useEffect(() => {
    if (characterId && form.formState.isDirty) {
      // Debounce updates to prevent excessive store updates
      const timer = setTimeout(() => {
        const updates = form.getValues();
        updateCharacterData(characterId, updates);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [characterId, form, formValues, updateCharacterData]);
  
  // Validate the current step
  const validateStep = useCallback(async (step: CharacterFormStep): Promise<boolean> => {
    return measureAsyncOperation('validateStep', async () => {
      let isValid = false;
      
      switch (step) {
        case 'basicInfo':
          isValid = await form.trigger(['name', 'alignment']);
          break;
        case 'species':
          isValid = await form.trigger('species');
          break;
        case 'class':
          isValid = await form.trigger(['class', 'level']);
          break;
        case 'abilities':
          isValid = await form.trigger('abilityScores');
          break;
        case 'skills':
          isValid = await form.trigger(['skillProficiencies', 'savingThrowProficiencies']);
          break;
        case 'equipment':
          isValid = await form.trigger(['equipment', 'credits']);
          break;
        case 'powers':
          isValid = true; // Optional, no required fields
          break;
        case 'background':
          isValid = await form.trigger(['background', 'backstory']);
          break;
        case 'appearance':
          isValid = true; // Optional, no required fields
          break;
        case 'review':
          isValid = await form.trigger(); // Validate all fields
          break;
        default:
          isValid = true;
      }
      
      // Update validation state
      setValidatedSteps(prev => ({
        ...prev,
        [step]: isValid
      }));
      
      return isValid;
    });
  }, [form, measureAsyncOperation]);
  
  // Navigate to next step if current step is valid
  const nextStep = useCallback(async (): Promise<boolean> => {
    const isCurrentStepValid = await validateStep(currentStep);
    
    if (!isCurrentStepValid) {
      toast({
        title: "Validation Error",
        description: "Please complete all required fields before proceeding.",
        variant: "destructive",
      });
      return false;
    }
    
    const steps: CharacterFormStep[] = [
      'basicInfo',
      'species',
      'class',
      'abilities',
      'skills',
      'equipment',
      'powers',
      'background',
      'appearance',
      'review'
    ];
    
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
      return true;
    }
    
    return false;
  }, [currentStep, toast, validateStep]);
  
  // Navigate to previous step
  const prevStep = useCallback(() => {
    const steps: CharacterFormStep[] = [
      'basicInfo',
      'species',
      'class',
      'abilities',
      'skills',
      'equipment',
      'powers',
      'background',
      'appearance',
      'review'
    ];
    
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);
  
  // Jump to a specific step
  const goToStep = useCallback((step: CharacterFormStep) => {
    setCurrentStep(step);
  }, []);
  
  // Calculate progress percentage
  const progress = useMemo(() => {
    const steps: CharacterFormStep[] = [
      'basicInfo',
      'species',
      'class',
      'abilities',
      'skills',
      'equipment',
      'powers',
      'background',
      'appearance',
      'review'
    ];
    
    // Count completed steps
    const completedSteps = Object.entries(validatedSteps)
      .filter(([_, isValid]) => isValid)
      .length;
    
    return (completedSteps / steps.length) * 100;
  }, [validatedSteps]);
  
  // Handle form submission
  const handleSubmit = useCallback(async () => {
    return measureAsyncOperation('submitForm', async () => {
      // Final validation
      const isValid = await form.trigger();
      if (!isValid) {
        toast({
          title: "Validation Error",
          description: "Please complete all required fields before submitting.",
          variant: "destructive",
        });
        return;
      }
      
      setIsSubmitting(true);
      
      try {
        const formData = form.getValues();
        
        // For editing existing character
        if (characterId) {
          await updateCharacterData(characterId, formData);
          toast({
            title: "Character Updated",
            description: "Your character has been updated successfully.",
          });
        } 
        // For creating new character
        else {
          const newCharacter: Character = {
            ...formData,
            id: uuidv4(),
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          await addCharacter(newCharacter);
          toast({
            title: "Character Created",
            description: "Your character has been created successfully.",
          });
        }
        
        // Call onComplete callback if provided
        if (onComplete) {
          onComplete(formData);
        } else {
          // Navigate to character management by default
          navigate('/characters');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        toast({
          title: "Submission Error",
          description: "There was an error saving your character. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  }, [addCharacter, characterId, form, navigate, onComplete, toast, updateCharacterData, measureAsyncOperation]);
  
  // Calculate if form has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return form.formState.isDirty && (
      !autoSaveTimestamp || 
      Date.now() - autoSaveTimestamp > autoSaveInterval
    );
  }, [form.formState.isDirty, autoSaveTimestamp, autoSaveInterval]);
  
  // Provide a method to manually save
  const saveChanges = useCallback(async () => {
    await handleAutoSave();
    toast({
      title: "Changes Saved",
      description: "Your changes have been saved.",
    });
  }, [handleAutoSave, toast]);
  
  // Utility to get computed ability modifiers for display
  const getAbilityModifier = useCallback((abilityScore: number): number => {
    return Math.floor((abilityScore - 10) / 2);
  }, []);
  
  // Get maximum skill proficiencies based on class and background
  const getMaxSkillProficiencies = useCallback((): number => {
    const classData = formValues.class;
    // This is placeholder logic - should be replaced with actual rule implementation
    switch (classData) {
      case 'berserker': return 2;
      case 'consular': return 4;
      case 'engineer': return 3;
      case 'fighter': return 2;
      case 'guardian': return 2;
      case 'monk': return 2;
      case 'operative': return 4;
      case 'scholar': return 3;
      case 'sentinel': return 3;
      default: return 2;
    }
  }, [formValues.class]);
  
  // Return form context and additional utilities
  return {
    form,
    currentStep,
    nextStep,
    prevStep,
    goToStep,
    isSubmitting,
    validatedSteps,
    progress,
    handleSubmit,
    saveChanges,
    hasUnsavedChanges,
    autoSaveTimestamp,
    getAbilityModifier,
    getMaxSkillProficiencies,
    isExistingCharacter: !!characterId,
    FormProvider, // Re-export for convenience
    Controller,   // Re-export for convenience
  };
}

// Helper hook for deeply watching form values in component
export function useCharacterFormWatch<TFieldName extends keyof Character>(
  formContext: UseFormReturn<Character>,
  name: TFieldName
) {
  return useWatch({
    control: formContext.control,
    name,
  });
}
