export interface Species {
  id: string;
  name: string;
  summary: string;
  abilityScoreAdjustments: Record<string, number>;
  size: string;
  speed: number;
  traits?: string[];
}

export const species: Species[] = [
  {
    id: "human",
    name: "Human",
    summary: "Versatile and adaptable, humans are found throughout the galaxy in various cultures and societies.",
    abilityScoreAdjustments: {
      Strength: 1, 
      Dexterity: 1,
      Constitution: 1,
      Intelligence: 1,
      Wisdom: 1,
      Charisma: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Skilled", "Versatile"]
  },
  {
    id: "twilek",
    name: "Twi'lek",
    summary: "Known for their head tails and colorful skin, Twi'leks are graceful and cunning.",
    abilityScoreAdjustments: {
      Dexterity: 2,
      Charisma: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Darkvision", "Twilek Cunning", "Deceptive"]
  },
  {
    id: "wookiee",
    name: "Wookiee",
    summary: "Towering, fur-covered humanoids known for their strength, loyalty, and fierce tempers.",
    abilityScoreAdjustments: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Climbing", "Powerful Build", "Wookiee Rage"]
  },
  {
    id: "zabrak",
    name: "Zabrak",
    summary: "Recognizable by their horns and facial patterns, Zabraks are known for their determination and resilience.",
    abilityScoreAdjustments: {
      Dexterity: 1,
      Constitution: 2
    },
    size: "Medium",
    speed: 30,
    traits: ["Warrior Culture", "Fearless", "Survival Instinct"]
  },
  {
    id: "togruta",
    name: "Togruta",
    summary: "With colorful head-tails and montrals, Togruta possess heightened spatial awareness and hunting capabilities.",
    abilityScoreAdjustments: {
      Wisdom: 2,
      Charisma: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Echolocation", "Pack Mentality", "Hunter's Instincts"]
  },
  {
    id: "bothan",
    name: "Bothan",
    summary: "Clever and political, Bothans are known for their skills in espionage and information gathering.",
    abilityScoreAdjustments: {
      Dexterity: 1,
      Intelligence: 2
    },
    size: "Medium",
    speed: 30,
    traits: ["Bothan Spynet", "Cunning", "Naturally Stealthy"]
  },
  {
    id: "trandoshan",
    name: "Trandoshan",
    summary: "Reptilian hunters with natural regeneration abilities and enhanced senses.",
    abilityScoreAdjustments: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Regeneration", "Natural Armor", "Hunter's Senses"]
  },
  {
    id: "moncalamari",
    name: "Mon Calamari",
    summary: "Aquatic humanoids known for their engineering skills and tactical minds.",
    abilityScoreAdjustments: {
      Intelligence: 2,
      Wisdom: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Amphibious", "Oceanic Adaptation", "Engineering Aptitude"]
  }
];
