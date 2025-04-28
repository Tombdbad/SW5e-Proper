import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { archetypes, ClassArchetype, getArchetypesByClass } from '@/lib/sw5e/archetypes';

interface ArchetypeSelectionProps {
  form: any;
  characterClass: string;
  characterLevel: number;
}

export default function ArchetypeSelection({ form, characterClass, characterLevel }: ArchetypeSelectionProps) {
  const [availableArchetypes, setAvailableArchetypes] = useState<ClassArchetype[]>([]);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  
  // Get the currently selected archetype from the form
  const selectedArchetype = form.watch('archetype');
  
  // Load available archetypes when class changes
  useEffect(() => {
    if (characterClass) {
      const archetypesForClass = getArchetypesByClass(characterClass);
      setAvailableArchetypes(archetypesForClass);
    } else {
      setAvailableArchetypes([]);
    }
  }, [characterClass]);
  
  // Select an archetype
  const selectArchetype = (archetype: ClassArchetype) => {
    form.setValue('archetype', archetype);
  };
  
  // Clear archetype selection
  const clearArchetype = () => {
    form.setValue('archetype', null);
  };
  
  // Level requirement check
  const meetsLevelRequirement = characterLevel >= 3;
  
  // Get available features based on level and archetype
  const getAvailableFeatures = (archetype: ClassArchetype) => {
    return archetype.features.filter(feature => feature.level <= characterLevel);
  };
  
  // Toggle feature details
  const toggleDetails = (archetypeId: string) => {
    if (showDetails === archetypeId) {
      setShowDetails(null);
    } else {
      setShowDetails(archetypeId);
    }
  };
  
  if (!meetsLevelRequirement) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Class Archetype</h3>
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertTitle>Not Available Yet</AlertTitle>
          <AlertDescription>
            You will be able to choose an archetype for your class when you reach level 3.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Class Archetype</h3>
      </div>
      
      {!selectedArchetype ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose an archetype to specialize your {characterClass}. This represents your character's specific path or tradition within their class.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableArchetypes.map((archetype) => (
              <Card 
                key={archetype.id} 
                className="cursor-pointer hover:border-yellow-500 transition-all"
                onClick={() => selectArchetype(archetype)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{archetype.name}</CardTitle>
                  <CardDescription>{archetype.flavorText}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 pb-2">
                  <p className="text-sm mb-2">{archetype.description}</p>
                  <p className="text-sm text-yellow-400 mt-2">
                    <span className="font-semibold">Key Features:</span>{' '}
                    {archetype.features.slice(0, 2).map(f => f.name).join(', ')}...
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {availableArchetypes.length === 0 && (
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>No Archetypes Available</AlertTitle>
              <AlertDescription>
                There are no archetypes available for the {characterClass} class in the current data.
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold">{selectedArchetype.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedArchetype.parentClass} Archetype</p>
            </div>
            <Button variant="outline" size="sm" onClick={clearArchetype}>
              Change Archetype
            </Button>
          </div>
          
          <Card className="bg-gray-800/70 border-gray-700">
            <CardHeader>
              <CardTitle>Archetype Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm italic mb-3">{selectedArchetype.flavorText}</p>
              <p className="text-sm">{selectedArchetype.description}</p>
            </CardContent>
          </Card>
          
          <h4 className="text-lg font-medium mt-6">Archetype Features</h4>
          <div className="space-y-3">
            {getAvailableFeatures(selectedArchetype).map((feature) => (
              <Card key={feature.name} className="bg-gray-800/70 border-gray-700">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base">{feature.name}</CardTitle>
                    <Badge>Level {feature.level}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
            
            {/* Unavailable features (higher level) */}
            {selectedArchetype.features
              .filter((feature: {level: number}) => feature.level > characterLevel)
              .map((feature: {name: string, level: number}) => (
                <Card key={feature.name} className="bg-gray-700/40 border-gray-700 opacity-50">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base">{feature.name}</CardTitle>
                      <Badge variant="outline">Level {feature.level}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <p className="text-sm text-gray-400">
                      Unlocks at level {feature.level}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}