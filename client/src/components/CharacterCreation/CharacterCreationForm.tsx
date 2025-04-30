import { useState, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { useCharacter } from "@/lib/stores/useCharacter";
import { ValidationProgress } from "./ValidationProgress";

// Import SW5E data and components
import { species, getSpeciesById } from "@/lib/sw5e/species";
import { CLASSES } from "@/lib/sw5e/classes";
import { backgrounds, BACKGROUNDS } from "@/lib/sw5e/backgrounds";
import { FORCE_POWERS } from "@/lib/sw5e/forcePowers";
import { TECH_POWERS } from "@/lib/sw5e/techPowers";
import { FEATS } from "@/lib/sw5e/feats";
import { abilities } from "@/lib/sw5e/abilities";
import { calculateModifier } from "@/lib/sw5e/rules";
import { ALIGNMENTS, SKILLS } from "@/lib/sw5e/constants";
import SpeciesSelection from "./SpeciesSelection";
import ClassSelection from "./ClassSelection";
import AbilityScores from "./AbilityScores";
import BackgroundSelection from "./BackgroundSelection";
import EquipmentSelection from "./EquipmentSelection";
import FeatsSelection from "./FeatsSelection";
import ForcePowersSelection from "./ForcePowersSelection";
import TechPowersSelection from "./TechPowersSelection";
import ArchetypeSelection from "./ArchetypeSelection";
import { CharacterPreview } from "../CharacterManagement/CharacterSheet";

// Define character schema
const characterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  species: z.string().min(1, "Species is required"),
  class: z.string().min(1, "Class is required"),
  level: z.number().min(1).max(20).default(1),
  alignment: z.string().default("Neutral Balanced"),
  background: z.string().optional(),
  abilityScores: z.object({
    strength: z.number().min(1).max(20).default(10),
    dexterity: z.number().min(1).max(20).default(10),
    constitution: z.number().min(1).max(20).default(10),
    intelligence: z.number().min(1).max(20).default(10),
    wisdom: z.number().min(1).max(20).default(10),
    charisma: z.number().min(1).max(20).default(10),
  }).default({}),
  bonds: z.string().optional(),
  motivations: z.string().optional(),
  feats: z.array(z.string()).default([]),
  forcePowers: z.array(z.string()).default([]),
  techPowers: z.array(z.string()).default([]),
  equipment: z.array(z.object({
    id: z.string(),
    quantity: z.number().default(1)
  })).default([]),
});

type CharacterData = z.infer<typeof characterSchema>;

