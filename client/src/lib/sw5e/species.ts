// Species data for SW5E
export interface Species {
  id: string;
  name: string;
  summary: string;
  description: string;
  abilityScoreAdjustments: Record<string, number>;
  size: string;
  speed: number;
  traits: string[];
  languages: string[];
  subraces?: Species[];
}

export const species: Species[] = [
  {
    id: "human",
    name: "Human",
    summary: "Adaptable and ambitious, humans can be found throughout the galaxy.",
    description: "Humans are the most widespread species in the galaxy, known for their adaptability and drive. They come from diverse cultures across countless worlds.",
    abilityScoreAdjustments: {
      Strength: 1,
      Dexterity: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Versatile", "Fast Learner"],
    languages: ["Galactic Basic", "One additional language of your choice"]
  },
  {
    id: "twi-lek",
    name: "Twi'lek",
    summary: "Graceful humanoids with distinctive head tentacles called lekku.",
    description: "Native to the harsh world of Ryloth, Twi'leks are known for their colorful skin and twin head-tails (lekku) that can be used for subtle communication.",
    abilityScoreAdjustments: {
      Dexterity: 2,
      Charisma: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Lekku Communication", "Heat Resistance"],
    languages: ["Galactic Basic", "Twi'leki"]
  },
  {
    id: "wookiee",
    name: "Wookiee",
    summary: "Tall, powerful warriors with great strength and loyalty.",
    description: "Hailing from the forest planet Kashyyyk, Wookiees are known for their great strength, technological aptitude, and unwavering loyalty.",
    abilityScoreAdjustments: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Natural Climber", "Powerful Build", "Wookiee Rage"],
    languages: ["Galactic Basic", "Shyriiwook"]
  },
  {
    id: "zabrak",
    name: "Zabrak",
    summary: "Resilient humanoids with prominent horns and facial tattoos.",
    description: "Known for their determination and willpower, Zabraks have distinctive horns and facial patterns that reflect their clans and personal achievements.",
    abilityScoreAdjustments: {
      Constitution: 2,
      Wisdom: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Warrior Culture", "Resilient", "Fighting Spirit"],
    languages: ["Galactic Basic", "Zabraki"]
  },
  {
    id: "bothan",
    name: "Bothan",
    summary: "Furred humanoids known for espionage and information gathering.",
    description: "Bothans are known throughout the galaxy for their extensive information network and skill in espionage. Their fur ripples with their emotional state.",
    abilityScoreAdjustments: {
      Dexterity: 1,
      Intelligence: 1,
      Charisma: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Bothan Spy Network", "Heightened Senses", "Cunning"],
    languages: ["Galactic Basic", "Bothese"]
  },
  {
    id: "cerean",
    name: "Cerean",
    summary: "Humanoids with enlarged binary brains and enhanced mental abilities.",
    description: "From the planet Cerea, these humanoids are distinguished by their elongated heads that house binary brains, allowing them to process information differently.",
    abilityScoreAdjustments: {
      Wisdom: 2,
      Intelligence: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Binary Brain", "Force Sensitive", "Insightful"],
    languages: ["Galactic Basic", "Cerean"]
  },
  {
    id: "togruta",
    name: "Togruta",
    summary: "Colorful humanoids with head-tails and hollow montrals that sense ultrasonic waves.",
    description: "Native to Shili, Togruta have distinctive montrals and head-tails that give them heightened spatial awareness. They're naturally connected to their surroundings.",
    abilityScoreAdjustments: {
      Dexterity: 2,
      Wisdom: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Spatial Awareness", "Pack Hunters", "Enhanced Perception"],
    languages: ["Galactic Basic", "Togruti"]
  },
  {
    id: "trandoshan",
    name: "Trandoshan",
    summary: "Reptilian hunters with regenerative abilities and natural armor.",
    description: "The reptilian Trandoshans are feared hunters across the galaxy, with tough scaled skin and the ability to regenerate lost limbs over time.",
    abilityScoreAdjustments: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: 30,
    traits: ["Natural Armor", "Limb Regeneration", "Hunter's Instinct"],
    languages: ["Galactic Basic", "Dosh"]
  }
];