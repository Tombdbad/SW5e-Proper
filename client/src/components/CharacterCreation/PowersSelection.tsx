
    import React, { useState, useEffect } from "react";
    import { useFormContext, useWatch } from "react-hook-form";
    import ForcePowersSelection from "./ForcePowersSelection";
    import TechPowersSelection from "./TechPowersSelection";
    import { Alert } from "@/components/ui/alert";
    import { Badge } from "@/components/ui/badge";
    import { Info } from "lucide-react";
    import TranslucentPane from "@/components/ui/TranslucentPane";
    import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
    import { ScrollArea } from "@/components/ui/scroll-area";
    import { forcePowers } from "@/lib/sw5e/forcePowers"; 
    import { techPowers } from "@/lib/sw5e/techPowers";

    export default function PowersSelection() {
      const { watch, setValue, getValues } = useFormContext();
      const selectedClass = watch("class");
      const characterLevel = watch("level") || 1;

      const [activeTab, setActiveTab] = useState<string>("force");
      const [hasForceCasting, setHasForceCasting] = useState<boolean>(false);
      const [hasTechCasting, setHasTechCasting] = useState<boolean>(false);
      const [maxPowerLevel, setMaxPowerLevel] = useState<number>(0);
      const [maxPowerPoints, setMaxPowerPoints] = useState<number>(0);

      // Effect to determine what power types the character can use based on class
      useEffect(() => {
        let canUseForcePowers = false;
        let canUseTechPowers = false;
        let powerLevel = Math.min(5, Math.ceil(characterLevel / 4));
        let powerPoints = characterLevel + 1;

        // These are examples - update with your actual class data
        const forceClasses = ["consular", "guardian", "sentinel"];
        const techClasses = ["engineer", "scholar", "scout"];

        // Check if the selected class can use Force powers
        if (forceClasses.includes(selectedClass)) {
          canUseForcePowers = true;
        }

        // Check if the selected class can use Tech powers
        if (techClasses.includes(selectedClass)) {
          canUseTechPowers = true;
        }

        setHasForceCasting(canUseForcePowers);
        setHasTechCasting(canUseTechPowers);
        setMaxPowerLevel(powerLevel);
        setMaxPowerPoints(powerPoints);

        // Set initial active tab based on class capabilities
        if (canUseForcePowers && !canUseTechPowers) {
          setActiveTab("force");
        } else if (canUseTechPowers && !canUseForcePowers) {
          setActiveTab("tech");
        }
      }, [selectedClass, characterLevel]);

      // If character can't use any powers, show message
  if (!hasForceCasting && !hasTechCasting) {
    return (
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4 mr-2" />
          Your character class does not have access to Force or Tech powers.
        </Alert>
        <p className="text-gray-400">
          Select a Force user (like Consular or Guardian) or Tech user (like Engineer or Scholar) 
          to access powers.
        </p>
      </div>
    );
  }

  return (
        <ScrollArea className="h-[75vh] pr-2 overflow-y-auto">
          <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-yellow-400">Power Selection</h2>
          <div className="flex space-x-2">
            <Badge variant="outline" className="bg-blue-900/30">
              Power Points: {maxPowerPoints}
            </Badge>
            <Badge variant="outline" className="bg-purple-900/30">
              Max Power Level: {maxPowerLevel}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="force" 
              disabled={!hasForceCasting}
              className={!hasForceCasting ? "opacity-50 cursor-not-allowed" : ""}
            >
              Force Powers
            </TabsTrigger>
            <TabsTrigger 
              value="tech" 
              disabled={!hasTechCasting}
              className={!hasTechCasting ? "opacity-50 cursor-not-allowed" : ""}
            >
              Tech Powers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="force">
            <TranslucentPane>
              {hasForceCasting && (
                <ForcePowersSelection 
                  form={useFormContext()}
                  powers={forcePowers}
                  maxPowerLevel={maxPowerLevel}
                  maxPowerPoints={maxPowerPoints}
                  alignment={watch("alignment") || "Neutral"}
                />
              )}
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="tech">
            <TranslucentPane>
              {hasTechCasting && (
                <TechPowersSelection 
                  form={useFormContext()}
                  powers={techPowers}
                  maxPowerLevel={maxPowerLevel}
                  maxPowerPoints={maxPowerPoints}
                />
              )}
            </TranslucentPane>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
import { FC, useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import TranslucentPane from '../ui/TranslucentPane';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { calculateForcePoints, calculateTechPoints, meetsPowerPrerequisites } from '../../lib/sw5e/rules';
import { Card } from '../ui/card';

interface PowersSelectionProps {
  showPreview?: boolean;
}

interface Power {
  id: string;
  name: string;
  description: string;
  level: number;
  type: 'force' | 'tech';
  castingTime: string;
  range: string;
  duration: string;
  prerequisites?: string[];
}

const PowersSelection: FC<PowersSelectionProps> = ({ showPreview = false }) => {
  const { register, watch, setValue, getValues } = useFormContext();
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  
  // Form values
  const character = getValues();
  const selectedClass = watch('class');
  const selectedPowers = watch('powers') || [];
  const abilityScores = watch('abilityScores');
  
  // Determine if character can use force, tech, or both
  const canUseForce = ['consular', 'guardian', 'sentinel'].includes(selectedClass);
  const canUseTech = ['engineer', 'scout', 'scholar'].includes(selectedClass);
  
  // Calculate available power points
  const forcePoints = canUseForce ? calculateForcePoints(character, { forceUser: true }, character.level, abilityScores) : 0;
  const techPoints = canUseTech ? calculateTechPoints(character, { techUser: true }, character.level, abilityScores) : 0;
  
  // Calculate used points
  const usedForcePoints = selectedPowers
    .filter((power: any) => power.type === 'force')
    .reduce((sum: number, power: any) => sum + power.level, 0);
    
  const usedTechPoints = selectedPowers
    .filter((power: any) => power.type === 'tech')
    .reduce((sum: number, power: any) => sum + power.level, 0);
  
  // Mock power data - in a real implementation, this would come from an API
  const { data: powers, isLoading } = useQuery<Power[]>({
    queryKey: ['powers'],
    queryFn: () => {
      // Mock data for demonstration
      const mockPowers: Power[] = [
        {
          id: 'force-push',
          name: 'Force Push',
          description: 'Push a creature away from you using the Force.',
          level: 1,
          type: 'force',
          castingTime: '1 action',
          range: '30 feet',
          duration: 'Instantaneous'
        },
        {
          id: 'force-leap',
          name: 'Force Leap',
          description: 'Jump incredible distances using the Force.',
          level: 1,
          type: 'force',
          castingTime: '1 bonus action',
          range: 'Self',
          duration: '1 round'
        },
        {
          id: 'tech-override',
          name: 'Tech Override',
          description: 'Override electronic systems temporarily.',
          level: 1,
          type: 'tech',
          castingTime: '1 action',
          range: 'Touch',
          duration: '1 minute'
        },
        {
          id: 'bacta-injection',
          name: 'Bacta Injection',
          description: 'Use medical technology to heal wounds.',
          level: 1,
          type: 'tech',
          castingTime: '1 action',
          range: 'Touch',
          duration: 'Instantaneous'
        },
        {
          id: 'force-lightning',
          name: 'Force Lightning',
          description: 'Channel dark side energy as lightning.',
          level: 3,
          type: 'force',
          castingTime: '1 action',
          range: '60 feet',
          duration: 'Instantaneous',
          prerequisites: ['Level 5']
        },
        {
          id: 'jetpack-boost',
          name: 'Jetpack Boost',
          description: 'Use jetpack technology for enhanced mobility.',
          level: 2,
          type: 'tech',
          castingTime: '1 bonus action',
          range: 'Self',
          duration: '1 minute',
          prerequisites: ['Level 3']
        }
      ];
      
      return Promise.resolve(mockPowers);
    },
    staleTime: Infinity // This is just for the mock data
  });
  
  // Filter powers
  const filteredPowers = powers
    ? powers.filter(power => {
        // Filter by type tab
        const typeMatch = activeTab === 'all' || power.type === activeTab;
        
        // Filter by search
        const searchMatch = filter === '' || 
          power.name.toLowerCase().includes(filter.toLowerCase()) || 
          power.description.toLowerCase().includes(filter.toLowerCase());
        
        // Filter by level
        const levelMatch = levelFilter === null || power.level === levelFilter;
        
        return typeMatch && searchMatch && levelMatch;
      })
    : [];
  
  // Handle power selection
  const togglePowerSelection = (power: Power) => {
    const currentPowers = [...selectedPowers];
    const powerIndex = currentPowers.findIndex(p => p.id === power.id);
    
    if (powerIndex >= 0) {
      // Remove power
      currentPowers.splice(powerIndex, 1);
    } else {
      // Check if enough points
      if (power.type === 'force' && usedForcePoints + power.level > forcePoints) {
        alert('Not enough Force points!');
        return;
      } else if (power.type === 'tech' && usedTechPoints + power.level > techPoints) {
        alert('Not enough Tech points!');
        return;
      }
      
      // Add power
      currentPowers.push(power);
    }
    
    setValue('powers', currentPowers, { shouldValidate: true });
  };
  
  // Check if power is selected
  const isPowerSelected = (powerId: string) => {
    return selectedPowers.some((power: any) => power.id === powerId);
  };
  
  // Tabs for power types
  const [activeTab, setActiveTab] = useState('all');
  
  if (!selectedClass) {
    return (
      <div className="text-center p-8">
        <p className="text-yellow-400">Please select a class first to view available powers.</p>
      </div>
    );
  }
  
  if (isLoading) {
    return <div className="text-center p-8">Loading powers...</div>;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between">
        <div>
          <h2 className="text-xl font-bold text-yellow-400 mb-2">Power Selection</h2>
          <p className="text-gray-400 mb-4">
            Select powers for your character based on your class and level.
          </p>
        </div>
        
        <div className="flex flex-col items-end">
          {canUseForce && (
            <div className="text-right mb-2">
              <span className="text-blue-400 font-medium">Force Points:</span> 
              <span className="ml-2 px-3 py-1 bg-blue-900/50 rounded-md">
                {usedForcePoints} / {forcePoints}
              </span>
            </div>
          )}
          
          {canUseTech && (
            <div className="text-right">
              <span className="text-green-400 font-medium">Tech Points:</span>
              <span className="ml-2 px-3 py-1 bg-green-900/50 rounded-md">
                {usedTechPoints} / {techPoints}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-2/3">
          <div className="mb-4 flex flex-col sm:flex-row gap-3 items-center">
            <div className="w-full sm:w-1/2">
              <Input
                placeholder="Search powers..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="w-full sm:w-1/2 flex gap-2">
              <Select 
                value={levelFilter?.toString() || ''} 
                onValueChange={(value) => setLevelFilter(value ? parseInt(value) : null)}
              >
                <option value="">All Levels</option>
                <option value="1">Level 1</option>
                <option value="2">Level 2</option>
                <option value="3">Level 3</option>
                <option value="4">Level 4</option>
                <option value="5">Level 5</option>
              </Select>
              
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilter('');
                  setLevelFilter(null);
                }}
                className="whitespace-nowrap"
              >
                Clear
              </Button>
            </div>
          </div>
          
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">All Powers</TabsTrigger>
              {canUseForce && <TabsTrigger value="force" className="flex-1">Force</TabsTrigger>}
              {canUseTech && <TabsTrigger value="tech" className="flex-1">Tech</TabsTrigger>}
            </TabsList>
            
            <TabsContent value="all" className="mt-4">
              <div className="grid grid-cols-1 gap-3">
                {filteredPowers.map(power => (
                  <PowerCard 
                    key={power.id}
                    power={power}
                    isSelected={isPowerSelected(power.id)}
                    onToggle={() => togglePowerSelection(power)}
                    characterLevel={character.level || 1}
                  />
                ))}
                
                {filteredPowers.length === 0 && (
                  <div className="text-center p-4 bg-gray-800 rounded-md">
                    <p className="text-gray-400">No powers match your filter criteria.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="force" className="mt-4">
              <div className="grid grid-cols-1 gap-3">
                {filteredPowers
                  .filter(power => power.type === 'force')
                  .map(power => (
                    <PowerCard 
                      key={power.id}
                      power={power}
                      isSelected={isPowerSelected(power.id)}
                      onToggle={() => togglePowerSelection(power)}
                      characterLevel={character.level || 1}
                    />
                  ))}
                  
                {filteredPowers.filter(power => power.type === 'force').length === 0 && (
                  <div className="text-center p-4 bg-gray-800 rounded-md">
                    <p className="text-gray-400">No force powers match your filter criteria.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="tech" className="mt-4">
              <div className="grid grid-cols-1 gap-3">
                {filteredPowers
                  .filter(power => power.type === 'tech')
                  .map(power => (
                    <PowerCard 
                      key={power.id}
                      power={power}
                      isSelected={isPowerSelected(power.id)}
                      onToggle={() => togglePowerSelection(power)}
                      characterLevel={character.level || 1}
                    />
                  ))}
                  
                {filteredPowers.filter(power => power.type === 'tech').length === 0 && (
                  <div className="text-center p-4 bg-gray-800 rounded-md">
                    <p className="text-gray-400">No tech powers match your filter criteria.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        
        <div className="w-full md:w-1/3">
          <TranslucentPane>
            <h3 className="text-lg font-bold text-yellow-400 mb-3">Selected Powers</h3>
            
            {selectedPowers.length === 0 ? (
              <p className="text-gray-400 text-sm p-4 bg-gray-800/50 rounded-md">
                No powers selected yet. Choose powers from the list.
              </p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {selectedPowers.map((power: Power) => (
                  <div 
                    key={power.id} 
                    className="flex justify-between items-center p-2 bg-gray-800/80 rounded-md"
                  >
                    <div>
                      <div className="flex items-center">
                        <span 
                          className={`w-2 h-2 rounded-full mr-2 ${power.type === 'force' ? 'bg-blue-400' : 'bg-green-400'}`}
                        ></span>
                        <p className="font-medium text-white">{power.name}</p>
                      </div>
                      <p className="text-xs text-gray-400">Level {power.level} {power.type}</p>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => togglePowerSelection(power)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

// Helper component for power cards
interface PowerCardProps {
  power: Power;
  isSelected: boolean;
  onToggle: () => void;
  characterLevel: number;
}

const PowerCard: FC<PowerCardProps> = ({ power, isSelected, onToggle, characterLevel }) => {
  // Check if character meets prerequisites
  const meetsPrerequisites = !power.prerequisites || 
    !power.prerequisites.some(prereq => {
      if (prereq.startsWith('Level ')) {
        const requiredLevel = parseInt(prereq.split(' ')[1]);
        return characterLevel < requiredLevel;
      }
      return false;
    });
  
  return (
    <Card 
      className={`p-3 transition-all ${
        isSelected 
          ? power.type === 'force' ? 'border-blue-500 bg-blue-950/30' : 'border-green-500 bg-green-950/30'
          : 'border-gray-700 bg-gray-800/50 hover:bg-gray-700/50'
      } ${!meetsPrerequisites ? 'opacity-50' : ''}`}
    >
      <div className="flex justify-between">
        <div>
          <h3 className={`font-bold ${power.type === 'force' ? 'text-blue-400' : 'text-green-400'}`}>
            {power.name}
          </h3>
          <div className="flex items-center text-xs text-gray-400 mt-1">
            <span className="mr-2">Level {power.level}</span>
            <span className="mr-2">•</span>
            <span className={power.type === 'force' ? 'text-blue-400' : 'text-green-400'}>
              {power.type.charAt(0).toUpperCase() + power.type.slice(1)}
            </span>
          </div>
        </div>
        
        <div>
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={onToggle}
            disabled={!meetsPrerequisites}
            className={isSelected ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
          >
            {isSelected ? 'Selected' : 'Select'}
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-gray-300 mt-2">{power.description}</p>
      
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div>
          <span className="text-gray-400">Casting Time:</span> {power.castingTime}
        </div>
        <div>
          <span className="text-gray-400">Range:</span> {power.range}
        </div>
        <div>
          <span className="text-gray-400">Duration:</span> {power.duration}
        </div>
      </div>
      
      {power.prerequisites && (
        <div className="mt-2 text-xs">
          <span className="text-amber-400">Prerequisites:</span> {power.prerequisites.join(', ')}
          
          {!meetsPrerequisites && (
            <div className="text-red-400 mt-1">
              You don't meet the prerequisites for this power.
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default PowersSelection;
