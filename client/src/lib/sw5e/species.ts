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
    summary:
      "Tough and resilient humanoids with exceptional survival instincts",
    description:
      "Known for their tough hides and resilience. Often seen as solitary and stoic individuals.",
    abilityScoreIncrease: {
      constitution: 2,
      strength: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Natural Armor",
        description: "Your tough hide grants you a +1 bonus to your AC.",
      },
      {
        name: "Unblinking Gaze",
        description:
          "You have advantage on saving throws against being blinded.",
      },
    ],
    languages: ["Galactic Basic", "Abyssin"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "advozse",
    name: "Advozse",
    summary: "Telepathic humanoids with keen intellectual abilities",
    description:
      "Highly intelligent and often contemplative. Their telepathic abilities shape their communication and social interactions.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Advozse Telepathy",
        description:
          "You can communicate telepathically with any creature within 30 feet that shares a language with you.",
      },
      {
        name: "Keen Intellect",
        description: "You gain proficiency in the Investigation skill.",
      },
    ],
    languages: ["Galactic Basic", "Advozse"],
    source: "UCSC",
    commonClasses: ["Scholar", "Consular"],
  },
  {
    id: "aleena",
    name: "Aleena",
    summary: "Small, agile humanoids known for their acrobatic abilities",
    description:
      "Known for their exceptional agility and grace. Their culture often values physical dexterity and performance.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1,
    },
    size: "Small",
    speed: { walk: 35 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Aleena Agility",
        description: "You have advantage on Acrobatics checks.",
      },
      {
        name: "Natural Acrobat",
        description: "You gain proficiency in the Acrobatics skill.",
      },
    ],
    languages: ["Galactic Basic", "Aleena"],
    source: "UCSC",
    commonClasses: ["Operative", "Scout"],
  },
  {
    id: "anomid",
    name: "Anomid",
    summary: "Quiet and thoughtful humanoids with unique communication methods",
    description:
      "Quiet and thoughtful, relying on subtle communication. Often found in roles requiring patience and observation.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Anomid Communication",
        description:
          "You can communicate subtly with other Anomids through facial plate expressions.",
      },
      {
        name: "Mental Resistance",
        description:
          "You have advantage on saving throws against being charmed.",
      },
    ],
    languages: ["Galactic Basic", "Anomid"],
    source: "UCSC",
    commonClasses: ["Scholar", "Sentinel"],
  },
  {
    id: "arcona",
    name: "Arcona",
    summary: "Amphibious humanoids with thick protective hides",
    description:
      "Robust and adapted to aquatic environments. Often possess a straightforward and practical nature.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Amphibious",
        description: "You can breathe both air and water.",
      },
      {
        name: "Thick Hide",
        description: "Your thick hide grants you a +1 bonus to your AC.",
      },
    ],
    languages: ["Galactic Basic", "Arconese"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "human",
    name: "Human",
    summary:
      "Adaptable and ambitious, humans can be found throughout the galaxy.",
    description:
      "Humans are the most widespread species in the galaxy, known for their adaptability and drive. They come from diverse cultures across countless worlds.",
    abilityScoreIncrease: {
      Strength: 1,
      Dexterity: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Versatile", description: "Versatile" },
      { name: "Fast Learner", description: "Fast Learner" },
    ],
    languages: ["Galactic Basic", "One additional language of your choice"],
    source: "Core Rulebook",
  },
  {
    id: "twi-lek",
    name: "Twi'lek",
    summary: "Graceful humanoids with distinctive head tentacles called lekku.",
    description:
      "Native to the harsh world of Ryloth, Twi'leks are known for their colorful skin and twin head-tails (lekku) that can be used for subtle communication.",
    abilityScoreIncrease: {
      Dexterity: 2,
      Charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Lekku Communication", description: "Lekku Communication" },
      { name: "Heat Resistance", description: "Heat Resistance" },
    ],
    languages: ["Galactic Basic", "Twi'leki"],
    source: "Core Rulebook",
  },
  {
    id: "wookiee",
    name: "Wookiee",
    summary: "Tall, powerful warriors with great strength and loyalty.",
    description:
      "Hailing from the forest planet Kashyyyk, Wookiees are known for their great strength, technological aptitude, and unwavering loyalty.",
    abilityScoreIncrease: {
      Strength: 2,
      Constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Natural Climber", description: "Natural Climber" },
      { name: "Powerful Build", description: "Powerful Build" },
      { name: "Wookiee Rage", description: "Wookiee Rage" },
    ],
    languages: ["Galactic Basic", "Shyriiwook"],
    source: "Core Rulebook",
  },
  {
    id: "zabrak",
    name: "Zabrak",
    summary: "Resilient humanoids with prominent horns and facial tattoos.",
    description:
      "Known for their determination and willpower, Zabraks have distinctive horns and facial patterns that reflect their clans and personal achievements.",
    abilityScoreIncrease: {
      Constitution: 2,
      Wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Warrior Culture", description: "Warrior Culture" },
      { name: "Resilient", description: "Resilient" },
      { name: "Fighting Spirit", description: "Fighting Spirit" },
    ],
    languages: ["Galactic Basic", "Zabraki"],
    source: "Core Rulebook",
  },
  {
    id: "bothan",
    name: "Bothan",
    summary: "Furred humanoids known for espionage and information gathering.",
    description:
      "Bothans are known throughout the galaxy for their extensive information network and skill in espionage. Their fur ripples with their emotional state.",
    abilityScoreIncrease: {
      Dexterity: 1,
      Intelligence: 1,
      Charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Bothan Spy Network", description: "Bothan Spy Network" },
      { name: "Heightened Senses", description: "Heightened Senses" },
      { name: "Cunning", description: "Cunning" },
    ],
    languages: ["Galactic Basic", "Bothese"],
    source: "Core Rulebook",
  },
  {
    id: "cerean",
    name: "Cerean",
    summary:
      "Humanoids with enlarged binary brains and enhanced mental abilities.",
    description:
      "From the planet Cerea, these humanoids are distinguished by their elongated heads that house binary brains, allowing them to process information differently.",
    abilityScoreIncrease: {
      Wisdom: 2,
      Intelligence: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Binary Brain", description: "Binary Brain" },
      { name: "Force Sensitive", description: "Force Sensitive" },
      { name: "Insightful", description: "Insightful" },
    ],
    languages: ["Galactic Basic", "Cerean"],
    source: "Core Rulebook",
  },
  {
    id: "togruta",
    name: "Togruta",
    summary:
      "Colorful humanoids with head-tails and hollow montrals that sense ultrasonic waves.",
    description:
      "Native to Shili, Togruta have distinctive montrals and head-tails that give them heightened spatial awareness. They're naturally connected to their surroundings.",
    abilityScoreIncrease: {
      Dexterity: 2,
      Wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Spatial Awareness", description: "Spatial Awareness" },
      { name: "Pack Hunters", description: "Pack Hunters" },
      { name: "Enhanced Perception", description: "Enhanced Perception" },
    ],
    languages: ["Galactic Basic", "Togruti"],
    source: "Core Rulebook",
  },
  {
    id: "trandoshan",
    name: "Trandoshan",
    summary: "Reptilian hunters with regenerative abilities and natural armor.",
    description:
      "The reptilian Trandoshans are feared hunters across the galaxy, with tough scaled skin and the ability to regenerate lost limbs over time.",
    abilityScoreIncrease: {
      Strength: 2,
      Constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      { name: "Natural Armor", description: "Natural Armor" },
      { name: "Limb Regeneration", description: "Limb Regeneration" },
      { name: "Hunter's Instinct", description: "Hunter's Instinct" },
    ],
    languages: ["Galactic Basic", "Dosh"],
    source: "Core Rulebook",
  },
  {
    id: "ardennian",
    name: "Ardennian",
    summary: "Small, agile climbers with enhanced senses",
    description:
      "Agile and resourceful, with a strong sense of smell. Their small size and climbing ability often make them adept at navigating tight spaces.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
      climb: 25,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Keen Smell",
        description:
          "You have advantage on Perception checks that rely on smell.",
      },
      {
        name: "Natural Climber",
        description: "You have a climbing speed equal to your walking speed.",
      },
    ],
    languages: ["Galactic Basic", "Ardennian"],
    source: "UCSC",
    commonClasses: ["Scout", "Operative"],
  },
  {
    id: "arkanian",
    name: "Arkanian",
    summary: "Highly intelligent and often possess a thirst for knowledge.",
    description:
      "Some Arkanians have a complex history with genetic manipulation and Force sensitivity.",
    abilityScoreIncrease: {
      intelligence: 2,
      any: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Arkanian Knowledge",
        description: "Proficiency in Arcana, History, or Technology",
      },
      {
        name: "Limited Telepathy",
        description: "Project simple thoughts/emotions within 10 ft.",
      },
    ],
    languages: ["Galactic Basic", "Arkanian"],
    source: "UCSC",
    commonClasses: ["Scholar", "Engineer", "Consular"],
  },
  {
    id: "balosar",
    name: "Balosar",
    summary: "Often possess a carefree and opportunistic attitude.",
    description:
      "Their dexterity and luck can make them skilled in various roguish pursuits.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Balosar Luck",
        description: "Reroll failed Dexterity saving throw once per rest",
      },
      {
        name: "Nimble Fingers",
        description: "Advantage on Sleight of Hand checks",
      },
    ],
    languages: ["Galactic Basic", "Balosar"],
    source: "UCSC",
    commonClasses: ["Operative", "Scoundrel"],
  },
  {
    id: "barabel",
    name: "Barabel",
    summary:
      "Fierce and territorial, with a strong connection to their aquatic homeworld.",
    description: "Often possess a strong sense of tradition.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30, swim: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Armor",
        description: "+1 AC",
      },
      {
        name: "Powerful Tail",
        description:
          "Unarmed strikes with tail deal 1d4 bludgeoning, reach 5 ft.",
      },
      {
        name: "Swift Swimmer",
        description: "Swimming speed equals walking speed",
      },
    ],
    languages: ["Galactic Basic", "Barabel"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "besalisk",
    name: "Besalisk",
    summary:
      "Known for their physical strength and often employed in roles requiring heavy lifting or combat.",
    description: "Their four arms provide unique advantages.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Four Arms",
        description:
          "Advantage on Strength (Athletics) checks to grapple, can wield two additional light weapons",
      },
      {
        name: "Powerful Build",
        description: "as Droid V",
      },
    ],
    languages: ["Galactic Basic", "Besalisk"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "bith",
    name: "Bith",
    summary:
      "Known for their artistic talents, particularly in music and mathematics.",
    description: "Often found in scholarly or technical professions.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Keen Hearing",
        description: "",
      },
      {
        name: "Musical Aptitude",
        description: "",
      },
    ],
    languages: ["Galactic Basic", "Bith"],
    source: "PHB",
    commonClasses: ["Scholar", "Engineer", "Envoy"],
  },
  {
    id: "bothan",
    name: "Bothan",
    summary: "Renowned for their information networks and spycraft.",
    description: "Their society often values cunning and strategic thinking.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Affinity",
        description: "Persuasion or Deception",
      },
      {
        name: "Bothan Insight",
        description: "",
      },
    ],
    languages: ["Galactic Basic", "Bothan"],
    source: "PHB",
    commonClasses: ["Operative", "Scoundrel", "Envoy"],
  },
  {
    id: "caamasi",
    name: "Caamasi",
    summary:
      "Wise and contemplative, with exceptional memory and occasional glimpses into the future.",
    description: "Often serve as advisors or scholars.",
    abilityScoreIncrease: {
      wisdom: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Photographic Memory",
        description: "Advantage on Intelligence checks to recall information",
      },
      {
        name: "Precognitive Trance",
        description:
          "Can enter a trance to gain insight, providing advantage on one attack roll, ability check, or saving throw per long rest",
      },
    ],
    languages: ["Galactic Basic", "Caamasi"],
    source: "UCSC",
    commonClasses: ["Consular", "Scholar"],
  },
  {
    id: "cathar",
    name: "Cathar",
    summary:
      "Fierce warriors and skilled hunters with a strong sense of honor and loyalty.",
    description: "Often possess a regal bearing.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Claws",
        description: "1d4 slashing",
      },
      {
        name: "Feline Agility",
        description: "+10 ft. speed",
      },
      {
        name: "Keen Senses",
        description: "Perception proficiency",
      },
    ],
    languages: ["Galactic Basic", "Cathar"],
    source: "PHB",
    commonClasses: ["Guardian", "Warrior", "Scout"],
  },
  {
    id: "cerean",
    name: "Cerean",
    summary: "Known for their intellectual prowess and calm demeanor.",
    description: "Their dual brains allow for complex thought processes.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Dual Brains",
        description: "Advantage vs. charmed/frightened",
      },
      {
        name: "Cerean Resolve",
        description: "Advantage on Wisdom saves",
      },
    ],
    languages: ["Galactic Basic", "Cerean"],
    source: "PHB",
    commonClasses: ["Scholar", "Consular", "Sentinel"],
  },
  {
    id: "chadra-fan",
    name: "Chadra-Fan",
    summary:
      "Agile and resourceful, adapted to living in dense, vertical environments.",
    description: "Often possess a curious and adventurous nature.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Small",
    speed: { walk: 25, climb: 25 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Nimble Escape",
        description: "Disengage as a bonus action",
      },
      {
        name: "Wall Clinger",
        description: "Climbing speed equals walking speed on vertical surfaces",
      },
    ],
    languages: ["Galactic Basic", "Chadra-Fan"],
    source: "UCSC",
    commonClasses: ["Scout", "Operative"],
  },
  {
    id: "chagrian",
    name: "Chagrian",
    summary:
      "Calm and patient, with a natural affinity for aquatic environments.",
    description: "Often possess a philosophical outlook.",
    abilityScoreIncrease: {
      constitution: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30, swim: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Amphibious",
        description: "",
      },
      {
        name: "Natural Armor",
        description: "+1 AC",
      },
    ],
    languages: ["Galactic Basic", "Chagrian"],
    source: "UCSC",
    commonClasses: ["Consular", "Guardian"],
  },
  {
    id: "chevin",
    name: "Chevin",
    summary:
      "Physically imposing and resilient, often found in roles requiring strength and endurance.",
    description: "Can be stubborn and determined.",
    abilityScoreIncrease: {
      constitution: 2,
      strength: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Powerful Build",
        description: "as Droid V",
      },
      {
        name: "Relentless Endurance",
        description:
          "When reduced to 0 HP but not killed, can drop to 1 HP once per long rest",
      },
    ],
    languages: ["Galactic Basic", "Chevin"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "chiss",
    name: "Chiss",
    summary:
      "Disciplined and strategic thinkers with a strong emphasis on order and tradition.",
    description: "Often associated with military or leadership roles.",
    abilityScoreIncrease: {
      intelligence: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Superior Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Superior Darkvision",
        description: "60 ft.",
      },
      {
        name: "Chiss Tactics",
        description: "Reroll missed attack once per rest",
      },
    ],
    languages: ["Galactic Basic", "Cheunh"],
    source: "PHB",
    commonClasses: ["Officer", "Engineer", "Consular"],
  },
  {
    id: "clawdite",
    name: "Clawdite",
    summary: "Masters of disguise and infiltration.",
    description:
      "Their shapeshifting abilities make them ideal for espionage and subterfuge. Often viewed with suspicion by other species.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Shapechanger",
        description:
          "As an action, can polymorph into any Medium or Small humanoid they have seen, or back to their true form. Stats remain the same",
      },
    ],
    languages: ["Galactic Basic", "Clawdite"],
    source: "UCSC",
    commonClasses: ["Operative", "Scoundrel"],
  },
  {
    id: "codru-ji",
    name: "Codru-Ji",
    summary:
      "Known for their keen eyesight and often possess a perceptive and observant nature.",
    description: "Their four eyes are a distinctive feature.",
    abilityScoreIncrease: {
      intelligence: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Four Eyes",
        description: "Advantage on Wisdom (Perception) checks relying on sight",
      },
      {
        name: "Keen Sight",
        description: "Perception proficiency",
      },
    ],
    languages: ["Galactic Basic", "Codruese"],
    source: "UCSC",
    commonClasses: ["Scholar", "Envoy"],
  },
  {
    id: "colicoid",
    name: "Colicoid",
    summary:
      "Physically tough and often found in roles requiring strength and resilience.",
    description: "Their powerful legs allow for impressive leaps.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Armor",
        description: "+2 AC",
      },
      {
        name: "Powerful Legs",
        description: "Advantage on Strength (Athletics) checks to jump",
      },
    ],
    languages: ["Galactic Basic", "Colicoid"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "dashade",
    name: "Dashade",
    summary: "Mysterious and often unsettling to other species.",
    description:
      "Their connection to shadow can make them skilled infiltrators.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Shadowmeld",
        description:
          "Advantage on Dexterity (Stealth) checks in dim light or darkness",
      },
      {
        name: "Unnatural Presence",
        description: "Advantage on Intimidation checks",
      },
    ],
    languages: ["Galactic Basic", "Dashade"],
    source: "UCSC",
    commonClasses: ["Operative", "Sentinel"],
  },
  {
    id: "defel",
    name: "Defel",
    summary: "Nocturnal and stealthy, often preferring dimly lit environments.",
    description:
      "Their ability to blend into shadows makes them excellent spies or assassins.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Shadow Blend",
        description: "Advantage on Stealth checks in dim light or darkness",
      },
      {
        name: "Silent Movement",
        description: "Stealth proficiency",
      },
    ],
    languages: ["Galactic Basic", "Defel"],
    source: "UCSC",
    commonClasses: ["Operative", "Scoundrel"],
  },
  {
    id: "devaronian",
    name: "Devaronian",
    summary:
      "Known for their distinctive horns and often seen as charismatic and sometimes hot-headed.",
    description: "Male and female Devaronians have distinct appearances.",
    abilityScoreIncrease: {
      constitution: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Horns",
        description: "1d4 bludgeoning",
      },
      {
        name: "Devaronian Ferocity",
        description: "Drop to 1 HP instead of 0 once per rest",
      },
    ],
    languages: ["Galactic Basic", "Devaronian"],
    source: "PHB",
    commonClasses: ["Scoundrel", "Envoy", "Warrior"],
  },
  {
    id: "diathim",
    name: "Diathim",
    summary:
      "Peaceful and empathetic, with a natural ability to sense the emotions of others.",
    description: "Their bioluminescence is a unique trait.",
    abilityScoreIncrease: {
      wisdom: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30, fly: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Bioluminescence",
        description: "Can emit dim light in a 10-foot radius as a bonus action",
      },
      {
        name: "Empathic Connection",
        description: "Advantage on Wisdom (Insight) checks",
      },
    ],
    languages: ["Galactic Basic", "Diathim"],
    source: "UCSC",
    commonClasses: ["Consular", "Envoy"],
  },
  {
    id: "draethos",
    name: "Draethos",
    summary: "Perceptive and often skilled in deception and illusion.",
    description: "Their enhanced senses make them observant.",
    abilityScoreIncrease: {
      intelligence: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Enhanced Senses",
        description: "Advantage on Wisdom (Perception) checks",
      },
      {
        name: "Natural Illusionist",
        description: "Deception proficiency",
      },
    ],
    languages: ["Galactic Basic", "Draethos"],
    source: "UCSC",
    commonClasses: ["Operative", "Envoy"],
  },
  {
    id: "droid-class-i",
    name: "Droid, Class I",
    summary: "Designed for social interaction, etiquette, and translation.",
    description: "Often possess vast databases of cultural information.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Constructed",
        description:
          "Immunity: disease, poison; Resistance: poison; No eat/drink/breathe/sleep; Immune to sleep effects",
      },
      {
        name: "Droid Resilience",
        description: "Advantage vs. poisoned",
      },
      {
        name: "Integrated Tool",
        description: "Proficiency with one tool",
      },
    ],
    languages: ["Galactic Basic", "plus one of choice"],
    source: "PHB",
    commonClasses: ["Envoy", "Scholar"],
  },
  {
    id: "droid-class-ii",
    name: "Droid, Class II",
    summary:
      "Versatile utility droids specializing in technical support, navigation, and repair.",
    description: "Often equipped with various tools and attachments.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1,
    },
    size: "Small",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Constructed",
        description: "as Class I",
      },
      {
        name: "Droid Resilience",
        description: "as Class I",
      },
      {
        name: "Nimble",
        description: "Advantage on Dexterity saves",
      },
    ],
    languages: ["Galactic Basic", "plus one of choice"],
    source: "PHB",
    commonClasses: ["Engineer", "Scout"],
  },
  {
    id: "droid-class-iii",
    name: "Droid, Class III",
    summary:
      "Designed for leadership, negotiation, or specialized social roles.",
    description:
      "Often possess advanced communication and analytical capabilities.",
    abilityScoreIncrease: {
      charisma: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Constructed",
        description: "as Class I",
      },
      {
        name: "Droid Resilience",
        description: "as Class I",
      },
      {
        name: "Social Expertise",
        description:
          "Proficiency in Deception, Insight, Intimidation, or Persuasion",
      },
    ],
    languages: ["Galactic Basic", "plus one of choice"],
    source: "PHB",
    commonClasses: ["Officer", "Envoy"],
  },
  {
    id: "droid-class-iv",
    name: "Droid, Class IV",
    summary: "Built for security, combat, or heavy labor.",
    description: "Often possess reinforced plating and weapon systems.",
    abilityScoreIncrease: {
      constitution: 2,
      strength: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Constructed",
        description: "as Class I",
      },
      {
        name: "Droid Resilience",
        description: "as Class I",
      },
      {
        name: "Durable Plating",
        description: "+1 AC",
      },
    ],
    languages: ["Galactic Basic", "plus one of choice"],
    source: "PHB",
    commonClasses: ["Guardian", "Warrior"],
  },
  {
    id: "droid-class-v",
    name: "Droid, Class V",
    summary: "Designed for heavy lifting, construction, or frontline combat.",
    description: "Often possess powerful actuators and durable frames.",
    abilityScoreIncrease: {
      strength: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Constructed",
        description: "as Class I",
      },
      {
        name: "Droid Resilience",
        description: "as Class I",
      },
      {
        name: "Powerful Build",
        description: "Count as one size larger for carrying capacity",
      },
    ],
    languages: ["Galactic Basic", "plus one of choice"],
    source: "PHB",
    commonClasses: ["Warrior", "Engineer"],
  },
  {
    id: "duros",
    name: "Duros",
    summary: "Known for their adventurous spirit and piloting skills.",
    description: "Often found traveling the galaxy as explorers or traders.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Hardy Traveler",
        description: "Advantage vs. extreme heat/cold Constitution saves",
      },
      {
        name: "Natural Navigator",
        description: "Advantage on Survival checks to navigate",
      },
    ],
    languages: ["Galactic Basic"],
    source: "PHB",
    commonClasses: ["Pilot", "Scout", "Operative"],
  },
  {
    id: "echani",
    name: "Echani",
    summary:
      "Renowned for their martial arts prowess and disciplined fighting styles.",
    description: "Their movements are often fluid and graceful.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Bonus Fighting Style",
        description: "Choose one at 1st level",
      },
      {
        name: "Echani Grace",
        description: "Advantage on Dexterity saving throws",
      },
    ],
    languages: ["Galactic Basic", "Echani"],
    source: "UCSC",
    commonClasses: ["Warrior", "Sentinel"],
  },
  {
    id: "ewok",
    name: "Ewok",
    summary: "Tribal society with a strong connection to nature.",
    description:
      "Despite their small size, they can be fierce and resourceful.",
    abilityScoreIncrease: {
      dexterity: 2,
      constitution: 1,
    },
    size: "Small",
    speed: { walk: 25 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Fury of the Small",
        description: "+level damage vs. larger creatures",
      },
      {
        name: "Darkvision",
        description: "",
      },
      {
        name: "Natural Stealth",
        description: "Stealth proficiency",
      },
      {
        name: "Primitive Ingenuity",
        description:
          "Advantage on Investigation with simple mechanical devices/traps",
      },
    ],
    languages: ["Galactic Basic", "Ewokese"],
    source: "UCSC",
    commonClasses: ["Warrior", "Sentinel"],
  },
  {
    id: "falleen",
    name: "Falleen",
    summary: "Known for their alluring presence and diplomatic skills",
    description:
      "Known for their alluring presence and diplomatic skills. Their pheromones can subtly influence others.",
    abilityScoreIncrease: {
      charisma: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Falleen Pheromones",
        description:
          "Advantage on Charisma (Persuasion) checks with non-hostile creatures",
      },
      {
        name: "Natural Diplomat",
        description: "Persuasion proficiency",
      },
    ],
    languages: ["Galactic Basic", "Falleen"],
    source: "UCSC",
    commonClasses: ["Envoy", "Scoundrel"],
  },
  {
    id: "gamorrean",
    name: "Gamorrean",
    summary: "Known for their brute strength",
    description:
      "Known for their brute strength and often employed as guards or mercenaries. Their society has a strong emphasis on physical prowess.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Pigheaded",
        description: "Advantage vs. charmed/frightened",
      },
      {
        name: "Powerful Build",
        description:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        name: "Savage Attacks",
        description: "Extra damage die on melee critical hits",
      },
    ],
    languages: ["Galactic Basic", "Gamorrean"],
    source: "PHB",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "gank",
    name: "Gank",
    summary: "Often heavily augmented with cybernetics",
    description:
      "Often heavily augmented with cybernetics, reflecting their brutal and survival-oriented culture. Known for their tracking abilities.",
    abilityScoreIncrease: {
      strength: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: { walk: 30 },
    vision: { type: "Normal" },
    traits: [
      {
        name: "Cybernetic Enhancements",
        description: "+1 bonus to one ability score of your choice",
      },
      {
        name: "Tracker",
        description: "Survival proficiency",
      },
    ],
    languages: ["Galactic Basic", "Gank"],
    source: "UCSC",
    commonClasses: ["Warrior", "Operative"],
  },
  {
    id: "givin",
    name: "Givin",
    summary: "Highly intelligent and adapted to the vacuum of space",
    description:
      "Highly intelligent and adapted to the vacuum of space. Often possess a logical and analytical mindset.",
    abilityScoreIncrease: {
      intelligence: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Vacuum Adaptation",
        description: "Can breathe in a vacuum",
      },
      {
        name: "Mathematical Mind",
        description:
          "Advantage on Intelligence (Investigation) checks related to mathematics or physics",
      },
    ],
    languages: ["Galactic Basic", "Givinese"],
    source: "UCSC",
    commonClasses: ["Scholar", "Engineer"],
  },
  {
    id: "gungan",
    name: "Gungan",
    summary: "Live in underwater and swampy environments",
    description:
      "Live in underwater and swampy environments. Their society has a complex hierarchical structure and unique customs.",
    abilityScoreIncrease: {
      dexterity: 2,
      strength: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Amphibious",
        description: "Breathe air and water",
      },
      {
        name: "Natural Swimmer",
        description: "Advantage on Athletics to swim",
      },
      {
        name: "Gungan Resilience",
        description: "Advantage vs. poison damage",
      },
    ],
    languages: ["Galactic Basic", "Gunganese"],
    source: "PHB",
    commonClasses: ["Warrior", "Scout", "Consular"],
  },
  {
    id: "herglic",
    name: "Herglic",
    summary:
      "Large, aquatic species often involved in interstellar transport and trade",
    description:
      "Large, aquatic species often involved in interstellar transport and trade. Generally peaceful but can be formidable when provoked.",
    abilityScoreIncrease: {
      constitution: 2,
      strength: 1,
    },
    size: "Large",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Aquatic Adaptation",
        description: "Breathe air and water",
      },
      {
        name: "Natural Armor",
        description: "+1 AC",
      },
      {
        name: "Powerful Build",
        description:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
    ],
    languages: ["Galactic Basic", "Herglic"],
    source: "UCSC",
    commonClasses: ["Warrior", "Engineer"],
  },
  {
    id: "hutt",
    name: "Hutt",
    summary: "Known for their criminal empires and influence in the Outer Rim",
    description:
      "Known for their criminal empires and influence in the Outer Rim. Often seen as cunning and greedy.",
    abilityScoreIncrease: {
      constitution: 2,
      charisma: 1,
    },
    size: "Large",
    speed: {
      walk: 20,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Armor",
        description: "+2 AC",
      },
      {
        name: "Powerful Build",
        description:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        name: "Sluggish Movement",
        description: "Base walking speed is 20 feet",
      },
    ],
    languages: ["Galactic Basic", "Huttese"],
    source: "PHB",
    commonClasses: ["Scoundrel", "Envoy"],
  },
  {
    id: "iktokchi",
    name: "Iktotchi",
    summary:
      "Known for their facial horns and often possess a calm and intuitive nature",
    description:
      "Known for their facial horns and often possess a calm and intuitive nature. Their gliding ability is a unique trait.",
    abilityScoreIncrease: {
      wisdom: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      glide: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Glide",
        description: "Can glide up to 30 feet after falling at least 10 feet",
      },
      {
        name: "Keen Senses",
        description: "Perception proficiency",
      },
      {
        name: "Limited Precognition",
        description: "Advantage on initiative rolls",
      },
    ],
    languages: ["Galactic Basic", "Iktotchese"],
    source: "UCSC",
    commonClasses: ["Consular", "Scout"],
  },
  {
    id: "ithorian",
    name: "Ithorian",
    summary: "Pacifistic and deeply connected to the natural world",
    description:
      "Pacifistic and deeply connected to the natural world. Their society often revolves around preserving and nurturing their environment.",
    abilityScoreIncrease: {
      charisma: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Ithorian Harmony",
        description: "Advantage on Animal Handling/Nature",
      },
      {
        name: "Plant Empathy",
        description: "Communicate simple ideas with Small/Medium plants",
      },
      {
        name: "Vocal Mimicry",
        description: "Can mimic sounds and voices they have heard.",
      },
    ],
    languages: ["Galactic Basic", "Ithorian"],
    source: "PHB",
    commonClasses: ["Consular", "Envoy", "Scholar"],
  },
  {
    id: "ishi-tib",
    name: "Ishi Tib",
    summary:
      "Require specialized life support out of water for extended periods",
    description:
      "Require specialized life support out of water for extended periods. Often possess a studious and thoughtful nature.",
    abilityScoreIncrease: {
      constitution: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Aquatic",
        description: "Breathe only water",
      },
      {
        name: "Amphibious Adaptation",
        description: "Can survive out of water for a limited time",
      },
      {
        name: "Natural Armor",
        description: "+1 AC",
      },
      {
        name: "Poisonous Skin",
        description: "Creatures that grapple you take 1d4 poison damage",
      },
    ],
    languages: ["Galactic Basic", "Tibese"],
    source: "UCSC",
    commonClasses: ["Scholar", "Engineer"],
  },
  {
    id: "jawa",
    name: "Jawa",
    summary:
      "Scavengers and traders known for their skills in repairing and modifying technology",
    description:
      "Scavengers and traders known for their skills in repairing and modifying technology. Their society is often secretive and focused on acquiring and trading salvaged goods.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Jury Rig",
        description: "Advantage on Technology checks to repair vehicles/droids",
      },
      {
        name: "Tinkerer",
        description: "Proficiency with tinker's tools",
      },
    ],
    languages: ["Galactic Basic", "Jawaese"],
    source: "PHB",
    commonClasses: ["Engineer", "Operative", "Scoundrel"],
  },
  {
    id: "kaleesh",
    name: "Kaleesh",
    summary:
      "Fierce and independent warriors with a strong sense of honor and tradition",
    description:
      "Fierce and independent warriors with a strong sense of honor and tradition. Their masked appearance is a cultural norm.",
    abilityScoreIncrease: {
      strength: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Weapons",
        description: "Claws deal 1d4 slashing",
      },
      {
        name: "Hardy",
        description:
          "Advantage on Constitution saving throws against exhaustion",
      },
      {
        name: "Intimidation Proficiency",
        description: "Proficiency in Intimidation skill",
      },
    ],
    languages: ["Galactic Basic", "Kaleesh"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "kaminoan",
    name: "Kaminoan",
    summary:
      "Tall, elegant beings known for their cloning technology and scientific expertise",
    description:
      "Tall, elegant beings known for their cloning technology and scientific expertise. Their society values logic and precision.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Amphibious",
        description: "Breathe air and water",
      },
      {
        name: "Natural Grace",
        description: "Advantage on Dexterity (Acrobatics) checks",
      },
      {
        name: "Precise",
        description:
          "Advantage on Intelligence (Technology) checks to operate or repair complex devices",
      },
    ],
    languages: ["Galactic Basic", "Kaminoan"],
    source: "UCSC",
    commonClasses: ["Scholar", "Engineer"],
  },
  {
    id: "kel dor",
    name: "Kel Dor",
    summary:
      "Require special breathing masks when in oxygen-rich environments. Known for their strong connection to the Force and often possess a stoic and determined nature.",
    description:
      "Require special breathing masks when in oxygen-rich environments. Known for their strong connection to the Force and often possess a stoic and determined nature.",
    abilityScoreIncrease: {
      wisdom: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Darkvision",
        description: "60 ft.",
      },
      {
        name: "Amphibious",
        description: "Breathe air and water",
      },
      {
        name: "Kel Dor Resilience",
        description: "Advantage vs. extreme cold/high altitude",
      },
      {
        name: "Pressure Adaptation",
        description: "Adapted to high altitudes",
      },
    ],
    languages: ["Galactic Basic", "Kel Dorian"],
    source: "PHB",
    commonClasses: ["Consular", "Sentinel", "Guardian"],
  },
  {
    id: "kel dor, moomin",
    name: "Kel Dor, Moomin",
    summary:
      "Share many traits with standard Kel Dor but with a stronger emphasis on resilience and mental fortitude.",
    description:
      "Distinguished by slightly different facial structures and cultural nuances from standard Kel Dor. Share many traits with standard Kel Dor but with a stronger emphasis on resilience and mental fortitude.",
    abilityScoreIncrease: {
      wisdom: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Moomin Heritage",
        description:
          "Advantage on Wisdom saving throws against mind-altering effects",
      },
      {
        name: "Vacuum Adaptation",
        description: "Can breathe in a vacuum",
      },
      {
        name: "Pressure Adaptation",
        description: "Adapted to high altitudes",
      },
    ],
    languages: ["Galactic Basic", "Kel Dorian"],
    source: "UCSC",
    commonClasses: ["Consular", "Sentinel"],
  },
  {
    id: "kubaz",
    name: "Kubaz",
    summary:
      "Insectoid species known for their tracking abilities and sensitivity to bright light",
    description:
      "Insectoid species known for their tracking abilities and sensitivity to bright light. Often employed as spies or bounty hunters.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Keen Senses",
        description: "Advantage on Wisdom (Perception) checks",
      },
      {
        name: "Photoreceptor Vulnerability",
        description:
          "Disadvantage on saving throws against bright light sources",
      },
    ],
    languages: ["Galactic Basic", "Kubaz"],
    source: "UCSC",
    commonClasses: ["Operative", "Scout"],
  },
  {
    id: "kyuzo",
    name: "Kyuzo",
    summary:
      "Rugged and independent survivalists known for their martial prowess and adaptability to harsh environments",
    description:
      "Rugged and independent survivalists known for their martial prowess and adaptability to harsh environments.",
    abilityScoreIncrease: {
      dexterity: 2,
      strength: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Hardy Traveler",
        description: "Advantage vs. extreme heat/cold Constitution saves",
      },
      {
        name: "Natural Acrobat",
        description: "Acrobatics proficiency",
      },
      {
        name: "Unarmed Expertise",
        description: "Unarmed strikes deal 1d6 bludgeoning damage",
      },
    ],
    languages: ["Galactic Basic", "Kyuzo"],
    source: "UCSC",
    commonClasses: ["Warrior", "Scout"],
  },
  {
    id: "lannik",
    name: "Lannik",
    summary:
      "Small and agile, often possessing a strong sense of community and resourcefulness",
    description:
      "Small and agile, often possessing a strong sense of community and resourcefulness. Their agility makes them adept at evasion.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Nimble",
        description: "Advantage on Dexterity saving throws",
      },
      {
        name: "Resourceful",
        description:
          "Proficiency in one of the following: Investigation, Survival, or Technology",
      },
    ],
    languages: ["Galactic Basic", "Lannik"],
    source: "UCSC",
    commonClasses: ["Scout", "Operative"],
  },
  {
    id: "lasat",
    name: "Lasat",
    summary: "Agile and powerful warriors with distinctive physical features",
    description:
      "Agile and powerful warriors with distinctive physical features. Their prehensile feet provide unique advantages.",
    abilityScoreIncrease: {
      strength: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: {
      walk: 35,
      leap: 15,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Lasat Agility",
        description:
          "Advantage on Dexterity (Acrobatics) checks and Dexterity saving throws",
      },
      {
        name: "Prehensile Feet",
        description: "Can use feet to manipulate objects",
      },
      {
        name: "Powerful Leap",
        description: "Standing leap up to 15 feet",
      },
    ],
    languages: ["Galactic Basic", "Lasat"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "lurmen",
    name: "Lurmen",
    summary: "Generally peaceful and connected to nature",
    description:
      "Generally peaceful and connected to nature. Their camouflage abilities aid in avoiding conflict.",
    abilityScoreIncrease: {
      wisdom: 2,
      dexterity: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Natural Camouflage",
        description: "Advantage on Stealth checks in natural environments",
      },
      {
        name: "Pacifistic Nature",
        description: "Disadvantage on attack rolls with non-improvised weapons",
      },
    ],
    languages: ["Galactic Basic", "Lurmen"],
    source: "UCSC",
    commonClasses: ["Consular", "Scout"],
  },
  {
    id: "miralan",
    name: "Miralan",
    summary:
      "Often possess a strong connection to the Force and tend to be intuitive and perceptive",
    description:
      "Often possess a strong connection to the Force and tend to be intuitive and perceptive. Their lack of visible eyes is a defining trait.",
    abilityScoreIncrease: {
      wisdom: 2,
      charisma: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal (Force Sense)",
    },
    traits: [
      {
        name: "Connection to the Force",
        description: "Advantage on Wisdom saving throws",
      },
      {
        name: "Intuitive",
        description:
          "Proficiency in one of the following: Insight or Perception",
      },
    ],
    languages: ["Galactic Basic", "Miralanese"],
    source: "UCSC",
    commonClasses: ["Consular", "Sentinel"],
  },
  {
    id: "mirialan",
    name: "Mirialan",
    summary:
      "Known for their spiritual traditions and the intricate tattoos that mark their life's achievements",
    description:
      "Known for their spiritual traditions and the intricate tattoos that mark their life's achievements. Often possess a disciplined and thoughtful nature.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Mirialan Resolve",
        description: "Advantage on Wisdom saving throws against being charmed",
      },
      {
        name: "Skillful",
        description: "Proficiency in one skill of your choice",
      },
    ],
    languages: ["Galactic Basic", "Miri"],
    source: "PHB",
    commonClasses: ["Sentinel", "Scout", "Consular"],
  },
  {
    id: "mon-calamari",
    name: "Mon Calamari",
    summary:
      "Known for their artistic talents, philosophical nature, and exceptional skills in aquatic engineering and naval strategy",
    description:
      "Known for their artistic talents, philosophical nature, and exceptional skills in aquatic engineering and naval strategy. Often possess a calm and diplomatic demeanor.",
    abilityScoreIncrease: {
      charisma: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Amphibious",
        description: "Breathe air and water",
      },
      {
        name: "Calm Under Pressure",
        description: "Advantage vs. frightened Wisdom saves",
      },
      {
        name: "Natural Swimmer",
        description: "Advantage on Athletics to swim",
      },
    ],
    languages: ["Galactic Basic", "Mon Calamarian"],
    source: "PHB",
    commonClasses: ["Envoy", "Engineer", "Consular"],
  },
  {
    id: "muun",
    name: "Muun",
    summary:
      "Elegant and highly intelligent beings known for their financial acumen and often involved in banking and commerce",
    description:
      "Elegant and highly intelligent beings known for their financial acumen and often involved in banking and commerce. Their telepathic abilities aid in communication.",
    abilityScoreIncrease: {
      intelligence: 2,
      charisma: 1,
    },
    size: "Tall, Thin",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Analytical Mind",
        description:
          "Advantage on Intelligence (Investigation) and Intelligence (Technology) checks",
      },
      {
        name: "Telepathic Proficiency",
        description: "Proficiency in the Telepathy skill",
      },
    ],
    languages: ["Galactic Basic", "Muun"],
    source: "UCSC",
    commonClasses: ["Scholar", "Envoy"],
  },
  {
    id: "nagai",
    name: "Nagai",
    summary: "Mysterious and often seen as shadowy figures",
    description:
      "Mysterious and often seen as shadowy figures. Their agility and stealth make them formidable assassins or spies.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Natural Acrobat",
        description: "Acrobatics proficiency",
      },
      {
        name: "Silent Hunter",
        description: "Advantage on Dexterity (Stealth) checks",
      },
    ],
    languages: ["Galactic Basic", "Nagai"],
    source: "UCSC",
    commonClasses: ["Operative", "Sentinel"],
  },
  {
    id: "nautolan",
    name: "Nautolan",
    summary:
      "Possess a strong connection to the water and often have a calm and perceptive nature",
    description:
      "Possess a strong connection to the water and often have a calm and perceptive nature. Their tentacles provide them with unique manipulative abilities.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      swim: 30,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Amphibious",
        description: "Breathe air and water",
      },
      {
        name: "Nautolan Resilience",
        description: "Advantage vs. poison/disease",
      },
      {
        name: "Tentacles",
        description: "Grapple with bonus action",
      },
    ],
    languages: ["Galactic Basic", "Nautila"],
    source: "PHB",
    commonClasses: ["Scout", "Consular", "Operative"],
  },
  {
    id: "neimoidian",
    name: "Neimoidian",
    summary: "Often seen as cowardly and motivated by profit",
    description:
      "Often seen as cowardly and motivated by profit. Their society has a strong hierarchical structure.",
    abilityScoreIncrease: {
      intelligence: 2,
      charisma: -2,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
      range: 60,
    },
    traits: [
      {
        name: "Darkvision",
        description:
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
      },
      {
        name: "Weak Constitution",
        description: "-1 maximum hit points per level",
      },
      {
        name: "Wealthy Upbringing",
        description:
          "Proficiency in one of the following: Deception, Persuasion, or Insight",
      },
    ],
    languages: ["Galactic Basic", "Neimoidian"],
    source: "PHB",
    commonClasses: ["Envoy", "Engineer"],
  },
  {
    id: "nikto",
    name: "Nikto",
    summary: "Often tribal and known for their hardiness and physical strength",
    description:
      "Often tribal and known for their hardiness and physical strength. Different sub-species can have varying cultural practices.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Hardy",
        description: "Advantage on Constitution saving throws",
      },
      {
        name: "Natural Weapons",
        description:
          "Choose one: Claws (1d4 slashing) or Horns (1d4 bludgeoning)",
      },
    ],
    languages: ["Galactic Basic", "Nikto"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "nogri",
    name: "Nogri",
    summary:
      "Small, agile, and stealthy, often employed as assassins or bodyguards",
    description:
      "Small, agile, and stealthy, often employed as assassins or bodyguards. Their poisonous barbs make them dangerous in close combat.",
    abilityScoreIncrease: {
      dexterity: 2,
      wisdom: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
      climb: 25,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Natural Stealth",
        description: "Stealth proficiency",
      },
      {
        name: "Poisonous Barbs",
        description: "Unarmed strikes deal 1d4 piercing and 1d4 poison damage",
      },
      {
        name: "Wall Clinger",
        description: "Climbing speed equals walking speed",
      },
    ],
    languages: ["Galactic Basic", "Nogrish"],
    source: "UCSC",
    commonClasses: ["Operative", "Sentinel"],
  },
  {
    id: "pau'an",
    name: "Pau'an",
    summary: "Tall and thin",
    description: "Tall and thin",
    abilityScoreIncrease: {
      charisma: 2,
      intelligence: 1,
    },
    size: "Tall, Thin",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Long Limbs",
        description: "+5 ft. reach with unarmed strikes",
      },
    ],
    languages: ["Galactic Basic"],
    source: "UCSC",
  },
  {
    id: "quermian",
    name: "Quermian",
    summary:
      "Tall, intellectual beings with two brains, granting them enhanced cognitive abilities",
    description:
      "Tall, intellectual beings with two brains, granting them enhanced cognitive abilities. Their telepathic abilities aid in communication.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1,
    },
    size: "Tall",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Dual Brains",
        description: "Advantage vs. charmed/frightened",
      },
      {
        name: "Keen Intellect",
        description: "Investigation proficiency",
      },
      {
        name: "Telepathic Communication",
        description:
          "Can communicate telepathically with one willing creature within 30 feet",
      },
    ],
    languages: ["Galactic Basic", "Quermian"],
    source: "UCSC",
    commonClasses: ["Scholar", "Consular"],
  },
  {
    id: "rakatan",
    name: "Rakatan",
    summary:
      "Ancient and powerful Force-sensitive species with a history of a vast empire",
    description:
      "Ancient and powerful Force-sensitive species with a history of a vast empire. Sub-species with varying degrees of Force sensitivity and physical characteristics. Often possess a strong connection to technology and the dark side of the Force.",
    abilityScoreIncrease: {
      charisma: 2,
      "any one": 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Force Sensitivity",
        description: "Advantage on Wisdom saves vs. mind-altering effects",
      },
      {
        name: "Infinite Empire Heritage",
        description: "Proficiency in Arcana, History, or Technology",
      },
      {
        name: "Rakatan Telekinesis",
        description: "Can move small objects with their mind",
      },
    ],
    languages: ["Galactic Basic", "Rakatan"],
    source: "UCSC",
    commonClasses: ["Sentinel", "Consular"],
  },
  {
    id: "rattataki",
    name: "Rattataki",
    summary: "Fierce and resilient warriors from a harsh desert world",
    description:
      "Fierce and resilient warriors from a harsh desert world. Often possess a brutal and survival-oriented culture.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Hardy",
        description: "Advantage on Constitution saving throws",
      },
      {
        name: "Savage Attacks",
        description: "Extra damage die on melee critical hits",
      },
    ],
    languages: ["Galactic Basic", "Rattataki"],
    source: "UCSC",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "rodian",
    name: "Rodian",
    summary:
      "Known for their hunting prowess and often seen as skilled trackers and bounty hunters",
    description:
      "Known for their hunting prowess and often seen as skilled trackers and bounty hunters. Their society can be competitive and focused on the hunt.",
    abilityScoreIncrease: {
      dexterity: 2,
      constitution: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Hunter's Instinct",
        description: "Survival proficiency",
      },
      {
        name: "Nimble Escape",
        description: "Move up to speed as reaction when attacked within 5 ft.",
      },
    ],
    languages: ["Galactic Basic", "Rodian"],
    source: "PHB",
    commonClasses: ["Operative", "Scout", "Warrior"],
  },
  {
    id: "selonians",
    name: "Selonians",
    summary: "Agile and cooperative, often living in close-knit communities",
    description:
      "Agile and cooperative, often living in close-knit communities. Their keen sense of smell aids in tracking and social interaction.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 35,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Keen Smell",
        description: "Advantage on Perception (smell)",
      },
      {
        name: "Pack Tactics",
        description:
          "Advantage on attack rolls against a creature if at least one of your allies is within 5 feet of the creature and isn't incapacitated",
      },
    ],
    languages: ["Galactic Basic", "Selon"],
    source: "UCSC",
    commonClasses: ["Operative", "Scout"],
  },
  {
    id: "sith pureblood",
    name: "Sith Pureblood",
    summary:
      "Descendants of the ancient Sith, often possessing a natural affinity for the dark side of the Force",
    description:
      "Descendants of the ancient Sith, often possessing a natural affinity for the dark side of the Force. Their society values power and dominance. Variations in skin pigmentation and facial markings",
    abilityScoreIncrease: {
      charisma: 2,
      "strength or dexterity": 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Force Sensitivity",
        description: "Advantage vs. effects sensing emotions/reading thoughts",
      },
      {
        name: "Sith Heritage",
        description: "Proficiency in Intimidation or Persuasion",
      },
    ],
    languages: ["Galactic Basic", "Sith"],
    source: "PHB",
    commonClasses: ["Sentinel", "Guardian", "Consular"],
  },
  {
    id: "squib",
    name: "Squib",
    summary:
      "Small and resourceful scavengers and traders, similar to Jawas but often more opportunistic",
    description:
      "Small and resourceful scavengers and traders, similar to Jawas but often more opportunistic. Known for their tinkering skills.",
    abilityScoreIncrease: {
      dexterity: 2,
      intelligence: 1,
    },
    size: "Small",
    speed: {
      walk: 25,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Nimble Escape",
        description: "Disengage as a bonus action",
      },
      {
        name: "Tinkerer",
        description: "Proficiency with tinker's tools",
      },
    ],
    languages: ["Galactic Basic", "Squib"],
    source: "UCSC",
    commonClasses: ["Engineer", "Scoundrel"],
  },
  {
    id: "togruta",
    name: "Togruta",
    summary:
      "Possess a strong connection to the Force and often exhibit a vibrant and communal culture",
    description:
      "Possess a strong connection to the Force and often exhibit a vibrant and communal culture. Their montrals and lekku are sensory organs.",
    abilityScoreIncrease: {
      wisdom: 2,
      "strength or dexterity": 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Montrals and Lekku",
        description: "Advantage on Perception (hearing/vibrations)",
      },
      {
        name: "Togruta Senses",
        description: "Proficiency in Perception or Survival",
      },
    ],
    languages: ["Galactic Basic", "Togruti"],
    source: "PHB",
    commonClasses: ["Consular", "Guardian", "Scout"],
  },
  {
    id: "trandoshan",
    name: "Trandoshan",
    summary:
      "Reptilian humanoids known for their hunting skills and the 'Scorekeeper' system",
    description:
      "Reptilian humanoids known for their hunting skills and the 'Scorekeeper' system. Often seen as formidable warriors and bounty hunters.",
    abilityScoreIncrease: {
      strength: 2,
      wisdom: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Natural Armor",
        description: "+1 AC",
      },
      {
        name: "Regeneration",
        description: "Regain 1 HP/turn if at least 1 HP",
      },
      {
        name: "Trandoshan Claws",
        description: "1d6 slashing",
      },
    ],
    languages: ["Galactic Basic", "Trandoshan"],
    source: "PHB",
    commonClasses: ["Warrior", "Guardian", "Operative"],
  },
  {
    id: "twilek",
    name: "Twilek",
    summary:
      "Known for their grace, charm, and often their roles in entertainment or diplomacy",
    description:
      "Known for their grace, charm, and often their roles in entertainment or diplomacy. Their lekku are a significant part of their communication and culture. Numerous color variations indicating heritage (Red, Blue, Green, Yellow, etc.)",
    abilityScoreIncrease: {
      charisma: 2,
      "any one": 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Darkvision",
    },
    traits: [
      {
        name: "Lekku",
        description:
          "Advantage on Wisdom (Insight) and Charisma (Persuasion) checks",
      },
      {
        name: "Twilek Grace",
        description: "Proficiency in the Acrobatics skill",
      },
    ],
    languages: ["Galactic Basic", "Twileki"],
    source: "PHB",
    commonClasses: ["Envoy", "Scoundrel", "Consular"],
  },
  {
    id: "verpine",
    name: "Verpine",
    summary:
      "Insectoid species known for their engineering skills and communal society",
    description:
      "Insectoid species known for their engineering skills and communal society. Their compound eyes provide excellent vision, and antennae aid in awareness.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
      climb: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Compound Eyes",
        description: "Advantage on Wisdom (Perception) checks relying on sight",
      },
      {
        name: "Natural Climber",
        description: "Climbing speed equals walking speed",
      },
      {
        name: "Antennae",
        description: "Advantage on saving throws against being surprised",
      },
    ],
    languages: ["Galactic Basic", "Verpine"],
    source: "UCSC",
    commonClasses: ["Engineer", "Scholar"],
  },
  {
    id: "voss",
    name: "Voss",
    summary: "Highly spiritual and connected to the Living Force",
    description:
      "Highly spiritual and connected to the Living Force. Their society is often divided between mystics and commandos. Voss Mystics, Voss Commandos (cultural/role-based variations)",
    abilityScoreIncrease: {
      wisdom: 2,
      intelligence: 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Voss Mystic",
        description: "Advantage on saving throws against Force powers",
      },
      {
        name: "Trance",
        description:
          "Can enter a meditative trance for 4 hours to gain the benefits of a long rest",
      },
    ],
    languages: ["Galactic Basic", "Voss"],
    source: "UCSC",
    commonClasses: ["Consular", "Sentinel"],
  },
  {
    id: "weequay",
    name: "Weequay",
    summary:
      "Often tribal and known for their resilience and connection to their desert homeworld",
    description:
      "Often tribal and known for their resilience and connection to their desert homeworld. Can be seen as gruff or unsophisticated by outsiders.",
    abilityScoreIncrease: {
      strength: 2,
      wisdom: -2,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Hardy",
        description: "Advantage on Constitution saving throws",
      },
      {
        name: "Natural Weapons",
        description: "Unarmed strikes deal 1d4 bludgeoning",
      },
      {
        name: "Primitive",
        description:
          "Proficiency in one of the following: Animal Handling, Survival, or Athletics",
      },
    ],
    languages: ["Galactic Basic", "Weequay"],
    source: "PHB",
    commonClasses: ["Warrior", "Guardian"],
  },
  {
    id: "whiphid",
    name: "Whiphid",
    summary:
      "Large, fur-covered humanoids known for their strength and tracking abilities",
    description:
      "Large, fur-covered humanoids known for their strength and tracking abilities. Their keen sense of smell is a significant asset.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1,
    },
    size: "Large",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Keen Smell",
        description: "Advantage on Perception (smell)",
      },
      {
        name: "Powerful Build",
        description: "as Droid V",
      },
      {
        name: "Thick Hide",
        description: "+1 Natural Armor",
      },
    ],
    languages: ["Galactic Basic", "Whiphid"],
    source: "UCSC",
    commonClasses: ["Warrior", "Scout"],
  },
  {
    id: "zabrak",
    name: "Zabrak",
    summary:
      "Known for their distinctive horns and often possess a strong will and independent spirit",
    description:
      "Known for their distinctive horns and often possess a strong will and independent spirit. Different homeworlds can lead to cultural variations. Dathomirian Zabrak (often more agile and stealthy), Iridonian Zabrak (more balanced)",
    abilityScoreIncrease: {
      "any two": 1,
      "or one": 2,
      "and one": 1,
    },
    size: "Medium",
    speed: {
      walk: 30,
    },
    vision: {
      type: "Normal",
    },
    traits: [
      {
        name: "Dathomirian Toughness",
        description: "+1 maximum hit points per level",
      },
      {
        name: "Zabrak Ferocity",
        description:
          "Once per short or long rest, when you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead",
      },
    ],
    languages: ["Galactic Basic", "Zabrak"],
    source: "PHB",
    commonClasses: ["Any"],
  },
];
