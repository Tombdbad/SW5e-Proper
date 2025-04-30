
// Export for UI usage
export const BACKGROUNDS = [
  { id: "force-adept", name: "Force Adept" },
  { id: "criminal", name: "Criminal" },
  { id: "soldier", name: "Soldier" },
  { id: "noble", name: "Noble" },
  { id: "scholar", name: "Scholar" },
  { id: "jedi", name: "Jedi" },
  { id: "sith", name: "Sith" },
  { id: "pilot", name: "Pilot" },
  { id: "merchant", name: "Merchant" }
];

// Backgrounds data for SW5E
export interface Background {
  id: string;
  name: string;
  summary: string;
  description: string;
  feature: string;
  featureDescription: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: number;
  equipment: string[];
  suggestedCharacteristics: string[];
}

export const backgrounds: Background[] = [
  {
    id: "ace-pilot",
    name: "Ace Pilot",
    summary: "You excel at operating starships and vehicles of all kinds.",
    description: "You've spent your life behind the controls of starships or vehicles. Whether military trained or self-taught, you're known for pulling off maneuvers others wouldn't attempt.",
    feature: "Well-Connected Mechanic",
    featureDescription: "You know mechanics and shipyards across the galaxy. When in need of repairs or modifications, you can find favorable prices and faster service.",
    skillProficiencies: ["Piloting", "Technology"],
    toolProficiencies: ["Astrogation tools", "One gaming set of your choice"],
    languages: 0,
    equipment: ["Flight suit", "Starship toolkit", "Datapad with starship schematics", "Pouch with 50 credits"],
    suggestedCharacteristics: [
      "I always push the engines beyond their limits",
      "I believe there's no problem that can't be solved with the right ship",
      "I never fly without my lucky charm"
    ]
  },
  {
    id: "bounty-hunter",
    name: "Bounty Hunter",
    summary: "You track and capture targets for payment across the galaxy.",
    description: "You make your living tracking down and capturing or eliminating targets for credits. You might be a guild member or a lone operator out for yourself.",
    feature: "Hunter's Intuition",
    featureDescription: "You can quickly gather information about your target from the criminal underworld and have contacts who provide leads on potential bounties.",
    skillProficiencies: ["Investigation", "Survival"],
    toolProficiencies: ["Slicing kit", "Tracking devices"],
    languages: 1,
    equipment: ["Set of binders", "Holographic wanted poster collection", "Bounty puck", "Pouch with 75 credits"],
    suggestedCharacteristics: [
      "I always get my target, no matter how long it takes",
      "I have a personal code about who I'll hunt and who I won't",
      "Credits are all that matter in this business"
    ]
  },
  {
    id: "diplomat",
    name: "Diplomat",
    summary: "You represent governments or organizations in official negotiations.",
    description: "You've been trained in the delicate art of negotiation, representing planetary systems or major organizations. You understand politics and protocols across cultures.",
    feature: "Diplomatic Immunity",
    featureDescription: "Your credentials can gain you access to restricted areas and potentially exempt you from minor legal troubles across many systems.",
    skillProficiencies: ["Deception", "Persuasion"],
    toolProficiencies: ["One musical instrument", "Calligrapher's supplies"],
    languages: 2,
    equipment: ["Fine clothes", "Diplomatic credentials", "Encrypted comlink", "Pouch with 100 credits"],
    suggestedCharacteristics: [
      "I always seek a peaceful solution first",
      "I can find common ground between the most bitter enemies",
      "I carefully analyze every word and gesture of those I interact with"
    ]
  },
  {
    id: "force-adept",
    name: "Force Adept",
    summary: "You were raised with knowledge of the Force outside traditional Jedi or Sith teachings.",
    description: "Raised in a tradition that acknowledges the Force by another name or method, you learned to sense and use its power without formal training from major orders.",
    feature: "Force Sensitive",
    featureDescription: "You can sense disturbances in the Force and can sometimes receive visions or insights others cannot perceive.",
    skillProficiencies: ["Insight", "Lore"],
    toolProficiencies: ["Herbalism kit"],
    languages: 1,
    equipment: ["Mystical trinket or talisman", "Loose-fitting robes", "Holoprojector with ancient teachings", "Pouch with 25 credits"],
    suggestedCharacteristics: [
      "I sense things before they happen",
      "I believe all living things are connected through the Force",
      "I speak in mystical terms that confuse others"
    ]
  },
  {
    id: "criminal",
    name: "Criminal",
    summary: "You've made your living through illegal activities.",
    description: "You've been involved in illegal operations for most of your life. Whether as a smuggler, slicer, or enforcer, you know how the criminal underworld operates.",
    feature: "Criminal Contact",
    featureDescription: "You have a reliable contact who acts as a connection to a network of criminals. You know how to get messages to and from this contact.",
    skillProficiencies: ["Deception", "Stealth"],
    toolProficiencies: ["Gaming set", "Thieves' tools"],
    languages: 0,
    equipment: ["Crowbar or holdout blaster", "Dark clothing with hood", "Stolen identity chip", "Pouch with 50 credits"],
    suggestedCharacteristics: [
      "I always have an escape plan ready",
      "I trust no one but myself",
      "I'm always looking for the next big score"
    ]
  },
  {
    id: "soldier",
    name: "Soldier",
    summary: "You served in a military or mercenary company.",
    description: "You've spent years in military service, whether for a planetary defense force, a galactic power, or a mercenary company. You're trained in tactics and survival.",
    feature: "Military Rank",
    featureDescription: "You hold a military rank from your previous service. Soldiers and veterans of that organization still recognize your authority and influence.",
    skillProficiencies: ["Athletics", "Intimidation"],
    toolProficiencies: ["Land vehicles", "One gaming set"],
    languages: 0,
    equipment: ["Insignia of rank", "Trophy from a battle", "Set of common clothes", "Pouch with 75 credits"],
    suggestedCharacteristics: [
      "I'm always at attention and follow orders without question",
      "I protect those who cannot protect themselves",
      "I've seen too much combat, and it sometimes haunts me"
    ]
  },
  {
    id: "noble",
    name: "Noble",
    summary: "You were born into wealth and privilege.",
    description: "You come from a family with wealth, power, and far-reaching connections. You might be a scion of an ancient house or newly elevated to prominence.",
    feature: "Position of Privilege",
    featureDescription: "Your family name and connections can secure you audiences with powerful figures and entry into high society across many systems.",
    skillProficiencies: ["History", "Persuasion"],
    toolProficiencies: ["One musical instrument", "One gaming set"],
    languages: 1,
    equipment: ["Fine clothes", "Family signet ring", "Scroll of family history", "Purse with 150 credits"],
    suggestedCharacteristics: [
      "My family legacy must be preserved at all costs",
      "I take great pains to always look my best and follow the latest fashions",
      "I believe the common folk must see in me the best of what nobility has to offer"
    ]
  },
  {
    id: "outsider",
    name: "Outsider",
    summary: "You come from a remote world with limited connection to galactic society.",
    description: "You were raised on a world that has little contact with the greater galaxy. Your home might be primitive, isolationist, or simply overlooked.",
    feature: "Uncanny Resourcefulness",
    featureDescription: "You can improvise tools and find creative solutions to problems using minimal resources, drawing on your experience from your isolated upbringing.",
    skillProficiencies: ["Nature", "Survival"],
    toolProficiencies: ["Artisan's tools", "Herbalism kit"],
    languages: 0,
    equipment: ["Staff or spear", "Hunting trap", "Token from your homeworld", "Pouch with 35 credits"],
    suggestedCharacteristics: [
      "I find technology fascinating and am always examining new devices",
      "I misunderstand social customs and often make faux pas",
      "I believe my people's ways are ultimately superior to those of the wider galaxy"
    ]
  }
];