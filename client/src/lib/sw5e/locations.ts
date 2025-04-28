// Locations data for SW5E
export interface StarSystem {
  id: string;
  name: string;
  galacticRegion: string;
  notablePlanets: string[];
  controllingFactions: string[];
  relevance: string;
  moons?: string[];
  noteworthySettlements: string[];
}

export interface Planet {
  id: string;
  name: string;
  starSystem: string;
  description: string;
  climate: string;
  terrain: string[];
  population: string;
  government: string;
  majorSpecies: string[];
  importantLocations: string[];
  pointsOfInterest: {
    name: string;
    description: string;
  }[];
}

export const starSystems: StarSystem[] = [
  {
    id: "alderaan-system",
    name: "Alderaan",
    galacticRegion: "Core Worlds",
    notablePlanets: ["Alderaan"],
    controllingFactions: ["Rebel Alliance (pre-destruction)", "Empire (briefly)"],
    relevance: "Peaceful culture, destroyed by Death Star",
    moons: ["None (numerous minor celestial bodies)"],
    noteworthySettlements: ["Aldera (capital)", "Krennel"]
  },
  {
    id: "tatooine-system",
    name: "Tatooine",
    galacticRegion: "Outer Rim",
    notablePlanets: ["Tatooine"],
    controllingFactions: ["Hutt Cartel", "Galactic Empire (limited)"],
    relevance: "Jabba's Palace, Mos Eisley",
    moons: ["Ghomrassen", "Chenini"],
    noteworthySettlements: ["Mos Eisley", "Mos Espa", "Anchorhead"]
  },
  {
    id: "coruscant-system",
    name: "Coruscant",
    galacticRegion: "Core Worlds",
    notablePlanets: ["Coruscant"],
    controllingFactions: ["Galactic Republic", "Galactic Empire"],
    relevance: "Jedi Temple, Ecumenopolis, Black Sun territory",
    moons: ["Lunae", "Centax-1", "Centax-2", "Centax-3"],
    noteworthySettlements: ["Coruscant City (entire planet)"]
  },
  {
    id: "naboo-system",
    name: "Naboo",
    galacticRegion: "Mid Rim",
    notablePlanets: ["Naboo"],
    controllingFactions: ["Galactic Republic", "Separatists", "Galactic Empire"],
    relevance: "Home of Padmé and Palpatine, diverse environments",
    moons: ["Onoam", "Veruna", "Rori"],
    noteworthySettlements: ["Theed (capital)", "Kaadara", "Otoh Gunga"]
  },
  {
    id: "kashyyyk-system",
    name: "Kashyyyk",
    galacticRegion: "Mid Rim/Outer Rim Border",
    notablePlanets: ["Kashyyyk"],
    controllingFactions: ["Galactic Republic", "Separatists", "Galactic Empire"],
    relevance: "Wookiee homeworld, giant trees, dangerous wildlife",
    moons: ["Unknown (numerous)"],
    noteworthySettlements: ["Kachirho", "Rwookrrorro"]
  },
  {
    id: "hoth-system",
    name: "Hoth",
    galacticRegion: "Outer Rim",
    notablePlanets: ["Hoth"],
    controllingFactions: ["Rebel Alliance", "Galactic Empire"],
    relevance: "Site of Echo Base, icy planet",
    moons: ["None"],
    noteworthySettlements: ["Echo Base (abandoned)"]
  },
  {
    id: "bespin-system",
    name: "Bespin",
    galacticRegion: "Outer Rim",
    notablePlanets: ["Bespin"],
    controllingFactions: ["Neutral (initially)", "Galactic Empire", "Rebel Alliance"],
    relevance: "Tibanna gas mining, Cloud City, criminals and gamblers",
    moons: ["None"],
    noteworthySettlements: ["Cloud City"]
  },
  {
    id: "endor-system",
    name: "Endor",
    galacticRegion: "Outer Rim",
    notablePlanets: ["Endor (forest moon)"],
    controllingFactions: ["Galactic Empire", "Rebel Alliance", "Ewoks"],
    relevance: "Ewok homeworld, crucial battle, tree villages",
    moons: ["None (moon of a gas giant)"],
    noteworthySettlements: ["Bright Tree Village (Ewok)"]
  },
  {
    id: "mandalore-system",
    name: "Mandalore",
    galacticRegion: "Outer Rim",
    notablePlanets: ["Mandalore"],
    controllingFactions: ["Mandalorians", "Galactic Empire"],
    relevance: "Mandalorian homeworld, Beskar, Mandalorian lore",
    moons: ["Concordia"],
    noteworthySettlements: ["Keldabe (capital)", "Sundari"]
  },
  {
    id: "nar-shaddaa-system",
    name: "Nar Shaddaa",
    galacticRegion: "Hutt Space",
    notablePlanets: ["Nar Shaddaa"],
    controllingFactions: ["Hutt Cartel", "Smuggler's Guild"],
    relevance: "Smuggler's Moon, Vertical City, hive of scum and villainy",
    moons: ["None (moon of Nal Hutta)"],
    noteworthySettlements: ["Vertical City (entire moon)"]
  }
];

