// Classes data for SW5E
export interface SW5EClass {
  id: string;
  name: string;
  summary: string;
  description: string;
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: string[];
  numSkillChoices: number;
  equipmentChoices: string[][];
  features: ClassFeature[];
  subclasses?: SW5EClass[];
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
}

export const classes: SW5EClass[] = [
  {
    id: "berserker",
    name: "Berserker",
    summary: "A fierce warrior who channels primal rage to enhance combat abilities.",
    description: "Berserkers are fearsome warriors who unleash controlled rage in battle. They excel at absorbing and dealing massive damage through sheer physical power.",
    hitDie: 12,
    primaryAbility: ["Strength", "Constitution"],
    savingThrows: ["Strength", "Constitution"],
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial", "Vibroweapons"],
    toolProficiencies: [],
    skillChoices: ["Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    numSkillChoices: 2,
    equipmentChoices: [
      ["Vibroaxe", "Vibroglaive"],
      ["Two vibrodaggers", "Any simple weapon"]
    ],
    features: [
      {
        name: "Unarmored Defense",
        level: 1,
        description: "While not wearing armor, your AC equals 10 + Dexterity modifier + Constitution modifier."
      },
      {
        name: "Rage",
        level: 1,
        description: "Enter a rage as a bonus action, gaining advantage on Strength checks/saves, bonus damage, and resistance to physical damage."
      }
    ]
  },
  {
    id: "consular",
    name: "Consular",
    summary: "A Force-wielder who focuses on mastering Force powers and knowledge.",
    description: "Consulars are masters of the Force, focusing on control and knowledge. They wield a vast array of Force powers with precision and insight.",
    hitDie: 6,
    primaryAbility: ["Wisdom", "Charisma"],
    savingThrows: ["Wisdom", "Charisma"],
    armorProficiencies: ["Light"],
    weaponProficiencies: ["Simple", "Blasters"],
    toolProficiencies: [],
    skillChoices: ["History", "Insight", "Investigation", "Lore", "Medicine", "Persuasion", "Technology"],
    numSkillChoices: 3,
    equipmentChoices: [
      ["Lightfoil", "Quarterstaff"],
      ["Diplomat's Pack", "Scholar's Pack"]
    ],
    features: [
      {
        name: "Force Casting",
        level: 1,
        description: "You can cast force powers using your Force Points. You regain all spent Force Points after a long rest."
      },
      {
        name: "Force Recovery",
        level: 1,
        description: "Once per day when you finish a short rest, you can regain some of your Force Points."
      }
    ]
  },
  {
    id: "engineer",
    name: "Engineer",
    summary: "A technical specialist who creates gadgets and enhances technology.",
    description: "Engineers are technical specialists who excel at manipulating technology. They can build, repair, and enhance devices to support their allies.",
    hitDie: 8,
    primaryAbility: ["Intelligence"],
    savingThrows: ["Constitution", "Intelligence"],
    armorProficiencies: ["Light", "Medium"],
    weaponProficiencies: ["Simple", "Blasters"],
    toolProficiencies: ["Tinker's tools", "Tech Kit"],
    skillChoices: ["Investigation", "Medicine", "Nature", "Piloting", "Science", "Sleight of Hand", "Technology"],
    numSkillChoices: 3,
    equipmentChoices: [
      ["Blaster pistol", "Ion pistol"],
      ["Techie's Pack", "Field Kit"]
    ],
    features: [
      {
        name: "Tech Casting",
        level: 1,
        description: "You can cast tech powers using Tech Points. You regain all spent Tech Points after a long rest."
      },
      {
        name: "Modify Item",
        level: 1,
        description: "Enhance or modify a weapon, armor, or tool, granting a +1 bonus."
      }
    ]
  },
  {
    id: "fighter",
    name: "Fighter",
    summary: "A master of combat techniques and weapons specialization.",
    description: "Fighters are versatile combat specialists who excel with weapons. They are adaptable and resilient, mastering a variety of fighting styles.",
    hitDie: 10,
    primaryAbility: ["Strength", "Dexterity"],
    savingThrows: ["Strength", "Constitution"],
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial", "Vibroweapons", "Blasters"],
    toolProficiencies: [],
    skillChoices: ["Acrobatics", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
    numSkillChoices: 2,
    equipmentChoices: [
      ["Heavy blaster rifle and 20 ammunition", "Vibrorapier and shield"],
      ["Light armor", "Medium armor"]
    ],
    features: [
      {
        name: "Fighting Style",
        level: 1,
        description: "Choose a fighting style that represents your combat focus: Archery, Defense, Dueling, etc."
      },
      {
        name: "Second Wind",
        level: 1,
        description: "Once per short rest, regain HP equal to 1d10 + fighter level as a bonus action."
      }
    ]
  },
  {
    id: "guardian",
    name: "Guardian",
    summary: "A Force-wielder who combines combat skills with Force powers.",
    description: "Guardians blend martial prowess with Force abilities. They are the protectors and warriors of Force traditions, capable in both combat and Force manipulation.",
    hitDie: 10,
    primaryAbility: ["Strength", "Wisdom"],
    savingThrows: ["Strength", "Wisdom"],
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial", "Lightsabers"],
    toolProficiencies: [],
    skillChoices: ["Athletics", "History", "Insight", "Intimidation", "Medicine", "Perception", "Persuasion"],
    numSkillChoices: 2,
    equipmentChoices: [
      ["Lightsaber", "Doubleblade lightsaber"],
      ["Light armor", "Medium armor and shield"]
    ],
    features: [
      {
        name: "Force Casting",
        level: 1,
        description: "You can cast force powers using your Force Points. You know fewer powers than a Consular but can combine them with combat."
      },
      {
        name: "Guardian Defense",
        level: 1,
        description: "While wearing armor, gain +1 AC. This bonus increases at higher levels."
      }
    ]
  },
  {
    id: "scout",
    name: "Scout",
    summary: "A skilled explorer and tracker who excels in wilderness and stealth.",
    description: "Scouts are explorers and wilderness specialists. They navigate harsh terrain, track enemies, and serve as the eyes and ears of their group.",
    hitDie: 10,
    primaryAbility: ["Dexterity", "Wisdom"],
    savingThrows: ["Dexterity", "Wisdom"],
    armorProficiencies: ["Light", "Medium", "Shields"],
    weaponProficiencies: ["Simple", "Blasters"],
    toolProficiencies: ["Surveying tools"],
    skillChoices: ["Athletics", "Insight", "Investigation", "Lore", "Nature", "Perception", "Stealth", "Survival"],
    numSkillChoices: 3,
    equipmentChoices: [
      ["Sporting blaster rifle and 20 ammunition", "Two vibroknives"],
      ["Scout's Pack", "Explorer's Pack"]
    ],
    features: [
      {
        name: "Natural Explorer",
        level: 1,
        description: "You're particularly familiar with one type of environment and are adept at traveling and surviving in such regions."
      },
      {
        name: "Favored Enemy",
        level: 1,
        description: "Choose a type of enemy. You gain bonuses to tracking and recalling information about them."
      }
    ]
  }
];