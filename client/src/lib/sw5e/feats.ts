// Feats data for SW5E
export interface Feat {
  id: string;
  name: string;
  description: string;
  prerequisites?: string[];
  category: "Combat" | "Force" | "General" | "Tech" | "Species" | "Tradition";
  benefits: string[];
}

export const feats: Feat[] = [
  // Combat Feats
  {
    id: "accurate-shot",
    name: "Accurate Shot",
    description: "You have mastered techniques to improve your ranged attacks in combat.",
    category: "Combat",
    benefits: [
      "You gain a +1 bonus to attack rolls you make with ranged weapons.",
      "When you make a ranged attack roll against a creature within 5 feet of an ally, you don't have disadvantage on the attack roll.",
      "When you hit a creature with a ranged weapon attack, it must succeed on a Strength saving throw (DC = 8 + your proficiency bonus + your Dexterity modifier) or be moved 5 feet in any horizontal direction of your choice."
    ]
  },
  {
    id: "alert",
    name: "Alert",
    description: "You are always vigilant and ready for danger.",
    category: "General",
    benefits: [
      "You gain a +5 bonus to initiative.",
      "You can't be surprised while you are conscious.",
      "Other creatures don't gain advantage on attack rolls against you as a result of being hidden from you."
    ]
  },
  {
    id: "armor-master",
    name: "Armor Master",
    description: "You have trained extensively in the use of armor, gaining the following benefits:",
    prerequisites: ["Proficiency with medium armor"],
    category: "Combat",
    benefits: [
      "Increase your Strength or Constitution score by 1, to a maximum of 20.",
      "You gain proficiency with heavy armor.",
      "While wearing armor, bludgeoning, slashing, and piercing damage that you take from non-enhanced weapons is reduced by 3."
    ]
  },
  {
    id: "blade-master",
    name: "Blade Master",
    description: "You have mastered techniques with bladed weapons, gaining the following benefits:",
    prerequisites: ["Proficiency with martial vibroweapons or martial lightweapons"],
    category: "Combat",
    benefits: [
      "You gain a +1 bonus to attack rolls you make with vibroweapons and lightweapons.",
      "When you roll a 1 or 2 on a damage die for an attack you make with a vibroweapon or lightweapon, you can reroll the die and must use the new roll, even if the new roll is a 1 or a 2.",
      "When you score a critical hit with a vibroweapon or lightweapon, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit."
    ]
  },
  
  // Force Feats
  {
    id: "force-sensitive",
    name: "Force Sensitive",
    description: "You have awakened to a rudimentary connection to the Force, gaining the following benefits:",
    category: "Force",
    benefits: [
      "Increase your Wisdom or Charisma score by 1, to a maximum of 20.",
      "You learn two force powers of your choice from the universal powers. Wisdom or Charisma is your forcecasting ability for these powers (choose when you select this feat).",
      "You gain a number of force points equal to your proficiency bonus. You regain all expended force points when you finish a long rest."
    ]
  },
  {
    id: "force-mastery",
    name: "Force Mastery",
    description: "You have achieved a greater understanding of the Force, enhancing your abilities to manipulate it.",
    prerequisites: ["The ability to cast at least one force power"],
    category: "Force",
    benefits: [
      "Increase your forcecasting ability score by 1, to a maximum of 20.",
      "You gain additional force points equal to your proficiency bonus.",
      "When you cast a force power that requires concentration and another creature attempts to break your concentration, you have advantage on the Constitution saving throw to maintain concentration."
    ]
  },
  {
    id: "light-side-adept",
    name: "Light Side Adept",
    description: "You have dedicated yourself to the light side of the Force and have learned to channel its energy more effectively.",
    prerequisites: ["The ability to cast at least one force power"],
    category: "Force",
    benefits: [
      "When you cast a light side force power, you can choose to spend 1 additional force point to cast the power as if you spent a force point 1 level higher than you actually spent.",
      "You gain resistance to dark side damage.",
      "Once per long rest, when you or a friendly creature within 30 feet would take damage, you can use your reaction to reduce that damage by an amount equal to your forcecasting ability modifier + your proficiency bonus."
    ]
  },
  {
    id: "dark-side-adept",
    name: "Dark Side Adept",
    description: "You have embraced the dark side of the Force and have learned to channel its raw power.",
    prerequisites: ["The ability to cast at least one force power"],
    category: "Force",
    benefits: [
      "When you cast a dark side force power, you can choose to take damage equal to your character level to increase the power's save DC by 2.",
      "You gain resistance to light side damage.",
      "Once per long rest, you can use your action to increase your size by one category. This transformation lasts for 1 minute or until you end it as a bonus action. While transformed, you gain temporary hit points equal to your level, your reach increases by 5 feet, and you have advantage on Strength checks and Strength saving throws."
    ]
  },
  
  // Tech Feats
  {
    id: "tech-expert",
    name: "Tech Expert",
    description: "You've developed expertise with technology, gaining the following benefits:",
    category: "Tech",
    benefits: [
      "Increase your Intelligence score by 1, to a maximum of 20.",
      "You gain proficiency with tech items. If you are already proficient with them, you add double your proficiency bonus to checks you make with them.",
      "You can use tech items as a spellcasting focus for your tech powers.",
      "You can cast the energy surge tech power at will. Intelligence is your techcasting ability for this power."
    ]
  },
  {
    id: "enhanced-cybertech",
    name: "Enhanced Cybertech",
    description: "You have augmented your body with cybernetic implants that enhance your capabilities.",
    category: "Tech",
    benefits: [
      "Increase your Constitution, Intelligence, or Dexterity score by 1, to a maximum of 20.",
      "Choose one of the following benefits:\n  - Cybernetic Limb: You gain advantage on Strength (Athletics) checks made to climb or jump.\n  - Neural Interface: You can cast one tech power you know as a bonus action once per long rest.\n  - Targeting Implant: You ignore half and three-quarters cover for ranged attacks.\n  - Reflex Enhancer: You can take the Dash or Disengage action as a bonus action."
    ]
  },
  
  // General Feats
  {
    id: "linguist",
    name: "Linguist",
    description: "You have studied languages and codes, gaining the following benefits:",
    category: "General",
    benefits: [
      "Increase your Intelligence score by 1, to a maximum of 20.",
      "You learn three languages of your choice.",
      "You can ably create written ciphers. Others can't decipher a code you create unless you teach them, they succeed on an Intelligence check (DC equal to your Intelligence score + your proficiency bonus), or they use technology to break the code."
    ]
  },
  {
    id: "tough",
    name: "Tough",
    description: "Your hardy constitution allows you to endure more physical punishment than most.",
    category: "General",
    benefits: [
      "Your hit point maximum increases by an amount equal to twice your level when you gain this feat. Whenever you gain a level thereafter, your hit point maximum increases by an additional 2 hit points."
    ]
  },
  {
    id: "wary-combatant",
    name: "Wary Combatant",
    description: "You've developed a cautious combat style focused on defense.",
    category: "Combat",
    benefits: [
      "When a creature you can see attacks you and you are not incapacitated, you can use your reaction to impose disadvantage on the attack roll. Once you use this ability, you must finish a short or long rest before you can use it again.",
      "When you are subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you can use your reaction to take no damage if you succeed on the saving throw. Once you use this ability, you must finish a short or long rest before you can use it again.",
      "You can take the Dodge action as a bonus action. Once you use this ability, you must finish a short or long rest before you can use it again."
    ]
  }
];

