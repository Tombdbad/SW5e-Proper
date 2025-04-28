import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { forcePowers, ForcePower, getPowersByLevel, getPowersBySchool } from '@/lib/sw5e/forcePowers';

interface ForcePowersSelectionProps {
  form: any;
  availablePowers?: number;
  maxPowerLevel?: number;
  alignment?: 'Light' | 'Dark' | 'Neutral';
}

export default function ForcePowersSelection({ 
  form, 
  availablePowers = 3, 
  maxPowerLevel = 1,
  alignment = 'Neutral' 
}: ForcePowersSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [powerDialogOpen, setPowerDialogOpen] = useState(false);
  
  // Get the currently selected powers from the form
  const selectedPowers = form.watch('forcePowers') || [];
  
  // Filter powers based on search, level, and school
  const filteredPowers = forcePowers.filter(power => {
    // Filter by max level
    if (power.level > maxPowerLevel) return false;
    
    // Filter by alignment
    if (power.forceAlignment !== 'Any' && power.forceAlignment !== alignment) return false;
    
    // Filter by search term
    const matchesSearch = power.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         power.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by level
    const matchesLevel = selectedLevel === 'all' || power.level === parseInt(selectedLevel);
    
    // Filter by school
    const matchesSchool = selectedSchool === 'all' || power.school === selectedSchool;
    
    return matchesSearch && matchesLevel && matchesSchool;
  });
  
  // Add a power to the character
  const addPower = (power: ForcePower) => {
    const currentPowers = form.getValues('forcePowers') || [];
    
    // Check if the maximum number of powers has been reached
    if (currentPowers.length >= availablePowers) {
      return;
    }
    
    // Check if the power is already selected
    if (currentPowers.some((p: ForcePower) => p.id === power.id)) {
      return;
    }
    
    form.setValue('forcePowers', [...currentPowers, power]);
    setPowerDialogOpen(false);
  };
  
  // Remove a power from the character
  const removePower = (powerId: string) => {
    const currentPowers = form.getValues('forcePowers') || [];
    form.setValue('forcePowers', currentPowers.filter((p: ForcePower) => p.id !== powerId));
  };
  
  // Generate power level options based on max level
  const levelOptions = [
    { value: 'all', label: 'All Levels' },
    { value: '0', label: 'At-Will' },
    ...Array.from({ length: maxPowerLevel }, (_, i) => ({
      value: String(i + 1),
      label: `Level ${i + 1}`
    }))
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Force Powers</h3>
          <p className="text-sm text-muted-foreground">
            {selectedPowers.length}/{availablePowers} powers selected
          </p>
        </div>
        
        <Dialog open={powerDialogOpen} onOpenChange={setPowerDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="default" 
              disabled={selectedPowers.length >= availablePowers}
            >
              Learn Force Power
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>Select a Force Power</DialogTitle>
              <DialogDescription>
                Choose a force power to add to your character's repertoire.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center mb-4">
              <SearchIcon className="h-4 w-4 mr-2 text-gray-400" />
              <Input 
                placeholder="Search force powers..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium">Power Level</label>
                <select 
                  className="w-full mt-1 rounded-md border-gray-700 bg-gray-800"
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                >
                  {levelOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Force School</label>
                <select 
                  className="w-full mt-1 rounded-md border-gray-700 bg-gray-800"
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                >
                  <option value="all">All Schools</option>
                  <option value="Universal">Universal</option>
                  <option value="Light">Light</option>
                  <option value="Dark">Dark</option>
                  <option value="Neutral">Neutral</option>
                </select>
              </div>
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-1 gap-4">
                {filteredPowers.map((power) => (
                  <Card 
                    key={power.id} 
                    className="cursor-pointer hover:border-blue-500 transition-all"
                    onClick={() => addPower(power)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{power.name}</CardTitle>
                        <div className="flex space-x-2">
                          <Badge className={
                            power.school === 'Light' ? 'bg-blue-600' : 
                            power.school === 'Dark' ? 'bg-red-600' : 
                            power.school === 'Universal' ? 'bg-purple-600' : 'bg-gray-600'
                          }>
                            {power.school}
                          </Badge>
                          <Badge variant="outline">
                            {power.level === 0 ? 'At-Will' : `Level ${power.level}`}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription>
                        {power.castingTime} • {power.range} • {power.duration}
                        {power.concentration && ' (Concentration)'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 pb-2">
                      <p className="text-sm mb-2">{power.description}</p>
                      {power.higherLevelDescription && (
                        <p className="text-sm text-blue-400 mt-2">
                          <span className="font-semibold">At Higher Levels:</span> {power.higherLevelDescription}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="space-y-4">
        {selectedPowers.length === 0 ? (
          <div className="text-center p-6 bg-gray-800/30 rounded-md border border-gray-700">
            <p className="text-gray-400">No force powers selected yet</p>
          </div>
        ) : (
          selectedPowers.map((power: ForcePower) => (
            <Card key={power.id} className="bg-gray-800/70 border-gray-700">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{power.name}</CardTitle>
                  <div className="flex space-x-2">
                    <Badge className={
                      power.school === 'Light' ? 'bg-blue-600' : 
                      power.school === 'Dark' ? 'bg-red-600' : 
                      power.school === 'Universal' ? 'bg-purple-600' : 'bg-gray-600'
                    }>
                      {power.school}
                    </Badge>
                    <Badge variant="outline">
                      {power.level === 0 ? 'At-Will' : `Level ${power.level}`}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {power.castingTime} • {power.range} • {power.duration}
                  {power.concentration && ' (Concentration)'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <p className="text-sm mb-2">{power.description}</p>
                {power.higherLevelDescription && (
                  <p className="text-sm text-blue-400 mt-2">
                    <span className="font-semibold">At Higher Levels:</span> {power.higherLevelDescription}
                  </p>
                )}
              </CardContent>
              <CardFooter className="pt-0 flex justify-end">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => removePower(power.id)}
                >
                  Remove
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}