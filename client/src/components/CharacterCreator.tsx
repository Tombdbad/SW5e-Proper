
import { FC, useEffect } from 'react';
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

// Import navigation components
import StepNavigation from './CharacterCreator/StepNavigation';
import { ValidationProgress } from './CharacterCreation/ValidationProgress';
import SaveControls from './CharacterCreator/SaveControls';

/**
 * CharacterCreator provides a step-by-step guided character creation experience
 * It uses components from CharacterCreation but provides a more structured flow
 */
const CharacterCreator: FC = () => {
  const { form, onSubmit, isDirty, saveCharacter } = useCharacterForm();
  const { currentStep, setCurrentStep, completedSteps, markStepComplete } = useCharacterStore();

  const steps = [
    { id: 0, name: 'Basic Info', component: BasicInfoStep },
    { id: 1, name: 'Species', component: SpeciesSelectionStep },
    { id: 2, name: 'Class', component: ClassSelectionStep },
    { id: 3, name: 'Abilities', component: AbilityScoresStep },
    { id: 4, name: 'Background', component: BackgroundSelection },
    { id: 5, name: 'Feats', component: FeatsSelection },
    { id: 6, name: 'Equipment', component: EquipmentSelection },
  ];

  // Watch for form changes to validate steps
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      const currentValues = form.getValues();

      // Define validation logic for each step
      const stepValidation = {
        0: !!currentValues.name && !!currentValues.level,
        1: !!currentValues.species,
        2: !!currentValues.class,
        3: currentValues.abilityScores && Object.values(currentValues.abilityScores).every(score => score > 0),
        4: true, // Background is optional
        5: true, // Feats are optional
        6: true, // Equipment can be added later
      };

      // Update completed steps
      if (stepValidation[currentStep] !== undefined) {
        markStepComplete(currentStep, stepValidation[currentStep]);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, currentStep, markStepComplete]);

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
                    <Tab.List className="flex space-x-1 rounded-xl bg-gray-800 p-1">
                      {steps.map((step) => (
                        <Tab
                          key={step.id}
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5
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
                          <step.component />
                        </Tab.Panel>
                      ))}
                    </Tab.Panels>
                  </Tab.Group>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    type="button"
                    className="px-4 py-2 bg-gray-600 text-white rounded-md disabled:opacity-50"
                    onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                    disabled={currentStep === 0}
                  >
                    Previous
                  </button>

                  <div className="space-x-2">
                    <SaveControls onSave={saveCharacter} isDirty={isDirty} />

                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
                      onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                      disabled={currentStep === steps.length - 1 || !completedSteps[currentStep]}
                    >
                      Next
                    </button>
                  </div>
                </div>
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
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default CharacterCreator;
