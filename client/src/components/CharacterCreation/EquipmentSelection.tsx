import React, { useState, useEffect } from 'react';
import TranslucentPane from '../ui/TranslucentPane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EquipmentSelectionProps {
  form: any;
  getSelectedClass: () => any;
}

export default function EquipmentSelection({ form, getSelectedClass }: EquipmentSelectionProps) {
  const { register, watch, setValue } = form;
  const selectedClass = getSelectedClass();

  const equipment = watch('equipment') || [];
  const credits = watch('credits') || 1000;

  const [newItem, setNewItem] = useState('');
  const [itemType, setItemType] = useState('weapon');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Fetch starting equipment based on class
  useEffect(() => {
    if (selectedClass && equipment.length === 0) {
      // This would typically come from a data source
      const startingEquipment = selectedClass.startingEquipment || [];
      setValue('equipment', startingEquipment);
    }
  }, [selectedClass, equipment.length, setValue]);

  const addItem = () => {
    if (!newItem.trim()) return;

    const newEquipment = [...equipment, {
      id: `item-${Date.now()}`,
      name: newItem,
      type: itemType,
      quantity: itemQuantity
    }];

    setValue('equipment', newEquipment);
    setNewItem('');
    setItemQuantity(1);
  };

  const removeItem = (itemId: string) => {
    setValue('equipment', equipment.filter((item: any) => item.id !== itemId));
  };

  const updateCredits = (amount: number) => {
    setValue('credits', Math.max(0, credits + amount));
  };

  // Group equipment by type
  const groupedEquipment = equipment.reduce((acc: any, item: any) => {
    const type = item.type || 'miscellaneous';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Equipment & Credits</h2>

      <TranslucentPane className="p-4">
        <div className="mb-6">
          <div className="bg-gray-700 p-3 rounded-md flex justify-between items-center mb-4">
            <span className="text-yellow-300 font-bold">Credits: {credits}</span>
            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={() => updateCredits(-100)}>-100</Button>
              <Button size="sm" variant="outline" onClick={() => updateCredits(-10)}>-10</Button>
              <Button size="sm" variant="outline" onClick={() => updateCredits(10)}>+10</Button>
              <Button size="sm" variant="outline" onClick={() => updateCredits(100)}>+100</Button>
            </div>
          </div>

          <div className="bg-gray-800 p-3 rounded-md mb-4">
            <h3 className="text-white font-semibold mb-2">Add New Item</h3>
            <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2 mb-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Item name"
                className="flex-grow"
              />

              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="bg-gray-700 text-white rounded-md p-2 md:w-1/4"
              >
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="gear">Gear</option>
                <option value="consumable">Consumable</option>
                <option value="tool">Tool</option>
                <option value="miscellaneous">Miscellaneous</option>
              </select>

              <Input
                type="number"
                value={itemQuantity}
                onChange={(e) => setItemQuantity(parseInt(e.target.value))}
                placeholder="Qty"
                className="md:w-20"
                min={1}
              />
            </div>
            <Button onClick={addItem} className="w-full">Add Item</Button>
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Items</TabsTrigger>
            <TabsTrigger value="weapons">Weapons</TabsTrigger>
            <TabsTrigger value="armor">Armor</TabsTrigger>
            <TabsTrigger value="gear">Gear</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="bg-gray-800 bg-opacity-70 rounded-lg p-4">
              <h3 className="text-yellow-400 font-semibold text-lg border-b border-gray-700 pb-2 mb-3">
                All Equipment
              </h3>

              {equipment.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No equipment added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {equipment.map((item: any) => (
                    <li key={`equip-${item.id}`} className="flex justify-between items-center bg-gray-700 bg-opacity-50 p-2 rounded">
                      <div>
                        <span className="text-white">{item.name}</span>
                        {item.quantity > 1 && (
                          <span className="text-gray-400 ml-2">×{item.quantity}</span>
                        )}
                        <span className="text-gray-400 text-xs ml-2">({item.type})</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950"
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {Object.entries(groupedEquipment).map(([type, items]) => (
            <TabsContent key={type} value={type}>
              <div className="bg-gray-800 bg-opacity-70 rounded-lg p-4">
                <h3 className="text-yellow-400 font-semibold text-lg border-b border-gray-700 pb-2 mb-3">
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </h3>

                <ul className="space-y-2">
                  {(items as any[]).map((item) => (
                    <li key={`item-${item.id}`} className="flex justify-between items-center bg-gray-700 bg-opacity-50 p-2 rounded">
                      <div>
                        <span className="text-white">{item.name}</span>
                        {item.quantity > 1 && (
                          <span className="text-gray-400 ml-2">×{item.quantity}</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950"
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </TranslucentPane>
    </div>
  );
}