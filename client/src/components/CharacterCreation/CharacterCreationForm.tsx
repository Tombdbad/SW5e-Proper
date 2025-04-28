import { useState, useEffect } from "react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import TranslucentPane from "@/components/ui/TranslucentPane";

// Import SW5E data and components
import { starSystems } from "@/lib/sw5e/locations";
import SpeciesSelection from "./SpeciesSelection";
import ClassSelection from "./ClassSelection";
import AbilityScores from "./AbilityScores";
import BackgroundSelection from "./BackgroundSelection";
import EquipmentSelection from "./EquipmentSelection";
import FeatsSelection from "./FeatsSelection";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";
import ArchetypeSelection from "./ArchetypeSelection";

export default function CharacterCreationForm({ form }: { form: any }) {
  const [activeTab, setActiveTab] = useState("basic");
  const [characterLevel, setCharacterLevel] = useState(1);
  const [showForcePowers, setShowForcePowers] = useState(false);
  const [showTechPowers, setShowTechPowers] = useState(false);
  
  const alignments = [
    "Lawful Light",
    "Neutral Light",
    "Chaotic Light",
    "Lawful Balanced",
    "Neutral Balanced",
    "Chaotic Balanced",
    "Lawful Dark",
    "Neutral Dark",
    "Chaotic Dark",
  ];

  // Get the selected class to determine which power types to show
  const selectedClass = form.watch("class");
  
  // Update power visibility based on class
  useEffect(() => {
    if (selectedClass) {
      // Force-using classes
      if (["consular", "guardian", "sentinel"].includes(selectedClass)) {
        setShowForcePowers(true);
        setShowTechPowers(false);
      } 
      // Tech-using classes
      else if (["engineer", "scholar", "scout"].includes(selectedClass)) {
        setShowForcePowers(false);
        setShowTechPowers(true);
      }
      // Mixed classes
      else if (["operative"].includes(selectedClass)) {
        setShowForcePowers(true);
        setShowTechPowers(true);
      }
      // Non-power classes
      else {
        setShowForcePowers(false);
        setShowTechPowers(false);
      }
    }
  }, [selectedClass]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="abilities">Abilities & Skills</TabsTrigger>
          <TabsTrigger value="features">Features & Powers</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-6">
          <TranslucentPane className="p-6">
            <div className="grid grid-cols-1 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Character Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter character name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Character Level</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(parseInt(value));
                          setCharacterLevel(parseInt(value));
                        }} 
                        defaultValue={field.value?.toString() || "1"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 20 }, (_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()}>
                              Level {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Your character's experience level.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="alignment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alignment</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an alignment" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {alignments.map((alignment) => (
                            <SelectItem key={alignment} value={alignment}>
                              {alignment}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Your character's ethical and moral outlook.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <SpeciesSelection form={form} />
              
              <Separator />
              
              <ClassSelection form={form} />
              
              <Separator />
              
              <BackgroundSelection form={form} />
              
              <Separator />
              
              <FormField
                control={form.control}
                name="startingLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starting Location</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a star system" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {starSystems.map((system) => (
                          <SelectItem key={system.id} value={system.id}>
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Where your character's journey will begin.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backstory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Character Backstory</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your character's history and motivations..." 
                        className="h-32"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Provide details about your character's past, motivations, and goals.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TranslucentPane>
        </TabsContent>
        
        <TabsContent value="abilities" className="space-y-6">
          <TranslucentPane className="p-6">
            <AbilityScores form={form} />
          </TranslucentPane>
        </TabsContent>
        
        <TabsContent value="features" className="space-y-6">
          <TranslucentPane className="p-6">
            <ArchetypeSelection 
              form={form} 
              characterClass={selectedClass || ''} 
              characterLevel={characterLevel} 
            />
            
            <Separator className="my-6" />
            
            <FeatsSelection 
              form={form} 
              availableFeats={Math.floor(characterLevel / 4) + 1}
              characterClass={selectedClass || ''}
            />
            
            {showForcePowers && (
              <>
                <Separator className="my-6" />
                <ForcePowersSelection 
                  form={form} 
                  availablePowers={characterLevel + 1}
                  maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                  alignment={form.watch("alignment")?.includes("Light") ? "Light" : 
                            form.watch("alignment")?.includes("Dark") ? "Dark" : "Neutral"}
                />
              </>
            )}
            
            {showTechPowers && (
              <>
                <Separator className="my-6" />
                <TechPowersSelection 
                  form={form} 
                  availablePowers={characterLevel + 1}
                  maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                />
              </>
            )}
          </TranslucentPane>
        </TabsContent>
        
        <TabsContent value="equipment" className="space-y-6">
          <TranslucentPane className="p-6">
            <EquipmentSelection form={form} />
          </TranslucentPane>
        </TabsContent>
      </Tabs>
    </div>
  );
}
