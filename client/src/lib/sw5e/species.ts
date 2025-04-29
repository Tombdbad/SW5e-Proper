// Species data for SW5E
export interface Species {
  id: string;
  name: string;
  summary: string;
  description: string;
  abilityScoreIncrease: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
    any?: number;
  };
  size: "Small" | "Medium" | "Large";
  speed: {
    walk: number;
    swim?: number;
    climb?: number;
    fly?: number;
    glide?: number;
    slither?: number;
    leap?: number;
  };
  vision: {
    type: "Normal" | "Darkvision" | "Superior Darkvision";
    range?: number;
  };
  traits: {
    name: string;
    description: string;
  }[];
  languages: string[];
  source: string;
  commonClasses?: string[];
}

export const species: Species[] = [
  {
    id: "abyssin",
    name: "Abyssin",
    summary: "Tough and resilient humanoids with exceptional survival instincts",
    description: "Known for their tough hides and resilience. Often seen as solitary and stoic individuals.",
    abilityScoreIncrease: {
      constitution: 2,
      strength: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60
    },
    traits: [
      {
        name: "Natural Armor",
        description: "Your tough hide grants you a +1 bonus to your AC."
      },
      {
        name: "Unblinking Gaze",
        description: "You have advantage on saving throws against being blinded."
      }
    ],
    languages: ["Galactic Basic", "Abyssin"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"]
  },
  {
    id: "advozse",
    name: "Advozse",
    summary: "Telepathic humanoids with keen intellectual abilities",
    description: "Highly intelligent and often contemplative. Their telepathic abilities shape their communication and social interactions.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Advozse Telepathy",
        description: "You can communicate telepathically with any creature within 30 feet that shares a language with you."
      },
      {
        name: "Keen Intellect",
        description: "You gain proficiency in the Investigation skill."
      }
    ],
    languages: ["Galactic Basic", "Advozse"],
    source: "UCSC",
    commonClasses: ["Scholar", "Consular"]
  },
  {
    id: "aleena",
    name: "Aleena",
    summary: "Small, agile humanoids known for their acrobatic abilities",
    description: "Known for their exceptional agility and grace. Their culture often values physical dexterity and performance.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1
    },
    size: "Small",
    speed: { walk: 35 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Aleena Agility",
        description: "You have advantage on Acrobatics checks."
      },
      {
        name: "Natural Acrobat",
        description: "You gain proficiency in the Acrobatics skill."
      }
    ],
    languages: ["Galactic Basic", "Aleena"],
    source: "UCSC",
    commonClasses: ["Operative", "Scout"]
  },
  {
    id: "anomid",
    name: "Anomid",
    summary: "Quiet and thoughtful humanoids with unique communication methods",
    description: "Quiet and thoughtful, relying on subtle communication. Often found in roles requiring patience and observation.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Anomid Communication",
        description: "You can communicate subtly with other Anomids through facial plate expressions."
      },
      {
        name: "Mental Resistance",
        description: "You have advantage on saving throws against being charmed."
      }
    ],
    languages: ["Galactic Basic", "Anomid"],
    source: "UCSC",
    commonClasses: ["Scholar", "Sentinel"]
  },
  {
    id: "arcona",
    name: "Arcona",
    summary: "Amphibious humanoids with thick protective hides",
    description: "Robust and adapted to aquatic environments. Often possess a straightforward and practical nature.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30
    },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Amphibious",
        description: "You can breathe both air and water."
      },
      {
        name: "Thick Hide",
        description: "Your thick hide grants you a +1 bonus to your AC."
      }
    ],
    languages: ["Galactic Basic", "Arconese"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"]
  },
  {
    id: "human",
    name: "Human",
    summary: "Adaptable and ambitious, humans can be found throughout the galaxy.",
    description: "Humans are the most widespread species in the galaxy, known for their adaptability and drive. They come from diverse cultures across countless worlds.",
    abilityScoreIncrease: {
      Strength: 1,
      Dexterity: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Versatile", description: "Versatile" },
      { name: "Fast Learner", description: "Fast Learner" }
    ],
    languages: ["Galactic Basic", "One additional language of your choice"],
    source: "Core Rulebook"
  },
  {
    id: "twi-lek",
    name: "Twi'lek",
    summary: "Graceful humanoids with distinctive head tentacles called lekku.",
    description: "Native to the harsh world of Ryloth, Twi'leks are known for their colorful skin and twin head-tails (lekku) that can be used for subtle communication.",
    abilityScoreIncrease: {
      Dexterity: 2,
      Charisma: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Lekku Communication", description: "Lekku Communication" },
      { name: "Heat Resistance", description: "Heat Resistance" }
    ],
    languages: ["Galactic Basic", "Twi'leki"],
    source: "Core Rulebook"
  },
  {
    id: "wookiee",
    name: "Wookiee",
    summary: "Tall, powerful warriors with great strength and loyalty.",
    description: "Hailing from the forest planet Kashyyyk, Wookiees are known for their great strength, technological aptitude, and unwavering loyalty.",
    abilityScoreIncrease: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Natural Climber", description: "Natural Climber" },
      { name: "Powerful Build", description: "Powerful Build" },
      { name: "Wookiee Rage", description: "Wookiee Rage" }
    ],
    languages: ["Galactic Basic", "Shyriiwook"],
    source: "Core Rulebook"
  },
  {
    id: "zabrak",
    name: "Zabrak",
    summary: "Resilient humanoids with prominent horns and facial tattoos.",
    description: "Known for their determination and willpower, Zabraks have distinctive horns and facial patterns that reflect their clans and personal achievements.",
    abilityScoreIncrease: {
      Constitution: 2,
      Wisdom: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Warrior Culture", description: "Warrior Culture" },
      { name: "Resilient", description: "Resilient" },
      { name: "Fighting Spirit", description: "Fighting Spirit" }
    ],
    languages: ["Galactic Basic", "Zabraki"],
    source: "Core Rulebook"
  },
  {
    id: "bothan",
    name: "Bothan",
    summary: "Furred humanoids known for espionage and information gathering.",
    description: "Bothans are known throughout the galaxy for their extensive information network and skill in espionage. Their fur ripples with their emotional state.",
    abilityScoreIncrease: {
      Dexterity: 1,
      Intelligence: 1,
      Charisma: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Bothan Spy Network", description: "Bothan Spy Network" },
      { name: "Heightened Senses", description: "Heightened Senses" },
      { name: "Cunning", description: "Cunning" }
    ],
    languages: ["Galactic Basic", "Bothese"],
    source: "Core Rulebook"
  },
  {
    id: "cerean",
    name: "Cerean",
    summary: "Humanoids with enlarged binary brains and enhanced mental abilities.",
    description: "From the planet Cerea, these humanoids are distinguished by their elongated heads that house binary brains, allowing them to process information differently.",
    abilityScoreIncrease: {
      Wisdom: 2,
      Intelligence: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Binary Brain", description: "Binary Brain" },
      { name: "Force Sensitive", description: "Force Sensitive" },
      { name: "Insightful", description: "Insightful" }
    ],
    languages: ["Galactic Basic", "Cerean"],
    source: "Core Rulebook"
  },
  {
    id: "togruta",
    name: "Togruta",
    summary: "Colorful humanoids with head-tails and hollow montrals that sense ultrasonic waves.",
    description: "Native to Shili, Togruta have distinctive montrals and head-tails that give them heightened spatial awareness. They're naturally connected to their surroundings.",
    abilityScoreIncrease: {
      Dexterity: 2,
      Wisdom: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Spatial Awareness", description: "Spatial Awareness" },
      { name: "Pack Hunters", description: "Pack Hunters" },
      { name: "Enhanced Perception", description: "Enhanced Perception" }
    ],
    languages: ["Galactic Basic", "Togruti"],
    source: "Core Rulebook"
  },
  {
    id: "trandoshan",
    name: "Trandoshan",
    summary: "Reptilian hunters with regenerative abilities and natural armor.",
    description: "The reptilian Trandoshans are feared hunters across the galaxy, with tough scaled skin and the ability to regenerate lost limbs over time.",
    abilityScoreIncrease: {
      Strength: 2,
      Constitution: 1
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Natural Armor", description: "Natural Armor" },
      { name: "Limb Regeneration", description: "Limb Regeneration" },
      { name: "Hunter's Instinct", description: "Hunter's Instinct" }
    ],
    languages: ["Galactic Basic", "Dosh"],
    source: "Core Rulebook"
  },
  {
    id: "ardennian",
    name: "Ardennian",
    summary: "Small, agile climbers with enhanced senses",
    description: "Agile and resourceful, with a strong sense of smell. Their small size and climbing ability often make them adept at navigating tight spaces.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1
    },
    size: "Small",
    speed: {
      walk: 25,
      climb: 25
    },
    vision: {
      type: "Normal"
    },
    traits: [
      {
        name: "Keen Smell",
        description: "You have advantage on Perception checks that rely on smell."
      },
      {
        name: "Natural Climber",
        description: "You have a climbing speed equal to your walking speed."
      }
    ],
    languages: ["Galactic Basic", "Ardennian"],
    source: "UCSC",
    commonClasses: ["Scout", "Operative"]
  }
];