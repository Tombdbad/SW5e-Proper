
import { CharacterProfile, CharacterProfileParser, CharacterThemes } from './characterProfileParser';

export interface CampaignElementTemplates {
  objectiveTemplates: {
    combatStyle: { [key: string]: string[] };
    forceAlignment: { [key: string]: string[] };
  };
  sideQuestTemplates: {
    motivation: { [key: string]: string[] };
  };
  locationTemplates: {
    class: { [key: string]: string[] };
  };
  npcTemplates: {
    forceAlignment: { [key: string]: string[] };
  };
  factions: {
    light: string[];
    dark: string[];
    neutral: string[];
  };
  monsterTemplates: {
    level: { [key: string]: string[] };
  };
  itemTemplates: {
    class: { [key: string]: string[] };
  };
}

export interface ObjectiveData {
  title: string;
  target: string;
  location: string;
  combatStyle: string;
  forceAlignment: string;
}

export interface SideQuestData {
  title: string;
  target: string;
  location: string;
  motivation: string;
}

export interface NPCData {
  type: string;
  faction: string;
  location: string;
}

export interface MonsterData {
  type: string;
  location: string;
  difficulty: string;
}

export interface ItemData {
  name: string;
  rarity: string;
}

export interface LocationData {
  name: string;
  environment: string;
  pointsOfInterest: string[];
  securityLevel: string;
}

export interface CampaignData {
  primaryObjective: ObjectiveData;
  secondaryObjectives: SideQuestData[];
  sideQuests: SideQuestData[];
  location: LocationData;
  npcs: NPCData[];
  monsters: MonsterData[];
  items: ItemData[];
}

export class CampaignElementGenerator {
  private parser: CharacterProfileParser;
  private templates: CampaignElementTemplates;
  
  constructor() {
    this.parser = new CharacterProfileParser();
    
    // Template dictionaries for different campaign elements
    this.templates = {
      objectiveTemplates: {
        combatStyle: {
          aggressive: [
            "Assault on {target} stronghold in {location}",
            "Eliminate {target} commander at {location}",
            "Capture {target} outpost in {location}"
          ],
          defensive: [
            "Protect {target} from incoming attack in {location}",
            "Establish defensive position at {location}",
            "Rescue {target} captured in {location}"
          ],
          stealthy: [
            "Infiltrate {target} base in {location}",
            "Spy on {target} operations in {location}",
            "Sabotage {target} systems in {location}"
          ],
          balanced: [
            "Investigate {target} activity in {location}",
            "Negotiate with {target} representative in {location}",
            "Gather intelligence on {target} in {location}"
          ]
        },
        forceAlignment: {
          light: [
            "Recover ancient Jedi artifact from {location}",
            "Rescue Force-sensitive children from {target}",
            "Defend peaceful settlement from {target} raiders"
          ],
          dark: [
            "Seize powerful dark side relic in {location}",
            "Eliminate rival {target} force user",
            "Subjugate resistant {location} population"
          ],
          neutral: [
            "Retrieve valuable technology from {location}",
            "Establish trade route through {location}",
            "Mediate conflict between factions in {location}"
          ]
        }
      },
      sideQuestTemplates: {
        motivation: {
          revenge: [
            "Track down the {target} responsible for your past trauma",
            "Find evidence against {target} who wronged you",
            "Confront {target} lieutenant in {location}"
          ],
          discovery: [
            "Explore ancient ruins in {location}",
            "Decipher mysterious signal from {location}",
            "Research {target} technology in hidden laboratory"
          ],
          wealth: [
            "Retrieve valuable cargo from crashed ship in {location}",
            "Locate hidden {target} treasure cache",
            "Win high-stakes game of sabacc in {location} cantina"
          ],
          justice: [
            "Free enslaved workers from {target} mining operation",
            "Expose {target} corruption in {location}",
            "Return stolen artifacts to {location} inhabitants"
          ],
          power: [
            "Claim abandoned {target} weapons cache in {location}",
            "Recruit force-sensitive potential ally in {location}",
            "Challenge local warlord for control of {location}"
          ]
        }
      },
      locationTemplates: {
        class: {
          scout: ["Dense jungle", "Uncharted wilderness", "Dangerous frontier"],
          soldier: ["Military compound", "Battlefield", "Training facility"],
          scholar: ["Ancient temple", "Library archives", "Research facility"],
          engineer: ["Shipyard", "Industrial complex", "Droid factory"],
          guardian: ["Sacred site", "Civilian settlement", "Diplomatic compound"],
          sentinel: ["Urban center", "Criminal district", "Underworld den"],
          consular: ["Diplomatic embassy", "Meditation retreat", "Council chambers"]
        }
      },
      npcTemplates: {
        forceAlignment: {
          light: ["Jedi mentor", "Republic officer", "Local resistance leader"],
          dark: ["Sith apprentice", "Imperial agent", "Crime lord"],
          neutral: ["Mercenary captain", "Information broker", "Merchant"]
        }
      },
      factions: {
        light: ["Jedi Order", "Republic", "Rebel Alliance", "Resistance"],
        dark: ["Sith Empire", "First Order", "Trade Federation", "Black Sun"],
        neutral: ["Hutt Cartel", "Bounty Hunter Guild", "Mining Guild", "Banking Clan"]
      },
      monsterTemplates: {
        level: {
          low: ["Pirates", "Wild beasts", "Battle droids"],
          medium: ["Elite guards", "Local predators", "Bounty hunters"],
          high: ["Dark Jedi", "Deadly creatures", "Elite specialists"]
        }
      },
      itemTemplates: {
        class: {
          scout: ["Stealth field generator", "Long-range communicator", "Survival kit"],
          soldier: ["Custom blaster rifle", "Heavy armor", "Combat stimulants"],
          scholar: ["Ancient holocron", "Decryption device", "Force artifact"],
          engineer: ["Droid companion", "Multi-tool", "Shield generator"],
          guardian: ["Defensive shield", "Ceremonial armor", "Medical supplies"],
          sentinel: ["Stealth suit", "Security slicer", "Disguise kit"],
          consular: ["Force focus crystal", "Diplomatic credentials", "Meditation aid"]
        }
      }
    };
  }
  
