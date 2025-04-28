// Droids data for SW5E
export interface Droid {
  id: string;
  name: string;
  series: string;
  manufacturer: string;
  droidClass: "Class I" | "Class II" | "Class III" | "Class IV" | "Class V";
  primaryFunction: string;
  size: "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";
  appearance: string;
  personalityTraits?: string[];
  specialAbilities?: string[];
  equipment?: string[];
  restrictions?: string[];
  cost: number;
  stats?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
}

export const droids: Droid[] = [
  {
    id: "r2-series",
    name: "R2-Series Astromech Droid",
    series: "R-Series",
    manufacturer: "Industrial Automaton",
    droidClass: "Class II",
    primaryFunction: "Starship repair and navigation",
    size: "Small",
    appearance: "Cylindrical body with a domed head, featuring various tools and utility arms",
    personalityTraits: [
      "Inquisitive",
      "Loyal",
      "Brave",
      "Resourceful"
    ],
    specialAbilities: [
      "Starship interface/repair",
      "Computer interface/slicing",
      "Holographic projection",
      "Flight (limited)",
      "Extensive starship database"
    ],
    equipment: [
      "Electric pike (2d4 lightning damage)",
      "Fire extinguisher",
      "Various mechanical tools",
      "Data port connector"
    ],
    restrictions: [
      "Limited verbal communication (binary only)",
      "Vulnerable to ion damage"
    ],
    cost: 4500,
    stats: {
      str: 10,  // 0
      dex: 14,  // +2
      con: 14,  // +2
      int: 14,  // +2
      wis: 12,  // +1
      cha: 10   // 0
    }
  },
  {
    id: "protocol-droid",
    name: "Protocol Droid",
    series: "3PO-Series",
    manufacturer: "Cybot Galactica",
    droidClass: "Class III",
    primaryFunction: "Translation and etiquette",
    size: "Medium",
    appearance: "Humanoid body with a metal finish, fixed facial expression, and stiff gait",
    personalityTraits: [
      "Proper",
      "Anxious",
      "Knowledgeable",
      "Talkative"
    ],
    specialAbilities: [
      "Fluent in over six million forms of communication",
      "Extensive cultural database",
      "Diplomatic protocols",
      "Basic repair knowledge"
    ],
    equipment: [
      "Integrated translator unit",
      "Cultural database",
      "Etiquette subroutines"
    ],
    restrictions: [
      "Poor mobility",
      "Limited combat capabilities",
      "Vulnerable to ion damage"
    ],
    cost: 3000,
    stats: {
      str: 8,   // -1
      dex: 8,   // -1
      con: 10,  // 0
      int: 16,  // +3
      wis: 12,  // +1
      cha: 14   // +2
    }
  },
  {
    id: "battle-droid",
    name: "B1 Battle Droid",
    series: "B-Series",
    manufacturer: "Baktoid Combat Automata",
    droidClass: "Class IV",
    primaryFunction: "Combat and security",
    size: "Medium",
    appearance: "Skeletal humanoid body with a backpack-like power unit and thin limbs",
    personalityTraits: [
      "Literal-minded",
      "Obedient",
      "Limited initiative"
    ],
    specialAbilities: [
      "Network coordination",
      "Combat programming",
      "Basic tactical analysis"
    ],
    equipment: [
      "Standard blaster rifle (1d8 energy damage)",
      "Limited armor (AC 12)"
    ],
    restrictions: [
      "Dependent on control signal in some configurations",
      "Limited intelligence",
      "Vulnerable to ion damage"
    ],
    cost: 1800,
    stats: {
      str: 10,  // 0
      dex: 12,  // +1
      con: 10,  // 0
      int: 8,   // -1
      wis: 8,   // -1
      cha: 6    // -2
    }
  },
  {
    id: "probe-droid",
    name: "Probe Droid",
    series: "Viper Series",
    manufacturer: "Arakyd Industries",
    droidClass: "Class IV",
    primaryFunction: "Reconnaissance and intelligence gathering",
    size: "Medium",
    appearance: "Spherical main body with multiple appendages, sensors, and repulsorlift engine",
    personalityTraits: [
      "Determined",
      "Single-minded",
      "Efficient"
    ],
    specialAbilities: [
      "Enhanced sensory package",
      "Stealth capabilities",
      "Long-range communication",
      "Self-destruct mechanism",
      "Atmospheric and vacuum operation"
    ],
    equipment: [
      "Blaster cannon (2d6 energy damage)",
      "Recording equipment",
      "Advanced sensors",
      "Repulsorlift engine"
    ],
    restrictions: [
      "Limited communication capabilities",
      "Specialized programming",
      "Vulnerable to ion damage"
    ],
    cost: 7000,
    stats: {
      str: 12,  // +1
      dex: 14,  // +2
      con: 12,  // +1
      int: 12,  // +1
      wis: 14,  // +2
      cha: 6    // -2
    }
  },
  {
    id: "medical-droid",
    name: "2-1B Surgical Droid",
    series: "2-1B Series",
    manufacturer: "Industrial Automaton",
    droidClass: "Class I",
    primaryFunction: "Medical care and surgical procedures",
    size: "Medium",
    appearance: "Humanoid body with specialized medical appendages and a detailed sensor array",
    personalityTraits: [
      "Analytical",
      "Calm",
      "Precise",
      "Caring"
    ],
    specialAbilities: [
      "Advanced medical knowledge",
      "Surgical precision",
      "Diagnostic capabilities",
      "Emergency medical protocols"
    ],
    equipment: [
      "Surgical tools",
      "Medical scanner",
      "Bacta administration system",
      "Emergency medical supplies"
    ],
    restrictions: [
      "Limited mobility",
      "Specialized function",
      "Vulnerable to ion damage"
    ],
    cost: 4200,
    stats: {
      str: 8,   // -1
      dex: 16,  // +3
      con: 10,  // 0
      int: 16,  // +3
      wis: 14,  // +2
      cha: 10   // 0
    }
  },
  {
    id: "assassin-droid",
    name: "IG-Series Assassin Droid",
    series: "IG-Series",
    manufacturer: "Holowan Laboratories",
    droidClass: "Class IV",
    primaryFunction: "Assassination and combat",
    size: "Medium",
    appearance: "Tall, thin humanoid body with a cylindrical head and advanced weaponry",
    personalityTraits: [
      "Calculating",
      "Methodical",
      "Relentless",
      "Logical"
    ],
    specialAbilities: [
      "Advanced combat protocols",
      "Self-modification capabilities",
      "Tactical analysis",
      "Target tracking",
      "Multiple limb coordination"
    ],
    equipment: [
      "Built-in blaster rifles (2d8 energy damage)",
      "Flame projector (2d6 fire damage)",
      "Reinforced armor (AC 16)",
      "Various specialized weapons"
    ],
    restrictions: [
      "Often restricted by Imperial law",
      "High maintenance requirements",
      "Vulnerable to ion damage"
    ],
    cost: 15000,
    stats: {
      str: 16,  // +3
      dex: 18,  // +4
      con: 14,  // +2
      int: 14,  // +2
      wis: 12,  // +1
      cha: 8    // -1
    }
  },
  {
    id: "kx-security-droid",
    name: "KX-Series Security Droid",
    series: "KX-Series",
    manufacturer: "Arakyd Industries",
    droidClass: "Class IV",
    primaryFunction: "Imperial security and enforcement",
    size: "Large",
    appearance: "Tall, imposing humanoid body with black finish and glowing eyes",
    personalityTraits: [
      "Blunt",
      "Strategic",
      "Confident",
      "Intimidating"
    ],
    specialAbilities: [
      "Strategic analysis",
      "Enhanced strength",
      "Combat programming",
      "Imperial security protocols",
      "Statistical analysis"
    ],
    equipment: [
      "Heavy blaster pistol (1d8 energy damage)",
      "Reinforced structure (AC 15)"
    ],
    restrictions: [
      "Imperial programming restrictions",
      "Limited stealth capabilities",
      "Vulnerable to ion damage"
    ],
    cost: 8500,
    stats: {
      str: 18,  // +4
      dex: 14,  // +2
      con: 16,  // +3
      int: 12,  // +1
      wis: 12,  // +1
      cha: 10   // 0
    }
  },
  {
    id: "bb-series",
    name: "BB-Series Astromech Droid",
    series: "BB-Series",
    manufacturer: "Industrial Automaton",
    droidClass: "Class II",
    primaryFunction: "Starship maintenance and navigation",
    size: "Small",
    appearance: "Spherical body with a domed head that attaches magnetically",
    personalityTraits: [
      "Excitable",
      "Curious",
      "Loyal",
      "Adaptable"
    ],
    specialAbilities: [
      "Advanced navigation systems",
      "Rapid movement on flat surfaces",
      "Holographic projection",
      "Ship systems interface",
      "Terrain adaptation"
    ],
    equipment: [
      "Various mechanical tools",
      "Data port connector",
      "Internal compartments for small items",
      "Small welding torch"
    ],
    restrictions: [
      "Limited communication (binary only)",
      "Difficulty with stairs and uneven terrain",
      "Vulnerable to ion damage"
    ],
    cost: 5500,
    stats: {
      str: 8,   // -1
      dex: 16,  // +3
      con: 12,  // +1
      int: 14,  // +2
      wis: 12,  // +1
      cha: 12   // +1
    }
  }
];

// Helper function to get droids by class
export function getDroidsByClass(droidClass: Droid['droidClass']): Droid[] {
  return droids.filter(droid => droid.droidClass === droidClass);
}

// Helper function to find a droid by ID
export function findDroidById(id: string): Droid | undefined {
  return droids.find(droid => droid.id === id);
}

// Helper function to get droids by primary function
export function getDroidsByFunction(functionType: string): Droid[] {
  return droids.filter(droid => 
    droid.primaryFunction.toLowerCase().includes(functionType.toLowerCase())
  );
}