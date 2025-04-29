
// Abilities data for SW5E
export interface Ability {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  savingThrowDescription: string;
  skills: string[];
}

export const abilities: Ability[] = [
  {
    id: "strength",
    name: "Strength",
    abbreviation: "STR",
    description: "Measures physical power and carrying capacity",
    savingThrowDescription: "Resisting physical force, breaking free from restraints",
    skills: ["Athletics"]
  },
  {
    id: "dexterity",
    name: "Dexterity",
    abbreviation: "DEX",
    description: "Measures agility, reflexes, and balance",
    savingThrowDescription: "Dodging attacks, avoiding traps",
    skills: ["Acrobatics", "Sleight of Hand", "Stealth"]
  },
  {
    id: "constitution",
    name: "Constitution",
    abbreviation: "CON",
    description: "Measures endurance and stamina",
    savingThrowDescription: "Withstanding poison, disease, and harsh conditions",
    skills: []
  },
  {
    id: "intelligence",
    name: "Intelligence",
    abbreviation: "INT",
    description: "Measures reasoning and memory",
    savingThrowDescription: "Resisting mental attacks, recalling knowledge",
    skills: ["Investigation", "Lore", "Nature", "Technology"]
  },
  {
    id: "wisdom",
    name: "Wisdom",
    abbreviation: "WIS",
    description: "Measures perception and insight",
    savingThrowDescription: "Resisting Force powers, maintaining focus",
    skills: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"]
  },
  {
    id: "charisma",
    name: "Charisma",
    abbreviation: "CHA",
    description: "Measures force of personality",
    savingThrowDescription: "Resisting charm effects, maintaining morale",
    skills: ["Deception", "Intimidation", "Performance", "Persuasion"]
  }
];
