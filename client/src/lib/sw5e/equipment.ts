export interface Equipment {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  damage?: string;
  properties?: string[];
  armorClass?: number;
  weight?: number;
}

export const equipment: Equipment[] = [
  // Weapons
  {
    id: "blaster-pistol",
    name: "Blaster Pistol",
    category: "Weapon",
    price: 400,
    description: "Standard ranged weapon used throughout the galaxy.",
    damage: "1d6 energy",
    properties: ["Light", "Range (60/240)"]
  },
  {
    id: "blaster-rifle",
    name: "Blaster Rifle",
    category: "Weapon",
    price: 900,
    description: "Powerful ranged weapon with increased range and damage.",
    damage: "1d8 energy",
    properties: ["Two-handed", "Range (150/600)"]
  },
  {
    id: "vibroblade",
    name: "Vibroblade",
    category: "Weapon",
    price: 250,
    description: "Melee weapon with ultrasonic vibrations for enhanced cutting power.",
    damage: "1d6 kinetic",
    properties: ["Finesse", "Light"]
  },
  {
    id: "vibroaxe",
    name: "Vibroaxe",
    category: "Weapon",
    price: 350,
    description: "Heavy melee weapon with devastating cutting power.",
    damage: "1d12 kinetic",
    properties: ["Heavy", "Two-handed"]
  },
  {
    id: "lightsaber",
    name: "Lightsaber",
    category: "Weapon",
    price: 5000,
    description: "Ancient weapon of Force users, capable of cutting through almost anything.",
    damage: "2d8 energy",
    properties: ["Finesse", "Versatile (2d10)"]
  },
  {
    id: "thermal-detonator",
    name: "Thermal Detonator",
    category: "Weapon",
    price: 750,
    description: "Powerful grenade that causes massive damage in a small area.",
    damage: "8d6 energy",
    properties: ["Thrown (20/60)", "Area Effect (10-foot radius)"]
  },
  {
    id: "blaster-power-pack",
    name: "Blaster Power Pack",
    category: "Ammunition",
    price: 50,
    description: "Standard power pack for blaster weapons. Provides 50 shots."
  },
  
  // Armor
  {
    id: "combat-suit",
    name: "Combat Suit",
    category: "Armor",
    price: 500,
    description: "Flexible armor designed for mobility while providing decent protection.",
    armorClass: 12
  },
  {
    id: "tactical-armor",
    name: "Tactical Armor",
    category: "Armor",
    price: 1500,
    description: "Military-grade armor with enhanced protection for vital areas.",
    armorClass: 14
  },
  {
    id: "heavy-battle-armor",
    name: "Heavy Battle Armor",
    category: "Armor",
    price: 3000,
    description: "Full-body armor providing excellent protection at the cost of mobility.",
    armorClass: 16
  },
  {
    id: "reflective-shield",
    name: "Reflective Shield",
    category: "Armor",
    price: 2000,
    description: "Energy shield that offers protection against blaster fire.",
    armorClass: 13
  },
  {
    id: "stealth-suit",
    name: "Stealth Suit",
    category: "Armor",
    price: 1800,
    description: "Light armor with sound-dampening technology for covert operations.",
    armorClass: 11
  },
  
  // Adventuring Gear
  {
    id: "comlink",
    name: "Comlink",
    category: "Adventuring Gear",
    price: 150,
    description: "Communication device for short to medium-range transmissions."
  },
  {
    id: "medpac",
    name: "Medpac",
    category: "Adventuring Gear",
    price: 200,
    description: "Medical kit containing supplies for treating injuries and stabilizing patients."
  },
  {
    id: "breath-mask",
    name: "Breath Mask",
    category: "Adventuring Gear",
    price: 350,
    description: "Provides breathable air in hostile environments for up to 6 hours."
  },
  {
    id: "electrobinoculars",
    name: "Electrobinoculars",
    category: "Adventuring Gear",
    price: 250,
    description: "Enhanced vision device with zoom, night vision, and data overlay capabilities."
  },
  {
    id: "holoprojector",
    name: "Holoprojector",
    category: "Adventuring Gear",
    price: 400,
    description: "Device capable of recording and projecting three-dimensional images and messages."
  },
  {
    id: "fusion-lantern",
    name: "Fusion Lantern",
    category: "Adventuring Gear",
    price: 100,
    description: "Long-lasting light source powered by a fusion cell."
  },
  {
    id: "grappling-hook",
    name: "Grappling Hook",
    category: "Adventuring Gear",
    price: 80,
    description: "Mechanical device used for climbing and crossing gaps."
  },
  {
    id: "utility-belt",
    name: "Utility Belt",
    category: "Adventuring Gear",
    price: 150,
    description: "Belt with multiple pouches for carrying small items and equipment."
  },
  {
    id: "datapad",
    name: "Datapad",
    category: "Adventuring Gear",
    price: 300,
    description: "Portable computer for data storage, communication, and information access."
  },
  
  // Tools
  {
    id: "security-kit",
    name: "Security Kit",
    category: "Tool",
    price: 500,
    description: "Set of tools for bypassing security systems and locks."
  },
  {
    id: "mechanics-toolkit",
    name: "Mechanic's Toolkit",
    category: "Tool",
    price: 400,
    description: "Collection of tools for repairing and maintaining mechanical devices."
  },
  {
    id: "slicer-kit",
    name: "Slicer Kit",
    category: "Tool",
    price: 600,
    description: "Specialized tools for hacking and bypassing computer systems."
  },
  {
    id: "medical-kit",
    name: "Medical Kit",
    category: "Tool",
    price: 450,
    description: "Advanced medical tools for performing surgeries and treating serious injuries."
  },
  {
    id: "engineers-tools",
    name: "Engineer's Tools",
    category: "Tool",
    price: 550,
    description: "Comprehensive toolkit for engineering work and structural analysis."
  }
];
