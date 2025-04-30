
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

const CharacterCreator: FC = () => {
  const { form, onSubmit } = useCharacterForm();
  const { currentStep, setCurrentStep, completedSteps } = useCharacterStore();

  const steps = [
    { name: 'Basic Info', component: BasicInfoStep },
    { name: 'Species', component: SpeciesSelectionStep },
    { name: 'Class', component: ClassSelectionStep },
    { name: 'Abilities', component: AbilityScoresStep },
  ];

  return (
    <div className="character-creator p-4">
      <h1 className="text-2xl font-bold mb-6">Create Your Character</h1>

      <FormProvider {...form}>
        <form onSubmit={onSubmit}>
          <Tab.Group selectedIndex={currentStep} onChange={setCurrentStep}>
            <Tab.List className="flex space-x-1 bg-blue-900/20 p-1 rounded-lg">
              {steps.map((step, index) => (
                <Tab
                  key={index}
                  className={({ selected }) =>
                    `tab-item w-full py-2 text-sm font-medium rounded-md
                    ${selected ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-blue-800/30 hover:text-white'}
                    ${completedSteps[index] ? 'ring-2 ring-green-500' : ''}`
                  }
                >
                  {step.name}
                </Tab>
              ))}
            </Tab.List>

            <Tab.Panels className="mt-4">
              {steps.map((step, index) => (
                <Tab.Panel key={index} className="bg-gray-800 p-4 rounded-lg">
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
