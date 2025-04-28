export interface Class {
  id: string;
  name: string;
  summary: string;
  hitDie: number;
  primaryAbility: string;
  savingThrows: string[];
  skills: string[];
  startingEquipment?: string[];
  features?: Record<number, string[]>;
}

export const classes: Class[] = [
  {
    id: "berserker",
    name: "Berserker",
    summary: "Fierce warriors who channel their inner fury into devastating attacks.",
    hitDie: 12,
    primaryAbility: "Strength",
    savingThrows: ["Strength", "Constitution"],
    skills: ["Athletics", "Intimidation", "Perception", "Survival"],
    features: {
      1: ["Rage", "Unarmored Defense"],
      2: ["Reckless Attack", "Danger Sense"],
      3: ["Form Path", "Brutish Durability"]
    }
  },
  {
    id: "consular",
    name: "Consular",
    summary: "Force wielders who specialize in manipulating the Force to their will.",
    hitDie: 6,
    primaryAbility: "Wisdom or Charisma",
    savingThrows: ["Wisdom", "Charisma"],
    skills: ["History", "Insight", "Medicine", "Persuasion", "Science"],
    features: {
      1: ["Forcecasting", "Force Recovery"],
      2: ["Force-Empowered Self", "Force Affinity"],
      3: ["Force Tradition", "Force-Empowered Body"]
    }
  },
  {
    id: "engineer",
    name: "Engineer",
    summary: "Technical experts who use technological innovations to enhance their capabilities.",
    hitDie: 6,
    primaryAbility: "Intelligence",
    savingThrows: ["Constitution", "Intelligence"],
    skills: ["Investigation", "Mechanics", "Piloting", "Science", "Technology"],
    features: {
      1: ["Engineering Techniques", "Modification Specialist"],
      2: ["Tactical Advancements", "Tech-Enhanced Body"],
      3: ["Engineering Discipline", "Tech-Enhanced Mind"]
    }
  },
  {
    id: "fighter",
    name: "Fighter",
    summary: "Skilled warriors trained in combat tactics and weapon mastery.",
    hitDie: 10,
    primaryAbility: "Strength or Dexterity",
    savingThrows: ["Strength", "Constitution"],
    skills: ["Acrobatics", "Athletics", "Insight", "Intimidation", "Piloting", "Survival"],
    features: {
      1: ["Fighting Style", "Second Wind"],
      2: ["Action Surge", "Combat Superiority"],
      3: ["Martial Archetype", "Indomitable Will"]
    }
  },
  {
    id: "guardian",
    name: "Guardian",
    summary: "Force users who blend martial prowess with Force powers to protect others.",
    hitDie: 12,
    primaryAbility: "Strength or Dexterity",
    savingThrows: ["Strength", "Wisdom"],
    skills: ["Athletics", "Insight", "Intimidation", "Lore", "Nature", "Perception"],
    features: {
      1: ["Forcecasting", "Force-Empowered Strikes"],
      2: ["Fighting Style", "Force Channel"],
      3: ["Guardian Path", "Force Wellspring"]
    }
  },
  {
    id: "monk",
    name: "Monk",
    summary: "Masters of martial arts who harness their life energy to enhance their capabilities.",
    hitDie: 8,
    primaryAbility: "Dexterity & Wisdom",
    savingThrows: ["Strength", "Dexterity"],
    skills: ["Acrobatics", "Athletics", "Insight", "Stealth"],
    features: {
      1: ["Unarmored Defense", "Martial Arts"],
      2: ["Ki", "Unarmored Movement"],
      3: ["Monastic Tradition", "Deflect Missiles"]
    }
  },
  {
    id: "operative",
    name: "Operative",
    summary: "Stealthy specialists who excel at precision strikes and skillful expertise.",
    hitDie: 8,
    primaryAbility: "Dexterity",
    savingThrows: ["Dexterity", "Intelligence"],
    skills: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Persuasion", "Sleight of Hand", "Stealth"],
    features: {
      1: ["Expertise", "Sneak Attack", "Smuggler's Tricks"],
      2: ["Cunning Action", "Tactical Prowess"],
      3: ["Operative Practice", "Steady Aim"]
    }
  },
  {
    id: "scholar",
    name: "Scholar",
    summary: "Knowledge seekers who use their learning and adaptability to overcome challenges.",
    hitDie: 8,
    primaryAbility: "Intelligence",
    savingThrows: ["Intelligence", "Charisma"],
    skills: ["Deception", "History", "Insight", "Investigation", "Lore", "Medicine", "Nature", "Persuasion", "Science", "Technology"],
    features: {
      1: ["Expertise", "Knowledge Check", "Tactical Assessment"],
      2: ["Jack of All Trades", "Strategic Recovery"],
      3: ["Academic Pursuit", "Font of Knowledge"]
    }
  },
  {
    id: "sentinel",
    name: "Sentinel",
    summary: "Versatile Force users who blend stealth, combat, and Force abilities.",
    hitDie: 10,
    primaryAbility: "Dexterity & Wisdom or Charisma",
    savingThrows: ["Dexterity", "Charisma"],
    skills: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Persuasion", "Sleight of Hand", "Stealth"],
    features: {
      1: ["Forcecasting", "Twin Force Focus"],
      2: ["Fighting Style", "Focused Strikes"],
      3: ["Sentinel Path", "Heightened Awareness"]
    }
  }
];
