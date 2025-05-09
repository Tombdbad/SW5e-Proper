
import { Character } from "@/lib/stores/useCharacter";
import { Campaign } from "@/lib/stores/useCampaign";
import { apiRequest } from "@/lib/queryClient";
import { starSystems } from "@/lib/sw5e/starSystems";

/**
 * Generates a new campaign based on the player's character information.
 * Uses a structured approach to create NPCs, locations, and quests.
 * 
 * @param character The player character
 * @returns A complete campaign structure
 */
export async function generateCampaignFromCharacter(character: Character): Promise<Campaign> {
  try {
    // In a real application, this would call an external LLM API
    // For now, we'll generate a basic campaign structure based on character info
    
    // Get appropriate system based on character's starting location
    const startingSystemId = character.startingLocation;
    const startingSystem = starSystems.find(s => s.id === startingSystemId) || starSystems[0];
    
    // Generate NPCs based on character background and class
    const npcs = await generateNpcs(character);
    
    // Generate locations based on starting system
    const locations = generateLocations(startingSystem);
    
    // Generate quests based on character, npcs, and locations
    const quests = generateQuests(character, npcs, locations);
    
    // Create campaign object
    const campaign: Campaign = {
      id: `campaign-${Date.now()}`,
      name: `${character.name}'s Adventure`,
      description: generateCampaignDescription(character, startingSystem),
      characterId: character.id,
      npcs,
      locations,
      quests,
      startingLocation: startingSystemId
    };
    
    return campaign;
  } catch (error) {
    console.error("Error generating campaign:", error);
    throw new Error("Failed to generate campaign. Please try again.");
  }
}

/**
 * Generates a campaign description based on character and system.
 */
function generateCampaignDescription(character: Character, system: any): string {
  const era = ["Age of Republic", "Age of Rebellion", "New Republic Era"]

    // Process character narrative using our NLP system
    const { processCharacterNarrative } = require("@/lib/sw5e/characterLanguageProcessor");
    const narrativeAnalysis = processCharacterNarrative(character);

    // Extract themes and motivations from the character's narrative
    const narrativeThemes = narrativeAnalysis.mainThemes;
    const motivations = narrativeAnalysis.motivations;

    // Use narrative themes if available, otherwise fall back to class-based themes
  const themes = {
    berserker: ["survival", "revenge", "tribal conflict"],
    consular: ["diplomacy", "force mysteries", "ancient knowledge"],
    engineer: ["technology", "innovation", "corporate espionage"],
    fighter: ["military operations", "mercenary work", "combat tournaments"],
    guardian: ["protection", "justice", "force conflict"],
    monk: ["spiritual journey", "self-discovery", "harmony"],
    operative: ["espionage", "heists", "undercover missions"],
    scholar: ["discovery", "research", "artifact recovery"],
    sentinel: ["investigation", "balance", "force corruption"]
  };
  
  const characterThemes = narrativeThemes.length > 0 ? narrativeThemes : (themes[character.class] || ["adventure", "discovery", "conflict"]);
  const mainTheme = characterThemes[Math.floor(Math.random() * characterThemes.length)];
  
  // Extract any locations mentioned in the character's narrative
  const importantLocations = narrativeAnalysis.entities.locations;
  const locationTie = importantLocations.length > 0 ? 
    `with connections to ${importantLocations[0]}` : 
    `in the ${system.region}`;
  
  // Extract character personality for more personalized description
  const personalityTraits = narrativeAnalysis.personality.traits;
  const personalityDescription = personalityTraits.length > 0 ? 
    `Known for being ${personalityTraits.slice(0, 2).join(' and ')}, ` : 
    '';
  
  // Include plot hook if available
  const plotHook = narrativeAnalysis.plotHooks.length > 0 ? 
    `\n${narrativeAnalysis.plotHooks[0]}` : 
    '';
  
  // Generate the description using narrative elements
  return `In the ${era}, a tale of ${mainTheme} unfolds ${locationTie}. 
  ${character.name}, a ${character.species} ${character.class}, ${personalityDescription}begins their journey in the ${system.name} 
  where galactic events will soon test their resolve and skills. 
  ${character.backstory ? `Drawing on their past as ${character.backstory.substring(0, 50)}...` : ""}
  ${motivations.length > 0 ? `Driven by ${motivations[0]}, ` : ""}the future of this corner of the galaxy may well depend on their actions.
  ${plotHook}`;
}

/**
 * Generates NPCs based on character information.
 */
