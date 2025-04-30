// Conditions data for SW5E
export interface Condition {
  id: string;
  name: string;
  description: string;
  effects: string[];
}

export const conditions: Condition[] = [
  {
    id: "blinded",
    name: "Blinded",
    description:
      "A blinded creature can't see and automatically fails any ability check that requires sight.",
    effects: [
      "Automatically fails any ability check that requires sight",
      "Attack rolls against the creature have advantage",
      "The creature's attack rolls have disadvantage",
    ],
  },
  {
    id: "charmed",
    name: "Charmed",
    description:
      "A charmed creature can't attack the charmer or target the charmer with harmful abilities or effects. The charmer has advantage on any ability check to interact socially with the creature.",
    effects: [
      "Can't attack the charmer",
      "Can't target the charmer with harmful abilities",
      "Charmer has advantage on social interaction checks with the creature",
    ],
  },
  {
    id: "deafened",
    name: "Deafened",
    description:
      "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    effects: [
      "Can't hear",
      "Automatically fails ability checks requiring hearing",
    ],
  },
  {
    id: "frightened",
    name: "Frightened",
    description:
      "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. The creature can't willingly move closer to the source of its fear.",
    effects: [
      "Disadvantage on ability checks and attack rolls while source of fear is visible",
      "Can't willingly move closer to the source of fear",
    ],
  },
  {
    id: "grappled",
    name: "Grappled",
    description:
      "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed. The condition ends if the grappler is incapacitated. The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect.",
    effects: [
      "Speed becomes 0",
      "Can't benefit from bonuses to speed",
      "Condition ends if grappler is incapacitated or creature is moved out of reach",
    ],
  },
  {
    id: "incapacitated",
    name: "Incapacitated",
    description: "An incapacitated creature can't take actions or reactions.",
    effects: ["Can't take actions", "Can't take reactions"],
  },
  {
    id: "invisible",
    name: "Invisible",
    description:
      "An invisible creature is impossible to see without the aid of special abilities or technology. For the purpose of hiding, the creature is heavily obscured. The creature's location can be detected by any noise it makes or tracks it leaves. Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
    effects: [
      "Impossible to see without special abilities",
      "Counts as heavily obscured for hiding",
      "Location can be detected by noise or tracks",
      "Attack rolls against the creature have disadvantage",
      "The creature's attack rolls have advantage",
    ],
  },
  {
    id: "paralyzed",
    name: "Paralyzed",
    description:
      "A paralyzed creature is incapacitated and can't move or speak. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: [
      "Incapacitated (can't take actions or reactions)",
      "Can't move or speak",
      "Automatically fails Strength and Dexterity saving throws",
      "Attack rolls against the creature have advantage",
      "Attacks from within 5 feet that hit are critical hits",
    ],
  },
  {
    id: "petrified",
    name: "Petrified",
    description:
      "A petrified creature is transformed, along with any nonenhanced object it is wearing or carrying, into a solid inanimate substance (usually stone). Its weight increases by a factor of ten, and it ceases aging. The creature is incapacitated, can't move or speak, and is unaware of its surroundings. Attack rolls against the creature have advantage. The creature automatically fails Strength and Dexterity saving throws. The creature has resistance to all damage. The creature is immune to poison and disease, although a poison or disease already in its system is suspended, not neutralized.",
    effects: [
      "Transformed into solid substance",
      "Weight increases tenfold",
      "Ceases aging",
      "Incapacitated",
      "Can't move or speak",
      "Unaware of surroundings",
      "Attack rolls against the creature have advantage",
      "Automatically fails Strength and Dexterity saving throws",
      "Has resistance to all damage",
      "Immune to poison and disease",
    ],
  },
  {
    id: "poisoned",
    name: "Poisoned",
    description:
      "A poisoned creature has disadvantage on attack rolls and ability checks.",
    effects: ["Disadvantage on attack rolls", "Disadvantage on ability checks"],
  },
  {
    id: "prone",
    name: "Prone",
    description:
      "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition. The creature has disadvantage on attack rolls. An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.",
    effects: [
      "Can only crawl unless it stands up",
      "Has disadvantage on attack rolls",
      "Attack rolls against the creature have advantage if attacker is within 5 feet",
      "Attack rolls against the creature have disadvantage if attacker is beyond 5 feet",
    ],
  },
  {
    id: "restrained",
    name: "Restrained",
    description:
      "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage. The creature has disadvantage on Dexterity saving throws.",
    effects: [
      "Speed becomes 0",
      "Can't benefit from bonuses to speed",
      "Attack rolls against the creature have advantage",
      "The creature's attack rolls have disadvantage",
      "Has disadvantage on Dexterity saving throws",
    ],
  },
  {
    id: "stunned",
    name: "Stunned",
    description:
      "A stunned creature is incapacitated, can't move, and can speak only falteringly. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage.",
    effects: [
      "Incapacitated",
      "Can't move",
      "Can speak only falteringly",
      "Automatically fails Strength and Dexterity saving throws",
      "Attack rolls against the creature have advantage",
    ],
  },
  {
    id: "unconscious",
    name: "Unconscious",
    description:
      "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings. The creature drops whatever it's holding and falls prone. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: [
      "Incapacitated",
      "Can't move or speak",
      "Unaware of surroundings",
      "Drops held items and falls prone",
      "Automatically fails Strength and Dexterity saving throws",
      "Attack rolls against the creature have advantage",
      "Attacks from within 5 feet that hit are critical hits",
    ],
  },
  {
    id: "slowed",
    name: "Slowed",
    description:
      "A slowed creature's speed is halved, it takes a -2 penalty to AC and Dexterity saving throws, and it can't use reactions. On its turn, it can use either an action or a bonus action, not both. Regardless of the creature's abilities or tech items, it can't make more than one melee or ranged attack during its turn.",
    effects: [
      "Speed is halved",
      "-2 penalty to AC and Dexterity saving throws",
      "Can't use reactions",
      "Can use either an action or bonus action on its turn, not both",
      "Limited to one attack per turn",
    ],
  },
  {
    id: "shocked",
    name: "Shocked",
    description:
      "A shocked creature has disadvantage on attack rolls and ability checks that use Strength or Dexterity. Additionally, the creature's speed is reduced by 10 feet.",
    effects: [
      "Disadvantage on attack rolls",
      "Disadvantage on Strength and Dexterity ability checks",
      "Speed reduced by 10 feet",
    ],
  },
  {
    id: "burning",
    name: "Burning",
    description:
      "A burning creature takes 1d6 fire damage at the start of each of its turns. The creature or another creature within 5 feet of it can use an action to extinguish the flames, ending the effect.",
    effects: [
      "Takes 1d6 fire damage at the start of each turn",
      "Can be extinguished as an action by self or another creature within 5 feet",
    ],
  },
];

// Helper functions
export function getConditionById(id: string): Condition | undefined {
  return conditions.find((condition) => condition.id === id);
}

export function getConditionsByIds(ids: string[]): Condition[] {
  return conditions.filter((condition) => ids.includes(condition.id));
}
