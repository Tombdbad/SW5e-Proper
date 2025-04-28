export interface ClassData {
  id: string;
  name: string;
  description: string;
  hitDie: number;
  primaryAbility: string[];
  savingThrowProficiencies: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: {
    choose: number;
    from: string[];
  };
  startingEquipment: {
    mandatory: string[];
    options: {
      choose: number;
      from: string[];
    }[];
  };
  features: {
    level: number;
    name: string;
    description: string;
  }[];
  subclasses: {
    id: string;
    name: string;
    description: string;
    features: {
      level: number;
      name: string;
      description: string;
    }[];
  }[];
  advancementTable: {
    level: number;
    proficiencyBonus: number;
    features: string[];
    specifics?: Record<string, any>;
  }[];
  isForceUser: boolean;
  isTechUser: boolean;
  spellcasting?: {
    abilityType: string;
    focusType: string;
  };
}

export const classes: ClassData[] = [
  {
    id: "berserker",
    name: "Berserker",
    description: "Berserkers are fierce warriors who channel their inner rage to enhance their combat abilities. These primal fighters tap into a reservoir of fury that grants them enhanced strength, resilience, and combat prowess.",
    hitDie: 12,
    primaryAbility: ["Strength"],
    savingThrowProficiencies: ["Strength", "Constitution"],
    armorProficiencies: ["Light Armor", "Medium Armor", "Shields"],
    weaponProficiencies: ["Simple Weapons", "Martial Weapons"],
    toolProficiencies: [],
    skillChoices: {
      choose: 2,
      from: ["Athletics", "Insight", "Intimidation", "Nature", "Perception", "Survival"]
    },
    startingEquipment: {
      mandatory: [
        "Explorer's pack",
        "Two vibroweapons or one doubleblade vibroweapon",
        "Four javelins"
      ],
      options: [
        {
          choose: 1,
          from: ["Hide armor and any martial weapon", "Blaster carbine and 20 power cells"]
        }
      ]
    },
    features: [
      {
        level: 1,
        name: "Rage",
        description: "In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain various benefits if you aren't wearing heavy armor. Your rage lasts for 1 minute."
      },
      {
        level: 1,
        name: "Unarmored Defense",
        description: "While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit."
      },
      {
        level: 2,
        name: "Reckless Attack",
        description: "When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn."
      },
      {
        level: 2,
        name: "Danger Sense",
        description: "You gain an uncanny sense of when things nearby aren't as they should be, giving you an edge when you dodge away from danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and powers."
      },
      {
        level: 3,
        name: "Primal Path",
        description: "You choose a path that shapes the nature of your rage: Path of the Battle Master, Path of the Devastator, or Path of the Wild Heart, all detailed at the end of the class description."
      }
    ],
    subclasses: [
      {
        id: "battle_master",
        name: "Path of the Battle Master",
        description: "The Path of the Battle Master is a path of martial excellence. Those berserkers who follow this path blend rage with tactical brilliance, creating a fierce combat style that makes them deadly battlefield controllers.",
        features: [
          {
            level: 3,
            name: "Tactical Maneuvers",
            description: "When you choose this path at 3rd level, you gain the ability to perform special combat maneuvers that leverage both your rage and tactical acumen. You learn three maneuvers of your choice from the Battle Master list. You gain two superiority dice, which are d8s. These dice are used to fuel your maneuvers. When you use a maneuver, you expend a superiority die. You regain all expended superiority dice when you finish a short or long rest."
          },
          {
            level: 6,
            name: "Battle Presence",
            description: "At 6th level, your presence on the battlefield becomes more commanding. While raging, you can use a bonus action to let out a battlecry that bolsters your allies. Choose up to three creatures within 30 feet of you. Each creature gains temporary hit points equal to your berserker level + your Constitution modifier."
          }
        ]
      },
      {
        id: "devastator",
        name: "Path of the Devastator",
        description: "The Path of the Devastator channels rage into pure destructive power. Berserkers who follow this path become living weapons, capable of unleashing devastating attacks that can shatter defenses and crush opposition.",
        features: [
          {
            level: 3,
            name: "Destructive Force",
            description: "Starting when you choose this path at 3rd level, your rage fuels attacks of tremendous power. While raging, when you hit with a melee weapon attack, you can cause the target and each creature within 5 feet of it to make a Strength saving throw (DC equal to 8 + your proficiency bonus + your Strength modifier). On a failed save, the creatures are pushed 5 feet away from you."
          },
          {
            level: 6,
            name: "Crushing Blow",
            description: "Beginning at 6th level, you can channel your rage to deliver particularly devastating strikes. When you hit a creature with a melee weapon attack while raging, you can expend one rage use to deal extra damage equal to your berserker level. Additionally, if the target is Large or smaller, it must succeed on a Strength saving throw or be knocked prone."
          }
        ]
      }
    ],
    advancementTable: [
      {
        level: 1,
        proficiencyBonus: 2,
        features: ["Rage", "Unarmored Defense"],
        specifics: { rages: 2, rageDamage: 2 }
      },
      {
        level: 2,
        proficiencyBonus: 2,
        features: ["Reckless Attack", "Danger Sense"],
        specifics: { rages: 2, rageDamage: 2 }
      },
      {
        level: 3,
        proficiencyBonus: 2,
        features: ["Primal Path"],
        specifics: { rages: 3, rageDamage: 2 }
      },
      {
        level: 4,
        proficiencyBonus: 2,
        features: ["Ability Score Improvement"],
        specifics: { rages: 3, rageDamage: 2 }
      },
      {
        level: 5,
        proficiencyBonus: 3,
        features: ["Extra Attack", "Fast Movement"],
        specifics: { rages: 3, rageDamage: 2 }
      }
    ],
    isForceUser: false,
    isTechUser: false
  },
  {
    id: "consular",
    name: "Consular",
    description: "Consulars are force practitioners who specialize in the mental aspects of the Force, focusing on diplomacy, healing, and knowledge. Their wisdom and connection to the Force make them powerful supporters and skilled negotiators.",
    hitDie: 8,
    primaryAbility: ["Wisdom", "Charisma"],
    savingThrowProficiencies: ["Intelligence", "Wisdom"],
    armorProficiencies: ["Light Armor"],
    weaponProficiencies: ["Simple Weapons", "Martial Lightweapons"],
    toolProficiencies: [],
    skillChoices: {
      choose: 3,
      from: ["Deception", "Insight", "Intimidation", "Investigation", "Lore", "Medicine", "Persuasion"]
    },
    startingEquipment: {
      mandatory: [
        "Force focus",
        "Scholar's pack",
        "Lightweapon"
      ],
      options: [
        {
          choose: 1,
          from: ["Light armor", "Two vibroweapons of your choice"]
        }
      ]
    },
    features: [
      {
        level: 1,
        name: "Force-Casting",
        description: "You can cast force powers using your connection to the Force. Wisdom is your forcecasting ability for your consular powers."
      },
      {
        level: 1,
        name: "Force Recovery",
        description: "You have learned to regain some of your Force energy by meditating and connecting to the Force. Once per day when you finish a short rest, you can choose expended force points to recover. The force points can have a combined level that is equal to or less than half your consular level (rounded up)."
      },
      {
        level: 2,
        name: "Force-Empowered Self",
        description: "Starting at 2nd level, you can channel the Force to enhance your physical capabilities or improve your mental focus. As a bonus action, you can expend one force point to gain one of the following benefits for 1 minute: enhanced speed, enhanced reflexes, or enhanced focus."
      },
      {
        level: 3,
        name: "Consular Tradition",
        description: "When you reach 3rd level, you commit yourself to a tradition of consular practice: the Way of the Sage, the Way of the Healer, or the Way of the Diplomat, all detailed at the end of the class description."
      }
    ],
    subclasses: [
      {
        id: "sage",
        name: "Way of the Sage",
        description: "Consulars who follow the Way of the Sage seek knowledge and wisdom through their connection to the Force, becoming repositories of ancient lore and forgotten secrets.",
        features: [
          {
            level: 3,
            name: "Bonus Proficiency",
            description: "When you choose this tradition at 3rd level, you gain proficiency in Intelligence (History), Intelligence (Investigation), and Intelligence (Lore) checks. If you are already proficient in any of these skills, your proficiency bonus is doubled for any check you make with that skill."
          },
          {
            level: 3,
            name: "Force Lore",
            description: "Also at 3rd level, you can use the Force to assist in recalling important information. You can cast the identify power without expending a force point, but only as a ritual."
          }
        ]
      },
      {
        id: "healer",
        name: "Way of the Healer",
        description: "Consulars who follow the Way of the Healer focus on using the Force to mend wounds, cure ailments, and sustain life, becoming powerful sources of healing energy.",
        features: [
          {
            level: 3,
            name: "Bonus Proficiency",
            description: "When you choose this tradition at 3rd level, you gain proficiency with the Medicine skill and with herbalism kits. Your proficiency bonus is doubled for any check you make using the Medicine skill or a herbalism kit."
          },
          {
            level: 3,
            name: "Healing Focus",
            description: "Also at 3rd level, your ability to heal others is enhanced. When you use a power that restores hit points to a creature other than yourself, you add your Wisdom modifier to the number of hit points restored."
          }
        ]
      }
    ],
    advancementTable: [
      {
        level: 1,
        proficiencyBonus: 2,
        features: ["Force-Casting", "Force Recovery"],
        specifics: { forcePoints: 2, powersKnown: 3, maxPowerLevel: 1 }
      },
      {
        level: 2,
        proficiencyBonus: 2,
        features: ["Force-Empowered Self"],
        specifics: { forcePoints: 4, powersKnown: 4, maxPowerLevel: 1 }
      },
      {
        level: 3,
        proficiencyBonus: 2,
        features: ["Consular Tradition"],
        specifics: { forcePoints: 6, powersKnown: 5, maxPowerLevel: 2 }
      },
      {
        level: 4,
        proficiencyBonus: 2,
        features: ["Ability Score Improvement"],
        specifics: { forcePoints: 7, powersKnown: 6, maxPowerLevel: 2 }
      },
      {
        level: 5,
        proficiencyBonus: 3,
        features: ["Potent Force-Casting"],
        specifics: { forcePoints: 10, powersKnown: 7, maxPowerLevel: 3 }
      }
    ],
    isForceUser: true,
    isTechUser: false,
    spellcasting: {
      abilityType: "Wisdom",
      focusType: "Force focus"
    }
  },
  {
    id: "engineer",
    name: "Engineer",
    description: "Engineers are masters of technology, using their technical knowledge to create gadgets, repair machinery, and solve complex problems. Their intelligence and adaptability make them invaluable in almost any situation requiring technical expertise.",
    hitDie: 8,
    primaryAbility: ["Intelligence"],
    savingThrowProficiencies: ["Constitution", "Intelligence"],
    armorProficiencies: ["Light Armor", "Medium Armor"],
    weaponProficiencies: ["Simple Weapons", "Blaster Pistols", "Blaster Rifles"],
    toolProficiencies: ["Engineering's kit", "Tinker's tools"],
    skillChoices: {
      choose: 3,
      from: ["Investigation", "Medicine", "Nature", "Perception", "Piloting", "Sleight of Hand", "Technology"]
    },
    startingEquipment: {
      mandatory: [
        "Tech focus",
        "Dungeoneer's pack",
        "Engineering's kit",
        "Medium armor",
        "Any simple weapon"
      ],
      options: [
        {
          choose: 1,
          from: ["Blaster rifle and 20 power cells", "Blaster pistol, shield, and 20 power cells"]
        }
      ]
    },
    features: [
      {
        level: 1,
        name: "Tech-Casting",
        description: "You augment your capabilities through technology. Intelligence is your techcasting ability for your engineer powers."
      },
      {
        level: 1,
        name: "Repair Droid",
        description: "At 1st level, you create a small droid that can repair equipment or aid in technical tasks. Your repair droid has AC 13, 5 hit points, and a speed of 30 feet. It can perform simple tasks such as carrying items, delivering messages, or assisting with repairs."
      },
      {
        level: 2,
        name: "Resourceful Tinkerer",
        description: "Starting at 2nd level, you learn to extract components from technological devices you find. Whenever you find a destroyed droid, a broken computer, or similar technological debris, you can spend 10 minutes salvaging it to create a Tech Component. You can have a number of components equal to your Intelligence modifier (minimum of 1)."
      },
      {
        level: 3,
        name: "Engineer Specialization",
        description: "At 3rd level, you choose a specialization that reflects your technical expertise: Mechanic, Armstech, or Gadgeteer, all detailed at the end of the class description."
      }
    ],
    subclasses: [
      {
        id: "mechanic",
        name: "Mechanic",
        description: "Engineers who specialize as Mechanics focus on repairing and enhancing droids, vehicles, and other complex machinery, becoming masters of maintenance and modification.",
        features: [
          {
            level: 3,
            name: "Bonus Proficiency",
            description: "When you choose this specialization at 3rd level, you gain proficiency with mechanic's tools. If you already have this proficiency, you gain proficiency with one other type of artisan's tools of your choice."
          },
          {
            level: 3,
            name: "Enhanced Repair Droid",
            description: "Also at 3rd level, your repair droid becomes more sophisticated. Its hit points increase to your engineer level + your Intelligence modifier, and it gains proficiency in one skill of your choice from the engineer skill list."
          }
        ]
      },
      {
        id: "armstech",
        name: "Armstech",
        description: "Engineers who specialize in Armstech focus on creating and modifying weapons, becoming experts in firearms technology and custom modifications.",
        features: [
          {
            level: 3,
            name: "Bonus Proficiency",
            description: "When you choose this specialization at 3rd level, you gain proficiency with gunsmith's tools and with martial weapons."
          },
          {
            level: 3,
            name: "Custom Weapon",
            description: "At 3rd level, you create a custom weapon that only you know how to use properly. Choose one blaster pistol, blaster rifle, or martial weapon that you are proficient with. You can add your Intelligence modifier, instead of the normal ability modifier, to attack and damage rolls with this weapon."
          }
        ]
      }
    ],
    advancementTable: [
      {
        level: 1,
        proficiencyBonus: 2,
        features: ["Tech-Casting", "Repair Droid"],
        specifics: { techPoints: 2, powersKnown: 3, maxPowerLevel: 1 }
      },
      {
        level: 2,
        proficiencyBonus: 2,
        features: ["Resourceful Tinkerer"],
        specifics: { techPoints: 4, powersKnown: 4, maxPowerLevel: 1 }
      },
      {
        level: 3,
        proficiencyBonus: 2,
        features: ["Engineer Specialization"],
        specifics: { techPoints: 6, powersKnown: 5, maxPowerLevel: 2 }
      },
      {
        level: 4,
        proficiencyBonus: 2,
        features: ["Ability Score Improvement"],
        specifics: { techPoints: 7, powersKnown: 6, maxPowerLevel: 2 }
      },
      {
        level: 5,
        proficiencyBonus: 3,
        features: ["Enhanced Tech"],
        specifics: { techPoints: 10, powersKnown: 7, maxPowerLevel: 3 }
      }
    ],
    isForceUser: false,
    isTechUser: true,
    spellcasting: {
      abilityType: "Intelligence",
      focusType: "Tech focus"
    }
  }
];
