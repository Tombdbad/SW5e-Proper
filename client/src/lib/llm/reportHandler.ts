        import { useCharacter } from '@/lib/stores/useCharacter';
        import { useCampaign } from '@/lib/stores/useCampaign';
        import { useMap } from '@/lib/stores/useMap';
        import { processMapDataFromLLM } from '@/lib/map/mapUpdateHandler';
        import { createDebrief, processLLMResponse } from '@/lib/llm/debriefCompiler';
        import { rules } from '@/lib/sw5e/rules';
        import { Character } from "../stores/useCharacter";
        import { Campaign } from "../stores/useCampaign";

        // NPC classification types 
        const NPC_CLASSIFICATIONS = {
          MINOR: "minor",
          KEY_MINOR: "keyMinor",
          KEY: "key",
          COMPANION: "companion"
        };

        /**
         * Generates a report for the Game Master (human or LLM) based on current game state
         */
        export async function generateGameMasterReport(options = {}): Promise<string> {
          const { character } = useCharacter.getState();
          const { campaign } = useCampaign.getState();
          const { currentLocation } = useMap.getState();

          if (!character) {
            throw new Error("No active character found");
          }

          if (!campaign) {
            throw new Error("No active campaign found");
          }

          // Compile character information
          const characterInfo = {
            name: character.name,
            species: character.species?.name || "Unknown",
            class: character.class?.name || "Unknown",
            level: character.level || 1,
            currentHp: character.currentHp || character.maxHp || 0,
            maxHp: character.maxHp || 0,
            currentForcePoints: character.currentForcePoints || 0,
            maxForcePoints: character.maxForcePoints || 0,
            abilities: {
              strength: character.abilities?.strength || 10,
              dexterity: character.abilities?.dexterity || 10,
              constitution: character.abilities?.constitution || 10,
              intelligence: character.abilities?.intelligence || 10,
              wisdom: character.abilities?.wisdom || 10,
              charisma: character.abilities?.charisma || 10
            },
            skills: character.skills || {},
            equipment: character.equipment || [],
            credits: character.credits || 0
          };

          // Compile campaign information
          const campaignInfo = {
            name: campaign.name,
            currentQuest: campaign.currentQuest || "No active quest",
            objectives: campaign.objectives || [],
            npcs: campaign.npcs || [],
            locations: campaign.locations || []
          };

          // Compile location information if available
          const locationInfo = currentLocation ? {
            name: currentLocation.name,
            description: currentLocation.description,
            terrain: currentLocation.mapData?.terrain || "Unknown",
            features: currentLocation.mapData?.features || [],
            entities: currentLocation.mapData?.entities || []
          } : null;

          // Generate the report in a format optimized for the LLM
          const report = `
        # STAR WARS 5E GAME MASTER REPORT

        ## CAMPAIGN: ${campaignInfo.name}
        Current Quest: ${campaignInfo.currentQuest}

        ## CHARACTER: ${characterInfo.name}
        Species: ${characterInfo.species}
        Class: ${characterInfo.class}
        Level: ${characterInfo.level}
        HP: ${characterInfo.currentHp}/${characterInfo.maxHp}
        Force Points: ${characterInfo.currentForcePoints}/${characterInfo.maxForcePoints}

        ### Abilities
        STR: ${characterInfo.abilities.strength} | DEX: ${characterInfo.abilities.dexterity} | CON: ${characterInfo.abilities.constitution}
        INT: ${characterInfo.abilities.intelligence} | WIS: ${characterInfo.abilities.wisdom} | CHA: ${characterInfo.abilities.charisma}

        ### Equipment
        ${characterInfo.equipment.map(item => `- ${item.name}`).join('\n')}
        Credits: ${characterInfo.credits}

        ${locationInfo ? `
        ## CURRENT LOCATION: ${locationInfo.name}
        ${locationInfo.description}
        Terrain: ${locationInfo.terrain}

        ### Features
        ${locationInfo.features.map(feature => `- ${feature.type} at (${feature.position.x}, ${feature.position.y}, ${feature.position.z})`).join('\n')}

        ### Entities
        ${locationInfo.entities.map(entity => `- ${entity.type}${entity.name ? ': ' + entity.name : ''} at (${entity.position.x}, ${entity.position.y}, ${entity.position.z})`).join('\n')}
        ` : ''}

        ## OBJECTIVES
        ${campaignInfo.objectives.map(objective => `- ${objective.completed ? '[COMPLETED]' : '[ACTIVE]'} ${objective.description}`).join('\n')}

        ## NPCS
        ${campaignInfo.npcs.map(npc => `- ${npc.name}: ${npc.description}`).join('\n')}

        ## GAME MASTER INSTRUCTIONS

        Please respond with:
        1. A narrative update describing what happens next in the adventure
        2. Any combat encounters, puzzles, or social interactions
        3. Map or location updates if the player moves to a new area

        After your narrative, include structured data for the system using this marker:
        ---SYSTEM_DATA_FOLLOWS---

        Follow with a valid JSON object containing any of the following sections:
        - "character": Character state updates (HP, XP, Force Points, etc.)
        - "locations": Map data and features
        - "objectives": New or updated quest objectives
        - "npcs": New or updated NPCs
        - "combatState": Combat state updates if in combat

        SYSTEM REFERENCE DATA:
        ${JSON.stringify({
          version: "1.0",
          system: "Star Wars 5e",
          availableData: {
            character: characterInfo,
            campaign: campaignInfo,
            location: locationInfo
          },
          dataRequest: {
            description: "You can request specific SW5e data by including 'SW5E_DATA_REQUEST' in your response with the category",
            availableCategories: [
              "species", "classes", "archetypes", "backgrounds", 
              "forcePowers", "techPowers", "feats", "equipment", 
              "npcs", "monsters", "vehicles", "starships"
            ],
            exampleRequest: "SW5E_DATA_REQUEST: npcs.imperial-inquisitor"
          },
          // Rules reference for LLM to use
          rulesReference: rules,
          instructions: `
          As the Game Master for this Star Wars 5e campaign, you will provide TWO distinct responses:

          1. A NARRATIVE response (creative, engaging Star Wars story)
          2. A SYSTEM DATA response (structured JSON for the game engine)

          Use ASCII maps when helpful using this format:
          [TYPE:Name](x:0,y:0,z:0) to denote entities, e.g. [NPC:Stormtrooper](x:5,y:0,z:0)

          When describing locations, include atmosphere, lighting, and terrain.
          For NPCs, include motivations, appearance, and potential interactions.
          For combat, include tactical descriptions and environmental factors.
          `
        }, null, 2)}
        `;

          return report;
        }

        /**
         * Processes a Game Master response from an LLM to update game state
         */
        export async function processGameMasterResponse(response: string): Promise<void> {
          try {
            // Split the response into narrative and system data parts
            const parts = response.split('---SYSTEM_DATA_FOLLOWS---');

            if (parts.length > 1) {
              const narrative = parts[0].trim();
              const systemDataRaw = parts[1].trim();

              // Extract JSON from the system data part
              const systemData = extractJSONFromText(systemDataRaw);

              if (!systemData) {
                throw new Error("No valid system data found in GM response");
              }

              console.log("Extracted system data:", systemData);

              // Process map data if present
              if (systemData.locations) {
                processMapDataFromLLM(systemData);
              }

              // Create a debrief record and process the response
              const debrief = await createDebrief(
        useCharacter.getState().character!,
        useCampaign.getState().campaign!,
        { includeGameState: true },
      );

      // Process the system data portion
      await processLLMResponse(debrief.id, systemData);
    }
  } catch (error) {
    console.error("Error processing GM response:", error);
    throw new Error("Failed to process Game Master response");
  }
}

