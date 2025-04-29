import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useMap } from "@/lib/stores/useMap";
import { useCampaign } from "@/lib/stores/useCampaign";
import { npcs } from "@/lib/sw5e/npcs";
import { starSystems } from "@/lib/sw5e/starSystems";
import { planets } from "@/lib/sw5e/locations";
import { monsters } from "@/lib/sw5e/monsters";
import { items } from "@/lib/sw5e/items";
import { vehicles } from "@/lib/sw5e/vehicles";
import { starships } from "@/lib/sw5e/starships";
import TranslucentPane from "@/components/ui/TranslucentPane";

interface CampaignManagerProps {
  campaign: any;
}

export default function CampaignManager({ campaign }: CampaignManagerProps) {
  const { updateCampaign } = useCampaign();
  const { generateLocationFromDescription } = useMap();
  const [newNpc, setNewNpc] = useState({
    name: "",
    species: "",
    role: "",
    description: ""
  });
  const [newLocation, setNewLocation] = useState({
    name: "",
    type: "",
    description: ""
  });
  const [newQuest, setNewQuest] = useState({
    title: "",
    description: "",
    objectives: [{ description: "", completed: false }]
  });

  // Handle campaign name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCampaign({
      ...campaign,
      name: e.target.value
    });
  };

  // Handle campaign description change
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateCampaign({
      ...campaign,
      description: e.target.value
    });
  };

  // Add new NPC
  const handleAddNpc = () => {
    if (!newNpc.name || !newNpc.species || !newNpc.role) return;
    
    const updatedNpcs = [...(campaign.npcs || []), { ...newNpc }];
    updateCampaign({
      ...campaign,
      npcs: updatedNpcs
    });
    
    // Reset the form
    setNewNpc({
      name: "",
      species: "",
      role: "",
      description: ""
    });
  };

  // Add new location
  const handleAddLocation = async () => {
    if (!newLocation.name || !newLocation.type || !newLocation.description) return;
    
    // Generate 3D map data from the description
    const locationData = await generateLocationFromDescription(newLocation.description);
    
    const updatedLocations = [...(campaign.locations || []), { 
      ...newLocation,
      coordinates: locationData.coordinates,
      mapData: locationData.mapData
    }];
    
    updateCampaign({
      ...campaign,
      locations: updatedLocations
    });
    
    // Reset the form
    setNewLocation({
      name: "",
      type: "",
      description: ""
    });
  };

  // Add new quest
  const handleAddQuest = () => {
    if (!newQuest.title || !newQuest.description || !newQuest.objectives[0].description) return;
    
    const updatedQuests = [...(campaign.quests || []), { 
      ...newQuest,
      status: "inactive" // Start as inactive
    }];
    
    updateCampaign({
      ...campaign,
      quests: updatedQuests
    });
    
    // Reset the form
    setNewQuest({
      title: "",
      description: "",
      objectives: [{ description: "", completed: false }]
    });
  };

  // Add objective to new quest
  const handleAddObjective = () => {
    setNewQuest({
      ...newQuest,
      objectives: [...newQuest.objectives, { description: "", completed: false }]
    });
  };

  // Update objective
  const handleObjectiveChange = (index: number, value: string) => {
    const updatedObjectives = [...newQuest.objectives];
    updatedObjectives[index].description = value;
    
    setNewQuest({
      ...newQuest,
      objectives: updatedObjectives
    });
  };

  // Remove objective
  const handleRemoveObjective = (index: number) => {
    if (newQuest.objectives.length <= 1) return;
    
    const updatedObjectives = newQuest.objectives.filter((_, i) => i !== index);
    setNewQuest({
      ...newQuest,
      objectives: updatedObjectives
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <Label htmlFor="campaignName">Campaign Name</Label>
          <Input 
            id="campaignName" 
            value={campaign.name} 
            onChange={handleNameChange} 
            className="mt-1"
          />
        </div>
        
        <div>
          <Label htmlFor="campaignDescription">Description</Label>
          <Textarea 
            id="campaignDescription" 
            value={campaign.description} 
            onChange={handleDescriptionChange} 
            className="mt-1 h-24"
          />
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">NPCs</h3>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                Add NPC
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New NPC</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="npcName">Name</Label>
                  <Input 
                    id="npcName"
                    value={newNpc.name}
                    onChange={(e) => setNewNpc({ ...newNpc, name: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="npcSpecies">Species</Label>
                  <Input 
                    id="npcSpecies"
                    value={newNpc.species}
                    onChange={(e) => setNewNpc({ ...newNpc, species: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="npcRole">Role</Label>
                  <Input 
                    id="npcRole"
                    value={newNpc.role}
                    onChange={(e) => setNewNpc({ ...newNpc, role: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="npcDescription">Description</Label>
                  <Textarea 
                    id="npcDescription"
                    value={newNpc.description}
                    onChange={(e) => setNewNpc({ ...newNpc, description: e.target.value })}
                    className="h-20"
                  />
                </div>
                
                <Button onClick={handleAddNpc} className="w-full">
                  Add NPC
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaign.npcs?.map((npc: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base">{npc.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p><strong>Species:</strong> {npc.species}</p>
                <p><strong>Role:</strong> {npc.role}</p>
                <p className="mt-2 text-sm text-gray-300">{npc.description}</p>
              </CardContent>
            </Card>
          ))}
          
          {(!campaign.npcs || campaign.npcs.length === 0) && (
            <div className="col-span-2 text-center py-6 text-gray-400">
              No NPCs added yet
            </div>
          )}
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Locations</h3>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="locationName">Name</Label>
                  <Input 
                    id="locationName"
                    value={newLocation.name}
                    onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="locationType">Type</Label>
                  <select
                    id="locationType"
                    value={newLocation.type}
                    onChange={(e) => setNewLocation({ ...newLocation, type: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Type</option>
                    <option value="Planet">Planet</option>
                    <option value="City">City</option>
                    <option value="Spaceport">Spaceport</option>
                    <option value="Space Station">Space Station</option>
                    <option value="Outpost">Outpost</option>
                    <option value="Ruins">Ruins</option>
                    <option value="Wilderness">Wilderness</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="locationDescription">Description</Label>
                  <Textarea 
                    id="locationDescription"
                    value={newLocation.description}
                    onChange={(e) => setNewLocation({ ...newLocation, description: e.target.value })}
                    className="h-20"
                    placeholder="Describe the location in detail. This will be used to generate the 3D map."
                  />
                </div>
                
                <Button onClick={handleAddLocation} className="w-full">
                  Add Location
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaign.locations?.map((location: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base">{location.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p><strong>Type:</strong> {location.type}</p>
                <p className="mt-2 text-sm text-gray-300">{location.description}</p>
              </CardContent>
            </Card>
          ))}
          
          {(!campaign.locations || campaign.locations.length === 0) && (
            <div className="col-span-2 text-center py-6 text-gray-400">
              No locations added yet
            </div>
          )}
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Quests</h3>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                Add Quest
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Quest</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="questTitle">Title</Label>
                  <Input 
                    id="questTitle"
                    value={newQuest.title}
                    onChange={(e) => setNewQuest({ ...newQuest, title: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="questDescription">Description</Label>
                  <Textarea 
                    id="questDescription"
                    value={newQuest.description}
                    onChange={(e) => setNewQuest({ ...newQuest, description: e.target.value })}
                    className="h-20"
                  />
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Objectives</Label>
                    <Button size="sm" variant="outline" onClick={handleAddObjective}>
                      Add Objective
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {newQuest.objectives.map((objective, index) => (
                      <div key={index} className="flex gap-2">
                        <Input 
                          value={objective.description}
                          onChange={(e) => handleObjectiveChange(index, e.target.value)}
                          placeholder="Objective description"
                        />
                        <Button 
                          size="icon" 
                          variant="destructive"
                          onClick={() => handleRemoveObjective(index)}
                          disabled={newQuest.objectives.length <= 1}
                        >
                          &times;
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                
                <Button onClick={handleAddQuest} className="w-full">
                  Add Quest
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="space-y-4">
          {campaign.quests?.map((quest: any, index: number) => (
            <Card key={index} className="bg-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex justify-between">
                  <span>{quest.title}</span>
                  <span className="text-sm font-normal text-gray-400">
                    {quest.status === "active" ? "Active" : 
                     quest.status === "completed" ? "Completed" : "Inactive"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-sm text-gray-300 mb-3">{quest.description}</p>
                
                <div>
                  <h4 className="font-semibold text-sm mb-1">Objectives:</h4>
                  <ul className="list-disc list-inside text-sm">
                    {quest.objectives.map((objective: any, idx: number) => (
                      <li key={idx} className={objective.completed ? "text-gray-500 line-through" : ""}>
                        {objective.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!campaign.quests || campaign.quests.length === 0) && (
            <div className="text-center py-6 text-gray-400">
              No quests added yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
