import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SearchIcon, PlusIcon, XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { getAllItems, getItemsByType, findItemById } from '@/lib/sw5e/items';
import { Item, Weapon, Armor } from '@/lib/sw5e/items';

// Helper function to determine if an item is a weapon
function isWeapon(item: Item): item is Weapon {
  return item.type === 'weapon';
}

// Helper function to determine if an item is armor
function isArmor(item: Item): item is Armor {
  return item.type === 'armor';
}

interface InventoryProps {
  character: any;
}

export default function Inventory({ character }: InventoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [tabValue, setTabValue] = useState('all');
  
  // Initialize inventory if not present
  const inventory = character.inventory || [];
  
  // Filter items based on search term and tab
  const filteredItems = getAllItems().filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (tabValue === 'all') return matchesSearch;
    return matchesSearch && item.type === tabValue;
  });
  
  // Add an item to the character's inventory
  const addItemToInventory = (item: Item) => {
    const updatedInventory = [...inventory, {
      itemId: item.id,
      quantity: 1,
      equipped: false
    }];
    
    // Update character data
    // This would typically involve an API call
    console.log('Adding item to inventory:', item.name);
    
    // Close the dialog
    setAddItemDialogOpen(false);
  };
  
  // Remove an item from character's inventory
  const removeItemFromInventory = (index: number) => {
    const updatedInventory = [...inventory];
    updatedInventory.splice(index, 1);
    
    // Update character data
    // This would typically involve an API call
    console.log('Removing item at index:', index);
  };
  
  // Toggle whether an item is equipped
  const toggleEquipped = (index: number) => {
    const updatedInventory = [...inventory];
    updatedInventory[index].equipped = !updatedInventory[index].equipped;
    
    // Update character data
    // This would typically involve an API call
    console.log('Toggling equipped state for item at index:', index);
  };
  
  return (
    <div>
      <TranslucentPane className="p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-yellow-400">Inventory</h2>
          <div className="flex space-x-2">
            <div className="relative">
              <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search inventory..."
                className="pl-8 bg-gray-800/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700">
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Add Item to Inventory</DialogTitle>
                  <DialogDescription>
                    Browse and select items to add to your character's inventory.
                  </DialogDescription>
                </DialogHeader>
                
                <div>
                  <div className="flex items-center mb-4">
                    <SearchIcon className="h-4 w-4 mr-2 text-gray-400" />
                    <Input 
                      placeholder="Search for items..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                  
                  <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
                    <TabsList className="grid grid-cols-4 mb-4">
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="weapon">Weapons</TabsTrigger>
                      <TabsTrigger value="armor">Armor</TabsTrigger>
                      <TabsTrigger value="gear">Gear</TabsTrigger>
                    </TabsList>
                    
                    <div className="h-96 overflow-y-auto pr-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredItems.map((item) => (
                          <Card key={item.id} className="bg-gray-800 border-gray-700 hover:border-yellow-600 transition-all cursor-pointer" onClick={() => addItemToInventory(item)}>
                            <CardHeader className="p-4 pb-2">
                              <div className="flex justify-between">
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                                <Badge className="ml-2" variant={item.type === 'weapon' ? 'destructive' : item.type === 'armor' ? 'default' : 'secondary'}>
                                  {item.category}
                                </Badge>
                              </div>
                              <CardDescription>
                                {item.rarity} • {item.cost} credits
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                              <p className="text-sm">{item.description}</p>
                              
                              {isWeapon(item) && (
                                <div className="mt-2 text-sm">
                                  <span className="font-semibold">Damage:</span> {item.damageDice} {item.damageType}
                                  {item.properties && (
                                    <div>
                                      <span className="font-semibold">Properties:</span> {item.properties.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {isArmor(item) && (
                                <div className="mt-2 text-sm">
                                  <span className="font-semibold">AC:</span> {item.armorClass}
                                  {item.strengthRequirement && (
                                    <div>
                                      <span className="font-semibold">Str Required:</span> {item.strengthRequirement}
                                    </div>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </Tabs>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddItemDialogOpen(false)}>Cancel</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="all">All Items</TabsTrigger>
            <TabsTrigger value="weapons">Weapons</TabsTrigger>
            <TabsTrigger value="armor">Armor</TabsTrigger>
            <TabsTrigger value="gear">Gear</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="m-0">
            {inventory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>Your inventory is empty.</p>
                <p>Add items using the "Add Item" button.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {inventory.map((inventoryItem: any, index: number) => {
                  const item = findItemById(inventoryItem.itemId);
                  if (!item) return null;
                  
                  return (
                    <InventoryItem
                      key={index}
                      item={{
                        ...item,
                        quantity: inventoryItem.quantity,
                        equipped: inventoryItem.equipped
                      }}
                      onRemove={() => removeItemFromInventory(index)}
                      onToggleEquipped={() => toggleEquipped(index)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="weapons" className="m-0">
            {inventory.filter((i: any) => {
              const item = findItemById(i.itemId);
              return item && item.type === 'weapon';
            }).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No weapons in your inventory.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {inventory.map((inventoryItem: any, index: number) => {
                  const item = findItemById(inventoryItem.itemId);
                  if (!item || item.type !== 'weapon') return null;
                  
                  return (
                    <InventoryItem
                      key={index}
                      item={{
                        ...item,
                        quantity: inventoryItem.quantity,
                        equipped: inventoryItem.equipped
                      }}
                      onRemove={() => removeItemFromInventory(index)}
                      onToggleEquipped={() => toggleEquipped(index)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="armor" className="m-0">
            {inventory.filter((i: any) => {
              const item = findItemById(i.itemId);
              return item && item.type === 'armor';
            }).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No armor in your inventory.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {inventory.map((inventoryItem: any, index: number) => {
                  const item = findItemById(inventoryItem.itemId);
                  if (!item || item.type !== 'armor') return null;
                  
                  return (
                    <InventoryItem
                      key={index}
                      item={{
                        ...item,
                        quantity: inventoryItem.quantity,
                        equipped: inventoryItem.equipped
                      }}
                      onRemove={() => removeItemFromInventory(index)}
                      onToggleEquipped={() => toggleEquipped(index)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="gear" className="m-0">
            {inventory.filter((i: any) => {
              const item = findItemById(i.itemId);
              return item && item.type === 'gear';
            }).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No gear in your inventory.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {inventory.map((inventoryItem: any, index: number) => {
                  const item = findItemById(inventoryItem.itemId);
                  if (!item || item.type !== 'gear') return null;
                  
                  return (
                    <InventoryItem
                      key={index}
                      item={{
                        ...item,
                        quantity: inventoryItem.quantity,
                        equipped: inventoryItem.equipped
                      }}
                      onRemove={() => removeItemFromInventory(index)}
                      onToggleEquipped={() => toggleEquipped(index)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </TranslucentPane>
    </div>
  );
}

interface InventoryItemProps {
  item: any;
  onRemove: () => void;
  onToggleEquipped: () => void;
}

function InventoryItem({ item, onRemove, onToggleEquipped }: InventoryItemProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <Card className="bg-gray-800/70 border-gray-700">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center">
              <CardTitle className="text-lg">{item.name}</CardTitle>
              {item.equipped && (
                <Badge className="ml-2 bg-green-700">Equipped</Badge>
              )}
            </div>
            <CardDescription>
              {item.quantity > 1 ? `Quantity: ${item.quantity} • ` : ''}
              {item.rarity} • {item.category}
            </CardDescription>
          </div>
          <XIcon 
            className="h-5 w-5 text-gray-400 hover:text-red-500 cursor-pointer" 
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          />
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2">
        <Button 
          variant="link" 
          size="sm" 
          className="p-0 h-auto text-blue-400" 
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </Button>
        
        {showDetails && (
          <div className="mt-2 text-sm space-y-2 text-gray-300">
            <p>{item.description}</p>
            
            {isWeapon(item) && (
              <>
                <p><span className="font-semibold">Damage:</span> {item.damageDice} {item.damageType}</p>
                <p><span className="font-semibold">Classification:</span> {item.weaponClassification}</p>
                {item.properties && (
                  <p><span className="font-semibold">Properties:</span> {item.properties.join(', ')}</p>
                )}
              </>
            )}
            
            {isArmor(item) && (
              <>
                <p><span className="font-semibold">Armor Class:</span> {item.armorClass}</p>
                <p><span className="font-semibold">Classification:</span> {item.armorClassification}</p>
                {item.strengthRequirement && (
                  <p><span className="font-semibold">Strength Required:</span> {item.strengthRequirement}</p>
                )}
                {item.stealthDisadvantage && (
                  <p><span className="font-semibold">Disadvantage on Stealth checks</span></p>
                )}
              </>
            )}
            
            {item.additionalInfo && (
              <p><span className="font-semibold">Additional Info:</span> {item.additionalInfo}</p>
            )}
            
            <p><span className="font-semibold">Value:</span> {item.cost} credits</p>
            {item.weight && (
              <p><span className="font-semibold">Weight:</span> {item.weight} kg</p>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex justify-end">
        <Button 
          variant={item.equipped ? "destructive" : "default"}
          size="sm"
          onClick={onToggleEquipped}
        >
          {item.equipped ? 'Unequip' : 'Equip'}
        </Button>
      </CardFooter>
    </Card>
  );
}