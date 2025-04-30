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
  archetypeLevel?: number;
  tableData?: {
    level: number;
    proficiencyBonus: number;
    features: string[];
    specialColumn?: {
      name: string;
      values: string | number;
    };
  }[];
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
    description: "Berserkers are fearsome warriors who unleash controlled rage in battle. They excel at absorbing and dealing massive damage through sheer physical power. In the Star Wars universe, berserkers might be tribal warriors from primitive worlds, ex-gladiators who fought for entertainment, or individuals who have tapped into primal instincts as a way to survive. Their rage allows them to shrug off injuries that would fell others, making them formidable front-line combatants.",
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
      ["Two vibrodaggers", "Any simple weapon"],
      ["Explorer's pack", "Dungeoneer's pack"],
      ["Four javelins", "Any simple melee weapon"]
    ],
    archetypeLevel: 3,
    features: [
      {
        name: "Unarmored Defense",
        level: 1,
        description: "While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit."
      },
      {
        name: "Rage",
        level: 1,
        description: "On your turn, you can enter a rage as a bonus action. While raging, you gain the following benefits if you aren't wearing heavy armor: You have advantage on Strength checks and Strength saving throws. When you make a melee weapon attack using Strength, you gain a +2 bonus to the damage roll. This bonus increases as you level. You have resistance to bludgeoning, piercing, and slashing damage. Your rage lasts for 1 minute. It ends early if you are knocked unconscious or if your turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then. You can also end your rage on your turn as a bonus action. Once you have raged the maximum number of times for your berserker level, you must finish a long rest before you can rage again. You can rage 2 times at 1st level, 3 at 3rd, 4 at 6th, 5 at 12th, and 6 at 17th."
      },
      {
        name: "Reckless Attack",
        level: 2,
        description: "Starting at 2nd level, you can throw aside all concern for defense to attack with fierce desperation. When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn."
      },
      {
        name: "Danger Sense",
        level: 2,
        description: "At 2nd level, you gain an uncanny sense of when things nearby aren't as they should be, giving you an edge when you dodge away from danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and powers. To gain this benefit, you can't be blinded, deafened, or incapacitated."
      },
      {
        name: "Berserker Path",
        level: 3,
        description: "At 3rd level, you choose a path that shapes the nature of your rage. Choose the Path of the Juggernaut, the Path of the Wampa, or the Path of Rage, all detailed at the end of the class description. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels."
      },
      {
        name: "Ability Score Improvement",
        level: 4,
        description: "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
      },
      {
        name: "Extra Attack",
        level: 5,
        description: "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn."
      },
      {
        name: "Fast Movement",
        level: 5,
        description: "Starting at 5th level, your speed increases by 10 feet while you aren't wearing heavy armor."
      },
      {
        name: "Feral Instinct",
        level: 7,
        description: "By 7th level, your instincts are so honed that you have advantage on initiative rolls. Additionally, if you are surprised at the beginning of combat and aren't incapacitated, you can act normally on your first turn, but only if you enter your rage before doing anything else on that turn."
      },
      {
        name: "Brutal Critical",
        level: 9,
        description: "Beginning at 9th level, you can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack. This increases to two additional dice at 13th level and three additional dice at 17th level."
      },
      {
        name: "Relentless Rage",
        level: 11,
        description: "Starting at 11th level, your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while you're raging and don't die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead. Each time you use this feature after the first, the DC increases by 5. When you finish a short or long rest, the DC resets to 10."
      },
      {
        name: "Persistent Rage",
        level: 15,
        description: "Beginning at 15th level, your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it."
      },
      {
        name: "Indomitable Might",
        level: 18,
        description: "Beginning at 18th level, if your total for a Strength check is less than your Strength score, you can use that score in place of the total."
      },
      {
        name: "Primal Champion",
        level: 20,
        description: "At 20th level, you embody the power of the wilds. Your Strength and Constitution scores increase by 4. Your maximum for those scores is now 24."
      }
    ],
    tableData: [
      { level: 1, proficiencyBonus: 2, features: ["Rage", "Unarmored Defense"], specialColumn: { name: "Rages", values: 2 } },
      { level: 2, proficiencyBonus: 2, features: ["Reckless Attack", "Danger Sense"], specialColumn: { name: "Rages", values: 2 } },
      { level: 3, proficiencyBonus: 2, features: ["Berserker Path"], specialColumn: { name: "Rages", values: 3 } },
      { level: 4, proficiencyBonus: 2, features: ["Ability Score Improvement"], specialColumn: { name: "Rages", values: 3 } },
      { level: 5, proficiencyBonus: 3, features: ["Extra Attack", "Fast Movement"], specialColumn: { name: "Rages", values: 3 } }
    ]
  },
  {
    id: "consular",
    name: "Consular",
    summary: "A Force-wielder who focuses on mastering Force powers and knowledge.",
    description: "Consulars are masters of the Force, focusing on control and knowledge. They wield a vast array of Force powers with precision and insight. Whether Jedi or Sith, or adherents of other Force traditions, consulars study the mysteries of the Force and learn to shape its flow. They often serve as diplomats, scholars, and spiritual leaders, using their deep connection to the Force to guide and influence others. While not as combat-focused as some other Force users, their mastery of Force powers makes them formidable in their own right.",
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
        ["Diplomat's Pack", "Scholar's Pack"],
        ["Light armor", "Exploration clothes"]
      ],
      archetypeLevel: 3,
      features: [
        {
          name: "Force Casting",
          level: 1,
          description: "You can cast force powers using your Force Points. You regain all spent Force Points after a long rest. Your force casting ability is Wisdom or Charisma (your choice when you take this class). You use this ability for your force powers' saving throws and attack rolls. The number of force powers you can know is based on your consular level."
        },
        {
          name: "Force Recovery",
          level: 1,
          description: "Once per day when you finish a short rest, you can regain some of your Force Points. The points you regain are equal to half your consular level (rounded up) + your Wisdom or Charisma modifier (whichever you use for force casting)."
        },
        {
          name: "Force-Empowered Self",
          level: 2,
          description: "Starting at 2nd level, you can use your bonus action to spend a Force Point to empower yourself with the Force for 1 minute. During this time, you gain one of the following benefits of your choice: advantage on Constitution saving throws to maintain concentration on a force power, the ability to add your Wisdom or Charisma modifier to your AC (in addition to your Dexterity modifier), or resistance to kinetic, energy, or ion damage."
        },
        {
          name: "Consular Tradition",
          level: 3,
          description: "At 3rd level, you choose a tradition that shapes your approach to the Force: the Sage, the Niman, or another tradition from Force-using cultures. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels."
        },
        {
          name: "Ability Score Improvement",
          level: 4,
          description: "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
        },
        {
          name: "Force Potency",
          level: 5,
          description: "Beginning at 5th level, when you cast a force power, you can enhance its effects. You spend 1 additional Force Point to have the power ignore resistance to its damage type, treat immunity as resistance instead, or increase its saving throw DC by 2 for one target."
        },
        {
          name: "Force Affinity",
          level: 6,
          description: "At 6th level, your attunement to the Force deepens. Choose a Force alignment: Light, Dark, or Universal. You learn two additional force powers of that alignment, and when you cast force powers of that alignment, you can add your Wisdom or Charisma modifier to one damage or healing roll of the power."
        },
        {
          name: "Force Intensity",
          level: 10,
          description: "Starting at 10th level, when you cast a force power that deals damage, you can spend 2 additional Force Points to maximize the damage instead of rolling. Once you use this feature, you cannot use it again until you complete a short or long rest."
        },
        {
          name: "Force Mastery",
          level: 18,
          description: "At 18th level, you have achieved true mastery of the Force. Choose four force powers that you know. You can cast each of these powers once at their base level without spending Force Points. Once you cast a power in this way, you must finish a long rest before you can do so again."
        },
        {
          name: "Force Transcendence",
          level: 20,
          description: "At 20th level, your connection to the Force reaches its pinnacle. Your Wisdom and Charisma scores increase by 2. Your maximum for those scores is now 22. Additionally, once per long rest, you can enter a state of Force transcendence for 1 minute. During this time, you can hover up to 2 feet above the ground, you have resistance to all damage, and your force powers cost 1 fewer Force Point to cast (minimum of 0)."
        }
      ]
    },
    {
      id: "engineer",
      name: "Engineer",
      summary: "A technical specialist who creates gadgets and enhances technology.",
      description: "Engineers are technical specialists who excel at manipulating technology. They can build, repair, and enhance devices to support their allies. In the Star Wars galaxy, engineers might be ship mechanics, weapons designers, droid programmers, or tech generalists who can handle it all. They bring practical solutions to a party, offering utility in and out of combat with their inventions and modifications. While they may not have the raw combat power of other classes, their versatility and problem-solving abilities make them indispensable team members.",
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
        ["Techie's Pack", "Field Kit"],
        ["Light armor", "Medium armor"],
        ["Tinker's tools", "Slicer's tools"]
      ],
      archetypeLevel: 3,
      features: [
        {
          name: "Tech Casting",
          level: 1,
          description: "You can cast tech powers using Tech Points. You regain all spent Tech Points after a long rest. Your tech casting ability is Intelligence. You use this ability for your tech powers' saving throws and attack rolls. The number of tech powers you can know is based on your engineer level."
        },
        {
          name: "Modify Item",
          level: 1,
          description: "You learn to temporarily modify items to enhance their capabilities. During a short or long rest, you can modify one weapon, set of armor, or tool. Until the end of your next long rest, the item gains a +1 bonus to attack rolls and damage rolls (for weapons), AC (for armor), or ability checks (for tools). You can only have one item modified with this feature at a time."
        },
        {
          name: "Mechanical Expertise",
          level: 2,
          description: "Starting at 2nd level, your understanding of mechanics gives you expertise in technical matters. You gain proficiency in the Technology skill if you don't already have it. Your proficiency bonus is doubled for any ability check you make that uses the Technology skill. Additionally, you can use the Technology skill to identify technological constructs and devices, similar to how other characters might use the Lore skill to identify monsters."
        },
        {
          name: "Engineering Specialization",
          level: 3,
          description: "At 3rd level, you choose a specialization that reflects your approach to engineering: Armormech, Armstech, or another specialization that represents your technical focus. Your choice grants you features at 3rd level and again at 5th, 9th, and 15th levels."
        },
        {
          name: "Ability Score Improvement",
          level: 4,
          description: "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
        },
        {
          name: "Tech Expertise",
          level: 6,
          description: "Beginning at 6th level, when you cast a tech power, you can enhance its effects. You spend 1 additional Tech Point to modify the power in one of the following ways: the power ignores resistance to its damage type, the power affects one additional target within range, or the saving throw DC increases by 2 for one target."
        },
        {
          level: 7,
          name: "Improvised Technology",
          description: "At 7th level, you can quickly improvise technological solutions. As an action, you can expend one tech point to replicate the effect of a tech power or item that you've observed in the last 24 hours, even if you don't know the power. The power's level must be no higher than 1/3 your engineer level (rounded up). Once you use this feature, you must finish a long rest before using it again."
        },
        {
          level: 10,
          name: "Superior Modification",
          description: "Starting at 10th level, your Modify Item feature improves. You can now modify up to three items at once, and the bonus increases to +2. Additionally, you can choose one of the following additional effects for each modified item: it requires no attunement by the wielder, it can be used by anyone regardless of class or proficiency restrictions, or it grants advantage on one specific type of saving throw while held or worn."
        },
        {
          level: 14,
          name: "Tech Mastery",
          description: "At 14th level, you have mastered tech powers to such an extent that certain powers come easily to you. Choose four tech powers that you know. You can cast each of these powers once at their base level without spending Tech Points. Once you cast a power in this way, you must finish a long rest before you can do so again."
        },
        {
          level: 18,
          name: "Mechanical Genius",
          description: "At 18th level, your technical expertise allows you to push technology beyond its normal limits. Once per long rest, when you cast a tech power, you can maximize all numerical effects of the power and ignore its casting time, instead casting it as a bonus action."
        },
        {
          level: 20,
          name: "Technological Paragon",
          description: "At 20th level, your mastery of technology reaches its pinnacle. Your Intelligence score increases by 4. Your maximum for this score is now 24. Additionally, you can create one legendary technological item during a long rest. This item can replicate any tech power you know or provide any reasonable technological benefit. The item functions for 24 hours, after which it becomes inert until you spend another long rest repairing it."
        }
      ]
    },
    {
      id: "fighter",
      name: "Fighter",
      summary: "A master of combat techniques and weapons specialization.",
      description: "Fighters are versatile combat specialists who excel with weapons. They are adaptable and resilient, mastering a variety of fighting styles. In the Star Wars universe, fighters might be mercenaries, soldiers, bounty hunters, or anyone who has devoted significant time to mastering combat techniques. What sets them apart is their tactical knowledge, physical training, and weapon skills rather than Force abilities or technical expertise. They are the backbone of military organizations throughout the galaxy, from the Grand Army of the Republic to the Imperial Military to countless local security forces and mercenary companies.",
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
          ["Light armor", "Medium armor"],
          ["Dungeoneer's pack", "Explorer's pack"],
          ["Two vibroknives", "Two martial weapons of your choice"]
        ],
        archetypeLevel: 3,
        features: [
          {
            name: "Fighting Style",
            level: 1,
            description: "You adopt a particular style of fighting as your specialty. Choose one of the following options. You can't take a Fighting Style option more than once, even if you later get to choose again. Options include: Archery, Defense, Dueling, Great Weapon Fighting, Protection, and Two-Weapon Fighting."
          },
          {
            name: "Second Wind",
            level: 1,
            description: "You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again."
          },
          {
            name: "Action Surge",
            level: 2,
            description: "Starting at 2nd level, you can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action. Once you use this feature, you must finish a short or long rest before you can use it again. Starting at 17th level, you can use it twice before a rest, but only once on the same turn."
          },
          {
            name: "Martial Archetype",
            level: 3,
            description: "At 3rd level, you choose an archetype that you strive to emulate in your combat styles and techniques: Tactical Specialist, Blademaster, Battle Master, or another martial archetype. Your choice grants you features at 3rd level and again at 7th, 10th, 15th, and 18th levels."
          },
          {
            name: "Ability Score Improvement",
            level: 4,
            description: "When you reach 4th level, and again at 6th, 8th, 12th, 14th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
          },
          {
            name: "Extra Attack",
            level: 5,
            description: "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three when you reach 11th level in this class and to four when you reach 20th level in this class."
          },
          {
            name: "Indomitable",
            level: 9,
            description: "Beginning at 9th level, you can reroll a saving throw that you fail. If you do so, you must use the new roll, and you can't use this feature again until you finish a long rest. You can use this feature twice between long rests starting at 13th level and three times between long rests starting at 17th level."
          },
          {
            name: "Superior Fighting Style",
            level: 13,
            description: "At 13th level, your experience and training enhance your fighting style. Based on the Fighting Style you chose at 1st level, you gain an additional benefit: Archery increases your attack bonus from +2 to +4, Defense increases your AC bonus from +1 to +2 while wearing armor, and so on for each fighting style."
          },
          {
            name: "Combat Mastery",
            level: 20,
            description: "At 20th level, you've reached the pinnacle of martial prowess. Your Strength and Dexterity scores increase by 2. Your maximum for those scores is now 22. Additionally, when you roll initiative and have no uses of Action Surge remaining, you regain one use."
          }
        ]
      },
      {
        id: "guardian",
        name: "Guardian",
        summary: "A Force-wielder who combines combat skills with Force powers.",
        description: "Guardians blend martial prowess with Force abilities. They are the protectors and warriors of Force traditions, capable in both combat and Force manipulation. Guardians might be Jedi Knights focused on lightsaber combat, Sith Warriors who augment their martial abilities with the dark side, or members of other Force traditions who find balance between physical combat and Force techniques. While not as powerful with the Force as consulars or as skilled in pure combat as fighters, their versatility makes them adaptable to many situations.",
        hitDie: 10,
    primaryAbility: ["Strength", "Dexterity"],
    savingThrows: ["Strength", "Constitution"],
    armorProficiencies: ["Light", "Medium", "Heavy", "Shields"],
    weaponProficiencies: ["Simple", "Martial", "Vibroweapons", "Blasters"],
    toolProficiencies: [],
    skillChoices: ["Acrobatics", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
    numSkillChoices: 2,
    equipmentChoices: [
        ["Lightsaber", "Doubleblade lightsaber"],
        ["Light armor", "Medium armor and shield"],
        ["Explorer's pack", "Pilgrim's pack"],
        ["A holy symbol", "A meditation focus"]
      ],
      archetypeLevel: 3,
      features: [
        {
          name: "Force Casting",
          level: 1,
          description: "You can cast force powers using your Force Points. You know fewer powers than a Consular but can combine them with combat. Your force casting ability is Wisdom. You use this ability for your force powers' saving throws and attack rolls. The number of force powers you can know is based on your guardian level."
        },
        {
          name: "Guardian Defense",
          level: 1,
          description: "While wearing armor, you gain a +1 bonus to AC. This bonus increases to +2 at 9th level and +3 at 18th level."
        },
        {
          name: "Fighting Style",
          level: 2,
          description: "At 2nd level, you adopt a style of fighting as your specialty. Choose one of the following options: Defense, Dueling, Great Weapon Fighting, or Protection. You can't take a Fighting Style option more than once, even if you later get to choose again."
        },
        {
          name: "Guardian Focus",
          level: 3,
          description: "At 3rd level, you choose a focus that defines how you blend martial prowess with Force abilities: Sentinel, Shadow, or another focus from various Force traditions. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th levels."
        },
        {
          name: "Ability Score Improvement",
          level: 4,
          description: "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
        },
        {
          name: "Extra Attack",
          level: 5,
          description: "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn."
        },
        {
          name: "Force-Empowered Strike",
          level: 6,
          description: "Starting at 6th level, your attacks become infused with Force energy. Your weapon attacks count as enhanced for the purpose of overcoming resistance and immunity to nonenhanced attacks and damage. Additionally, when you hit a creature with a weapon attack, you can spend 1 Force Point to deal an extra 2d8 force damage to the target."
        },
        {
          name: "Aura of Protection",
          level: 7,
          description: "Beginning at 7th level, you emit an aura of protective Force energy. You and friendly creatures within 10 feet of you gain a bonus to saving throws equal to your Wisdom modifier (minimum of +1). At 18th level, the range of this aura increases to 30 feet."
        },
        {
          name: "Force Recovery",
          level: 10,
          description: "At 10th level, you can draw on the Force to recover some of your expended Force Points. Once per day when you finish a short rest, you can regain Force Points equal to half your guardian level (rounded up)."
        },
        {
          name: "Improved Force-Empowered Strike",
          level: 11,
          description: "Starting at 11th level, when you hit a creature with a weapon attack, your attack deals an extra 1d8 force damage. Additionally, when you use your Force-Empowered Strike feature, you deal an extra 3d8 force damage instead of 2d8."
        },
        {
          name: "Cleansing Touch",
          level: 14,
          description: "Beginning at 14th level, you can use your action to end one power or effect on yourself or on one willing creature that you touch. You can use this feature a number of times equal to your Wisdom modifier (a minimum of once). You regain expended uses when you finish a long rest."
        },
        {
          name: "Force Paragon",
          level: 20,
          description: "At 20th level, you embody the perfect fusion of martial prowess and Force mastery. Your Strength and Wisdom scores each increase by 2. Your maximum for those scores is now 22. Additionally, when you roll initiative and have no Force Points remaining, you regain 4 Force Points."
        }
      ]
    },
    {
      id: "scout",
      name: "Scout",
      summary: "A skilled explorer and tracker who excels in wilderness and stealth.",
      description: "Scouts are explorers and wilderness specialists. They navigate harsh terrain, track enemies, and serve as the eyes and ears of their group. In the Star Wars galaxy, scouts might be frontier pathfinders, urban infiltrators, bounty hunters who track down targets, or special forces operatives who operate behind enemy lines. They combine survival skills, combat training, and specialized knowledge to overcome challenges in any environment. Their expertise makes them especially valuable on unexplored worlds or in hostile territory where conventional tactics might fail.",
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
      ["Scout's Pack", "Explorer's Pack"],
      ["Light armor", "Medium armor"],
      ["Surveying tools", "Navigator's tools"]
    ],
    archetypeLevel: 3,
    features: [
      {
        name: "Natural Explorer",
        level: 1,
        description: "You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions. Choose one type of terrain: arctic, coast, desert, forest, grassland, mountain, swamp, undercity, or space. When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in. While traveling for an hour or more in your favored terrain, you gain the following benefits: Difficult terrain doesn't slow your group's travel. Your group can't become lost except by magical means. Even when you are engaged in another activity while traveling, you remain alert to danger. If you are traveling alone, you can move stealthily at a normal pace. When you forage, you find twice as much food as you normally would. While tracking other creatures, you also learn their exact number, their sizes, and how long ago they passed through the area. You choose an additional terrain type at 6th, 10th, and 14th level."
      },
      {
        name: "Favored Enemy",
        level: 1,
        description: "Beginning at 1st level, you have significant experience studying, tracking, hunting, and even talking to a certain type of enemy. Choose a type of favored enemy: droids, beasts, humanoids, monstrosities, or a specific species. You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them. When you gain this feature, you also learn one language of your choice that is spoken by your favored enemies, if they speak one at all. You choose one additional favored enemy, as well as an associated language, at 6th and 14th level."
      },
      {
        name: "Fighting Style",
        level: 2,
        description: "At 2nd level, you adopt a particular style of fighting as your specialty. Choose one of the following options: Archery, Defense, Dueling, or Two-Weapon Fighting. You can't take a Fighting Style option more than once, even if you later get to choose again."
      },
      {
        name: "Scout Archetype",
        level: 3,
        description: "At 3rd level, you choose an archetype that you strive to emulate: Hunter, Bounty Hunter, Shadow, or another scout archetype. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level."
      },
      {
        name: "Primeval Awareness",
        level: 3,
        description: "Beginning at 3rd level, you can use your action and expend one scout power slot to focus your awareness on the region around you. For 1 minute per level of the power slot you expend, you can sense whether the following types of creatures are present within 1 mile of you (or within up to 6 miles if you are in your favored terrain): droids, beasts, humanoids, monstrosities, or a specific species. This feature doesn't reveal the creatures' location or number."
      },
      {
        name: "Ability Score Improvement",
        level: 4,
        description: "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature."
      },
      {
        name: "Extra Attack",
        level: 5,
        description: "Beginning at 5th level, you can attack twice, instead of once, whenever you take the Attack action on your turn."
      },
      {
        name: "Land's Stride",
        level: 8,
        description: "Starting at 8th level, moving through nonmagical difficult terrain costs you no extra movement. You can also pass through nonmagical plants without being slowed by them and without taking damage from them if they have thorns, spines, or a similar hazard. In addition, you have advantage on saving throws against plants that are created or manipulated to impede movement."
      },
      {
        name: "Hide in Plain Sight",
        level: 10,
        description: "Starting at 10th level, you can spend 1 minute creating camouflage for yourself. You must have access to fresh mud, dirt, plants, soot, or other naturally occurring materials with which to create your camouflage. Once you are camouflaged in this way, you can try to hide by pressing yourself up against a solid surface, such as a tree or wall, that is at least as tall and wide as you are. You gain a +10 bonus to Dexterity (Stealth) checks as long as you remain there without moving or taking actions. Once you move or take an action or a reaction, you must camouflage yourself again to gain this benefit."
      },
      {
        name: "Vanish",
        level: 14,
        description: "Starting at 14th level, you can use the Hide action as a bonus action on your turn. Also, you can't be tracked by nonmagical means, unless you choose to leave a trail."
      },
      {
        name: "Feral Senses",
        level: 18,
        description: "At 18th level, you gain preternatural senses that help you fight creatures you can't see. When you attack a creature you can't see, your inability to see it doesn't impose disadvantage on your attack rolls against it. You are also aware of the location of any invisible creature within 30 feet of you, provided that the creature isn't hidden from you and you aren't blinded or deafened."
      },
      {
        name: "Foe Slayer",
        level: 20,
        description: "At 20th level, you become an unparalleled hunter of your enemies. Once on each of your turns, you can add your Wisdom modifier to the attack roll or the damage roll of an attack you make against one of your favored enemies. You can choose to use this feature before or after the roll, but before any effects of the roll are applied."
      }
    ]
  },
  {
    id: "monk",
    name: "Monk",
    summary: "A master of martial arts who harnesses the power of the body as a weapon.",
    description: "Monks are masters of unarmed combat, honing their bodies into deadly weapons. In the Star Wars universe, monks might be martial artists from traditions like the Matukai or Followers of Palawa, who developed physical disciplines that sometimes overlap with Force sensitivity. While not all monks are Force-sensitive, they all achieve remarkable physical feats through rigorous training and mental discipline. They excel at mobility and quick strikes, often eschewing heavy weapons and armor in favor of speed and precision.",
    hitDie: 8,
    primaryAbility: ["Dexterity", "Wisdom"],
    savingThrows: ["Strength", "Dexterity"],
    armorProficiencies: [],
    weaponProficiencies: ["Simple", "Vibroweapons"],
    toolProficiencies: ["One artisan's tools or musical instrument"],
    skillChoices: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    numSkillChoices: 2,
    equipmentChoices: [
      ["Vibrodagger", "Any simple weapon"],
      ["Explorer's Pack", "Entertainer's Pack"],
      ["10 darts", "Vibrostave"]
    ],
    archetypeLevel: 3,
    features: [
      {
        name: "Unarmored Defense",
        level: 1,
        description: "While you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier."
      },
      {
        name: "Martial Arts",
        level: 1,
        description: "Your practice of martial arts gives you mastery of combat styles that use unarmed strikes and monk weapons. You gain the following benefits while you are unarmed or wielding only monk weapons and you aren't wearing armor or wielding a shield: You can use Dexterity instead of Strength for the attack and damage rolls of your unarmed strikes and monk weapons. You can roll a d4 in place of the normal damage of your unarmed strike or monk weapon. This die changes as you gain monk levels, as shown in the Martial Arts column of the Monk table. When you use the Attack action with an unarmed strike or a monk weapon on your turn, you can make one unarmed strike as a bonus action."
      },
      {
        name: "Ki",
        level: 2,
        description: "Starting at 2nd level, your training allows you to harness the mystic energy of ki. Your access to this energy is represented by a number of ki points. Your monk level determines the number of points you have, as shown in the Ki Points column of the Monk table. You can spend these points to fuel various ki features. You start knowing three such features: Flurry of Blows, Patient Defense, and Step of the Wind. You regain all spent ki points when you finish a short or long rest."
      },
      {
        name: "Unarmored Movement",
        level: 2,
        description: "Starting at 2nd level, your speed increases by 10 feet while you are not wearing armor or wielding a shield. This bonus increases when you reach certain monk levels, as shown in the Monk table. At 9th level, you gain the ability to move along vertical surfaces and across liquids on your turn without falling during the move."
      }
    ]
  }
];

// Helper functions
export function getClassById(id: string): SW5EClass | undefined {
  return classes.find(c => c.id === id);
}

export function getClassFeaturesByLevel(classId: string, level: number): ClassFeature[] {
  const characterClass = getClassById(classId);
  if (!characterClass) return [];

  return characterClass.features.filter(feature => feature.level <= level);
}

export function getClassNames(): {id: string, name: string}[] {
  return classes.map(c => ({ id: c.id, name: c.name }));
}
