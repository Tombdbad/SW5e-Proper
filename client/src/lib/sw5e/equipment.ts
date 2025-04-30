
// Export for UI usage
export const EQUIPMENT = [
  { id: "blaster_pistol", name: "Blaster Pistol", type: "weapon" },
  { id: "blaster_rifle", name: "Blaster Rifle", type: "weapon" },
  { id: "vibroblade", name: "Vibroblade", type: "weapon" },
  { id: "light_armor", name: "Light Armor", type: "armor" },
  { id: "medium_armor", name: "Medium Armor", type: "armor" },
  { id: "heavy_armor", name: "Heavy Armor", type: "armor" },
  { id: "medpac", name: "Medpac", type: "item" },
  { id: "datapad", name: "Datapad", type: "item" }
];

// Equipment data for SW5E
export interface Equipment {
  id: string;
  name: string;
  category: "Weapon" | "Armor" | "Ammunition" | "Adventuring Gear" | "Tool";
  description: string;
  price: number;
  weight?: number;
  properties?: string[];
  damage?: string;
  armorClass?: string;
  strRequirement?: number;
  stealthDisadvantage?: boolean;
}

export const equipment: Equipment[] = [
  // Weapons
  {
    id: "blaster-pistol",
    name: "Blaster Pistol",
    category: "Weapon",
    description: "Standard sidearm throughout the galaxy. Effective at short to medium range.",
    price: 450,
    weight: 2,
    properties: ["Range (80/320)", "Reload (15 shots)", "Power Cell"],
    damage: "1d6 energy"
  },
  {
    id: "blaster-rifle",
    name: "Blaster Rifle",
    category: "Weapon",
    description: "Long-range energy weapon favored by soldiers and hunters.",
    price: 900,
    weight: 9,
    properties: ["Range (150/600)", "Reload (20 shots)", "Two-handed", "Power Cell"],
    damage: "1d8 energy"
  },
  {
    id: "heavy-blaster-rifle",
    name: "Heavy Blaster Rifle",
    category: "Weapon",
    description: "Military-grade blaster with enhanced power and range.",
    price: 1800,
    weight: 14,
    properties: ["Range (200/800)", "Reload (10 shots)", "Two-handed", "Heavy", "Power Cell"],
    damage: "1d10 energy"
  },
  {
    id: "vibroblade",
    name: "Vibroblade",
    category: "Weapon",
    description: "Standard vibrating blade that can slice through most materials.",
    price: 100,
    weight: 1,
    properties: ["Finesse", "Light", "Power Cell"],
    damage: "1d4 kinetic"
  },
  {
    id: "vibroknife",
    name: "Vibroknife",
    category: "Weapon",
    description: "Compact vibrating knife that can be easily concealed.",
    price: 75,
    weight: 0.5,
    properties: ["Finesse", "Light", "Power Cell", "Thrown (20/60)"],
    damage: "1d4 kinetic"
  },
  {
    id: "vibrorapier",
    name: "Vibrorapier",
    category: "Weapon",
    description: "Elegant vibrating blade favored by duelists.",
    price: 350,
    weight: 2,
    properties: ["Finesse", "Power Cell"],
    damage: "1d8 kinetic"
  },
  {
    id: "vibroaxe",
    name: "Vibroaxe",
    category: "Weapon",
    description: "Heavy vibrating axe that can cleave through armor.",
    price: 350,
    weight: 7,
    properties: ["Heavy", "Two-handed", "Power Cell"],
    damage: "1d12 kinetic"
  },
  {
    id: "vibroglaive",
    name: "Vibroglaive",
    category: "Weapon",
    description: "Vibrating polearm with extended reach.",
    price: 300,
    weight: 6,
    properties: ["Heavy", "Reach", "Two-handed", "Power Cell"],
    damage: "1d10 kinetic"
  },
  {
    id: "lightsaber",
    name: "Lightsaber",
    category: "Weapon",
    description: "Ancient weapon of Force traditions, capable of cutting through almost anything.",
    price: 3000,
    weight: 1,
    properties: ["Finesse", "Luminous", "Kyber Crystal"],
    damage: "2d8 energy"
  },
  {
    id: "doubleblade-lightsaber",
    name: "Double-bladed Lightsaber",
    category: "Weapon",
    description: "Specialized lightsaber with blades on both ends.",
    price: 4500,
    weight: 1.5,
    properties: ["Finesse", "Luminous", "Kyber Crystal", "Two-handed", "Special"],
    damage: "2d6 energy"
  },
  
  // Ammunition
  {
    id: "power-cell",
    name: "Power Cell (Standard)",
    category: "Ammunition",
    description: "Standard power cell for blasters and energy weapons.",
    price: 40,
    weight: 0.2
  },
  {
    id: "enhanced-power-cell",
    name: "Power Cell (Enhanced)",
    category: "Ammunition",
    description: "Enhanced power cell that provides more shots before recharging.",
    price: 120,
    weight: 0.3
  },
  
  // Armor
  {
    id: "light-combat-suit",
    name: "Light Combat Suit",
    category: "Armor",
    description: "Flexible armor that offers basic protection without restricting movement.",
    price: 450,
    weight: 8,
    armorClass: "11 + Dex modifier"
  },
  {
    id: "medium-combat-armor",
    name: "Medium Combat Armor",
    category: "Armor",
    description: "Standard combat armor with reinforced plates.",
    price: 750,
    weight: 20,
    armorClass: "14 + Dex modifier (max 2)"
  },
  {
    id: "heavy-battle-armor",
    name: "Heavy Battle Armor",
    category: "Armor",
    description: "Fully encasing armor with advanced protection systems.",
    price: 1500,
    weight: 35,
    armorClass: "17",
    strRequirement: 15,
    stealthDisadvantage: true
  },
  {
    id: "personal-shield",
    name: "Personal Shield Generator",
    category: "Armor",
    description: "Wearable energy shield that absorbs damage.",
    price: 2000,
    weight: 3,
    armorClass: "+2 bonus"
  },
  
  // Adventuring Gear
  {
    id: "medpac",
    name: "Medpac",
    category: "Adventuring Gear",
    description: "First aid kit containing bacta and other medical supplies.",
    price: 50,
    weight: 1
  },
  {
    id: "comlink",
    name: "Comlink",
    category: "Adventuring Gear",
    description: "Standard communication device with encrypted channel options.",
    price: 40,
    weight: 0.1
  },
  {
    id: "datapad",
    name: "Datapad",
    category: "Adventuring Gear",
    description: "Handheld computer for storing and accessing information.",
    price: 150,
    weight: 0.5
  },
  {
    id: "macrobinoculars",
    name: "Macrobinoculars",
    category: "Adventuring Gear",
    description: "Advanced optics with zoom, recording, and analysis capabilities.",
    price: 200,
    weight: 1
  },
  {
    id: "breath-mask",
    name: "Breath Mask",
    category: "Adventuring Gear",
    description: "Filtration mask for breathing in hostile atmospheres.",
    price: 120,
    weight: 0.5
  },
  {
    id: "holoprojector",
    name: "Holoprojector",
    category: "Adventuring Gear",
    description: "Device capable of projecting three-dimensional images and recordings.",
    price: 100,
    weight: 0.5
  },
  {
    id: "glow-rod",
    name: "Glow Rod",
    category: "Adventuring Gear",
    description: "Handheld illumination device with adjustable brightness.",
    price: 10,
    weight: 0.5
  },
  
  // Tools
  {
    id: "tech-kit",
    name: "Tech Kit",
    category: "Tool",
    description: "Set of tools for repairing and modifying electronic devices.",
    price: 125,
    weight: 5
  },
  {
    id: "security-kit",
    name: "Security Kit",
    category: "Tool",
    description: "Tools for bypassing electronic and mechanical locks.",
    price: 150,
    weight: 3
  },
  {
    id: "astrogation-tools",
    name: "Astrogation Tools",
    category: "Tool",
    description: "Specialized tools for calculating hyperspace jumps and navigation.",
    price: 200,
    weight: 2
  }
];