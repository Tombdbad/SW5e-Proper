// Items data for SW5E
export interface Item {
  id: string;
  name: string;
  type: string;
  category: string;
  rarity: 'Standard' | 'Premium' | 'Prototype' | 'Advanced' | 'Legendary';
  description: string;
  cost: number;
  weight?: number;
  properties?: string[];
  requiresAttunement?: boolean;
  additionalInfo?: string;
}

export interface Weapon extends Item {
  damageType: string;
  damageDice: string;
  weaponClassification: string;
  weaponGroup: string;
  proficiencyGroup: string;
}

export interface Armor extends Item {
  armorClass: string;
  strengthRequirement?: number;
  stealthDisadvantage?: boolean;
  armorClassification: string;
}

export interface Gear extends Item {
  uses?: number;
}

export const weapons: Weapon[] = [
  {
    id: "blaster-pistol",
    name: "Blaster Pistol",
    type: "weapon",
    category: "Ranged Weapons",
    rarity: "Standard",
    description: "A standard, reliable blaster pistol with decent stopping power and accuracy for its size.",
    cost: 500,
    weight: 2,
    damageType: "energy",
    damageDice: "1d6",
    weaponClassification: "Simple Blaster",
    weaponGroup: "Blaster",
    proficiencyGroup: "Simple Blasters",
    properties: ["Ammunition", "Light", "Range (40/160)"]
  },
  {
    id: "blaster-rifle",
    name: "Blaster Rifle",
    type: "weapon",
    category: "Ranged Weapons",
    rarity: "Standard",
    description: "A standard blaster rifle, reliable for medium to long range combat with good stopping power.",
    cost: 900,
    weight: 7,
    damageType: "energy",
    damageDice: "1d8",
    weaponClassification: "Martial Blaster",
    weaponGroup: "Blaster",
    proficiencyGroup: "Martial Blasters",
    properties: ["Ammunition", "Range (100/400)", "Two-handed"]
  },
  {
    id: "heavy-blaster-pistol",
    name: "Heavy Blaster Pistol",
    type: "weapon",
    category: "Ranged Weapons",
    rarity: "Standard",
    description: "A high-powered blaster pistol, packing almost as much punch as some rifles, but still usable with one hand.",
    cost: 750,
    weight: 3,
    damageType: "energy",
    damageDice: "1d8",
    weaponClassification: "Martial Blaster",
    weaponGroup: "Blaster",
    proficiencyGroup: "Martial Blasters",
    properties: ["Ammunition", "Range (30/120)"]
  },
  {
    id: "heavy-blaster-rifle",
    name: "Heavy Blaster Rifle",
    type: "weapon",
    category: "Ranged Weapons",
    rarity: "Premium",
    description: "A powerful blaster rifle designed for heavy-duty combat, with excellent range and stopping power.",
    cost: 1500,
    weight: 9,
    damageType: "energy",
    damageDice: "1d10",
    weaponClassification: "Martial Blaster",
    weaponGroup: "Blaster",
    proficiencyGroup: "Martial Blasters",
    properties: ["Ammunition", "Heavy", "Range (120/480)", "Two-handed"]
  },
  {
    id: "vibroblade",
    name: "Vibroblade",
    type: "weapon",
    category: "Melee Weapons",
    rarity: "Standard",
    description: "A blade with a high-frequency oscillator that creates microscopic vibratory motions to increase cutting power.",
    cost: 200,
    weight: 2,
    damageType: "kinetic",
    damageDice: "1d6",
    weaponClassification: "Simple Vibroweapon",
    weaponGroup: "Vibroweapon",
    proficiencyGroup: "Simple Vibroweapons",
    properties: ["Finesse", "Light"]
  },
  {
    id: "vibrorapier",
    name: "Vibrorapier",
    type: "weapon",
    category: "Melee Weapons",
    rarity: "Standard",
    description: "An elegant vibro-edged blade designed for precise thrusting attacks.",
    cost: 250,
    weight: 2,
    damageType: "kinetic",
    damageDice: "1d8",
    weaponClassification: "Martial Vibroweapon",
    weaponGroup: "Vibroweapon",
    proficiencyGroup: "Martial Vibroweapons",
    properties: ["Finesse"]
  },
  {
    id: "vibrosword",
    name: "Vibrosword",
    type: "weapon",
    category: "Melee Weapons",
    rarity: "Standard",
    description: "A sword with a vibro-edge capable of cutting through most materials with ease.",
    cost: 300,
    weight: 3,
    damageType: "kinetic",
    damageDice: "1d8",
    weaponClassification: "Martial Vibroweapon",
    weaponGroup: "Vibroweapon",
    proficiencyGroup: "Martial Vibroweapons",
    properties: ["Versatile (1d10)"]
  },
  {
    id: "lightfoil",
    name: "Lightfoil",
    type: "weapon",
    category: "Melee Weapons",
    rarity: "Premium",
    description: "A smaller, elegant version of a lightsaber, designed for quick, precise strikes rather than power.",
    cost: 5000,
    weight: 1,
    damageType: "energy",
    damageDice: "1d6",
    weaponClassification: "Martial Lightweapon",
    weaponGroup: "Lightweapon",
    proficiencyGroup: "Martial Lightweapons",
    properties: ["Finesse", "Light", "Luminous"]
  },
  {
    id: "double-bladed-lightsaber",
    name: "Double-bladed Lightsaber",
    type: "weapon",
    category: "Melee Weapons",
    rarity: "Legendary",
    description: "A specialized lightsaber with emitters at both ends of the hilt, creating two blades.",
    cost: 10000,
    weight: 4,
    damageType: "energy",
    damageDice: "1d8",
    weaponClassification: "Martial Lightweapon",
    weaponGroup: "Lightweapon",
    proficiencyGroup: "Martial Lightweapons",
    properties: ["Double", "Luminous", "Two-handed"],
    requiresAttunement: true
  }
];