  private getLevelCategory(level: number): string {
    if (level <= 5) {
      return "low";
    } else if (level <= 10) {
      return "medium";
    } else {
      return "high";
    }
  }
  
  private selectFaction(forceAlignment: string): string {
    const alignmentKey = forceAlignment as keyof typeof this.templates.factions;
    const factions = this.templates.factions[alignmentKey] || this.templates.factions.neutral;
    return this.randomChoice(factions);
  }
  
  private fillTemplate(template: string, substitutions: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(substitutions)) {
      result = result.replace(`{${key}}`, value);
    }
    return result;
  }
  
  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  generatePrimaryObjective(charProfile: CharacterProfile): ObjectiveData {
    const themes = this.parser.analyzeProfile(charProfile);
    
    // Select a template based on combat style
    const combatStyle = themes.combatStyle;
    const combatTemplates = this.templates.objectiveTemplates.combatStyle[combatStyle] || 
                           this.templates.objectiveTemplates.combatStyle.balanced;
    const template = this.randomChoice(combatTemplates);
    
    // Select a target faction opposite to character's alignment
    const targetAlignmentMap = {
      light: "dark", 
      dark: "light", 
      neutral: this.randomChoice(["light", "dark"])
    };
    const targetAlignment = targetAlignmentMap[themes.forceAlignment as keyof typeof targetAlignmentMap] || "neutral";
    const faction = this.selectFaction(targetAlignment);
    
    // Select a location based on character class
    const charClass = themes.class;
    const locationTypes = this.templates.locationTemplates.class[charClass as keyof typeof this.templates.locationTemplates.class] || 
                         this.templates.locationTemplates.class.soldier;
    const locationType = this.randomChoice(locationTypes);
    
    // Fill template
    const substitutions = {
      target: faction,
      location: locationType
    };
    
    return {
      title: this.fillTemplate(template, substitutions),
      target: faction,
      location: locationType,
      combatStyle: combatStyle,
      forceAlignment: themes.forceAlignment
    };
  }
  
  generateSideQuest(charProfile: CharacterProfile, primaryObjective: ObjectiveData): SideQuestData {
    const themes = this.parser.analyzeProfile(charProfile);
    
    // Select template based on character motivation
    const motivation = themes.motivation;
    const motivationTemplates = this.templates.sideQuestTemplates.motivation[motivation as keyof typeof this.templates.sideQuestTemplates.motivation] || 
                              this.templates.sideQuestTemplates.motivation.discovery;
    const template = this.randomChoice(motivationTemplates);
    
    // Reuse the target and location from primary objective for continuity
    const target = primaryObjective.target;
    const location = primaryObjective.location;
    
    // Fill template
    const substitutions = {
      target: target,
      location: location
    };
    
    return {
      title: this.fillTemplate(template, substitutions),
      target: target,
      location: location,
      motivation: motivation
    };
  }
  
  generateNPCs(charProfile: CharacterProfile, primaryObjective: ObjectiveData, count: number = 3): NPCData[] {
    const themes = this.parser.analyzeProfile(charProfile);
    const forceAlignment = themes.forceAlignment;
    
    const npcs: NPCData[] = [];
    for (let i = 0; i < count; i++) {
      // Select NPC type based on alignment
      const alignmentKey = forceAlignment as keyof typeof this.templates.npcTemplates.forceAlignment;
      const npcTypes = this.templates.npcTemplates.forceAlignment[alignmentKey] || 
                      this.templates.npcTemplates.forceAlignment.neutral;
      const npcType = this.randomChoice(npcTypes);
      
      // Generate a simple NPC
      const npc: NPCData = {
        type: npcType,
        faction: primaryObjective.target,
        location: primaryObjective.location
      };
      npcs.push(npc);
    }
    
    return npcs;
  }
  
  generateMonsters(charProfile: CharacterProfile, primaryObjective: ObjectiveData, count: number = 2): MonsterData[] {
    const themes = this.parser.analyzeProfile(charProfile);
    const levelCategory = this.getLevelCategory(themes.level);
    
    const monsters: MonsterData[] = [];
    for (let i = 0; i < count; i++) {
      // Select monster type based on level
      const levelKey = levelCategory as keyof typeof this.templates.monsterTemplates.level;
      const monsterTypes = this.templates.monsterTemplates.level[levelKey] || 
                          this.templates.monsterTemplates.level.low;
      const monsterType = this.randomChoice(monsterTypes);
      
      // Generate a simple monster entry
      const monster: MonsterData = {
        type: monsterType,
        location: primaryObjective.location,
        difficulty: levelCategory
      };
      monsters.push(monster);
    }
    
    return monsters;
  }
  
  generateItems(charProfile: CharacterProfile, count: number = 2): ItemData[] {
    const themes = this.parser.analyzeProfile(charProfile);
    const charClass = themes.class;
    
    const items: ItemData[] = [];
    for (let i = 0; i < count; i++) {
      // Select item type based on class
      let itemType: string;
      
      if (charClass in this.templates.itemTemplates.class) {
        const classKey = charClass as keyof typeof this.templates.itemTemplates.class;
        const itemTypes = this.templates.itemTemplates.class[classKey];
        itemType = this.randomChoice(itemTypes);
      } else {
        // Default to random item if class not found
        const randomClass = this.randomChoice(Object.keys(this.templates.itemTemplates.class)) as keyof typeof this.templates.itemTemplates.class;
        const itemTypes = this.templates.itemTemplates.class[randomClass];
        itemType = this.randomChoice(itemTypes);
      }
      
      // Generate a simple item
      const item: ItemData = {
        name: itemType,
        rarity: this.getLevelCategory(themes.level)
      };
      items.push(item);
    }
    
    return items;
  }
  
  generateLocation(primaryObjective: ObjectiveData): LocationData {
    const locationType = primaryObjective.location;
    const target = primaryObjective.target;
    
    // Generate location details
    const details: LocationData = {
      name: `${target} ${locationType}`,
      environment: locationType,
      pointsOfInterest: [
        `Main ${target} facility`,
        `Nearby settlement`,
        `Natural landmark`
      ],
      securityLevel: this.randomChoice(["Low", "Medium", "High"])
    };
    
    return details;
  }
  
  generateFullCampaign(charProfile: CharacterProfile): CampaignData {
    // Start with primary objective
    const primary = this.generatePrimaryObjective(charProfile);
    
    // Generate secondary objectives
    const secondaryObjectives = [
      this.generateSideQuest(charProfile, primary),
      this.generateSideQuest(charProfile, primary)
    ];
    
    // Generate side quests
    const sideQuests = [
      this.generateSideQuest(charProfile, primary),
      this.generateSideQuest(charProfile, primary),
      this.generateSideQuest(charProfile, primary)
    ];
    
    // Generate location details
    const location = this.generateLocation(primary);
    
    // Generate NPCs
    const npcs = this.generateNPCs(charProfile, primary, 4);
    
    // Generate items
    const items = this.generateItems(charProfile, 5);
    
    // Generate monsters
    const monsters = this.generateMonsters(charProfile, primary, 3);
    
    // Compile complete campaign
    const campaign: CampaignData = {
      primaryObjective: primary,
      secondaryObjectives: secondaryObjectives,
      sideQuests: sideQuests,
      location: location,
      npcs: npcs,
      monsters: monsters,
      items: items
    };
    
    return campaign;
  }
}