// Helper function to get feats by category
export function getFeatsByCategory(category: Feat['category']): Feat[] {
  return feats.filter(feat => feat.category === category);
}

// Helper to find a feat by ID
export function findFeatById(id: string): Feat | undefined {
  return feats.find(feat => feat.id === id);
}

// Helper to filter feats by prerequisites (returns feats that a character might qualify for)
export function getFeatsWithPrerequisites(playerClass: string, abilities: Record<string, number>, proficiencies: string[]): Feat[] {
  return feats.filter(feat => {
    // If feat has no prerequisites, include it
    if (!feat.prerequisites || feat.prerequisites.length === 0) return true;
    
    // Otherwise check each prerequisite
    return feat.prerequisites.every(prereq => {
      // Medium/heavy armor proficiency check
      if (prereq.includes("Proficiency with medium armor") && proficiencies.some(p => p.includes("medium armor"))) {
        return true;
      }
      if (prereq.includes("Proficiency with heavy armor") && proficiencies.some(p => p.includes("heavy armor"))) {
        return true;
      }
      
      // Weapon proficiency checks
      if (prereq.includes("Proficiency with martial vibroweapons") && proficiencies.some(p => p.includes("martial vibroweapons"))) {
        return true;
      }
      if (prereq.includes("Proficiency with martial lightweapons") && proficiencies.some(p => p.includes("martial lightweapons"))) {
        return true;
      }
      
      // Force ability check
      if (prereq.includes("The ability to cast at least one force power")) {
        // Check if character's class can cast force powers
        const forceClasses = ["consular", "guardian", "sentinel"];
        return forceClasses.includes(playerClass.toLowerCase());
      }
      
      // Level check (for future use)
      if (prereq.includes("level")) {
        // Check if character meets level requirement
        // This would need character level information
      }
      
      return false;
    });
  });
}