import { useState } from "react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import TranslucentPane from "@/components/ui/TranslucentPane";

// Import SW5E data and components
import { species } from "@/lib/sw5e/species";
import { classes } from "@/lib/sw5e/classes";
import { backgrounds } from "@/lib/sw5e/backgrounds";
import { conditions } from "@/lib/sw5e/conditions";
import { skills } from "@/lib/sw5e/skills";
import { forcePowers } from "@/lib/sw5e/forcePowers";
import { techPowers } from "@/lib/sw5e/techPowers";
import { feats } from "@/lib/sw5e/feats";
import SpeciesSelection from "./SpeciesSelection";
import ClassSelection from "./ClassSelection";
import AbilityScores from "./AbilityScores";
import BackgroundSelection from "./BackgroundSelection";
import EquipmentSelection from "./EquipmentSelection";
import FeatsSelection from "./FeatsSelection";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";
import ArchetypeSelection from "./ArchetypeSelection";
import { useForm } from "react-hook-form";
import { CharacterData } from "@/types/CharacterData"; // Assuming this type exists


export default function CharacterCreationForm() {
  const [activeTab, setActiveTab] = useState("basic");
  const [characterLevel, setCharacterLevel] = useState(1);
  const [showForcePowers, setShowForcePowers] = useState(false);
  const [showTechPowers, setShowTechPowers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Added state for submission

  const alignments = [
    "Lawful Light", "Neutral Light", "Chaotic Light",
    "Lawful Balanced", "Neutral Balanced", "Chaotic Balanced",
    "Lawful Dark", "Neutral Dark", "Chaotic Dark",
  ];

  const { register, handleSubmit, watch, formState: { errors } } = useForm<CharacterData>(); //Added react-hook-form

  // Get the selected class to determine which power types to show
  const selectedClass = watch("class");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const onSubmit = async (data: CharacterData) => {
    setIsSubmitting(true);
    try {
      console.log('Submitting character data:', data);
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        console.error('Failed to create character:', await response.text());
        throw new Error('Failed to create character');
      }
      const character = await response.json();
      console.log('Character created successfully:', character);
      // Handle successful submission, e.g., redirect
    } catch (error) {
      console.error('Error submitting character:', error);
      // Handle submission error, e.g., display error message
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}> {/* Added form submission */}
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
                  control={register("name")}
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
                    control={register("level", { valueAsNumber: true })}
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
                    control={register("alignment")}
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

                <SpeciesSelection form={register} onSelect={() => handleTabChange("abilities")} />
                <Separator />
                <ClassSelection form={register} onSelect={() => handleTabChange("abilities")} />
              </div>
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="abilities" className="space-y-6">
            <TranslucentPane className="p-6">
              <AbilityScores form={register} />
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="background" className="space-y-6">
            <TranslucentPane className="p-6">
              <BackgroundSelection form={register} onSelect={() => handleTabChange("features")} />
              <Separator className="my-6" />
              <div className="space-y-4">
                <FormField
                  control={register("bonds")}
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
                  control={register("motivations")}
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
                form={register}
                characterClass={selectedClass || ''}
                characterLevel={characterLevel}
              />

              <Separator className="my-6" />

              <FeatsSelection
                form={register}
                availableFeats={Math.floor(characterLevel / 4) + 1}
                characterClass={selectedClass || ''}
              />

              {showForcePowers && (
                <>
                  <Separator className="my-6" />
                  <ForcePowersSelection
                    form={register}
                    availablePowers={characterLevel + 1}
                    maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                    alignment={watch("alignment")?.includes("Light") ? "Light" :
                              watch("alignment")?.includes("Dark") ? "Dark" : "Neutral"}
                  />
                </>
              )}

              {showTechPowers && (
                <>
                  <Separator className="my-6" />
                  <TechPowersSelection
                    form={register}
                    availablePowers={characterLevel + 1}
                    maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                  />
                </>
              )}
            </TranslucentPane>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-6">
            <TranslucentPane className="p-6">
              <EquipmentSelection form={register} />
            </TranslucentPane>
          </TabsContent>
        </Tabs>
        <button type="submit" disabled={isSubmitting}> {/* Added submit button */}
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  );
}