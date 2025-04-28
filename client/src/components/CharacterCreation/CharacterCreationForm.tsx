import { useState } from "react";
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
    "Lawful Light", "Neutral Light", "Chaotic Light",
    "Lawful Balanced", "Neutral Balanced", "Chaotic Balanced",
    "Lawful Dark", "Neutral Dark", "Chaotic Dark",
  ];

  // Get the selected class to determine which power types to show
  const selectedClass = form.watch("class");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-5 mb-6">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="abilities">Abilities</TabsTrigger>
          <TabsTrigger value="background">Background</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
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

              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Level</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(parseInt(value));
                          setCharacterLevel(parseInt(value));
                        }}
                        defaultValue={field.value?.toString()}
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
                            <SelectValue placeholder="Select alignment" />
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
                    </FormItem>
                  )}
                />
              </div>

              <SpeciesSelection form={form} onSelect={() => handleTabChange("abilities")} />
              <Separator />
              <ClassSelection form={form} onSelect={() => handleTabChange("abilities")} />
            </div>
          </TranslucentPane>
        </TabsContent>

        <TabsContent value="abilities" className="space-y-6">
          <TranslucentPane className="p-6">
            <AbilityScores form={form} />
          </TranslucentPane>
        </TabsContent>

        <TabsContent value="background" className="space-y-6">
          <TranslucentPane className="p-6">
            <BackgroundSelection form={form} onSelect={() => handleTabChange("features")} />
            <Separator className="my-6" />
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="bonds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bonds</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What connects your character to people, places, or ideals?"
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="motivations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivations</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What drives your character to adventure?"
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
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