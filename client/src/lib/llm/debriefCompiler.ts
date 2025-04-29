/**
 * Debrief Compiler
 *
 * This module handles the formatting and compilation of game state data into structured
 * JSON reports (debriefs) that can be sent to external LLMs like Gemini for processing.
 * It also handles parsing responses from the LLM back into a format usable by the application.
 */

import { Character } from "@/lib/stores/useCharacter";
import { Campaign } from "@/lib/stores/useCampaign";
import { apiRequest } from "@/lib/queryClient";

interface DebriefOptions {
  includeCharacterDetails?: boolean;
  includeNpcDetails?: boolean;
  includeLocationDetails?: boolean;
  includeQuestDetails?: boolean;
  includeGameState?: boolean;
  requestType?:
    | "campaignUpdate"
    | "questGeneration"
    | "npcInteraction"
    | "combatResolution"
    | "locationDescription"
    | "sceneDescription"
    | "playerAction"
    | "gmResponse";
  customPrompt?: string;
  playerAction?: string;
}

interface DebriefData {
  sessionId: string;
  character: Partial<Character>;
  campaign: Partial<Campaign>;
  currentLocation?: any;
  gameState?: any;
  requestType: string;
  prompt: string;
}

interface DebriefResponse {
  id: string;
  response: any;
}

const defaultOptions: DebriefOptions = {
  includeCharacterDetails: true,
  includeNpcDetails: true,
  includeLocationDetails: true,
  includeQuestDetails: true,
  includeGameState: false,
  requestType: "campaignUpdate",
};

/**
 * Creates a structured JSON debrief for communication with external LLMs
 */
export async function createDebrief(
  character: Character,
  campaign: Campaign,
  options: DebriefOptions = {},
): Promise<DebriefResponse> {
  // Merge default options with provided options
  const mergedOptions = { ...defaultOptions, ...options };

  // Generate a unique session ID
  const sessionId = `session-${Date.now()}`;

  // Build character data based on options
  const characterData = mergedOptions.includeCharacterDetails
    ? {
        id: character.id,
        name: character.name,
        species: character.species,
        class: character.class,
        level: character.level,
        background: character.background,
        alignment: character.alignment,
        abilityScores: character.abilityScores,
        currentHp: character.currentHp,
        maxHp: character.maxHp,
        currentForcePoints: character.currentForcePoints,
        maxForcePoints: character.maxForcePoints,
        skillProficiencies: character.skillProficiencies,
        backstory: character.backstory,
      }
    : { id: character.id, name: character.name };

  // Build campaign data based on options
  const campaignData: Partial<Campaign> = {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
  };

  // Include NPC details if requested
  if (mergedOptions.includeNpcDetails) {
    campaignData.npcs = campaign.npcs;
  }

  // Include location details if requested
  if (mergedOptions.includeLocationDetails) {
    campaignData.locations = campaign.locations;
    campaignData.currentLocation = campaign.currentLocation;
  }

  // Include quest details if requested
  if (mergedOptions.includeQuestDetails) {
    campaignData.quests = campaign.quests;
  }

  // Generate the appropriate prompt based on request type
  let prompt = mergedOptions.customPrompt || "";

  if (!prompt) {
    switch (mergedOptions.requestType) {
      case "campaignUpdate":
        prompt = `Based on the character and campaign information provided, generate the next story developments, NPC interactions, and potential quest opportunities for ${character.name}'s adventure.`;
        break;
      case "questGeneration":
        prompt = `Based on the character and campaign information provided, generate a new quest appropriate for a level ${character.level} ${character.species} ${character.class}.`;
        break;
      case "npcInteraction":
        prompt = `The player is interacting with NPCs in the campaign. Generate dialogue and interaction options based on the character's background and previous campaign events.`;
        break;
      case "combatResolution":
        prompt = `The player has engaged in combat. Generate a narrative description of the combat outcome based on the character's abilities and the campaign context.`;
        break;
      case "locationDescription":
        prompt = `Generate a detailed description of the current location, including points of interest, inhabitants, and atmosphere.`;
        break;
    }
  }

  // Build the complete debrief data
  const debriefData: DebriefData = {
    sessionId,
    character: characterData,
    campaign: campaignData,
    requestType: mergedOptions.requestType || "campaignUpdate",
    prompt,
  };

  // Include game state if requested
  if (mergedOptions.includeGameState && campaign.currentLocation) {
    const currentLocationData = campaign.locations.find(
      (loc) => loc.id === campaign.currentLocation,
    );
    if (currentLocationData) {
      debriefData.currentLocation = currentLocationData;
    }
  }

  try {
    // Send the debrief to the server
    const response = await apiRequest("POST", "/api/debriefs", {
      campaignId: campaign.id,
      sessionId,
      content: debriefData,
    });

    const result = await response.json();

    return {
      id: result.id,
      response: null, // No response yet, needs to be fetched later
    };
  } catch (error) {
    console.error("Error creating debrief:", error);
    throw new Error("Failed to create debrief for LLM processing");
  }
}