export const armors: Armor[] = [
  {
    id: "padded-armor",
    name: "Padded Armor",
    type: "armor",
    category: "Light Armor",
    rarity: "Standard",
    description: "Quilted layers of cloth and batting.",
    cost: 50,
    weight: 8,
    armorClass: "11 + Dex modifier",
    stealthDisadvantage: true,
    armorClassification: "Light",
    properties: ["Light"]
  },
  {
    id: "combat-suit",
    name: "Combat Suit",
    type: "armor",
    category: "Light Armor",
    rarity: "Standard",
    description: "A flexible suit with strategically-placed protective plates that offer both protection and mobility.",
    cost: 150,
    weight: 12,
    armorClass: "12 + Dex modifier",
    armorClassification: "Light",
    properties: ["Light"]
  },
  {
    id: "armored-flight-suit",
    name: "Armored Flight Suit",
    type: "armor",
    category: "Medium Armor",
    rarity: "Standard",
    description: "A flight suit reinforced with armor plates for pilots who expect combat.",
    cost: 250,
    weight: 20,
    armorClass: "13 + Dex modifier (max 2)",
    armorClassification: "Medium",
    properties: ["Medium"]
  },
  {
    id: "mesh-armor",
    name: "Mesh Armor",
    type: "armor",
    category: "Medium Armor",
    rarity: "Standard",
    description: "A layer of flexible energy-resistant mesh worn beneath clothing or uniforms.",
    cost: 300,
    weight: 15,
    armorClass: "14 + Dex modifier (max 2)",
    armorClassification: "Medium",
    properties: ["Medium"]
  },
  {
    id: "blast-vest-and-helmet",
    name: "Blast Vest and Helmet",
    type: "armor",
    category: "Medium Armor",
    rarity: "Standard",
    description: "A padded vest that covers vital areas and a helmet that protects the head from debris and glancing blaster shots.",
    cost: 500,
    weight: 18,
    armorClass: "15 + Dex modifier (max 2)",
    armorClassification: "Medium",
    properties: ["Medium"]
  },
  {
    id: "heavy-battle-armor",
    name: "Heavy Battle Armor",
    type: "armor",
    category: "Heavy Armor",
    rarity: "Standard",
    description: "Reinforced armor plates offering significant protection at the cost of mobility.",
    cost: 700,
    weight: 40,
    armorClass: "16",
    strengthRequirement: 13,
    stealthDisadvantage: true,
    armorClassification: "Heavy",
    properties: ["Heavy"]
  },
  {
    id: "powered-battle-armor",
    name: "Powered Battle Armor",
    type: "armor",
    category: "Heavy Armor",
    rarity: "Premium",
    description: "Full-body armor with powered servomechanisms to assist movement and enhance protection.",
    cost: 1500,
    weight: 60,
    armorClass: "17",
    strengthRequirement: 15,
    stealthDisadvantage: true,
    armorClassification: "Heavy",
    properties: ["Heavy"]
  },
  {
    id: "beskar-armor",
    name: "Beskar Armor",
    type: "armor",
    category: "Heavy Armor",
    rarity: "Legendary",
    description: "Mandalorian armor made from beskar iron, one of the most durable materials in the galaxy.",
    cost: 10000,
    weight: 45,
    armorClass: "18",
    strengthRequirement: 15,
    stealthDisadvantage: true,
    armorClassification: "Heavy",
    properties: ["Heavy", "Lightsaber Resistant"],
    additionalInfo: "Provides resistance against lightsaber damage and you have resistance to energy damage."
  }
];