export const planets: Planet[] = [
  {
    id: "tatooine",
    name: "Tatooine",
    starSystem: "Tatooine",
    description: "A harsh desert world orbiting twin suns in the Outer Rim, known for moisture farms, Tusken Raiders, and being a hub for smugglers and crime syndicates.",
    climate: "Arid",
    terrain: ["Desert", "Canyons", "Rocky waste", "Mountain ranges"],
    population: "Sparse",
    government: "Local (Hutts control criminal aspects)",
    majorSpecies: ["Humans", "Jawas", "Tusken Raiders", "Various aliens"],
    importantLocations: ["Mos Eisley Spaceport", "Jabba's Palace", "Dune Sea", "Jundland Wastes"],
    pointsOfInterest: [
      {
        name: "Mos Eisley Cantina",
        description: "A notorious bar and hub for smugglers, bounty hunters, and pilots seeking work or hiding from the law."
      },
      {
        name: "Beggar's Canyon",
        description: "A treacherous series of ravines where young pilots test their skills racing through the narrow passages."
      },
      {
        name: "Great Pit of Carkoon",
        description: "Location of the Sarlacc, a massive creature that digests its prey over a thousand years, used for executions by Jabba the Hutt."
      }
    ]
  },
  {
    id: "coruscant",
    name: "Coruscant",
    starSystem: "Coruscant",
    description: "The bright center of the galaxy, Coruscant is an ecumenopolis—a city that covers the entire planet—and was the capital of the Republic and later the Empire.",
    climate: "Temperate (artificially controlled)",
    terrain: ["Urban", "Cityscape"],
    population: "Extremely dense (trillions)",
    government: "Central (Republic, then Empire)",
    majorSpecies: ["Humans", "Countless alien species"],
    importantLocations: ["Jedi Temple", "Senate Building", "Imperial Palace", "The Works", "Underworld"],
    pointsOfInterest: [
      {
        name: "Jedi Temple",
        description: "The center of the Jedi Order for thousands of years until the rise of the Empire, when it was converted to the Imperial Palace."
      },
      {
        name: "Senate District",
        description: "The political heart of the galaxy, housing the Senate Building and opulent residences for politicians and dignitaries."
      },
      {
        name: "Coruscant Underworld",
        description: "The lower levels of the city-planet, where sunlight never reaches and criminal organizations flourish in the shadows."
      }
    ]
  },
  {
    id: "naboo",
    name: "Naboo",
    starSystem: "Naboo",
    description: "A lush, peaceful planet with rolling plains, swamps, and seas. Home to both humans and the indigenous Gungans who live in underwater cities.",
    climate: "Temperate",
    terrain: ["Plains", "Swamps", "Hills", "Forests", "Cities"],
    population: "Medium",
    government: "Elected monarchy",
    majorSpecies: ["Humans", "Gungans"],
    importantLocations: ["Theed Royal Palace", "Otoh Gunga", "Plasma mines", "Lake Country"],
    pointsOfInterest: [
      {
        name: "Theed Royal Palace",
        description: "The seat of the elected monarch of Naboo, an impressive building combining art and architecture with defensive capabilities."
      },
      {
        name: "Otoh Gunga",
        description: "The underwater city of the Gungans, built with hydrostatic bubble technology to create habitable spaces beneath the waters of Naboo."
      },
      {
        name: "Lake Country",
        description: "A remote region filled with islands and villas, known for its beauty and privacy, making it a retreat for the planet's elite."
      }
    ]
  },
  {
    id: "kashyyyk",
    name: "Kashyyyk",
    starSystem: "Kashyyyk",
    description: "A lush jungle world dominated by massive wroshyr trees, home to the powerful Wookiee species and incredibly diverse and dangerous wildlife.",
    climate: "Tropical",
    terrain: ["Jungles", "Forests", "Lakes"],
    population: "Medium",
    government: "Tribal (Wookiee chieftains)",
    majorSpecies: ["Wookiees"],
    importantLocations: ["Rwookrrorro", "Kachirho", "Wawaatt Archipelago"],
    pointsOfInterest: [
      {
        name: "Great Tree of Rwookrrorro",
        description: "The largest wroshyr tree on Kashyyyk and the center of the Wookiee capital city built within its massive branches."
      },
      {
        name: "Shadowlands",
        description: "The dark and dangerous lower levels of the forest floor, home to Kashyyyk's most deadly predators and rarely visited even by Wookiees."
      },
      {
        name: "Beach of Black Sand",
        description: "A unique shore along Kashyyyk's coast with volcanic black sand, considered sacred to some Wookiee tribes."
      }
    ]
  },
  {
    id: "hoth",
    name: "Hoth",
    starSystem: "Hoth",
    description: "A remote ice planet and the sixth planet in the Hoth system, with average temperatures cold enough to kill most species in minutes without protection.",
    climate: "Arctic",
    terrain: ["Ice plains", "Frozen mountains", "Caves"],
    population: "Nearly uninhabited",
    government: "None",
    majorSpecies: ["Wampas", "Tauntauns"],
    importantLocations: ["Echo Base (abandoned Rebel base)", "Ice caves"],
    pointsOfInterest: [
      {
        name: "Echo Base",
        description: "Former Rebel Alliance base carved into the ice of a mountain ridge, hastily evacuated during the Empire's attack."
      },
      {
        name: "Wampa Caves",
        description: "Network of ice tunnels where the predatory wampa creatures drag their prey to consume at leisure."
      },
      {
        name: "Meteor Impact Crater",
        description: "A massive depression in the ice created by an ancient meteorite impact, containing unique minerals not found elsewhere on the planet."
      }
    ]
  }
];