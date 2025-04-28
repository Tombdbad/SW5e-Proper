import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { techPowers, TechPower, getPowersByLevel, getPowersByType } from '@/lib/sw5e/techPowers';

interface TechPowersSelectionProps {
  form: any;
  availablePowers?: number;
  maxPowerLevel?: number;
}

export default function TechPowersSelection({ 
  form, 
  availablePowers = 3, 
  maxPowerLevel = 1 
}: TechPowersSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [powerDialogOpen, setPowerDialogOpen] = useState(false);
  
  // Get the currently selected powers from the form
  const selectedPowers = form.watch('techPowers') || [];
  
  // Filter powers based on search, level, and type
  const filteredPowers = techPowers.filter(power => {
    // Filter by max level
    if (power.level > maxPowerLevel) return false;
    
    // Filter by search term
    const matchesSearch = power.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         power.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by level
    const matchesLevel = selectedLevel === 'all' || power.level === parseInt(selectedLevel);
    
    // Filter by type
    const matchesType = selectedType === 'all' || power.techType === selectedType;
    
    return matchesSearch && matchesLevel && matchesType;
  });
  
  // Add a power to the character
  const addPower = (power: TechPower) => {
    const currentPowers = form.getValues('techPowers') || [];
    
    // Check if the maximum number of powers has been reached
    if (currentPowers.length >= availablePowers) {
      return;
    }
    
    // Check if the power is already selected
    if (currentPowers.some((p: TechPower) => p.id === power.id)) {
      return;
    }
    
    form.setValue('techPowers', [...currentPowers, power]);
    setPowerDialogOpen(false);
  };
  
  // Remove a power from the character
  const removePower = (powerId: string) => {
    const currentPowers = form.getValues('techPowers') || [];
    form.setValue('techPowers', currentPowers.filter((p: TechPower) => p.id !== powerId));
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
  
  // Get badge color based on tech type
  const getTechTypeBadgeColor = (type: TechPower['techType']) => {
    switch(type) {
      case 'Gadget': return 'bg-yellow-600';
      case 'Weapon': return 'bg-red-600';
      case 'Modification': return 'bg-green-600';
      case 'Programming': return 'bg-blue-600';
      case 'Utility': return 'bg-purple-600';
      default: return 'bg-gray-600';
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Tech Powers</h3>
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
              Learn Tech Power
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>Select a Tech Power</DialogTitle>
              <DialogDescription>
                Choose a tech power to add to your character's repertoire.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center mb-4">
              <SearchIcon className="h-4 w-4 mr-2 text-gray-400" />
              <Input 
                placeholder="Search tech powers..." 
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
                <label className="text-sm font-medium">Tech Type</label>
                <select 
                  className="w-full mt-1 rounded-md border-gray-700 bg-gray-800"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="Gadget">Gadget</option>
                  <option value="Weapon">Weapon</option>
                  <option value="Modification">Modification</option>
                  <option value="Programming">Programming</option>
                  <option value="Utility">Utility</option>
                </select>
              </div>
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-1 gap-4">
                {filteredPowers.map((power) => (
                  <Card 
                    key={power.id} 
                    className="cursor-pointer hover:border-green-500 transition-all"
                    onClick={() => addPower(power)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{power.name}</CardTitle>
                        <div className="flex space-x-2">
                          <Badge className={getTechTypeBadgeColor(power.techType)}>
                            {power.techType}
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
                        <p className="text-sm text-green-400 mt-2">
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
            <p className="text-gray-400">No tech powers selected yet</p>
          </div>
        ) : (
          selectedPowers.map((power: TechPower) => (
            <Card key={power.id} className="bg-gray-800/70 border-gray-700">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{power.name}</CardTitle>
                  <div className="flex space-x-2">
                    <Badge className={getTechTypeBadgeColor(power.techType)}>
                      {power.techType}
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
                  <p className="text-sm text-green-400 mt-2">
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