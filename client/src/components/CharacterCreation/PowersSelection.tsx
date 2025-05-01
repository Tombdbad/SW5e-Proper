import React, { useState, useEffect } from 'react';
import TranslucentPane from '../ui/TranslucentPane';
import { Tab } from '@headlessui/react';
import { FORCE_POWERS } from '@/lib/sw5e/forcePowers';
import { TECH_POWERS } from '@/lib/sw5e/techPowers';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

interface PowersSelectionProps {
  form: any;
  getSelectedClass: () => any;
}

export default function PowersSelection({ form, getSelectedClass }: PowersSelectionProps) {
  const { watch, setValue } = form;
  const selectedClass = getSelectedClass();

  const selectedPowers = watch('powers') || [];

  const isForceUser = selectedClass?.powerType === 'force';
  const isTechUser = selectedClass?.powerType === 'tech';

  const [selectedForce, setSelectedForce] = useState<string[]>([]);
  const [selectedTech, setSelectedTech] = useState<string[]>([]);

  // Initialize selected powers from form data
  useEffect(() => {
    const forcePowers = selectedPowers
      .filter((p: any) => p.type === 'force')
      .map((p: any) => p.id);

    const techPowers = selectedPowers
      .filter((p: any) => p.type === 'tech')
      .map((p: any) => p.id);

    setSelectedForce(forcePowers);
    setSelectedTech(techPowers);
  }, [selectedPowers]);

  // Group powers by level
  const groupByLevel = (powers: any[]) => {
    return powers.reduce((acc: any, power: any) => {
      const level = power.level;
      if (!acc[level]) acc[level] = [];
      acc[level].push(power);
      return acc;
    }, {});
  };

  const forcePowersByLevel = groupByLevel(FORCE_POWERS);
  const techPowersByLevel = groupByLevel(TECH_POWERS);

  // Handle power selection
  const togglePower = (powerId: string, powerType: 'force' | 'tech') => {
    const powerList = powerType === 'force' ? selectedForce : selectedTech;
    const setPowerList = powerType === 'force' ? setSelectedForce : setSelectedTech;

    if (powerList.includes(powerId)) {
      setPowerList(powerList.filter(id => id !== powerId));
    } else {
      // Check max powers logic here
      setPowerList([...powerList, powerId]);
    }

    // Update the form values
    const updatedPowers = [
      ...selectedPowers.filter((p: any) => p.type !== powerType),
      ...getPowersFromSelected(powerType)
    ];

    setValue('powers', updatedPowers);
  };

  // Convert selected power IDs to actual power objects
  const getPowersFromSelected = (powerType: 'force' | 'tech') => {
    const selectedIds = powerType === 'force' ? selectedForce : selectedTech;
    const powersList = powerType === 'force' ? FORCE_POWERS : TECH_POWERS;

    return selectedIds.map(id => {
      const power = powersList.find(p => p.id === id);
      if (!power) return null;

      return {
        id,
        name: power.name,
        type: powerType,
        level: power.level,
        description: power.description
      };
    }).filter(Boolean);
  };

  // If not a power user, show a message
  if (!isForceUser && !isTechUser) {
    return (
      <div className="text-center p-6">
        <p className="text-yellow-400 text-lg">Your class does not use Force or Tech powers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Power Selection</h2>

      <TranslucentPane className="p-4">
        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl bg-gray-800 p-1">
            {isForceUser && (
              <Tab
                className={({ selected }) =>
                  classNames(
                    'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                    'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none',
                    selected
                      ? 'bg-blue-900 text-white shadow'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  )
                }
              >
                Force Powers
              </Tab>
            )}
            {isTechUser && (
              <Tab
                className={({ selected }) =>
                  classNames(
                    'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                    'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none',
                    selected
                      ? 'bg-green-900 text-white shadow'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  )
                }
              >
                Tech Powers
              </Tab>
            )}
          </Tab.List>
          <Tab.Panels className="mt-2">
            {isForceUser && (
              <Tab.Panel className="rounded-xl bg-gray-900 bg-opacity-50 p-3">
                <div className="space-y-4">
                  {Object.entries(forcePowersByLevel).map(([level, powers]) => (
                    <div key={`force-${level}`} className="bg-gray-800 bg-opacity-70 rounded-lg p-4">
                      <h3 className="text-yellow-400 font-semibold text-lg border-b border-gray-700 pb-2 mb-3">
                        Level {level} Force Powers
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(powers as any[]).map((power) => (
                          <div
                            key={`force-power-${power.id}`}
                            className={`p-2 rounded cursor-pointer ${
                              selectedForce.includes(power.id)
                                ? 'bg-blue-900 bg-opacity-50'
                                : 'hover:bg-gray-700'
                            }`}
                            onClick={() => togglePower(power.id, 'force')}
                          >
                            <div className="flex items-center">
                              <div
                                className={`w-4 h-4 border rounded mr-2 ${
                                  selectedForce.includes(power.id)
                                    ? 'bg-blue-500 border-blue-600'
                                    : 'border-gray-500'
                                }`}
                              />
                              <span className="font-medium">{power.name}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{power.shortDescription}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Tab.Panel>
            )}
            {isTechUser && (
              <Tab.Panel className="rounded-xl bg-gray-900 bg-opacity-50 p-3">
                <div className="space-y-4">
                  {Object.entries(techPowersByLevel).map(([level, powers]) => (
                    <div key={`tech-${level}`} className="bg-gray-800 bg-opacity-70 rounded-lg p-4">
                      <h3 className="text-yellow-400 font-semibold text-lg border-b border-gray-700 pb-2 mb-3">
                        Level {level} Tech Powers
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(powers as any[]).map((power) => (
                          <div
                            key={`tech-power-${power.id}`}
                            className={`p-2 rounded cursor-pointer ${
                              selectedTech.includes(power.id)
                                ? 'bg-green-900 bg-opacity-50'
                                : 'hover:bg-gray-700'
                            }`}
                            onClick={() => togglePower(power.id, 'tech')}
                          >
                            <div className="flex items-center">
                              <div
                                className={`w-4 h-4 border rounded mr-2 ${
                                  selectedTech.includes(power.id)
                                    ? 'bg-green-500 border-green-600'
                                    : 'border-gray-500'
                                }`}
                              />
                              <span className="font-medium">{power.name}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{power.shortDescription}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Tab.Panel>
            )}
          </Tab.Panels>
        </Tab.Group>
      </TranslucentPane>
    </div>
  );
}