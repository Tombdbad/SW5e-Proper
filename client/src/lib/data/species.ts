export interface SpeciesTraits {
  id: string;
  name: string;
  description: string;
  abilityScoreIncrease: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
    any?: number; // Number of ability score points that can be assigned freely
  };
  age: {
    maturity: number;
    lifespan: number;
  };
  alignment: string;
  size: "tiny" | "small" | "medium" | "large" | "huge";
  sizeDescription: string;
  speed: number;
  languages: string[];
  traits: {
    name: string;
    description: string;
  }[];
  variants?: {
    id: string;
    name: string;
    description: string;
    abilityScoreChange?: {
      strength?: number;
      dexterity?: number;
      constitution?: number;
      intelligence?: number;
      wisdom?: number;
      charisma?: number;
      any?: number;
    };
    traits?: {
      name: string;
      description: string;
    }[];
  }[];
  image?: string;
}

export const species: SpeciesTraits[] = [
  {
    id: "bothan",
    name: "Bothan",
    description: "Bothans are furry humanoids from Bothawui known for their political acumen and skills as information brokers. They had a significant role in the Galactic Civil War, providing the Alliance with the location of the second Death Star.",
    abilityScoreIncrease: {
      dexterity: 2,
      charisma: 1
    },
    age: {
      maturity: 18,
      lifespan: 85
    },
    alignment: "Bothans tend toward chaotic alignments, prizing freedom and individuality. Their loyalty often lies with their own ambitions.",
    size: "medium",
    sizeDescription: "Bothans stand between 5 and 6 feet tall and generally weigh between 120 and 150 pounds. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "Bothese"],
    traits: [
      {
        name: "Keen Senses",
        description: "You have proficiency in the Perception skill."
      },
      {
        name: "Natural Spy",
        description: "You have proficiency in the Deception skill. Additionally, when you make a Dexterity (Stealth) check while moving no more than half your speed, you can make the check with advantage."
      },
      {
        name: "Persuasion Expert",
        description: "Whenever you make a Charisma (Persuasion) check, you can treat a d20 roll of 5 or lower as a 6."
      }
    ]
  },
  {
    id: "cerean",
    name: "Cerean",
    description: "Cereans are a sophisticated, humanoid species from Cerea with binary brains capable of exceptional information processing and multitasking. Their binary brains, housed in their enlarged skulls, allow them to focus on multiple ideas simultaneously.",
    abilityScoreIncrease: {
      intelligence: 2,
      wisdom: 1
    },
    age: {
      maturity: 18,
      lifespan: 90
    },
    alignment: "Cereans are naturally contemplative and methodical, so they tend toward lawful alignments. Their beliefs in coexistence lead them toward good ones.",
    size: "medium",
    sizeDescription: "Cereans are slightly taller than humans on average, standing between 6 and 6 and a half feet tall and generally weighing between 140 and 180 pounds. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "Cerean"],
    traits: [
      {
        name: "Binary Brain",
        description: "You have advantage on Intelligence saving throws against being charmed, and magic can't put you to sleep."
      },
      {
        name: "Dual-Minded",
        description: "You can focus on two different tasks at once. When you use your action to cast a power, you can use your bonus action to take the Use an Object action."
      },
      {
        name: "Cerean Education",
        description: "You are proficient in the Lore skill."
      }
    ]
  },
  {
    id: "chiss",
    name: "Chiss",
    description: "Chiss are a blue-skinned, red-eyed, near-human species from the planet Csilla. They are known for their exceptional strategic and tactical minds, forming the powerful but secretive Chiss Ascendancy in the Unknown Regions.",
    abilityScoreIncrease: {
      intelligence: 2,
      dexterity: 1
    },
    age: {
      maturity: 18,
      lifespan: 80
    },
    alignment: "Chiss tend toward lawful alignments, with a strong emphasis on order and discipline. However, they can be found across the moral spectrum from good to evil.",
    size: "medium",
    sizeDescription: "Chiss have builds similar to humans, standing between 5 and 6 feet tall and weighing between 130 and 180 pounds. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "Cheunh"],
    traits: [
      {
        name: "Superior Darkvision",
        description: "You can see in dim light within 120 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray."
      },
      {
        name: "Cold Adaptation",
        description: "You have resistance to cold damage."
      },
      {
        name: "Tactical Mind",
        description: "You gain proficiency in your choice of one of the following skills: Investigation, Perception, or Insight."
      }
    ]
  },
  {
    id: "human",
    name: "Human",
    description: "Humans are the most numerous and politically dominant species in the galaxy, with physical variations determined by their planet of origin. Their adaptability and ambition have allowed them to thrive across countless worlds.",
    abilityScoreIncrease: {
      any: 2
    },
    age: {
      maturity: 18,
      lifespan: 80
    },
    alignment: "Humans tend toward no particular alignment. The best and the worst are found among them.",
    size: "medium",
    sizeDescription: "Humans vary widely in height and build, from barely 5 feet to well over 6 feet tall. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "One extra language of your choice"],
    traits: [
      {
        name: "Versatile",
        description: "You gain proficiency in one skill of your choice."
      },
      {
        name: "Ambition",
        description: "You gain one feat of your choice."
      }
    ]
  },
  {
    id: "twi_lek",
    name: "Twi'lek",
    description: "Twi'leks are a colorful species known for their distinctive head tails (lekku) that contain parts of their brain. Coming from Ryloth, they can be found throughout the galaxy as everything from politicians to dancers to crime lords.",
    abilityScoreIncrease: {
      charisma: 2,
      dexterity: 1
    },
    age: {
      maturity: 16,
      lifespan: 80
    },
    alignment: "Twi'leks can have any alignment, though those who survive by their wits rather than strength or force of personality tend toward chaotic alignments.",
    size: "medium",
    sizeDescription: "Twi'leks are similar in build to humans, ranging from 5 to over 6 feet tall. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "Ryl"],
    traits: [
      {
        name: "Beguiling Presence",
        description: "You have proficiency in the Persuasion skill."
      },
      {
        name: "Silent Communication",
        description: "Through subtle motions of your lekku, you can communicate silently with other Twi'leks within 30 feet."
      },
      {
        name: "Heat Resistance",
        description: "You have resistance to fire damage."
      }
    ],
    variants: [
      {
        id: "lethan",
        name: "Lethan",
        description: "Rare red-skinned Twi'leks known for their striking appearance.",
        abilityScoreChange: {
          charisma: 1,
          constitution: -1
        },
        traits: [
          {
            name: "Fascinating Presence",
            description: "You have advantage on Performance checks to captivate an audience."
          }
        ]
      },
      {
        id: "rutian",
        name: "Rutian",
        description: "Blue-skinned Twi'leks known for their adaptability.",
        traits: [
          {
            name: "Heightened Reflex",
            description: "When you make a Dexterity saving throw, you can use your reaction to gain advantage on the roll."
          }
        ]
      }
    ]
  },
  {
    id: "wookiee",
    name: "Wookiee",
    description: "Wookiees are tall, hairy bipeds from the forested planet Kashyyyk. Despite their fearsome appearance, they are intelligent, loyal, and skilled technicians and warriors with a rich culture based on honor.",
    abilityScoreIncrease: {
      strength: 2,
      constitution: 1
    },
    age: {
      maturity: 18,
      lifespan: 400
    },
    alignment: "Wookiees are typically good, with those who travel the galaxy tending toward neutrality and those who remain in their homelands tending toward lawfulness.",
    size: "medium",
    sizeDescription: "Wookiees are between 7 and 8 feet tall and weigh between 250 and 350 pounds. Your size is Medium.",
    speed: 30,
    languages: ["Galactic Basic", "Shyriiwook"],
    traits: [
      {
        name: "Climbing",
        description: "You have a climbing speed of 30 feet."
      },
      {
        name: "Natural Weapon",
        description: "You can use your claws to make unarmed strikes. When you hit with them, you deal slashing damage equal to 1d4 + your Strength modifier, instead of the bludgeoning damage normal for an unarmed strike."
      },
      {
        name: "Wookiee Rage",
        description: "When you take damage, you can use your reaction to gain advantage on Strength checks and Strength saving throws, and you gain temporary hit points equal to your Constitution modifier + your level. This effect lasts for 1 minute. Once you use this feature, you cannot use it again until you complete a long rest."
      },
      {
        name: "Technological Aptitude",
        description: "You have proficiency with Technology and Engineering."
      }
    ]
  }
];