/**
 * Extract JSON from text that might contain non-JSON content
 * Uses a more robust approach to find the most complete JSON object
 */
function extractJSONFromText(text: string): any {
  try {
    // First try direct parsing
    return JSON.parse(text);
  } catch (e) {
    // If direct parsing fails, try to extract JSON object
    const jsonRegex = /(\{[\s\S]*\})/; // Match anything between { and }
    const match = text.match(jsonRegex);

    if (match && match[0]) {
      try {
        return JSON.parse(match[0]);
      } catch (err) {
        console.error("Error parsing extracted JSON:", err);
        return null;
      }
    }

    return null;
  }
}

export async function upgradeNpcClassification(
  npcId: string, 
  newClassification: string,
  additionalData: any = {}
): Promise<void> {
  try {
    const { campaign, updateNpc } = useCampaign.getState();

    if (!campaign) return;

    const npc = campaign.npcs.find(n => n.id === npcId);
    if (!npc) return;

    // Update the NPC classification and add additional data
    await updateNpc(npcId, {
      ...npc,
      classification: newClassification,
      ...additionalData
    });

  } catch (error) {
    console.error("Error upgrading NPC classification:", error);
  }
}

/**
 * Handle requests for SW5e data
 */
async function handleSW5eDataRequest(requestPath: string): Promise<any> {
  try {
    const [category, id] = requestPath.split('.');

    // Import the appropriate module based on category
    const module = await import(/* @vite-ignore */ `@/lib/sw5e/${category}`);

    if (id) {
      // Return specific item
      return module[category].find((item: any) => item.id === id);
    } else {
      // Return the whole category
      return module[category];
    }
  } catch (error) {
    console.error("Error handling SW5e data request:", error);
    return null;
  }
}

export default {
  generateGameMasterReport,
  processGameMasterResponse,
  upgradeNpcClassification,
  handleSW5eDataRequest
};