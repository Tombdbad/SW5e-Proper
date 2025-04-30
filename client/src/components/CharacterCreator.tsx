
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

              const CharacterCreator: FC = () => {
                const { form, onSubmit } = useCharacterForm();
                const { currentStep, setCurrentStep, completedSteps } = useCharacterStore();

                const steps = [
                  { id: 0, name: 'Basic Info', component: BasicInfoStep },
                  { id: 1, name: 'Species', component: SpeciesSelectionStep },
                  { id: 2, name: 'Class', component: ClassSelectionStep },
                  { id: 3, name: 'Abilities', component: AbilityScoresStep },
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