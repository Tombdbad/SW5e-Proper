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
    description:
      "Berserkers who follow the Path of the Juggernaut exalt in their ability to endure punishment and keep fighting when others would fall. They use their bulk and resilience to protect allies and crush enemies.",
    flavorText:
      "Some berserkers are living walls, able to absorb incredible punishment and remain standing. These berserkers walk the Path of the Juggernaut, becoming nearly unstoppable forces on the battlefield.",
    features: [
      {
        level: 3,
        name: "Unbreakable Defense",
        description:
          "Starting when you choose this path at 3rd level, while you are raging and not wearing heavy armor, you gain resistance to all damage except psychic damage. Additionally, if you aren't wearing armor, your AC equals 10 + your Constitution modifier + your Dexterity modifier.",
      },
      {
        level: 3,
        name: "Threatening Presence",
        description:
          "Also at 3rd level, your imposing presence intimidates those who would harm others. When a creature within 5 feet of you makes an attack against a target other than you, you can use your reaction to make a melee weapon attack against that creature.",
      },
      {
        level: 6,
        name: "Unstoppable Momentum",
        description:
          "Beginning at 6th level, you are exceptionally difficult to stop once you're in motion. You can take the Dash action as a bonus action. Additionally, when you move at least 20 feet in a straight line immediately before making a melee weapon attack, you gain a bonus to the damage roll equal to your Constitution modifier (minimum of +1).",
      },
      {
        level: 10,
        name: "Living Fortress",
        description:
          "Starting at 10th level, your body becomes accustomed to punishment. You have advantage on Constitution saving throws to maintain concentration on powers when you take damage. Furthermore, when you are subjected to an effect that allows you to make a Strength or Constitution saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.",
      },
      {
        level: 14,
        name: "Overwhelming Force",
        description:
          "At 14th level, you can channel your rage into devastating attacks. While you're raging, when you score a critical hit with a melee weapon attack or reduce a creature to 0 hit points with one, you can make one additional melee weapon attack as part of the same action. If this additional attack also scores a critical hit or reduces a creature to 0 hit points, you can make another attack, and so on. You can make a maximum number of these additional attacks equal to your Constitution modifier (minimum of 1).",
      },
    ],
  },
  {
    id: "wampa",
    name: "Path of the Wampa",
    parentClass: "berserker",
    description:
      "Berserkers who follow the Path of the Wampa channel the ferocity and predatory instincts of one of the galaxy's most feared creatures, becoming terror-inducing engines of destruction in combat.",
    flavorText:
      "The wampa—a terrifying predator known throughout the galaxy for its savage strength and brutal hunting tactics. Berserkers who follow this path embrace their inner beast, becoming more monstrous and powerful as they rage.",
    features: [
      {
        level: 3,
        name: "Predatory Strike",
        description:
          "Starting when you choose this path at 3rd level, your unarmed strikes count as natural weapons that deal 1d6 kinetic damage. While you are raging, your natural weapons count as enhanced for the purpose of overcoming resistance and immunity to nonenhanced attacks and damage. Additionally, when you hit a creature with your natural weapons while raging, you can use a bonus action to attempt to grapple the target.",
      },
      {
        level: 3,
        name: "Fearsome Presence",
        description:
          "Also at 3rd level, you can channel your rage to strike fear into your enemies. When you enter your rage, each creature of your choice within 30 feet of you must succeed on a Wisdom saving throw (DC equal to 8 + your proficiency bonus + your Constitution modifier) or be frightened of you until the end of your next turn.",
      },
      {
        level: 6,
        name: "Hibernation",
        description:
          "Beginning at 6th level, you can enter a state of suspended animation to heal your wounds. At the end of a short rest, you can expend one use of your rage to enter a hibernation state for 1 hour. At the end of this time, you regain hit points equal to half your hit point maximum. Once you use this feature, you must finish a long rest before you can use it again.",
      },
      {
        level: 10,
        name: "Territorial Fury",
        description:
          "Starting at 10th level, when a creature enters your reach, you can use your reaction to make a melee weapon attack against that creature. Additionally, while you are raging, you have advantage on attack rolls against any creature that is frightened of you.",
      },
      {
        level: 14,
        name: "Monstrous Transformation",
        description:
          "At 14th level, you can transform into a truly terrifying predator. As an action, you can expend two uses of your rage to enhance your physical form for 1 minute. You increase your size by one category, your reach increases by 5 feet, and you gain temporary hit points equal to your berserker level + your Constitution modifier. Additionally, your natural weapons deal an extra 1d6 kinetic damage, and when you hit a creature with them, the target must succeed on a Strength saving throw (DC equal to 8 + your proficiency bonus + your Strength modifier) or be knocked prone. Once you use this feature, you can't use it again until you finish a long rest.",
      },
    ],
  },
  {
    id: "rage",
    name: "Path of Rage",
    parentClass: "berserker",
    description:
      "Berserkers who follow the Path of Rage focus entirely on channeling their inner fury, becoming whirlwinds of destruction on the battlefield that can sustain their rage far longer than other berserkers.",
    flavorText:
      "Some berserkers embrace rage as their ultimate tool, honing it to perfection. These warriors can channel their fury to perform incredible feats of strength and endurance, sometimes appearing to be possessed by the very concept of rage itself.",
    features: [
      {
        level: 3,
        name: "Extended Rage",
        description:
          "Starting when you choose this path at 3rd level, your rage is particularly persistent. Your rage lasts for 1 minute, and it doesn't end early unless you fall unconscious or choose to end it. Additionally, you can use your bonus action to add additional rounds to your rage equal to your Constitution modifier (minimum of 1).",
      },
      {
        level: 3,
        name: "Furious Strike",
        description:
          "Also at 3rd level, while raging, the first creature you hit with a melee weapon attack on your turn becomes marked until the start of your next turn. While a creature is marked in this way, your melee weapon attacks against it have advantage.",
      },
      {
        level: 6,
        name: "Relentless Rage",
        description:
          "Beginning at 6th level, your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while raging and don't die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead. Each time you use this feature after the first, the DC increases by 5. When you finish a short or long rest, the DC resets to 10.",
      },
      {
        level: 10,
        name: "Devastating Critical",
        description:
          "Starting at 10th level, your critical hits become especially savage. When you score a critical hit with a melee weapon attack while raging, you roll one additional weapon damage die when determining the extra damage for the critical hit.",
      },
      {
        level: 14,
        name: "Unstoppable Fury",
        description:
          "At 14th level, you can channel your rage into a state of unstoppable fury. While raging, you can use your bonus action to enter this state, gaining the following benefits for 1 minute: your speed increases by 15 feet, you gain a +2 bonus to attack and damage rolls with strength-based attacks, and you have advantage on Strength checks and saving throws. Once you use this feature, you can't use it again until you finish a long rest.",
      },
    ],
  },

  // Scholar Archetypes
  {
    id: "physician",
    name: "Physician Tradition",
    parentClass: "scholar",
    description:
      "Physicians focus on medical knowledge and healing techniques. They excel at keeping their allies alive and functioning at peak performance through both conventional and innovative treatments.",
    flavorText:
      "In a galaxy filled with dangers, physicians are the vital lifeline that keeps teams and crews alive. Their expertise in medicine, anatomy, and healing technologies makes them invaluable members of any expedition or military unit.",
    features: [
      {
        level: 3,
        name: "Medical Expertise",
        description:
          "When you choose this tradition at 3rd level, you gain proficiency with med kits. If you are already proficient with them, you gain expertise with them instead, doubling your proficiency bonus for checks made with them. Additionally, when you use a med kit to stabilize a dying creature, that creature also regains 1 hit point.",
      },
      {
        level: 3,
        name: "Physician's Touch",
        description:
          "Also at 3rd level, you can use your action to touch a creature and restore a number of hit points equal to 1d8 + your Intelligence modifier. You can use this feature a number of times equal to your Intelligence modifier (minimum of once). You regain all expended uses when you finish a long rest.",
      },
      {
        level: 6,
        name: "Improved Treatment",
        description:
          "Beginning at 6th level, you've mastered advanced medical techniques. When you cast a tech power that restores hit points, you can add your Intelligence modifier to the amount of hit points restored. Additionally, when you or an ally within 30 feet of you rolls a Hit Die to regain hit points, you can use your reaction to allow them to reroll the die and take the higher result.",
      },
      {
        level: 10,
        name: "Emergency Response",
        description:
          "Starting at 10th level, your ability to respond to medical emergencies is unparalleled. You can cast the cure wounds power as a bonus action once per short or long rest. Additionally, when an ally within 30 feet of you is reduced to 0 hit points, you can use your reaction to move up to your speed toward them without provoking opportunity attacks.",
      },
      {
        level: 14,
        name: "Miraculous Recovery",
        description:
          "At 14th level, you can perform medical miracles. Once per long rest, you can touch a creature and end one of the following conditions affecting it: blinded, deafened, paralyzed, poisoned, or stunned. Alternatively, you can reduce the creature's exhaustion level by one or restore hit points equal to half the creature's hit point maximum.",
      },
    ],
  },
  {
    id: "researcher",
    name: "Researcher Tradition",
    parentClass: "scholar",
    description:
      "Researchers are dedicated to expanding knowledge in all its forms. They specialize in collecting information, analyzing data, and making groundbreaking discoveries.",
    flavorText:
      "The galaxy is filled with mysteries waiting to be uncovered. Researchers peer into the unknown with curious minds, bringing to light truths that others might never discover.",
    features: [
      {
        level: 3,
        name: "Academic Specialization",
        description:
          "When you choose this tradition at 3rd level, you gain proficiency in two of the following skills of your choice: History, Investigation, Nature, or Technology. If you already have proficiency in either of these skills, you gain expertise in that skill, doubling your proficiency bonus for checks made with it.",
      },
      {
        level: 3,
        name: "Scholarly Insight",
        description:
          "Also at 3rd level, you can use your bonus action to analyze a creature you can see within 60 feet. Make an Intelligence (Investigation) check contested by the target's Charisma (Deception) check. If you succeed, you learn one of the following characteristics of your choice about the target: damage vulnerabilities, damage resistances, damage immunities, or condition immunities. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 6,
        name: "Eureka Moment",
        description:
          "Beginning at 6th level, your research allows you to make unexpected discoveries. After you finish a short or long rest, roll two d20s and record the numbers rolled. You can replace any attack roll, saving throw, or ability check made by you or a creature that you can see with one of these rolls. You must choose to do so before the roll, and you can replace a roll in this way only once per turn. Each die can be used only once, and you lose any unused dice when you finish your next short or long rest.",
      },
      {
        level: 10,
        name: "Brilliant Analysis",
        description:
          "Starting at 10th level, when you use your action to Search, you can also make a DC 15 Intelligence (Investigation) check. On a success, you identify the most valuable or powerful item within 30 feet of you. Additionally, when you make an Intelligence check related to analyzing objects, technology, or situations, you can add your proficiency bonus twice.",
      },
      {
        level: 14,
        name: "Scientific Breakthrough",
        description:
          "At 14th level, your research unlocks revolutionary techniques. Choose three tech powers of 4th level or lower that you know. You can cast each of them once without expending tech points. Once you cast a power in this way, you must finish a long rest before you can do so again with that power. You also add your Intelligence modifier to the damage or healing of any tech power you cast.",
      },
    ],
  },

  // Consular Archetypes
  {
    id: "sage",
    name: "Sage Consular",
    parentClass: "consular",
    description:
      "Sages are masters of Force knowledge and wisdom, delving into ancient mysteries and seeking enlightenment. They are the scholars and teachers of the Force, using their knowledge to guide others.",
    flavorText:
      "The Sage walks a path of knowledge and enlightenment, seeking to understand the deepest mysteries of the Force. They are the keepers of wisdom, historians, and mentors who guide others toward understanding.",
    features: [
      {
        level: 3,
        name: "Force Sensitivity",
        description:
          "Beginning when you choose this tradition at 3rd level, you gain proficiency in the History and Religion skills. Additionally, you can add your Wisdom modifier to Intelligence (History) checks related to Force traditions and lore.",
      },
      {
        level: 3,
        name: "Knowledge of the Force",
        description:
          "Also at 3rd level, you've studied force powers extensively. You learn one additional force power of your choice from the consular power list. Additionally, whenever you gain a level in this class, you can replace one force power you know with another one from the consular power list.",
      },
      {
        level: 6,
        name: "Mental Fortress",
        description:
          "Starting at 6th level, your deep understanding of the Force provides mental protection. You gain proficiency in Wisdom saving throws. If you already have this proficiency, you gain proficiency in Intelligence or Charisma saving throws (your choice). Additionally, you have advantage on saving throws against being charmed or frightened.",
      },
      {
        level: 10,
        name: "Force Guidance",
        description:
          "Beginning at 10th level, you can channel the Force to guide yourself and others. As a bonus action, you can expend a force point to grant yourself or a creature you can see within 60 feet advantage on ability checks for 1 minute. Additionally, when you or a creature you can see within 60 feet makes an ability check, you can use your reaction to allow them to add your Wisdom modifier to the roll after seeing the result but before knowing if it succeeds or fails. You can use this reaction feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 14,
        name: "Force Enlightenment",
        description:
          "At 14th level, your connection to the cosmic Force grants you profound insight. You gain truesight out to a range of 30 feet. Additionally, once per long rest, you can meditate for 1 minute to receive a vision related to a question or problem you face. The vision provides clarity and insight, giving you advantage on all Intelligence and Wisdom checks related to that specific question or problem for the next 24 hours.",
      },
    ],
  },
  {
    id: "niman",
    name: "Niman Consular",
    parentClass: "consular",
    description:
      "Niman consulars blend Force power with lightsaber combat, maintaining a perfect balance between the two disciplines. They embody moderation and harmony in their approach to the Force.",
    flavorText:
      "The Way of the Rancor, the Way of the Diplomat, the Moderation Form—Niman is known by many names. These consulars hold the deep belief that true mastery comes from balance, blending lightsaber skill with Force prowess.",
    features: [
      {
        level: 3,
        name: "Balanced Training",
        description:
          "Beginning when you choose this tradition at 3rd level, you gain proficiency with lightsabers. Additionally, when you use the Attack action with a lightsaber on your turn, you can use a bonus action to make an unarmed strike or shove a creature.",
      },
      {
        level: 3,
        name: "Force-Empowered Strikes",
        description:
          "Also at 3rd level, you learn to channel the Force through your weapon attacks. Once on each of your turns when you hit a creature with a lightsaber attack, you can deal an extra 1d8 damage of the same type as your lightsaber deals. When you reach 11th level, this extra damage increases to 2d8.",
      },
      {
        level: 6,
        name: "Deflection Training",
        description:
          "Starting at 6th level, when you are wielding a lightsaber and are hit by a ranged weapon attack, you can use your reaction to reduce the damage by an amount equal to your Wisdom modifier + your proficiency bonus. If you reduce the damage to 0, you can reflect the attack back at the attacker, making a ranged attack against them using your force attack bonus.",
      },
      {
        level: 10,
        name: "Telekinetic Combatant",
        description:
          "Beginning at 10th level, you can use the Force to augment your combat abilities. As a bonus action, you can spend 2 force points to gain one of the following benefits for 1 minute: you gain a +2 bonus to AC, your movement speed increases by 15 feet, or your lightsaber attacks deal an extra 1d8 force damage.",
      },
      {
        level: 14,
        name: "Harmonious Flow",
        description:
          "At 14th level, you achieve perfect harmony between force mastery and combat prowess. When you cast a force power of 1st level or higher, you can make one lightsaber attack as a bonus action. Additionally, once per turn when you hit a creature with a lightsaber attack, you regain one force point. You can regain up to your Wisdom modifier force points this way between rests.",
      },
    ],
  },

  // Engineer Archetypes
  {
    id: "armormech",
    name: "Armormech Engineering",
    parentClass: "engineer",
    description:
      "Armormech engineers specialize in creating, modifying, and enhancing armor systems, providing exceptional protection for themselves and their allies.",
    flavorText:
      "Armormech engineers are masters of defensive technology, creating armor systems that can withstand the most punishing environments and attacks. Their expertise can mean the difference between life and death on the battlefield or in hostile environments.",
    features: [
      {
        level: 3,
        name: "Armor Expertise",
        description:
          "When you choose this specialization at 3rd level, you gain proficiency with heavy armor. Additionally, you can modify any armor to enhance its capabilities. As part of a long rest, you can modify one set of armor, granting it one of the following benefits until your next long rest:\n- Increase its AC by 1\n- Remove any Strength requirement\n- Remove disadvantage on Stealth checks\n- Add resistance to a damage type of your choice",
      },
      {
        level: 3,
        name: "Reinforced Plating",
        description:
          "Also at 3rd level, your expertise allows you to reinforce armor to better absorb damage. While wearing armor you have modified, you have resistance to kinetic damage from nonenhanced weapons.",
      },
      {
        level: 5,
        name: "Shield Generator",
        description:
          "Beginning at 5th level, you can install a shield generator in your armor. As a bonus action, you can activate this shield to gain temporary hit points equal to your engineer level + your Intelligence modifier. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 9,
        name: "Advanced Protection Systems",
        description:
          "Starting at 9th level, you can install additional protective systems in your modified armor. Choose two of the following benefits when you modify armor:\n- Fire resistance\n- Cold resistance\n- Lightning resistance\n- Ability to breathe in any environment, including vacuum\n- Immunity to the prone condition\n- Advantage on saving throws against being pushed or pulled",
      },
      {
        level: 15,
        name: "Powered Armor",
        description:
          "At 15th level, you can transform ordinary armor into a powered exoskeleton. Armor you modify grants the wearer the following benefits:\n- Strength score increases by 4, to a maximum of 22\n- Movement speed increases by 10 feet\n- The wearer can make one additional attack when they take the Attack action\n- Jumping distance is tripled\n- Carrying capacity is doubled",
      },
    ],
  },
  {
    id: "armstech",
    name: "Armstech Engineering",
    parentClass: "engineer",
    description:
      "Armstech engineers focus on weapon design and enhancement, pushing the limits of firepower and efficiency to create devastating armaments.",
    flavorText:
      "In a galaxy of conflict, Armstech engineers are prized for their ability to create and enhance weapons beyond factory specifications. They see beauty in precision and power, turning ordinary weapons into extraordinary tools of war.",
    features: [
      {
        level: 3,
        name: "Weapon Expertise",
        description:
          "When you choose this specialization at 3rd level, you gain proficiency with tinker's tools. If you already have this proficiency, you gain proficiency with another tool of your choice. Additionally, you can modify weapons during a short or long rest. Choose one weapon, which gains a +1 bonus to attack and damage rolls until you modify a different weapon.",
      },
      {
        level: 3,
        name: "Customized Weapon",
        description:
          "Also at 3rd level, you can further customize one weapon during a long rest, adding one of the following properties until you customize a different weapon: the weapon deals an extra 1d4 damage of its type, the range increases by 50% for ranged weapons, the weapon ignores half cover, or the weapon gains the light property (if it doesn't already have it).",
      },
      {
        level: 5,
        name: "Overcharge",
        description:
          "Beginning at 5th level, you can overcharge a weapon as a bonus action. The next attack made with that weapon before the end of your turn deals an extra 2d6 energy damage, but the weapon cannot be used again until the end of your next turn as it cools down. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 9,
        name: "Advanced Weaponry",
        description:
          "Starting at 9th level, your weapon modifications become more sophisticated. Choose two of the following benefits when you modify a weapon: it deals an extra 1d6 damage of the weapon's damage type, it scores a critical hit on a roll of 19 or 20, its damage ignores resistance, or attacks made with it have advantage against a specific type of creature you choose when you modify it.",
      },
      {
        level: 15,
        name: "Mastercraft Weapon",
        description:
          "At 15th level, you can create a truly exceptional weapon during a long rest. This mastercraft weapon gains a +2 bonus to attack and damage rolls. Additionally, choose one of the following benefits: the weapon deals maximum damage against objects and structures, the weapon's critical hit range increases by 1 (typically to 18-20), or the weapon gains the siege property, dealing double damage to objects and structures. Once you use this feature, you can't use it again until you finish three long rests.",
      },
    ],
  },

  // Fighter Archetypes
  {
    id: "tactical",
    name: "Tactical Specialist",
    parentClass: "fighter",
    description:
      "Tactical Specialists excel in analyzing the battlefield and adapting to changing situations. They use their intelligence and training to gain advantages in combat.",
    flavorText:
      "Where some fighters rely on brute strength or natural talent, Tactical Specialists study warfare as a science. They are the battlefield commanders, the special forces operatives, and the elite soldiers who can out-think as well as out-fight their opponents.",
    features: [
      {
        level: 3,
        name: "Combat Analysis",
        description:
          "Starting when you choose this archetype at 3rd level, your tactical mind allows you to quickly assess enemies. When you hit a creature with a weapon attack, you can use a bonus action to analyze its fighting style. For the next minute, you gain a +2 bonus to AC against attacks made by that creature. You can use this feature a number of times equal to your Intelligence modifier (minimum of once), and you regain all expended uses when you finish a short or long rest.",
      },
      {
        level: 3,
        name: "Tactical Expertise",
        description:
          "Also at 3rd level, you gain proficiency in two of the following skills of your choice: History, Insight, Investigation, Perception, or Survival. In addition, you can use the Help action as a bonus action.",
      },
      {
        level: 7,
        name: "Combat Maneuvers",
        description:
          "Beginning at 7th level, you learn specialized combat maneuvers that give you an edge in battle. You learn three maneuvers of your choice from the Battle Master Fighter's maneuvers list. You gain two superiority dice, which are d8s. A superiority die is expended when you use it. You regain all expended superiority dice when you finish a short or long rest. When you reach 15th level in this class, your superiority dice turn into d10s.",
      },
      {
        level: 10,
        name: "Tactical Movement",
        description:
          "Starting at 10th level, your understanding of battlefield positioning allows you to move more effectively in combat. You don't provoke opportunity attacks when you move out of an enemy's reach if you move at least 10 feet toward an ally. Additionally, when you take the Disengage action, your movement speed increases by 10 feet for that turn.",
      },
      {
        level: 15,
        name: "Battlefield Commander",
        description:
          "At 15th level, your tactical acumen inspires and coordinates your allies. As a bonus action, you can direct one ally you can see within 60 feet of you to strike. That ally can immediately use their reaction to make one weapon attack with advantage. Additionally, when an ally you can see within 30 feet of you is hit by an attack, you can use your reaction to grant them a bonus to AC equal to your Intelligence modifier (minimum of +1) against that attack, potentially causing it to miss. You can use this reaction feature a number of times equal to your Intelligence modifier, and you regain all expended uses when you finish a long rest.",
      },
    ],
  },
  {
    id: "blademaster",
    name: "Blademaster",
    parentClass: "fighter",
    description:
      "Blademasters dedicate themselves to the mastery of melee weapons, becoming unparalleled duelists and warriors through discipline and technique.",
    flavorText:
      "To a Blademaster, combat is an art form requiring perfect execution. They train relentlessly to achieve mastery over their chosen weapons, turning basic attacks into devastating displays of skill and precision.",
    features: [
      {
        level: 3,
        name: "Fighting Style: Dueling",
        description:
          "Starting when you choose this archetype at 3rd level, you adopt a particular style of fighting as your specialty. If you already have the Dueling fighting style, you can choose a different one. When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
      },
      {
        level: 3,
        name: "Blade Techniques",
        description:
          "Also at 3rd level, you master special techniques that require precision and control. You learn two techniques of your choice, which are detailed at the end of the class description. You learn an additional technique at 7th, 10th, and 15th level. Each time you learn a new technique, you can also replace one technique you know with a different one.",
      },
      {
        level: 7,
        name: "Improved Critical",
        description:
          "Beginning at 7th level, your weapon attacks score a critical hit on a roll of 19 or 20. Additionally, when you score a critical hit with a melee weapon, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit.",
      },
      {
        level: 10,
        name: "Superior Defense",
        description:
          "Starting at 10th level, your mastery of weapon techniques includes defensive maneuvers. While you are wielding a melee weapon with which you are proficient, you gain a +1 bonus to AC. Additionally, when you are hit by a melee attack, you can use your reaction to increase your AC by your proficiency bonus against that attack, potentially causing it to miss. You can use this reaction a number of times equal to your Dexterity modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 15,
        name: "Master Strike",
        description:
          "At 15th level, you can channel your precision and skill into a devastating attack. When you take the Attack action on your turn, you can forgo one of your attacks to make a master strike. Make a single weapon attack. If this attack hits, it deals an extra 10d6 damage of the weapon's type. Once you use this feature, you can't use it again until you finish a short or long rest.",
      },
    ],
  },
  {
    id: "battlemaster",
    name: "Battle Master",
    parentClass: "fighter",
    description:
      "Battle Masters study weapons and combat techniques, becoming skilled in a variety of advanced maneuvers that can disarm, trip, frighten, or otherwise hinder their foes.",
    flavorText:
      "Battle Masters are fighters who have honed their combat skills to a fine edge. They view combat as both art and science, employing precision maneuvers alongside raw martial power.",
    features: [
      {
        level: 3,
        name: "Combat Superiority",
        description:
          "When you choose this archetype at 3rd level, you learn maneuvers that are fueled by special dice called superiority dice. You learn three maneuvers of your choice from the list below. Many maneuvers enhance an attack in some way. You can use only one maneuver per attack. You gain four superiority dice, which are d8s. A superiority die is expended when you use it. You regain all of your expended superiority dice when you finish a short or long rest. You learn two additional maneuvers of your choice at 7th, 10th, and 15th level. Each time you learn new maneuvers, you can also replace one maneuver you know with a different one.",
      },
      {
        level: 3,
        name: "Student of War",
        description:
          "At 3rd level, you gain proficiency with one type of artisan's tools of your choice.",
      },
      {
        level: 7,
        name: "Know Your Enemy",
        description:
          "Starting at 7th level, if you spend at least 1 minute observing or interacting with another creature outside combat, you can learn certain information about its capabilities compared to your own. The DM tells you if the creature is your equal, superior, or inferior in regard to two of the following characteristics of your choice: Strength score, Dexterity score, Constitution score, Armor Class, current hit points, total class levels (if any), fighter class levels (if any).",
      },
      {
        level: 10,
        name: "Improved Combat Superiority",
        description:
          "At 10th level, your superiority dice turn into d10s. At 18th level, they turn into d12s.",
      },
      {
        level: 15,
        name: "Relentless",
        description:
          "Starting at 15th level, when you roll initiative and have no superiority dice remaining, you regain 1 superiority die.",
      },
    ],
  },
  {
    id: "guardian",
    name: "Guardian Fighter",
    parentClass: "fighter",
    description:
      "Guardian Fighters specialize in defending allies, controlling the battlefield, and absorbing damage that would otherwise harm their companions.",
    flavorText:
      "Guardian Fighters stand as the shield between their allies and danger. Trained to protect rather than attack, they use their bodies, shields, and tactical knowledge to ensure their companions can fight without fear.",
    features: [
      {
        level: 3,
        name: "Guardian's Challenge",
        description:
          "Starting when you choose this archetype at 3rd level, you can use your bonus action to mark a creature you can see within 10 feet of you. For 1 minute, while the creature is marked, you gain the following benefits: you have advantage on attack rolls against the creature, if the marked target deals damage to anyone other than you, you can use your reaction to make a weapon attack against the marked target if it is within your reach, the marked target has disadvantage on any attack roll that doesn't target you. The mark lasts for 1 minute or until you mark a different creature. You can use this feature a number of times equal to your Constitution modifier (minimum of once), and you regain all expended uses when you finish a long rest.",
      },
      {
        level: 3,
        name: "Shield Master",
        description:
          "Also at 3rd level, you gain proficiency with shields. If you already have this proficiency, you gain proficiency with one type of artisan's tools of your choice. Additionally, when you are wielding a shield and another creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to interpose your shield between the target and the attacker. The attacked creature gains a bonus to AC equal to your proficiency bonus against that attack.",
      },
      {
        level: 7,
        name: "Guardian's Stance",
        description:
          "Beginning at 7th level, as a bonus action, you can enter a defensive stance that lasts until the start of your next turn. While in this stance, you gain the following benefits: you have resistance to bludgeoning, piercing, and slashing damage, opportunity attacks against you are made with disadvantage, and if a creature within 5 feet of you is hit by an attack, you can use your reaction to take the damage instead. Once you use this feature, you can't use it again until you finish a short or long rest.",
      },
      {
        level: 10,
        name: "Defensive Maneuvers",
        description:
          "Starting at 10th level, you can take the Dodge action as a bonus action. Additionally, when you take the Dodge action, your movement speed is not reduced when moving through difficult terrain, and you can move through the space of hostile creatures.",
      },
      {
        level: 15,
        name: "Guardian's Resolve",
        description:
          "At 15th level, your commitment to protecting others grants you extraordinary resilience. You gain immunity to the frightened condition. Additionally, when you drop to 0 hit points but are not killed outright, you can choose to drop to 1 hit point instead. Once you use this feature, you can't use it again until you finish a long rest.",
      },
    ],
  },
];

// Helper functions
export function getArchetypesByClass(className: string): ClassArchetype[] {
  return archetypes.filter(
    (archetype) =>
      archetype.parentClass.toLowerCase() === className.toLowerCase(),
  );
}

export function findArchetypeById(id: string): ClassArchetype | undefined {
  return archetypes.find((archetype) => archetype.id === id);
}

export function getArchetypeFeaturesByLevel(
  archetypeId: string,
  level: number,
): ClassArchetype["features"] {
  const archetype = findArchetypeById(archetypeId);
  if (!archetype) return [];

  return archetype.features.filter((feature) => feature.level <= level);
}