export default function CharacterCreationForm() {
  const [activeTab, setActiveTab] = useState("basic");
  const [characterLevel, setCharacterLevel] = useState(1);
  const [showForcePowers, setShowForcePowers] = useState(false);
  const [showTechPowers, setShowTechPowers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { character, updateCharacter } = useCharacter();

  const alignments = ALIGNMENTS;

  const methods = useForm<CharacterData>({
    resolver: zodResolver(characterSchema),
    defaultValues: {
      name: character?.name || "",
      species: character?.species || "",
      class: character?.class || "",
      level: character?.level || 1,
      alignment: character?.alignment || "Neutral Balanced",
      abilityScores: character?.abilityScores || {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      bonds: character?.bonds || "",
      motivations: character?.motivations || "",
      feats: character?.feats || [],
      forcePowers: character?.forcePowers || [],
      techPowers: character?.techPowers || [],
      equipment: character?.equipment || [],
    }
  });

  const { watch, handleSubmit, control } = methods;

  // Watch for important form values
  const selectedClass = watch("class");
  const selectedLevel = watch("level");
  const selectedAlignment = watch("alignment");
  const abilityScores = watch("abilityScores");

  // Effect to update character level state
  useEffect(() => {
    if (selectedLevel) {
      setCharacterLevel(selectedLevel);
    }
  }, [selectedLevel]);
  
  // Auto-save character draft every 30 seconds
  useEffect(() => {
    const formValues = methods.getValues();
    const saveInterval = setInterval(() => {
      const currentValues = methods.getValues();
      if (currentValues.name) { // Only save if at least a name exists
        localStorage.setItem('characterDraft', JSON.stringify(currentValues));
        console.log('Draft saved automatically');
      }
    }, 30000);
    
    return () => clearInterval(saveInterval);
  }, [methods]);

  // Effect to determine power types based on class
  useEffect(() => {
    if (selectedClass) {
      const classData = classes.find(c => c.id === selectedClass);
      setShowForcePowers(classData?.forceCasting ?? false);
      setShowTechPowers(classData?.techCasting ?? false);
    }
  }, [selectedClass]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // Load draft function
  const loadDraft = () => {
    try {
      const savedDraft = localStorage.getItem('characterDraft');
      if (savedDraft) {
        const draftData = JSON.parse(savedDraft);
        methods.reset(draftData);
        console.log('Draft loaded successfully');
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  };
  
  // Check for existing draft on mount
  useEffect(() => {
    if (localStorage.getItem('characterDraft')) {
      // Show notification or prompt user to load draft
      if (window.confirm('You have a saved character draft. Would you like to load it?')) {
        loadDraft();
      }
    }
  }, []);
  
  const onSubmit = async (data: CharacterData) => {
    setIsSubmitting(true);
    try {
      console.log("Submitting character data:", data);
      
      // Update the character in Zustand store
      updateCharacter(data);
      
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        console.error("Failed to create character:", await response.text());
        throw new Error("Failed to create character");
      }
      
      const character = await response.json();
      console.log("Character created successfully:", character);
    } catch (error) {
      console.error("Error submitting character:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="w-full"
            >
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
                      control={control}
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
                        control={control}
                        name="level"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Level</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(parseInt(value));
                              }}
                              value={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select level" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Array.from({ length: 20 }, (_, i) => (
                                  <SelectItem
                                    key={i + 1}
                                    value={(i + 1).toString()}
                                  >
                                    Level {i + 1}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="alignment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Alignment</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <SpeciesSelection onSelect={() => handleTabChange("abilities")} />
                    <Separator />
                    <ClassSelection onSelect={() => handleTabChange("abilities")} />
                  </div>
                </TranslucentPane>
              </TabsContent>

              <TabsContent value="abilities" className="space-y-6">
                <TranslucentPane className="p-6">
                  <AbilityScores />
                </TranslucentPane>
              </TabsContent>

              <TabsContent value="background" className="space-y-6">
                <TranslucentPane className="p-6">
                  <BackgroundSelection onSelect={() => handleTabChange("features")} />
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <FormField
                      control={control}
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={control}
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TranslucentPane>
              </TabsContent>

              <TabsContent value="features" className="space-y-6">
                <TranslucentPane className="p-6">
                  <ArchetypeSelection
                    characterClass={selectedClass || ""}
                    characterLevel={characterLevel}
                  />

                  <Separator className="my-6" />

                  <FeatsSelection
                    availableFeats={Math.floor(characterLevel / 4) + 1}
                    characterClass={selectedClass || ""}
                  />

                  {showForcePowers && (
                    <>
                      <Separator className="my-6" />
                      <ForcePowersSelection
                        availablePowers={characterLevel + 1}
                        maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                        alignment={
                          selectedAlignment?.includes("Light")
                            ? "Light"
                            : selectedAlignment?.includes("Dark")
                              ? "Dark"
                              : "Neutral"
                        }
                      />
                    </>
                  )}

                  {showTechPowers && (
                    <>
                      <Separator className="my-6" />
                      <TechPowersSelection
                        availablePowers={characterLevel + 1}
                        maxPowerLevel={Math.min(5, Math.ceil(characterLevel / 4))}
                      />
                    </>
                  )}
                </TranslucentPane>
              </TabsContent>

              <TabsContent value="equipment" className="space-y-6">
                <TranslucentPane className="p-6">
                  <EquipmentSelection />
                </TranslucentPane>
              </TabsContent>
            </Tabs>
          </div>
          
          <div className="space-y-6">
            <TranslucentPane className="p-6">
              <h2 className="text-lg font-medium text-yellow-400 mb-4">Character Preview</h2>
              <CharacterPreview abilities={abilityScores} />
              <div className="mt-6 border-t pt-4 border-gray-700">
                <ValidationProgress character={methods.getValues()} />
              </div>
            </TranslucentPane>
            
            <div className="space-y-3">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Save Character"}
              </Button>
              
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  className="w-full" 
                  onClick={() => {
                    const data = methods.getValues();
                    localStorage.setItem('characterDraft', JSON.stringify(data));
                    alert('Character draft saved!');
                  }}
                >
                  Save Draft
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  className="w-full" 
                  onClick={loadDraft}
                >
                  Load Draft
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
