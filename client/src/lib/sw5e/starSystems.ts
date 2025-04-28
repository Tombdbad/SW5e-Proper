export interface StarSystem {
  id: string;
  name: string;
  region: string;
  type: string;
  description?: string;
  planets?: string[];
  x: number;
  y: number;
  z: number;
}

export const starSystems: StarSystem[] = [
  {
    id: "coruscant",
    name: "Coruscant System",
    region: "Core Worlds",
    type: "G",
    description: "Home to the galactic capital, the Coruscant system is the political center of the galaxy with a single ecumenopolis planet.",
    planets: ["Coruscant"],
    x: 0,
    y: 0,
    z: 0
  },
  {
    id: "corellia",
    name: "Corellia System",
    region: "Core Worlds",
    type: "F",
    description: "A major shipbuilding hub and center of commerce, the Corellia system contains five habitable planets.",
    planets: ["Corellia", "Selonia", "Drall"],
    x: -15,
    y: 2,
    z: 10
  },
  {
    id: "alderaan",
    name: "Alderaan System",
    region: "Core Worlds",
    type: "G",
    description: "A peaceful system once known for its beauty and culture before its tragic destruction.",
    planets: ["Alderaan"],
    x: -10,
    y: 5,
    z: -5
  },
  {
    id: "tatoo",
    name: "Tatoo System",
    region: "Outer Rim",
    type: "G",
    description: "A binary star system with two suns, home to the desert planet Tatooine.",
    planets: ["Tatooine"],
    x: 65,
    y: -3,
    z: 42
  },
  {
    id: "yavin",
    name: "Yavin System",
    region: "Outer Rim",
    type: "K",
    description: "A remote system with a red giant star, surrounded by numerous moons, including the famous Yavin 4.",
    planets: ["Yavin", "Yavin 4"],
    x: 45,
    y: 1,
    z: -25
  },
  {
    id: "hoth",
    name: "Hoth System",
    region: "Outer Rim",
    type: "A",
    description: "A remote, cold system containing the ice planet Hoth and an asteroid belt.",
    planets: ["Hoth"],
    x: 55,
    y: -2,
    z: -35
  },
  {
    id: "dagobah",
    name: "Dagobah System",
    region: "Outer Rim",
    type: "M",
    description: "An isolated system containing the swamp planet Dagobah, strong with the Force.",
    planets: ["Dagobah"],
    x: 60,
    y: -8,
    z: 15
  },
  {
    id: "naboo",
    name: "Naboo System",
    region: "Mid Rim",
    type: "G",
    description: "A peaceful system home to the lush planet Naboo and its watery core.",
    planets: ["Naboo"],
    x: 30,
    y: 4,
    z: 20
  },
  {
    id: "kamino",
    name: "Kamino System",
    region: "Wild Space",
    type: "B",
    description: "A stormy system with the water world Kamino, known for its cloning facilities.",
    planets: ["Kamino"],
    x: -40,
    y: 0,
    z: 65
  },
  {
    id: "mustafar",
    name: "Mustafar System",
    region: "Outer Rim",
    type: "K",
    description: "A volatile system with the volcanic planet Mustafar, rich in mineral resources.",
    planets: ["Mustafar"],
    x: 50,
    y: -5,
    z: 30
  },
  {
    id: "kashyyyk",
    name: "Kashyyyk System",
    region: "Mid Rim",
    type: "G",
    description: "A verdant system containing Kashyyyk, the forested home world of the Wookiees.",
    planets: ["Kashyyyk"],
    x: 35,
    y: 7,
    z: -10
  },
  {
    id: "endor",
    name: "Endor System",
    region: "Outer Rim",
    type: "G",
    description: "A system with a large gas giant Endor and its forested sanctuary moon.",
    planets: ["Endor"],
    x: 40,
    y: -2,
    z: -45
  },
  {
    id: "bespin",
    name: "Bespin System",
    region: "Outer Rim",
    type: "A",
    description: "A system centered around a gas giant with valuable tibanna gas resources.",
    planets: ["Bespin"],
    x: 42,
    y: 3,
    z: -30
  },
  {
    id: "geonosis",
    name: "Geonosis System",
    region: "Outer Rim",
    type: "K",
    description: "A system with a harsh desert planet home to the insectoid Geonosians.",
    planets: ["Geonosis"],
    x: 43,
    y: -4,
    z: 37
  },
  {
    id: "ilum",
    name: "Ilum System",
    region: "Unknown Regions",
    type: "B",
    description: "A remote system containing the ice world Ilum, source of kyber crystals used in lightsabers.",
    planets: ["Ilum"],
    x: -60,
    y: 5,
    z: -50
  }
];
