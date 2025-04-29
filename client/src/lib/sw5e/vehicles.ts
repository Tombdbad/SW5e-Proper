// ground-vehicles.ts

export interface Vehicle {
  id: string;
  name: string;
  category: "Ground Vehicle" | "Walker";
  size: "Huge" | "Gargantuan";
  description: string;
  armorClass: number;
  hullPoints: number;
  shieldPoints: number;
  speed: {
    ground?: number;
  };
  crew: {
    min: number;
    max: number;
    roles: string[];
  };
  passengers: number;
  cargoCapacity: string;
  consumables: string;
  systems: string[];
  specialFeatures: {
    name: string;
    description: string;
  }[];
  actions: {
    name: string;
    attackBonus?: number;
    range?: string;
    damage?: string;
    description: string;
  }[];
}

export const groundVehicles: Vehicle[] = [
  {
    id: "atst",
    name: "All Terrain Scout Transport (AT-ST)",
    category: "Walker",
    size: "Huge",
    description:
      "A lightly armored but heavily armed bipedal walker used by the Galactic Empire for reconnaissance and ground support.",
    armorClass: 14,
    hullPoints: 80,
    shieldPoints: 0,
    speed: { ground: 6 },
    crew: { min: 2, max: 2, roles: ["Pilot", "Gunner"] },
    passengers: 0,
    cargoCapacity: "200 kg",
    consumables: "1 week",
    systems: [],
    specialFeatures: [],
    actions: [
      {
        name: "Chin-mounted Laser Cannons (2)",
        attackBonus: 5,
        range: "Medium",
        damage: "3d6 energy",
        description: "Ranged Weapon Attack.",
      },
      {
        name: "Side-mounted Grenade Launcher",
        attackBonus: 4,
        range: "Short",
        damage: "4d4 explosive (5 ft. radius)",
        description: "Ranged Weapon Attack; limited ammunition.",
      },
    ],
  },
  {
    id: "atat",
    name: "All Terrain Armored Transport (AT-AT)",
    category: "Walker",
    size: "Gargantuan",
    description:
      "A massive four-legged walker used by the Galactic Empire for heavy assault.",
    armorClass: 18,
    hullPoints: 200,
    shieldPoints: 0,
    speed: { ground: 4 },
    crew: { min: 5, max: 5, roles: ["Commander", "Pilots (2)", "Gunners (2)"] },
    passengers: 40,
    cargoCapacity: "10 metric tons",
    consumables: "1 month",
    systems: [],
    specialFeatures: [],
    actions: [
      {
        name: "Heavy Laser Cannons (2)",
        attackBonus: 7,
        range: "Long",
        damage: "4d10 energy",
        description: "Ranged Weapon Attack.",
      },
      {
        name: "Medium Laser Cannons (2)",
        attackBonus: 6,
        range: "Medium",
        damage: "3d8 energy",
        description: "Ranged Weapon Attack.",
      },
    ],
  },
];
