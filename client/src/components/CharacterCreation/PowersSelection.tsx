
import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { TranslucentPane } from '@/components/ui/TranslucentPane';
import { Controller, useFormContext } from 'react-hook-form';
import { ForcePower, TechPower } from '@shared/unifiedSchema';
import { useToast } from '@/components/ui/use-toast';
import SW5E from '@/lib/sw5e/dataProvider';
import { useCharacterFormWatch } from '@/hooks/useCharacterForm';
import { Character } from '@shared/unifiedSchema';
import { getPowerProgression } from '@/lib/sw5e/classes';

interface PowersSelectionProps {
  onContinue: () => void;
}

const PowersSelection: React.FC<PowersSelectionProps> = ({ onContinue }) => {
  const form = useFormContext<Character>();
  const { toast } = useToast();
  
  // Watch values from the form
  const characterClass = useCharacterFormWatch(form, 'class');
  const characterLevel = useCharacterFormWatch(form, 'level');
  const watchedForcePowers = useCharacterFormWatch(form, 'forcePowers') || [];
  const watchedTechPowers = useCharacterFormWatch(form, 'techPowers') || [];

  // Ensure we always have arrays for powers
  const selectedForcePowers = Array.isArray(watchedForcePowers) ? watchedForcePowers : [];
  const selectedTechPowers = Array.isArray(watchedTechPowers) ? watchedTechPowers : [];
  
  // Local state
  const [availableForcePowers, setAvailableForcePowers] = useState<ForcePower[]>([]);
  const [availableTechPowers, setAvailableTechPowers] = useState<TechPower[]>([]);
  const [maxForcePowersCount, setMaxForcePowersCount] = useState(0);
  const [maxTechPowersCount, setMaxTechPowersCount] = useState(0);
  const [forceLevels, setForceLevels] = useState<number[]>([]);
  const [techLevels, setTechLevels] = useState<number[]>([]);
  
  // Load powers based on class
  useEffect(() => {
    // Get available powers from our SW5E data provider
    const loadPowers = async () => {
      try {
        // Get force powers data
        const forcePowers = SW5E.data.forcePowers || [];
        setAvailableForcePowers(forcePowers);
        
        // Get tech powers data
        const techPowers = SW5E.data.techPowers || [];
        setAvailableTechPowers(techPowers);
        
        // At-will powers (level 0) up to the highest power level the class table allows
        const { type, maxPowerLevel } = getPowerProgression(characterClass, Number(characterLevel) || 1);
        const levels = Array.from({ length: maxPowerLevel + 1 }, (_, level) => level);
        setForceLevels(type === "Force" ? levels : []);
        setTechLevels(type === "Tech" ? levels : []);
      } catch (error) {
        console.error('Error loading powers:', error);
        toast.error("Failed to load powers data");
      }
    };
    
    loadPowers();
  }, [toast, characterClass, characterLevel]);
  
  // Calculate max powers based on class and level
  useEffect(() => {
    const calculateMaxPowers = () => {
      // Powers known come from the class table; at-will powers count toward the total
      const progression = getPowerProgression(characterClass, Number(characterLevel) || 1);
      const forcePowersCount = progression.type === "Force" ? progression.powersKnown : 0;
      const techPowersCount = progression.type === "Tech" ? progression.powersKnown : 0;

      setMaxForcePowersCount(forcePowersCount);
      setMaxTechPowersCount(techPowersCount);
    };
    
    calculateMaxPowers();
  }, [characterClass, characterLevel]);
  
  // Filter powers by level and class
  const getFilteredForcePowers = (level: number) => {
    return availableForcePowers.filter(power => {
      // Filter by level
      if (power.level !== level) return false;
      
      return true;
    });
  };
  
  const getFilteredTechPowers = (level: number) => {
    return availableTechPowers.filter(power => {
      // Filter by level
      if (power.level !== level) return false;
      
      return true;
    });
  };
  
  // A power that builds on another needs that one chosen first
  const missingPrerequisite = (selected: { name: string }[], power: { name: string; prerequisite?: string }) => {
    if (!power.prerequisite || selected.some((p) => p.name.toLowerCase() === power.prerequisite!.toLowerCase())) return false;
    toast.error(`${power.name} builds on ${power.prerequisite}: choose ${power.prerequisite} first`);
    return true;
  };
  // Dropping a power drops the powers that build on it
  const withoutPower = <P extends { id: string; name: string; prerequisite?: string }>(selected: P[], power: P): P[] => {
    const left = selected.filter((p) => p.id !== power.id);
    const orphan = left.find((p) => p.prerequisite?.toLowerCase() === power.name.toLowerCase());
    return orphan ? withoutPower(left, orphan) : left;
  };

  // Handle power selection
  const handleForcePowerSelect = (power: ForcePower) => {
    // Check if power is already selected
    const isSelected = selectedForcePowers.some(p => p.id === power.id);
    
    if (isSelected) {
      // Remove power
      const updatedPowers = withoutPower(selectedForcePowers, power);
      form.setValue('forcePowers', updatedPowers, { shouldValidate: true });
    } else {
      if (missingPrerequisite(selectedForcePowers, power)) return;
      // Check if max powers reached
      if (selectedForcePowers.length >= maxForcePowersCount) {
        toast.error(`You can only select ${maxForcePowersCount} force powers`);
        return;
      }
      
      // Add power
      const updatedPowers = [...selectedForcePowers, power];
      form.setValue('forcePowers', updatedPowers, { shouldValidate: true });
    }
  };
  
  const handleTechPowerSelect = (power: TechPower) => {
    // Check if power is already selected
    const isSelected = selectedTechPowers.some(p => p.id === power.id);
    
    if (isSelected) {
      // Remove power
      const updatedPowers = withoutPower(selectedTechPowers, power);
      form.setValue('techPowers', updatedPowers, { shouldValidate: true });
    } else {
      if (missingPrerequisite(selectedTechPowers, power)) return;
      // Check if max powers reached
      if (selectedTechPowers.length >= maxTechPowersCount) {
        toast.error(`You can only select ${maxTechPowersCount} tech powers`);
        return;
      }
      
      // Add power
      const updatedPowers = [...selectedTechPowers, power];
      form.setValue('techPowers', updatedPowers, { shouldValidate: true });
    }
  };
  
  // Check if a power is selected
  const isPowerSelected = (powerId: string, type: 'force' | 'tech') => {
    if (type === 'force') {
      return selectedForcePowers.some(power => power.id === powerId);
    } else {
      return selectedTechPowers.some(power => power.id === powerId);
    }
  };
  
  // Handle form submission
  const handleContinue = () => {
    // Validate current state before moving on
    form.trigger(['forcePowers', 'techPowers']).then((isValid) => {
      if (isValid) {
        onContinue();
      } else {
        toast.error("Please make sure your power selections are valid");
      }
    });
  };
  
  return (
    <div className="space-y-6">
      <TranslucentPane>
        <h2 className="text-2xl font-bold mb-4">Force & Tech Powers</h2>
        <p className="mb-6">
          Select the powers your character knows based on your class and level.
        </p>
        
        <div className="mb-4">
          <p className="text-sm">
            Force powers: {selectedForcePowers.length}/{maxForcePowersCount} selected
          </p>
          <p className="text-sm">
            Tech powers: {selectedTechPowers.length}/{maxTechPowersCount} selected
          </p>
        </div>
        
        <Tab.Group>
          <Tab.List className="flex space-x-2 rounded-xl bg-blue-900/20 p-1 mb-4">
            <Tab className={({ selected }) =>
              `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
              ${selected 
                ? 'bg-blue-700 text-white shadow'
                : 'text-blue-100 hover:bg-blue-700/30 hover:text-white'}
              `}
            >
              Force Powers
            </Tab>
            <Tab className={({ selected }) =>
              `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
              ${selected 
                ? 'bg-amber-600 text-white shadow'
                : 'text-amber-100 hover:bg-amber-600/30 hover:text-white'}
              `}
            >
              Tech Powers
            </Tab>
          </Tab.List>
          
          <Tab.Panels>
            {/* Force Powers Panel */}
            <Tab.Panel>
              {maxForcePowersCount > 0 ? (
                <div>
                  <div className="space-y-6">
                    {forceLevels.map(level => (
                      <div key={`force-level-${level}`} className="mb-6">
                        <h3 className="text-lg font-semibold mb-2 force-light">
                          Level {level} {level === 0 ? 'Tricks' : 'Powers'}
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {getFilteredForcePowers(level).map(power => (
                            <div 
                              key={power.id}
                              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                                selectedForcePowers.some(p => p.id === power.id)
                                  ? 'border-blue-500 bg-blue-500/20'
                                  : 'border-gray-600 hover:border-blue-400'
                              }`}
                              onClick={() => handleForcePowerSelect(power)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="force-light font-semibold">{power.name}</div>
                                <div className="text-sm opacity-70">
                                  {power.castingTime || 'Action'}
                                </div>
                              </div>
                              <div className="text-sm mt-1">{power.description.substring(0, 100)}...</div>
                              <div className="flex text-xs mt-2 space-x-2 opacity-75">
                                <span>Range: {power.range || 'Self'}</span>
                                <span>Duration: {power.duration || 'Instantaneous'}</span>
                                {power.prerequisite && <span>Builds on: {power.prerequisite}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                            
                            {getFilteredForcePowers(level).length === 0 && (
                              <p className="text-sm text-gray-400">
                                No level {level} force powers available for your class
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-lg">Your class doesn't have access to force powers.</p>
                    </div>
                  )}
                </Tab.Panel>
            
            {/* Tech Powers Panel */}
            <Tab.Panel>
              {maxTechPowersCount > 0 ? (
                <div>
                  <div className="space-y-6">
                    {techLevels.map(level => (
                      <div key={`tech-level-${level}`} className="mb-6">
                        <h3 className="text-lg font-semibold mb-2 tech">
                          Level {level} {level === 0 ? 'Programs' : 'Powers'}
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {getFilteredTechPowers(level).map(power => (
                            <div 
                              key={power.id}
                              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                                selectedTechPowers.some(p => p.id === power.id)
                                  ? 'border-amber-500 bg-amber-500/20'
                                  : 'border-gray-600 hover:border-amber-400'
                              }`}
                              onClick={() => handleTechPowerSelect(power)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="tech font-semibold">{power.name}</div>
                                <div className="text-sm opacity-70">
                                  {power.castingTime || 'Action'}
                                </div>
                              </div>
                              <div className="text-sm mt-1">{power.description.substring(0, 100)}...</div>
                              <div className="flex text-xs mt-2 space-x-2 opacity-75">
                                <span>Range: {power.range || 'Self'}</span>
                                <span>Duration: {power.duration || 'Instantaneous'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                            
                            {getFilteredTechPowers(level).length === 0 && (
                              <p className="text-sm text-gray-400">
                                No level {level} tech powers available for your class
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-lg">Your class doesn't have access to tech powers.</p>
                    </div>
                  )}
                </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </TranslucentPane>
      
      <div className="flex justify-between">
        <button
          type="button"
          className="px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition"
          onClick={() => form.trigger(['forcePowers', 'techPowers'])}
        >
          Validate
        </button>
        
        <button
          type="button"
          className="px-4 py-2 bg-blue-700 rounded-md hover:bg-blue-600 transition"
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default PowersSelection;
