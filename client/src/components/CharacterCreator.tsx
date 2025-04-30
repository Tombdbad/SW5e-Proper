import { FC } from 'react';
import { Tab } from '@headlessui/react';
import { FormProvider } from 'react-hook-form';
import { useCharacterForm } from '../hooks/useCharacterForm';
import { useCharacterStore } from '../lib/stores/useCharacterStore';

// Import step components
import BasicInfoStep from './CharacterCreation/BasicInfo';
import SpeciesSelectionStep from './CharacterCreation/SpeciesSelection';
import ClassSelectionStep from './CharacterCreation/ClassSelection';
import AbilityScoresStep from './CharacterCreation/AbilityScores';

              // Import navigation components
              import StepNavigation from './CharacterCreator/StepNavigation';
              import ValidationProgress from './CharacterCreator/ValidationProgress';
              // Placeholder imports for advanced features
              import CharacterTemplates from './CharacterCreator/CharacterTemplates';
              import GuidedCharacterCreation from './CharacterCreator/GuidedCharacterCreation';
              import CharacterVersioning from './CharacterCreator/CharacterVersioning';
              import SaveControls from './CharacterCreator/SaveControls'; // Added for saving

              const CharacterCreator: FC = () => {
                const { form, onSubmit, isDirty, saveCharacter } = useCharacterForm(); // Added isDirty and saveCharacter
                const { currentStep, setCurrentStep, completedSteps } = useCharacterStore();

                const steps = [
                  { id: 0, name: 'Basic Info', component: BasicInfoStep },
                  { id: 1, name: 'Species', component: SpeciesSelectionStep },
                  { id: 2, name: 'Class', component: ClassSelectionStep },
                  { id: 3, name: 'Abilities', component: AbilityScoresStep },
                  { id: 4, name: 'Templates', component: CharacterTemplates }, // Added Template Step
                  { id: 5, name: 'Guided Creation', component: GuidedCharacterCreation }, // Added Guided Creation Step
                  { id: 6, name: 'Versioning', component: CharacterVersioning }, // Added Versioning Step

                ];

                return (
                  <div className="character-creator p-4">
                    <h1 className="text-2xl font-bold mb-6">Create Your Character</h1>

                    <div className="grid grid-cols-4 gap-6">
                      <div className="col-span-1">
                        <StepNavigation 
                          steps={steps}
                          currentStep={currentStep}
                          completedSteps={completedSteps}
                          onStepChange={setCurrentStep}
                        />

                        <div className="mt-6">
                          <ValidationProgress 
                            steps={steps}
                            currentStep={currentStep}
                            completedSteps={completedSteps}
                          />
                        </div>
                      </div>

                      <div className="col-span-3">
                        <FormProvider {...form}>
                          <form onSubmit={onSubmit}>
                            <Tab.Group selectedIndex={currentStep} onChange={setCurrentStep}>
                              <Tab.List className="hidden">
                                {steps.map((step) => (
                                  <Tab key={step.id}>{step.name}</Tab>
                                ))}
                              </Tab.List>

                              <Tab.Panels>
                                {steps.map((step) => (
                                  <Tab.Panel key={step.id} className="bg-gray-800 p-4 rounded-lg">
                                    <step.component />
                                  </Tab.Panel>
                                ))}
                              </Tab.Panels>
                            </Tab.Group>

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
                      </div>
                    </div>
                  </div>
                );
              };

              export default CharacterCreator;