export const adventuringGear: Gear[] = [
  {
    id: "medpac",
    name: "Medpac",
    type: "gear",
    category: "Medical Supplies",
    rarity: "Standard",
    description: "A portable first-aid kit containing supplies for emergency medical treatment.",
    cost: 50,
    weight: 3,
    uses: 5,
    properties: ["Medical"]
  },
  {
    id: "bacta-patch",
    name: "Bacta Patch",
    type: "gear",
    category: "Medical Supplies",
    rarity: "Premium",
    description: "A small patch containing bacta, a synthetic healing agent that rapidly accelerates healing.",
    cost: 100,
    weight: 0.1,
    uses: 1,
    properties: ["Medical", "Consumable"]
  },
  {
    id: "datapad",
    name: "Datapad",
    type: "gear",
    category: "Technology",
    rarity: "Standard",
    description: "A handheld computer used to store information, take notes, and run basic applications.",
    cost: 250,
    weight: 1,
    properties: ["Technology"]
  },
  {
    id: "comlink",
    name: "Comlink",
    type: "gear",
    category: "Technology",
    rarity: "Standard",
    description: "A small handheld communications device with a range of 50 km.",
    cost: 200,
    weight: 0.5,
    properties: ["Technology"]
  },
  {
    id: "electrobinoculars",
    name: "Electrobinoculars",
    type: "gear",
    category: "Technology",
    rarity: "Standard",
    description: "Advanced binoculars with night vision, telescopic, and recording capabilities.",
    cost: 1000,
    weight: 1,
    properties: ["Technology"]
  },
  {
    id: "security-kit",
    name: "Security Kit",
    type: "gear",
    category: "Technology",
    rarity: "Standard",
    description: "A set of tools designed for bypassing electronic locks and security systems.",
    cost: 500,
    weight: 2,
    properties: ["Technology", "Tools"]
  },
  {
    id: "utility-belt",
    name: "Utility Belt",
    type: "gear",
    category: "Equipment",
    rarity: "Standard",
    description: "A belt with multiple pouches and attachments for carrying small items and tools.",
    cost: 100,
    weight: 1,
    properties: ["Storage"]
  },
  {
    id: "holoprojector",
    name: "Holoprojector",
    type: "gear",
    category: "Technology",
    rarity: "Standard",
    description: "A device capable of displaying three-dimensional holographic images and recordings.",
    cost: 750,
    weight: 1.5,
    properties: ["Technology"]
  },
  {
    id: "breath-mask",
    name: "Breath Mask",
    type: "gear",
    category: "Survival Equipment",
    rarity: "Standard",
    description: "A mask that filters toxins and provides oxygen in hostile atmospheres for up to 4 hours.",
    cost: 300,
    weight: 2,
    properties: ["Survival"]
  },
  {
    id: "jetpack",
    name: "Jetpack",
    type: "gear",
    category: "Mobility Equipment",
    rarity: "Premium",
    description: "A personal flight device worn on the back that provides the ability to fly for short periods.",
    cost: 5000,
    weight: 10,
    properties: ["Technology"],
    additionalInfo: "Provides a flying speed of 30 feet for up to 1 minute. After using it for 1 minute, it must cool down for 1 minute before being used again."
  }
];

// Helper function to get all items in a single array
export function getAllItems(): Item[] {
  return [
    ...weapons,
    ...armors,
    ...adventuringGear
  ];
}

// Helper to find an item by ID
export function findItemById(id: string): Item | undefined {
  return getAllItems().find(item => item.id === id);
}

// Helper to filter items by type
export function getItemsByType(type: 'weapon' | 'armor' | 'gear'): Item[] {
  return getAllItems().filter(item => item.type === type);
}

// Helper to filter items by rarity
export function getItemsByRarity(rarity: Item['rarity']): Item[] {
  return getAllItems().filter(item => item.rarity === rarity);
}