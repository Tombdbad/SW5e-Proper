/**
 * Shared logic library for SW5E: pure functions usable on both client and server.
 *
 * World generation. A campaign world is a tree of areas, outermost to innermost:
 *   galaxy > region > system > planet > settlement > building > room
 * Areas of one kind are joined by paths (hyperlanes, sublight lanes, routes, streets, doors), and
 * every container has at least one gateway child: the way in and out. So any two places are
 * joined by a route that reads like travel: out through the door, down the street to the
 * starport, up to orbit, along the hyperlane, and back down on the other side.
 *
 * Every area is a place to stand: a room, the street in front of a building, the outskirts of a
 * settlement, a planet's orbit, a system's jump point. Regions and the galaxy only group systems.
 *
 * generateWorld, expandArea and populateArea need the rules data (stat blocks, equipment,
 * enhanced items, starship equipment, travel times) and run where it is loaded: on the server.
 * The edit and travel functions need only the world itself and run anywhere.
 */
import type { Sw5eMonster, Sw5eEquipment, Sw5eEnhancedItem, Sw5eTravel, Sw5eRecord } from "../data";

// ---------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------

export const AREA_KINDS = ["galaxy", "region", "system", "planet", "settlement", "building", "room"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export type PathKind = "hyperlane" | "sublight" | "route" | "street" | "door";

// The path kind that joins areas of each kind
export const PATH_KIND: Partial<Record<AreaKind, PathKind>> = {
  system: "hyperlane",
  planet: "sublight",
  settlement: "route",
  building: "street",
  room: "door",
};

export interface Occupant {
  id: string;
  name: string;
  role: string;
  disposition: "friendly" | "neutral" | "hostile";
  count: number;
  species?: string;
  // Stat block id in the monsters data; the combat figures below are copied from it
  statBlock?: string;
  cr?: string;
  xp?: number;
  armorClass?: number;
  hitPoints?: number;
  // Hit points now of those who are hurt and still standing (the survivors of a fight the party
  // did not finish), in the order they are fought; a creature past the list is unhurt
  wounds?: number[];
  // `range` is the reach of a melee attack or the normal range of a ranged one, in feet; `long` its long range
  attack?: { name: string; bonus: number; damage: string; damageType?: string; ranged?: boolean; range?: number; long?: number };
  // Walking speed in feet, size and creature type, as the stat block gives them
  speed?: number;
  size?: string;
  creature?: string;
  // Ability modifiers, for saving throws
  saves?: Record<string, number>;
  // Equipment names from the equipment data
  loadout: string[];
  // A merchant's line of goods (a WARES key); others trade by their role (see waresOf)
  trade?: string;
  // Where they live and how their days go, and the ship they fly (see "Routines")
  routine?: Routine;
  ship?: string;
}

export interface Ship {
  id: string;
  name: string;
  size: string;
  role: string;
  tier: number;
  status: "landed" | "docked" | "orbiting" | "wrecked";
  owner: string;
  // Names from the starship equipment data
  equipment: string[];
  hyperdriveClass?: string;
  value: number;
  // The ports it flies between (see "Routines")
  voyage?: Voyage;
}

export interface LootCache {
  id: string;
  name: string;
  kind: string;
  credits: number;
  items: { name: string; quantity: number; source: "equipment" | "enhancedItems"; rarity?: string }[];
  locked?: number; // DC to open
  hidden?: boolean;
  looted?: boolean;
}

export interface Area {
  id: string;
  kind: AreaKind;
  name: string;
  parentId: string | null;
  // Subtype: region name, star class, biome, settlement type, building type or room purpose
  type: string;
  description: string;
  tags: string[];
  position: { x: number; y: number; z: number };
  // 0 safe, 1 easy, 2 medium, 3 hard, 4 deadly: the encounter budget used when populating
  danger: number;
  faction?: string;
  // The way in and out of the parent area
  gateway?: boolean;
  occupants: Occupant[];
  ships: Ship[];
  loot: LootCache[];
  // A room's floor plan: its place on the building's grid and what stands where (see planBuilding)
  layout?: RoomLayout;
  // A quiet way into this room from outside the building, and the DC to find it
  secretEntry?: { name: string; dc: number; found?: boolean };
  // How far the hostile creatures here have noticed the party (index into ALERT_LEVELS), and
  // whether they have been talked into letting the party pass
  alert?: number;
  allowed?: boolean;
  // A building where the alarm has been raised
  alarm?: boolean;
}

export interface Path {
  id: string;
  from: string;
  to: string;
  kind: PathKind;
  label: string;
  travel: string;
  locked?: number; // DC to open
  hidden?: boolean;
}

export interface World {
  version: 1;
  seed: number;
  name: string;
  partyLevel: number;
  partySize: number;
  // The faction whose forces are hostile
  antagonist: string;
  rootId: string;
  startId: string;
  areas: Record<string, Area>;
  paths: Path[];
  counter: number;
  // Which upgrade of the people in it the world has had (see livenWorld); absent in older worlds
  life?: number;
  // The era it is set in (ERAS); absent in worlds made before eras (the Galactic Civil War)
  era?: string;
}

export interface WorldOptions {
  seed?: number;
  name?: string;
  partyLevel?: number;
  partySize?: number;
  antagonist?: string;
  // Generated systems added so every region has at least this many (1 to 3)
  systemsPerRegion?: number;
  startPlanet?: string;
  // The era (an ERAS id); the enemy is one the era has, unless named
  era?: string;
  // "start": settlements, buildings and rooms for the starting planet only (the rest on demand);
  // "all": for every planet
  detail?: "start" | "all";
}

// Known systems and planets to build the galaxy around
export interface SettingSeed {
  systems: { name: string; region: string; planets?: string[]; description?: string; factions?: string[]; settlements?: string[] }[];
  planets: { name: string; climate?: string; terrain?: string[]; description?: string; locations?: string[]; species?: string[] }[];
}

export interface WorldCatalog {
  monsters: Sw5eMonster[];
  equipment: Sw5eEquipment[];
  enhancedItems: Sw5eEnhancedItem[];
  species: Sw5eRecord[];
  starshipEquipment: Sw5eRecord[];
  travel: Sw5eTravel;
  // Credits a character should have earned by each level, 1st level first (Player's Handbook)
  wealthByLevel: number[];
  setting?: SettingSeed;
}

// ---------------------------------------------------------------------------------------------
// Deterministic random numbers (the same seed gives the same world)
// ---------------------------------------------------------------------------------------------

export function createRandom(seed: number) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (probability: number) => next() < probability,
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
type Random = ReturnType<typeof createRandom>;

// ---------------------------------------------------------------------------------------------
// Generation tables (setting flavour; all rules content comes from the catalog)
// ---------------------------------------------------------------------------------------------

// Lawlessness by region name; unknown names count as frontier
const REGION_DANGER: Record<string, number> = {
  "Deep Core": 2, Core: 0, Colonies: 0, "Inner Rim": 1, "Expansion Region": 1, "Mid Rim": 1,
  "Outer Rim": 2, "Wild Space": 3, "Unknown Regions": 3,
};

const BIOMES = ["desert", "ice", "forest", "jungle", "swamp", "ocean", "volcanic", "urban", "temperate", "barren", "gas giant"] as const;

// Words in a stat block's text that tie a creature to a biome
const BIOME_WORDS: Record<string, string[]> = {
  desert: ["desert", "sand", "dune", "tatooine", "arid", "wastes"],
  ice: ["ice", "snow", "frozen", "tundra", "hoth", "arctic", "cold"],
  forest: ["forest", "tree", "woodland", "kashyyyk", "endor"],
  jungle: ["jungle", "rainforest", "felucia", "yavin", "tropical"],
  swamp: ["swamp", "bog", "marsh", "dagobah", "mud"],
  ocean: ["ocean", "sea", "aquatic", "underwater", "water", "naboo", "kamino"],
  volcanic: ["volcan", "lava", "mustafar", "molten"],
  urban: ["city", "sewer", "urban", "coruscant", "underworld", "garbage", "trash"],
  temperate: ["plain", "grass", "hill", "farm", "herd", "domesticated"],
  barren: ["cave", "rock", "asteroid", "canyon", "crater", "mountain"],
  "gas giant": ["cloud", "sky", "flying", "bespin"],
};

const ROUTE_LABEL: Record<string, string[]> = {
  desert: ["Desert trail", "Speeder route"], ice: ["Ice road", "Glacier pass"], forest: ["Forest track", "River route"],
  jungle: ["Jungle trail", "River route"], swamp: ["Causeway", "Bog trail"], ocean: ["Sea lane", "Submarine tube"],
  volcanic: ["Ash road", "Lava-field crossing"], urban: ["Skylane", "Mag-lev line"], temperate: ["Highway", "Mag-lev line"],
  barren: ["Canyon road", "Crawler track"], "gas giant": ["Shuttle lane", "Tether line"],
};

// Settlement types and the buildings they are made of. "*" marks a gateway; "?" an optional one.
const SETTLEMENTS: Record<string, { buildings: string[]; street: string[] }> = {
  city: { buildings: ["spaceport*", "city gate*", "cantina", "market", "garrison", "medcenter", "workshop?", "residences", "palace?", "warehouse?", "archive?", "hideout?"], street: ["Avenue", "Skywalk", "Alley", "Transit tube"] },
  town: { buildings: ["landing field*", "town gate*", "cantina", "market", "workshop", "residences?", "garrison?", "medcenter?", "hideout?"], street: ["Street", "Alley", "Dirt road"] },
  outpost: { buildings: ["landing pad*", "command post", "garrison", "warehouse", "workshop?"], street: ["Perimeter path", "Covered walkway"] },
  station: { buildings: ["docking ring*", "promenade", "operations center", "engineering", "habitat ring", "cargo bay?"], street: ["Ring corridor", "Turbolift", "Maintenance shaft"] },
  "cave system": { buildings: ["trailhead*", "cave", "cave?"], street: ["Trail", "Scree slope"] },
  ruins: { buildings: ["trailhead*", "ruin", "ruin?", "cave?"], street: ["Overgrown path", "Broken causeway"] },
  "crash site": { buildings: ["trailhead*", "wreck", "camp?"], street: ["Debris trail", "Gully"] },
  "raider camp": { buildings: ["trailhead*", "camp", "camp?", "cave?"], street: ["Trail", "Dry wash"] },
};

// Wilderness sites that suit each biome
const WILD_SITES: Record<string, string[]> = {
  desert: ["raider camp", "cave system", "ruins", "crash site"], ice: ["cave system", "crash site", "ruins"],
  forest: ["ruins", "cave system", "raider camp"], jungle: ["ruins", "cave system", "crash site"],
  swamp: ["ruins", "cave system"], ocean: ["crash site", "ruins"], volcanic: ["cave system", "ruins"],
  urban: ["ruins", "raider camp"], temperate: ["raider camp", "ruins", "cave system"],
  barren: ["crash site", "cave system"], "gas giant": ["crash site"],
};

// Rooms of each building type. The first room is the entrance. After "|" come content codes:
//   s staff   p patrons or residents   g guards   b leader   w wildlife   h horrors
//   d utility droid   S ship berth   K locked door   H hidden door   L:<kind> loot cache
//   m a band, with a stage to play on   D a service droid (most cantinas have one)   X a fence (the black market)
//   @n the room this one opens off (its index in the list); without it, the room before
const BUILDINGS: Record<string, { hostile?: "faction" | "criminal" | "wild" | "horror"; rooms: string[] }> = {
  spaceport: { rooms: ["Arrivals concourse|s p", "Customs office|s g", "Docking bay|S s d", "Maintenance hangar|S d L:workshop", "Control tower|s K @0", "Bonded warehouse|L:cargo K g @1"] },
  "landing field": { rooms: ["Landing field|S s", "Fuel depot|d L:workshop", "Port office|s L:coin K @0"] },
  "landing pad": { rooms: ["Landing pad|S s", "Fuel depot|d L:workshop"] },
  "docking ring": { rooms: ["Airlock|s", "Docking arm|S d", "Customs lock|s g @0", "Freight lift|L:cargo @2"] },
  "city gate": { rooms: ["Gate|g", "Guard room|g L:armory K"] },
  "town gate": { rooms: ["Gate|g", "Watch post|L:armory K"] },
  trailhead: { rooms: ["Trailhead|", "Old shelter|L:remains"] },
  cantina: { rooms: ["Entrance|", "Main bar|s p p m D", "Private booth|p", "Back room|p g K X @1", "Cellar|L:stash H"] },
  promenade: { rooms: ["Promenade|p p", "Cantina|s p m D", "Trade stalls|s s L:coin @0", "Storeroom|L:cargo K"] },
  market: { rooms: ["Market gate|p", "Stalls|s s p", "Trader's office|s L:coin K", "Storehouse|L:cargo @1"] },
  garrison: { hostile: "faction", rooms: ["Gatehouse|g", "Barracks|g g", "Armory|L:armory K", "Detention block|g K @0", "Command room|b g L:intel K @1"] },
  "command post": { hostile: "faction", rooms: ["Checkpoint|g", "Operations room|s g", "Comms array|d L:intel", "Supply depot|L:cargo K @0"] },
  "operations center": { rooms: ["Security desk|g", "Control room|s s d", "Records vault|L:intel K"] },
  medcenter: { rooms: ["Reception|s", "Ward|s p", "Surgery|s d", "Pharmacy|L:medical K @0"] },
  workshop: { rooms: ["Shopfront|s", "Workfloor|s d", "Parts storage|L:workshop"] },
  engineering: { rooms: ["Engineering deck|s d", "Reactor room|d K", "Tool crib|L:workshop @0"] },
  residences: { rooms: ["Lobby|", "Apartments|p p", "Rooftop|", "Basement|L:stash H @0"] },
  "habitat ring": { rooms: ["Commons|p p", "Quarters|p", "Hydroponics|s @0", "Locker hall|L:stash K @1"] },
  palace: { rooms: ["Entrance hall|g", "Audience chamber|s g p", "Offices|s", "Guard post|g L:armory K @0", "Vault|L:vault K g"] },
  warehouse: { rooms: ["Loading dock|s", "Storage floor|L:cargo", "Overseer's office|s L:coin K", "Hidden compartment|L:stash H @1"] },
  "cargo bay": { rooms: ["Cargo lock|s", "Container stacks|L:cargo", "Quarantine hold|L:cargo K"] },
  archive: { rooms: ["Antechamber|", "Reading hall|p s", "Stacks|s L:intel", "Sealed vault|L:relic K H"] },
  hideout: { hostile: "criminal", rooms: ["Lookout|g", "Common room|g g", "Stash room|L:stash K", "Boss's den|b L:vault K @1", "Escape tunnel|H"] },
  camp: { hostile: "criminal", rooms: ["Perimeter|g", "Tents|g g", "Supply cache|L:cargo", "Leader's tent|b L:coin @1"] },
  cave: { hostile: "wild", rooms: ["Cave mouth|", "Winding tunnel|w", "Den|w L:remains", "Deep chamber|w L:stash H @1"] },
  ruin: { hostile: "horror", rooms: ["Broken gate|", "Collapsed hall|w", "Inner sanctum|h L:relic K", "Crypt|h L:relic H"] },
  wreck: { hostile: "wild", rooms: ["Hull breach|", "Cargo hold|w L:cargo", "Bridge|L:intel K @0", "Engine room|d L:workshop @1"] },
};

// Who works in a room, from what the room is for; otherwise whoever runs that kind of building
const ROOM_STAFF: [RegExp, string][] = [
  [/customs/i, "customs officer"], [/docking|hangar|fuel|workfloor|engineering|reactor|landing/i, "mechanic"],
  [/control|operations|command|security/i, "officer"], [/bar|cantina/i, "bartender"], [/stall|trader|shopfront|market/i, "merchant"],
  [/reception|ward|surgery|pharmacy/i, "medic"], [/audience/i, "official"], [/reading|stacks|archive/i, "archivist"],
  [/loading|overseer|cargo|freight|storage/i, "overseer"], [/hydroponics/i, "farmer"], [/arrivals|airlock|port office/i, "dockmaster"],
  [/office/i, "clerk"],
];
const BUILDING_STAFF: Record<string, string> = {
  spaceport: "dockmaster", "landing field": "dockmaster", "landing pad": "dockmaster", "docking ring": "dockmaster", cantina: "bartender",
  promenade: "merchant", market: "merchant", medcenter: "medic", workshop: "mechanic", engineering: "mechanic", garrison: "officer",
  "command post": "officer", "operations center": "officer", palace: "official", warehouse: "overseer", "cargo bay": "overseer",
  archive: "archivist", "habitat ring": "farmer",
};
const staffRole = (buildingType: string, roomName: string) =>
  ROOM_STAFF.find(([pattern]) => pattern.test(roomName))?.[1] ?? BUILDING_STAFF[buildingType] ?? "clerk";

// Why the people of a room are there, from what the room is for. Each is someone of their own,
// with a name, not a crowd.
const LOCAL_ROLES: [RegExp, string][] = [
  [/bar|cantina|booth|back room|common room|commons/i, "patron"], [/stall|market|promenade|trade/i, "shopper"],
  [/apartment|quarters|lobby/i, "resident"], [/ward|reception/i, "patient"], [/concourse|arrivals|airlock|gate/i, "traveller"],
  [/reading|stacks|antechamber/i, "reader"], [/audience/i, "petitioner"],
];
const localRole = (roomName: string) => LOCAL_ROLES.find(([pattern]) => pattern.test(roomName))?.[1] ?? "local";
const LOCALS = new Set([...LOCAL_ROLES.map(([, role]) => role), "local", "civilians", "musician", "service droid"]);
// Someone who is part of the life of a place rather than someone the story is about
export const isLocal = (o: Pick<Occupant, "role">) => LOCALS.has(o.role);
const NOTABLES = ["smuggler", "bounty hunter", "informant", "gambler", "pilot for hire"];

// How rooms join, by the kind of place
const DOORS = { built: ["Door", "Corridor", "Archway", "Stairs"], station: ["Hatch", "Corridor", "Bulkhead door"], wild: ["Passage", "Crawlway", "Narrow gap", "Path"] };
const doorsOf = (buildingType: string, settlementType: string) =>
  ["cave", "ruin", "wreck", "camp", "trailhead"].includes(buildingType) ? DOORS.wild : settlementType === "station" ? DOORS.station : DOORS.built;

// What each role carries: one item per pattern, picked from the equipment data by name
const ROLE_GEAR: Record<string, RegExp[]> = {
  dockmaster: [/^datapad$/i, /^commlink/i],
  "customs officer": [/^(blaster pistol|light pistol)$/i, /^binders$/i, /^commlink/i],
  mechanic: [/^(mechanic's kit|astrotech's implements|armormech's implements)$/i, /^(fusion cutter|hydrospanner)$/i],
  pilot: [/^(blaster pistol|light pistol)$/i, /^commlink/i],
  bartender: [/^(hold-out|scattergun|slugpistol)$/i],
  merchant: [/^(hold-out|light pistol)$/i, /^(datapad|credit chip)$/i],
  clerk: [/^(datapad|datacard)$/i],
  medic: [/^(medpac|traumakit)$/i, /^(antitoxkit|bioanalysis kit)$/i],
  officer: [/^(blaster pistol|heavy pistol)$/i, /^(combat suit|fiber armor)$/i, /^commlink/i],
  official: [/^commlink/i, /^datapad$/i],
  overseer: [/^blaster pistol$/i, /^datapad$/i],
  archivist: [/^(datapad|holorecorder)$/i],
  farmer: [/^(chef's kit|biochemist's kit)$/i],
  guard: [/^(blaster rifle|blaster carbine)$/i, /^(combat suit|mesh armor)$/i],
  smuggler: [/^(blaster pistol|heavy pistol|hold-out)$/i, /^(security kit|slicer's kit)$/i],
  fence: [/^(hold-out|vibrodagger)$/i, /^datapad$/i],
  "bounty hunter": [/^(blaster rifle|heavy carbine|wrist launcher)$/i, /^(mesh armor|weave armor)$/i, /^(binders|grappling hook)$/i],
  informant: [/^(commlink|pocket scrambler)$/i, /^(vibrodagger|hold-out)$/i],
  gambler: [/^(sabacc deck|pazaak deck|chance cubes)$/i, /^hold-out$/i],
  "pilot for hire": [/^(blaster pistol|heavy pistol)$/i, /^(mechanic's kit|astrotech's implements)$/i],
};

// Stat blocks a faction fields, by name. The first group is its rank and file, the second its leaders.
const FORCES: { match: RegExp; troops: RegExp; leaders: RegExp }[] = [
  { match: /trade federation|separatist|banking|techno|czerka|droid/i, troops: /^(B1 Series|B2 Series|BX Series|DSD1|Destroyer Droid|Vulture)/, leaders: /^(T-Series Tactical|Super Tactical|IG-100|Melee Destroyer)/ },
  { match: /hutt|black sun|pirate|syndicate|cartel|crime|bounty|exchange/i, troops: /^(Gamorrean Guard|Trandoshan (Warrior|Hunter)|Weaponized Gonk|Junk Droid|B1 Series, B1-A|Ig Series)/, leaders: /^(Hutt|Trandoshan (Elite|Huntmaster)|IG Series|Mistryl)/ },
  { match: /tusken|raider|tribe|kolkpravis|nomad/i, troops: /^(Tusken (Raider|Brute)|Kolkpravis (Warrior|Blackarm)|Flesh Raider$|Jawa)/, leaders: /^(Tusken Chieftain|Kolkpravis (Tarkhan|Baatar|Khan)|Flesh Raider (Apprentice|Berserker))/ },
  { match: /sith|inquisit|dark/i, troops: /^(Trooper|Purge Trooper|Tuk'ata|Sith Probe)/, leaders: /^(Inquisitor|Imperial (Shadow|Royal) Guard|Dark Side Spirit)/ },
  { match: /./, troops: /^(Trooper|Navy Trooper|Officer, Junior|Navy Pilot|KX-Series)/, leaders: /^(Officer, Senior|Trooper, Captain|ISB|Death Trooper|Imperial (Senate|Guard))/ },
];


// ---------------------------------------------------------------------------------------------
// Eras and the law. Setting, not rules: the books give no era table, so these are the broad
// periods of the setting. An era decides who governs the settled galaxy, which enemies a
// campaign can have, and how hard the law bites in each region: 0 lawless (anything goes),
// 1 frontier (the authority is thinly spread), 2 policed (contraband is seized), 3 strict
// (patrols, checkpoints, restricted weapons too). Planets held by a crime syndicate are lawless
// whatever their region; planets held by the authority are at least policed.
// ---------------------------------------------------------------------------------------------

export interface Era {
  id: string;
  name: string;
  span: string;
  // Who governs where there is law, and who a campaign can be fought against
  authority: string;
  antagonists: string[];
  // Faction names in the setting seeds that mean someone else in this era
  renames: [RegExp, string][];
  law: Record<string, number>;
  summary: string;
}

export const LAW_NAMES = ["lawless", "frontier", "policed", "strict"] as const;
export const lawText = (law: number) => (law === 0 ? "lawless" : `${LAW_NAMES[law]} law`);

export const ERAS: Era[] = [
  {
    id: "old-republic", name: "Old Republic", span: "about 3,650 BBY", authority: "Galactic Republic",
    antagonists: ["Sith Empire", "Hutt Cartel", "Czerka Corporation"],
    renames: [[/galactic empire|empire|first order|new republic/i, "Galactic Republic"], [/separatist/i, "Local militia"], [/rebel/i, "Local militia"]],
    law: { "Deep Core": 2, Core: 3, Colonies: 2, "Inner Rim": 2, "Expansion Region": 1, "Mid Rim": 1, "Outer Rim": 0, "Wild Space": 0, "Unknown Regions": 0 },
    summary: "The Republic and the Jedi Order face a returning Sith Empire; the Outer Rim is left to the Hutts and Czerka.",
  },
  {
    id: "clone-wars", name: "Clone Wars", span: "22-19 BBY", authority: "Galactic Republic",
    antagonists: ["Separatist Alliance", "Trade Federation", "Hutt Cartel", "Black Sun"],
    renames: [[/galactic empire|empire|first order|new republic/i, "Galactic Republic"], [/separatist/i, "Separatist Alliance"], [/rebel/i, "Local militia"]],
    law: { "Deep Core": 3, Core: 3, Colonies: 3, "Inner Rim": 2, "Expansion Region": 2, "Mid Rim": 1, "Outer Rim": 1, "Wild Space": 0, "Unknown Regions": 0 },
    summary: "Clone armies of the Republic against the droid armies of the Separatists; the underworld profits from both.",
  },
  {
    id: "galactic-civil-war", name: "Galactic Civil War", span: "0-4 ABY", authority: "Galactic Empire",
    antagonists: ["Galactic Empire", "Black Sun", "Hutt Cartel"],
    renames: [[/galactic republic|new republic|first order|^empire/i, "Galactic Empire"], [/separatist/i, "Local militia"]],
    law: { "Deep Core": 3, Core: 3, Colonies: 3, "Inner Rim": 2, "Expansion Region": 2, "Mid Rim": 2, "Outer Rim": 1, "Wild Space": 0, "Unknown Regions": 0 },
    summary: "The Empire rules by fear; the Rebel Alliance fights back from hidden bases; the Hutts and Black Sun run the Rim.",
  },
  {
    id: "new-republic", name: "New Republic", span: "5-28 ABY", authority: "New Republic",
    antagonists: ["Imperial Remnant", "Hutt Cartel", "Black Sun"],
    renames: [[/galactic republic|rebel/i, "New Republic"], [/galactic empire|^empire|first order/i, "Imperial Remnant"], [/separatist/i, "Local militia"]],
    law: { "Deep Core": 1, Core: 2, Colonies: 2, "Inner Rim": 1, "Expansion Region": 1, "Mid Rim": 1, "Outer Rim": 0, "Wild Space": 0, "Unknown Regions": 1 },
    summary: "A young republic disarms and looks inward; warlords of the fallen Empire hold out in the Deep Core and beyond.",
  },
  {
    id: "first-order", name: "First Order", span: "34-35 ABY", authority: "First Order",
    antagonists: ["First Order", "Hutt Cartel"],
    renames: [[/galactic republic|new republic|galactic empire|^empire/i, "First Order"], [/rebel/i, "Resistance"], [/separatist/i, "Local militia"]],
    law: { "Deep Core": 3, Core: 3, Colonies: 2, "Inner Rim": 2, "Expansion Region": 1, "Mid Rim": 1, "Outer Rim": 1, "Wild Space": 0, "Unknown Regions": 3 },
    summary: "The First Order strikes from the Unknown Regions and seizes the Core; the Resistance scatters.",
  },
];
export const DEFAULT_ERA = "galactic-civil-war";
// A world made before eras is set in the Galactic Civil War, the campaign default
export const eraOf = (world: Pick<World, "era">): Era => ERAS.find((e) => e.id === world.era) ?? ERAS.find((e) => e.id === DEFAULT_ERA)!;
export const eraById = (id?: string): Era => ERAS.find((e) => e.id === id || e.name === id) ?? ERAS.find((e) => e.id === DEFAULT_ERA)!;
// A faction named in the setting seeds, as it is called in the era
const eraFaction = (name: string, era: Era) => era.renames.find(([pattern]) => pattern.test(name))?.[1] ?? name;
// Who holds a generated system: the authority more often than not, else the era's enemies or locals
const eraFactions = (era: Era) => [era.authority, era.authority, ...era.antagonists, "Local militia", "Czerka Corporation", "Tusken tribes"];
const CRIME = /hutt|black sun|pirate|syndicate|cartel|crime|exchange|smuggler/i;

// How hard the law bites in an area (see above)
export function lawAt(world: World, areaId: string): number {
  const era = eraOf(world);
  const region = ancestor(world, areaId, "region");
  const planet = ancestor(world, areaId, "planet");
  const system = ancestor(world, areaId, "system");
  const faction = planet?.faction ?? system?.faction ?? "";
  let law = era.law[region?.type ?? region?.name ?? ""] ?? 1;
  if (CRIME.test(faction) || /tusken|raider/i.test(faction)) law = 0;
  else if (faction === era.authority) law = Math.max(law, 2);
  return law;
}

// Loot caches: container names, equipment categories (optionally only names matching `only`),
// enhanced item types and how often one turns up, and credits as a share of what a character is
// expected to earn over the party's current level. `rare` caches reach one rarity higher.
const LOOT: Record<string, { names: string[]; equipment: string[]; only?: RegExp; enhanced: string[]; enhancedChance: number; credits: number; rare?: boolean }> = {
  armory: { names: ["Weapons locker", "Arms rack"], equipment: ["Weapon", "Armor", "Ammunition", "Explosive"], enhanced: ["Weapon", "Armor", "Shield", "ItemModification"], enhancedChance: 0.25, credits: 0 },
  medical: { names: ["Medical cabinet", "Supply cart"], equipment: ["Medical", "Kit"], only: /medpac|traumakit|antitoxkit|emergency battery|repair kit|bioanalysis|biochemist/i, enhanced: ["Consumable"], enhancedChance: 0.4, credits: 0 },
  workshop: { names: ["Parts bin", "Tool chest"], equipment: ["Tool", "Kit", "Utility"], enhanced: ["ItemModification", "DroidCustomization"], enhancedChance: 0.3, credits: 0.005 },
  cargo: { names: ["Cargo crate", "Shipping container"], equipment: ["Storage", "LifeSupport", "Utility", "AlcoholicBeverage", "Clothing", "Ammunition"], enhanced: ["Consumable"], enhancedChance: 0.1, credits: 0.01 },
  stash: { names: ["Hidden stash", "False-bottomed crate"], equipment: ["Spice", "Explosive", "GamingSet", "WeaponOrArmorAccessory"], enhanced: ["Consumable", "AdventuringGear"], enhancedChance: 0.3, credits: 0.04 },
  coin: { names: ["Strongbox", "Till"], equipment: ["DataRecordingAndStorage"], only: /credit chip|datapad|datacard/i, enhanced: [], enhancedChance: 0, credits: 0.03 },
  vault: { names: ["Vault", "Wall safe"], equipment: [], enhanced: ["Weapon", "Armor", "Shield", "Focus", "CyberneticAugmentation"], enhancedChance: 0.8, credits: 0.15, rare: true },
  relic: { names: ["Reliquary", "Sealed casket"], equipment: [], enhanced: ["Focus", "Weapon", "Armor", "Shield"], enhancedChance: 0.9, credits: 0.02, rare: true },
  intel: { names: ["Data terminal", "File locker"], equipment: ["DataRecordingAndStorage", "Communications"], enhanced: [], enhancedChance: 0, credits: 0.01 },
  remains: { names: ["Abandoned pack", "Scattered remains"], equipment: ["Utility", "LifeSupport", "Weapon", "Medical"], enhanced: ["Consumable"], enhancedChance: 0.1, credits: 0.01 },
};

// Ships by size: what they are, and how many weapons they mount
const SHIP_ROLES: Record<string, { roles: string[]; weapons: number }> = {
  Tiny: { roles: ["Courier drone", "Escape pod", "Scout skiff"], weapons: 1 },
  Small: { roles: ["Starfighter", "Interceptor", "Shuttle", "Courier"], weapons: 2 },
  Medium: { roles: ["Light freighter", "Transport", "Gunship", "Yacht"], weapons: 3 },
  Large: { roles: ["Corvette", "Frigate", "Bulk freighter"], weapons: 4 },
  Huge: { roles: ["Cruiser", "Carrier", "Star destroyer"], weapons: 6 },
  Gargantuan: { roles: ["Battleship", "Dreadnought"], weapons: 8 },
};

// Encounter budgets: XP per character by level for easy, medium, hard and deadly fights, and the
// multiplier for the number of opponents. These are the 5th edition figures SW5e is built on.
const XP_BUDGET: number[][] = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];
const groupMultiplier = (count: number) => (count <= 1 ? 1 : count === 2 ? 1.5 : count <= 6 ? 2 : count <= 10 ? 2.5 : 3);

export function encounterBudget(partyLevel: number, partySize: number, danger: number): number {
  if (danger <= 0) return 0;
  const row = XP_BUDGET[Math.min(20, Math.max(1, Math.round(partyLevel))) - 1];
  return row[Math.min(4, Math.round(danger)) - 1] * Math.max(1, partySize);
}

// Enhanced item rarities a party of this level can expect to find; the best caches reach one higher
export function lootRarities(partyLevel: number, rare = false): string[] {
  const ladder = ["Standard", "Premium", "Prototype", "Advanced", "Legendary"];
  const top = Math.min(ladder.length - 1, Math.floor((partyLevel - 1) / 4) + (rare ? 1 : 0));
  return ladder.slice(Math.max(0, top - 1), top + 1);
}

const SYLLABLES = {
  start: ["Ka", "Tor", "Bes", "Dan", "Ry", "Ord", "Nal", "Vel", "Xa", "Mon", "Ith", "Zel", "Cor", "Dra", "Fel", "Gar", "Hos", "Jak", "Lo", "Myr", "Nar", "On", "Pol", "Quar", "Rak", "Sul", "Tal", "Ul", "Var", "Yav", "Ans", "Bri", "Cato", "Dor"],
  middle: ["a", "e", "i", "o", "u", "an", "en", "or", "ar", "il", "ess", "oo", "at", "in"],
  end: ["dor", "tine", "ria", "nar", "wan", "sk", "th", "is", "os", "ra", "lon", "dine", "var", "meer", "to", "bah", "len", "phus", "rin", "x"],
};
const FIRST_NAMES = ["Jace", "Kira", "Mara", "Tycho", "Liana", "Dax", "Vex", "Zara", "Bren", "Nyra", "Kaiden", "Senn", "Rook", "Lyn", "Cass", "Juno", "Orin", "Talia", "Hesk", "Mirel", "Dorn", "Sabe", "Venn", "Ilya"];
const LAST_NAMES = ["Antilla", "Vos", "Syndar", "Kryze", "Bane", "Vizla", "Fenn", "Cobb", "Valen", "Solus", "Wren", "Onyo", "Kestra", "Dromar", "Thul", "Organa", "Tarkas", "Maro", "Quill", "Renz"];
const SHIP_WORDS = [["Wandering", "Silent", "Crimson", "Lucky", "Iron", "Second", "Distant", "Broken", "Golden", "Last"], ["Star", "Kestrel", "Venture", "Horizon", "Mynock", "Gambit", "Promise", "Comet", "Nexu", "Dawn"]];

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

interface Context {
  world: World;
  random: Random;
  catalog: WorldCatalog;
  names: Set<string>;
}

const nextId = (world: World, prefix: string) => `${prefix}${++world.counter}`;

function uniqueName(ctx: Context, make: () => string): string {
  for (let i = 0; i < 30; i++) {
    const name = make();
    if (!ctx.names.has(name)) {
      ctx.names.add(name);
      return name;
    }
  }
  // Every plain name is taken: tell this one apart by a place name
  const name = `${placeName(ctx.random)} ${make()}`;
  ctx.names.add(name);
  return name;
}

const placeName = (r: Random) => r.pick(SYLLABLES.start) + (r.chance(0.6) ? r.pick(SYLLABLES.middle) : "") + r.pick(SYLLABLES.end);
const personName = (r: Random) => `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function makeArea(ctx: Context, kind: AreaKind, parentId: string | null, fields: Partial<Area> & { name: string; type: string }): Area {
  const area: Area = {
    id: nextId(ctx.world, "a"),
    kind,
    parentId,
    description: "",
    tags: [],
    position: { x: 0, y: 0, z: 0 },
    danger: 0,
    occupants: [],
    ships: [],
    loot: [],
    ...fields,
  };
  ctx.world.areas[area.id] = area;
  return area;
}

// Children and paths by area, rebuilt when the world has grown since it was last asked for
interface WorldIndex {
  stamp: string;
  children: Map<string, Area[]>;
  paths: Map<string, Path[]>;
}
const indexes = new WeakMap<World, WorldIndex>();

function indexOf(world: World): WorldIndex {
  const stamp = `${world.counter}:${world.paths.length}`;
  let index = indexes.get(world);
  if (index && index.stamp === stamp) return index;
  index = { stamp, children: new Map(), paths: new Map() };
  for (const area of Object.values(world.areas)) {
    if (!area.parentId) continue;
    const list = index.children.get(area.parentId);
    if (list) list.push(area);
    else index.children.set(area.parentId, [area]);
  }
  for (const path of world.paths) {
    for (const end of [path.from, path.to]) {
      const list = index.paths.get(end);
      if (list) list.push(path);
      else index.paths.set(end, [path]);
    }
  }
  indexes.set(world, index);
  return index;
}

export const childrenOf = (world: World, id: string): Area[] => indexOf(world).children.get(id) ?? [];

// Ancestors from the galaxy down to the area itself
export function trailOf(world: World, id: string): Area[] {
  const trail: Area[] = [];
  for (let area: Area | undefined = world.areas[id]; area; area = area.parentId ? world.areas[area.parentId] : undefined) trail.unshift(area);
  return trail;
}

const ancestor = (world: World, id: string, kind: AreaKind) => trailOf(world, id).find((a) => a.kind === kind);

const distance = (a: Area, b: Area) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);

const linked = (world: World, a: string, b: string) => world.paths.some((p) => (p.from === a && p.to === b) || (p.from === b && p.to === a));

function addPath(world: World, from: Area, to: Area, label: string, travel: string, extra: Partial<Path> = {}): Path | undefined {
  const kind = PATH_KIND[from.kind];
  if (!kind || from.kind !== to.kind || from.id === to.id || linked(world, from.id, to.id)) return undefined;
  const path: Path = { id: nextId(world, "p"), from: from.id, to: to.id, kind, label, travel, ...extra };
  world.paths.push(path);
  return path;
}

// Joins a group into one network: a minimum spanning tree by distance (so links are short and
// sensible), plus a few extra links between near neighbours so there is more than one way round
function connectGroup(ctx: Context, group: Area[], describe: (a: Area, b: Area) => { label: string; travel: string } & Partial<Path>, extraChance: number) {
  if (group.length < 2) return;
  const joined = [group[0]];
  const rest = group.slice(1);
  while (rest.length) {
    let best = { d: Infinity, from: joined[0], index: 0 };
    rest.forEach((candidate, index) => {
      for (const from of joined) {
        const d = distance(from, candidate);
        if (d < best.d) best = { d, from, index };
      }
    });
    const [to] = rest.splice(best.index, 1);
    const { label, travel, ...extra } = describe(best.from, to);
    addPath(ctx.world, best.from, to, label, travel, extra);
    joined.push(to);
  }
  for (const area of group) {
    if (!ctx.random.chance(extraChance)) continue;
    const near = group.filter((o) => o.id !== area.id && !linked(ctx.world, area.id, o.id)).sort((a, b) => distance(area, a) - distance(area, b))[0];
    if (near) {
      const { label, travel, ...extra } = describe(area, near);
      addPath(ctx.world, area, near, label, travel, extra);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Who and what is where
// ---------------------------------------------------------------------------------------------

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// The equipment a stat block is shown using: its weapon attacks and its armor, matched by name
function statBlockLoadout(monster: Sw5eMonster, equipment: Sw5eEquipment[]): string[] {
  const found = new Set<string>();
  const match = (text: string, categories: string[]) => {
    const wanted = normalize(text);
    if (!wanted) return;
    const candidates = equipment
      .filter((e) => categories.includes(e.equipmentCategory) && normalize(e.name).length > 3 && wanted.includes(normalize(e.name)))
      .sort((a, b) => b.name.length - a.name.length);
    if (candidates[0]) found.add(candidates[0].name);
  };
  for (const behavior of monster.behaviors ?? []) {
    if (behavior.attackType === "MeleeWeapon" || behavior.attackType === "RangedWeapon") match(behavior.name, ["Weapon", "Explosive"]);
  }
  match(monster.armorType ?? "", ["Armor"]);
  return [...found];
}

// "range 100/400 ft." or "reach 5 ft." as feet
const attackRange = (text = ""): { range?: number; long?: number } => {
  const found = text.match(/(\d+)(?:\/(\d+))?\s*ft/);
  return found ? { range: Number(found[1]), ...(found[2] ? { long: Number(found[2]) } : {}) } : {};
};

// An occupant that uses a stat block: its combat figures and the gear it is shown using
export function statBlockOccupant(monster: Sw5eMonster, equipment: Sw5eEquipment[], id: string, count = 1, role = "creature", disposition: Occupant["disposition"] = "hostile"): Occupant {
  const attacks = (monster.behaviors ?? []).filter((b) => (b.attackType === "MeleeWeapon" || b.attackType === "RangedWeapon") && b.damageRoll);
  const best = [...attacks].sort((a, b) => (b.attackBonus ?? 0) - (a.attackBonus ?? 0))[0];
  return {
    id,
    name: monster.name,
    role,
    disposition,
    count,
    statBlock: monster.id,
    cr: String(monster.challengeRating),
    xp: monster.experiencePoints,
    armorClass: monster.armorClass,
    hitPoints: monster.hitPoints,
    attack: best ? { name: best.name, bonus: best.attackBonus ?? 0, damage: best.damageRoll!, damageType: best.damageType?.toLowerCase(), ranged: best.attackType === "RangedWeapon", ...attackRange(best.range) } : undefined,
    speed: Number(monster.speed) || 0,
    size: monster.size,
    creature: String(monster.types?.[0] ?? "").toLowerCase(),
    saves: Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((a) => [a, Number(monster[`${a}Modifier`]) || 0])),
    loadout: statBlockLoadout(monster, equipment),
  };
}

const fromStatBlock = (ctx: Context, monster: Sw5eMonster, count: number, role: string, disposition: Occupant["disposition"]) =>
  statBlockOccupant(monster, ctx.catalog.equipment, nextId(ctx.world, "o"), count, role, disposition);

// As many of one kind of creature as the budget allows (never more than six, and at least
// `least` where the budget allows that many of something)
function encounter(ctx: Context, pool: Sw5eMonster[], budget: number, role: string, least = 1): Occupant[] {
  const affordable = pool.filter((m) => m.experiencePoints > 0 && least * m.experiencePoints * groupMultiplier(least) <= budget);
  if (!affordable.length) return least > 1 ? encounter(ctx, pool, budget, role) : [];
  // Prefer creatures worth a real share of the budget over a crowd of trivial ones
  const worthwhile = affordable.filter((m) => m.experiencePoints >= budget / 8);
  const monster = ctx.random.pick(worthwhile.length ? worthwhile : affordable);
  let count = least;
  while (count < 6 && (count + 1) * monster.experiencePoints * groupMultiplier(count + 1) <= budget) count++;
  return [fromStatBlock(ctx, monster, count, role, "hostile")];
}

const isType = (monster: Sw5eMonster, pattern: RegExp) => pattern.test((monster.types ?? []).join(" "));

function forcesOf(ctx: Context, faction: string) {
  const force = FORCES.find((f) => f.match.test(faction))!;
  const people = ctx.catalog.monsters.filter((m) => !isType(m, /swarm/i));
  return { troops: people.filter((m) => force.troops.test(m.name)), leaders: people.filter((m) => force.leaders.test(m.name)) };
}

// Beasts for a biome: those whose text mentions it, else any beast
function wildlife(ctx: Context, biome: string): Sw5eMonster[] {
  const beasts = ctx.catalog.monsters.filter((m) => isType(m, /beast|plant/i));
  const words = BIOME_WORDS[biome] ?? [];
  const native = beasts.filter((m) => {
    const text = `${m.name} ${m.flavorText ?? ""} ${m.sectionText ?? ""}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });
  return native.length >= 4 ? native : beasts;
}

function pickGear(ctx: Context, pattern: RegExp): string | undefined {
  const options = ctx.catalog.equipment.filter((e) => pattern.test(e.name));
  return options.length ? ctx.random.pick(options).name : undefined;
}

// Mostly the planet's own peoples, else any of the core species
function speciesFor(ctx: Context, speciesNames: string[]): string {
  const core = ctx.catalog.species.filter((s) => s.contentSource === "PHB" && !/droid/i.test(s.name));
  return speciesNames.length && ctx.random.chance(0.6) ? ctx.random.pick(speciesNames) : ctx.random.pick(core.length ? core : ctx.catalog.species).name;
}

function person(ctx: Context, role: string, disposition: Occupant["disposition"], speciesNames: string[], species = speciesFor(ctx, speciesNames)): Occupant {
  const gear = (ROLE_GEAR[role] ?? []).map((pattern) => pickGear(ctx, pattern)).filter((g): g is string => !!g);
  return { id: nextId(ctx.world, "o"), name: personName(ctx.random), role, disposition, count: 1, species, loadout: gear };
}

// The people of a room, one by one; now and then one of them has a trade worth knowing
function locals(ctx: Context, room: Area, speciesNames: string[], wanted: number): Occupant[] {
  const role = localRole(room.name);
  return Array.from({ length: wanted }, (_, i) => person(ctx, i === 0 && ctx.random.chance(0.35) ? ctx.random.pick(NOTABLES) : role, "neutral", speciesNames));
}

// A cantina band: three or four players, usually of one people, each with an instrument from the equipment data
function band(ctx: Context, speciesNames: string[]): Occupant[] {
  const instruments = ctx.catalog.equipment.filter((e) => e.equipmentCategory === "MusicalInstrument");
  const kin = speciesFor(ctx, speciesNames);
  return Array.from({ length: ctx.random.int(3, 4) }, () => ({
    ...person(ctx, "musician", "neutral", speciesNames, ctx.random.chance(0.75) ? kin : speciesFor(ctx, speciesNames)),
    loadout: instruments.length ? [ctx.random.pick(instruments).name] : [],
  }));
}

// A droid that waits on tables, from the droid stat blocks
function serviceDroid(ctx: Context): Occupant[] {
  const droids = ctx.catalog.monsters.filter((m) => /^T3-Series|utility droid/i.test(m.name) && m.experiencePoints <= 25);
  return droids.length ? [fromStatBlock(ctx, ctx.random.pick(droids), 1, "service droid", "neutral")] : [];
}

function makeShip(ctx: Context, sizes: string[], status: Ship["status"], owner: string): Ship {
  const r = ctx.random;
  const size = r.pick(sizes);
  const table = ctx.catalog.starshipEquipment;
  const of = (type: string) => table.filter((e) => e.type === type);
  const one = (type: string) => (of(type).length ? [r.pick(of(type)).name as string] : []);
  // Fast drives are rare; most ships fly class 1 to 2, and the smallest have none
  const drives = of("Hyperdrive").filter((e) => e.cost > 0 && Number(e.hyperDriveClass) >= (r.chance(0.15) ? 0.5 : 1));
  const drive = size === "Tiny" && r.chance(0.7) ? undefined : drives.length ? r.pick(drives) : undefined;
  const mount = ["Tiny", "Small", "Medium"].includes(size) ? "Small" : "Huge";
  const guns = of("Weapon").filter((e) => e.weaponSize === mount);
  const weapons = guns.length ? Array.from({ length: SHIP_ROLES[size].weapons }, () => r.pick(guns).name as string) : [];
  const equipment = [...one("Armor"), ...(size === "Tiny" ? [] : one("Shield")), ...one("Reactor"), ...one("PowerCoupling"), ...(drive ? [drive.name] : []), ...weapons];
  const stock = ctx.catalog.travel.starshipSizes.find((s) => s.name === size)?.stockCost ?? 0;
  const fitted = equipment.reduce((sum, name) => sum + (table.find((e) => e.name === name)?.cost ?? 0), 0);
  return {
    id: nextId(ctx.world, "s"),
    name: uniqueName(ctx, () => `${r.pick(SHIP_WORDS[0])} ${r.pick(SHIP_WORDS[1])}`),
    size,
    role: r.pick(SHIP_ROLES[size].roles),
    tier: Math.min(5, Math.floor(ctx.world.partyLevel / 4)),
    status,
    owner,
    equipment,
    hyperdriveClass: drive?.hyperDriveClass,
    value: stock + fitted,
  };
}

// What a character is expected to earn over one level, from the Wealth by Level table
function levelEarnings(catalog: WorldCatalog, level: number): number {
  const wealth = catalog.wealthByLevel;
  const at = (l: number) => wealth[Math.min(wealth.length, Math.max(1, l)) - 1] ?? 0;
  return level >= wealth.length ? at(wealth.length) - at(wealth.length - 1) : at(level + 1) - at(level);
}

function makeLoot(ctx: Context, kind: string, danger: number, flags: { locked: boolean; hidden: boolean }): LootCache {
  const r = ctx.random;
  const table = LOOT[kind] ?? LOOT.cargo;
  const level = ctx.world.partyLevel;
  // Finds are sized against what the party should earn at its level; dangerous places hold more
  const earnings = levelEarnings(ctx.catalog, level) * ctx.world.partySize * (1 + danger / 4);
  const cap = Math.max(300, earnings * 0.3);
  const items: LootCache["items"] = [];
  const mundane = ctx.catalog.equipment.filter(
    (e) => table.equipment.includes(e.equipmentCategory) && e.cost > 0 && e.cost <= cap && (!table.only || table.only.test(e.name)),
  );
  let spent = 0;
  for (let i = 0, wanted = r.int(1, 3); i < wanted && mundane.length; i++) {
    const item = r.pick(mundane);
    if (spent + item.cost > cap && items.length) break;
    spent += item.cost;
    const existing = items.find((it) => it.name === item.name);
    if (existing) existing.quantity++;
    else items.push({ name: item.name, quantity: 1, source: "equipment" });
  }
  if (table.enhanced.length && r.chance(Math.min(0.95, table.enhancedChance * (1 + danger / 4)))) {
    const rarities = lootRarities(level, table.rare);
    const enhanced = ctx.catalog.enhancedItems.filter((e) => table.enhanced.includes(e.type) && rarities.includes(e.searchableRarity));
    if (enhanced.length) {
      const item = r.pick(enhanced);
      items.push({ name: item.name, quantity: 1, source: "enhancedItems", rarity: item.searchableRarity });
    }
  }
  return {
    id: nextId(ctx.world, "l"),
    name: r.pick(table.names),
    kind,
    credits: Math.round((table.credits * earnings * (0.5 + r.next())) / 10) * 10,
    items,
    ...(flags.locked ? { locked: 10 + 5 * Math.min(3, danger) } : {}),
    ...(flags.hidden ? { hidden: true } : {}),
  };
}

// Fills a room from its content codes. Nothing is placed that the room's purpose does not call for.
function populateRoom(ctx: Context, room: Area) {
  const { world, random: r } = ctx;
  const building = world.areas[room.parentId!];
  const planet = ancestor(world, room.id, "planet");
  const template = BUILDINGS[building.type];
  const codes = room.tags.filter((t) => t.startsWith("code:")).map((t) => t.slice(5));
  const faction = building.faction ?? planet?.faction ?? world.antagonist;
  const speciesNames = (planet?.tags ?? []).filter((t) => t.startsWith("species:")).map((t) => t.slice(8));
  const hostileFaction = template?.hostile === "criminal" || (template?.hostile === "faction" && faction === world.antagonist);
  // One budget for the room, shared between the groups that would fight together
  const fights = codes.filter((c) => ["g", "b", "w", "h"].includes(c)).length;
  const budget = encounterBudget(world.partyLevel, world.partySize, room.danger) / Math.max(1, fights);
  room.occupants = [];
  room.ships = [];
  room.loot = [];
  const staff = staffRole(building.type, room.name);
  for (const code of codes) {
    if (code === "s") {
      const one = person(ctx, staff, r.chance(0.5) ? "friendly" : "neutral", speciesNames);
      // Merchants keep a line of goods; where there is no law, one in three runs a black market stall
      if (staff === "merchant") one.trade = lawAt(world, room.id) === 0 && r.chance(0.33) ? "black" : r.pick(MERCHANT_WARES);
      room.occupants.push(one);
    } else if (code === "X") {
      room.occupants.push(person(ctx, "fence", "neutral", speciesNames));
    } else if (code === "p") {
      room.occupants.push(...locals(ctx, room, speciesNames, /bar|cantina|commons|promenade/i.test(room.name) ? r.int(2, 4) : r.int(1, 3)));
    } else if (code === "m") {
      room.occupants.push(...band(ctx, speciesNames));
    } else if (code === "D") {
      if (r.chance(0.7)) room.occupants.push(...serviceDroid(ctx));
    } else if (code === "g" || code === "b") {
      const forces = forcesOf(ctx, template?.hostile === "criminal" ? "pirate syndicate" : faction);
      if (hostileFaction && budget > 0) {
        const pool = code === "b" && forces.leaders.length ? forces.leaders : forces.troops;
        // The way in is held by two at least: one keeps the post, the other walks a round
        const least = code === "g" && room.gateway ? 2 : 1;
        const found = encounter(ctx, pool, code === "b" ? budget * 1.5 : budget, code === "b" ? "leader" : "guard", least);
        room.occupants.push(...(found.length ? found : encounter(ctx, forces.troops, budget, "guard", least)));
        if (least > 1) guardTheGate(room);
      } else if (code === "g") {
        // A faction that is not the enemy still posts sentries; they are not a fight
        const able = forces.troops.filter((m) => m.experiencePoints <= 450);
        const sentries = able.some((m) => isType(m, /human/i)) ? able.filter((m) => isType(m, /human/i)) : able;
        if (sentries.length) room.occupants.push(fromStatBlock(ctx, r.pick(sentries), r.int(1, 2), "guard", "neutral"));
        else room.occupants.push(person(ctx, "guard", "neutral", speciesNames));
      } else {
        room.occupants.push(person(ctx, staff, "neutral", speciesNames));
      }
    } else if (code === "w" && budget > 0) {
      room.occupants.push(...encounter(ctx, wildlife(ctx, planet?.type ?? "temperate"), budget, "wildlife"));
    } else if (code === "h" && budget > 0) {
      const horrors = ctx.catalog.monsters.filter((m) => isType(m, /aberration|undead/i));
      room.occupants.push(...encounter(ctx, horrors, budget, "horror"));
    } else if (code === "d") {
      const droids = ctx.catalog.monsters.filter((m) => isType(m, /^droid/i) && m.experiencePoints <= 25 && !/probe|remote|interrog|seeker|sabotage|tracker/i.test(m.name));
      if (droids.length) room.occupants.push(fromStatBlock(ctx, r.pick(droids), 1, "utility droid", "neutral"));
    } else if (code === "S") {
      const sizes = /pad|field/i.test(room.name) ? ["Tiny", "Small"] : /hangar/i.test(room.name) ? ["Small"] : ["Small", "Medium"];
      const owners = room.occupants.filter((o) => !o.statBlock && o.count === 1).map((o) => o.name);
      room.ships.push(makeShip(ctx, sizes, building.type === "docking ring" ? "docked" : "landed", owners[0] ?? faction));
    } else if (code.startsWith("L:")) {
      room.loot.push(makeLoot(ctx, code.slice(2), room.danger, { locked: codes.includes("K"), hidden: codes.includes("H") }));
    }
  }
}

// A hostile way in always has a sentry on the post and another on a round
function guardTheGate(room: Area): boolean {
  const guards = room.occupants.filter((o) => o.role === "guard" && o.disposition === "hostile");
  if (!guards.length || guards.reduce((sum, o) => sum + o.count, 0) >= 2) return false;
  guards[0].count = 2;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Detail: planet -> settlements -> buildings -> rooms
// ---------------------------------------------------------------------------------------------

function scatter(r: Random, index: number, total: number, radius: number) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + r.next() * 0.8;
  const d = total === 1 ? 0 : radius * (0.45 + r.next() * 0.55);
  return { x: Math.round(Math.cos(angle) * d * 10) / 10, y: 0, z: Math.round(Math.sin(angle) * d * 10) / 10 };
}

// How dangerous a hostile place is: easy near the start, harder on other worlds and in lawless space
function dangerOf(world: World, area: Area): number {
  const region = ancestor(world, area.id, "region");
  const startPlanet = world.startId ? ancestor(world, world.startId, "planet") : undefined;
  const planet = ancestor(world, area.id, "planet");
  const lawless = (REGION_DANGER[region?.type ?? ""] ?? 2) >= 2 ? 1 : 0;
  return Math.min(4, 1 + (startPlanet && planet && startPlanet.id !== planet.id ? 1 : 0) + lawless);
}

function detailBuilding(ctx: Context, building: Area) {
  const { world, random: r } = ctx;
  const template = BUILDINGS[building.type];
  if (!template || childrenOf(world, building.id).length) return;
  const hostile = !!template.hostile && (template.hostile !== "faction" || (building.faction ?? world.antagonist) === world.antagonist);
  const base = hostile ? dangerOf(world, building) : 0;
  building.danger = base;
  const specs = template.rooms.map((spec, index) => {
    const [name, codeText = ""] = spec.split("|");
    const parts = codeText.split(" ").filter(Boolean);
    const opensOff = parts.find((c) => c.startsWith("@"));
    return { name, codes: parts.filter((c) => !c.startsWith("@")), from: opensOff ? Number(opensOff.slice(1)) : index - 1 };
  });
  const depth = (index: number): number => (index === 0 ? 0 : 1 + depth(specs[index].from));
  const rooms = specs.map(({ name, codes }, index) =>
    makeArea(ctx, "room", building.id, {
      name,
      type: name.toLowerCase(),
      // The entrance; an escape tunnel is a second way out
      gateway: index === 0 || /escape/i.test(name),
      tags: codes.map((c) => `code:${c}`),
      // Deeper rooms lie further from the entrance; rooms off the same room sit side by side
      position: { x: depth(index) * 4, y: 0, z: (index % 3) * 3 - 3 },
      // The way in is watched but lightly; the leader's room is the hardest fight in the building
      danger: !hostile ? 0 : index === 0 ? Math.max(1, base - 1) : Math.min(4, base + (codes.includes("b") ? 1 : 0)),
    }),
  );
  rooms.forEach((room, index) => {
    if (index === 0) return;
    const { codes } = specs[index];
    const from = rooms[specs[index].from];
    const feet = Math.max(10, Math.round(distance(from, room) * 5));
    const wild = doorsOf(building.type, "") === DOORS.wild;
    const label = codes.includes("H") ? (wild ? "Hidden crawlway" : "Hidden hatch") : codes.includes("K") ? (wild ? "Barricade" : "Locked blast door") : r.pick(doorsOf(building.type, world.areas[building.parentId!]?.type ?? ""));
    addPath(world, from, room, label, `${feet} ft.`, {
      ...(codes.includes("K") ? { locked: 10 + 5 * Math.min(3, Math.max(1, base)) } : {}),
      ...(codes.includes("H") ? { hidden: true } : {}),
    });
  });
  // A second way round in larger buildings, never through a locked or hidden room
  const open = rooms.filter((_, index) => !specs[index].codes.some((c) => c === "K" || c === "H"));
  if (open.length >= 4 && r.chance(0.5)) addPath(world, open[1], open[open.length - 1], "Side passage", `${Math.max(10, Math.round(distance(open[1], open[open.length - 1]) * 5))} ft.`);
  rooms.forEach((room) => populateRoom(ctx, room));
  planBuilding(world, building.id);
}

function detailSettlement(ctx: Context, settlement: Area) {
  const { world, random: r } = ctx;
  const template = SETTLEMENTS[settlement.type];
  if (!template || childrenOf(world, settlement.id).length) return;
  const chosen = template.buildings.filter((b) => !b.endsWith("?") || r.chance(0.5)).map((b) => b.replace("?", ""));
  const buildings = chosen.map((spec, index) => {
    const type = spec.replace("*", "");
    const hostile = BUILDINGS[type]?.hostile;
    return makeArea(ctx, "building", settlement.id, {
      name: uniqueName(ctx, () =>
        ["cantina", "workshop", "hideout"].includes(type)
          ? `${title(type)} "${r.pick(SHIP_WORDS[0])} ${r.pick(SHIP_WORDS[1])}"`
          : ["cave", "ruin", "wreck", "camp"].includes(type)
            ? `${r.pick(["Lower", "Upper", "Old", "Sunken", "Far", "Hidden", "Black", "Broken", "Windy", "Red"])} ${title(type)}`
            : `${settlement.name} ${title(type)}`,
      ),
      type,
      gateway: spec.endsWith("*"),
      faction: hostile === "criminal" ? "Local syndicate" : settlement.faction,
      position: scatter(r, index, chosen.length, 8),
      tags: hostile ? [`hostile:${hostile}`] : [],
    });
  });
  connectGroup(ctx, buildings, (a, b) => ({ label: r.pick(template.street), travel: `${Math.max(20, Math.round(distance(a, b) * 40))} m` }), 0.35);
  buildings.forEach((b) => detailBuilding(ctx, b));
  settleRoutines(world, settlement, r);
}

function detailPlanet(ctx: Context, planet: Area) {
  const { world, random: r } = ctx;
  if (childrenOf(world, planet.id).length) return;
  const biome = planet.type;
  const seed = ctx.catalog.setting?.planets.find((p) => p.name === planet.name);
  const known = [...(seed?.locations ?? [])];
  const mainType = biome === "gas giant" ? "station" : biome === "urban" || r.chance(0.5) ? "city" : "town";
  // A second place that has a name is somewhere people live; otherwise it may be an outpost
  const secondType = biome === "gas giant" || biome === "barren" ? "outpost" : known.length > 1 ? "town" : r.pick(["town", "outpost"]);
  const sites = [mainType, secondType, ...r.shuffle(WILD_SITES[biome] ?? WILD_SITES.temperate).slice(0, r.int(1, 2))];
  const settlements = sites.map((type, index) => {
    const wild = !["city", "town", "outpost", "station"].includes(type);
    const name = !wild && known.length ? known.shift()! : uniqueName(ctx, () => (wild ? `${placeName(r)} ${title(type)}` : placeName(r) + (type === "station" ? " Station" : type === "outpost" ? " Outpost" : "")));
    ctx.names.add(name);
    return makeArea(ctx, "settlement", planet.id, {
      name,
      type,
      gateway: index === 0,
      faction: wild ? undefined : planet.faction,
      tags: [...(index === 0 ? ["starport"] : []), ...(wild ? ["wilderness"] : [])],
      position: scatter(r, index, sites.length, 20),
      description: wild ? `${title(type)} in the ${biome} wilds of ${planet.name}.` : `${title(type)} on ${planet.name}${planet.faction ? `, held by the ${planet.faction}` : ""}.`,
    });
  });
  const labels = ROUTE_LABEL[biome] ?? ROUTE_LABEL.temperate;
  connectGroup(ctx, settlements, (a, b) => {
    const km = Math.max(5, Math.round(distance(a, b) * 25));
    return { label: r.pick(labels), travel: `${km} km (${Math.max(1, Math.round(km / 80))} h by speeder)` };
  }, 0.3);
  settlements.forEach((s) => detailSettlement(ctx, s));
  // Traffic over a starport world
  if (!planet.ships.length && mainType !== "town") planet.ships.push(makeShip(ctx, ["Large", "Huge"], "orbiting", planet.faction ?? world.antagonist));
}

function biomeOf(r: Random, seed?: SettingSeed["planets"][number]): string {
  const text = `${seed?.climate ?? ""} ${(seed?.terrain ?? []).join(" ")}`.toLowerCase();
  if (/ecumenopolis|cityscape|urban/.test(text)) return "urban";
  if (/gas/.test(text)) return "gas giant";
  const found = BIOMES.find((b) => text.includes(b) || (BIOME_WORDS[b] ?? []).some((w) => text.includes(w)));
  return found ?? r.pick(BIOMES);
}

function detailSystem(ctx: Context, system: Area, planetNames: string[]) {
  const { world, random: r } = ctx;
  if (childrenOf(world, system.id).length) return;
  const names = planetNames.length ? planetNames : Array.from({ length: r.int(1, 3) }, () => uniqueName(ctx, () => placeName(r)));
  const realspace = ctx.catalog.travel.realspaceTravel.find((t) => /another planet/i.test(t.distance))?.time ?? "2-6 hours";
  const planets = names.map((name, index) => {
    ctx.names.add(name);
    const seed = ctx.catalog.setting?.planets.find((p) => p.name === name);
    const orbit = 6 + index * 5;
    const angle = r.next() * Math.PI * 2;
    return makeArea(ctx, "planet", system.id, {
      name,
      type: biomeOf(r, seed),
      // A ship can reach the jump point from any planet's orbit
      gateway: true,
      faction: system.faction,
      description: seed?.description ?? "",
      // The peoples of a known planet, where the rules data has them as a species
      tags: (seed?.species ?? [])
        .map((text) => ctx.catalog.species.find((s) => text.toLowerCase().startsWith(s.name.toLowerCase()))?.name)
        .filter((name): name is string => !!name)
        .map((name) => `species:${name}`),
      position: { x: Math.round(Math.cos(angle) * orbit * 10) / 10, y: 0, z: Math.round(Math.sin(angle) * orbit * 10) / 10 },
    });
  });
  for (let i = 1; i < planets.length; i++) addPath(world, planets[i - 1], planets[i], "Sublight lane", realspace);
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

function contextFor(world: World, catalog: WorldCatalog, seed: number): Context {
  return { world, random: createRandom(seed), catalog, names: new Set(Object.values(world.areas).map((a) => a.name)) };
}

export function generateWorld(options: WorldOptions, catalog: WorldCatalog): World {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const r = createRandom(seed);
  const era = eraById(options.era);
  const world: World = {
    version: 1,
    seed,
    name: options.name ?? "The Galaxy",
    partyLevel: Math.min(20, Math.max(1, Math.round(options.partyLevel ?? 1))),
    partySize: Math.max(1, Math.round(options.partySize ?? 1)),
    antagonist: options.antagonist ?? r.pick(era.antagonists),
    rootId: "",
    startId: "",
    areas: {},
    paths: [],
    counter: 0,
    life: LIFE,
    era: era.id,
  };
  const ctx: Context = { world, random: r, catalog, names: new Set() };
  const galaxy = makeArea(ctx, "galaxy", null, { name: world.name, type: "galaxy" });
  world.rootId = galaxy.id;

  // Regions, from the hyperspace travel table: rings out from the Deep Core
  const regionNames = catalog.travel.regions;
  const regions = regionNames.map((name, index) => {
    const angle = index * 2.4;
    return makeArea(ctx, "region", galaxy.id, {
      name,
      type: name,
      danger: REGION_DANGER[name] ?? 2,
      position: { x: Math.round(Math.cos(angle) * index * 14), y: 0, z: Math.round(Math.sin(angle) * index * 14) },
    });
  });
  const regionOf = (text: string) => regions.find((reg) => text.toLowerCase().startsWith(reg.name.toLowerCase())) ?? regions.find((reg) => text.toLowerCase().includes(reg.name.toLowerCase())) ?? regions.find((reg) => reg.name === "Outer Rim") ?? regions[regions.length - 1];

  // Systems: the known ones in their regions, then generated ones so no region is empty
  const planetNames = new Map<string, string[]>();
  const placeSystem = (region: Area, name: string, fields: Partial<Area>) => {
    const ring = regions.indexOf(region) * 14;
    const angle = r.next() * Math.PI * 2;
    const d = ring + r.int(-4, 4);
    ctx.names.add(name);
    return makeArea(ctx, "system", region.id, {
      name,
      type: r.pick(["O", "B", "A", "F", "G", "K", "M"]),
      position: { x: Math.round(Math.cos(angle) * d), y: r.int(-3, 3), z: Math.round(Math.sin(angle) * d) },
      ...fields,
    });
  };
  for (const seedSystem of catalog.setting?.systems ?? []) {
    if (ctx.names.has(seedSystem.name)) continue;
    const system = placeSystem(regionOf(seedSystem.region), seedSystem.name, {
      description: seedSystem.description ?? "",
      faction: eraFaction(seedSystem.factions?.[0]?.replace(/\s*\(.*\)$/, "") ?? r.pick(eraFactions(era)), era),
    });
    planetNames.set(system.id, seedSystem.planets ?? []);
  }
  const perRegion = Math.min(3, Math.max(1, options.systemsPerRegion ?? 1));
  for (const region of regions) {
    while (childrenOf(world, region.id).length < perRegion) {
      placeSystem(region, uniqueName(ctx, () => `${placeName(r)} System`), { faction: r.pick(eraFactions(era)) });
    }
  }
  const systems = Object.values(world.areas).filter((a) => a.kind === "system");
  for (const region of regions) childrenOf(world, region.id)[0].gateway = true;

  // Hyperlanes: a network inside each region, one lane between neighbouring rings, a few shortcuts.
  // Travel times are the Starships of the Galaxy figures for the two regions.
  const hours = (a: Area, b: Area) => {
    const from = world.areas[a.parentId!].name;
    const to = world.areas[b.parentId!].name;
    return `${catalog.travel.hyperspaceHours[from]?.[to] ?? 48} hours at class 1`;
  };
  const lane = (a: Area, b: Area) => ({ label: a.parentId === b.parentId ? "Hyperlane" : "Trade route", travel: hours(a, b) });
  for (const region of regions) connectGroup(ctx, childrenOf(world, region.id), lane, 0.2);
  for (let i = 1; i < regions.length; i++) {
    let best: { d: number; a?: Area; b?: Area } = { d: Infinity };
    for (const a of childrenOf(world, regions[i - 1].id)) {
      for (const b of childrenOf(world, regions[i].id)) {
        if (distance(a, b) < best.d) best = { d: distance(a, b), a, b };
      }
    }
    if (best.a && best.b) addPath(world, best.a, best.b, "Trade route", hours(best.a, best.b));
  }
  for (const system of systems) {
    if (!r.chance(0.15)) continue;
    const near = systems.filter((o) => o.parentId !== system.parentId && !linked(world, system.id, o.id)).sort((a, b) => distance(system, a) - distance(system, b))[0];
    if (near) addPath(world, system, near, "Smuggler's run", hours(system, near));
  }

  for (const system of systems) detailSystem(ctx, system, planetNames.get(system.id) ?? []);

  // The starting planet is built in full; the rest wait until someone goes there
  const planets = Object.values(world.areas).filter((a) => a.kind === "planet");
  const habitable = planets.filter((p) => p.type !== "gas giant" && p.type !== "barren");
  const startPlanet = planets.find((p) => p.name.toLowerCase() === options.startPlanet?.toLowerCase()) ?? r.pick(habitable.length ? habitable : planets);
  world.startId = startPlanet.id;
  detailPlanet(ctx, startPlanet);
  if (options.detail === "all") planets.forEach((p) => detailPlanet(ctx, p));

  // Play begins somewhere safe: the cantina if the main settlement has one, else its gateway
  const main = childrenOf(world, startPlanet.id).find((s) => s.gateway)!;
  const buildings = childrenOf(world, main.id);
  const home = buildings.find((b) => b.type === "cantina" || b.type === "promenade") ?? buildings.find((b) => b.gateway)!;
  world.startId = childrenOf(world, home.id).find((room) => room.gateway)!.id;
  return world;
}

// Builds what lies inside an area that has not been detailed yet (and everything below it)
export function expandArea(world: World, areaId: string, catalog: WorldCatalog, seed?: number): World {
  const next: World = JSON.parse(JSON.stringify(world));
  const area = next.areas[areaId];
  if (!area) return next;
  const ctx = contextFor(next, catalog, seed ?? next.seed + next.counter);
  if (area.kind === "system") {
    detailSystem(ctx, area, []);
    childrenOf(next, area.id).forEach((p) => detailPlanet(ctx, p));
  } else if (area.kind === "planet") detailPlanet(ctx, area);
  else if (area.kind === "settlement") detailSettlement(ctx, area);
  else if (area.kind === "building") detailBuilding(ctx, area);
  return next;
}

// Re-rolls who and what is in an area: one room, or every room beneath a larger area
export function populateArea(world: World, areaId: string, catalog: WorldCatalog, seed?: number): World {
  const next: World = JSON.parse(JSON.stringify(world));
  const ctx = contextFor(next, catalog, seed ?? next.seed + next.counter + 1);
  const visit = (id: string) => {
    const area = next.areas[id];
    if (!area) return;
    if (area.kind === "room") {
      populateRoom(ctx, area);
      placeContents(area, ctx.random);
    } else childrenOf(next, id).forEach((c) => visit(c.id));
  };
  visit(areaId);
  return next;
}

// ---------------------------------------------------------------------------------------------
// Room layouts. Every room of a building is a rectangle of 5-foot squares on one grid for the
// whole building, so rooms that open off each other share a wall and the door sits in it. Each
// room is then dressed for what it is for, and whoever and whatever is in it is given a square.
// The dressing follows how floor plans for the tabletop are usually drawn: furniture against the
// walls with the middle left to walk in, a counter between staff and public, tables with seats
// in public rooms, crates in stacks that give cover, a dais or command table at the far end from
// the way in, sentries by the doors, and a quiet way in through a back room.
// ---------------------------------------------------------------------------------------------

export type Side = "n" | "e" | "s" | "w";
export type AssetKind = "door" | "exit" | "window" | "secret" | "furniture" | "npc" | "loot" | "ship" | "stairs";

export interface RoomAsset {
  id: string;
  kind: AssetKind;
  name: string;
  // The squares it stands on, counted from the room's north-west corner
  x: number;
  y: number;
  w: number;
  h: number;
  // Doors, windows and secret ways are set in a wall
  side?: Side;
  // Nobody can stand on it; a creature behind it has cover
  blocks?: boolean;
  cover?: boolean;
  // The path a door is, the room it leads to, or the occupant, cache or ship the asset stands for
  ref?: string;
  to?: string;
}

export interface RoomLayout {
  // The room's north-west corner on the building's grid, and its size in squares
  x: number;
  y: number;
  width: number;
  height: number;
  assets: RoomAsset[];
  // Which floor it is on: 0 the ground, below 0 beneath it, above 0 over it (a gallery is half a
  // floor up). For stairs, lifts and ladders, the lower landing's floor.
  level?: number;
  // What it is when it is a way between floors or between rooms rather than a room to use (see Levels)
  form?: Form;
  // Stairs, lifts and ladders: the floor rises by this many levels towards the given side
  climb?: { toward: Side; levels: number };
  // Double height: something stands inside it over the floor (a gallery), so nothing is built above it
  tall?: boolean;
  // A room a ship can stand in: open to the sky, or roofed with doors that slide back where the air is hostile
  roof?: "open" | "hangar";
}

// What furnishes a room: name, where it goes (wall, corner, center, far = the wall opposite the
// way in, rows = ranks across the floor), size in squares, how many, and flags:
//   b blocks movement   c gives cover   s staff stand at it   t people sit at it
type Furnishing = [name: string, place: "wall" | "corner" | "center" | "far" | "rows", size: string, count: string, flags?: string];
interface RoomPlan { match: RegExp; size: [number, number, number, number]; items: Furnishing[] }

const ROOM_PLANS: RoomPlan[] = [
  { match: /detention/i, size: [8, 10, 6, 7], items: [["Holding cell", "wall", "2x2", "3-4", "b"], ["Guard console", "center", "2x1", "1", "bcs"], ["Restraint rack", "corner", "1x1", "1", "b"]] },
  { match: /barracks|tents/i, size: [8, 10, 6, 8], items: [["Bunk", "wall", "2x1", "4-6", "b"], ["Footlocker", "wall", "1x1", "2-4", "bc"], ["Weapon rack", "wall", "2x1", "1", "b"], ["Mess table", "center", "2x1", "1", "bct"]] },
  { match: /docking|hangar|landing|berth|\barm\b/i, size: [13, 16, 10, 12], items: [["Fuel pump", "wall", "1x1", "1-2", "b"], ["Cargo pallet", "corner", "2x2", "2-3", "bc"], ["Tool cart", "wall", "1x1", "1-2", "bcs"], ["Loading crane", "wall", "2x1", "0-1", "b"]] },
  { match: /main bar|^cantina$/i, size: [11, 13, 9, 11], items: [["Bar counter", "far", "5x1", "1", "bcs"], ["Bandstand", "corner", "3x2", "1"], ["Table", "center", "1x1", "4-6", "bct"], ["Booth", "wall", "2x1", "2-3", "bt"], ["Drink dispenser", "corner", "1x1", "1", "b"], ["Sabacc table", "center", "2x2", "0-1", "bct"]] },
  { match: /bar\b|cantina|common room|commons/i, size: [9, 11, 8, 10], items: [["Bar counter", "far", "5x1", "1", "bcs"], ["Table", "center", "1x1", "3-5", "bct"], ["Booth", "wall", "2x1", "1-3", "bt"], ["Drink dispenser", "corner", "1x1", "1", "b"], ["Sabacc table", "center", "2x2", "0-1", "bct"]] },
  { match: /stall|market|promenade|trade|shopfront/i, size: [10, 13, 7, 9], items: [["Market stall", "rows", "2x1", "4-7", "bcs"], ["Crate", "wall", "1x1", "2-4", "bc"], ["Awning post", "corner", "1x1", "0-2", "b"]] },
  { match: /ward|surgery|reception/i, size: [7, 9, 6, 7], items: [["Medical bed", "wall", "2x1", "2-4", "bt"], ["Bacta tank", "corner", "1x1", "1-2", "b"], ["Instrument cart", "center", "1x1", "1", "bs"], ["Supply cabinet", "wall", "2x1", "1", "b"]] },
  { match: /reactor|engine/i, size: [8, 10, 7, 9], items: [["Reactor core", "center", "2x2", "1", "bc"], ["Coolant tank", "corner", "1x1", "2", "b"], ["Monitoring console", "wall", "2x1", "1-2", "bs"], ["Pipe run", "wall", "3x1", "1-2", "b"]] },
  { match: /workfloor|engineering|workshop|maintenance|fuel|hydroponics/i, size: [8, 10, 6, 8], items: [["Workbench", "wall", "3x1", "1-2", "bs"], ["Tool rack", "wall", "2x1", "1", "b"], ["Parts bin", "center", "1x1", "2-3", "bc"], ["Power coupling", "corner", "1x1", "1", "b"]] },
  { match: /armory|vault|stash|stor|warehouse|cargo|container|hold|depot|cache|cellar|basement|compartment|parts|crib|pharmacy|locker|freight/i, size: [6, 9, 5, 8], items: [["Crate stack", "rows", "2x2", "2-4", "bc"], ["Shelving", "wall", "3x1", "1-3", "b"], ["Crate", "corner", "1x1", "1-3", "bc"], ["Lifter droid dock", "corner", "1x1", "0-1", "b"]] },
  { match: /command|operations|control|comms|bridge|tower/i, size: [7, 9, 6, 8], items: [["Holo-table", "center", "2x2", "1", "bcs"], ["Console", "wall", "2x1", "2-4", "bs"], ["Sensor mast", "corner", "1x1", "0-1", "b"], ["Command chair", "far", "1x1", "1", "t"]] },
  { match: /office|records|security|checkpoint|customs|desk|guard|watch|gatehouse|lookout|post\b/i, size: [6, 8, 5, 7], items: [["Desk", "center", "2x1", "1", "bcs"], ["Console", "wall", "2x1", "1-2", "bs"], ["Locker", "corner", "1x1", "1-2", "b"], ["Barricade", "center", "2x1", "0-1", "bc"]] },
  { match: /booth|den\b|tent|quarters|apartments/i, size: [5, 7, 5, 6], items: [["Couch", "wall", "2x1", "1-2", "bt"], ["Low table", "center", "1x1", "1", "bct"], ["Cabinet", "corner", "1x1", "1", "b"], ["Bed", "wall", "2x1", "0-2", "b"]] },
  { match: /crypt|sanctum/i, size: [8, 10, 7, 9], items: [["Sarcophagus", "center", "1x2", "1-3", "bc"], ["Broken pillar", "corner", "1x1", "2-4", "bc"], ["Altar", "far", "2x1", "1", "bc"], ["Rubble", "wall", "1x1", "2-4", "bc"]] },
  { match: /cave|tunnel|chamber|mouth|breach|trailhead|perimeter|shelter|rooftop|collapsed|hull/i, size: [7, 11, 6, 9], items: [["Boulder", "center", "1x1", "2-4", "bc"], ["Rubble", "wall", "2x1", "2-4", "bc"], ["Rock pillar", "corner", "1x1", "1-3", "bc"], ["Campfire ring", "center", "1x1", "0-1", "t"]] },
  { match: /audience|hall|concourse|lobby|antechamber|reading|gate|entrance|arrivals|airlock|stacks/i, size: [9, 12, 7, 9], items: [["Pillar", "center", "1x1", "2-4", "bc"], ["Bench", "wall", "2x1", "2-4", "t"], ["Dais", "far", "3x1", "0-1", "c"], ["Information terminal", "wall", "1x1", "1", "bs"]] },
  { match: /./, size: [6, 8, 5, 7], items: [["Crate", "wall", "1x1", "1-3", "bc"], ["Bench", "wall", "2x1", "1-2", "t"], ["Terminal", "wall", "1x1", "0-1", "bs"]] },
];

// Caves, ruins and trails are rock and rubble whatever a chamber is called
const planFor = (room: Area, buildingType: string): RoomPlan =>
  ROOM_PLANS.find((p) => p.match.test(/^(cave|ruin|trailhead)$/.test(buildingType) && !/crypt|sanctum/i.test(room.name) ? "cave" : room.name))!;

const SECRET_WAYS = { built: ["Ventilation shaft", "Maintenance crawlway", "Loose wall panel", "Sewer grate", "Service hatch"], wild: ["Narrow fissure", "Half-buried tunnel", "Gap under the rubble", "Old animal run"] };
const WINDOWLESS = /vault|cellar|basement|armory|detention|stash|compartment|crypt|tunnel|reactor|hold|den\b|stor/i;

const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };
const range = (text: string, r: Random) => {
  const [low, high = low] = text.split("-").map(Number);
  return r.int(low, high);
};
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The squares of a room that are free to stand on (true), given its assets
function freeSquares(layout: RoomLayout): boolean[][] {
  const free = Array.from({ length: layout.height }, () => Array.from({ length: layout.width }, () => true));
  for (const asset of layout.assets) {
    if (!asset.blocks) continue;
    for (let y = asset.y; y < asset.y + asset.h; y++) for (let x = asset.x; x < asset.x + asset.w; x++) if (free[y]?.[x] !== undefined) free[y][x] = false;
  }
  return free;
}

// Whether every way in or out of a room can still be walked to from the first
function walkable(layout: RoomLayout): boolean {
  const ways = layout.assets.filter((a) => a.kind === "door" || a.kind === "exit" || a.kind === "secret" || a.kind === "stairs");
  if (ways.length < 2) return true;
  const free = freeSquares(layout);
  const seen = new Set<string>([`${ways[0].x},${ways[0].y}`]);
  const queue = [[ways[0].x, ways[0].y]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!free[ny]?.[nx] || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return ways.every((w) => seen.has(`${w.x},${w.y}`));
}

// What is wrong with the floor of a room, counted: a pair of pieces that touch only at a corner
// (the gap between them is too narrow to walk through, so a square on either side is cut off
// from the other), a stretch of floor that cannot be walked to from the rest, or a way in or out
// that cannot be reached. Furniture is placed only where this stays at nothing.
function floorFaults(layout: RoomLayout): number {
  const free = freeSquares(layout);
  const { width: W, height: H } = layout;
  let faults = walkable(layout) ? 0 : 1;
  for (let y = 0; y + 1 < H; y++) {
    for (let x = 0; x + 1 < W; x++) {
      const [a, b, c, d] = [free[y][x], free[y][x + 1], free[y + 1][x], free[y + 1][x + 1]];
      if ((!a && !d && b && c) || (!b && !c && a && d)) faults++;
    }
  }
  const seen = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  let regions = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!free[y][x] || seen[y][x]) continue;
      regions++;
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (!free[ny]?.[nx] || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return faults + Math.max(0, regions - 1);
}

// The square inside a room that touches the given wall at the given step along it
const wallSquare = (layout: RoomLayout, side: Side, along: number) =>
  side === "n" ? { x: along, y: 0 } : side === "s" ? { x: along, y: layout.height - 1 } : side === "w" ? { x: 0, y: along } : { x: layout.width - 1, y: along };

// Somewhere for an asset of the given size, where nothing stands and no way in is blocked
function findSpot(layout: RoomLayout, r: Random, place: Furnishing[1], w: number, h: number, awayFrom?: Side): { x: number; y: number; w: number; h: number } | undefined {
  const taken = (x: number, y: number, ww: number, hh: number) =>
    x < 0 || y < 0 || x + ww > layout.width || y + hh > layout.height ||
    layout.assets.some((a) => a.x < x + ww && x < a.x + a.w && a.y < y + hh && y < a.y + a.h);
  const options: { x: number; y: number; w: number; h: number }[] = [];
  const add = (x: number, y: number, ww: number, hh: number) => { if (!taken(x, y, ww, hh)) options.push({ x, y, w: ww, h: hh }); };
  const { width: W, height: H } = layout;
  if (place === "corner") {
    for (const [x, y] of [[0, 0], [W - w, 0], [0, H - h], [W - w, H - h]]) add(x, y, w, h);
  } else if (place === "wall" || place === "far") {
    const sides: Side[] = place === "far" && awayFrom ? [OPPOSITE[awayFrom]] : ["n", "s", "e", "w"];
    for (const side of sides) {
      // Long side along the wall
      const [ww, hh] = side === "n" || side === "s" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
      // The far wall keeps a row behind the counter for whoever works there
      const inset = place === "far" ? 1 : 0;
      if (side === "n" || side === "s") for (let x = 0; x + ww <= W; x++) add(x, side === "n" ? inset : H - hh - inset, ww, hh);
      else for (let y = 0; y + hh <= H; y++) add(side === "w" ? inset : W - ww - inset, y, ww, hh);
    }
  } else {
    // Center and rows keep a square clear of the walls; rows fall on every other line
    for (let y = 1; y + h <= H - 1; y++) for (let x = 1; x + w <= W - 1; x++) if (place !== "rows" || (x % (w + 1) === 1 && y % (h + 1) === 1)) add(x, y, w, h);
  }
  return options.length ? r.pick(options) : undefined;
}

// Fixed dressing for a room: furniture by what the room is for, kept only where it leaves the doors reachable
function furnishRoom(room: Area, r: Random, buildingType: string) {
  const layout = room.layout!;
  const plan = planFor(room, buildingType);
  const wayIn = layout.assets.find((a) => a.kind === "exit" || a.kind === "door")?.side;
  let n = layout.assets.length;
  for (const [name, place, size, count, flags = ""] of plan.items) {
    const [w, h] = size.split("x").map(Number);
    for (let i = 0, wanted = range(count, r); i < wanted; i++) {
      const spot = findSpot(layout, r, place, w, h, wayIn);
      if (!spot) break;
      const asset: RoomAsset = { id: `${room.id}-${++n}`, kind: "furniture", name, ...spot, ...(flags.includes("b") ? { blocks: true } : {}), ...(flags.includes("c") ? { cover: true } : {}) };
      layout.assets.push(asset);
      if (asset.blocks && floorFaults(layout)) layout.assets.pop();
      else room.tags = room.tags.filter((t) => t !== `use:${name}`).concat(flags.includes("s") || flags.includes("t") ? [`use:${name}`] : []);
    }
  }
}

// Mends a floor made before furniture was kept clear of corner-to-corner gaps: each piece that
// cuts the floor up is moved to the nearest place where it does not, or taken out if there is none
function repairFloor(room: Area, r: Random) {
  const layout = room.layout!;
  const loose = (a: RoomAsset) => a.kind === "npc" || a.kind === "loot" || a.kind === "ship";
  layout.assets = layout.assets.filter((a) => !loose(a));
  const without = (piece: RoomAsset) => ({ ...layout, assets: layout.assets.filter((a) => a !== piece) });
  const fits = (x: number, y: number, w: number, h: number) =>
    x >= 0 && y >= 0 && x + w <= layout.width && y + h <= layout.height && !layout.assets.some((a) => a.x < x + w && x < a.x + a.w && a.y < y + h && y < a.y + a.h);
  for (let guard = 0; guard < 24 && floorFaults(layout); guard++) {
    const base = floorFaults(layout);
    let worst: RoomAsset | undefined;
    let least = base;
    for (const piece of layout.assets.filter((a) => a.kind === "furniture" && a.blocks)) {
      const faults = floorFaults(without(piece));
      if (faults < least) {
        worst = piece;
        least = faults;
      }
    }
    if (!worst) break;
    layout.assets = layout.assets.filter((a) => a !== worst);
    // The nearest place for it, either way round, that leaves the floor whole
    const spots: { x: number; y: number; w: number; h: number; d: number }[] = [];
    for (const [w, h] of worst.w === worst.h ? [[worst.w, worst.h]] : [[worst.w, worst.h], [worst.h, worst.w]]) {
      for (let y = 0; y + h <= layout.height; y++) for (let x = 0; x + w <= layout.width; x++) if (fits(x, y, w, h)) spots.push({ x, y, w, h, d: Math.abs(x - worst.x) + Math.abs(y - worst.y) });
    }
    for (const spot of spots.sort((a, b) => a.d - b.d)) {
      layout.assets.push({ ...worst, x: spot.x, y: spot.y, w: spot.w, h: spot.h });
      if (!floorFaults(layout)) break;
      layout.assets.pop();
    }
  }
  placeContents(room, r);
}

// Gives everyone and everything in a room a square: staff at their counters and consoles, patrons
// at tables, sentries by the doors, a leader at the far end, beasts in the open; caches against
// the walls furthest from the way in; ships in the middle of the floor. Called again whenever
// the room's contents change.
export function placeContents(room: Area, r: Random = createRandom(room.id.length * 7919 + room.occupants.length)) {
  const layout = room.layout;
  if (!layout) return;
  layout.assets = layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship");
  const { width: W, height: H } = layout;
  let n = layout.assets.length;
  const used = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || layout.assets.some((a) => (a.blocks || a.kind === "npc" || a.kind === "loot" || a.kind === "ship") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
  const ways = layout.assets.filter((a) => a.kind === "door" || a.kind === "exit");
  const wayIn = ways[0];
  const beside = (targets: RoomAsset[]) => {
    const spots: { x: number; y: number }[] = [];
    for (const t of targets) for (let y = t.y - 1; y <= t.y + t.h; y++) for (let x = t.x - 1; x <= t.x + t.w; x++) if (!used(x, y) && !ways.some((d) => d.x === x && d.y === y)) spots.push({ x, y });
    return spots;
  };
  const anywhere = () => {
    const spots: { x: number; y: number }[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!used(x, y) && !ways.some((d) => d.x === x && d.y === y)) spots.push({ x, y });
    return spots;
  };
  const furthest = (spots: { x: number; y: number }[]) => (wayIn ? [...spots].sort((a, b) => Math.hypot(b.x - wayIn.x, b.y - wayIn.y) - Math.hypot(a.x - wayIn.x, a.y - wayIn.y)).slice(0, 3) : spots);
  const uses = room.tags.filter((t) => t.startsWith("use:")).map((t) => t.slice(4));
  const stations = layout.assets.filter((a) => a.kind === "furniture" && uses.includes(a.name) && a.blocks);
  const seats = layout.assets.filter((a) => a.kind === "furniture" && uses.includes(a.name));
  // Staff stand behind their counters, away from the customers
  const behind = layout.assets.filter(isCounter).flatMap((s) => counterSides(layout, s).behind).filter((s) => !used(s.x, s.y) && !ways.some((d) => d.x === s.x && d.y === s.y));
  const stage = layout.assets.filter((a) => a.name === "Bandstand").flatMap((a) => Array.from({ length: a.w * a.h }, (_, i) => ({ x: a.x + (i % a.w), y: a.y + Math.floor(i / a.w) })));
  const dispenser = layout.assets.filter((a) => /drink dispenser|bar counter/i.test(a.name));
  const exit = ways.find((a) => a.kind === "exit") ?? wayIn;

  // A ship stands mid-floor; a smaller berth if the furniture would leave the floor cut up
  for (const ship of room.ships) {
    let w = Math.min(W - 4, 6);
    let h = Math.min(H - 4, 4);
    const asset = (): RoomAsset => ({ id: `${room.id}-${++n}`, kind: "ship", name: ship.name, x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h, blocks: true, cover: true, ref: ship.id });
    for (let tries = 0; tries < 8; tries++) {
      layout.assets.push(asset());
      if (!floorFaults(layout) || w <= 2 || h <= 2) break;
      layout.assets.pop();
      if (tries % 2) w--;
      else h--;
    }
  }
  // Caches go against a wall far from the way in, where the floor stays in one piece
  for (const cache of room.loot) {
    const walls = anywhere().filter((s) => s.x === 0 || s.y === 0 || s.x === W - 1 || s.y === H - 1);
    const candidates = [...furthest(walls.length ? walls : anywhere()), ...walls, ...anywhere()];
    const asset = (spot: { x: number; y: number }): RoomAsset => ({ id: `${room.id}-${++n}`, kind: "loot", name: cache.name, x: spot.x, y: spot.y, w: 1, h: 1, blocks: true, cover: true, ref: cache.id });
    const sound = candidates.find((spot) => {
      layout.assets.push(asset(spot));
      const faults = floorFaults(layout);
      layout.assets.pop();
      return !faults;
    });
    layout.assets.push(asset(sound ?? r.pick(furthest(walls.length ? walls : anywhere())) ?? { x: 0, y: 0 }));
  }
  let posted = false;
  for (const occupant of room.occupants) {
    for (let i = 0; i < Math.min(occupant.count, 6); i++) {
      const guard = occupant.role === "guard";
      // The first sentry keeps the post by the way out; the rest by any door
      const post = guard && !posted && exit ? beside([exit]) : [];
      if (post.length) posted = true;
      const free = (spots: { x: number; y: number }[]) => spots.filter((s) => !used(s.x, s.y));
      const preferred =
        occupant.role === "leader" ? furthest(anywhere())
        : guard ? (post.length ? post : beside(ways))
        : occupant.role === "wildlife" || occupant.role === "horror" ? anywhere().filter((s) => s.x > 0 && s.y > 0 && s.x < W - 1 && s.y < H - 1)
        : occupant.role === "musician" ? (free(stage).length ? free(stage) : beside(seats))
        : occupant.role === "service droid" ? beside(dispenser)
        : isLocal(occupant) || NOTABLES.includes(occupant.role) ? beside(seats)
        : occupant.count === 1 ? (free(behind).length ? free(behind) : beside(stations))
        : beside(seats);
      const spots = preferred.length ? preferred : anywhere();
      if (!spots.length) break;
      const spot = r.pick(spots);
      layout.assets.push({ id: `${room.id}-${++n}`, kind: "npc", name: occupant.count > 1 ? `${occupant.name} ${i + 1}` : occupant.name, x: spot.x, y: spot.y, w: 1, h: 1, ref: occupant.id });
    }
  }
}

// What staff stand at to serve (the furnishings flagged "s" in ROOM_PLANS, known by name so that
// plans made before the flag was kept still work)
export const isCounter = (a: Pick<RoomAsset, "kind" | "name">) => a.kind === "furniture" && /counter|stall|desk|console|terminal|workbench|tool cart|instrument cart|holo-table/i.test(a.name);

// The squares round a counter (or a desk, a stall, a console), split by the side they are on:
// `behind` is the side away from the room's way in, where whoever serves stands; `front` is
// everything else, where customers come up to it. Squares outside the room are left out.
export function counterSides(layout: RoomLayout, station: RoomAsset): { behind: { x: number; y: number }[]; front: { x: number; y: number }[] } {
  const way = layout.assets.find((a) => a.kind === "exit") ?? layout.assets.find((a) => a.kind === "door");
  const wide = station.w >= station.h;
  const middle = wide ? station.y + (station.h - 1) / 2 : station.x + (station.w - 1) / 2;
  const towards = way ? Math.sign((wide ? way.y : way.x) - middle) : 1;
  const behind: { x: number; y: number }[] = [];
  const front: { x: number; y: number }[] = [];
  for (let y = station.y - 1; y <= station.y + station.h; y++) {
    for (let x = station.x - 1; x <= station.x + station.w; x++) {
      if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) continue;
      if (x >= station.x && x < station.x + station.w && y >= station.y && y < station.y + station.h) continue;
      const across = wide ? (y < station.y ? -1 : y >= station.y + station.h ? 1 : 0) : x < station.x ? -1 : x >= station.x + station.w ? 1 : 0;
      (across && towards && across === -towards ? behind : front).push({ x, y });
    }
  }
  return { behind, front };
}

// Brings a world made before the people in it were given lives up to date: civilians that were
// one crowd become people one by one, cantinas get their stage, band and service droid, and a
// hostile building's way in has a second sentry. Worlds made since are left as they are.
export const LIFE = 4;
export function livenWorld(world: World, catalog: WorldCatalog): World {
  const next: World = JSON.parse(JSON.stringify(world));
  if ((next.life ?? 0) >= LIFE) return next;
  const ctx = contextFor(next, catalog, next.seed + next.counter + 4441);
  // Floors (life 4): buildings made as one flat storey get their cellars, upper floors, stairwells
  // and hangars on the top floor, and are planned again with furniture kept clear of corner-to-
  // corner gaps. Secret ways the party has found stay found.
  if ((next.life ?? 0) < 4) {
    for (const building of Object.values(next.areas).filter((a) => a.kind === "building" && childrenOf(next, a.id).some((room) => room.layout))) {
      const found = new Set(childrenOf(next, building.id).filter((room) => room.secretEntry?.found).map((room) => room.id));
      planBuilding(next, building.id);
      for (const room of childrenOf(next, building.id)) if (room.secretEntry && found.has(room.id)) room.secretEntry.found = true;
    }
  }
  for (const room of Object.values(next.areas)) {
    if (room.kind !== "room") continue;
    const building = next.areas[room.parentId ?? ""];
    const speciesNames = (ancestor(next, room.id, "planet")?.tags ?? []).filter((t) => t.startsWith("species:")).map((t) => t.slice(8));
    let changed = false;
    // Furniture left corner to corner (life 4): moved apart so every square can be walked to
    if ((next.life ?? 0) < 4 && room.layout && floorFaults({ ...room.layout, assets: room.layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship") })) {
      repairFloor(room, ctx.random);
    }
    const crowds = (next.life ?? 0) < 1 ? room.occupants.filter((o) => o.role === "civilians" && !o.statBlock) : [];
    if (crowds.length) {
      room.occupants = room.occupants.flatMap((o) => (crowds.includes(o) ? locals(ctx, room, speciesNames, Math.min(6, o.count)) : [o]));
      changed = true;
    }
    if ((next.life ?? 0) < 1 && /^(main bar|cantina)$/i.test(room.name) && ["cantina", "promenade"].includes(building?.type) && !room.occupants.some((o) => o.role === "musician")) {
      room.occupants.push(...band(ctx, speciesNames), ...(ctx.random.chance(0.7) ? serviceDroid(ctx) : []));
      const layout = room.layout;
      if (layout && !layout.assets.some((a) => a.name === "Bandstand")) {
        layout.assets = layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship");
        const spot = findSpot(layout, ctx.random, "corner", 3, 2) ?? findSpot(layout, ctx.random, "corner", 2, 2) ?? findSpot(layout, ctx.random, "wall", 2, 1);
        if (spot) layout.assets.push({ id: `${room.id}-stage`, kind: "furniture", name: "Bandstand", ...spot });
      }
      changed = true;
    }
    const template = BUILDINGS[building?.type ?? ""];
    const hostile = !!template?.hostile && (template.hostile !== "faction" || (building.faction ?? next.antagonist) === next.antagonist);
    if (room.gateway && hostile && guardTheGate(room)) changed = true;
    // Trade (life 2): merchants get their line of goods, cantina back rooms a fence
    for (const o of room.occupants) if (o.role === "merchant" && !o.trade) o.trade = lawAt(next, room.id) === 0 && ctx.random.chance(0.33) ? "black" : ctx.random.pick(MERCHANT_WARES);
    if (building?.type === "cantina" && /back room/i.test(room.name) && !room.occupants.some((o) => o.role === "fence")) {
      room.occupants.push(person(ctx, "fence", "neutral", speciesNames));
      changed = true;
    }
    if (changed && room.layout) placeContents(room);
  }
  // Routines (life 3): homes, days and voyages for every settlement that has been built
  if ((next.life ?? 0) < 3) for (const settlement of Object.values(next.areas).filter((a) => a.kind === "settlement")) settleRoutines(next, settlement, ctx.random);
  next.life = LIFE;
  return next;
}

// Where someone knocked senseless comes to: the nearest room, by the ways between rooms that are
// not hidden, with no hostile creature in it (a stairwell or corridor only if there is nothing
// better), so that they are not woken into the fight they lost
export function safeHarbour(world: World, id: string): string | undefined {
  const start = world.areas[id];
  if (!start) return undefined;
  const hostile = (a: Area) => a.occupants.some((o) => o.disposition === "hostile" && !!o.hitPoints);
  const seen = new Set([id]);
  const queue = [id];
  let fallback: string | undefined;
  while (queue.length) {
    const here = queue.shift()!;
    for (const path of indexOf(world).paths.get(here) ?? []) {
      const to = path.from === here ? path.to : path.from;
      const area = world.areas[to];
      if (path.hidden || seen.has(to) || !area || area.kind !== start.kind || area.parentId !== start.parentId) continue;
      seen.add(to);
      if (hostile(area)) queue.push(to);
      else if (!formOf(area)) return to;
      else {
        fallback ??= to;
        queue.push(to);
      }
    }
  }
  return fallback;
}

// What a fight leaves of the hostile creatures in an area, however it ended (won, left, or the
// character knocked out): the fallen are gone and leave their gear, and those still standing keep
// the hit points they have, so that leaving or losing never gives the enemy its strength back.
// `standing` says how each enemy of the fight (id `<occupant id>-<index>`) ended up.
export function afterFight(area: Pick<Area, "occupants">, standing: { id: string | number; hp: number }[]) {
  const gear: { name: string; quantity: number; source: "equipment" }[] = [];
  // For each occupant that is still here, how many of them are
  const kept = new Map<string, number>();
  let slain = 0;
  let xp = 0;
  let people = false;
  const occupants = area.occupants.flatMap((o) => {
    if (o.disposition !== "hostile" || !o.hitPoints) return [o];
    const now = Array.from({ length: o.count }, (_, i) => standing.find((s) => s.id === `${o.id}-${i}`)?.hp ?? o.wounds?.[i] ?? o.hitPoints!);
    const alive = now.filter((hp) => hp > 0);
    const down = o.count - alive.length;
    if (down) {
      slain += down;
      xp += (o.xp ?? 0) * down;
      if (!["wildlife", "horror"].includes(o.role)) people = true;
      gear.push(...o.loadout.map((name) => ({ name, quantity: down, source: "equipment" as const })));
    }
    kept.set(o.id, alive.length);
    if (!alive.length) return [];
    if (!down && !alive.some((hp, i) => hp !== (o.wounds?.[i] ?? o.hitPoints))) return [o];
    return [{ ...o, count: alive.length, wounds: alive.some((hp) => hp < o.hitPoints!) ? alive : undefined }];
  });
  return { occupants, gear, kept, slain, xp, people, changed: occupants.length !== area.occupants.length || occupants.some((o, i) => o !== area.occupants[i]) };
}

// ---------------------------------------------------------------------------------------------
// Levels. A building is not one flat floor: cellars, vaults and detention blocks lie beneath it,
// apartments, offices and towers are over it, and anything a ship can stand in is on the top
// floor, open to the sky (or with doors that slide back where the air is not fit to breathe).
// Where two rooms are on different floors, a stairwell (or a lift, or a ladder) of its own lies
// between them; large buildings have corridors, urban and ocean worlds elevated walkways, tall
// rooms a gallery, and some buildings a ladder up the outside wall. Those ways are rooms of
// their own so that nothing is ever put in them.
// ---------------------------------------------------------------------------------------------

export type Form = "stairs" | "lift" | "ladder" | "corridor" | "walkway" | "gallery";
export const formOf = (a: Pick<Area, "tags">): Form | undefined => a.tags.find((t) => t.startsWith("form:"))?.slice(5) as Form | undefined;
const tagNumber = (a: Pick<Area, "tags">, name: string): number | undefined => {
  const tag = a.tags.find((t) => t.startsWith(`${name}:`));
  return tag === undefined ? undefined : Number(tag.slice(name.length + 1));
};

const tagId = (a: Pick<Area, "tags">, name: string): string | undefined => a.tags.find((t) => t.startsWith(`${name}:`))?.slice(name.length + 1);
const WILD_BUILDINGS = ["cave", "ruin", "wreck", "camp", "trailhead"];
const OPEN_GROUNDS = ["landing field", "landing pad"];
const UNDERGROUND = /cellar|basement|crypt|vault|hidden compartment|escape tunnel|detention|sewer|deep chamber/i;
const UPSTAIRS = /apartment|quarters|offices|command room|operations room|control room|tower|rooftop|lookout|bridge|port office/i;
const SHIP_ROOMS = /docking|hangar|landing|berth|\barm\b/i;
const TALL_ROOMS = /main bar|workfloor|engineering deck|storage floor|container stacks|reading hall|audience chamber|loading dock|concourse|hangar|docking bay/i;
const HOSTILE_AIR = ["volcanic", "ice", "barren", "gas giant", "ocean"];
export const holdsShips = (room: Pick<Area, "ships" | "tags" | "name">) => room.ships.length > 0 || room.tags.includes("code:S") || SHIP_ROOMS.test(room.name);

// The floor each room is on, by what it is for; the rooms a ship can stand in are on the top floor
function levelsOf(building: Area, rooms: Area[]): Map<string, number> {
  const levels = new Map<string, number>();
  let top = 0;
  for (const room of rooms) {
    const level = UNDERGROUND.test(room.name) ? -1 : UPSTAIRS.test(room.name) && !OPEN_GROUNDS.includes(building.type) ? 1 : 0;
    levels.set(room.id, level);
    top = Math.max(top, level);
  }
  if (rooms.length > 1 && !WILD_BUILDINGS.includes(building.type) && !OPEN_GROUNDS.includes(building.type)) {
    for (const room of rooms) if (holdsShips(room)) levels.set(room.id, Math.max(1, top));
  }
  return levels;
}

// Puts a room of its own between two rooms on different floors, and now and then corridors,
// walkways, a gallery and a ladder. Rooms already joined by one are left alone, so this can be
// run again on a building that has been edited.
function linkLevels(world: World, building: Area, seed: number) {
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room");
  if (rooms.length < 2) return;
  const real = rooms.filter((a) => !formOf(a));
  const levels = levelsOf(building, real);
  const first = !building.tags.includes("linked");
  const r = createRandom(seed + Number(building.id.replace(/\D/g, "") || 1) * 4409 + 17);
  const wild = WILD_BUILDINGS.includes(building.type);
  const trail = trailOf(world, building.id);
  const biome = trail.find((a) => a.kind === "planet")?.type ?? "";
  const station = trail.some((a) => a.type === "station");
  const level = (a: Area) => levels.get(a.id) ?? 0;
  const make = (name: string, form: Form, tags: string[]): Area => {
    const area: Area = {
      id: nextId(world, "a"), kind: "room", parentId: building.id, name, type: name.toLowerCase(), description: "",
      tags: [`form:${form}`, ...tags], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], faction: building.faction,
    };
    world.areas[area.id] = area;
    return area;
  };
  const door = (from: Area, to: Area, label: string, travel: string, extra: Partial<Path> = {}) =>
    world.paths.push({ id: nextId(world, "p"), from: from.id, to: to.id, kind: "door", label, travel, ...extra });
  const plain = wild ? "Passage" : station ? "Hatch" : "Doorway";
  let corridors = 0;
  for (const path of [...world.paths]) {
    if (path.kind !== "door") continue;
    const a = world.areas[path.from];
    const b = world.areas[path.to];
    if (!a || !b || a.parentId !== building.id || b.parentId !== building.id || formOf(a) || formOf(b)) continue;
    const [la, lb] = [level(a), level(b)];
    let form: Form | undefined;
    if (la !== lb) form = !wild && (holdsShips(a) || holdsShips(b)) ? "lift" : "stairs";
    else if (first && corridors < 2 && !wild && real.length >= 5 && !path.locked && !path.hidden && r.chance(0.35)) {
      form = la >= 1 && (station || ["urban", "ocean"].includes(biome)) && r.chance(0.7) ? "walkway" : "corridor";
      corridors++;
    }
    if (!form) continue;
    const dir = lb > la ? "up" : "down";
    const name =
      form === "stairs" ? `${wild ? "Rising passage" : station ? "Ladderway" : "Stairs"}${wild ? "" : ` ${dir}`} to ${b.name}`
      : form === "lift" ? `Lift ${dir} to ${b.name}`
      : form === "walkway" ? `Elevated walkway to ${b.name}`
      : `Corridor to ${b.name}`;
    const link = make(name, form, [`low:${Math.min(la, lb)}`, `rise:${Math.abs(la - lb)}`]);
    world.paths.splice(world.paths.indexOf(path), 1);
    door(a, link, path.hidden ? path.label : plain, "10 ft.", path.hidden ? { hidden: true } : {});
    door(link, b, path.locked ? path.label : plain, path.travel, path.locked ? { locked: path.locked } : {});
  }
  if (!first) return;
  // On a city world, an ocean world or a station, an elevated walkway between two rooms on upper
  // floors that are not already joined (a gantry from the hangar to the tower)
  if (!wild && (station || ["urban", "ocean"].includes(biome)) && r.chance(0.6)) {
    const uppers = real.filter((a) => level(a) >= 1);
    const pairs = uppers.flatMap((a, i) => uppers.slice(i + 1).filter((b) => level(b) === level(a) && !linked(world, a.id, b.id)).map((b) => [a, b] as const));
    if (pairs.length) {
      const [a, b] = r.pick(pairs);
      const walk = make(`Elevated walkway to ${b.name}`, "walkway", [`low:${level(a)}`, "rise:0"]);
      door(a, walk, "Doorway", "10 ft.");
      door(walk, b, "Doorway", `${r.int(30, 60)} ft.`);
    }
  }
  // A gallery over a tall room: a half floor of its own up a flight of stairs
  const hosts = real.filter((a) => level(a) === 0 && TALL_ROOMS.test(a.name) && !a.tags.includes("code:K") && !a.tags.includes("code:H"));
  if (hosts.length && !wild && r.chance(0.6)) {
    const host = r.pick(hosts);
    const gallery = make("Upper gallery", "gallery", [`host:${host.id}`, `low:${level(host) + 0.5}`, "rise:0"]);
    gallery.description = `The gallery over the ${host.name.toLowerCase()}.`;
    host.tags.push("tall");
    door(host, gallery, "Stairs up", "10 ft.");
  }
  // A ladder up the outside wall to a room on an upper floor, as a second way in
  const upper = real.filter((a) => level(a) >= 1 && !a.gateway && !holdsShips(a));
  if (upper.length && !wild && !station && r.chance(0.4)) {
    const to = r.pick(upper);
    const ladder = make(`Ladder up to ${to.name}`, "ladder", [`low:0`, `rise:${level(to)}`]);
    ladder.gateway = true;
    door(ladder, to, "Hatch", "10 ft.");
  }
  building.tags.push("linked");
}

// Lays out every room of a building on one grid, sets doors, windows and a secret way in, and
// furnishes and fills the rooms. The same building and seed give the same plan.
export function planBuilding(world: World, buildingId: string, seed = world.seed): void {
  const building = world.areas[buildingId];
  if (!building) return;
  // Stairwells, lifts and the like between rooms on different floors (see Levels)
  linkLevels(world, building, seed);
  const rooms = childrenOf(world, buildingId).filter((a) => a.kind === "room");
  if (!rooms.length) return;
  const r = createRandom(seed + Number(buildingId.replace(/\D/g, "") || 1) * 7919);
  const wild = doorsOf(building.type, "") === DOORS.wild;
  const ids = new Set(rooms.map((a) => a.id));
  const doors = world.paths.filter((p) => ids.has(p.from) && ids.has(p.to));
  const root = rooms.find((a) => a.gateway) ?? rooms[0];

  // Which floor each room is on, and how big each is: by purpose (a room with a ship in it is a
  // hangar whatever it is called); the ways between floors have a width and a length, set by
  // which way they lie when they are put down
  const levels = levelsOf(building, rooms.filter((a) => !formOf(a)));
  const station = trailOf(world, buildingId).some((a) => a.type === "station");
  const biome = ancestor(world, buildingId, "planet")?.type ?? "";
  const sky = !OPEN_GROUNDS.includes(building.type) && (station || HOSTILE_AIR.includes(biome)) ? "hangar" : "open";
  const spans = new Map<string, { cross: number; length: number }>();
  for (const room of rooms) {
    const form = formOf(room);
    const rise = tagNumber(room, "rise") ?? 0;
    const level = form ? tagNumber(room, "low") ?? 0 : levels.get(room.id) ?? 0;
    let width: number;
    let height: number;
    if (form === "gallery") [width, height] = [5, 3];
    else if (form) {
      const span = { cross: form === "corridor" || form === "walkway" ? 2 : form === "ladder" ? 2 : 3, length: form === "corridor" || form === "walkway" ? r.int(5, 9) : form === "lift" ? 3 : form === "ladder" ? 3 : 4 + 3 * Math.max(1, rise) };
      spans.set(room.id, span);
      [width, height] = [span.cross, span.length];
    } else {
      const [w0, w1, h0, h1] = holdsShips(room) ? ROOM_PLANS.find((p) => p.match.test("hangar"))!.size : planFor(room, building.type).size;
      [width, height] = [r.int(w0, w1), r.int(h0, h1)];
    }
    room.layout = {
      x: 0, y: 0, width, height, assets: [],
      ...(level ? { level } : {}),
      ...(form ? { form } : {}),
      ...(form && ["stairs", "lift", "ladder"].includes(form) ? { climb: { toward: "e" as Side, levels: Math.max(1, rise) } } : {}),
      ...(room.tags.includes("tall") ? { tall: true } : {}),
      ...(!form && holdsShips(room) ? { roof: sky } : {}),
    };
    room.tags = room.tags.filter((t) => !t.startsWith("use:"));
  }
  // Two rooms are in each other's way when they stand on the same squares at a floor they share
  const floors = (l: RoomLayout): [number, number] => [l.level ?? 0, (l.level ?? 0) + (l.climb?.levels ?? 0) + (l.tall ? 1 : 0)];
  const clash = (a: RoomLayout, b: RoomLayout) => overlap(a, b) && floors(a)[0] <= floors(b)[1] && floors(b)[0] <= floors(a)[1];
  // The side of its parent each way between floors was set on, so that what it leads to goes on past it
  const attached = new Map<string, Side>();

  // Breadth first from the entrance: each room is set against a free stretch of wall of the room
  // it opens off, sharing at least two squares of wall for the door
  const placed: Area[] = [root];
  const joined: { path: Path; adjacent: boolean; stairs?: boolean }[] = [];
  const queue = [root];
  while (queue.length) {
    const from = queue.shift()!;
    for (const path of doors.filter((p) => p.from === from.id || p.to === from.id)) {
      const room = world.areas[path.from === from.id ? path.to : path.from];
      if (placed.includes(room)) {
        if (!joined.some((j) => j.path.id === path.id)) joined.push({ path, adjacent: false });
        continue;
      }
      const a = from.layout!;
      const b = room.layout!;
      const options: { x: number; y: number }[] = [];
      // A gallery stands over the north end of the room it looks down into, up a flight of stairs
      if (b.form === "gallery" && from.id === tagId(room, "host")) {
        const gh = Math.max(2, Math.min(3, a.height - 3));
        Object.assign(b, { x: a.x + 1, y: a.y, width: Math.max(3, a.width - 2), height: gh });
        joined.push({ path, adjacent: false, stairs: true });
        placed.push(room);
        queue.push(room);
        continue;
      }
      // The way on from a stairwell or corridor continues straight, as far as there is room
      const straight = b.form !== "gallery" && a.form && a.form !== "gallery" ? attached.get(from.id) : undefined;
      let used: Side | undefined;
      // The way in is on the west wall, so the building grows east, then north and south
      for (const side of [...(straight ? [straight] : []), ...(["e", "s", "n", "w"] as Side[]).filter((x) => x !== straight)]) {
        if (from === root && side === "w") continue;
        const span = spans.get(room.id);
        if (span) [b.width, b.height] = side === "e" || side === "w" ? [span.length, span.cross] : [span.cross, span.length];
        const along = side === "e" || side === "w" ? a.height : a.width;
        const size = side === "e" || side === "w" ? b.height : b.width;
        for (const offset of r.shuffle(Array.from({ length: along + size - 3 }, (_, i) => i - size + 2))) {
          const spot = side === "e" ? { x: a.x + a.width, y: a.y + offset } : side === "w" ? { x: a.x - b.width, y: a.y + offset } : side === "s" ? { x: a.x + offset, y: a.y + a.height } : { x: a.x + offset, y: a.y - b.height };
          if (!placed.some((other) => clash({ ...b, ...spot }, other.layout!))) options.push(spot);
        }
        if (options.length) {
          used = side;
          break;
        }
      }
      if (options.length) {
        Object.assign(b, options[0]);
        if (used) {
          attached.set(room.id, used);
          // The floor rises away from the lower of the two rooms it joins
          if (b.climb) b.climb.toward = (a.level ?? 0) <= (b.level ?? 0) ? used : OPPOSITE[used];
        }
      } else {
        // Nowhere beside it: the room stands apart, reached by a passage
        const right = Math.max(...placed.map((p) => p.layout!.x + p.layout!.width));
        Object.assign(b, { x: right + 2, y: a.y });
      }
      joined.push({ path, adjacent: options.length > 0 });
      placed.push(room);
      queue.push(room);
    }
  }
  // A room no door leads to (an edited world) still gets a place
  for (const room of rooms) {
    if (placed.includes(room)) continue;
    room.layout!.x = Math.max(...placed.map((p) => p.layout!.x + p.layout!.width)) + 2;
    placed.push(room);
  }

  // Which wall squares of a room face outside (no other room against them)
  const outside = (room: Area, side: Side) => {
    const l = room.layout!;
    const length = side === "n" || side === "s" ? l.width : l.height;
    return Array.from({ length }, (_, i) => i).filter((i) => {
      const s = wallSquare(l, side, i);
      // (a room on another floor is not against it)
      const beyond: RoomLayout = { x: l.x + s.x + (side === "e" ? 1 : side === "w" ? -1 : 0), y: l.y + s.y + (side === "s" ? 1 : side === "n" ? -1 : 0), width: 1, height: 1, assets: [], level: l.level, climb: l.climb, tall: l.tall };
      return !rooms.some((other) => other !== room && clash(beyond, other.layout!)) && !l.assets.some((a) => a.side && a.x === s.x && a.y === s.y);
    });
  };
  const inWall = (room: Area, kind: AssetKind, name: string, side: Side, along: number, extra: Partial<RoomAsset> = {}) => {
    const l = room.layout!;
    l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind, name, ...wallSquare(l, side, along), w: 1, h: 1, side, ...extra });
  };
  const anyOutside = (room: Area, prefer: Side[]) => {
    for (const side of [...prefer, ...(["w", "s", "n", "e"] as Side[])]) {
      const free = outside(room, side);
      if (free.length) return { side, along: free[Math.floor(free.length / 2)] };
    }
    return undefined;
  };

  // The ways out of the building first, then the doors between rooms
  for (const room of rooms.filter((a) => a.gateway)) {
    const spot = anyOutside(room, room === root ? ["w"] : ["e", "s"]);
    if (spot) inWall(room, "exit", room === root ? "Way out" : formOf(room) === "ladder" ? "Ladder down" : "Back way out", spot.side, spot.along, { to: buildingId });
  }
  for (const { path, adjacent, stairs } of joined) {
    const a = world.areas[path.from];
    const b = world.areas[path.to];
    const la = a.layout!;
    const lb = b.layout!;
    if (stairs) {
      // A flight of stairs in the room below, rising to the south edge of the gallery over it
      const [host, gallery, lh, lg] = lb.form === "gallery" ? [a, b, la, lb] : [b, a, lb, la];
      const at = Math.floor(lg.x - lh.x + lg.width / 2);
      lh.assets.push({ id: `${host.id}-${lh.assets.length + 1}`, kind: "stairs", name: "Stairs up", x: at, y: lg.height, w: 1, h: 2, ref: path.id, to: gallery.id });
      lg.assets.push({ id: `${gallery.id}-${lg.assets.length + 1}`, kind: "stairs", name: "Stairs down", x: at - (lg.x - lh.x), y: lg.height - 1, w: 1, h: 1, ref: path.id, to: host.id });
      continue;
    }
    let side: Side | undefined;
    let low = 0;
    let high = -1;
    if (adjacent) {
      if (la.x + la.width === lb.x || lb.x + lb.width === la.x) {
        side = la.x + la.width === lb.x ? "e" : "w";
        low = Math.max(la.y, lb.y);
        high = Math.min(la.y + la.height, lb.y + lb.height) - 1;
      } else if (la.y + la.height === lb.y || lb.y + lb.height === la.y) {
        side = la.y + la.height === lb.y ? "s" : "n";
        low = Math.max(la.x, lb.x);
        high = Math.min(la.x + la.width, lb.x + lb.width) - 1;
      }
    }
    if (side && high >= low) {
      const at = Math.floor((low + high) / 2);
      const vertical = side === "e" || side === "w";
      inWall(a, "door", path.label, side, at - (vertical ? la.y : la.x), { ref: path.id, to: b.id });
      inWall(b, "door", path.label, OPPOSITE[side], at - (vertical ? lb.y : lb.x), { ref: path.id, to: a.id });
    } else {
      // Not wall to wall: the passage leaves each room by an outside wall (by any wall with a
      // free square if every outside square is taken)
      for (const [room, other] of [[a, b], [b, a]]) {
        const prefer: Side[] = [other.layout!.x >= room.layout!.x ? "e" : "w"];
        let spot = anyOutside(room, prefer);
        if (!spot) {
          const l = room.layout!;
          for (const side of [...prefer, "w", "s", "n", "e"] as Side[]) {
            const length = side === "n" || side === "s" ? l.width : l.height;
            const free = Array.from({ length }, (_, i) => i).filter((i) => {
              const sq = wallSquare(l, side, i);
              return !l.assets.some((x) => x.x === sq.x && x.y === sq.y && (x.side || x.kind === "furniture" || x.kind === "stairs"));
            });
            if (free.length) {
              spot = { side, along: free[Math.floor(free.length / 2)] };
              break;
            }
          }
        }
        if (spot) inWall(room, "door", path.label, spot.side, spot.along, { ref: path.id, to: other.id });
      }
    }
  }

  // A quiet way in: hostile places always have one, others now and then. It opens into a back
  // room that is neither the entrance nor where the leader sits.
  const hostilePlace = rooms.some((a) => a.danger > 0);
  const candidates = rooms.filter((a) => a !== root && !a.gateway && !formOf(a) && !a.tags.includes("code:b") && anyOutside(a, []));
  for (const room of rooms) delete room.secretEntry;
  if (candidates.length && (hostilePlace || r.chance(0.25))) {
    const room = r.pick(candidates);
    const spot = anyOutside(room, r.shuffle(["n", "s", "e"] as Side[]))!;
    const name = r.pick(wild ? SECRET_WAYS.wild : SECRET_WAYS.built);
    inWall(room, "secret", name, spot.side, spot.along, { to: buildingId });
    room.secretEntry = { name, dc: 12 + building.danger };
  }

  // Windows in outside walls, where the room would have them
  if (!wild) {
    for (const room of rooms) {
      if (WINDOWLESS.test(room.name) || (room.layout!.level ?? 0) < 0 || room.tags.includes("code:K") || room.tags.includes("code:H")) continue;
      for (const side of r.shuffle(["n", "s", "e", "w"] as Side[]).slice(0, 2)) {
        const free = outside(room, side).filter((i) => i > 0);
        if (free.length > 2 && r.chance(0.7)) inWall(room, "window", "Window", side, r.pick(free));
      }
    }
  }

  // Nothing is put in a stairwell, a lift, a ladder or a corridor
  for (const room of rooms) {
    if (formOf(room) && formOf(room) !== "gallery") continue;
    furnishRoom(room, r, building.type);
    placeContents(room, r);
  }
}

// Somewhere to fight where there is no room plan (a street, the outskirts, open country): open
// ground with scattered cover, the same for the same place every time
export function skirmishGround(area: Area): RoomLayout {
  const r = createRandom(Number(area.id.replace(/\D/g, "") || 1) * 104729);
  const ground: Area = { ...area, tags: [], layout: { x: 0, y: 0, width: 13, height: 9, assets: [] } };
  ground.layout!.assets.push({ id: `${area.id}-way`, kind: "exit", name: "Way back", x: 0, y: 4, w: 1, h: 1, side: "w" });
  furnishRoom(ground, r, area.kind === "building" || area.kind === "room" ? area.type : "cave");
  return ground.layout!;
}

// The rooms of a building as rectangles on its grid, for drawing the floor plan
export function floorPlan(world: World, buildingId: string): { rooms: Area[]; x: number; y: number; width: number; height: number } | undefined {
  const rooms = childrenOf(world, buildingId).filter((a) => a.layout);
  if (!rooms.length) return undefined;
  const x = Math.min(...rooms.map((a) => a.layout!.x));
  const y = Math.min(...rooms.map((a) => a.layout!.y));
  return { rooms, x, y, width: Math.max(...rooms.map((a) => a.layout!.x + a.layout!.width)) - x, height: Math.max(...rooms.map((a) => a.layout!.y + a.layout!.height)) - y };
}

// ---------------------------------------------------------------------------------------------
// The watch. Hostile creatures in an area notice the party by degrees (a house rule; the books
// leave it to the game master). How the party came in sets where it starts:
//   through a secret way in ............ unaware
//   sneaking ........................... Dexterity (Stealth) against their passive Perception:
//                                        made it, unaware; missed by less than 5, suspicious
//   openly ............................. questioning at the watched way in, confronting further
//                                        inside, attacking where the alarm is up or where what
//                                        lives there does not talk
// ---------------------------------------------------------------------------------------------

export const ALERT_LEVELS = ["unaware", "suspicious", "questioning", "confronting", "attacking"] as const;
export const ALERT = { unaware: 0, suspicious: 1, questioning: 2, confronting: 3, attacking: 4 } as const;
export type Approach = "open" | "sneak" | "secret";

export const watchersOf = (area: Area): Occupant[] => area.occupants.filter((o) => o.disposition === "hostile" && !!o.hitPoints);
const talks = (o: Occupant) => o.role !== "wildlife" && o.role !== "horror";
const alarmOf = (world: World, area: Area) => !!(area.kind === "room" && area.parentId && world.areas[area.parentId]?.alarm);

// What a Stealth check must beat: the watchers' best passive Perception, more once the alarm is up
export function watchDC(world: World, areaId: string): number {
  const area = world.areas[areaId];
  const best = Math.max(0, ...watchersOf(area).map((o) => o.saves?.wisdom ?? 0));
  return 10 + best + (alarmOf(world, area) ? 5 : 0);
}

// A level the watchers can actually be at: beasts and horrors do not question or warn
export function alertFor(area: Area, level: number): number {
  const clamped = Math.max(0, Math.min(4, level));
  return (clamped === ALERT.questioning || clamped === ALERT.confronting) && !watchersOf(area).some(talks) ? ALERT.attacking : clamped;
}

// Where the watch starts when the party arrives. `stealth` is the Stealth check total when sneaking.
export function arrivalAlert(world: World, areaId: string, approach: Approach, stealth = 0): number {
  const area = world.areas[areaId];
  if (!area || !watchersOf(area).length) return ALERT.unaware;
  const alarm = alarmOf(world, area);
  const open = alertFor(area, alarm ? ALERT.attacking : area.gateway ? ALERT.questioning : ALERT.confronting);
  if (approach === "secret") return alarm ? ALERT.suspicious : ALERT.unaware;
  if (approach === "sneak") {
    const dc = watchDC(world, areaId);
    return stealth >= dc ? ALERT.unaware : stealth >= dc - 5 ? ALERT.suspicious : open;
  }
  return open;
}

// Sets the watch in an area. Once they attack, the alarm is up through the whole building.
export function setAlert(world: World, areaId: string, level: number, allowed = false): World {
  const area = world.areas[areaId];
  if (!area) return world;
  const alert = alertFor(area, level);
  const areas = { ...world.areas, [areaId]: { ...area, alert, allowed: allowed || undefined } };
  const parent = area.parentId ? world.areas[area.parentId] : undefined;
  if (alert === ALERT.attacking && area.kind === "room" && parent && !parent.alarm) areas[parent.id] = { ...parent, alarm: true };
  return { ...world, areas };
}

// The alarms die down (after a long rest)
export function clearAlarms(world: World): World {
  const areas = Object.fromEntries(Object.entries(world.areas).map(([id, area]) => [id, area.alarm ? { ...area, alarm: undefined } : area]));
  return { ...world, areas };
}

// ---------------------------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------------------------

export interface Exit {
  to: string;
  via: "path" | "enter" | "leave";
  label: string;
  travel: string;
  pathId?: string;
  locked?: number;
  hidden?: boolean;
  needsShip?: boolean;
  // A secret way in or out: whoever uses it arrives unnoticed
  secret?: boolean;
  // Fuel units a ship burns on the way (see tripFuel)
  fuel?: number;
  // A hyperspace jump: the ship needs a hyperdrive
  jump?: boolean;
}

// Fuel for a trip, by Starships of the Galaxy ("Fuel Usage"): one unit for a jump to hyperspeed
// and one for each day in hyperspace; one for a day in realspace or a flight through atmosphere
export function tripFuel(kind: PathKind | "surface", travel = ""): number {
  if (kind !== "hyperlane") return 1;
  const hours = Number((travel.match(/(\d+(?:\.\d+)?)\s*hours?/) ?? [0, 24])[1]);
  return 1 + Math.ceil(hours / 24);
}

// ---------------------------------------------------------------------------------------------
// Time. A campaign keeps one clock in minutes of Galactic Standard Time (24-hour days); play
// begins at 08:00 on day 1. Moving takes the time the path says: a street at a walking pace
// (80 m a minute), a route by speeder, a lane or a jump in the hours given (a hyperdrive's class
// multiplies hyperspace time, Starships of the Galaxy); between the surface and orbit is an
// hour's flight; going through a door or in and out of a building a minute.
// ---------------------------------------------------------------------------------------------

export const DAY = 24 * 60;
export const START_TIME = 8 * 60;
export const hourOf = (minutes: number) => ((minutes % DAY) + DAY) % DAY / 60;
export const dayOf = (minutes: number) => Math.floor(minutes / DAY) + 1;
export const clockText = (minutes: number) => {
  const m = Math.floor(((minutes % DAY) + DAY) % DAY);
  return `Day ${dayOf(minutes)}, ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// How light it is outside, 0 (night) to 1 (day): dawn from 05:00 to 07:00, dusk from 18:00 to 20:00
export function daylight(minutes: number): number {
  const h = hourOf(minutes);
  if (h >= 7 && h <= 18) return 1;
  if (h <= 5 || h >= 20) return 0;
  return h < 12 ? (h - 5) / 2 : (20 - h) / 2;
}
export const partOfDay = (minutes: number) => {
  const h = hourOf(minutes);
  return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
};

// How long a move takes, in minutes
export function tripMinutes(exit: Pick<Exit, "via" | "travel" | "needsShip" | "jump">, hyperdriveClass = 1): number {
  const t = exit.travel ?? "";
  const range = t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*hours?/);
  if (range) return Math.round(((Number(range[1]) + Number(range[2])) / 2) * 60);
  const hours = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|h\b)/);
  if (hours) return Math.round(Number(hours[1]) * 60 * (exit.jump ? Math.max(0.5, hyperdriveClass) : 1));
  const days = t.match(/(\d+(?:\.\d+)?)\s*days?/);
  if (days) return Math.round(Number(days[1]) * DAY);
  const metres = t.match(/(\d+(?:\.\d+)?)\s*m\b/);
  if (metres) return Math.max(1, Math.round(Number(metres[1]) / 80));
  if (exit.needsShip) return 60;
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Trade. Staff who keep a counter sell from a stock that changes daily: a bartender pours the
// drinks of the equipment data, a merchant keeps a line of goods (general goods, arms, tools,
// medical supplies, music and games), a mechanic tools and kits, a medic medical supplies, a
// dockmaster spacer's supplies, and a fence or smuggler the black market. Only things in the
// rules data are sold, at their listed cost moved by where they are sold:
//   - the region (the further from the Core, the dearer manufactured goods) and the kind of
//     settlement (cities are cheapest, outposts and wild places dearest);
//   - what the planet needs (desert and ice worlds pay more for life support, jungles for
//     medicine ...), and goods from this very planet (named in the item's text) are cheap;
//   - the day (prices drift a little) and the stock (the last one costs more);
//   - what the party has bought there today (each one dearer) or sold there (each one fetches less);
//   - contraband (house rule): what the law here seizes is not sold openly; the black market
//     sells it at a premium that grows with the law;
//   - how the trader takes to the party (attitudeOf), and a haggle that came off.
// Selling: equipment fetches half its cost in a market (Player's Handbook, "Selling Treasure"),
// moved by the same demand and attitude. A trader buys only the kind of thing they sell; the
// black market buys anything, contraband at the full cost and the rest cheaply (Wretched Hives:
// "a shady buyer"). Enhanced items are not bought over a counter (Wretched Hives: finding a buyer
// is a downtime activity).
// The party's dealings are kept in the campaign: renown with factions and the number of
// dealings with each trader (factionInfluence), and what was bought and sold today
// (availableResources). Haggling: Charisma (Persuasion) against the trader, once a day each.
// ---------------------------------------------------------------------------------------------

export interface Wares {
  label: string;
  categories: string[];
  // How many lines are on offer, and how many of each
  lines: [number, number];
  each: [number, number];
  black?: boolean;
}
export const WARES: Record<string, Wares> = {
  bar: { label: "Drinks", categories: ["AlcoholicBeverage"], lines: [5, 8], each: [4, 12] },
  general: { label: "General goods", categories: ["Utility", "Storage", "Clothing", "Communications", "DataRecordingAndStorage", "LifeSupport"], lines: [9, 14], each: [1, 5] },
  arms: { label: "Arms and armor", categories: ["Weapon", "Armor", "Ammunition", "WeaponOrArmorAccessory"], lines: [8, 12], each: [1, 4] },
  tech: { label: "Tools and kits", categories: ["Tool", "Kit"], lines: [6, 10], each: [1, 3] },
  medical: { label: "Medical supplies", categories: ["Medical"], lines: [5, 8], each: [1, 6] },
  leisure: { label: "Music and games", categories: ["MusicalInstrument", "GamingSet"], lines: [5, 8], each: [1, 3] },
  spacer: { label: "Spacer's supplies", categories: ["LifeSupport", "Storage", "Communications"], lines: [6, 10], each: [1, 4] },
  black: { label: "Black market", categories: ["Spice", "Explosive", "Weapon", "Armor", "Kit", "Utility", "Medical", "Clothing", "Communications"], lines: [7, 11], each: [1, 4], black: true },
};
export const MERCHANT_WARES = ["general", "general", "arms", "tech", "medical", "leisure"];
const ROLE_WARES: Record<string, string> = { bartender: "bar", mechanic: "tech", medic: "medical", dockmaster: "spacer", fence: "black", smuggler: "black" };
// What someone sells, if anything
export const waresOf = (o: Pick<Occupant, "role" | "trade" | "disposition">): Wares | undefined =>
  o.disposition === "hostile" ? undefined : WARES[o.trade ?? ROLE_WARES[o.role] ?? (o.role === "merchant" ? "general" : "")];

// The law level at which the law seizes an item (house rule; the books give no list):
// spice and lightweapons anywhere there is law, explosives, poisons, slicing gear and exotic weapons where it is
// policed, military blasters and heavy armor where it is strict. Infinity: legal everywhere.
export function contrabandFrom(item: Pick<Sw5eEquipment, "name" | "equipmentCategory" | "weaponClassification" | "armorClassification">): number {
  // Lightsabers are not sold over a counter in any era
  if (item.equipmentCategory === "Spice" || /Lightweapon$/.test(item.weaponClassification ?? "")) return 1;
  if (item.equipmentCategory === "Explosive" || /poison|computer spike|security spike|comm jammer|holotrace|slicer|spicer|forgery|clandestine|restraining bolt/i.test(item.name)) return 2;
  if (/^Exotic/.test(item.weaponClassification ?? "")) return 2;
  if (/^Martial/.test(item.weaponClassification ?? "") || item.armorClassification === "Heavy") return 3;
  return Infinity;
}
export const isContraband = (item: Parameters<typeof contrabandFrom>[0], law: number) => law >= contrabandFrom(item);

// The party's dealings, as kept in the campaign
export interface Standing {
  // Renown with each faction, -10 to 10 (Wretched Hives: renown is earned by acting for a faction)
  renown: Record<string, number>;
  // Dealings with each trader, by occupant id
  dealings: Record<string, number>;
}
export interface Ledger {
  day: number;
  // Per trader: what the party bought and sold today, and whether a haggle was tried (and how it went)
  traders: Record<string, { bought: Record<string, number>; sold: Record<string, number>; haggle?: "won" | "lost" | "tried" }>;
}
export const emptyLedger = (day: number): Ledger => ({ day, traders: {} });
export const ledgerFor = (ledger: Ledger | undefined | null, day: number): Ledger => (ledger && ledger.day === day ? ledger : emptyLedger(day));

// Who the party is, as a trader sees them
export interface Customer {
  species?: string;
  homeworld?: string;
  alignment?: string;
  standing: Standing;
}

// Which way a faction leans, for how it takes to a character's alignment
const DARK_FACTIONS = /empire|sith|first order|remnant|black sun|hutt|separatist|trade federation/i;
const LIGHT_FACTIONS = /republic|rebel|resistance|jedi/i;

// The faction that holds the place a trader works in
export function factionAt(world: World, areaId: string): string | undefined {
  for (const area of [...trailOf(world, areaId)].reverse()) if (area.faction) return area.faction;
  return undefined;
}

// How a trader takes to the party, -4 to 4, and why
export function attitudeOf(world: World, trader: Occupant, placeId: string, customer: Customer): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (n: number, why: string) => {
    if (!n) return;
    score += n;
    reasons.push(`${why} (${n > 0 ? "+" : ""}${n})`);
  };
  const faction = factionAt(world, placeId);
  // The campaign's enemy starts with some bad blood; its people are not all its soldiers
  const renown = faction ? customer.standing.renown[faction] ?? (faction === world.antagonist ? -3 : 0) : 0;
  if (faction) add(Math.max(-2, Math.min(2, Math.trunc(renown / 3))), `${renown >= 0 ? "standing" : "bad blood"} with ${faction}`);
  const species = (customer.species ?? "").toLowerCase();
  if (species && (trader.species ?? "").toLowerCase() === species) add(1, `a fellow ${trader.species}`);
  const planet = ancestor(world, placeId, "planet");
  if (planet && species && (planet.tags.includes(`species:${customer.species}`) || (customer.homeworld && planet.name.toLowerCase() === customer.homeworld.toLowerCase()))) add(1, "one of the locals' own people");
  const light = /light/i.test(customer.alignment ?? "");
  const dark = /dark/i.test(customer.alignment ?? "");
  if (faction && (light || dark) && (DARK_FACTIONS.test(faction) || LIGHT_FACTIONS.test(faction))) add(DARK_FACTIONS.test(faction) === dark ? 1 : -1, `${faction} ${DARK_FACTIONS.test(faction) === dark ? "likes" : "distrusts"} your kind`);
  const black = waresOf(trader)?.black;
  if (black && /chaotic/i.test(customer.alignment ?? "")) add(1, "you look like you can keep quiet");
  if (black && /lawful/i.test(customer.alignment ?? "")) add(-1, "you look like trouble with the law");
  const dealt = customer.standing.dealings[trader.id] ?? 0;
  if (dealt >= 3) add(dealt >= 10 ? 2 : 1, dealt >= 10 ? "a regular" : "a familiar face");
  return { score: Math.max(-4, Math.min(4, score)), reasons };
}
export const ATTITUDES = ["hostile", "cold", "wary", "cool", "neutral", "warm", "friendly", "generous", "devoted"];
export const attitudeName = (score: number) => ATTITUDES[score + 4];

// What a planet's people need more of, by equipment category
const DEMAND: Record<string, Record<string, number>> = {
  desert: { LifeSupport: 1.3, AlcoholicBeverage: 1.15, Storage: 1.1 },
  ice: { LifeSupport: 1.3, Clothing: 1.25 },
  volcanic: { LifeSupport: 1.35, Medical: 1.1 },
  jungle: { Medical: 1.25, LifeSupport: 1.1 },
  swamp: { Medical: 1.25, LifeSupport: 1.1 },
  ocean: { LifeSupport: 1.2 },
  barren: { LifeSupport: 1.25, AlcoholicBeverage: 1.1 },
  urban: { Communications: 0.85, DataRecordingAndStorage: 0.85, Clothing: 0.9 },
  forest: { Tool: 0.9 },
  temperate: {},
  "gas giant": { LifeSupport: 1.3 },
};
const REGION_PRICE: Record<string, number> = { "Deep Core": 1, Core: 0.92, Colonies: 0.95, "Inner Rim": 1, "Expansion Region": 1.05, "Mid Rim": 1.08, "Outer Rim": 1.15, "Wild Space": 1.3, "Unknown Regions": 1.35 };
const SETTLEMENT_PRICE: Record<string, number> = { city: 0.95, town: 1, station: 1.05, outpost: 1.1, village: 1.1 };
// The most a trader keeps in stock per item, by the kind of settlement
const SETTLEMENT_CAP: Record<string, number> = { city: Infinity, station: 10000, town: 4000, outpost: 1500, village: 1200 };

const hashOf = (text: string) => Array.from(text).reduce((n, ch) => (Math.imul(n, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;

// Everything about where a trader works that moves prices, with the reasons shown to the player
export function marketAt(world: World, placeId: string) {
  const region = ancestor(world, placeId, "region");
  const planet = ancestor(world, placeId, "planet");
  const settlement = ancestor(world, placeId, "settlement");
  const regionFactor = REGION_PRICE[region?.type ?? region?.name ?? ""] ?? 1.1;
  const settlementFactor = settlement ? SETTLEMENT_PRICE[settlement.type] ?? 1.1 : 1.2;
  const demand = DEMAND[planet?.type ?? ""] ?? {};
  const notes: string[] = [];
  if (regionFactor !== 1) notes.push(`${region?.name ?? "this region"} ${regionFactor > 1 ? "+" : ""}${Math.round((regionFactor - 1) * 100)}%`);
  if (settlementFactor !== 1) notes.push(`${settlement?.type ?? "the wilds"} ${settlementFactor > 1 ? "+" : ""}${Math.round((settlementFactor - 1) * 100)}%`);
  const wanted = Object.entries(demand).filter(([, f]) => f > 1).map(([c]) => c.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const cheap = Object.entries(demand).filter(([, f]) => f < 1).map(([c]) => c.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  if (wanted.length) notes.push(`${planet?.type} world: ${wanted.join(", ")} in demand`);
  if (cheap.length) notes.push(`${cheap.join(", ")} plentiful`);
  return { law: lawAt(world, placeId), planet, settlement, regionFactor, settlementFactor, demand, cap: settlement ? SETTLEMENT_CAP[settlement.type] ?? 2000 : 800, notes };
}

export interface TradeLine {
  name: string;
  category: string;
  cost: number;
  quantity: number;
  price: number;
  contraband: boolean;
  description?: string;
}

// What a trader has for sale today, at today's prices for this customer
export function stockOf(world: World, trader: Occupant, placeId: string, equipment: Sw5eEquipment[], day: number, customer: Customer, ledger?: Ledger): TradeLine[] {
  const wares = waresOf(trader);
  if (!wares) return [];
  const market = marketAt(world, placeId);
  const r = createRandom(hashOf(trader.id) + day * 7919);
  const categories = market.law === 0 && !wares.black && trader.role === "merchant" ? [...wares.categories, "Spice", "Explosive"] : wares.categories;
  const pool = equipment.filter((e) => categories.includes(e.equipmentCategory) && e.cost > 0 && e.cost <= market.cap && (wares.black ? contrabandFrom(e) <= 3 : !isContraband(e, market.law)));
  const picked = r.shuffle(pool).slice(0, r.int(wares.lines[0], wares.lines[1]));
  const today = ledgerFor(ledger, day).traders[trader.id];
  // What the party sold here today is for sale again
  const resold = Object.entries(today?.sold ?? {}).map(([name]) => equipment.find((e) => e.name === name)).filter((e): e is Sw5eEquipment => !!e && !picked.includes(e));
  return [...picked, ...resold]
    .map((item) => {
      const quantity = (picked.includes(item) ? r.int(wares.each[0], wares.each[1]) : 0) + (today?.sold?.[item.name] ?? 0) - (today?.bought?.[item.name] ?? 0);
      return { item, quantity };
    })
    .filter(({ quantity }) => quantity > 0)
    .map(({ item, quantity }) => ({
      name: item.name,
      category: item.equipmentCategory,
      cost: item.cost,
      quantity,
      price: priceOf(world, trader, placeId, item, day, customer, ledger, quantity),
      contraband: isContraband(item, market.law),
      description: (item as any).description,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.price - b.price);
}

// Shared by buying and selling: where, when, and what the item is
function marketFactor(world: World, placeId: string, item: Sw5eEquipment, day: number): number {
  const market = marketAt(world, placeId);
  const text = String((item as any).description ?? "");
  const local = market.planet && text.includes(market.planet.name) ? 0.6 : 1;
  const drift = 0.9 + (hashOf(`${item.name}:${day}:${market.settlement?.id ?? placeId}`) % 21) / 100;
  return market.regionFactor * market.settlementFactor * (market.demand[item.equipmentCategory] ?? 1) * local * drift;
}

// What a trader asks for one more of an item
export function priceOf(world: World, trader: Occupant, placeId: string, item: Sw5eEquipment, day: number, customer: Customer, ledger?: Ledger, inStock = 2): number {
  const law = lawAt(world, placeId);
  const today = ledgerFor(ledger, day).traders[trader.id];
  const attitude = attitudeOf(world, trader, placeId, customer).score;
  const risk = waresOf(trader)?.black && isContraband(item, law) ? 1 + 0.6 * law : 1;
  const pressure = 1 + 0.05 * (today?.bought?.[item.name] ?? 0);
  const scarce = inStock <= 1 ? 1.15 : 1;
  const haggle = today?.haggle === "won" ? 0.9 : today?.haggle === "lost" ? 1.05 : 1;
  return Math.max(1, Math.round(item.cost * marketFactor(world, placeId, item, day) * risk * pressure * scarce * haggle * (1 - 0.05 * attitude)));
}

// What a trader offers for one of an item the party carries; 0 if they will not buy it
export function offerFor(world: World, trader: Occupant, placeId: string, item: Sw5eEquipment, day: number, customer: Customer, ledger?: Ledger): number {
  const wares = waresOf(trader);
  if (!wares || item.cost <= 0) return 0;
  const law = lawAt(world, placeId);
  const contraband = isContraband(item, law);
  if (!wares.black && (contraband || !wares.categories.includes(item.equipmentCategory))) return 0;
  const today = ledgerFor(ledger, day).traders[trader.id];
  const attitude = attitudeOf(world, trader, placeId, customer).score;
  const share = wares.black ? (contrabandFrom(item) <= 3 ? 0.8 : 0.3) : 0.5;
  const glut = Math.max(0.2, 1 - 0.1 * (today?.sold?.[item.name] ?? 0));
  const haggle = today?.haggle === "won" ? 1.1 : today?.haggle === "lost" ? 0.95 : 1;
  return Math.max(1, Math.round(item.cost * share * marketFactor(world, placeId, item, day) * glut * haggle * (1 + 0.05 * attitude)));
}

// The DC to haggle with a trader (house rule): 12, +2 for the black market, -1 for each step of goodwill
export const haggleDC = (trader: Occupant, attitude: number) => 12 + (waresOf(trader)?.black ? 2 : 0) - attitude;

// Renown changes, as kept in the campaign's standing (Wretched Hives: acting for a faction earns
// renown; acting against it costs it)
export function addRenown(standing: Standing, faction: string | undefined, amount: number): Standing {
  if (!faction || !amount) return standing;
  const now = standing.renown[faction] ?? 0;
  return { ...standing, renown: { ...standing.renown, [faction]: Math.max(-10, Math.min(10, now + amount)) } };
}
export const emptyStanding = (): Standing => ({ renown: {}, dealings: {} });

// When a trader is at work (house rule): by the kind of building. Hours past midnight run on.
const OPENING: Record<string, [number, number]> = {
  cantina: [10, 28], promenade: [8, 24], market: [7, 19], workshop: [8, 18], engineering: [0, 24], medcenter: [0, 24],
  spaceport: [0, 24], "landing field": [0, 24], "landing pad": [0, 24], "docking ring": [0, 24], archive: [9, 17], palace: [9, 17],
  warehouse: [6, 18], "cargo bay": [0, 24],
};
export function openingHours(world: World, trader: Occupant, placeId: string): [number, number] {
  const building = ancestor(world, placeId, "building");
  // The black market keeps the night
  if (waresOf(trader)?.black) return [18, 28];
  return OPENING[building?.type ?? ""] ?? [8, 20];
}
export function isOpen(world: World, trader: Occupant, placeId: string, minutes: number): boolean {
  const [from, to] = openingHours(world, trader, placeId);
  const h = hourOf(minutes);
  return to - from >= 24 || (h >= from && h < to) || (to > 24 && h < to - 24);
}

// ---------------------------------------------------------------------------------------------
// Routines. The people of a settlement have homes and days: staff keep their counters in the
// building's hours, patrons work by day and drink in the evening, shoppers do the rounds of the
// market, musicians play the night, the fence keeps the back room after dark, and now and then
// someone takes a speeder to another settlement for the day. Ship owners fly voyages between
// ports, and are about only while their ship is in. Where someone is, is worked out from the
// clock (whereAt, shipAt), not stored: the world keeps each person once, in the room they belong
// to, with their routine, and withPresence shows the world as it is at a given minute.
// Setting, not rules (the books give no daily routines).
// ---------------------------------------------------------------------------------------------

// A stop in a day: the area, and the hours (`to` may run past 24 into the next morning)
export interface Stop {
  at: string;
  from: number;
  to: number;
}
export interface Routine {
  home: string;
  stops: Stop[];
  // Every `every` days the day is spent elsewhere: out at 07:00, back by 21:00, `trip` hours each way
  outing?: { at: string; every: number; phase: number; trip: number };
}
export interface Voyage {
  // Area ids: the ship's own berth first, then the ports it calls at (berth rooms, or settlements,
  // planets and systems that nobody has mapped yet)
  ports: string[];
  // Hours in each port, minutes on each leg (from port i to the next), and where in the cycle day 1 starts
  stay: number;
  legs: number[];
  phase: number;
}
// Someone or something on the way between two places
export interface Mover {
  kind: "person" | "ship";
  id: string;
  name: string;
  from: string;
  to: string;
  progress: number;
  occupant?: Occupant;
  ship?: Ship;
}

// Minutes spent on the street between two places in a settlement
export const TRANSIT = 15;

const coversHour = (stop: Stop, h: number) => (h >= stop.from && h < stop.to) || (stop.to > 24 && h < stop.to - 24);

// Where someone with a routine is at a minute: an area, or on the way between two
export function whereAt(o: Occupant, baseId: string, minutes: number): { at: string | null; moving?: { from: string; to: string; progress: number } } {
  const r = o.routine;
  if (!r) return { at: baseId };
  const day = Math.floor(minutes / DAY);
  const h = (minutes - day * DAY) / 60;
  const out = r.outing;
  if (out && (day + out.phase) % out.every === 0) {
    const arrive = 7 + out.trip;
    const leave = 21 - out.trip;
    if (h >= 7 && h < arrive) return { at: null, moving: { from: r.home, to: out.at, progress: (h - 7) / out.trip } };
    if (h >= arrive && h < leave) return { at: out.at };
    if (h >= leave && h < 21) return { at: null, moving: { from: out.at, to: r.home, progress: (h - leave) / out.trip } };
    return { at: r.home };
  }
  const now = r.stops.find((s) => coversHour(s, h));
  // Within TRANSIT minutes before a stop begins: on the way to it
  const next = r.stops.find((s) => s !== now && ((s.from - h + 24) % 24) * 60 < TRANSIT && (s.from - h + 24) % 24 > 0);
  if (next) {
    const from = now?.at ?? r.home;
    if (from !== next.at) return { at: null, moving: { from, to: next.at, progress: 1 - (((next.from - h + 24) % 24) * 60) / TRANSIT } };
  }
  // Within TRANSIT minutes after a stop ends with nothing after it: on the way home
  if (!now) {
    const ended = r.stops.find((s) => (((h - (s.to % 24)) + 24) % 24) * 60 < TRANSIT);
    if (ended && ended.at !== r.home) return { at: null, moving: { from: ended.at, to: r.home, progress: ((((h - (ended.to % 24)) + 24) % 24) * 60) / TRANSIT } };
  }
  return { at: now?.at ?? r.home };
}

// Where a ship on a voyage is at a minute: in a port, or on the way between two
export function shipAt(ship: Ship, baseId: string, minutes: number): { at: string | null; moving?: { from: string; to: string; progress: number } } {
  const v = ship.voyage;
  if (!v || !v.ports.length) return { at: baseId };
  const stay = v.stay * 60;
  const cycle = v.legs.reduce((a, b) => a + b, 0) + stay * v.ports.length;
  let t = (((minutes + v.phase) % cycle) + cycle) % cycle;
  for (let i = 0; i < v.ports.length; i++) {
    if (t < stay) return { at: v.ports[i] };
    t -= stay;
    if (t < v.legs[i]) return { at: null, moving: { from: v.ports[i], to: v.ports[(i + 1) % v.ports.length], progress: t / v.legs[i] } };
    t -= v.legs[i];
  }
  return { at: baseId };
}

// Everyone and every ship with a routine or a voyage, and where they belong (cached per world)
const presenceIndexes = new WeakMap<World, { people: { o: Occupant; base: string }[]; ships: Map<string, { s: Ship; base: string }> }>();
function presenceIndex(world: World) {
  let index = presenceIndexes.get(world);
  if (index) return index;
  index = { people: [], ships: new Map() };
  for (const area of Object.values(world.areas)) {
    for (const o of area.occupants) if (o.routine || o.ship) index.people.push({ o, base: area.id });
    for (const s of area.ships) if (s.voyage) index.ships.set(s.id, { s, base: area.id });
  }
  presenceIndexes.set(world, index);
  return index;
}

// The world as it is at a minute: people and ships where their routines and voyages put them,
// and `moving` for those on the way. For showing only: edits go to the world itself.
export function withPresence(world: World, minutes: number): World & { moving: Mover[] } {
  const index = presenceIndex(world);
  const leave = new Map<string, Set<string>>();
  const arrive = new Map<string, { occupants: Occupant[]; ships: Ship[] }>();
  const moving: Mover[] = [];
  const away = (base: string, id: string) => (leave.get(base) ?? leave.set(base, new Set()).get(base)!).add(id);
  const into = (at: string) => arrive.get(at) ?? arrive.set(at, { occupants: [], ships: [] }).get(at)!;
  const shipPlace = new Map<string, ReturnType<typeof shipAt>>();
  for (const [id, { s, base }] of index.ships) {
    const where = shipAt(s, base, minutes);
    shipPlace.set(id, where);
    if (where.at === base) continue;
    away(base, id);
    if (where.at && world.areas[where.at]) into(where.at).ships.push(s);
    if (where.moving) moving.push({ kind: "ship", id, name: s.name, ...where.moving, ship: s });
  }
  for (const { o, base } of index.people) {
    // Someone whose ship is away is on board
    const aboard = o.ship ? shipPlace.get(o.ship) : undefined;
    if (aboard && aboard.at !== (o.ship ? index.ships.get(o.ship)?.base : undefined)) {
      away(base, o.id);
      continue;
    }
    const where = whereAt(o, base, minutes);
    if (where.at === base) continue;
    away(base, o.id);
    if (where.at && world.areas[where.at]) into(where.at).occupants.push(o);
    if (where.moving) moving.push({ kind: "person", id: o.id, name: o.name, ...where.moving, occupant: o });
  }
  const areas = { ...world.areas };
  for (const id of new Set([...leave.keys(), ...arrive.keys()])) {
    const area = world.areas[id];
    if (!area) continue;
    const gone = leave.get(id);
    const come = arrive.get(id);
    areas[id] = {
      ...area,
      occupants: [...area.occupants.filter((o) => !gone?.has(o.id)), ...(come?.occupants ?? [])],
      ships: [...area.ships.filter((s) => !gone?.has(s.id)), ...(come?.ships ?? [])],
    };
  }
  return { ...world, areas, moving };
}

// Minutes from one area to another along the paths of the world (findPath)
function routeMinutes(world: World, from: string, to: string, hyperdriveClass = 1): number {
  const steps = findPath(world, from, to);
  if (!steps) return 0;
  let total = 0;
  for (let i = 1; i < steps.length; i++) {
    const exit = exitsOf(world, steps[i - 1]).find((e) => e.to === steps[i]);
    total += exit ? tripMinutes(exit, hyperdriveClass) : 1;
  }
  return total;
}

// Who keeps what hours, by role (hours of the day; past 24 runs into the next morning)
const NIGHT_OWLS = ["musician", "fence"];
const PORT_TYPES = ["spaceport", "landing field", "landing pad", "docking ring"];

// Homes, days and voyages for the people and ships of a settlement that has been built. Anyone
// who already has a routine keeps it. The same settlement and seed give the same days.
function settleRoutines(world: World, settlement: Area, r: Random) {
  const buildings = childrenOf(world, settlement.id).filter((b) => b.kind === "building");
  const rooms = buildings.flatMap((b) => childrenOf(world, b.id).filter((a) => a.kind === "room").map((room) => ({ room, building: b })));
  if (!rooms.length) return;
  const friendly = rooms.filter(({ building }) => !BUILDINGS[building.type]?.hostile);
  // Each apartment houses a few; everyone else lives somewhere in the settlement off the map
  const homes = friendly.filter(({ room }) => /apartment|quarters/i.test(room.name)).map(({ room }) => ({ id: room.id, room: 4 }));
  const homeFor = () => {
    const free = homes.filter((h) => h.room > 0);
    if (!free.length || r.chance(0.5)) return settlement.id;
    const home = r.pick(free);
    home.room--;
    return home.id;
  };
  const cantinas = friendly.filter(({ room, building }) => /main bar|^cantina$/i.test(room.name) && ["cantina", "promenade"].includes(building.type)).map(({ room }) => room.id);
  const markets = friendly.filter(({ room }) => /stall|trade/i.test(room.name)).map(({ room }) => room.id);
  const workplaces = friendly.filter(({ room, building }) => !/apartment|quarters|lobby|rooftop|basement|cellar|vault|back room|booth|main bar|^cantina$/i.test(room.name) && building.type !== "residences").map(({ room }) => room.id);
  const elsewhere = childrenOf(world, settlement.parentId ?? "").filter((s) => s.kind === "settlement" && s.id !== settlement.id && ["city", "town", "outpost", "village", "station"].includes(s.type));
  const hours = (building: Area): [number, number] => OPENING[building.type] ?? [8, 20];
  const around = (h: number, spread = 1) => Math.round((h + (r.next() * 2 - 1) * spread) * 4) / 4;

  for (const { room, building } of friendly) {
    for (const o of room.occupants) {
      if (o.routine || o.statBlock || o.count !== 1 || o.disposition === "hostile" || o.role === "guard") continue;
      const home = /apartment|quarters/i.test(room.name) ? room.id : homeFor();
      const stops: Stop[] = [];
      const pub = cantinas.length ? r.pick(cantinas) : undefined;
      if (o.role === "musician") stops.push({ at: room.id, from: around(17, 0.5), to: around(27, 0.5) });
      else if (o.role === "fence") stops.push({ at: room.id, from: around(18, 0.5), to: 28 });
      else if (["patron", "smuggler", "gambler", "informant", "bounty hunter", "pilot for hire"].includes(o.role)) {
        if (r.chance(0.25)) stops.push({ at: room.id, from: around(12, 1), to: around(23, 1) });
        else {
          if (workplaces.length && r.chance(0.8)) stops.push({ at: r.pick(workplaces), from: around(8, 0.5), to: around(16.5, 0.5) });
          stops.push({ at: room.id, from: around(18.5, 1), to: around(24, 1.5) });
        }
      } else if (o.role === "shopper") {
        stops.push({ at: room.id, from: around(9.5, 1), to: around(12, 0.5) }, { at: markets.length ? r.pick(markets) : room.id, from: around(15, 0.5), to: around(17.5, 0.5) });
        if (pub && r.chance(0.4)) stops.push({ at: pub, from: around(19.5, 0.5), to: around(22, 0.5) });
      } else if (o.role === "resident") {
        if (workplaces.length && r.chance(0.6)) stops.push({ at: r.pick(workplaces), from: around(8, 0.5), to: around(17, 0.5) });
        if (pub && r.chance(0.35)) stops.push({ at: pub, from: around(19.5, 0.5), to: around(22.5, 0.5) });
      } else if (["traveller", "reader", "petitioner", "local"].includes(o.role)) {
        stops.push({ at: room.id, from: around(9, 1), to: around(16, 1) });
        if (pub && r.chance(0.4)) stops.push({ at: pub, from: around(19, 0.5), to: around(22, 0.5) });
      } else if (o.role !== "patient" && o.role !== "service droid") {
        // Staff: the building's hours; where it never closes, a long day shift
        const [from, to] = hours(building);
        stops.push(to - from >= 24 ? { at: room.id, from: 6, to: 22 } : { at: room.id, from, to });
      } else continue;
      const routine: Routine = { home, stops };
      // Now and then a day out in another settlement of the planet, by speeder
      if (elsewhere.length && !NIGHT_OWLS.includes(o.role) && r.chance(0.15)) {
        const there = r.pick(elsewhere);
        const trip = routeMinutes(world, settlement.id, there.id) / 60;
        if (trip > 0 && trip <= 6) routine.outing = { at: there.id, every: r.int(4, 7), phase: r.int(0, 6), trip: Math.max(0.5, Math.round(trip * 4) / 4) };
      }
      o.routine = routine;
    }
  }

  // Voyages: a ship in a port here is flown by a pilot for hire, smuggler or bounty hunter of the
  // settlement (its owner, or one who has no ship yet); it flies between ports and comes back,
  // and its pilot is about only while it is in
  const planet = ancestor(world, settlement.id, "planet");
  const system = ancestor(world, settlement.id, "system");
  const flyers = rooms.flatMap(({ room }) => room.occupants).filter((o) => ["pilot for hire", "smuggler", "bounty hunter"].includes(o.role) && !o.statBlock);
  for (const { room, building } of friendly) {
    if (!PORT_TYPES.includes(building.type)) continue;
    for (const ship of room.ships) {
      if (ship.voyage) continue;
      const owner = flyers.find((o) => o.name === ship.owner) ?? flyers.find((o) => !o.ship);
      if (!owner) continue;
      ship.owner = owner.name;
      const ports = [
        ...elsewhere.map((s) => s.id),
        ...childrenOf(world, system?.id ?? "").filter((p) => p.kind === "planet" && p.id !== planet?.id).map((p) => p.id),
        ...(ship.hyperdriveClass ? exitsOf(world, system?.id ?? "").filter((e) => e.jump).map((e) => e.to) : []),
      ];
      if (!ports.length) continue;
      const calls = [room.id, ...r.shuffle(ports).slice(0, r.int(1, Math.min(3, ports.length)))];
      const legs = calls.map((from, i) => Math.max(60, routeMinutes(world, from, calls[(i + 1) % calls.length], Number(ship.hyperdriveClass) || 1)));
      ship.voyage = { ports: calls, stay: r.int(12, 36), legs, phase: r.int(0, 3 * DAY) };
      owner.ship = ship.id;
    }
  }
}

const ENTER: Partial<Record<AreaKind, string>> = { system: "Fly in to", planet: "Land at", settlement: "Go to", building: "Enter" };
const LEAVE: Partial<Record<AreaKind, string>> = { planet: "Fly out to the jump point of", settlement: "Take off to the orbit of", building: "Leave for the outskirts of", room: "Step outside" };

// Everywhere one move can take you from an area: along its paths, in through a gateway, or out
export function exitsOf(world: World, id: string): Exit[] {
  const area = world.areas[id];
  if (!area) return [];
  const exits: Exit[] = [];
  for (const path of indexOf(world).paths.get(id) ?? []) {
    const to = path.from === id ? path.to : path.from;
    exits.push({ to, via: "path", label: path.label, travel: path.travel, pathId: path.id, locked: path.locked, hidden: path.hidden, ...(path.kind === "hyperlane" || path.kind === "sublight" ? { needsShip: true, fuel: tripFuel(path.kind, path.travel), jump: path.kind === "hyperlane" || undefined } : {}) });
  }
  for (const child of childrenOf(world, id)) {
    if (child.gateway && ENTER[area.kind]) exits.push({ to: child.id, via: "enter", label: ENTER[area.kind]!, travel: "", ...(area.kind === "system" || area.kind === "planet" ? { needsShip: true, fuel: tripFuel("surface") } : {}) });
  }
  for (const child of childrenOf(world, id)) {
    if (child.secretEntry) exits.push({ to: child.id, via: "enter", label: `Slip in through the ${child.secretEntry.name.toLowerCase()} to`, travel: "", secret: true, hidden: !child.secretEntry.found || undefined });
  }
  const parent = area.parentId ? world.areas[area.parentId] : undefined;
  if (area.secretEntry && parent) {
    exits.push({ to: parent.id, via: "leave", label: `Slip out through the ${area.secretEntry.name.toLowerCase()} to`, travel: "", secret: true, hidden: !area.secretEntry.found || undefined });
  }
  if (area.gateway && parent && LEAVE[area.kind]) {
    exits.push({ to: parent.id, via: "leave", label: LEAVE[area.kind]!, travel: "", ...(area.kind === "planet" || area.kind === "settlement" ? { needsShip: true, fuel: tripFuel("surface") } : {}) });
  }
  return exits;
}

// ---------------------------------------------------------------------------------------------
// The party's ships (saved in the campaign's `starships`). A ship stands at a berth: the settlement
// it landed at, a planet's orbit or a system's jump point. Every trip that needs a ship burns fuel.
// ---------------------------------------------------------------------------------------------

export interface PartyShip extends Ship {
  fuel: number;
  // The berth it stands at
  areaId: string;
}

// Where a ship kept somewhere in an area takes off from
export function berthOf(world: World, areaId: string): string {
  const trail = trailOf(world, areaId);
  for (let i = trail.length - 1; i >= 0; i--) if (["settlement", "planet", "system"].includes(trail[i].kind)) return trail[i].id;
  return areaId;
}

// A port sells fuel: a starport settlement, or one with somewhere for ships to put down
export function hasPort(world: World, areaId: string): boolean {
  const area = world.areas[areaId];
  if (!area || area.kind !== "settlement") return false;
  return area.tags.includes("starport") || childrenOf(world, areaId).some((b) => /spaceport|landing|docking/i.test(b.type));
}

// The party's ship that can make a trip from here, or what stops them
export function shipForTrip(ships: PartyShip[] | undefined, hereId: string, exit: Exit): { ship?: PartyShip; reason: string } {
  const berthed = (ships ?? []).filter((ship) => ship.areaId === hereId);
  if (!berthed.length) return { reason: ships?.length ? "your ship is berthed elsewhere" : "you have no ship" };
  const fitted = berthed.filter((ship) => !exit.jump || !!ship.hyperdriveClass);
  if (!fitted.length) return { reason: "your ship has no hyperdrive" };
  const ship = fitted.find((candidate) => candidate.fuel >= (exit.fuel ?? 0));
  return ship ? { ship, reason: "" } : { reason: "your ship is out of fuel" };
}

// House rule: the rules data has no price for a seat on someone else's ship. A fare is the fuel the
// trip burns at the price a Medium ship pays for it; the shuttle between surface and orbit is free.
export function passageFare(exit: Exit, fuelCost: number): number {
  return exit.via === "path" ? (exit.fuel ?? 1) * fuelCost : 0;
}

// ---------------------------------------------------------------------------------------------
// Quests the world can keep score of. Each objective names what completes it:
// defeat (no hostile creatures left in the area), loot (the cache there is emptied) or reach.
// ---------------------------------------------------------------------------------------------

export interface QuestTarget {
  kind: "defeat" | "loot" | "reach";
  areaId: string;
  cacheId?: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "inactive" | "active" | "completed";
  objectives: { description: string; completed: boolean; target?: QuestTarget }[];
  reward?: { credits: number; items: string[]; experience: number };
}

const isHeld = (area: Area) => area.occupants.some((o) => o.disposition === "hostile" && !!o.hitPoints);
const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "");

// Three quests read off a freshly generated world: clear the most dangerous hostile site on the
// starting planet, recover a locked or hidden cache, and reach the nearest other planet.
// `earnings` is what the party should earn over a level (Wealth by Level); rewards are shares of it.
export function worldQuests(world: World, earnings = 0): Quest[] {
  const planetOf = (id: string) => trailOf(world, id).find((a) => a.kind === "planet");
  const home = planetOf(world.startId);
  if (!home) return [];
  const local = Object.values(world.areas).filter((a) => a.id !== world.startId && planetOf(a.id)?.id === home.id);
  const siteOf = (area: Area) => trailOf(world, area.id).find((a) => a.kind === "building") ?? area;
  const pay = (share: number) => ({ credits: Math.max(50, Math.round((earnings * share) / 10) * 10), items: [], experience: 0 });
  const quests: Quest[] = [];

  const held = local.filter(isHeld);
  const sites = Array.from(new Set(held.map((a) => siteOf(a).id))).map((id) => world.areas[id]);
  const worst = sites.sort((a, b) => b.danger - a.danger || a.id.localeCompare(b.id))[0];
  if (worst) {
    const rooms = held.filter((a) => siteOf(a).id === worst.id).slice(0, 4);
    quests.push({
      id: "q-clear",
      title: `Clear ${worst.name}`,
      description: `${worst.name} on ${home.name} is in hostile hands. Deal with whoever holds it.`,
      status: "active",
      objectives: rooms.map((room) => ({
        description: `Defeat the ${listNames(room.occupants.filter((o) => o.disposition === "hostile").map((o) => o.name))} at ${room.name}`,
        completed: false,
        target: { kind: "defeat" as const, areaId: room.id },
      })),
      reward: pay(0.2),
    });
  }

  const guarded = local
    .flatMap((area) => area.loot.filter((c) => !c.looted && (c.locked || c.hidden)).map((cache) => ({ area, cache })))
    .sort((a, b) => Number(siteOf(a.area).id === worst?.id) - Number(siteOf(b.area).id === worst?.id) || b.cache.credits - a.cache.credits)[0];
  if (guarded) {
    const site = siteOf(guarded.area);
    quests.push({
      id: "q-recover",
      title: `Recover the ${guarded.cache.name.toLowerCase()} from ${site.name}`,
      description: `Something worth having is kept out of sight at ${site.name}. Find it and take it.`,
      status: "active",
      objectives: [
        { description: `Reach ${guarded.area.name}`, completed: false, target: { kind: "reach", areaId: guarded.area.id } },
        { description: `Take what is in the ${guarded.cache.name.toLowerCase()}`, completed: false, target: { kind: "loot", areaId: guarded.area.id, cacheId: guarded.cache.id } },
      ],
      reward: pay(0.1),
    });
  }

  // The nearest other planet by number of moves
  const others = Object.values(world.areas).filter((a) => a.kind === "planet" && a.id !== home.id);
  const near = others
    .map((planet) => ({ planet, steps: findPath(world, world.startId, planet.id)?.length ?? Infinity }))
    .sort((a, b) => a.steps - b.steps || a.planet.id.localeCompare(b.planet.id))[0];
  if (near && Number.isFinite(near.steps)) {
    quests.push({
      id: "q-voyage",
      title: `Make the crossing to ${near.planet.name}`,
      description: `Word of the ${world.antagonist} has to reach ${near.planet.name}. Get there by ship or by paid passage.`,
      status: "active",
      objectives: [{ description: `Arrive in orbit of ${near.planet.name}`, completed: false, target: { kind: "reach", areaId: near.planet.id } }],
      reward: pay(0.1),
    });
  }
  return quests;
}

function targetMet(world: World, target: QuestTarget, hereId: string): boolean {
  const area = world.areas[target.areaId];
  if (!area) return true;
  if (target.kind === "defeat") return !isHeld(area);
  if (target.kind === "loot") return area.loot.filter((c) => !target.cacheId || c.id === target.cacheId).every((c) => c.looted);
  return trailOf(world, hereId).some((a) => a.id === area.id);
}

// Tick off the objectives the world now satisfies. `finished` lists the quests this completed.
export function advanceQuests(world: World, quests: Quest[], hereId: string): { quests: Quest[]; finished: Quest[]; changed: boolean } {
  const finished: Quest[] = [];
  let changed = false;
  const next = (quests ?? []).map((quest) => {
    if (quest.status !== "active" || !Array.isArray(quest.objectives)) return quest;
    const objectives = quest.objectives.map((o) => (o.completed || !o.target ? o : { ...o, completed: targetMet(world, o.target, hereId) }));
    const done = objectives.length > 0 && objectives.every((o) => o.completed);
    if (!done && !objectives.some((o, i) => o.completed !== quest.objectives[i].completed)) return quest;
    changed = true;
    if (done) finished.push(quest);
    return { ...quest, objectives, status: done ? ("completed" as const) : quest.status };
  });
  return { quests: next, finished, changed };
}

// Shortest route between two areas, as the list of areas passed through (both ends included)
export function findPath(world: World, fromId: string, toId: string): string[] | null {
  if (!world.areas[fromId] || !world.areas[toId]) return null;
  const previous = new Map<string, string | null>([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === toId) {
      const route: string[] = [];
      for (let at: string | null = toId; at; at = previous.get(at) ?? null) route.unshift(at);
      return route;
    }
    for (const exit of exitsOf(world, current)) {
      if (!previous.has(exit.to)) {
        previous.set(exit.to, current);
        queue.push(exit.to);
      }
    }
  }
  return null;
}

function reachableFrom(world: World, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    for (const exit of exitsOf(world, queue.shift()!)) {
      if (!seen.has(exit.to)) {
        seen.add(exit.to);
        queue.push(exit.to);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

// Everything that is wrong with a world; an empty list means it is sound. With a catalog, every
// stat block and item named in the world must exist in the rules data.
export function validateWorld(world: World, catalog?: WorldCatalog): string[] {
  const problems: string[] = [];
  const areas = Object.values(world.areas);
  const root = world.areas[world.rootId];
  if (!root || root.kind !== "galaxy") problems.push("The world has no galaxy at its root.");
  if (!world.areas[world.startId]) problems.push("The starting place does not exist.");
  for (const area of areas) {
    if (area.id === world.rootId) continue;
    const parent = area.parentId ? world.areas[area.parentId] : undefined;
    if (!parent) problems.push(`${area.name} has no parent area.`);
    else if (AREA_KINDS.indexOf(parent.kind) !== AREA_KINDS.indexOf(area.kind) - 1) problems.push(`${area.name} (${area.kind}) cannot be inside ${parent.name} (${parent.kind}).`);
  }
  const seenPaths = new Set<string>();
  for (const path of world.paths) {
    const from = world.areas[path.from];
    const to = world.areas[path.to];
    if (!from || !to) problems.push(`A ${path.label} leads to an area that does not exist.`);
    else if (from.kind !== to.kind || PATH_KIND[from.kind] !== path.kind) problems.push(`The ${path.label} between ${from.name} and ${to.name} joins areas it cannot join.`);
    else if (from.kind !== "system" && from.parentId !== to.parentId) problems.push(`The ${path.label} between ${from.name} and ${to.name} crosses out of its ${world.areas[from.parentId!]?.kind}.`);
    const key = [path.from, path.to].sort().join("|");
    if (path.from === path.to || seenPaths.has(key)) problems.push(`Duplicate or looping ${path.label} at ${from?.name}.`);
    seenPaths.add(key);
  }
  for (const area of areas) {
    const children = childrenOf(world, area.id);
    if (children.length && ["system", "planet", "settlement", "building"].includes(area.kind) && !children.some((c) => c.gateway)) {
      problems.push(`${area.name} has no way in: none of its ${children[0].kind}s is a gateway.`);
    }
  }
  if (world.areas[world.startId]) {
    const reached = reachableFrom(world, world.startId);
    const stranded = areas.filter((a) => !["galaxy", "region"].includes(a.kind) && !reached.has(a.id));
    if (stranded.length) problems.push(`${stranded.length} area(s) cannot be reached from the start, for example ${stranded.slice(0, 3).map((a) => a.name).join(", ")}.`);
  }
  if (catalog) {
    const statBlocks = new Set(catalog.monsters.map((m) => m.id));
    const gear = new Set(catalog.equipment.map((e) => e.name));
    const enhanced = new Set(catalog.enhancedItems.map((e) => e.name));
    const shipGear = new Set(catalog.starshipEquipment.map((e) => e.name));
    for (const area of areas) {
      for (const o of area.occupants) {
        if (o.statBlock && !statBlocks.has(o.statBlock)) problems.push(`${o.name} in ${area.name} uses an unknown stat block.`);
        for (const item of o.loadout) if (!gear.has(item)) problems.push(`${o.name} in ${area.name} carries unknown equipment: ${item}.`);
      }
      for (const cache of area.loot) {
        for (const item of cache.items) {
          if (!(item.source === "equipment" ? gear : enhanced).has(item.name)) problems.push(`The ${cache.name} in ${area.name} holds an unknown item: ${item.name}.`);
        }
      }
      for (const ship of area.ships) for (const item of ship.equipment) if (!shipGear.has(item)) problems.push(`${ship.name} mounts unknown equipment: ${item}.`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Editing (each returns a new world and keeps it sound; `error` says why nothing was changed)
// ---------------------------------------------------------------------------------------------

export interface EditResult {
  world: World;
  error?: string;
}

const copyOf = (world: World): World => JSON.parse(JSON.stringify(world));

// Change an area's own fields: name, description, type, danger, faction, occupants, loot, ships
export function updateArea(world: World, id: string, changes: Partial<Omit<Area, "id" | "kind" | "parentId">>): EditResult {
  if (!world.areas[id]) return { world, error: "That area does not exist." };
  if (changes.name !== undefined && !changes.name.trim()) return { world, error: "A name is needed." };
  const next = copyOf(world);
  Object.assign(next.areas[id], changes);
  return { world: next };
}

// Add an empty area inside another. It is joined to its nearest neighbour, so it can be reached.
export function addArea(world: World, parentId: string, fields: { name: string; type?: string; description?: string }): EditResult {
  const parent = world.areas[parentId];
  if (!parent) return { world, error: "That area does not exist." };
  const kind = AREA_KINDS[AREA_KINDS.indexOf(parent.kind) + 1];
  if (!kind) return { world, error: "A room cannot contain other areas." };
  if (kind === "region") return { world, error: "Regions come from the travel tables and cannot be added." };
  if (!fields.name.trim()) return { world, error: "A name is needed." };
  const next = copyOf(world);
  const siblings = childrenOf(next, parentId);
  const angle = siblings.length * 2.4;
  const reach = { region: 14, system: 10, planet: 6, settlement: 14, building: 6, room: 4 }[kind as Exclude<AreaKind, "galaxy">] ?? 6;
  const area: Area = {
    id: nextId(next, "a"), kind, parentId, name: fields.name.trim(), type: fields.type?.trim() || kind, description: fields.description ?? "",
    tags: [], danger: 0, occupants: [], ships: [], loot: [], faction: parent.faction,
    gateway: siblings.length === 0 || kind === "planet",
    position: { x: Math.round(Math.cos(angle) * reach * (1 + siblings.length / 4)), y: 0, z: Math.round(Math.sin(angle) * reach * (1 + siblings.length / 4)) },
  };
  next.areas[area.id] = area;
  // Systems join the hyperlane network at the nearest system anywhere; other areas join a sibling
  const neighbours = kind === "system" ? Object.values(next.areas).filter((a) => a.kind === "system" && a.id !== area.id) : siblings;
  const nearest = [...neighbours].sort((a, b) => distance(area, a) - distance(area, b))[0];
  if (nearest) addPath(next, nearest, area, { hyperlane: "Hyperlane", sublight: "Sublight lane", route: "Route", street: "Street", door: "Door" }[PATH_KIND[kind]!], "");
  return { world: next };
}

// Remove an area and all it contains. Its neighbours are joined to each other so nothing is cut off.
export function removeArea(world: World, id: string): EditResult {
  const area = world.areas[id];
  if (!area) return { world, error: "That area does not exist." };
  if (area.kind === "galaxy" || area.kind === "region") return { world, error: "Regions come from the travel tables and cannot be removed." };
  const next = copyOf(world);
  const doomed = new Set<string>();
  const collect = (areaId: string) => {
    doomed.add(areaId);
    childrenOf(next, areaId).forEach((c) => collect(c.id));
  };
  collect(id);
  if (doomed.has(next.startId)) return { world, error: "The party's starting place is inside this area. Move the start first." };
  const neighbours = next.paths.filter((p) => p.from === id || p.to === id).map((p) => next.areas[p.from === id ? p.to : p.from]);
  const template = next.paths.find((p) => p.from === id || p.to === id);
  next.paths = next.paths.filter((p) => !doomed.has(p.from) && !doomed.has(p.to));
  doomed.forEach((areaId) => delete next.areas[areaId]);
  indexes.delete(next);
  for (let i = 1; i < neighbours.length; i++) addPath(next, neighbours[0], neighbours[i], template?.label ?? "Path", template?.travel ?? "");
  const siblings = childrenOf(next, area.parentId!);
  if (area.gateway && siblings.length && !siblings.some((s) => s.gateway)) siblings[0].gateway = true;
  const problems = validateWorld(next);
  return problems.length ? { world, error: `Removing ${area.name} would break the map: ${problems[0]}` } : { world: next };
}

// Join two areas of the same kind (and, except for systems, in the same parent) with a path
export function connectAreas(world: World, fromId: string, toId: string, fields: { label?: string; travel?: string; locked?: number; hidden?: boolean } = {}): EditResult {
  const from = world.areas[fromId];
  const to = world.areas[toId];
  if (!from || !to) return { world, error: "That area does not exist." };
  const kind = PATH_KIND[from.kind];
  if (!kind || from.kind !== to.kind) return { world, error: `A ${from.kind} and a ${to.kind} cannot be joined directly.` };
  if (from.kind !== "system" && from.parentId !== to.parentId) return { world, error: `${from.name} and ${to.name} are in different places; join the areas that contain them instead.` };
  if (fromId === toId || linked(world, fromId, toId)) return { world, error: "Those two are already joined." };
  const next = copyOf(world);
  const { label, travel, ...extra } = fields;
  addPath(next, next.areas[fromId], next.areas[toId], label || title(kind), travel ?? "", extra);
  return { world: next };
}

// Remove a path, unless that would leave part of the map unreachable
export function disconnectAreas(world: World, pathId: string): EditResult {
  const path = world.paths.find((p) => p.id === pathId);
  if (!path) return { world, error: "That path does not exist." };
  const next = copyOf(world);
  next.paths = next.paths.filter((p) => p.id !== pathId);
  const before = reachableFrom(world, world.startId).size;
  if (reachableFrom(next, next.startId).size < before) {
    return { world, error: `Removing the ${path.label} would cut off part of the map. Add another path first.` };
  }
  return { world: next };
}

// Make an area a gateway of its parent, or stop it being one (a parent keeps at least one)
export function setGateway(world: World, id: string, gateway: boolean): EditResult {
  const area = world.areas[id];
  if (!area || !area.parentId) return { world, error: "That area does not exist." };
  const next = copyOf(world);
  next.areas[id].gateway = gateway;
  const problems = validateWorld(next);
  return problems.length ? { world, error: problems[0] } : { world: next };
}

// Start the party somewhere else
export function setStart(world: World, id: string): EditResult {
  if (!world.areas[id] || ["galaxy", "region"].includes(world.areas[id].kind)) return { world, error: "The party cannot start there." };
  const next = copyOf(world);
  next.startId = id;
  const problems = validateWorld(next);
  return problems.length ? { world, error: problems[0] } : { world: next };
}
