
import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { TranslucentPane } from '@/components/ui/TranslucentPane';
import { Controller, useFormContext } from 'react-hook-form';
import { ForcePower, TechPower } from '@shared/unifiedSchema';
import { useToast } from '@/components/ui/toast';
import SW5E from '@/lib/sw5e/dataProvider';
import { useCharacterFormWatch } from '@/hooks/useCharacterForm';
import { Character } from '@shared/unifiedSchema';

interface PowersSelectionProps {
  onContinue: () => void;
}

const PowersSelection: React.FC<PowersSelectionProps> = ({ onContinue }) => {
  const form = useFormContext<Character>();
  const { toast } = useToast();
  
  // Watch values from the form
  const characterClass = useCharacterFormWatch(form, 'class');
  const characterLevel = useCharacterFormWatch(form, 'level');
  const watchedForcePowers = useCharacterFormWatch(form, 'forcePowers');
  const watchedTechPowers = useCharacterFormWatch(form, 'techPowers');
  
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
        
        // Extract available power levels for filtering
        const forceLevels = [...new Set(forcePowers.map(power => power.level))].sort();
        const techLevels = [...new Set(techPowers.map(power => power.level))].sort();
        
        setForceLevels(forceLevels);
        setTechLevels(techLevels);
      } catch (error) {
        console.error('Error loading powers:', error);
        toast({
          title: "Error",
          description: "Failed to load powers data",
          variant: "destructive"
        });
      }
    };
    
    loadPowers();
  }, [toast]);
  
  // Calculate max powers based on class and level
  useEffect(() => {
    const calculateMaxPowers = () => {
      // This is simplified example logic - should be replaced with actual SW5E rules
      let forcePowersCount = 0;
      let techPowersCount = 0;
      
      switch (characterClass) {
        case 'consular':
          forcePowersCount = Math.floor(characterLevel / 2) + 2;
          break;
        case 'guardian':
          forcePowersCount = Math.floor(characterLevel / 3) + 1;
          break;
        case 'sentinel':
          forcePowersCount = Math.floor(characterLevel / 3) + 1;
          techPowersCount = Math.floor(characterLevel / 4) + 1;
          break;
        case 'engineer':
          techPowersCount = Math.floor(characterLevel / 2) + 2;
          break;
        case 'scholar':
          techPowersCount = Math.floor(characterLevel / 2) + 1;
          break;
        default:
          // Other classes might not have powers or have special rules
          break;
      }
      
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
      
      // Filter by class (simplified - should be enhanced based on actual SW5E rules)
      switch (characterClass) {
        case 'consular':
          return true; // Consular can access all force powers
        case 'guardian':
          return true; // Guardian has access to force powers
        case 'sentinel':
          return true; // Sentinel has access to force powers
        default:
          return false;
      }
    });
  };
  
  const getFilteredTechPowers = (level: number) => {
    return availableTechPowers.filter(power => {
      // Filter by level
      if (power.level !== level) return false;
      
      // Filter by class (simplified - should be enhanced based on actual SW5E rules)
      switch (characterClass) {
        case 'engineer':
          return true; // Engineer can access all tech powers
        case 'scholar':
          return true; // Scholar has access to tech powers
        case 'sentinel':
          return true; // Sentinel has access to limited tech powers
        default:
          return false;
      }
    });
  };
  
  // Handle power selection
  const handleForcePowerSelect = (power: ForcePower) => {
    // Check if power is already selected
    const isSelected = selectedForcePowers.some(p => p.id === power.id);
    
    if (isSelected) {
      // Remove power
      const updatedPowers = selectedForcePowers.filter(p => p.id !== power.id);
      form.setValue('forcePowers', updatedPowers, { shouldValidate: true });
    } else {
      // Check if max powers reached
      if (selectedForcePowers.length >= maxForcePowersCount) {
        toast({
          title: "Limit Reached",
          description: `You can only select ${maxForcePowersCount} force powers`,
          variant: "destructive"
        });
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
      const updatedPowers = selectedTechPowers.filter(p => p.id !== power.id);
      form.setValue('techPowers', updatedPowers, { shouldValidate: true });
    } else {
      // Check if max powers reached
      if (selectedTechPowers.length >= maxTechPowersCount) {
        toast({
          title: "Limit Reached",
          description: `You can only select ${maxTechPowersCount} tech powers`,
          variant: "destructive"
        });
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
        toast({
          title: "Validation Error",
          description: "Please make sure your power selections are valid",
          variant: "destructive"
        });
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
                                Array.isArray(selectedForcePowers) && selectedForcePowers.some(p => p.id === power.id)
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
                                Array.isArray(selectedTechPowers) && selectedTechPowers.some(p => p.id === power.id)
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
                                <span>Type: {power.techType}</span>
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
