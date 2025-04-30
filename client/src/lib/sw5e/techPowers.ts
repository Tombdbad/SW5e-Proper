
// Export for UI usage
export const TECH_POWERS = [
  { id: "overcharge", name: "Overcharge" },
  { id: "shield_boost", name: "Shield Boost" },
  { id: "remote_slice", name: "Remote Slice" },
  { id: "tactical_scan", name: "Tactical Scan" },
  { id: "combat_stim", name: "Combat Stim" }
];

// Tech Powers data for SW5E
export interface TechPower {
  id: string;
  name: string;
  level: number; // 0 for at-will, 1-9 for leveled powers
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  description: string;
  higherLevelDescription?: string;
  prerequisites?: string;
  techType: "Gadget" | "Modification" | "Programming" | "Utility" | "Weapon";
}

export const techPowers: TechPower[] = [
  // At-will powers
  {
    id: "energy-surge",
    name: "Energy Surge",
    level: 0,
    castingTime: "1 action",
    range: "Touch",
    duration: "1 round",
    concentration: false,
    description: "You touch a technological device and surge energy through it. If the target is an electronic device that isn't functioning, this power provides enough energy for it to function for one round. If the target is a droid or construct, it regains 1 hit point.",
    techType: "Utility"
  },
  {
    id: "holographic-distraction",
    name: "Holographic Distraction",
    level: 0,
    castingTime: "1 action",
    range: "30 feet",
    duration: "1 minute",
    concentration: true,
    description: "You create a small holographic image of a creature or object at a spot within range that lasts for the duration. The hologram is only visual and can be up to 1 foot in each dimension. You can use a bonus action to move the hologram up to 30 feet to another spot within range. When a creature can see the hologram, you can use your action to change the hologram's appearance, move it, or cause it to make simple gestures.",
    techType: "Gadget"
  },
  {
    id: "security-scan",
    name: "Security Scan",
    level: 0,
    castingTime: "1 action",
    range: "30 feet",
    duration: "Instantaneous",
    concentration: false,
    description: "You scan for security measures in the area. Until the end of your next turn, you know the location of any surveillance cameras, motion detectors, and similar security systems within range. You also have advantage on ability checks made to bypass electronic security measures you detect with this scan.",
    techType: "Programming"
  },
  
  // 1st level powers
  {
    id: "targeting-laser",
    name: "Targeting Laser",
    level: 1,
    castingTime: "1 bonus action",
    range: "30 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    description: "You enhance your weapon with an integrated targeting system that helps you track and hit your target more effectively. Choose a creature you can see within range. For the duration, you gain advantage on the next attack roll you make against that target on each of your turns. Once you make an attack with advantage from this power, you must target a different creature on your next turn or the power ends.",
    higherLevelDescription: "When you cast this power using a tech slot of 3rd level or higher, the range increases to 60 feet, and the power no longer requires concentration.",
    techType: "Weapon"
  },
  {
    id: "shield-overcharge",
    name: "Shield Overcharge",
    level: 1,
    castingTime: "1 action",
    range: "Self",
    duration: "1 hour",
    concentration: false,
    description: "You temporarily boost your shield generator or armor's protective systems. You gain 10 temporary hit points for the duration. If a creature hits you with a melee attack while you have these temporary hit points, the creature takes 5 force damage.",
    higherLevelDescription: "When you cast this power using a tech slot of 2nd level or higher, both the temporary hit points and the force damage increase by 5 for each slot level above 1st.",
    techType: "Modification"
  },
  {
    id: "detect-bioforms",
    name: "Detect Bioforms",
    level: 1,
    castingTime: "1 action",
    range: "Self",
    duration: "Concentration, up to 10 minutes",
    concentration: true,
    description: "For the duration, you can sense the presence of living creatures within 30 feet of you that aren't constructs or undead. You can tell the size of the creatures (Small, Medium, Large, etc.) but not their specific identity. The power can penetrate most barriers, but it is blocked by 1 foot of stone, 1 inch of metal, a thin sheet of lead, or 3 feet of wood or dirt.",
    higherLevelDescription: "When you cast this power using a tech slot of 2nd level or higher, you can detect specific types of creatures (humanoid, beast, etc.), and the range increases by 30 feet for each slot level above 1st.",
    techType: "Gadget"
  },
  
  // 2nd level powers
  {
    id: "override-systems",
    name: "Override Systems",
    level: 2,
    castingTime: "1 action",
    range: "60 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    description: "You attempt to seize control of a mechanical or electronic system within range. This can be a droid, a computer terminal, an electronic door, or any similar technological device. If the target is a droid or construct, it must make an Intelligence saving throw. On a failed save, you control the target's actions for the duration. On a successful save, the target is immune to this power for 24 hours. While controlling a droid, you can use your action to have it take an action or move on its current turn. If the target is a non-sentient system or device, you automatically take control of it, potentially bypassing security measures or operating it remotely.",
    higherLevelDescription: "When you cast this power using a tech slot of 4th level or higher, the duration increases to 10 minutes. At 6th level or higher, the duration increases to 1 hour.",
    techType: "Programming"
  },
  {
    id: "jet-propulsion",
    name: "Jet Propulsion",
    level: 2,
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Concentration, up to 10 minutes",
    concentration: true,
    description: "You activate a miniature jet propulsion system, granting yourself a flying speed of 30 feet for the duration. When the power ends, if you are still aloft, you fall unless you can stop the fall.",
    higherLevelDescription: "When you cast this power using a tech slot of 3rd level or higher, the flying speed increases by 10 feet for each slot level above 2nd.",
    techType: "Modification"
  },
  
  // 3rd level powers
  {
    id: "plasma-shield",
    name: "Plasma Shield",
    level: 3,
    castingTime: "1 action",
    range: "Self",
    duration: "10 minutes",
    concentration: true,
    description: "You generate an energy shield that provides significant protection. For the duration, you gain a +2 bonus to AC, and you have resistance to energy, ion, and kinetic damage.",
    higherLevelDescription: "When you cast this power using a tech slot of 5th level or higher, you can target up to three creatures within 30 feet.",
    techType: "Gadget"
  },
  {
    id: "energy-beam",
    name: "Energy Beam",
    level: 3,
    castingTime: "1 action",
    range: "120 feet",
    duration: "Instantaneous",
    concentration: false,
    description: "You fire a powerful energy beam from a wrist-mounted projector or similar device. Each creature in a 5-foot-wide, 120-foot-long line must make a Dexterity saving throw. A creature takes 8d6 energy damage on a failed save, or half as much damage on a successful one.",
    higherLevelDescription: "When you cast this power using a tech slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
    techType: "Weapon"
  },
  
  // 5th level power
  {
    id: "armory-projection",
    name: "Armory Projection",
    level: 5,
    castingTime: "1 action",
    range: "Self",
    duration: "Concentration, up to 10 minutes",
    concentration: true,
    description: "You use advanced holographic and energy manipulation technology to manifest a complete arsenal of weaponry that hovers around you. For the duration, you gain the following benefits:\n\n- You gain a +3 bonus to AC\n- You can make a ranged weapon attack as a bonus action, dealing 3d6 energy damage on a hit\n- When a creature within 10 feet of you hits you with a melee attack, it takes 2d6 energy damage\n- At the start of each of your turns, you gain 10 temporary hit points",
    higherLevelDescription: "When you cast this power using a tech slot of 7th level or higher, the bonus action attack damage increases to 4d6, and the reactive damage increases to 3d6.",
    techType: "Weapon"
  }
];

// Helper function to get powers by level
export function getPowersByLevel(level: number): TechPower[] {
  return techPowers.filter(power => power.level === level);
}

// Helper function to get powers by tech type
export function getPowersByType(type: TechPower['techType']): TechPower[] {
  return techPowers.filter(power => power.techType === type);
}

// Helper to find a power by ID
export function findPowerById(id: string): TechPower | undefined {
  return techPowers.find(power => power.id === id);
}