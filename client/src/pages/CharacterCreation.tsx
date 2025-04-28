import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CharacterCreationForm from "@/components/CharacterCreation/CharacterCreationForm";
import SpeciesSelection from "@/components/CharacterCreation/SpeciesSelection";
import ClassSelection from "@/components/CharacterCreation/ClassSelection";
import AbilityScores from "@/components/CharacterCreation/AbilityScores";
import BackgroundSelection from "@/components/CharacterCreation/BackgroundSelection";
import EquipmentSelection from "@/components/CharacterCreation/EquipmentSelection";
import { apiRequest } from "@/lib/queryClient";
import { useCharacter } from "@/lib/stores/useCharacter";

// Define the form schema for character creation
const characterFormSchema = z.object({
  name: z.string().min(2, {
    message: "Character name must be at least 2 characters.",
  }),
  species: z.string().min(1, { message: "Please select a species." }),
  class: z.string().min(1, { message: "Please select a class." }),
  background: z.string().min(1, { message: "Please select a background." }),
  alignment: z.string().min(1, { message: "Please select an alignment." }),
  level: z.number().min(1).default(1),
  abilityScores: z.object({
    strength: z.number().min(3).max(18),
    dexterity: z.number().min(3).max(18),
    constitution: z.number().min(3).max(18),
    intelligence: z.number().min(3).max(18),
    wisdom: z.number().min(3).max(18),
    charisma: z.number().min(3).max(18),
  }),
  equipment: z.array(z.string()),
  backstory: z.string().optional(),
  startingLocation: z.string().min(1, { message: "Please select a starting location." }),
});

type CharacterFormValues = z.infer<typeof characterFormSchema>;

export default function CharacterCreation() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("basic");
  const { initializeCharacter } = useCharacter();

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: {
      name: "",
      species: "",
      class: "",
      background: "",
      alignment: "",
      level: 1,
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      equipment: [],
      backstory: "",
      startingLocation: "",
    },
  });

  async function onSubmit(data: CharacterFormValues) {
    try {
      toast.info("Creating your character...");
      
      const response = await apiRequest("POST", "/api/characters", data);
      const character = await response.json();
      
      // Store the character in state
      initializeCharacter(character);
      
      toast.success("Character created successfully!");
      navigate(`/character/manage/${character.id}`);
    } catch (error) {
      console.error("Error creating character:", error);
      toast.error("Failed to create character. Please try again.");
    }
  }

  const goToNextTab = () => {
    switch (activeTab) {
      case "basic":
        setActiveTab("species");
        break;
      case "species":
        setActiveTab("class");
        break;
      case "class":
        setActiveTab("abilities");
        break;
      case "abilities":
        setActiveTab("background");
        break;
      case "background":
        setActiveTab("equipment");
        break;
      case "equipment":
        form.handleSubmit(onSubmit)();
        break;
    }
  };

  const goToPrevTab = () => {
    switch (activeTab) {
      case "species":
        setActiveTab("basic");
        break;
      case "class":
        setActiveTab("species");
        break;
      case "abilities":
        setActiveTab("class");
        break;
      case "background":
        setActiveTab("abilities");
        break;
      case "equipment":
        setActiveTab("background");
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <Card className="max-w-4xl mx-auto bg-gray-800 text-white">
        <CardHeader>
          <CardTitle className="text-2xl text-center text-yellow-400">
            Create Your Character
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-6 mb-8">
                  <TabsTrigger value="basic">Basics</TabsTrigger>
                  <TabsTrigger value="species">Species</TabsTrigger>
                  <TabsTrigger value="class">Class</TabsTrigger>
                  <TabsTrigger value="abilities">Abilities</TabsTrigger>
                  <TabsTrigger value="background">Background</TabsTrigger>
                  <TabsTrigger value="equipment">Equipment</TabsTrigger>
                </TabsList>
                <TabsContent value="basic">
                  <CharacterCreationForm form={form} />
                </TabsContent>
                <TabsContent value="species">
                  <SpeciesSelection form={form} />
                </TabsContent>
                <TabsContent value="class">
                  <ClassSelection form={form} />
                </TabsContent>
                <TabsContent value="abilities">
                  <AbilityScores form={form} />
                </TabsContent>
                <TabsContent value="background">
                  <BackgroundSelection form={form} />
                </TabsContent>
                <TabsContent value="equipment">
                  <EquipmentSelection form={form} />
                </TabsContent>
              </Tabs>

              <div className="flex justify-between mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPrevTab}
                  disabled={activeTab === "basic"}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  onClick={goToNextTab}
                >
                  {activeTab === "equipment" ? "Create Character" : "Next"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
