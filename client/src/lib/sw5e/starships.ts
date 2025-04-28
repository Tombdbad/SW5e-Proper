// Starships data for SW5E
export interface Starship {
  id: string;
  name: string;
  category: "Starfighter" | "Freighter" | "Transport" | "Capital Ship" | "Specialty Craft";
  size: "Large" | "Huge" | "Gargantuan" | "Colossal";
  description: string;
  armorClass: number;
  hullPoints: number;
  shieldPoints: number;
  speed: number;
  crew: {
    min: number;
    max: number;
    roles: string[];
  };
  passengers: number;
  cargoCapacity: string;
  consumables: string;
  hyperdrive: string;
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

export const starships: Starship[] = [
  {
    id: "x-wing",
    name: "T-65B X-wing Starfighter",
    category: "Starfighter",
    size: "Huge",
    description: "The versatile Incom T-65 X-wing is a balanced craft with good speed, firepower, and defensive capabilities. It's the primary starfighter of the Rebel Alliance.",
    armorClass: 15,
    hullPoints: 120,
    shieldPoints: 25,
    speed: 120,
    crew: {
      min: 1,
      max: 2,
      roles: ["Pilot", "Astromech Droid"]
    },
    passengers: 0,
    cargoCapacity: "110 lb.",
    consumables: "1 week",
    hyperdrive: "Class 1",
    systems: [
      "Class 2 sensor array",
      "Military comm system",
      "S-foils",
      "Proton torpedo launcher",
      "Targeting computer"
    ],
    specialFeatures: [
      {
        name: "Starfighter",
        description: "The X-wing is designed for space combat and atmospheric operations."
      },
      {
        name: "S-Foils",
        description: "As a bonus action, the pilot can deploy or retract the S-foils. When deployed, the X-wing's weapons deal additional damage, but its maneuverability is reduced (fly speed reduced to 100 ft.). When retracted, the X-wing can't use its proton torpedoes."
      },
      {
        name: "Astromech Socket",
        description: "An astromech droid can interface with the X-wing's systems, providing assistance with repairs, navigation calculations, and targeting."
      }
    ],
    actions: [
      {
        name: "Quad Laser Cannons",
        attackBonus: 7,
        range: "500/2,000 ft.",
        damage: "4d10 energy (5d10 with S-foils deployed)",
        description: "The X-wing's primary weapons are four laser cannons mounted at the tips of its wings."
      },
      {
        name: "Proton Torpedoes",
        attackBonus: 7,
        range: "1,000/4,000 ft.",
        damage: "6d10 force",
        description: "Guided projectiles that can only be fired with S-foils deployed. The X-wing carries 8 torpedoes."
      }
    ]
  },
  {
    id: "tie-fighter",
    name: "TIE/ln Fighter",
    category: "Starfighter",
    size: "Huge",
    description: "The Twin Ion Engine (TIE) fighter is the Empire's primary starfighter. Extremely fast and maneuverable, but lacking shields and hyperdrive capability.",
    armorClass: 14,
    hullPoints: 65,
    shieldPoints: 0,
    speed: 160,
    crew: {
      min: 1,
      max: 1,
      roles: ["Pilot"]
    },
    passengers: 0,
    cargoCapacity: "0 lb.",
    consumables: "2 days",
    hyperdrive: "None",
    systems: [
      "Class 3 sensor array",
      "Military comm system",
      "Targeting computer"
    ],
    specialFeatures: [
      {
        name: "Starfighter",
        description: "The TIE Fighter is designed for space combat."
      },
      {
        name: "Unshielded",
        description: "TIE Fighters have no shield generator."
      },
      {
        name: "Agile",
        description: "The TIE Fighter has advantage on Dexterity saving throws and can take the Dodge action as a bonus action."
      },
      {
        name: "Limited Life Support",
        description: "The TIE Fighter has only 2 days of life support."
      }
    ],
    actions: [
      {
        name: "Twin Laser Cannons",
        attackBonus: 7,
        range: "300/1,200 ft.",
        damage: "3d10 energy",
        description: "The TIE fighter's two laser cannons are synchronized to fire together."
      }
    ]
  },
  {
    id: "yt-1300",
    name: "YT-1300 Light Freighter",
    category: "Freighter",
    size: "Gargantuan",
    description: "The YT-1300 is a highly customizable light freighter often modified for increased performance, speed, and smuggling capabilities.",
    armorClass: 14,
    hullPoints: 200,
    shieldPoints: 50,
    speed: 100,
    crew: {
      min: 2,
      max: 4,
      roles: ["Pilot", "Co-pilot", "Gunners"]
    },
    passengers: 6,
    cargoCapacity: "100 tons",
    consumables: "2 months",
    hyperdrive: "Class 0.5 (modified)",
    systems: [
      "Class 2 sensor array",
      "Comm system",
      "Concealed compartments",
      "Dorsal and ventral turrets"
    ],
    specialFeatures: [
      {
        name: "Modified Freighter",
        description: "The YT-1300 is a highly customizable light freighter often modified for increased performance."
      },
      {
        name: "Turret Gunners",
        description: "The dorsal and ventral turrets can be operated by gunners or by the pilot and co-pilot with a -2 penalty to attack rolls."
      },
      {
        name: "Concealed Compartments",
        description: "The freighter has hidden compartments that can be found with a successful DC 15 Intelligence (Investigation) check."
      }
    ],
    actions: [
      {
        name: "Laser Cannons (Turret)",
        attackBonus: 7,
        range: "500/2,000 ft.",
        damage: "4d10 energy",
        description: "The YT-1300's main weapons are its dorsal and ventral turret-mounted laser cannons."
      },
      {
        name: "Concussion Missiles",
        attackBonus: 7,
        range: "1,000/4,000 ft.",
        damage: "5d10 force",
        description: "Guided projectiles typically used against larger targets. The freighter carries 6 missiles."
      }
    ]
  },
  {
    id: "star-destroyer",
    name: "Imperial Star Destroyer",
    category: "Capital Ship",
    size: "Colossal",
    description: "The Imperial-class Star Destroyer is the backbone of the Imperial Navy, capable of planetary assault and serving as a mobile military base.",
    armorClass: 20,
    hullPoints: 2000,
    shieldPoints: 500,
    speed: 40,
    crew: {
      min: 5000,
      max: 37000,
      roles: ["Bridge Crew", "Engineering", "Gunnery", "Troops", "Support Staff"]
    },
    passengers: 9700,
    cargoCapacity: "36,000 tons",
    consumables: "6 years",
    hyperdrive: "Class 2",
    systems: [
      "Class 1 sensor array",
      "Military comm system",
      "72 TIE Fighter complement",
      "Ground assault forces",
      "8 AT-ATs",
      "20 AT-STs",
      "30 landing craft",
      "50 escape pods"
    ],
    specialFeatures: [
      {
        name: "Imperial Capital Ship",
        description: "The Star Destroyer is the backbone of the Imperial Navy."
      },
      {
        name: "Fighter Complement",
        description: "The Star Destroyer carries a full complement of 72 TIE Fighters, including standard TIEs, Interceptors, and Bombers."
      },
      {
        name: "Ground Assault Forces",
        description: "The Star Destroyer carries troops, vehicles, and landing craft for planetary assault operations."
      },
      {
        name: "Command Ship",
        description: "The Star Destroyer serves as a mobile command center for Imperial operations."
      }
    ],
    actions: [
      {
        name: "Heavy Turbolaser Batteries",
        attackBonus: 12,
        range: "5,000/20,000 ft.",
        damage: "8d10 energy",
        description: "The Star Destroyer's primary armament is its numerous turbolaser batteries."
      },
      {
        name: "Ion Cannon Batteries",
        attackBonus: 12,
        range: "3,000/12,000 ft.",
        damage: "6d10 ion",
        description: "Specialized weapons designed to disable enemy ships by disrupting their systems."
      },
      {
        name: "Tractor Beam Projectors",
        description: "The Star Destroyer can target one Gargantuan or smaller starship within 1,200 feet. The target must succeed on a DC 19 Strength saving throw or be pulled up to 120 feet toward the Star Destroyer and have its speed reduced to 0 until the start of the Star Destroyer's next turn."
      }
    ]
  },
  {
    id: "mon-calamari-cruiser",
    name: "Mon Calamari Star Cruiser",
    category: "Capital Ship",
    size: "Colossal",
    description: "Converted from civilian vessels, these powerful warships form the backbone of the Rebel Alliance fleet with their enhanced shield systems and unique designs.",
    armorClass: 18,
    hullPoints: 1800,
    shieldPoints: 800,
    speed: 40,
    crew: {
      min: 3000,
      max: 5400,
      roles: ["Bridge Crew", "Engineering", "Gunnery", "Support Staff"]
    },
    passengers: 1200,
    cargoCapacity: "20,000 tons",
    consumables: "2 years",
    hyperdrive: "Class 1",
    systems: [
      "Class 1 sensor array",
      "Military comm system",
      "36 starfighter complement",
      "80 escape pods",
      "Medical bay"
    ],
    specialFeatures: [
      {
        name: "Alliance Capital Ship",
        description: "The Mon Calamari cruiser is the backbone of the Rebel Alliance fleet."
      },
      {
        name: "Enhanced Shields",
        description: "Mon Calamari cruisers have exceptionally strong shield systems."
      },
      {
        name: "Fighter Complement",
        description: "The cruiser carries a complement of 36 starfighters, typically X-wings, A-wings, and Y-wings."
      },
      {
        name: "Modular Design",
        description: "Each Mon Calamari cruiser is unique, as they were converted from civilian vessels. The layout and capabilities can vary significantly between ships."
      }
    ],
    actions: [
      {
        name: "Turbolaser Batteries",
        attackBonus: 10,
        range: "4,000/16,000 ft.",
        damage: "6d10 energy",
        description: "The cruiser's primary armament is its numerous turbolaser batteries."
      },
      {
        name: "Ion Cannon Batteries",
        attackBonus: 10,
        range: "3,000/12,000 ft.",
        damage: "5d10 ion",
        description: "Specialized weapons designed to disable enemy ships by disrupting their systems."
      },
      {
        name: "Tractor Beam Projectors",
        description: "The cruiser targets one Gargantuan or smaller starship within 1,000 feet. The target must succeed on a DC 18 Strength saving throw or be pulled up to 100 feet toward the cruiser and have its speed reduced to 0 until the start of the cruiser's next turn."
      }
    ]
  }
];