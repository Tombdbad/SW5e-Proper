
// Export for UI usage
export const FORCE_POWERS = [
  { id: "force_push", name: "Force Push", alignment: "universal" },
  { id: "force_lightning", name: "Force Lightning", alignment: "dark" },
  { id: "mind_trick", name: "Mind Trick", alignment: "light" },
  { id: "force_heal", name: "Force Heal", alignment: "light" },
  { id: "force_choke", name: "Force Choke", alignment: "dark" }
];

// Force Powers data for SW5E
export interface ForcePower {
  id: string;
  name: string;
  level: number; // 0 for at-will, 1-9 for leveled powers
  school: "Universal" | "Light" | "Dark" | "Neutral";
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  forceAlignment: "Light" | "Dark" | "Any";
  description: string;
  higherLevelDescription?: string;
  prerequisites?: string;
}

export const forcePowers: ForcePower[] = [
  // At-will powers
  {
    id: "force-push",
    name: "Force Push",
    level: 0,
    school: "Universal",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You send out a wave of telekinetic force that can push a creature or object away from you. A creature must make a Strength saving throw. On a failed save, the creature is pushed 10 feet away from you and is knocked prone. On a successful save, the creature is pushed only 5 feet, and isn't knocked prone."
  },
  {
    id: "force-pull",
    name: "Force Pull",
    level: 0,
    school: "Universal",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You create a wave of telekinetic force that pulls a Medium or smaller creature or object toward you. A creature must make a Strength saving throw. On a failed save, the creature is pulled 10 feet toward you. On a successful save, the creature is pulled only 5 feet toward you."
  },
  {
    id: "force-jump",
    name: "Force Jump",
    level: 0,
    school: "Universal",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You use the Force to augment your physical abilities, allowing you to jump farther than normal. Until the end of your turn, your jump distance is tripled."
  },
  {
    id: "force-focus",
    name: "Force Focus",
    level: 0,
    school: "Universal",
    castingTime: "1 action",
    range: "Self",
    duration: "1 round",
    concentration: true,
    forceAlignment: "Any",
    description: "You channel the Force to enhance your concentration and mental clarity. When you cast this power, you have advantage on the next Wisdom or Intelligence check you make within the duration."
  },
  
  // 1st level powers
  {
    id: "battle-insight",
    name: "Battle Insight",
    level: 1,
    school: "Universal",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "1 minute",
    concentration: true,
    forceAlignment: "Any",
    description: "Your attunement to the Force grants you enhanced combat awareness. For the duration, you can add your casting ability modifier to your AC against one target that you can see. Additionally, you have advantage on Dexterity saving throws against effects created by that target.",
    higherLevelDescription: "When you cast this power using a force slot of 3rd level or higher, you can target one additional creature for each slot level above 1st."
  },
  {
    id: "force-body",
    name: "Force Body",
    level: 1,
    school: "Light",
    castingTime: "1 action",
    range: "Touch",
    duration: "1 hour",
    concentration: false,
    forceAlignment: "Light",
    description: "You touch a creature, suffusing it with the Force to enhance its physical resilience. The target's hit point maximum and current hit points increase by 5 for the duration.",
    higherLevelDescription: "When you cast this power using a force slot of 2nd level or higher, a target's hit points increase by an additional 5 for each slot level above 1st."
  },
  {
    id: "force-choke",
    name: "Force Choke",
    level: 1,
    school: "Dark",
    castingTime: "1 action",
    range: "60 feet",
    duration: "1 minute",
    concentration: true,
    forceAlignment: "Dark",
    description: "You use the Force to constrict a creature's throat, hampering its breathing and movement. Choose a creature you can see within range. The target must succeed on a Constitution saving throw or take 2d6 force damage and be unable to speak. At the start of each of its turns, the target can make another Constitution saving throw. On a success, the power ends on the target.",
    higherLevelDescription: "When you cast this power using a force slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st."
  },
  {
    id: "force-throw",
    name: "Force Throw",
    level: 1,
    school: "Universal",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You telekinetically lift and throw one object or a creature within range. If the target is a creature, it must make a Strength saving throw. On a failed save, the creature is thrown up to 30 feet in a direction of your choice and takes 2d8 bludgeoning damage if it strikes a solid surface. On a successful save, the creature is moved only 10 feet and takes no damage. If the target is an object that isn't being worn or carried, you can throw it up to 30 feet in a direction of your choice. The object must weigh no more than 150 pounds.",
    higherLevelDescription: "When you cast this power using a force slot of 2nd level or higher, the maximum weight of the object you can affect increases by 150 pounds, and the damage increases by 1d8, for each slot level above 1st."
  },
  
  // 2nd level powers
  {
    id: "battle-precognition",
    name: "Battle Precognition",
    level: 2,
    school: "Universal",
    castingTime: "1 reaction, which you take when you are hit by an attack",
    range: "Self",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You glimpse a fraction of a second into the future, allowing you to react to danger more effectively. When you are hit by an attack, you can use your reaction to impose disadvantage on that attack roll, potentially causing it to miss.",
    higherLevelDescription: "When you cast this power using a force slot of 4th level or higher, you can use this reaction to affect any attack roll targeting a creature within 30 feet of you."
  },
  {
    id: "saber-throw",
    name: "Saber Throw",
    level: 2,
    school: "Universal",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Any",
    description: "You throw your lightsaber using the Force, guiding it to strike up to three targets within range before returning to your hand. Make a ranged force attack against each target. On a hit, a target takes 2d8 energy damage. The lightsaber returns to your hand after the attacks. If you don't have a lightsaber in hand when you cast this power, the power fails.",
    higherLevelDescription: "When you cast this power using a force slot of 3rd level or higher, you can target one additional creature for each slot level above 2nd."
  },
  
  // 3rd level powers
  {
    id: "force-lightning",
    name: "Force Lightning",
    level: 3,
    school: "Dark",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    concentration: false,
    forceAlignment: "Dark",
    description: "You channel the dark side of the Force to unleash a bolt of lightning from your fingertips. Make a ranged force attack against a target you can see within range. On a hit, the target takes 6d6 lightning damage. Whether you hit or miss, the lightning can then jump to a second target within 30 feet of the first, then from the second target to a third target, and so on. You can hit a maximum number of targets equal to 1 + your casting ability modifier (minimum of 2 targets). A creature can only be targeted once by each casting of this power. You make a separate attack roll for each target.",
    higherLevelDescription: "When you cast this power using a force slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."
  },
  {
    id: "force-cloak",
    name: "Force Cloak",
    level: 3,
    school: "Universal",
    castingTime: "1 action",
    range: "Self",
    duration: "10 minutes",
    concentration: true,
    forceAlignment: "Any",
    description: "You use the Force to bend light and sound around you, becoming invisible and silent. For the duration, you are invisible and make no sound. Anything you wear or carry is invisible as long as it is on your person. The power ends if you attack or cast another force power.",
    higherLevelDescription: "When you cast this power using a force slot of 4th level or higher, you can target one additional creature for each slot level above 3rd."
  },
  
  // 5th level power
  {
    id: "force-storm",
    name: "Force Storm",
    level: 5,
    school: "Dark",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    forceAlignment: "Dark",
    description: "You create a vortex of destructive Force energy at a point you can see within range. The vortex is a 20-foot-radius sphere. Each creature in the area must make a Dexterity saving throw. A creature takes 8d6 force damage and 4d6 lightning damage on a failed save, or half as much damage on a successful one. A creature that fails its save is also pulled 15 feet toward the center of the vortex. On each of your turns until the power ends, you can use your action to move the vortex up to 30 feet and repeat the effect against creatures in the area.",
    higherLevelDescription: "When you cast this power using a force slot of 6th level or higher, the force damage increases by 1d6 and the lightning damage increases by 1d6 for each slot level above 5th."
  }
];

// Helper function to get powers by level
export function getPowersByLevel(level: number): ForcePower[] {
  return forcePowers.filter(power => power.level === level);
}

// Helper function to get powers by school
export function getPowersBySchool(school: ForcePower['school']): ForcePower[] {
  return forcePowers.filter(power => power.school === school);
}

// Helper function to get powers by alignment
export function getPowersByAlignment(alignment: ForcePower['forceAlignment']): ForcePower[] {
  return forcePowers.filter(power => 
    power.forceAlignment === alignment || 
    power.forceAlignment === "Any"
  );
}

// Helper to find a power by ID
export function findPowerById(id: string): ForcePower | undefined {
  return forcePowers.find(power => power.id === id);
}