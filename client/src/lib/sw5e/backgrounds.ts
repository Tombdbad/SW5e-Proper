export interface Background {
  id: string;
  name: string;
  summary: string;
  skillProficiencies: string[];
  feature: string;
  suggestedCharacteristics: string[];
}

export const backgrounds: Background[] = [
  {
    id: "acolyte",
    name: "Acolyte",
    summary: "You have spent your life in devotion to a Force tradition or religious organization.",
    skillProficiencies: ["Insight", "Lore"],
    feature: "Spiritual Guidance: You can find a place of worship where you and your allies can rest, and may receive free healing and care.",
    suggestedCharacteristics: [
      "I seek to preserve ancient knowledge and traditions.",
      "I believe in a greater purpose guiding the galaxy.",
      "I am tolerant of other faiths and respect the devotion of others."
    ]
  },
  {
    id: "bounty_hunter",
    name: "Bounty Hunter",
    summary: "You are a professional tracker who hunts targets for credits across the galaxy.",
    skillProficiencies: ["Investigation", "Survival"],
    feature: "Bounty Board: You have contacts who can provide information about potential bounties and targets.",
    suggestedCharacteristics: [
      "I always get my target, no matter how long it takes.",
      "I've seen too much cruelty to believe in mercy.",
      "I honor my contracts to the letter."
    ]
  },
  {
    id: "criminal",
    name: "Criminal",
    summary: "You have a history of breaking the law and living outside society's rules.",
    skillProficiencies: ["Deception", "Stealth"],
    feature: "Criminal Contact: You have a reliable contact who acts as your connection to a criminal network.",
    suggestedCharacteristics: [
      "I always have a plan for when things go wrong.",
      "I am suspicious of strangers, especially authority figures.",
      "I believe everyone has a price, and everyone can be bought."
    ]
  },
  {
    id: "entertainer",
    name: "Entertainer",
    summary: "You thrive in front of an audience, entertaining crowds across the galaxy.",
    skillProficiencies: ["Acrobatics", "Performance"],
    feature: "Popular Performer: You can find a place to perform and earn a modest living, or even get free accommodation in return for performing.",
    suggestedCharacteristics: [
      "I love the spotlight and seize any opportunity to perform.",
      "I've seen the galaxy through my travels and performances.",
      "I use humor to defuse tense situations."
    ]
  },
  {
    id: "force_adept",
    name: "Force Adept",
    summary: "You were raised in a Force tradition outside mainstream Jedi or Sith teachings.",
    skillProficiencies: ["Insight", "Nature"],
    feature: "Force Sensitivity: You can sense the Force and have had some basic training in its use.",
    suggestedCharacteristics: [
      "I believe the Force connects all living things in the galaxy.",
      "I meditate daily to maintain my connection to the Force.",
      "I seek to understand the deeper mysteries of the Force."
    ]
  },
  {
    id: "military_specialist",
    name: "Military Specialist",
    summary: "You served in a military organization, learning discipline and combat tactics.",
    skillProficiencies: ["Athletics", "Intimidation"],
    feature: "Military Rank: You still hold your rank from your military service, and soldiers still recognize your authority.",
    suggestedCharacteristics: [
      "I follow orders without question, even when uncomfortable.",
      "I protect those under my command at all costs.",
      "I believe in a strict chain of command and clear objectives."
    ]
  },
  {
    id: "noble",
    name: "Noble",
    summary: "You were born into wealth and privilege, raised in the upper echelons of society.",
    skillProficiencies: ["History", "Persuasion"],
    feature: "Privileged Upbringing: Your family name grants you access to high society and influential circles.",
    suggestedCharacteristics: [
      "I speak elegantly and expect to be heard.",
      "I believe my noble lineage sets me apart from common people.",
      "I feel responsible for the well-being of those beneath my station."
    ]
  },
  {
    id: "pilot",
    name: "Pilot",
    summary: "You've spent your life navigating the stars and mastering various spacecraft.",
    skillProficiencies: ["Mechanics", "Piloting"],
    feature: "Ship Savvy: You can acquire temporary transport for your group more easily than others.",
    suggestedCharacteristics: [
      "I feel more at home in a cockpit than anywhere else.",
      "I judge people by how they treat their ships.",
      "I've been in tight spots before and know how to escape seemingly impossible situations."
    ]
  },
  {
    id: "scholar",
    name: "Scholar",
    summary: "You've dedicated your life to learning and have studied extensively in various fields.",
    skillProficiencies: ["Science", "Technology"],
    feature: "Academic Connection: You have access to libraries and academic institutions across the galaxy.",
    suggestedCharacteristics: [
      "I use complex words and concepts when simple ones would suffice.",
      "I value knowledge above all else.",
      "I believe every problem has a logical solution if approached correctly."
    ]
  },
  {
    id: "smuggler",
    name: "Smuggler",
    summary: "You've made your living transporting illegal or regulated goods across the galaxy.",
    skillProficiencies: ["Deception", "Piloting"],
    feature: "Underworld Connections: You know how to find buyers and sellers for hard-to-obtain items.",
    suggestedCharacteristics: [
      "I trust my ship more than I trust most people.",
      "I'm always looking for the most profitable opportunity.",
      "I have a knack for finding hidden compartments and secret routes."
    ]
  }
];
