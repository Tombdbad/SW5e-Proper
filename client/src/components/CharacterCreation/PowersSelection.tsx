import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCharacter } from '../../lib/stores/useCharacter';
import { Tab } from '@headlessui/react';
import TranslucentPane from '../ui/TranslucentPane';
import { Button } from '../ui/button';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// Define schema for power selection
const PowerSelectionSchema = z.object({
  forcePowers: z.array(z.string()).optional(),
  techPowers: z.array(z.string()).optional(),
});

type PowerSelectionData = z.infer<typeof PowerSelectionSchema>;

// Mock data until we have the real data
const MOCK_FORCE_POWERS = [
  { id: "fp1", name: "Force Push", level: 1, description: "Push a target away using the Force" },
  { id: "fp2", name: "Force Pull", level: 1, description: "Pull a target toward you using the Force" },
  { id: "fp3", name: "Force Lightning", level: 3, description: "Channel lightning from your fingertips" },
  { id: "fp4", name: "Mind Trick", level: 2, description: "Influence the weak-minded" },
  { id: "fp5", name: "Force Healing", level: 2, description: "Use the Force to heal wounds" },
  { id: "fp6", name: "Force Choke", level: 3, description: "Choke a target using the Force" },
];

const MOCK_TECH_POWERS = [
  { id: "tp1", name: "Energy Shield", level: 1, description: "Create a protective energy shield" },
  { id: "tp2", name: "Overload Systems", level: 2, description: "Overload electronic systems causing damage" },
  { id: "tp3", name: "Holographic Disguise", level: 2, description: "Create a holographic disguise" },
  { id: "tp4", name: "Sonic Dampening", level: 1, description: "Dampen sound in an area" },
  { id: "tp5", name: "Targeting Sync", level: 1, description: "Enhance targeting systems" },
];

export default function PowersSelection() {
  const { character } = useCharacter();
  const { actions } = useCharacter();

  // Set up form with react-hook-form
  const { control, handleSubmit, setValue, watch } = useForm<PowerSelectionData>({
    resolver: zodResolver(PowerSelectionSchema),
    defaultValues: {
      forcePowers: [],
      techPowers: [],
    }
  });

  // Initialize form with character data only once on mount
  useEffect(() => {
    if (character) {
      // Extract power IDs from character data
      const forcePowerIds = character.forcePowers?.map(power => power.id) || [];
      const techPowerIds = character.techPowers?.map(power => power.id) || [];

      setValue('forcePowers', forcePowerIds);
      setValue('techPowers', techPowerIds);
    }
  }, [character?.id]); // Only update when character ID changes

  // Determine available powers based on character
  const availablePowers = useMemo(() => {
    // Default to mock data
    let forcePowers = MOCK_FORCE_POWERS;
    let techPowers = MOCK_TECH_POWERS;

    // Filter by character level, class, etc.
    if (character) {
      const characterLevel = character.level || 1;

      // Filter powers by level
      forcePowers = MOCK_FORCE_POWERS.filter(power => power.level <= Math.ceil(characterLevel / 2));
      techPowers = MOCK_TECH_POWERS.filter(power => power.level <= Math.ceil(characterLevel / 2));

      // Further filter based on class if needed
      if (character.class === 'engineer' || character.class === 'scholar') {
        // These classes focus on tech powers
        techPowers = [...techPowers]; // Keep all tech powers
        forcePowers = forcePowers.filter(power => power.level <= 1); // Limit force powers
      } else if (character.class === 'consular' || character.class === 'guardian' || character.class === 'sentinel') {
        // These classes focus on force powers
        forcePowers = [...forcePowers]; // Keep all force powers
        techPowers = techPowers.filter(power => power.level <= 1); // Limit tech powers
      }
    }

    return { forcePowers, techPowers };
  }, [character?.level, character?.class]);

  // Handle saving powers to character
  const savePowers = useCallback((data: PowerSelectionData) => {
    if (!character?.id) return;

    // Find complete power objects from selected IDs
    const selectedForce = (data.forcePowers || []).map(id => 
      availablePowers.forcePowers.find(power => power.id === id)
    ).filter(Boolean);

    const selectedTech = (data.techPowers || []).map(id => 
      availablePowers.techPowers.find(power => power.id === id)
    ).filter(Boolean);

    // Update character
    const updates = {
      forcePowers: selectedForce,
      techPowers: selectedTech,
    };

            actions.updateCharacter(character.id, updates);
          }, [character?.id, availablePowers, actions]);

          // Toggle power selection
          const togglePower = useCallback((type: 'force' | 'tech', powerId: string) => {
            setValue(type === 'force' ? 'forcePowers' : 'techPowers', prev => {
                return prev.includes(powerId) ? prev.filter(id => id !== powerId) : [...prev, powerId];
            });
          }, [setValue]);

          // Watch for form value changes (this is okay to keep)
          const watchedForcePowers = watch('forcePowers');
          const watchedTechPowers = watch('techPowers');

          return (
            <div className="p-4">
              <TranslucentPane className="p-6">
                <h2 className="text-2xl font-bold text-yellow-400 mb-4">Select Powers</h2>

                <form onSubmit={handleSubmit(savePowers)}>
          <Tab.Group>
            <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-4">
              <Tab className={({ selected }) =>
                `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
                ${selected 
                  ? 'bg-yellow-600 text-white shadow' 
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`
              }>
                Force Powers
              </Tab>
              <Tab className={({ selected }) =>
                `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
                ${selected 
                  ? 'bg-yellow-600 text-white shadow' 
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'}`
              }>
                Tech Powers
              </Tab>
            </Tab.List>

            <Tab.Panels>
              {/* Force Powers Panel */}
              <Tab.Panel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Controller
                    name="forcePowers"
                    control={control}
                    render={({ field }) => (
                      <>
                        {availablePowers.forcePowers.map(power => (
                          <motion.div
                            key={power.id}
                            whileHover={{ scale: 1.02 }}
                            className={`p-3 rounded-lg cursor-pointer ${
                              selectedForcePowers.includes(power.id)
                                ? 'bg-blue-800 border border-yellow-400'
                                : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                            onClick={() => togglePower('force', power.id)}
                          >
                            <h3 className="text-lg font-semibold">{power.name}</h3>
                            <div className="text-xs text-gray-400">Level {power.level}</div>
                            <p className="text-sm mt-1">{power.description}</p>
                          </motion.div>
                        ))}
                      </>
                    )}
                  />
                </div>
              </Tab.Panel>

              {/* Tech Powers Panel */}
              <Tab.Panel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Controller
                    name="techPowers"
                    control={control}
                    render={({ field }) => (
                      <>
                        {availablePowers.techPowers.map(power => (
                          <motion.div
                            key={power.id}
                            whileHover={{ scale: 1.02 }}
                            className={`p-3 rounded-lg cursor-pointer ${
                              watchedTechPowers.includes(power.id)
                                ? 'bg-blue-800 border border-yellow-400'
                                : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                            onClick={() => togglePower('tech', power.id)}
                          >
                            <h3 className="text-lg font-semibold">{power.name}</h3>
                            <div className="text-xs text-gray-400">Level {power.level}</div>
                            <p className="text-sm mt-1">{power.description}</p>
                          </motion.div>
                        ))}
                      </>
                    )}
                  />
                </div>
              </Tab.Panel>
            </Tab.Panels>
          </Tab.Group>

          <div className="mt-6 flex justify-end">
            <Button 
              type="submit" 
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Save Powers
            </Button>
          </div>
        </form>
      </TranslucentPane>
    </div>
  );
}