/**
 * Processes a response from an external LLM and formats it for use in the application
 */
export async function processLLMResponse(
  debriefId: string,
  rawResponse: any,
): Promise<any> {
  try {
    // Parse and validate the LLM response
    const processedResponse = parseResponse(rawResponse);

    // Update the debrief with the response
    const response = await apiRequest(
      "PUT",
      `/api/debriefs/${debriefId}/response`,
      { response: processedResponse },
    );

    const result = await response.json();

    return processedResponse;
  } catch (error) {
    console.error("Error processing LLM response:", error);
    throw new Error("Failed to process LLM response");
  }
}

/**
 * Parses and validates an LLM response
 */
function parseResponse(rawResponse: any): any {
  // This would contain logic to validate and transform the LLM response
  // For now, we'll just return the raw response
  return rawResponse;
}

/**
 * Generates a location description from an LLM response
 */
export async function generateLocationFromLLM(
  description: string,
  campaign: Campaign,
): Promise<any> {
  try {
    // Create a debrief with a location description request
    const debrief = await createDebrief(
      { id: "temp", name: "GameMaster" } as Character,
      campaign,
      {
        includeCharacterDetails: false,
        includeLocationDetails: true,
        requestType: "locationDescription",
        customPrompt: `Generate a 3D map representation for the following location: ${description}`,
      },
    );

    // In a real implementation, this would wait for the LLM to process the request
    // For now, we'll generate a simple random map

    // Generate random coordinates
    const coordinates = {
      x: Math.floor(Math.random() * 100) - 50,
      y: Math.floor(Math.random() * 20) - 10,
      z: Math.floor(Math.random() * 100) - 50,
    };

    // Generate map data
    const mapData = {
      terrain: ["plain", "forest", "desert", "urban", "mountain"][
        Math.floor(Math.random() * 5)
      ],
      features: Array(Math.floor(Math.random() * 10) + 5)
        .fill(0)
        .map(() => ({
          type: ["building", "tree", "rock", "water", "crater"][
            Math.floor(Math.random() * 5)
          ],
          position: {
            x: Math.floor(Math.random() * 100) - 50,
            y: 0,
            z: Math.floor(Math.random() * 100) - 50,
          },
          scale: Math.random() * 2 + 0.5,
        })),
    };

    return {
      coordinates,
      mapData,
    };
  } catch (error) {
    console.error("Error generating location from LLM:", error);
    throw new Error("Failed to generate location from description");
  }
}

/**
 * Generates a campaign from character information using an LLM
 */
export async function generateCampaignFromLLM(
  character: Character,
): Promise<Partial<Campaign>> {
  try {
    // This would typically call the LLM API
    // For now, we'll use the local generator

    // Import the local generator as a fallback
    const { generateCampaignFromCharacter } = await import(
      "@/lib/llm/campaignGenerator"
    );

    // Generate the campaign
    return generateCampaignFromCharacter(character);
  } catch (error) {
    console.error("Error generating campaign from LLM:", error);
    throw new Error("Failed to generate campaign from character information");
  }
}

/**
 * Process a GM scene description and extract entity data
 */
export async function processGMScene(
  response: any,
  campaign: Campaign,
): Promise<{ entities: any[]; description: string }> {
  try {
    // Parse the JSON response containing scene data
    const sceneData =
      typeof response === "string" ? JSON.parse(response) : response;

    // Extract coordinates and entity data
    const entities = sceneData.entities || [];
    const description = sceneData.description;

    // Update campaign state with new entities
    for (const entity of entities) {
      if (entity.type === "npc") {
        await campaign.addNpc(entity);
      } else if (entity.type === "location") {
        await campaign.addLocation(entity);
      }
    }

    return {
      entities,
      description,
    };
  } catch (error) {
    console.error("Error processing GM scene:", error);
    throw new Error("Failed to process GM scene data");
  }
}

/**
 * Submit a player action to the GM
 */
export async function submitPlayerAction(
  character: Character,
  campaign: Campaign,
  action: string,
): Promise<DebriefResponse> {
  return createDebrief(character, campaign, {
    requestType: "playerAction",
    includeGameState: true,
    playerAction: action,
    customPrompt: `The player (${character.name}) takes the following action: ${action}. Describe the outcome and any changes to the environment or NPCs.`,
  });
}
