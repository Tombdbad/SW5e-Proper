import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { forcePowers, ForcePower } from '@/lib/sw5e/forcePowers';

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

  const selectedPowers = form.watch('forcePowers') || [];

  const filteredPowers = forcePowers.filter(power => {
    if (power.level > maxPowerLevel) return false;
    if (power.forceAlignment !== 'Any' && power.forceAlignment !== alignment) return false;

    const matchesSearch = power.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         power.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = selectedLevel === 'all' || power.level === parseInt(selectedLevel);
    const matchesSchool = selectedSchool === 'all' || power.school === selectedSchool;

    return matchesSearch && matchesLevel && matchesSchool;
  });

  const addPower = (power: ForcePower) => {
    if (selectedPowers.length >= availablePowers) return;
    if (selectedPowers.some(p => p.id === power.id)) return;
    form.setValue('forcePowers', [...selectedPowers, power]);
  };

  const removePower = (powerId: string) => {
    form.setValue('forcePowers', selectedPowers.filter(p => p.id !== powerId));
  };

  return (
    <div className="space-y-4">
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
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Select Force Power</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Search powers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={selectedLevel}
                  onValueChange={setSelectedLevel}
                >
                  <option value="all">All Levels</option>
                  <option value="0">At-Will</option>
                  {Array.from({ length: maxPowerLevel }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      Level {i + 1}
                    </option>
                  ))}
                </Select>
                <Select
                  value={selectedSchool}
                  onValueChange={setSelectedSchool}
                >
                  <option value="all">All Schools</option>
                  <option value="Universal">Universal</option>
                  <option value="Light">Light</option>
                  <option value="Dark">Dark</option>
                </Select>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredPowers.map((power) => (
                    <Card key={power.id} className="cursor-pointer hover:bg-accent" onClick={() => addPower(power)}>
                      <CardHeader className="p-4">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg">{power.name}</CardTitle>
                          <div className="flex gap-2">
                            <Badge>{power.school}</Badge>
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
                      <CardContent className="pt-0 pb-4">
                        <p className="text-sm">{power.description}</p>
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
            </div>
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
            <Card key={power.id}>
              <CardHeader className="p-4">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{power.name}</CardTitle>
                  <div className="flex gap-2 items-center">
                    <Badge>{power.school}</Badge>
                    <Badge variant="outline">
                      {power.level === 0 ? 'At-Will' : `Level ${power.level}`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePower(power.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}