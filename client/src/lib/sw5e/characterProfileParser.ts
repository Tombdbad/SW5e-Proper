
export interface CharacterProfile {
  name: string;
  species: string;
  class: string;
  level: number;
  background: string;
  abilities: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  alignment: string;
  forceAlignment?: string;
  skillProficiencies: string[];
  [key: string]: any;
}

export interface CharacterThemes {
  combatStyle: string;
  forceAlignment: string;
  class: string;
  level: number;
  motivation: string;
  personalityTraits: string[];
  [key: string]: any;
}

export class CharacterProfileParser {
  // Analyze the character profile and extract themes
  analyzeProfile(profile: CharacterProfile): CharacterThemes {
    const themes: CharacterThemes = {
      // Default values
      combatStyle: "balanced",
      forceAlignment: "neutral",
      class: profile.class || "soldier",
      level: profile.level || 1,
      motivation: "discovery",
      personalityTraits: []
    };
    
    // Determine combat style based on class and ability scores
    themes.combatStyle = this.determineCombatStyle(profile);
    
    // Determine force alignment based on alignment or explicit force alignment
    themes.forceAlignment = this.determineForceAlignment(profile);
    
    // Determine motivation based on background and other factors
    themes.motivation = this.determineMotivation(profile);
    
    // Extract personality traits
    if (profile.personalityTraits) {
      themes.personalityTraits = Array.isArray(profile.personalityTraits) 
        ? profile.personalityTraits 
        : [profile.personalityTraits];
    }
    
    return themes;
  }
  
  private determineCombatStyle(profile: CharacterProfile): string {
    // Classes with typical combat styles
    const combatStyleByClass: {[key: string]: string} = {
      "berserker": "aggressive",
      "fighter": "aggressive",
      "monk": "aggressive",
      "guardian": "defensive",
      "sentinel": "defensive",
      "consular": "balanced",
      "scout": "stealthy",
      "operative": "stealthy",
      "scholar": "balanced",
      "engineer": "balanced"
    };
    
    // First check if the class has a typical combat style
    if (profile.class && combatStyleByClass[profile.class.toLowerCase()]) {
      return combatStyleByClass[profile.class.toLowerCase()];
    }
    
    // Otherwise determine based on ability scores
    const abilities = profile.abilities;
    if (!abilities) return "balanced";
    
    if (abilities.strength > abilities.dexterity && abilities.strength > abilities.intelligence) {
      return "aggressive";
    } else if (abilities.dexterity > abilities.strength && abilities.dexterity > abilities.wisdom) {
      return "stealthy";
    } else if (abilities.constitution > abilities.dexterity && abilities.constitution > abilities.charisma) {
      return "defensive";
    } else {
      return "balanced";
    }
  }
  
  private determineForceAlignment(profile: CharacterProfile): string {
    // If explicitly set, use that
    if (profile.forceAlignment) {
      return profile.forceAlignment.toLowerCase();
    }
    
    // Otherwise infer from alignment
    if (profile.alignment) {
      const alignment = profile.alignment.toLowerCase();
      if (alignment.includes("good") || alignment.includes("lawful")) {
        return "light";
      } else if (alignment.includes("evil") || alignment.includes("chaotic")) {
        return "dark";
      }
    }
    
    return "neutral";
  }
  
  private determineMotivation(profile: CharacterProfile): string {
    // Background to motivation mapping
    const motivationByBackground: {[key: string]: string} = {
      "criminal": "wealth",
      "soldier": "duty",
      "bounty hunter": "wealth",
      "jedi": "justice",
      "sith": "power",
      "noble": "influence",
      "explorer": "discovery",
      "pilot": "freedom",
      "entertainer": "fame",
      "engineer": "creation"
    };
    
    // Check if background suggests a motivation
    if (profile.background && motivationByBackground[profile.background.toLowerCase()]) {
      return motivationByBackground[profile.background.toLowerCase()];
    }
    
    // Otherwise make a guess based on highest ability score
    const abilities = profile.abilities;
    if (!abilities) return "discovery";
    
    let highestAbility = "strength";
    let highestValue = abilities.strength;
    
    Object.entries(abilities).forEach(([ability, value]) => {
      if (value > highestValue) {
        highestAbility = ability;
        highestValue = value;
      }
    });
    
    switch (highestAbility) {
      case "strength": return "power";
      case "dexterity": return "freedom";
      case "constitution": return "survival";
      case "intelligence": return "knowledge";
      case "wisdom": return "enlightenment";
      case "charisma": return "influence";
      default: return "discovery";
    }
  }
}
