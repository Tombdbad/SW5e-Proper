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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { calculateForcePoints, calculateTechPoints, meetsPowerPrerequisites, getAbilityModifier } from '@/lib/sw5e/rules';

interface PowersSelectionProps {
  showPreview?: boolean;
}

const PowersSelection: React.FC<PowersSelectionProps> = ({ showPreview = false }) => {
  const { watch, setValue, getValues } = useFormContext();
  const selectedClass = watch("class");
  const characterLevel = watch("level") || 1;
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<string>("force");
  const [hasForceCasting, setHasForceCasting] = useState<boolean>(false);
  const [hasTechCasting, setHasTechCasting] = useState<boolean>(false);
  const [maxPowerLevel, setMaxPowerLevel] = useState<number>(0);
  const [maxPowerPoints, setMaxPowerPoints] = useState<number>(0);

  // Form values
  const character = getValues();
  const selectedPowers = watch('powers') || [];
  const abilityScores = watch('abilityScores');

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

  // Calculate available power points
  const forcePoints = hasForceCasting ? (calculateForcePoints ? calculateForcePoints(character, { forceUser: true }, characterLevel, abilityScores) : maxPowerPoints) : 0;
  const techPoints = hasTechCasting ? (calculateTechPoints ? calculateTechPoints(character, { techUser: true }, characterLevel, abilityScores) : maxPowerPoints) : 0;

  // Calculate used points
  const usedForcePoints = selectedPowers
    .filter((power: any) => power.type === 'force')
    .reduce((sum: number, power: any) => sum + power.level, 0);

  const usedTechPoints = selectedPowers
    .filter((power: any) => power.type === 'tech')
    .reduce((sum: number, power: any) => sum + power.level, 0);

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

  // Always call useQuery to maintain consistent hook calls across renders
  const { data: powers, isLoading } = useQuery({
    queryKey: ['powers'],
    queryFn: async () => {
        // Fetching from API endpoints would look like this:
        // const [forcePowersData, techPowersData] = await Promise.all([
        //   fetch('/api/sw5e/powers/force').then(res => res.json()),
        //   fetch('/api/sw5e/powers/tech').then(res => res.json())
        // ]);
        // return [...forcePowersData, ...techPowersData];

        // For now, use the imported mock data to ensure it works
        return [
          // Mock force powers
          ...forcePowers.map(p => ({ ...p, type: 'force', id: p.id || `force-${p.name}` })),
          // Mock tech powers
          ...techPowers.map(p => ({ ...p, type: 'tech', id: p.id || `tech-${p.name}` })),
        ];
      },
      // We'll always execute the query but use the data conditionally
      enabled: true,
    });

    // Filter powers based on character class capabilities
    const eligiblePowers = (powers || []).filter(power => {
      if (!hasForceCasting && power.type === 'force') return false;
      if (!hasTechCasting && power.type === 'tech') return false;
      return true;
    });

    // Filter powers based on current selections
    const filteredPowers = eligiblePowers.filter((power: any) => {
      // Filter by type tab
    const typeMatch = activeTab === 'all' || power.type === activeTab;

    // Filter by search
    const searchMatch = !filter || 
      power.name.toLowerCase().includes(filter.toLowerCase()) || 
      (power.description && power.description.toLowerCase().includes(filter.toLowerCase()));

    // Filter by level
    const levelMatch = levelFilter === null || power.level === levelFilter;

    return typeMatch && searchMatch && levelMatch;
  });

  // Handle power selection
  const togglePowerSelection = (power: any) => {
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

  return (
    <ScrollArea className="h-[75vh] pr-2 overflow-y-auto">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-yellow-400">Power Selection</h2>
          <div className="flex space-x-2">
            {hasForceCasting && (
              <Badge variant="outline" className="bg-blue-900/30">
                Force Points: {usedForcePoints}/{forcePoints}
              </Badge>
            )}
            {hasTechCasting && (
              <Badge variant="outline" className="bg-green-900/30">
                Tech Points: {usedTechPoints}/{techPoints}
              </Badge>
            )}
            <Badge variant="outline" className="bg-purple-900/30">
              Max Power Level: {maxPowerLevel}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="w-full md:w-1/2">
            <Input
              placeholder="Search powers..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="w-full md:w-1/2 flex gap-2">
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
            >
              Clear
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All Powers</TabsTrigger>
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

          <TabsContent value="all">
            <TranslucentPane>
              {isLoading ? (
                <div className="text-center p-4">Loading powers...</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredPowers.map((power: any) => (
                    <PowerCard 
                      key={power.id}
                      power={power}
                      isSelected={isPowerSelected(power.id)}
                      onToggle={() => togglePowerSelection(power)}
                      characterLevel={characterLevel}
                    />
                  ))}

                  {filteredPowers.length === 0 && (
                    <div className="text-center p-4 bg-gray-800 rounded-md">
                      <p className="text-gray-400">No powers match your filter criteria.</p>
                    </div>
                  )}
                </div>
              )}
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="force">
            <TranslucentPane>
              {hasForceCasting && (
                isLoading ? (
                  <div className="text-center p-4">Loading force powers...</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredPowers
                      .filter((power: any) => power.type === 'force')
                      .map((power: any) => (
                        <PowerCard 
                          key={power.id}
                          power={power}
                          isSelected={isPowerSelected(power.id)}
                          onToggle={() => togglePowerSelection(power)}
                          characterLevel={characterLevel}
                        />
                      ))}

                    {filteredPowers.filter((power: any) => power.type === 'force').length === 0 && (
                      <div className="text-center p-4 bg-gray-800 rounded-md">
                        <p className="text-gray-400">No force powers match your filter criteria.</p>
                      </div>
                    )}
                  </div>
                )
              )}
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="tech">
            <TranslucentPane>
              {hasTechCasting && (
                isLoading ? (
                  <div className="text-center p-4">Loading tech powers...</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredPowers
                      .filter((power: any) => power.type === 'tech')
                      .map((power: any) => (
                        <PowerCard 
                          key={power.id}
                          power={power}
                          isSelected={isPowerSelected(power.id)}
                          onToggle={() => togglePowerSelection(power)}
                          characterLevel={characterLevel}
                        />
                      ))}

                    {filteredPowers.filter((power: any) => power.type === 'tech').length === 0 && (
                      <div className="text-center p-4 bg-gray-800 rounded-md">
                        <p className="text-gray-400">No tech powers match your filter criteria.</p>
                      </div>
                    )}
                  </div>
                )
              )}
            </TranslucentPane>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
};

// Helper component for power cards
interface PowerCardProps {
  power: any;
  isSelected: boolean;
  onToggle: () => void;
  characterLevel: number;
}

const PowerCard: React.FC<PowerCardProps> = ({ power, isSelected, onToggle, characterLevel }) => {
  // Check if character meets prerequisites
  const meetsPrerequisites = !power.prerequisites || 
    !power.prerequisites.some((prereq: string) => {
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
        {power.castingTime && (
          <div>
            <span className="text-gray-400">Casting Time:</span> {power.castingTime}
          </div>
        )}
        {power.range && (
          <div>
            <span className="text-gray-400">Range:</span> {power.range}
          </div>
        )}
        {power.duration && (
          <div>
            <span className="text-gray-400">Duration:</span> {power.duration}
          </div>
        )}
      </div>

      {power.prerequisites && power.prerequisites.length > 0 && (
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