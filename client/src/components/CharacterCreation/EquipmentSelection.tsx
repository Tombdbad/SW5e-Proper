
import React, { useState, useEffect } from 'react';
import { equipment, Equipment } from '@/lib/sw5e/equipment';
import TranslucentPane from '../ui/TranslucentPane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';

interface EquipmentSelectionProps {
  form: any;
  getSelectedClass: () => any;
}

export default function EquipmentSelection({ form, getSelectedClass }: EquipmentSelectionProps) {
  const { register, watch, setValue } = form;
  const selectedClass = getSelectedClass();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>(equipment);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const characterEquipment = watch('equipment') || [];
  const credits = watch('credits') || 1000;

  useEffect(() => {
    const filtered = equipment.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
    setFilteredEquipment(filtered);
  }, [searchTerm, selectedCategory]);

  const addEquipment = (item: Equipment) => {
    if (credits >= item.price) {
      setValue('equipment', [...characterEquipment, item]);
      setValue('credits', credits - item.price);
    }
  };

  const removeEquipment = (item: Equipment) => {
    setValue('equipment', characterEquipment.filter((e: Equipment) => e.id !== item.id));
    setValue('credits', credits + item.price);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Equipment Selection</h2>

      <TranslucentPane className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="text-xl text-yellow-300">Credits: {credits}</div>
          <Input
            type="text"
            placeholder="Search equipment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <Tabs defaultValue="all" onValueChange={setSelectedCategory}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="weapon">Weapons</TabsTrigger>
            <TabsTrigger value="armor">Armor</TabsTrigger>
            <TabsTrigger value="adventuring gear">Gear</TabsTrigger>
            <TabsTrigger value="tool">Tools</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEquipment.map((item) => (
                <div key={item.id} className="bg-gray-800/50 rounded-lg p-4 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-white font-semibold">{item.name}</h3>
                    <Badge variant={item.category === 'Weapon' ? 'destructive' : 'secondary'}>
                      {item.category}
                    </Badge>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{item.description}</p>
                  <div className="flex gap-2 text-sm mb-2">
                    <span className="text-yellow-300">{item.price} credits</span>
                    {item.weight && <span className="text-gray-400">{item.weight} kg</span>}
                    {item.damage && <span className="text-red-400">{item.damage}</span>}
                  </div>
                  {item.properties && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.properties.map((prop) => (
                        <Tooltip key={prop} content={prop}>
                          <Badge variant="outline" className="text-xs">
                            {prop}
                          </Badge>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                  <Button
                    variant={characterEquipment.some((e: Equipment) => e.id === item.id) ? "destructive" : "default"}
                    onClick={() => {
                      if (characterEquipment.some((e: Equipment) => e.id === item.id)) {
                        removeEquipment(item);
                      } else {
                        addEquipment(item);
                      }
                    }}
                    disabled={!characterEquipment.some((e: Equipment) => e.id === item.id) && credits < item.price}
                    className="mt-auto"
                  >
                    {characterEquipment.some((e: Equipment) => e.id === item.id) ? 'Remove' : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Tabs>
      </TranslucentPane>
    </div>
  );
}
