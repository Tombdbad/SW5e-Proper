import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash } from "lucide-react";
import { equipment } from "@/lib/sw5e/equipment";
import { useCharacter } from "@/lib/stores/useCharacter";

interface InventoryProps {
  character: any;
}

export default function Inventory({ character }: InventoryProps) {
  const { updateCharacter } = useCharacter();
  const [searchTerm, setSearchTerm] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("Miscellaneous");
  const [newItemDescription, setNewItemDescription] = useState("");

  // Get character's equipment IDs
  const characterEquipmentIds = character.equipment || [];
  
  // Get full equipment objects
  const characterEquipment = characterEquipmentIds.map((itemId: string) => {
    return equipment.find(item => item.id === itemId) || { id: itemId, name: itemId, category: "Custom", description: "" };
  });
  
  // Get character's custom items
  const customItems = character.customItems || [];
  
  // Combined inventory (equipment + custom items)
  const inventory = [...characterEquipment, ...customItems];
  
  // Filtered inventory based on search
  const filteredInventory = inventory.filter((item) => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Group inventory by category
  const weapons = filteredInventory.filter(item => item.category === "Weapon");
  const armor = filteredInventory.filter(item => item.category === "Armor");
  const gear = filteredInventory.filter(item => item.category === "Adventuring Gear");
  const tools = filteredInventory.filter(item => item.category === "Tool");
  const miscellaneous = filteredInventory.filter(item => 
    item.category !== "Weapon" && 
    item.category !== "Armor" && 
    item.category !== "Adventuring Gear" && 
    item.category !== "Tool"
  );
  
  // Add custom item
  const addCustomItem = () => {
    if (!newItemName.trim()) return;
    
    const newItem = {
      id: `custom-${Date.now()}`,
      name: newItemName,
      category: newItemCategory,
      description: newItemDescription,
      custom: true
    };
    
    updateCharacter({
      ...character,
      customItems: [...(character.customItems || []), newItem]
    });
    
    // Reset form
    setNewItemName("");
    setNewItemDescription("");
  };
  
  // Remove item
  const removeItem = (itemId: string, isCustom: boolean = false) => {
    if (isCustom) {
      // Remove custom item
      updateCharacter({
        ...character,
        customItems: (character.customItems || []).filter((item: any) => item.id !== itemId)
      });
    } else {
      // Remove standard equipment
      updateCharacter({
        ...character,
        equipment: (character.equipment || []).filter((id: string) => id !== itemId)
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Input 
          placeholder="Search inventory..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Custom Item
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Custom Item</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="itemName">Item Name</Label>
                <Input 
                  id="itemName" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Mysterious Artifact"
                />
              </div>
              
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="itemCategory">Category</Label>
                <select 
                  id="itemCategory" 
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Weapon">Weapon</option>
                  <option value="Armor">Armor</option>
                  <option value="Adventuring Gear">Adventuring Gear</option>
                  <option value="Tool">Tool</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>
              
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="itemDescription">Description</Label>
                <Input 
                  id="itemDescription" 
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  placeholder="A strange device of unknown origin..."
                />
              </div>
              
              <Button className="w-full" onClick={addCustomItem}>
                Add Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="weapons">Weapons</TabsTrigger>
          <TabsTrigger value="armor">Armor</TabsTrigger>
          <TabsTrigger value="gear">Gear</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="misc">Miscellaneous</TabsTrigger>
        </TabsList>
        
        <ScrollArea className="h-[500px]">
          <TabsContent value="all">
            <div className="space-y-6">
              {weapons.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Weapons</h3>
                  <div className="space-y-2">
                    {weapons.map((item) => (
                      <InventoryItem 
                        key={item.id} 
                        item={item} 
                        onRemove={() => removeItem(item.id, !!item.custom)} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {armor.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Armor</h3>
                  <div className="space-y-2">
                    {armor.map((item) => (
                      <InventoryItem 
                        key={item.id} 
                        item={item} 
                        onRemove={() => removeItem(item.id, !!item.custom)} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {gear.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Adventuring Gear</h3>
                  <div className="space-y-2">
                    {gear.map((item) => (
                      <InventoryItem 
                        key={item.id} 
                        item={item} 
                        onRemove={() => removeItem(item.id, !!item.custom)} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {tools.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Tools</h3>
                  <div className="space-y-2">
                    {tools.map((item) => (
                      <InventoryItem 
                        key={item.id} 
                        item={item} 
                        onRemove={() => removeItem(item.id, !!item.custom)} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {miscellaneous.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Miscellaneous</h3>
                  <div className="space-y-2">
                    {miscellaneous.map((item) => (
                      <InventoryItem 
                        key={item.id} 
                        item={item} 
                        onRemove={() => removeItem(item.id, !!item.custom)} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {filteredInventory.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No items found matching "{searchTerm}"
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="weapons">
            <div className="space-y-2">
              {weapons.map((item) => (
                <InventoryItem 
                  key={item.id} 
                  item={item} 
                  onRemove={() => removeItem(item.id, !!item.custom)} 
                />
              ))}
              {weapons.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No weapons found
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="armor">
            <div className="space-y-2">
              {armor.map((item) => (
                <InventoryItem 
                  key={item.id} 
                  item={item} 
                  onRemove={() => removeItem(item.id, !!item.custom)} 
                />
              ))}
              {armor.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No armor found
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="gear">
            <div className="space-y-2">
              {gear.map((item) => (
                <InventoryItem 
                  key={item.id} 
                  item={item} 
                  onRemove={() => removeItem(item.id, !!item.custom)} 
                />
              ))}
              {gear.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No adventuring gear found
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="tools">
            <div className="space-y-2">
              {tools.map((item) => (
                <InventoryItem 
                  key={item.id} 
                  item={item} 
                  onRemove={() => removeItem(item.id, !!item.custom)} 
                />
              ))}
              {tools.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No tools found
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="misc">
            <div className="space-y-2">
              {miscellaneous.map((item) => (
                <InventoryItem 
                  key={item.id} 
                  item={item} 
                  onRemove={() => removeItem(item.id, !!item.custom)} 
                />
              ))}
              {miscellaneous.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No miscellaneous items found
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

interface InventoryItemProps {
  item: any;
  onRemove: () => void;
}

function InventoryItem({ item, onRemove }: InventoryItemProps) {
  return (
    <Card className="bg-gray-700">
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium">{item.name}</div>
            {item.description && (
              <div className="text-sm text-gray-400">{item.description}</div>
            )}
            {item.damage && (
              <div className="text-xs text-gray-500 mt-1">
                Damage: {item.damage}
              </div>
            )}
            {item.armorClass && (
              <div className="text-xs text-gray-500 mt-1">
                AC: {item.armorClass}
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onRemove}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
