import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlusCircle, Save } from "lucide-react";
import CharacterSheet from "@/components/CharacterManagement/CharacterSheet";
import Inventory from "@/components/CharacterManagement/Inventory";
import { useCharacter } from "@/lib/stores/useCharacter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCampaign } from "@/lib/stores/useCampaign";

export default function CharacterManagement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { character, setCharacter } = useCharacter();
  const { generateCampaign } = useCampaign();
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);

  // Fetch character data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/characters/${id}`],
    enabled: !!id,
  });

  // Update character mutation
  const updateCharacter = useMutation({
    mutationFn: async (updatedData: any) => {
      return apiRequest("PUT", `/api/characters/${id}`, updatedData);
    },
    onSuccess: () => {
      toast.success("Character updated successfully");
      queryClient.invalidateQueries({ queryKey: [`/api/characters/${id}`] });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  // Set character data when loaded
  useEffect(() => {
    if (data && !isLoading) {
      setCharacter(data);
    }
  }, [data, isLoading, setCharacter]);

  // Generate campaign
  const handleGenerateCampaign = async () => {
    if (!character) return;
    
    setIsGeneratingCampaign(true);
    try {
      const campaign = await generateCampaign(character);
      toast.success("Campaign generated successfully!");
      navigate(`/campaign/${campaign.id}`);
    } catch (error) {
      console.error("Error generating campaign:", error);
      toast.error("Failed to generate campaign");
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  // Save character changes
  const handleSaveChanges = () => {
    if (!character) return;
    updateCharacter.mutate(character);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl mb-4">Failed to load character</div>
        <Link to="/">
          <Button>Return to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-white">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-yellow-400">{character.name}</h1>
            <p className="text-gray-300">
              Level {character.level} {character.species} {character.class}
            </p>
          </div>
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="border-yellow-400 text-yellow-400"
              onClick={handleSaveChanges}
              disabled={updateCharacter.isPending}
            >
              {updateCharacter.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
            <Button 
              onClick={handleGenerateCampaign}
              disabled={isGeneratingCampaign}
            >
              {isGeneratingCampaign ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4 mr-2" />
              )}
              Generate Campaign
            </Button>
          </div>
        </header>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            <Tabs defaultValue="character-sheet">
              <TabsList className="mb-6">
                <TabsTrigger value="character-sheet">Character Sheet</TabsTrigger>
                <TabsTrigger value="inventory">Inventory</TabsTrigger>
              </TabsList>
              
              <TabsContent value="character-sheet">
                <CharacterSheet character={character} />
              </TabsContent>
              
              <TabsContent value="inventory">
                <Inventory character={character} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
