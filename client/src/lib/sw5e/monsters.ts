
// Monsters/Creatures data for SW5E
export interface Monster {
  id: string;
  name: string;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  type: string;
  alignment: string;
  armorClass: number;
  hitPoints: number;
  speed: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
  };
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  savingThrows?: {
    [key: string]: number;
  };
  skills?: {
    [key: string]: number;
  };
  damageResistances?: string[];
  damageImmunities?: string[];
  conditionImmunities?: string[];
  senses: {
    [key: string]: number;
    passivePerception: number;
  };
  languages: string[];
  challengeRating: number;
  abilities: {
    name: string;
    description: string;
  }[];
  actions: {
    name: string;
    description: string;
    attackBonus?: number;
    damage?: string;
    damageType?: string;
  }[];
  legendaryActions?: {
    name: string;
    description: string;
  }[];
}

export const monsters: Monster[] = [
  {
    id: "rancor",
    name: "Rancor",
    size: "Huge",
    type: "Beast",
    alignment: "Unaligned",
    armorClass: 17,
    hitPoints: 119,
    speed: {
      walk: 40
    },
    stats: {
      strength: 24,
      dexterity: 13,
      constitution: 21,
      intelligence: 4,
      wisdom: 10,
      charisma: 8
    },
    senses: {
      darkvision: 60,
      passivePerception: 10
    },
    languages: [],
    challengeRating: 7,
    abilities: [
      {
        name: "Thick Hide",
        description: "The rancor has advantage on saving throws against effects that would restrain it."
      }
    ],
    actions: [
      {
        name: "Multiattack",
        description: "The rancor makes two attacks: one with its bite and one with its claws."
      },
      {
        name: "Bite",
        description: "Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 23 (3d10 + 7) kinetic damage.",
        attackBonus: 10,
        damage: "3d10 + 7",
        damageType: "kinetic"
      },
      {
        name: "Claws",
        description: "Melee Weapon Attack: +10 to hit, reach 10 ft., one target. Hit: 20 (3d8 + 7) kinetic damage.",
        attackBonus: 10,
        damage: "3d8 + 7",
        damageType: "kinetic"
      }
    ]
  },
  {
    id: "acklay",
    name: "Acklay",
    size: "Huge",
    type: "Beast",
    alignment: "Unaligned",
    armorClass: 15,
    hitPoints: 95,
    speed: {
      walk: 50
    },
    stats: {
      strength: 20,
      dexterity: 16,
      constitution: 18,
      intelligence: 4,
      wisdom: 12,
      charisma: 6
    },
    senses: {
      darkvision: 60,
      passivePerception: 11
    },
    languages: [],
    challengeRating: 6,
    abilities: [
      {
        name: "Amphibious",
        description: "The acklay can breathe air and water."
      }
    ],
    actions: [
      {
        name: "Multiattack",
        description: "The acklay makes three attacks with its claws."
      },
      {
        name: "Claw",
        description: "Melee Weapon Attack: +8 to hit, reach 10 ft., one target. Hit: 18 (3d8 + 5) kinetic damage.",
        attackBonus: 8,
        damage: "3d8 + 5",
        damageType: "kinetic"
      }
    ]
  }
];
