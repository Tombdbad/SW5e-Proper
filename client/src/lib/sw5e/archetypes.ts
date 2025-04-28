// Archetypes data for SW5E
export interface ClassArchetype {
  id: string;
  name: string;
  parentClass: string;
  description: string;
  flavorText: string;
  features: {
    level: number;
    name: string;
    description: string;
  }[];
}

export const archetypes: ClassArchetype[] = [
  // Berserker Archetypes
  {
    id: "juggernaut",
    name: "Path of the Juggernaut",
    parentClass: "berserker",
    description: "Berserkers who follow the Path of the Juggernaut exalt in their ability to endure punishment and keep fighting when others would fall. They use their bulk and resilience to protect allies and crush enemies.",
    flavorText: "Some berserkers are living walls, able to absorb incredible punishment and remain standing. These berserkers walk the Path of the Juggernaut, becoming nearly unstoppable forces on the battlefield.",
    features: [
      {
        level: 3,
        name: "Unbreakable Defense",
        description: "Starting when you choose this path at 3rd level, while you are raging and not wearing heavy armor, you gain resistance to all damage except psychic damage. Additionally, if you aren't wearing armor, your AC equals 10 + your Constitution modifier + your Dexterity modifier."
      },
      {
        level: 3,
        name: "Threatening Presence",
        description: "Also at 3rd level, your imposing presence intimidates those who would harm others. When a creature within 5 feet of you makes an attack against a target other than you, you can use your reaction to make a melee weapon attack against that creature."
      },
      {
        level: 6,
        name: "Unstoppable Momentum",
        description: "Beginning at 6th level, you are exceptionally difficult to stop once you're in motion. You can take the Dash action as a bonus action. Additionally, when you move at least 20 feet in a straight line immediately before making a melee weapon attack, you gain a bonus to the damage roll equal to your Constitution modifier (minimum of +1)."
      },
      {
        level: 10,
        name: "Living Fortress",
        description: "Starting at 10th level, your body becomes accustomed to punishment. You have advantage on Constitution saving throws to maintain concentration on powers when you take damage. Furthermore, when you are subjected to an effect that allows you to make a Strength or Constitution saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail."
      },
      {
        level: 14,
        name: "Overwhelming Force",
        description: "At 14th level, you can channel your rage into devastating attacks. While you're raging, when you score a critical hit with a melee weapon attack or reduce a creature to 0 hit points with one, you can make one additional melee weapon attack as part of the same action. If this additional attack also scores a critical hit or reduces a creature to 0 hit points, you can make another attack, and so on. You can make a maximum number of these additional attacks equal to your Constitution modifier (minimum of 1)."
      }
    ]
  },
  {
    id: "wampa",
    name: "Path of the Wampa",
    parentClass: "berserker",
    description: "Berserkers who follow the Path of the Wampa channel the ferocity and predatory instincts of one of the galaxy's most feared creatures, becoming terror-inducing engines of destruction in combat.",
    flavorText: "The wampa—a terrifying predator known throughout the galaxy for its savage strength and brutal hunting tactics. Berserkers who follow this path embrace their inner beast, becoming more monstrous and powerful as they rage.",
    features: [
      {
        level: 3,
        name: "Predatory Strike",
        description: "Starting when you choose this path at 3rd level, your unarmed strikes count as natural weapons that deal 1d6 kinetic damage. While you are raging, your natural weapons count as enhanced for the purpose of overcoming resistance and immunity to nonenhanced attacks and damage. Additionally, when you hit a creature with your natural weapons while raging, you can use a bonus action to attempt to grapple the target."
      },
      {
        level: 3,
        name: "Fearsome Presence",
        description: "Also at 3rd level, you can channel your rage to strike fear into your enemies. When you enter your rage, each creature of your choice within 30 feet of you must succeed on a Wisdom saving throw (DC equal to 8 + your proficiency bonus + your Constitution modifier) or be frightened of you until the end of your next turn."
      },
      {
        level: 6,
        name: "Hibernation",
        description: "Beginning at 6th level, you can enter a state of suspended animation to heal your wounds. At the end of a short rest, you can expend one use of your rage to enter a hibernation state for 1 hour. At the end of this time, you regain hit points equal to half your hit point maximum. Once you use this feature, you must finish a long rest before you can use it again."
      },
      {
        level: 10,
        name: "Territorial Fury",
        description: "Starting at 10th level, when a creature enters your reach, you can use your reaction to make a melee weapon attack against that creature. Additionally, while you are raging, you have advantage on attack rolls against any creature that is frightened of you."
      },
      {
        level: 14,
        name: "Monstrous Transformation",
        description: "At 14th level, you can transform into a truly terrifying predator. As an action, you can expend two uses of your rage to enhance your physical form for 1 minute. You increase your size by one category, your reach increases by 5 feet, and you gain temporary hit points equal to your berserker level + your Constitution modifier. Additionally, your natural weapons deal an extra 1d6 kinetic damage, and when you hit a creature with them, the target must succeed on a Strength saving throw (DC equal to 8 + your proficiency bonus + your Strength modifier) or be knocked prone. Once you use this feature, you can't use it again until you finish a long rest."
      }
    ]
  },
  
  // Scholar Archetypes
  {
    id: "physician",
    name: "Physician Tradition",
    parentClass: "scholar",
    description: "Physicians focus on medical knowledge and healing techniques. They excel at keeping their allies alive and functioning at peak performance through both conventional and innovative treatments.",
    flavorText: "In a galaxy filled with dangers, physicians are the vital lifeline that keeps teams and crews alive. Their expertise in medicine, anatomy, and healing technologies makes them invaluable members of any expedition or military unit.",
    features: [
      {
        level: 3,
        name: "Medical Expertise",
        description: "When you choose this tradition at 3rd level, you gain proficiency with med kits. If you are already proficient with them, you gain expertise with them instead, doubling your proficiency bonus for checks made with them. Additionally, when you use a med kit to stabilize a dying creature, that creature also regains 1 hit point."
      },
      {
        level: 3,
        name: "Physician's Touch",
        description: "Also at 3rd level, you can use your action to touch a creature and restore a number of hit points equal to 1d8 + your Intelligence modifier. You can use this feature a number of times equal to your Intelligence modifier (minimum of once). You regain all expended uses when you finish a long rest."
      },
      {
        level: 6,
        name: "Improved Treatment",
        description: "Beginning at 6th level, you've mastered advanced medical techniques. When you cast a tech power that restores hit points, you can add your Intelligence modifier to the amount of hit points restored. Additionally, when you or an ally within 30 feet of you rolls a Hit Die to regain hit points, you can use your reaction to allow them to reroll the die and take the higher result."
      },
      {
        level: 10,
        name: "Emergency Response",
        description: "Starting at 10th level, your ability to respond to medical emergencies is unparalleled. You can cast the cure wounds power as a bonus action once per short or long rest. Additionally, when an ally within 30 feet of you is reduced to 0 hit points, you can use your reaction to move up to your speed toward them without provoking opportunity attacks."
      },
      {
        level: 14,
        name: "Miraculous Recovery",
        description: "At 14th level, you can perform medical miracles. Once per long rest, you can touch a creature and end one of the following conditions affecting it: blinded, deafened, paralyzed, poisoned, or stunned. Alternatively, you can reduce the creature's exhaustion level by one or restore hit points equal to half the creature's hit point maximum."
      }
    ]
  },
  
  // Consular Archetypes
  {
    id: "sage",
    name: "Sage Consular",
    parentClass: "consular",
    description: "Sages are masters of Force knowledge and wisdom, delving into ancient mysteries and seeking enlightenment. They are the scholars and teachers of the Force, using their knowledge to guide others.",
    flavorText: "The Sage walks a path of knowledge and enlightenment, seeking to understand the deepest mysteries of the Force. They are the keepers of wisdom, historians, and mentors who guide others toward understanding.",
    features: [
      {
        level: 3,
        name: "Force Sensitivity",
        description: "Beginning when you choose this tradition at 3rd level, you gain proficiency in the History and Religion skills. Additionally, you can add your Wisdom modifier to Intelligence (History) checks related to Force traditions and lore."
      },
      {
        level: 3,
        name: "Knowledge of the Force",
        description: "Also at 3rd level, you've studied force powers extensively. You learn one additional force power of your choice from the consular power list. Additionally, whenever you gain a level in this class, you can replace one force power you know with another one from the consular power list."
      },
      {
        level: 6,
        name: "Mental Fortress",
        description: "Starting at 6th level, your deep understanding of the Force provides mental protection. You gain proficiency in Wisdom saving throws. If you already have this proficiency, you gain proficiency in Intelligence or Charisma saving throws (your choice). Additionally, you have advantage on saving throws against being charmed or frightened."
      },
      {
        level: 10,
        name: "Force Guidance",
        description: "Beginning at 10th level, you can channel the Force to guide yourself and others. As a bonus action, you can expend a force point to grant yourself or a creature you can see within 60 feet advantage on ability checks for 1 minute. Additionally, when you or a creature you can see within 60 feet makes an ability check, you can use your reaction to allow them to add your Wisdom modifier to the roll after seeing the result but before knowing if it succeeds or fails. You can use this reaction feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a long rest."
      },
      {
        level: 14,
        name: "Force Enlightenment",
        description: "At 14th level, your connection to the cosmic Force grants you profound insight. You gain truesight out to a range of 30 feet. Additionally, once per long rest, you can meditate for 1 minute to receive a vision related to a question or problem you face. The vision provides clarity and insight, giving you advantage on all Intelligence and Wisdom checks related to that specific question or problem for the next 24 hours."
      }
    ]
  },
  
  // Engineer Archetypes
  {
    id: "armormech",
    name: "Armormech Engineering",
    parentClass: "engineer",
    description: "Armormech engineers specialize in creating, modifying, and enhancing armor systems, providing exceptional protection for themselves and their allies.",
    flavorText: "Armormech engineers are masters of defensive technology, creating armor systems that can withstand the most punishing environments and attacks. Their expertise can mean the difference between life and death on the battlefield or in hostile environments.",
    features: [
      {
        level: 3,
        name: "Armor Expertise",
        description: "When you choose this specialization at 3rd level, you gain proficiency with heavy armor. Additionally, you can modify any armor to enhance its capabilities. As part of a long rest, you can modify one set of armor, granting it one of the following benefits until your next long rest:\n- Increase its AC by 1\n- Remove any Strength requirement\n- Remove disadvantage on Stealth checks\n- Add resistance to a damage type of your choice"
      },
      {
        level: 3,
        name: "Reinforced Plating",
        description: "Also at 3rd level, your expertise allows you to reinforce armor to better absorb damage. While wearing armor you have modified, you have resistance to kinetic damage from nonenhanced weapons."
      },
      {
        level: 5,
        name: "Shield Generator",
        description: "Beginning at 5th level, you can install a shield generator in your armor. As a bonus action, you can activate this shield to gain temporary hit points equal to your engineer level + your Intelligence modifier. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a long rest."
      },
      {
        level: 9,
        name: "Advanced Protection Systems",
        description: "Starting at 9th level, you can install additional protective systems in your modified armor. Choose two of the following benefits when you modify armor:\n- Fire resistance\n- Cold resistance\n- Lightning resistance\n- Ability to breathe in any environment, including vacuum\n- Immunity to the prone condition\n- Advantage on saving throws against being pushed or pulled"
      },
      {
        level: 15,
        name: "Powered Armor",
        description: "At 15th level, you can transform ordinary armor into a powered exoskeleton. Armor you modify grants the wearer the following benefits:\n- Strength score increases by 4, to a maximum of 22\n- Movement speed increases by 10 feet\n- The wearer can make one additional attack when they take the Attack action\n- Jumping distance is tripled\n- Carrying capacity is doubled"
      }
    ]
  },
  
  // Fighter Archetypes
  {
    id: "tactical",
    name: "Tactical Specialist",
    parentClass: "fighter",
    description: "Tactical Specialists excel in analyzing the battlefield and adapting to changing situations. They use their intelligence and training to gain advantages in combat.",
    flavorText: "Where some fighters rely on brute strength or natural talent, Tactical Specialists study warfare as a science. They are the battlefield commanders, the special forces operatives, and the elite soldiers who can out-think as well as out-fight their opponents.",
    features: [
      {
        level: 3,
        name: "Combat Analysis",
        description: "Starting when you choose this archetype at 3rd level, your tactical mind allows you to quickly assess enemies. When you hit a creature with a weapon attack, you can use a bonus action to analyze its fighting style. For the next minute, you gain a +2 bonus to AC against attacks made by that creature. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a short or long rest."
      },
      {
        level: 3,
        name: "Tactical Expertise",
        description: "Also at 3rd level, you gain proficiency in two of the following skills of your choice: History, Insight, Investigation, Perception, or Survival. In addition, you can use the Help action as a bonus action."
      },
      {
        level: 7,
        name: "Combat Maneuvers",
        description: "Beginning at 7th level, you learn specialized combat maneuvers that give you an edge in battle. You learn three maneuvers of your choice from the Battle Master Fighter's maneuvers list. You gain two superiority dice, which are d8s. A superiority die is expended when you use it. You regain all expended superiority dice when you finish a short or long rest. When you reach 15th level in this class, your superiority dice turn into d10s."
      },
      {
        level: 10,
        name: "Tactical Movement",
        description: "Starting at 10th level, your understanding of battlefield positioning allows you to move more effectively in combat. You don't provoke opportunity attacks when you move out of an enemy's reach if you move at least 10 feet toward an ally. Additionally, when you take the Disengage action, your movement speed increases by 10 feet for that turn."
      },
      {
        level: 15,
        name: "Battlefield Commander",
        description: "At 15th level, your tactical acumen inspires and coordinates your allies. As a bonus action, you can direct one ally you can see within 60 feet of you to strike. That ally can immediately use their reaction to make one weapon attack with advantage. Additionally, when an ally you can see within 30 feet of you is hit by an attack, you can use your reaction to grant them a bonus to AC equal to your Intelligence modifier (minimum of +1) against that attack, potentially causing it to miss. You can use this reaction feature a number of times equal to your Intelligence modifier, and you regain all expended uses when you finish a long rest."
      },
      {
        level: 18,
        name: "Master Tactician",
        description: "At 18th level, your tactical genius reaches its peak. At the start of each combat, you can change your fighting style to any fighting style available to fighters. Additionally, once on each of your turns, when you make a weapon attack against a creature, you can make an additional weapon attack against a different creature that is within 5 feet of the original target and within your reach."
      }
    ]
  }
];

// Helper functions
export function getArchetypesByClass(className: string): ClassArchetype[] {
  return archetypes.filter(archetype => archetype.parentClass.toLowerCase() === className.toLowerCase());
}

export function findArchetypeById(id: string): ClassArchetype | undefined {
  return archetypes.find(archetype => archetype.id === id);
}

export function getArchetypeFeaturesByLevel(archetypeId: string, level: number): ClassArchetype['features'] {
  const archetype = findArchetypeById(archetypeId);
  if (!archetype) return [];
  
  return archetype.features.filter(feature => feature.level <= level);
}