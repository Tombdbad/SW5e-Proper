import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { feats, Feat, getFeatsByCategory } from '@/lib/sw5e/feats';

interface FeatsSelectionProps {
  form: any;
  availableFeats?: number;
  characterClass?: string;
  abilities?: Record<string, number>;
  proficiencies?: string[];
}

export default function FeatsSelection({ form, availableFeats = 1, characterClass = '', abilities = {}, proficiencies = [] }: FeatsSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [featDialogOpen, setFeatDialogOpen] = useState(false);
  
  // Get the currently selected feats from the form
  const selectedFeats = form.watch('feats') || [];
  
  // Filter feats based on search and category
  const filteredFeats = feats.filter(feat => {
    const matchesSearch = feat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         feat.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedCategory === 'all') return matchesSearch;
    return matchesSearch && feat.category === selectedCategory;
  });
  
  // Add a feat to the character
  const addFeat = (feat: Feat) => {
    const currentFeats = form.getValues('feats') || [];
    
    // Check if the maximum number of feats has been reached
    if (currentFeats.length >= availableFeats) {
      return;
    }
    
    // Check if the feat is already selected
    if (currentFeats.some((f: Feat) => f.id === feat.id)) {
      return;
    }
    
    form.setValue('feats', [...currentFeats, feat]);
    setFeatDialogOpen(false);
  };
  
  // Remove a feat from the character
  const removeFeat = (featId: string) => {
    const currentFeats = form.getValues('feats') || [];
    form.setValue('feats', currentFeats.filter((f: Feat) => f.id !== featId));
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Character Feats</h3>
          <p className="text-sm text-muted-foreground">
            {selectedFeats.length}/{availableFeats} feats selected
          </p>
        </div>
        
        <Dialog open={featDialogOpen} onOpenChange={setFeatDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="default" 
              disabled={selectedFeats.length >= availableFeats}
            >
              Select Feat
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>Select a Feat</DialogTitle>
              <DialogDescription>
                Choose a feat to enhance your character's abilities.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center mb-4">
              <SearchIcon className="h-4 w-4 mr-2 text-gray-400" />
              <Input 
                placeholder="Search feats..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
            
            <Tabs 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 mb-4 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="Combat">Combat</TabsTrigger>
                <TabsTrigger value="Force">Force</TabsTrigger>
                <TabsTrigger value="General">General</TabsTrigger>
              </TabsList>
              <TabsList className="grid grid-cols-3 mb-4 w-full">
                <TabsTrigger value="Tech">Tech</TabsTrigger>
                <TabsTrigger value="Species">Species</TabsTrigger>
                <TabsTrigger value="Tradition">Tradition</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-1 gap-4">
                  {filteredFeats.map((feat) => (
                    <Card 
                      key={feat.id} 
                      className="cursor-pointer hover:border-yellow-500 transition-all"
                      onClick={() => addFeat(feat)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg">{feat.name}</CardTitle>
                          <Badge>{feat.category}</Badge>
                        </div>
                        {feat.prerequisites && (
                          <CardDescription className="text-amber-500">
                            Prerequisites: {feat.prerequisites.join(', ')}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0 pb-2">
                        <p className="text-sm mb-2">{feat.description}</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {feat.benefits.map((benefit, index) => (
                            <li key={index}>{benefit}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="space-y-4">
        {selectedFeats.length === 0 ? (
          <div className="text-center p-6 bg-gray-800/30 rounded-md border border-gray-700">
            <p className="text-gray-400">No feats selected yet</p>
          </div>
        ) : (
          selectedFeats.map((feat: Feat) => (
            <Card key={feat.id} className="bg-gray-800/70 border-gray-700">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{feat.name}</CardTitle>
                  <Badge>{feat.category}</Badge>
                </div>
                {feat.prerequisites && (
                  <CardDescription className="text-amber-500">
                    Prerequisites: {feat.prerequisites.join(', ')}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <p className="text-sm mb-2">{feat.description}</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {feat.benefits.map((benefit, index) => (
                    <li key={index}>{benefit}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-0 flex justify-end">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => removeFeat(feat.id)}
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