import { useState } from "react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { equipment } from "@/lib/sw5e/equipment";

export default function EquipmentSelection({ form }: { form: any }) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [credits, setCredits] = useState(1000); // Default starting credits
  
  const handleItemToggle = (itemId: string, price: number, checked: boolean) => {
    if (checked) {
      // Add item if enough credits
      if (credits >= price) {
        setSelectedItems([...selectedItems, itemId]);
        setCredits(credits - price);
        
        // Update form value
        const currentEquipment = form.getValues("equipment") || [];
        form.setValue("equipment", [...currentEquipment, itemId]);
      }
    } else {
      // Remove item and refund credits
      const item = equipment.find(i => i.id === itemId);
      if (item) {
        setSelectedItems(selectedItems.filter(id => id !== itemId));
        setCredits(credits + item.price);
        
        // Update form value
        const currentEquipment = form.getValues("equipment") || [];
        form.setValue("equipment", currentEquipment.filter((id: string) => id !== itemId));
      }
    }
  };
  
  // Filter equipment by categories
  const weaponsAndAmmo = equipment.filter(item => item.category === "Weapon" || item.category === "Ammunition");
  const armor = equipment.filter(item => item.category === "Armor");
  const adventuringGear = equipment.filter(item => item.category === "Adventuring Gear");
  const tools = equipment.filter(item => item.category === "Tool");
  
  // Helper to check if an item is selected
  const isItemSelected = (itemId: string) => {
    return selectedItems.includes(itemId);
  };
  
  // Helper to check if an item can be afforded
  const canAfford = (price: number) => {
    return credits >= price;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-lg font-medium">Select your character's equipment:</div>
        <div className="text-xl font-semibold text-yellow-400">
          Credits: {credits}
        </div>
      </div>
      
      <FormField
        control={form.control}
        name="equipment"
        render={({ field }) => (
          <FormItem>
            <ScrollArea className="h-[500px] rounded-md border p-4">
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Weapons & Ammunition</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {weaponsAndAmmo.map((item) => (
                      <Card key={item.id} className={`border transition-colors ${!canAfford(item.price) && !isItemSelected(item.id) ? 'opacity-50' : ''}`}>
                        <CardHeader className="p-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-md">{item.name}</CardTitle>
                            <div className="text-yellow-400">{item.price} cr</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-sm text-gray-400 mb-2">{item.description}</p>
                          {item.properties && (
                            <div className="text-xs text-gray-500 mb-2">
                              {item.properties.join(", ")}
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            {item.damage && (
                              <div className="text-xs">
                                Damage: {item.damage}
                              </div>
                            )}
                            <Checkbox 
                              id={`item-${item.id}`}
                              checked={isItemSelected(item.id)}
                              onCheckedChange={(checked) => handleItemToggle(item.id, item.price, checked === true)}
                              disabled={!canAfford(item.price) && !isItemSelected(item.id)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Armor</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {armor.map((item) => (
                      <Card key={item.id} className={`border transition-colors ${!canAfford(item.price) && !isItemSelected(item.id) ? 'opacity-50' : ''}`}>
                        <CardHeader className="p-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-md">{item.name}</CardTitle>
                            <div className="text-yellow-400">{item.price} cr</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-sm text-gray-400 mb-2">{item.description}</p>
                          <div className="flex justify-between items-center">
                            <div className="text-xs">
                              AC: {item.armorClass}
                            </div>
                            <Checkbox 
                              id={`item-${item.id}`}
                              checked={isItemSelected(item.id)}
                              onCheckedChange={(checked) => handleItemToggle(item.id, item.price, checked === true)}
                              disabled={!canAfford(item.price) && !isItemSelected(item.id)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Adventuring Gear</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {adventuringGear.map((item) => (
                      <Card key={item.id} className={`border transition-colors ${!canAfford(item.price) && !isItemSelected(item.id) ? 'opacity-50' : ''}`}>
                        <CardHeader className="p-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-md">{item.name}</CardTitle>
                            <div className="text-yellow-400">{item.price} cr</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-sm text-gray-400 mb-2">{item.description}</p>
                          <div className="flex justify-end">
                            <Checkbox 
                              id={`item-${item.id}`}
                              checked={isItemSelected(item.id)}
                              onCheckedChange={(checked) => handleItemToggle(item.id, item.price, checked === true)}
                              disabled={!canAfford(item.price) && !isItemSelected(item.id)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Tools</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tools.map((item) => (
                      <Card key={item.id} className={`border transition-colors ${!canAfford(item.price) && !isItemSelected(item.id) ? 'opacity-50' : ''}`}>
                        <CardHeader className="p-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-md">{item.name}</CardTitle>
                            <div className="text-yellow-400">{item.price} cr</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <p className="text-sm text-gray-400 mb-2">{item.description}</p>
                          <div className="flex justify-end">
                            <Checkbox 
                              id={`item-${item.id}`}
                              checked={isItemSelected(item.id)}
                              onCheckedChange={(checked) => handleItemToggle(item.id, item.price, checked === true)}
                              disabled={!canAfford(item.price) && !isItemSelected(item.id)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
            <FormDescription>
              Select equipment for your character using your available credits.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
