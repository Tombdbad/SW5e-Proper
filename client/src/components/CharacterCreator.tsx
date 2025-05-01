
import { FC, useEffect, useState } from 'react';
import { Tab } from '@headlessui/react';
import { FormProvider } from 'react-hook-form';
import { useCharacterForm } from '../hooks/useCharacterForm';
import { useCharacterStore } from '../lib/stores/useCharacterStore';
import TranslucentPane from './ui/TranslucentPane';

// Import step components
import BasicInfoStep from './CharacterCreation/BasicInfo';
import SpeciesSelectionStep from './CharacterCreation/SpeciesSelection';
import ClassSelectionStep from './CharacterCreation/ClassSelection';
import AbilityScoresStep from './CharacterCreation/AbilityScores';
import BackgroundSelection from './CharacterCreation/BackgroundSelection';
import FeatsSelection from './CharacterCreation/FeatsSelection';
import EquipmentSelection from './CharacterCreation/EquipmentSelection';
import PowersSelection from './CharacterCreation/PowersSelection';

// Import navigation components
import StepNavigation from './CharacterCreator/StepNavigation';
import { ValidationProgress } from './CharacterCreation/ValidationProgress';
import SaveControls from './CharacterCreator/SaveControls';
import { calculateCharacterStats } from '../lib/sw5e/characterCalculation';

/**
 * CharacterCreator provides a step-by-step guided character creation experience
 * It uses components from CharacterCreation but provides a more structured flow
 */
const CharacterCreator: FC = () => {
  const { form, onSubmit, isDirty, saveCharacter } = useCharacterForm();
  const { currentStep, setCurrentStep, completedSteps, markStepComplete } = useCharacterStore();
  const [stepProgress, setStepProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [characterPreview, setCharacterPreview] = useState(null);

  const steps = [
    { id: 0, name: 'Basic Info', component: BasicInfoStep },
    { id: 1, name: 'Species', component: SpeciesSelectionStep },
    { id: 2, name: 'Class', component: ClassSelectionStep },
    { id: 3, name: 'Abilities', component: AbilityScoresStep },
    { id: 4, name: 'Background', component: BackgroundSelection },
    { id: 5, name: 'Powers', component: PowersSelection },
    { id: 6, name: 'Feats', component: FeatsSelection },
    { id: 7, name: 'Equipment', component: EquipmentSelection },
  ];

  // Watch for form changes to validate steps and update character preview
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      const currentValues = form.getValues();

      // Define validation logic for each step
      const stepValidation = {
        0: !!currentValues.name && !!currentValues.level,
        1: !!currentValues.species,
        2: !!currentValues.class,
        3: currentValues.abilityScores && Object.values(currentValues.abilityScores).every(score => score > 0),
        4: !!currentValues.background, 
        5: true, // Powers are optional but should be available
        6: true, // Feats are optional
        7: true, // Equipment can be added later
      };

      // Calculate step completion percentage for progress indicator
      if (currentStep === 3 && currentValues.abilityScores) {
        const filledScores = Object.values(currentValues.abilityScores).filter(score => score > 0).length;
        setStepProgress(Math.round((filledScores / 6) * 100));
      } else if (currentStep === 5 && currentValues.powers) {
        // For powers, progress could be based on points used vs available
        // This is a simplified version
        setStepProgress(currentValues.powers?.length > 0 ? 100 : 0);
      } else {
        // Binary completion for other steps
        setStepProgress(stepValidation[currentStep] ? 100 : 0);
      }

      // Update completed steps
      if (stepValidation[currentStep] !== undefined) {
        markStepComplete(currentStep, stepValidation[currentStep]);
      }

      // Update character preview whenever relevant form values change
      if (currentValues.abilityScores || currentValues.species || currentValues.class || currentValues.level) {
        // This would use real data from your stores in a full implementation
        const statsPreview = calculateCharacterStats(currentValues);
        setCharacterPreview(statsPreview);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, currentStep, markStepComplete]);

  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <TranslucentPane className="p-6">
            <h1 className="text-2xl font-bold mb-6 text-yellow-400">Create Your Character</h1>

            <FormProvider {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="mb-6">
                  <Tab.Group selectedIndex={currentStep} onChange={setCurrentStep}>
                    <Tab.List className="flex space-x-1 rounded-xl bg-gray-800 p-1 overflow-x-auto">
                      {steps.map((step) => (
                        <Tab
                          key={step.id}
                          className={({ selected }) =>
                            `flex-1 whitespace-nowrap rounded-lg py-2.5 text-sm font-medium leading-5
                            ${
                              selected
                                ? 'bg-gray-700 text-yellow-400 shadow'
                                : 'text-gray-400 hover:bg-gray-700/[0.3] hover:text-white'
                            }
                            ${completedSteps[step.id] ? 'text-green-400' : ''}`
                          }
                        >
                          {step.name}
                        </Tab>
                      ))}
                    </Tab.List>
                    <Tab.Panels className="mt-4">
                      {steps.map((step) => (
                        <Tab.Panel key={step.id} className="rounded-xl p-3">
                          <step.component showPreview={showPreview} />
                        </Tab.Panel>
                      ))}
                    </Tab.Panels>
                  </Tab.Group>
                </div>

                <StepNavigation
                  currentStep={currentStep}
                  onPrev={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  onNext={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                  onSubmit={form.handleSubmit(onSubmit)}
                  isSubmitting={false}
                  isFirstStep={currentStep === 0}
                  isLastStep={currentStep === steps.length - 1}
                  togglePreview={togglePreview}
                  isStepValid={completedSteps[currentStep] || false}
                  stepProgress={stepProgress}
                />
              </form>
            </FormProvider>
          </TranslucentPane>
        </div>

        <div className="space-y-4">
          <TranslucentPane className="p-6">
            <ValidationProgress 
              steps={steps} 
              currentStep={currentStep} 
              completedSteps={completedSteps} 
            />
          </TranslucentPane>

          <TranslucentPane className="p-6">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4">Creation Help</h3>
            <p className="text-sm text-gray-300">
              Complete each step to build your character. Green tabs indicate completed sections.
              You can navigate between steps using the Previous and Next buttons.
            </p>
            <div className="mt-4 text-sm text-gray-400">
              <p>Current step: {steps[currentStep]?.name}</p>
              <p className="mt-1">
                {completedSteps[currentStep] 
                  ? "✓ This step is complete" 
                  : "⚠ Complete this step to proceed"}
              </p>
            </div>
            
            {/* Step-specific help content */}
            {currentStep === 3 && (
              <div className="mt-3 p-3 bg-gray-800 rounded-md text-xs">
                <h4 className="text-yellow-300 font-medium mb-1">Ability Scores Tips:</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  <li>STR is important for melee weapons and physical checks</li>
                  <li>DEX affects initiative, ranged attacks, and armor class</li>
                  <li>CON increases your hit points</li>
                  <li>INT is key for tech-focused classes</li>
                  <li>WIS is essential for force users</li>
                  <li>CHA helps with social interactions</li>
                </ul>
              </div>
            )}
            
            {currentStep === 5 && (
              <div className="mt-3 p-3 bg-gray-800 rounded-md text-xs">
                <h4 className="text-yellow-300 font-medium mb-1">Powers Available:</h4>
                <p className="text-gray-300">
                  Based on your class selection, you have access to:
                  {form.getValues().class === 'consular' || form.getValues().class === 'guardian' 
                    ? ' Force powers' 
                    : form.getValues().class === 'engineer' || form.getValues().class === 'scholar'
                    ? ' Tech powers'
                    : ' No powers'}
                </p>
              </div>
            )}
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default CharacterCreator;