async function generateNpcs(character: Character) {
  try {
    // Simplified version without external API calls
    // Generate mentor based on character class
    const mentor = {
      id: `npc-${Date.now()}-1`,
      name: generateName(),
      species: "Human",
      role: "Mentor",
      description: `A wise and experienced ${character.class} who sees potential in ${character.name}.`
    };
    
    // Generate ally
    const allySpecies = ["Human", "Wookiee", "Twilek", "Bothan"][Math.floor(Math.random() * 4)];
    const ally = {
      id: `npc-${Date.now()}-2`,
      name: generateName(),
      species: allySpecies,
      role: "Ally",
      description: `A loyal friend with complementary skills who joins ${character.name} on their journey.`
    };
    
    // Generate rival
    const rivalSpecies = ["Human", "Trandoshan", "Zabrak", "Twilek"][Math.floor(Math.random() * 4)];
    const rival = {
      id: `npc-${Date.now()}-3`,
      name: generateName(),
      species: rivalSpecies,
      role: "Rival",
      description: `A competent ${character.class} who sees ${character.name} as competition.`
    };
    
    // Generate villain
    const villainSpecies = ["Human", "Zabrak", "Chiss", "Trandoshan"][Math.floor(Math.random() * 4)];
    const villain = {
      id: `npc-${Date.now()}-4`,
      name: generateName(),
      species: villainSpecies,
      role: "Villain",
      description: "A formidable adversary with dangerous plans that threaten the region."
    };
    
    // Generate contact
    const contactSpecies = ["Human", "Rodian", "Twilek", "Bothan"][Math.floor(Math.random() * 4)];
    const contact = {
      id: `npc-${Date.now()}-5`,
      name: generateName(),
      species: contactSpecies,
      role: "Contact",
      description: "An information broker with connections throughout the sector."
    };
    
    return [mentor, ally, rival, villain, contact];
  } catch (error) {
    console.error("Error generating NPCs:", error);
    return [];
  }
}

/**
 * Generates locations based on the starting system.
 */
function generateLocations(system: any) {
  // Main planet in the system
  const mainPlanet = {
    id: `location-${Date.now()}-1`,
    name: system.planets ? system.planets[0] : `${system.name} Prime`,
    type: "Planet",
    description: `The main inhabited world in the ${system.name}, a bustling hub of activity.`,
    coordinates: {
      x: system.x + (Math.random() * 5 - 2.5),
      y: system.y + (Math.random() * 2 - 1),
      z: system.z + (Math.random() * 5 - 2.5)
    }
  };
  
  // Spaceport
  const spaceport = {
    id: `location-${Date.now()}-2`,
    name: `${mainPlanet.name} Spaceport`,
    type: "Spaceport",
    description: `The main transportation hub for ${mainPlanet.name}, filled with travelers from across the galaxy.`,
    coordinates: {
      x: mainPlanet.coordinates.x + 0.1,
      y: mainPlanet.coordinates.y,
      z: mainPlanet.coordinates.z + 0.1
    }
  };
  
  // Cantina
  const cantina = {
    id: `location-${Date.now()}-3`,
    name: "The Stellar Drift",
    type: "Cantina",
    description: "A popular gathering spot for locals and travelers alike, and a good place to find information or work.",
    coordinates: {
      x: spaceport.coordinates.x + 0.05,
      y: spaceport.coordinates.y,
      z: spaceport.coordinates.z - 0.05
    }
  };
  
  // Remote location
  const remoteLocation = {
    id: `location-${Date.now()}-4`,
    name: "Ancient Ruins",
    type: "Ruins",
    description: "Mysterious ruins from a long-forgotten civilization, holding secrets and possibly valuable artifacts.",
    coordinates: {
      x: mainPlanet.coordinates.x + (Math.random() * 10 - 5),
      y: mainPlanet.coordinates.y,
      z: mainPlanet.coordinates.z + (Math.random() * 10 - 5)
    }
  };
  
  // Nearby space station or moon
  const spaceStation = {
    id: `location-${Date.now()}-5`,
    name: "Orbital Station Alpha",
    type: "Space Station",
    description: "A large station in orbit around the planet, serving as a trading post and refueling station.",
    coordinates: {
      x: mainPlanet.coordinates.x + 2,
      y: mainPlanet.coordinates.y + 1,
      z: mainPlanet.coordinates.z - 1
    }
  };
  
  return [mainPlanet, spaceport, cantina, remoteLocation, spaceStation];
}

/**
 * Generates quests based on character, NPCs, and locations.
 */
