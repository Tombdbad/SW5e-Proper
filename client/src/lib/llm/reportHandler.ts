
  import { Character } from "../stores/useCharacter";
  import { Campaign } from "../stores/useCampaign";
  import { createDebrief, processLLMResponse } from "./debriefCompiler";
  import { npcs } from "../sw5e/npcs";

  // NPC classification types 
  const NPC_CLASSIFICATIONS = {
    MINOR: "minor",
    KEY_MINOR: "keyMinor",
    KEY: "key",
    COMPANION: "companion"
  };

  export async function generateGameReport(
    character: Character,
    campaign: Campaign,
  ): Promise<string> {
      // Process character narrative to extract themes, motivations, etc.
      const { processCharacterNarrative } = require("@/lib/sw5e/characterLanguageProcessor");
      const narrativeAnalysis = processCharacterNarrative(character);

      // Get rules data that LLM might need
      const rules = {
        abilityScores: {
          description: "Ability scores range from 3-20 for most characters. Modifiers are (score-10)/2 rounded down.",
          modifiers: "STR affects melee attacks, athletics. DEX affects ranged attacks, AC, initiative. CON affects HP. etc."
        },
        combatRules: {
          attackRolls: "d20 + ability modifier + proficiency (if proficient)",
          damage: "Weapon damage + ability modifier",
          actionEconomy: "Characters get 1 action, 1 bonus action, 1 reaction, and movement per turn"
        },
        skillChecks: {
          description: "d20 + ability modifier + proficiency (if proficient)",
          difficultyClasses: {
            veryEasy: 5,
            easy: 10,
            medium: 15,
            hard: 20,
            veryHard: 25,
            nearlyImpossible: 30
          }
        },
        npcManagement: {
          classifications: {
            minor: "Background NPCs with minimal details - names, basic description",
            keyMinor: "NPCs who become relevant to the story but aren't central - add personality, goals",
            key: "Important NPCs central to plots - full details including abilities and motivations",
            companion: "NPCs who join the party - full character sheet including combat abilities"
          },
          progression: "NPCs can progress through classifications as player interactions increase",
          dataRequirements: {
            minor: ["name", "description", "location"],
            keyMinor: ["name", "description", "location", "personality", "goals"],
            key: ["name", "description", "location", "personality", "goals", "abilities", "motivations", "backstory"],
            companion: ["Complete character data including combat stats"]
          }
        }
      };
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
      // Add available SW5e data reference
      sw5eReference: {
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

      1. NARRATIVE RESPONSE: A descriptive, immersive scene that engages the player
         - Describe the current location vividly
         - Portray NPCs with personality that resonates with ${character.name}'s themes (${narrativeAnalysis.mainThemes.join(', ')})
         - Present interactive opportunities aligned with their motivations (${narrativeAnalysis.motivations.join(', ')})
         - Frame objectives to engage the character's values
         - Use Star Wars appropriate tone and terminology

      2. SYSTEM_DATA: A structured JSON report for the application to process:
         {
           "locations": [
             {
               "id": "location-id", // Use existing ID if updating, omit for new
               "name": "Location Name",
               "description": "Description",
               "coordinates": {"x": 0, "y": 0, "z": 0},
               "features": [{"type": "feature-type", "position": {"x": 0, "y": 0, "z": 0}}]
             }
           ],
           "npcs": [
             {
               "id": "npc-id", // Use existing ID if updating, omit for new
               "name": "NPC Name",
               "description": "Description",
               "locationId": "location-id",
               "classification": "${NPC_CLASSIFICATIONS.MINOR}", // minor, keyMinor, key, companion
               "personality": {}, // Add when promoted to keyMinor or higher
               "abilities": {}, // Add when promoted to key or higher
               "stats": {} // Full stats when promoted to companion
             }
           ],
           "objectives": [
             {
               "id": "objective-id", // Use existing ID if updating, omit for new
               "title": "Objective Title",
               "description": "Description",
               "status": "active",
               "rewards": []
             }
           ],
           "character": {
             // Only include character state that changes
             "currentHp": 50,
             "currentForcePoints": 5
           }
         }

      FOR NPC PROGRESSION:
      - Track player interactions with NPCs
      - When a player interacts meaningfully with a minor NPC, promote to keyMinor and add personality
      - When a keyMinor NPC becomes integral to the story, promote to key and add abilities
      - When a key NPC joins the party, promote to companion and add full stats

      You can request SW5e reference data by including 'SW5E_DATA_REQUEST: category.name' in your response.
      Always separate your responses with the marker: "---SYSTEM_DATA_FOLLOWS---"
      `,
    };

  return JSON.stringify(report, null, 2);
}

export async function processGameMasterResponse(
  response: string,
): Promise<void> {
  try {
    // Split the response into narrative and system data parts
    const [narrativeResponse, systemDataText] = response.split("---SYSTEM_DATA_FOLLOWS---");

    // Handle any SW5e data requests
    const dataRequestMatch = narrativeResponse.match(/SW5E_DATA_REQUEST:\s*([a-zA-Z0-9.-]+)/);
    if (dataRequestMatch && dataRequestMatch[1]) {
      await handleSW5eDataRequest(dataRequestMatch[1]);
    }


      locations: {
        description: "When describing a location, include these fields for map rendering:",
        fields: {
          id: "Unique ID for the location - use existing ID when updating",
          name: "Location name",
          description: "Full description",
          coordinates: "3D space coordinates as {x,y,z}",
          terrain: "Main terrain type (urban, forest, desert, etc.)",
          features: [
            {
              type: "Feature type (building, rock, water, vegetation, etc.)",
              position: "Position as {x,y,z}",
              scale: "Size scalar (default 1.0)",
              properties: "Any additional properties"
            }
          ],
          atmosphere: "Atmospheric conditions",
          weather: "Current weather",
          lighting: "Current lighting conditions"
        },
        example: {
          id: "location-123",
          name: "Abandoned Imperial Outpost",
          terrain: "desert",
          features: [
            { type: "building", position: {x: 0, y: 0, z: 0}, scale: 1.5 },
            { type: "debris", position: {x: 10, y: 0, z: 5} }
          ]
        }
      },

    // Process system data if present
    if (systemDataText && systemDataText.trim()) {
      // Extract JSON content from the response
      const systemData = extractJsonFromText(systemDataText);

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
function extractJsonFromText(text: string): string {
  try {
    // First attempt: Find text between system data marker and end of text
    const markerSplit = text.split("---SYSTEM_DATA_FOLLOWS---");
    if (markerSplit.length > 1) {
      const potentialJson = markerSplit[1].trim();
      
      // Try to find a complete JSON object
      const bracketRegex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}))*\})/g;
      const matches = [...potentialJson.matchAll(bracketRegex)];
      
      // Get the longest match (most likely the complete object)
      if (matches.length > 0) {
        const longestMatch = matches.reduce((longest, match) => 
          match[0].length > longest[0].length ? match : longest
        );
        
        // Verify it's valid JSON
        const jsonCandidate = longestMatch[0];
        JSON.parse(jsonCandidate); // This will throw if invalid
        return jsonCandidate;
      }
    }
    
    // Fallback: Look for JSON object pattern in the entire text
    const bracketRegex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}))*\})/g;
    const matches = [...text.matchAll(bracketRegex)];
    
    if (matches.length > 0) {
      // Get the longest match (most likely the complete object)
      const longestMatch = matches.reduce((longest, match) => 
        match[0].length > longest[0].length ? match : longest
      );
      
      // Verify it's valid JSON
      const jsonCandidate = longestMatch[0];
      JSON.parse(jsonCandidate); // This will throw if invalid
      return jsonCandidate;
    }

    // If no valid JSON found, return empty object
    return "{}";
  } catch (error) {
    console.error("Error extracting JSON from text:", error);
    return "{}";
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
