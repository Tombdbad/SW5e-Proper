import { Character } from "../stores/useCharacter";
import { Campaign } from "../stores/useCampaign";
import { createDebrief, processLLMResponse } from "./debriefCompiler";

export async function generateGameReport(
  character: Character,
  campaign: Campaign,
): Promise<string> {
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
    Include:
    - Location description
    - Present NPCs
    - Available interactions
    - Current objectives

    Respond in JSON format with:
    {
      "narrative": "scene description",
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
