
import { Character } from "@/lib/stores/useCharacter";
import { Campaign } from "@/lib/stores/useCampaign";
import { processCharacterNarrative } from "@/lib/sw5e/characterLanguageProcessor";

/**
 * Integrates character narrative elements into campaign generation
 * by processing natural language from character fields
 */
export function generateCampaignContextFromCharacter(character: Character): any {
  // Process all narrative fields in the character sheet
  const narrativeAnalysis = processCharacterNarrative(character);

  // Extract entities for campaign integration
  const entities = narrativeAnalysis.entities;

  // Build campaign context based on character narrative
  return {
    protagonistInfo: {
      name: character.name,
      class: character.class,
      species: character.species,
      level: character.level,
      background: character.background,
    },
    narrativeThemes: narrativeAnalysis.mainThemes,
    characterMood: narrativeAnalysis.sentimentScore > 0.3 ? "positive" : 
                   narrativeAnalysis.sentimentScore < -0.3 ? "negative" : "neutral",
    primaryMotivation: narrativeAnalysis.motivations[0] || "adventure",
    knownEntities: {
      people: entities.people,
      organizations: entities.organizations,
      locations: entities.locations
    },
    personalityProfile: {
      dominantTraits: narrativeAnalysis.personality.traits.slice(0, 3),
      coreValues: narrativeAnalysis.personality.values.slice(0, 3),
      primaryFears: narrativeAnalysis.personality.fears.slice(0, 2)
    },
    relationships: {
      potentialAllies: narrativeAnalysis.relationshipHints.allies,
      potentialEnemies: narrativeAnalysis.relationshipHints.enemies,
      mentors: narrativeAnalysis.relationshipHints.mentors
    },
    suggestedPlotPoints: narrativeAnalysis.plotHooks
  };
}

/**
 * Enhances an existing campaign with narrative elements from the character
 */
export function enhanceCampaignWithNarrative(campaign: Campaign, character: Character): Campaign {
  // Process character narrative
  const narrativeAnalysis = processCharacterNarrative(character);

  // Create a deep copy of the campaign
  const enhancedCampaign = JSON.parse(JSON.stringify(campaign));

  // Integrate character narrative elements into NPCs
  if (enhancedCampaign.npcs && enhancedCampaign.npcs.length > 0) {
    // Add potential allies from narrative
    narrativeAnalysis.relationshipHints.allies.forEach(allyName => {
      // Check if this ally already exists as an NPC
      const allyExists = enhancedCampaign.npcs.some(npc => 
        npc.name.toLowerCase() === allyName.toLowerCase()
      );

      // If not, add them
      if (!allyExists && allyName) {
        enhancedCampaign.npcs.push({
          id: `npc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: allyName,
          species: "Unknown", // This would be more sophisticated in a real system
          role: "Ally",
          description: `A potential ally mentioned in ${character.name}'s background.`,
          stats: null
        });
      }
    });
  }

  // Integrate character narrative elements into locations
  if (enhancedCampaign.locations && enhancedCampaign.locations.length > 0) {
    // Add important locations from narrative
    narrativeAnalysis.entities.locations.forEach(locationName => {
      // Check if this location already exists
      const locationExists = enhancedCampaign.locations.some(loc => 
        loc.name.toLowerCase() === locationName.toLowerCase()
      );

      // If not, add it
      if (!locationExists && locationName) {
        enhancedCampaign.locations.push({
          id: `loc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: locationName,
          type: "Point of Interest",
          description: `A location mentioned in ${character.name}'s background.`,
          coordinates: null,
          mapData: null
        });
      }
    });
  }

  // Integrate character narrative elements into quests
  if (enhancedCampaign.quests && enhancedCampaign.quests.length > 0) {
    // Add a personal quest based on character motivation
    if (narrativeAnalysis.motivations.length > 0) {
      const primaryMotivation = narrativeAnalysis.motivations[0];

      // Only add if there isn't already a quest with this theme
      const motivationQuestExists = enhancedCampaign.quests.some(quest => 
        quest.title.toLowerCase().includes(primaryMotivation.toLowerCase())
      );

      if (!motivationQuestExists) {
        enhancedCampaign.quests.push({
          id: `quest-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          title: `The Path of ${primaryMotivation.charAt(0).toUpperCase() + primaryMotivation.slice(1)}`,
          description: `A personal quest related to ${character.name}'s motivation for ${primaryMotivation}.`,
          status: "inactive",
          objectives: [
            {
              description: `Discover more about ${character.name}'s connection to ${primaryMotivation}`,
              completed: false
            },
            {
              description: "Confront a challenge related to this motivation",
              completed: false
            }
          ],
          reward: {
            credits: 500,
            items: ["Personal keepsake"],
            experience: 200
          }
        });
      }
    }
  }

  return enhancedCampaign;
}

/**
 * Creates descriptive prompts for campaign elements based on character narrative
 */
export function generateDescriptivePrompts(character: Character): Record<string, string> {
  const narrativeAnalysis = processCharacterNarrative(character);

  return {
    campaignSetting: `Create a Star Wars campaign setting that emphasizes the themes of ${narrativeAnalysis.mainThemes.join(', ')} 
    with opportunities for a ${character.class} to pursue ${narrativeAnalysis.motivations.join(' and ')}.`,

    characterArc: `Design a character arc for ${character.name}, a ${character.species} ${character.class}, 
    who values ${narrativeAnalysis.personality.values.join(' and ')} but fears ${narrativeAnalysis.personality.fears.join(' and ')}.`,

    mainVillain: `Create a compelling antagonist who would challenge ${character.name}'s core values of 
    ${narrativeAnalysis.personality.values.join(' and ')} and exploit their fears of ${narrativeAnalysis.personality.fears.join(' and ')}.`,

    questLine: `Design a quest line that explores ${character.name}'s background, 
    incorporating their connections to ${narrativeAnalysis.relationshipHints.allies.length > 0 ? narrativeAnalysis.relationshipHints.allies.join(', ') : 'new allies'} 
    and confrontations with ${narrativeAnalysis.relationshipHints.enemies.length > 0 ? narrativeAnalysis.relationshipHints.enemies.join(', ') : 'new enemies'}.`,

    locationDescription: `Describe a significant location that would resonate with ${character.name}'s background and experiences.`
  };
}
