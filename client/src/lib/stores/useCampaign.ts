import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import { generateCampaignFromCharacter } from "@/lib/llm/campaignGenerator";
import { Character } from "./useCharacter";

export interface NPC {
  id: string;
  name: string;
  species: string;
  role: string;
  description: string;
  stats?: any;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  coordinates?: {
    x: number;
    y: number;
    z: number;
  };
  mapData?: any;
}

export interface QuestObjective {
  description: string;
  completed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "inactive" | "active" | "completed";
  objectives: QuestObjective[];
  reward?: {
    credits: number;
    items: string[];
    experience: number;
  };
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  characterId: string;
  npcs: NPC[];
  locations: Location[];
  quests: Quest[];
  startingLocation: string;
  currentLocation?: string;
  notes?: string;
}

interface CampaignState {
  campaign: Campaign | null;
  isGenerating: boolean;
  error: string | null;
  
  setCampaign: (campaign: Campaign) => void;
  updateCampaign: (updates: Partial<Campaign>) => void;
  generateCampaign: (character: Character) => Promise<Campaign>;
  loadCampaign: (campaign: Campaign) => void;
  
  // NPC management
  addNpc: (npc: NPC) => void;
  updateNpc: (id: string, updates: Partial<NPC>) => void;
  removeNpc: (id: string) => void;
  
  // Location management
  addLocation: (location: Location) => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  removeLocation: (id: string) => void;
  
  // Quest management
  addQuest: (quest: Quest) => void;
  updateQuest: (id: string, updates: Partial<Quest>) => void;
  removeQuest: (id: string) => void;
  completeQuestObjective: (questId: string, objectiveIndex: number) => void;
  activateQuest: (questId: string) => void;
  completeQuest: (questId: string) => void;
}

export const useCampaign = create<CampaignState>((set, get) => ({
  campaign: null,
  isGenerating: false,
  error: null,
  
  setCampaign: (campaign) => set({ campaign }),
  
  updateCampaign: (updates) => set((state) => ({
    campaign: state.campaign ? { ...state.campaign, ...updates } : null
  })),
  
  generateCampaign: async (character) => {
    set({ isGenerating: true, error: null });
    
    try {
      // Generate campaign using LLM
      const campaignData = await generateCampaignFromCharacter(character);
      
      // Save to the backend
      const response = await apiRequest(
        "POST",
        "/api/campaigns",
        {
          ...campaignData,
          characterId: character.id
        }
      );
      
      const newCampaign = await response.json();
      set({ campaign: newCampaign, isGenerating: false });
      
      return newCampaign;
    } catch (error) {
      set({ 
        isGenerating: false, 
        error: error instanceof Error ? error.message : "Failed to generate campaign" 
      });
      throw error;
    }
  },
  
  loadCampaign: (campaign) => {
    set({ campaign, isGenerating: false, error: null });
  },
  
  // NPC management
  addNpc: (npc) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        npcs: [...state.campaign.npcs, npc]
      }
    };
  }),
  
  updateNpc: (id, updates) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        npcs: state.campaign.npcs.map(npc => 
          npc.id === id ? { ...npc, ...updates } : npc
        )
      }
    };
  }),
  
  removeNpc: (id) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        npcs: state.campaign.npcs.filter(npc => npc.id !== id)
      }
    };
  }),
  
  // Location management
  addLocation: (location) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        locations: [...state.campaign.locations, location]
      }
    };
  }),
  
  updateLocation: (id, updates) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        locations: state.campaign.locations.map(location => 
          location.id === id ? { ...location, ...updates } : location
        )
      }
    };
  }),
  
  removeLocation: (id) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        locations: state.campaign.locations.filter(location => location.id !== id)
      }
    };
  }),
  
  // Quest management
  addQuest: (quest) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: [...state.campaign.quests, quest]
      }
    };
  }),
  
  updateQuest: (id, updates) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: state.campaign.quests.map(quest => 
          quest.id === id ? { ...quest, ...updates } : quest
        )
      }
    };
  }),
  
  removeQuest: (id) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: state.campaign.quests.filter(quest => quest.id !== id)
      }
    };
  }),
  
  completeQuestObjective: (questId, objectiveIndex) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: state.campaign.quests.map(quest => {
          if (quest.id === questId) {
            const updatedObjectives = [...quest.objectives];
            if (updatedObjectives[objectiveIndex]) {
              updatedObjectives[objectiveIndex] = {
                ...updatedObjectives[objectiveIndex],
                completed: true
              };
            }
            
            // Check if all objectives are completed
            const allCompleted = updatedObjectives.every(obj => obj.completed);
            
            return {
              ...quest,
              objectives: updatedObjectives,
              status: allCompleted ? "completed" : quest.status
            };
          }
          return quest;
        })
      }
    };
  }),
  
  activateQuest: (questId) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: state.campaign.quests.map(quest => 
          quest.id === questId ? { ...quest, status: "active" } : quest
        )
      }
    };
  }),
  
  completeQuest: (questId) => set((state) => {
    if (!state.campaign) return { campaign: null };
    
    return {
      campaign: {
        ...state.campaign,
        quests: state.campaign.quests.map(quest => 
          quest.id === questId ? { 
            ...quest, 
            status: "completed",
            objectives: quest.objectives.map(obj => ({ ...obj, completed: true }))
          } : quest
        )
      }
    };
  })
}));
