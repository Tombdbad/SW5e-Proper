// NPCs data for SW5E
export interface NPC {
  id: string;
  name: string;
  category: string;
  type: string;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  alignment: string;
  description: string;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  armorClass: number;
  hitPoints: number;
  speed: string;
  skills: string[];
  senses: string[];
  languages: string[];
  challengeRating: string;
  specialAbilities?: {
    name: string;
    description: string;
  }[];
  actions?: {
    name: string;
    description: string;
    attackBonus?: number;
    damage?: string;
    damageType?: string;
  }[];
  reactions?: {
    name: string;
    description: string;
  }[];
  forceAbilities?: {
    points: number;
    saveDC: number;
    attackModifier: number;
    powers: {
      level: string;
      spells: string[];
    }[];
  };
  equipment?: string[];
}

export const npcs: NPC[] = [
  {
    id: "imperial-inquisitor",
    name: "Imperial Inquisitor",
    category: "Imperial Personnel",
    type: "Humanoid",
    size: "Medium",
    alignment: "Lawful Dark",
    description: "A Force-sensitive agent of the Empire who hunts down surviving Jedi and other Force-users.",
    stats: {
      str: 14, // +2
      dex: 18, // +4
      con: 18, // +4
      int: 14, // +2
      wis: 16, // +3
      cha: 16  // +3
    },
    armorClass: 16,
    hitPoints: 136,
    speed: "30 ft.",
    skills: ["Intimidation +7", "Investigation +6", "Perception +7"],
    senses: ["passive Perception 17"],
    languages: ["Basic", "2 others"],
    challengeRating: "9",
    specialAbilities: [
      {
        name: "Force Points",
        description: "The inquisitor has 16 Force points and regains 8 expended Force points when it finishes a short rest."
      },
      {
        name: "War Caster",
        description: "The inquisitor has advantage on Constitution saving throws to maintain concentration on force powers when it takes damage."
      }
    ],
    actions: [
      {
        name: "Double-Bladed Lightsaber",
        description: "Melee Weapon Attack: +8 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) energy damage.",
        attackBonus: 8,
        damage: "1d8 + 4",
        damageType: "energy"
      }
    ],
    forceAbilities: {
      points: 16,
      saveDC: 15,
      attackModifier: 7,
      powers: [
        {
          level: "At-will",
          spells: ["force disarm", "force jump", "force push", "light", "mind trick", "sense force"]
        },
        {
          level: "1 force point",
          spells: ["detect thoughts", "force body", "force blur", "force choke", "force shock"]
        },
        {
          level: "2 force points",
          spells: ["force lightning", "force sight", "improved force push", "improved telekinesis"]
        },
        {
          level: "3 force points",
          spells: ["dominate beast", "dominate person", "force storm"]
        }
      ]
    }
  },
  {
    id: "hutt-crime-lord",
    name: "Hutt Crime Lord",
    category: "Crime Lords",
    type: "Monstrosity",
    size: "Large",
    alignment: "Neutral Impure",
    description: "A powerful Hutt who rules over a criminal enterprise, dealing in illegal activities across multiple systems.",
    stats: {
      str: 18, // +4
      dex: 8,  // -1
      con: 20, // +5
      int: 16, // +3
      wis: 14, // +2
      cha: 20  // +5
    },
    armorClass: 15,
    hitPoints: 157,
    speed: "15 ft.",
    skills: ["Deception +9", "Insight +6", "Intimidation +9", "Persuasion +9"],
    senses: ["passive Perception 12"],
    languages: ["Basic", "Huttese", "3 others"],
    challengeRating: "8",
    specialAbilities: [
      {
        name: "Legendary Resistance",
        description: "If the Hutt fails a saving throw, it can choose to succeed instead (3/Day)."
      }
    ],
    actions: [
      {
        name: "Tail",
        description: "Melee Weapon Attack: +8 to hit, reach 10 ft., one target. Hit: 13 (2d8 + 4) kinetic damage, and the target is grappled (escape DC 16). Until this grapple ends, the target is restrained.",
        attackBonus: 8,
        damage: "2d8 + 4",
        damageType: "kinetic"
      },
      {
        name: "Command",
        description: "The Hutt targets one creature it can see within 30 feet of it. If the target can hear the Hutt, the target must succeed on a DC 17 Wisdom saving throw or follow the Hutt's command on its next turn."
      },
      {
        name: "Frightful Presence",
        description: "Each creature of the Hutt's choice within 60 feet of it must succeed on a DC 17 Wisdom saving throw or be frightened for 1 minute. A creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success."
      }
    ],
    reactions: [],
    equipment: ["Ornate jewelry", "Communication devices", "Personal shield generator"]
  },
  {
    id: "mandalorian-bounty-hunter",
    name: "Mandalorian Bounty Hunter",
    category: "Bounty Hunters",
    type: "Humanoid",
    size: "Medium",
    alignment: "Any",
    description: "A skilled warrior from Mandalore who follows the Way and makes a living tracking down targets for payment.",
    stats: {
      str: 16, // +3
      dex: 18, // +4
      con: 16, // +3
      int: 13, // +1
      wis: 16, // +3
      cha: 12  // +1
    },
    armorClass: 18,
    hitPoints: 112,
    speed: "30 ft., fly 30 ft. (jetpack)",
    skills: ["Athletics +7", "Perception +7", "Stealth +8", "Survival +7"],
    senses: ["darkvision 60 ft.", "passive Perception 17"],
    languages: ["Basic", "Mando'a"],
    challengeRating: "7",
    specialAbilities: [
      {
        name: "Beskar Armor",
        description: "The bounty hunter's armor is made of beskar, giving resistance to lightsaber damage and immunity to normal projectiles."
      },
      {
        name: "Tactical Movement",
        description: "The bounty hunter can take the Dash, Disengage, or Hide action as a bonus action."
      }
    ],
    actions: [
      {
        name: "Blaster Rifle",
        description: "Ranged Weapon Attack: +8 to hit, range 100/400 ft., one target. Hit: 8 (1d8 + 4) energy damage.",
        attackBonus: 8,
        damage: "1d8 + 4",
        damageType: "energy"
      },
      {
        name: "Flame Projector",
        description: "The bounty hunter unleashes a 15-foot cone of flame. Each creature in the area must make a DC 15 Dexterity saving throw, taking 21 (6d6) fire damage on a failed save, or half as much on a successful one."
      },
      {
        name: "Wrist Rocket",
        description: "Ranged Weapon Attack: +8 to hit, range 60/240 ft., one target. Hit: 13 (2d8 + 4) kinetic damage. If the attack hits, the target and each creature within 5 feet of it must succeed on a DC 15 Dexterity saving throw or take 7 (2d6) kinetic damage.",
        attackBonus: 8,
        damage: "2d8 + 4",
        damageType: "kinetic"
      }
    ],
    reactions: [
      {
        name: "Parry",
        description: "The bounty hunter adds 3 to its AC against one melee attack that would hit it. To do so, the bounty hunter must see the attacker and be wielding a melee weapon."
      }
    ],
    equipment: ["Beskar armor", "Blaster rifle", "Wrist-mounted flamethrower", "Wrist rockets", "Jetpack", "Various tracking devices"]
  },
  {
    id: "jedi-knight",
    name: "Jedi Knight (In Exile)",
    category: "Force Users",
    type: "Humanoid",
    size: "Medium",
    alignment: "Lawful Light",
    description: "A member of the Jedi Order who survived Order 66 and now lives in hiding, keeping their Force abilities secret.",
    stats: {
      str: 14, // +2
      dex: 18, // +4
      con: 14, // +2
      int: 12, // +1
      wis: 18, // +4
      cha: 14  // +2
    },
    armorClass: 16,
    hitPoints: 91,
    speed: "40 ft.",
    skills: ["Acrobatics +8", "Athletics +6", "Insight +8", "Perception +8"],
    senses: ["passive Perception 18"],
    languages: ["Basic", "2 others"],
    challengeRating: "6",
    specialAbilities: [
      {
        name: "Deflect Energy",
        description: "The Jedi can use its reaction to deflect or redirect an energy attack when it is hit by a blaster attack or a force power that requires a ranged attack roll. When it does so, the damage is reduced by 1d10 + 8."
      }
    ],
    actions: [
      {
        name: "Lightsaber",
        description: "Melee Weapon Attack: +8 to hit, reach 5 ft., one target. Hit: 9 (1d8 + 5) energy damage.",
        attackBonus: 8,
        damage: "1d8 + 5",
        damageType: "energy"
      }
    ],
    forceAbilities: {
      points: 10,
      saveDC: 16,
      attackModifier: 8,
      powers: [
        {
          level: "At-will",
          spells: ["force push", "force pull", "force jump", "sense force"]
        },
        {
          level: "1 force point",
          spells: ["battle meditation", "force barrier", "force blind/deafen", "force body"]
        },
        {
          level: "2 force points",
          spells: ["battle precognition", "improved force jump", "improved telekinesis"]
        },
        {
          level: "3 force points",
          spells: ["psychometry", "saber throw"]
        }
      ]
    },
    equipment: ["Lightsaber", "Concealed robes", "Comlink", "Medpac"]
  },
  {
    id: "rebel-commander",
    name: "Rebel Commander",
    category: "Rebel Alliance",
    type: "Humanoid",
    size: "Medium",
    alignment: "Neutral Light",
    description: "A veteran leader of the Rebel Alliance, coordinating operations against the Empire.",
    stats: {
      str: 14, // +2
      dex: 16, // +3
      con: 16, // +3
      int: 14, // +2
      wis: 16, // +3
      cha: 18  // +4
    },
    armorClass: 16,
    hitPoints: 112,
    speed: "30 ft.",
    skills: ["Deception +8", "Insight +7", "Persuasion +8", "Survival +7"],
    senses: ["passive Perception 13"],
    languages: ["Basic", "2 others"],
    challengeRating: "7",
    specialAbilities: [
      {
        name: "Brave",
        description: "The commander has advantage on saving throws against being frightened."
      },
      {
        name: "Inspiring Leader",
        description: "As a bonus action, the commander can inspire allies within 30 feet who can see or hear it. Each ally gains 15 temporary hit points."
      }
    ],
    actions: [
      {
        name: "Blaster Pistol",
        description: "Ranged Weapon Attack: +7 to hit, range 40/160 ft., one target. Hit: 7 (1d6 + 4) energy damage.",
        attackBonus: 7,
        damage: "1d6 + 4",
        damageType: "energy"
      },
      {
        name: "Vibroblade",
        description: "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) kinetic damage.",
        attackBonus: 6,
        damage: "1d6 + 3",
        damageType: "kinetic"
      },
      {
        name: "Tactical Orders",
        description: "The commander chooses up to three allies it can see within 30 feet. Each ally can immediately use its reaction to make one weapon attack or move up to half its speed."
      }
    ],
    reactions: [
      {
        name: "Redirect Attack",
        description: "When an ally within 5 feet of the commander is hit by an attack, the commander can cause itself to be hit instead."
      }
    ],
    equipment: ["Combat suit", "Blaster pistol", "Vibroblade", "Comlink", "Datapad", "Tactical display unit"]
  }
];