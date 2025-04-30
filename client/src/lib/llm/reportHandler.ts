import { Character } from "../stores/useCharacter";
import { Campaign } from "../stores/useCampaign";
import { createDebrief, processLLMResponse } from "./debriefCompiler";

export async function generateGameReport(
  character: Character,
  campaign: Campaign,
): Promise<string> {
    // Process character narrative to extract themes, motivations, etc.
    const { processCharacterNarrative } = require("@/lib/sw5e/characterLanguageProcessor");
    const narrativeAnalysis = processCharacterNarrative(character);

    const report = {
    character: {
      name: character.name,
      class: character.class,
      level: character.level,
      abilities: character.abilityScores,
      equipment: character.equipment,
      status: {
        hp: character.currentHp,
        forcePoints: character.currentForcePoints,
      },
      // Include narrative elements for more personalized responses
      narrativeElements: {
        themes: narrativeAnalysis.mainThemes,
        motivations: narrativeAnalysis.motivations,
        personality: {
          dominantTraits: narrativeAnalysis.personality.traits.slice(0, 3),
          coreValues: narrativeAnalysis.personality.values.slice(0, 3),
          fears: narrativeAnalysis.personality.fears.slice(0, 2)
        },
        plotHooks: narrativeAnalysis.plotHooks
      }
    },
    campaign: {
      currentLocation: campaign.currentLocation,
      activeQuests: campaign.quests.filter((q) => q.status === "active"),
      nearbyNPCs: campaign.npcs.filter(
        (npc) => npc.locationId === campaign.currentLocation,
      ),
    },
    instructions: `
    As the Game Master, describe the scene based on this data.
    Your response should be tailored to ${character.name}'s character using their narrative elements:
    - Primary themes: ${narrativeAnalysis.mainThemes.join(', ')}
    - Core motivations: ${narrativeAnalysis.motivations.join(', ')}
    - Personality traits: ${narrativeAnalysis.personality.traits.join(', ')}
    
    Include:
    - Location description that resonates with the character's themes
    - Present NPCs with reactions appropriate to the character
    - Available interactions that appeal to the character's motivations
    - Current objectives framed to engage the character's values

    Respond in JSON format with:
    {
      "narrative": "scene description tailored to character",
      "locations": [updated location data],
      "npcs": [updated NPC data],
      "character": {updated character data},
      "objectives": [updated objectives]
    }
    `,
  };

  return JSON.stringify(report, null, 2);
}

export async function processGameMasterResponse(
  response: string,
): Promise<void> {
  try {
    const debrief = await createDebrief(
      useCharacter.getState().character!,
      useCampaign.getState().campaign!,
      { includeGameState: true },
    );

    await processLLMResponse(debrief.id, response);
  } catch (error) {
    console.error("Error processing GM response:", error);
    throw new Error("Failed to process Game Master response");
  }
}
