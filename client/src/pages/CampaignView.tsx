import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, Save } from "lucide-react";
import CampaignManager from "@/components/Campaign/CampaignManager";
import { useCampaign } from "@/lib/stores/useCampaign";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, setCampaign } = useCampaign();

  // Fetch campaign data
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/campaigns/${id}`],
    enabled: !!id,
  });

  // Update campaign mutation
  const updateCampaign = useMutation({
    mutationFn: async (updatedData: any) => {
      return apiRequest("PUT", `/api/campaigns/${id}`, updatedData);
    },
    onSuccess: () => {
      toast.success("Campaign updated successfully");
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${id}`] });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  // Set campaign data when loaded
  useEffect(() => {
    if (data && !isLoading) {
      setCampaign(data);
    }
  }, [data, isLoading, setCampaign]);

  // Save campaign changes
  const handleSaveChanges = () => {
    if (!campaign) return;
    updateCampaign.mutate(campaign);
  };

  // Start the game
  const handleStartGame = () => {
    if (!campaign) return;
    navigate(`/game/${campaign.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-xl mb-4">Failed to load campaign</div>
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
            <h1 className="text-3xl font-bold text-yellow-400">{campaign.name}</h1>
            <p className="text-gray-300">{campaign.description}</p>
          </div>
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="border-yellow-400 text-yellow-400"
              onClick={handleSaveChanges}
              disabled={updateCampaign.isPending}
            >
              {updateCampaign.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
            <Button onClick={handleStartGame}>
              <Play className="h-4 w-4 mr-2" />
              Play Campaign
            </Button>
          </div>
        </header>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            <Tabs defaultValue="overview">
              <TabsList className="mb-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="npcs">NPCs</TabsTrigger>
                <TabsTrigger value="locations">Locations</TabsTrigger>
                <TabsTrigger value="quests">Quests</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview">
                <CampaignManager campaign={campaign} />
              </TabsContent>
              
              <TabsContent value="npcs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaign.npcs?.map((npc, index) => (
                    <Card key={index} className="bg-gray-700">
                      <CardHeader>
                        <CardTitle className="text-lg">{npc.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p><strong>Species:</strong> {npc.species}</p>
                        <p><strong>Role:</strong> {npc.role}</p>
                        <p className="mt-2">{npc.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="locations">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaign.locations?.map((location, index) => (
                    <Card key={index} className="bg-gray-700">
                      <CardHeader>
                        <CardTitle className="text-lg">{location.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p><strong>Type:</strong> {location.type}</p>
                        <p className="mt-2">{location.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="quests">
                <div className="grid grid-cols-1 gap-4">
                  {campaign.quests?.map((quest, index) => (
                    <Card key={index} className="bg-gray-700">
                      <CardHeader>
                        <CardTitle className="text-lg">{quest.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p><strong>Status:</strong> {quest.status}</p>
                        <p className="mt-2">{quest.description}</p>
                        <div className="mt-4">
                          <h4 className="font-semibold mb-2">Objectives:</h4>
                          <ul className="list-disc list-inside">
                            {quest.objectives.map((objective, idx) => (
                              <li key={idx}>{objective.description} ({objective.completed ? 'Completed' : 'Pending'})</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
