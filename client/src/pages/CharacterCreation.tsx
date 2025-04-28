import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import SpeciesSelection from '../components/CharacterCreation/SpeciesSelection';
import ClassSelection from '../components/CharacterCreation/ClassSelection';
import AbilityScores from '../components/CharacterCreation/AbilityScores';
import BackgroundSelection from '../components/CharacterCreation/BackgroundSelection';
import EquipmentSelection from '../components/CharacterCreation/EquipmentSelection';
import TranslucentPane from '../components/ui/TranslucentPane';

const characterSchema = z.object({
  name: z.string().min(2, { message: "Character name must be at least 2 characters" }),
  species: z.string().min(1, { message: "Please select a species" }),
  class: z.string().min(1, { message: "Please select a class" }),
  abilities: z.object({
    strength: z.number().min(3).max(18),
    dexterity: z.number().min(3).max(18),
    constitution: z.number().min(3).max(18),
    intelligence: z.number().min(3).max(18),
    wisdom: z.number().min(3).max(18),
    charisma: z.number().min(3).max(18),
  }),
  background: z.string().min(1, { message: "Please select a background" }),
  equipment: z.array(z.string()),
  credits: z.number().min(0),
});

type CharacterData = z.infer<typeof characterSchema>;

export default function CharacterCreation() {
  const [currentTab, setCurrentTab] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<CharacterData>({
    resolver: zodResolver(characterSchema),
    defaultValues: {
      name: '',
      species: '',
      class: '',
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      background: '',
      equipment: [],
      credits: 500,
    }
  });

  const { handleSubmit, formState } = methods;
  const { errors, isValid } = formState;

  const navigate = useNavigate();
  
  const onSubmit = async (data: CharacterData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create character');
      const character = await response.json();
      
      // Navigate to campaign creator with new character
      navigate(`/campaign/create?characterId=${character.id}`);
    } catch (error) {
      console.error('Error creating character:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { name: 'Species', component: <SpeciesSelection form={methods} /> },
    { name: 'Class', component: <ClassSelection form={methods} /> },
    { name: 'Abilities', component: <AbilityScores form={methods} /> },
    { name: 'Background', component: <BackgroundSelection form={methods} /> },
    { name: 'Equipment', component: <EquipmentSelection form={methods} /> },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black bg-opacity-30">
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-6xl">
          <TranslucentPane className="p-6">
            <h1 className="text-3xl font-bold text-yellow-400 mb-8">Character Creation</h1>

            <Tab.Group selectedIndex={currentTab} onChange={setCurrentTab}>
              <Tab.List className="flex space-x-1 bg-gray-800 bg-opacity-50 p-1 rounded-lg">
                {tabs.map((tab) => (
                  <Tab
                    key={tab.name}
                    className={({ selected }) =>
                      `px-3 py-2 text-sm font-medium rounded-md focus:outline-none ${
                        selected
                          ? 'bg-yellow-600 text-white'
                          : 'text-yellow-400 hover:bg-gray-700'
                      }`
                    }
                  >
                    {tab.name}
                  </Tab>
                ))}
              </Tab.List>

              <Tab.Panels className="mt-4">
                {tabs.map((tab, idx) => (
                  <Tab.Panel key={idx}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <TranslucentPane className="p-4">
                        {tab.component}
                      </TranslucentPane>
                    </motion.div>
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentTab(Math.max(0, currentTab - 1))}
                disabled={currentTab === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:bg-gray-600 disabled:text-gray-400"
              >
                Previous
              </button>

              {currentTab === tabs.length - 1 ? (
                <button
                  type="submit"
                  disabled={!isValid || isSubmitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:bg-gray-600 disabled:text-gray-400"
                >
                  {isSubmitting ? 'Creating...' : 'Create Character'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentTab(Math.min(tabs.length - 1, currentTab + 1))}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  Next
                </button>
              )}
            </div>
          </TranslucentPane>
        </form>
      </FormProvider>
    </div>
  );
}