function generateQuests(character: Character, npcs: any[], locations: any[]) {
  // Find NPCs by role
  const mentor = npcs.find(npc => npc.role === "Mentor");
  const ally = npcs.find(npc => npc.role === "Ally");
  const rival = npcs.find(npc => npc.role === "Rival");
  const villain = npcs.find(npc => npc.role === "Villain");
  const contact = npcs.find(npc => npc.role === "Contact");
  
  // Find locations by type
  const mainPlanet = locations.find(loc => loc.type === "Planet");
  const spaceport = locations.find(loc => loc.type === "Spaceport");
  const cantina = locations.find(loc => loc.type === "Cantina");
  const ruins = locations.find(loc => loc.type === "Ruins");
  const station = locations.find(loc => loc.type === "Space Station");
  
  // Introduction quest
  const introQuest = {
    id: `quest-${Date.now()}-1`,
    title: "A New Beginning",
    description: `Meet with ${mentor?.name} at ${cantina?.name} to discuss an important opportunity.`,
    status: "active",
    objectives: [
      { description: `Find ${cantina?.name}`, completed: false },
      { description: `Speak with ${mentor?.name}`, completed: false },
      { description: "Accept or decline the offer", completed: false }
    ],
    reward: {
      credits: 500,
      items: [],
      experience: 100
    }
  };
  
  // Main story quest
  const mainQuest = {
    id: `quest-${Date.now()}-2`,
    title: "Uncovering the Threat",
    description: `Investigate rumors of suspicious activity at ${ruins?.name} that may be connected to ${villain?.name}.`,
    status: "inactive",
    objectives: [
      { description: `Travel to ${ruins?.name}`, completed: false },
      { description: "Search for evidence", completed: false },
      { description: "Defeat any hostiles", completed: false },
      { description: `Report findings to ${mentor?.name}`, completed: false }
    ],
    reward: {
      credits: 1000,
      items: ["datapad"],
      experience: 250
    }
  };
  
  // Side quest
  const sideQuest = {
    id: `quest-${Date.now()}-3`,
    title: "Supply Run",
    description: `${ally?.name} needs help acquiring supplies from ${station?.name}.`,
    status: "inactive",
    objectives: [
      { description: `Meet ${ally?.name} at ${spaceport?.name}`, completed: false },
      { description: `Travel to ${station?.name}`, completed: false },
      { description: "Acquire the supplies", completed: false },
      { description: "Return to the spaceport", completed: false }
    ],
    reward: {
      credits: 750,
      items: ["medpac"],
      experience: 150
    }
  };
  
  // Rival quest
  const rivalQuest = {
    id: `quest-${Date.now()}-4`,
    title: "Competitive Edge",
    description: `${rival?.name} has challenged you to prove your skills in a series of tests.`,
    status: "inactive",
    objectives: [
      { description: "Complete the marksmanship challenge", completed: false },
      { description: "Complete the piloting challenge", completed: false },
      { description: "Complete the combat challenge", completed: false },
      { description: `Earn ${rival?.name}'s respect`, completed: false }
    ],
    reward: {
      credits: 500,
      items: [],
      experience: 200
    }
  };
  
  // Information quest
  const infoQuest = {
    id: `quest-${Date.now()}-5`,
    title: "Underground Intelligence",
    description: `${contact?.name} has information about ${villain?.name}'s plans, but it comes at a price.`,
    status: "inactive",
    objectives: [
      { description: `Find ${contact?.name} in the lower levels of ${spaceport?.name}`, completed: false },
      { description: "Complete a task for them", completed: false },
      { description: "Obtain the information", completed: false },
      { description: `Share the intelligence with ${mentor?.name}`, completed: false }
    ],
    reward: {
      credits: 1200,
      items: ["holoprojector"],
      experience: 300
    }
  };
  
  return [introQuest, mainQuest, sideQuest, rivalQuest, infoQuest];
}

/**
 * Generate a random name for NPCs.
 */
function generateName(): string {
  const firstNames = [
    "Jace", "Kira", "Mara", "Tycho", "Liana", "Dax", "Vex", "Zara", 
    "Bren", "Nyra", "Kaiden", "Senn", "Rook", "Lyn", "Cassian", "Juno"
  ];
  
  const lastNames = [
    "Antilles", "Vos", "Syndulla", "Kryze", "Bane", "Vizla", "Rook", 
    "Fenn", "Cobb", "Valen", "Solus", "Wren", "Onyo", "Kestis", "Qel-Droma"
  ];
  
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${first} ${last}`;
}
