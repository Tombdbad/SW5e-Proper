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
import conditionData from "../data/sw5e/conditions.json";
import downtimeData from "../data/sw5e/downtime.json";
import shipData from "../data/sw5e/ships.json";
import powerData from "../data/sw5e/powers.json";

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
  // Everything else the stat block does in a fight: its other attacks, multiattack, area actions,
  // traits and reactions (see statProfile). Worlds made before have only `attack`.
  profile?: StatProfile;
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
  // Wanted for a crime done here (an Incident id): the constables are looking for them
  wanted?: string;
  ship?: string;
  // Held in bonds that have to be opened before they can walk away (see "Companions")
  captive?: Captive;
  // A droid powered down by a fight: it can be stabilized, mended and put under a bolt
  disabled?: boolean;
}

export interface Ship {
  id: string;
  name: string;
  size: string;
  role: string;
  tier: number;
  status: "landed" | "docked" | "orbiting" | "wrecked";
  // Beaten in a fight but not destroyed: it can be taken as a prize
  disabled?: boolean;
  // Hull points left after a fight (the party's ships; absent: undamaged)
  hull?: number;
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
  // A resource node (house rule, see "Gathering"): a vein, a patch, a wreck's guts, to be worked with a kit
  node?: ResourceNode;
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
  // Speeders parked at a building (an enemy's, to be taken as a prize; or a wreck to be mended)
  vehicles?: Vehicle[];
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
  // The minute the watch here calms down, set when the party leaves out of sight (see calmedAt)
  calmAt?: number;
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
  // A way that is climbed, not walked: the DC of the check (out of a pit)
  climb?: number;
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
  // The search the law is making for the party (see reportCrime); absent when there is none
  pursuit?: Pursuit;
  // The criminal reputation of each settlement: points, and the minute they were last counted (see heatAt)
  heat?: Record<string, { points: number; at: number }>;
  // Crimes done by the people of a settlement, and the search for them (see rollIncident), and the
  // last hour of the clock each settlement was rolled for
  incidents?: Incident[];
  incidentClock?: Record<string, number>;
  // A ship the party is trying to take (see startHeist); absent when there is none
  heist?: Heist;
  // The encounter waiting in the district the party is in (see rollEncounter), and the settlements
  // whose master has already taught the party
  encounter?: Encounter;
  mastersTaught?: string[];
  // The last encounter rolled (so one that was dealt with does not come round again that hour)
  encounterSeen?: string;
  // How the buildings of each district stand on its grid (see planDistrict)
  districtPlans?: Record<string, DistrictPlan>;
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
  // Mounts, vehicles and travel pace (the transport dataset)
  transport?: Transport;
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
  city: { buildings: ["spaceport*", "city gate*", "cantina", "market", "garrison", "medcenter", "workshop?", "residences", "palace?", "warehouse?", "archive?", "hideout?", "tenements?", "transit hub?", "droid dealer?", "vehicle dealer?", "shipyard?"], street: ["Avenue", "Skywalk", "Alley", "Transit tube"] },
  town: { buildings: ["landing field*", "town gate*", "cantina", "market", "workshop", "residences?", "garrison?", "medcenter?", "hideout?", "tenements?", "vehicle dealer?"], street: ["Street", "Alley", "Dirt road"] },
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
//   P captives, held in shackles, collars or cells (see "Companions")
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
  garrison: { hostile: "faction", rooms: ["Gatehouse|g", "Barracks|g g", "Armory|L:armory K", "Detention block|g P K @0", "Command room|b g L:intel K @1"] },
  "command post": { hostile: "faction", rooms: ["Checkpoint|g", "Operations room|s g", "Comms array|d L:intel", "Supply depot|L:cargo K @0"] },
  "operations center": { rooms: ["Security desk|g", "Control room|s s d", "Records vault|L:intel K"] },
  medcenter: { rooms: ["Reception|s", "Ward|s p", "Surgery|s d", "Pharmacy|L:medical K @0"] },
  workshop: { rooms: ["Shopfront|s", "Workfloor|s d", "Parts storage|L:workshop"] },
  engineering: { rooms: ["Engineering deck|s d", "Reactor room|d K", "Tool crib|L:workshop @0"] },
  residences: { rooms: ["Lobby|", "Apartments|p p", "Rooftop|", "Basement|L:stash H @0"] },
  tenements: { rooms: ["Lobby|", "Apartments|p p", "Quarters|p", "Basement|L:stash H @0"] },
  "transit hub": { rooms: ["Concourse|p p s", "Ticket hall|s p", "Control room|s d K @0"] },
  "droid dealer": { rooms: ["Showroom|s d", "Parts storage|L:workshop", "Repair bay|s d @0"] },
  "vehicle dealer": { rooms: ["Showroom|s", "Garage|s d L:workshop @0", "Yard|p"] },
  shipyard: { rooms: ["Yard office|s", "Berth|S s d", "Machine shop|d L:workshop @0"] },
  "habitat ring": { rooms: ["Commons|p p", "Quarters|p", "Hydroponics|s @0", "Locker hall|L:stash K @1"] },
  palace: { rooms: ["Entrance hall|g", "Audience chamber|s g p", "Offices|s", "Guard post|g L:armory K @0", "Vault|L:vault K g"] },
  warehouse: { rooms: ["Loading dock|s", "Storage floor|L:cargo", "Overseer's office|s L:coin K", "Hidden compartment|L:stash H @1"] },
  "cargo bay": { rooms: ["Cargo lock|s", "Container stacks|L:cargo", "Quarantine hold|L:cargo K"] },
  archive: { rooms: ["Antechamber|", "Reading hall|p s", "Stacks|s L:intel", "Sealed vault|L:relic K H"] },
  hideout: { hostile: "criminal", rooms: ["Lookout|g", "Common room|g g", "Stash room|L:stash K", "Boss's den|b L:vault K @1", "Escape tunnel|H", "Holding cells|P K @1"] },
  camp: { hostile: "criminal", rooms: ["Perimeter|g", "Tents|g g", "Supply cache|L:cargo", "Leader's tent|b L:coin @1", "Slave pens|P K @0"] },
  cave: { hostile: "wild", rooms: ["Cave mouth|N:plant", "Winding tunnel|w N:ore", "Den|w L:remains", "Deep chamber|w L:stash H N:crystal @1"] },
  ruin: { hostile: "horror", rooms: ["Broken gate|N:plant", "Collapsed hall|w N:crystal", "Inner sanctum|h L:relic K", "Crypt|h L:relic H N:crystal"] },
  wreck: { hostile: "wild", rooms: ["Hull breach|N:salvage", "Cargo hold|w L:cargo N:ore", "Bridge|L:intel K @0", "Engine room|d L:workshop N:salvage @1"] },
};

// Who works in a room, from what the room is for; otherwise whoever runs that kind of building
const ROOM_STAFF: [RegExp, string][] = [
  [/customs/i, "customs officer"], [/docking|hangar|fuel|workfloor|engineering|reactor|landing/i, "mechanic"],
  [/control|operations|command|security/i, "officer"], [/bar|cantina/i, "bartender"], [/stall|trader|shopfront|market/i, "merchant"],
  [/reception|ward|surgery|pharmacy/i, "medic"], [/audience/i, "official"], [/reading|stacks|archive/i, "archivist"],
  [/loading|overseer|cargo|freight|storage/i, "overseer"], [/hydroponics/i, "farmer"], [/arrivals|airlock|port office/i, "ticket agent"],
  [/office/i, "clerk"],
];
const BUILDING_STAFF: Record<string, string> = {
  spaceport: "dockmaster", "landing field": "dockmaster", "landing pad": "dockmaster", "docking ring": "dockmaster", cantina: "bartender",
  promenade: "merchant", market: "merchant", medcenter: "medic", workshop: "mechanic", engineering: "mechanic", garrison: "officer",
  "command post": "officer", "operations center": "officer", palace: "official", warehouse: "overseer", "cargo bay": "overseer",
  archive: "archivist", "habitat ring": "farmer", "droid dealer": "merchant", "vehicle dealer": "merchant", shipyard: "dockmaster", "transit hub": "dockmaster",
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
const NOTABLES = ["smuggler", "bounty hunter", "informant", "gambler", "pilot for hire", "mercenary"];

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
  mercenary: [/^(blaster rifle|blaster carbine|heavy carbine)$/i, /^(combat suit|mesh armor)$/i],
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

// ---------------------------------------------------------------------------------------------
// What a stat block does in a fight, read from its actions, traits and reactions. The numbers are
// the ones printed in the text; only the wording is matched here, never a creature's name.
// ---------------------------------------------------------------------------------------------

// A saving throw that comes with a hit or an action: "a DC 15 Constitution saving throw, taking
// 18 (4d8) poison damage on a failed save, or half as much on a successful one", "or become frightened"
export interface StatSave {
  dc: number;
  ability: string;
  damage?: string;
  damageType?: string;
  half?: boolean;
  conditions?: string[];
  // Turns the conditions last (10 to the minute)
  rounds?: number;
}

export interface StatAttack {
  name: string;
  bonus: number;
  damage: string;
  damageType?: string;
  ranged: boolean;
  // Reach, or the normal range of a ranged attack, in feet; `long` is the long range
  range: number;
  long?: number;
  // What the hit brings with it: extra damage and a saving throw
  extra?: { dice: string; type?: string };
  save?: StatSave;
}

export interface StatSpecial extends Partial<StatSave> {
  name: string;
  text: string;
  // The area it fills: "30-foot cone", "10-foot cube", "10-foot-radius sphere", and how far away it can be aimed
  shape?: "cone" | "cube" | "sphere" | "line" | "cylinder";
  size?: number;
  range?: number;
  // Limits: recharges on this roll of a d6 or more, so many times in a fight
  recharge?: number;
  perFight?: number;
}

export interface StatTrait {
  name: string;
  text: string;
  kind: "packTactics" | "regeneration" | "charge" | "reckless" | "sneakAttack" | "aggressive" | "legendaryResistance" | "flyby" | "evasion" | "forceResistance" | "other";
  // Hit points regained, the feet a charge needs, the extra damage, uses a day
  amount?: number;
  feet?: number;
  dice?: string;
  type?: string;
  save?: StatSave;
}

export interface StatReaction {
  name: string;
  text: string;
  kind: "acBonus" | "halve" | "other";
  amount?: number;
  against?: "melee" | "ranged" | "any";
}

export interface StatProfile {
  attacks: StatAttack[];
  // The attacks made on its turn, by name, in order ("makes two attacks: one with its bite and one with its claws")
  multiattack?: string[];
  specials: StatSpecial[];
  traits: StatTrait[];
  reactions: StatReaction[];
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  conditionImmunities?: string[];
}

const COUNT_WORDS: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const ABILITY_NAMES = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma";
const DICE = "\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?";
const compactDice = (dice: string) => dice.replace(/\s+/g, " ").replace(/ ?([+-]) ?/g, " $1 ").trim();
const conditionNames: string[] = (conditionData as { name: string }[]).map((c) => c.name.toLowerCase());
const conditionPattern = new RegExp(`\\b(?:be|become|becomes|is|are|been|gain|gains|knocked)\\s+(?:also\\s+|then\\s+)?(${conditionNames.join("|")})\\b`, "gi");

// How long an effect lasts in turns (10 to the minute); an unstated duration is one turn
const roundsOf = (text: string): number => {
  const span = text.match(/for (?:up to )?(\d+) (round|minute|hour)/i);
  if (span) return Math.min(100, Number(span[1]) * ({ round: 1, minute: 10, hour: 600 } as Record<string, number>)[span[2].toLowerCase()]);
  return 1;
};

// "must succeed on a DC 15 Constitution saving throw ... or be paralyzed": the DC, the damage on a
// failed save and the conditions
function saveIn(text: string): StatSave | undefined {
  const found = text.match(new RegExp(`DC (\\d+) (${ABILITY_NAMES}) saving throw`, "i"));
  if (!found) return undefined;
  const after = text.slice(found.index! + found[0].length);
  const damage = after.match(new RegExp(`(?:taking|takes?|suffer\\w*) (?:an extra |an additional )?\\d+ \\((${DICE})\\) (\\w+) damage`, "i"));
  const conditions: string[] = [];
  for (const c of after.matchAll(conditionPattern)) if (!conditions.includes(c[1].toLowerCase())) conditions.push(c[1].toLowerCase());
  // "knocked prone" and the like are caught by the pattern; so are "is also poisoned"
  return {
    dc: Number(found[1]),
    ability: found[2].toLowerCase(),
    ...(damage ? { damage: compactDice(damage[1]), damageType: damage[2].toLowerCase() } : {}),
    half: /half as much|half damage/i.test(after),
    ...(conditions.length ? { conditions, rounds: roundsOf(after) } : {}),
  };
}

// The attacks named in a Multiattack, by name and count: "makes four blaster rifle attacks",
// "makes two attacks: one with its bite and one with its claws", "attacks twice with Force Saber",
// "makes 2 Lightsaber Strikes". An action that is not a weapon attack is left out; when the text
// names no attack the creature has, its best attack is made the stated number of times.
function multiattackOf(text: string, attacks: StatAttack[]): string[] | undefined {
  if (!attacks.length) return undefined;
  const words = "one|two|three|four|five|six|seven|eight|once|twice|a|an|\\d+";
  const countOf = (word: string) => ({ once: 1, twice: 2 } as Record<string, number>)[word] ?? COUNT_WORDS[word] ?? (Number(word) || 0);
  const flat = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/ +/g, " ").trim();
  const named = (a: StatAttack, within: string) => new RegExp(`\\b${flat(a.name)}s?\\b`).test(within);
  const out: string[] = [];
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    // Of two alternatives ("one bite attack or one pummel attack") the first is made
    const plain = flat(sentence).split(/ or (?:uses?|takes?|can use|makes? (?:a|one|two))\b/)[0].split(/ or (?=(?:one|two|three|once|twice|\d+) )/)[0];
    const parts: string[] = [];
    // "one with its bite and two with its claws": a count before each "with"
    for (const w of plain.matchAll(new RegExp(`\\b(${words})\\b(?: attacks?)? with (?:its |his |her |their |the |a |an )?([a-z0-9 ]+?)(?= and | or |$)`, "g"))) {
      const target = attacks.find((a) => named(a, w[2]));
      if (target) for (let i = 0; i < countOf(w[1]); i++) parts.push(target.name);
    }
    if (!parts.length) {
      // "attacks twice with Force Saber", "makes two attacks with its blaster", "makes four blaster rifle attacks"
      const total = plain.match(new RegExp(`\\b(?:attacks? (once|twice)|(one|two|three|four|five|six|seven|eight|\\d+) (?:[a-z0-9 ]+ )?attacks?)\\b`));
      const count = total ? countOf(total[1] ?? total[2]) : 0;
      if (count) {
        const mentioned = attacks.filter((a) => named(a, plain));
        const pool = mentioned.length ? mentioned : [[...attacks].sort((a, b) => b.bonus - a.bonus)[0]];
        for (let i = 0; i < count; i++) parts.push(pool[i % pool.length].name);
      } else {
        // "makes 2 Lightsaber Strikes": a count, then the attack's name
        for (const a of attacks) {
          const m = plain.match(new RegExp(`\\b(${words}) ${flat(a.name)}s?\\b`));
          if (m) for (let i = 0; i < countOf(m[1]); i++) parts.push(a.name);
        }
      }
    }
    out.push(...parts);
  }
  return out.length ? out : undefined;
}

// One weapon attack of a stat block. The data types most of them (attackType, attackBonus, damageRoll);
// those it leaves untyped are read from their own text: "Melee Weapon Attack: +9 to hit, reach 10 ft.,
// one target. Hit: 24 (4d8 + 6) kinetic damage."
function attackFrom(b: NonNullable<Sw5eMonster["behaviors"]>[number]): StatAttack | undefined {
  const text = b.description ?? "";
  const hit = text.split(/Hit:/i)[1] ?? "";
  const typed = (b.attackType === "MeleeWeapon" || b.attackType === "RangedWeapon") && !!b.damageRoll;
  const written = text.match(/\b(melee|ranged)(?: or (?:melee|ranged))? (?:weapon|power|spell|tech|force) attack:\s*\+?(\d+) to hit/i);
  if (!typed && !written) return undefined;
  const damage = typed ? { dice: b.damageRoll!, type: b.damageType } : hit.match(new RegExp(`\\d+ \\((${DICE})\\) (\\w+) damage`, "i")) && { dice: hit.match(new RegExp(`\\d+ \\((${DICE})\\) (\\w+) damage`, "i"))![1], type: hit.match(new RegExp(`\\d+ \\((${DICE})\\) (\\w+) damage`, "i"))![2] };
  if (!damage) return undefined;
  const ranged = typed ? b.attackType === "RangedWeapon" : /^ranged/i.test(written![1]);
  const feet = attackRange(typed ? b.range : text.match(/(?:reach|range) [^,]*ft/i)?.[0]);
  const extra = hit.match(new RegExp(`(?:plus|and|an extra|additional)\\s+(?:an extra |an additional )?\\d+ \\((${DICE})\\) (\\w+) damage`, "i"));
  const save = saveIn(hit);
  return {
    name: b.name,
    bonus: typed ? b.attackBonus ?? 0 : Number(written![2]),
    damage: compactDice(damage.dice),
    damageType: damage.type?.toLowerCase(),
    ranged,
    range: feet.range ?? (ranged ? 80 : 5),
    ...(feet.long ? { long: feet.long } : ranged && feet.range ? { long: feet.range * 4 } : {}),
    ...(extra && !/saving throw[^.]*taking/i.test(extra[0]) ? { extra: { dice: compactDice(extra[1]), type: extra[2].toLowerCase() } } : {}),
    ...(save ? { save } : {}),
  };
}

// The stat block's fighting profile
export function statProfile(monster: Sw5eMonster): StatProfile {
  const behaviors = monster.behaviors ?? [];
  const attacks: StatAttack[] = [];
  for (const b of behaviors) {
    if (b.monsterBehaviorType !== "Action" || /^multiattack/i.test(b.name)) continue;
    const attack = attackFrom(b);
    if (attack && !attacks.some((a) => a.name === attack.name)) attacks.push(attack);
  }
  const specials: StatSpecial[] = [];
  const traits: StatTrait[] = [];
  const reactions: StatReaction[] = [];
  let multiattack: string[] | undefined;
  for (const b of behaviors) {
    const text = (b.description ?? "").trim();
    const limit = String((b as any).restrictions ?? "");
    if (b.monsterBehaviorType === "Action" && /^multiattack/i.test(b.name)) {
      multiattack = multiattackOf(text, attacks);
    } else if (b.monsterBehaviorType === "Action" && !attacks.some((a) => a.name === b.name) && !attackFrom(b)) {
      const save = saveIn(text);
      if (!save || !(save.damage || save.conditions)) continue;
      const shape = text.match(/(\d+)-foot[- ](cone|cube|sphere|line|cylinder|radius)/i);
      const reach = text.match(/within (\d+) f(?:ee|oo)t/i);
      const recharge = limit.match(/Recharge (\d)/i);
      const uses = limit.match(/(\d+)\/(?:day|rest)/i);
      specials.push({
        name: b.name,
        text,
        ...save,
        ...(shape ? { shape: shape[2].toLowerCase() === "radius" ? "sphere" : (shape[2].toLowerCase() as StatSpecial["shape"]), size: Number(shape[1]) } : {}),
        ...(reach ? { range: Number(reach[1]) } : {}),
        ...(recharge ? { recharge: Number(recharge[1]) } : {}),
        ...(uses ? { perFight: Number(uses[1]) } : /1\/turn/i.test(limit) ? { perFight: 99 } : {}),
      });
    } else if (b.monsterBehaviorType === "Trait") {
      const name = b.name;
      const trait: StatTrait = { name, text, kind: "other" };
      if (/advantage on (?:an )?attack rolls? against a creature if[^.]*(?:at least one|an ally|allies)/i.test(text) || /^pack tactics/i.test(name)) trait.kind = "packTactics";
      else if (/regains? (\d+) hit points at the start of (?:its|his|her) turn/i.test(text)) Object.assign(trait, { kind: "regeneration", amount: Number(text.match(/regains? (\d+) hit points/i)![1]) });
      else if (/moves? at least (\d+) feet (?:straight )?toward[^.]*(?:and )?hits? (?:it|that|the target)/i.test(text)) {
        const run = text.match(/moves? at least (\d+) feet/i)!;
        const dice = text.match(new RegExp(`extra \\d+ \\((${DICE})\\) (\\w+) damage`, "i"));
        Object.assign(trait, { kind: "charge", feet: Number(run[1]), ...(dice ? { dice: compactDice(dice[1]), type: dice[2].toLowerCase() } : {}), save: saveIn(text) });
      } else if (/gain advantage on all melee weapon attack rolls[^.]*attack rolls against it have advantage/i.test(text)) trait.kind = "reckless";
      else if (/extra (?:\d+ )?\((\d+d\d+)\)[^.]*damage[^.]*(?:advantage|surprise|within 5 feet of it)|(?:advantage|surprise)[^.]*extra (?:\d+ )?\((\d+d\d+)\)/i.test(text) && /once per turn|once on each|first round|surprise|advantage/i.test(text)) {
        const dice = text.match(/extra (?:\d+ )?\((\d+d\d+)\)/i);
        if (dice) Object.assign(trait, { kind: "sneakAttack", dice: dice[1], type: "" });
      } else if (/bonus action[^.]*move up to (?:its|his|her) speed toward a hostile creature/i.test(text)) trait.kind = "aggressive";
      else if (/fails? a saving throw[^.]*(?:can )?choose to succeed/i.test(text)) Object.assign(trait, { kind: "legendaryResistance", amount: Number(String(text.match(/(\d+)\/day/i)?.[1] ?? limit.match(/(\d+)\/day/i)?.[1] ?? 3)) });
      else if (/doesn't provoke opportunity attacks when it flies out/i.test(text)) trait.kind = "flyby";
      else if (/no damage if (?:it|he|she) succeeds on the saving throw/i.test(text) || /^evasion$/i.test(name)) trait.kind = "evasion";
      else if (/advantage on saving throws against (?:force|powers|force powers)/i.test(text)) trait.kind = "forceResistance";
      traits.push(trait);
    } else if (b.monsterBehaviorType === "Reaction") {
      const ac = text.match(/adds? (\d+) to (?:its|his|her|their) (?:AC|Armor Class)/i);
      const reaction: StatReaction = { name: b.name, text, kind: "other" };
      if (ac) Object.assign(reaction, { kind: "acBonus", amount: Number(ac[1]), against: /ranged/i.test(text) && !/melee/i.test(text) ? "ranged" : /melee/i.test(text) && !/ranged/i.test(text) ? "melee" : "any" });
      else if (/halve/i.test(text) && /damage/i.test(text)) Object.assign(reaction, { kind: "halve", against: "any" });
      reactions.push(reaction);
    }
  }
  const list = (value: unknown) => (Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : []);
  return {
    attacks,
    ...(multiattack?.length ? { multiattack } : {}),
    specials,
    traits,
    reactions,
    resistances: list(monster.damageResistances),
    vulnerabilities: list(monster.damageVulnerabilities),
    immunities: list(monster.damageImmunities),
    conditionImmunities: list(monster.conditionImmunities),
  };
}

// The profile as an occupant keeps it in the saved world: the texts of traits that do nothing in a fight are left out
export function slimProfile(profile: StatProfile): StatProfile {
  return {
    ...profile,
    specials: profile.specials.map(({ text: _text, ...rest }) => ({ ...rest, text: "" })),
    traits: profile.traits.filter((t) => t.kind !== "other").map((t) => ({ ...t, text: "" })),
    reactions: profile.reactions.filter((r) => r.kind !== "other").map((r) => ({ ...r, text: "" })),
  };
}

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
    profile: slimProfile(statProfile(monster)),
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
  const one: Occupant = { id: nextId(ctx.world, "o"), name: personName(ctx.random), role, disposition, count: 1, species, loadout: gear };
  return HIRE_ROLES.includes(role) ? withStats(ctx.catalog, one, ctx.random, ctx.world.partyLevel) : one;
}

// The stat block a trade fights with (house rule: the books give no stat block for a bounty hunter
// for hire), none harder than the party's level can hire: Challenge Rating up to about half the level + 1
const TRADE_STATS: Record<string, RegExp> = {
  "bounty hunter": /headhunter|sniper|scout|trandoshan hunter|mistryl apprentice/i,
  smuggler: /officer, junior|trooper, scout|jawa scrapper/i,
  "pilot for hire": /navy pilot|officer, junior/i,
  mercenary: /trooper, (heavy|flame|demolitions|jump|shore|sniper)|trooper$|trandoshan warrior|wookiee berserker/i,
};
const xpCap = (level: number) => (level <= 2 ? 200 : level <= 4 ? 450 : level <= 8 ? 1100 : level <= 12 ? 2900 : 5900);
export function withStats(catalog: Pick<WorldCatalog, "monsters" | "equipment">, o: Occupant, r: Random, level: number): Occupant {
  if (o.hitPoints) return o;
  const pattern = TRADE_STATS[o.role];
  if (!pattern) return o;
  const people = catalog.monsters.filter((m) => !/droid|beast|swarm/i.test((m.types ?? []).join(" ")) && pattern.test(m.name));
  const fit = people.filter((m) => m.experiencePoints <= xpCap(level));
  const block = r.pick(fit.length ? fit : people.sort((a, b) => a.experiencePoints - b.experiencePoints).slice(0, 1));
  if (!block) return o;
  const stats = statBlockOccupant(block, catalog.equipment, o.id, 1, o.role, o.disposition);
  return { ...stats, name: o.name, species: o.species, loadout: o.loadout.length ? o.loadout : stats.loadout };
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
    role: r.pick(shipRoleNames(size)),
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
      if (staff === "merchant") one.trade = dealerTrade(world, building, room, r) ?? one.trade;
      room.occupants.push(one);
    } else if (code === "P") {
      room.occupants.push(...captivesOf(ctx, room, building, speciesNames));
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
    } else if (code.startsWith("N:")) {
      room.loot.push(makeNode(ctx.random, nextId(world, "n"), code.slice(2) as MaterialFamily, room.danger));
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
  placeVehicles(ctx, building);
  planBuilding(world, building.id);
  furnishLevels(ctx, building);
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
  planDistricts(ctx, settlement.id);
  linkTransit(ctx, settlement);
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
  // In a fight in the open (a district), what it stands on: a height in levels (a roof or a
  // catwalk is above the street), and how high it stands (a building, which a shot cannot pass)
  z?: number;
  height?: number;
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
  { match: /detention/i, size: [8, 10, 6, 7], items: [["Holding cell", "wall", "2x2", "3-4", "b"], ["Guard console", "center", "2x1", "1", "bcs"], ["Restraint rack", "corner", "1x1", "1", "b"], ["Access panel", "wall", "1x1", "1"], ["Security camera", "wall", "1x1", "1"]] },
  { match: /barracks|tents/i, size: [8, 10, 6, 8], items: [["Bunk", "wall", "2x1", "4-6", "b"], ["Footlocker", "wall", "1x1", "2-4", "bc"], ["Weapon rack", "wall", "2x1", "1", "b"], ["Mess table", "center", "2x1", "1", "bct"]] },
  { match: /docking|hangar|landing|berth|\barm\b/i, size: [13, 16, 10, 12], items: [["Fuel pump", "wall", "1x1", "1-2", "b"], ["Cargo pallet", "corner", "2x2", "2-3", "bc"], ["Tool cart", "wall", "1x1", "1-2", "bcs"], ["Loading crane", "wall", "2x1", "0-1", "b"]] },
  { match: /main bar|^cantina$/i, size: [11, 13, 9, 11], items: [["Bar counter", "far", "5x1", "1", "bcs"], ["Bandstand", "corner", "3x2", "1"], ["Table", "center", "1x1", "4-6", "bct"], ["Booth", "wall", "2x1", "2-3", "bt"], ["Drink dispenser", "corner", "1x1", "1", "b"], ["Sabacc table", "center", "2x2", "0-1", "bct"]] },
  { match: /bar\b|cantina|common room|commons/i, size: [9, 11, 8, 10], items: [["Bar counter", "far", "5x1", "1", "bcs"], ["Table", "center", "1x1", "3-5", "bct"], ["Booth", "wall", "2x1", "1-3", "bt"], ["Drink dispenser", "corner", "1x1", "1", "b"], ["Sabacc table", "center", "2x2", "0-1", "bct"]] },
  { match: /stall|market|promenade|trade|shopfront/i, size: [10, 13, 7, 9], items: [["Market stall", "rows", "2x1", "4-7", "bcs"], ["Crate", "wall", "1x1", "2-4", "bc"], ["Awning post", "corner", "1x1", "0-2", "b"]] },
  { match: /ward|surgery|reception/i, size: [7, 9, 6, 7], items: [["Medical bed", "wall", "2x1", "2-4", "bt"], ["Bacta tank", "corner", "1x1", "1-2", "b"], ["Instrument cart", "center", "1x1", "1", "bs"], ["Supply cabinet", "wall", "2x1", "1", "b"]] },
  { match: /reactor|engine/i, size: [8, 10, 7, 9], items: [["Reactor core", "center", "2x2", "1", "bc"], ["Coolant tank", "corner", "1x1", "2", "b"], ["Monitoring console", "wall", "2x1", "1-2", "bs"], ["Pipe run", "wall", "3x1", "1-2", "b"]] },
  { match: /workfloor|engineering|workshop|maintenance|fuel|hydroponics/i, size: [8, 10, 6, 8], items: [["Workbench", "wall", "3x1", "1-2", "bs"], ["Tool rack", "wall", "2x1", "1", "b"], ["Parts bin", "center", "1x1", "2-3", "bc"], ["Power coupling", "corner", "1x1", "1", "b"]] },
  { match: /armory|vault|stash|stor|warehouse|cargo|container|hold|depot|cache|cellar|basement|compartment|parts|crib|pharmacy|locker|freight/i, size: [6, 9, 5, 8], items: [["Crate stack", "rows", "2x2", "2-4", "bc"], ["Shelving", "wall", "3x1", "1-3", "b"], ["Crate", "corner", "1x1", "1-3", "bc"], ["Lifter droid dock", "corner", "1x1", "0-1", "b"], ["Access panel", "wall", "1x1", "0-1"], ["Security camera", "wall", "1x1", "0-1"]] },
  { match: /command|operations|control|comms|bridge|tower/i, size: [7, 9, 6, 8], items: [["Holo-table", "center", "2x2", "1", "bcs"], ["Console", "wall", "2x1", "2-4", "bs"], ["Sensor mast", "corner", "1x1", "0-1", "b"], ["Command chair", "far", "1x1", "1", "t"], ["Access panel", "wall", "1x1", "1"], ["Security camera", "wall", "1x1", "0-1"]] },
  { match: /office|records|security|checkpoint|customs|desk|guard|watch|gatehouse|lookout|post\b/i, size: [6, 8, 5, 7], items: [["Desk", "center", "2x1", "1", "bcs"], ["Console", "wall", "2x1", "1-2", "bs"], ["Locker", "corner", "1x1", "1-2", "b"], ["Barricade", "center", "2x1", "0-1", "bc"], ["Security camera", "wall", "1x1", "0-1"], ["Alarm panel", "wall", "1x1", "0-1"]] },
  { match: /booth|den\b|tent|quarters|apartments/i, size: [5, 7, 5, 6], items: [["Couch", "wall", "2x1", "1-2", "bt"], ["Low table", "center", "1x1", "1", "bct"], ["Cabinet", "corner", "1x1", "1", "b"], ["Bed", "wall", "2x1", "0-2", "b"]] },
  { match: /^roof/i, size: [6, 10, 5, 8], items: [["Vent stack", "corner", "1x1", "1-2", "bc"], ["Water tank", "corner", "2x2", "0-1", "bc"], ["Antenna mast", "wall", "1x1", "1", "b"], ["Equipment crate", "wall", "2x1", "1-2", "bc"], ["Cooling unit", "center", "2x1", "0-1", "bc"]] },
  { match: /crypt|sanctum/i, size: [8, 10, 7, 9], items: [["Sarcophagus", "center", "1x2", "1-3", "bc"], ["Broken pillar", "corner", "1x1", "2-4", "bc"], ["Altar", "far", "2x1", "1", "bc"], ["Rubble", "wall", "1x1", "2-4", "bc"]] },
  { match: /cave|tunnel|chamber|mouth|breach|trailhead|perimeter|shelter|rooftop|collapsed|hull/i, size: [7, 11, 6, 9], items: [["Boulder", "center", "1x1", "2-4", "bc"], ["Rubble", "wall", "2x1", "2-4", "bc"], ["Rock pillar", "corner", "1x1", "1-3", "bc"], ["Campfire ring", "center", "1x1", "0-1", "t"]] },
  { match: /audience|hall|concourse|lobby|antechamber|reading|gate|entrance|arrivals|airlock|stacks/i, size: [9, 12, 7, 9], items: [["Pillar", "center", "1x1", "2-4", "bc"], ["Bench", "wall", "2x1", "2-4", "t"], ["Dais", "far", "3x1", "0-1", "c"], ["Information terminal", "wall", "1x1", "1", "bs"], ["Security camera", "wall", "1x1", "0-1"], ["Info kiosk", "wall", "1x1", "0-1", "b"], ["Alarm panel", "wall", "1x1", "0-1"]] },
  { match: /./, size: [6, 8, 5, 7], items: [["Crate", "wall", "1x1", "1-3", "bc"], ["Bench", "wall", "2x1", "1-2", "t"], ["Terminal", "wall", "1x1", "0-1", "bs"]] },
];

// Caves, ruins and trails are rock and rubble whatever a chamber is called
const planFor = (room: Area, buildingType: string): RoomPlan =>
  ROOM_PLANS.find((p) => p.match.test(/^(cave|ruin|trailhead)$/.test(buildingType) && !/crypt|sanctum/i.test(room.name) ? "cave" : room.name))!;

// What can be done with the wall-mounted and standing equipment of a room (house rule): a
// camera sees what is done in front of it, unless it is looped; an alarm panel raises or silences
// the building's alarm; an info kiosk gives the notices and what the law is doing; an access panel
// opens the locked doors of the building. Named by the furniture, so that worlds made before them
// can be given them (see addPanels).
export type UseKind = "camera" | "alarm" | "kiosk" | "access";
export const useKindOf = (name: string): UseKind | undefined =>
  /security camera|camera pole/i.test(name) ? "camera" : /alarm panel/i.test(name) ? "alarm" : /info kiosk|notice board/i.test(name) ? "kiosk" : /access panel/i.test(name) ? "access" : undefined;

// Whether a camera watches a room
export const camerasIn = (room: Pick<Area, "layout">) => !!room.layout?.assets.some((a) => useKindOf(a.name) === "camera");

// Gives rooms of a world made before them their panels, cameras and kiosks (life 10)
function addPanels(world: World, r: Random) {
  for (const room of Object.values(world.areas)) {
    if (room.kind !== "room" || !room.layout || formOf(room)) continue;
    const building = world.areas[room.parentId ?? ""];
    if (!building || BUILDINGS[building.type]?.hostile) continue;
    const plan = planFor(room, building.type);
    const have = new Set(room.layout.assets.filter((a) => useKindOf(a.name)).map((a) => useKindOf(a.name)));
    for (const [name, place, size, count, flags = ""] of plan.items) {
      const kind = useKindOf(name);
      if (!kind || have.has(kind)) continue;
      const [w, h] = size.split("x").map(Number);
      for (let i = 0, wanted = range(count, r); i < wanted; i++) {
        const spot = findSpot(room.layout, r, place, w, h);
        if (!spot) break;
        const asset: RoomAsset = { id: `${room.id}-p${room.layout.assets.length + 1}`, kind: "furniture", name, ...spot, ...(flags.includes("b") ? { blocks: true } : {}) };
        room.layout.assets.push(asset);
        if (asset.blocks && floorFaults(room.layout)) room.layout.assets.pop();
        else have.add(kind);
      }
    }
  }
}

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
  const feet = room.ships.map((ship) => footprintOf(ship.size));
  const spread = feet.reduce((sum, [fw]) => sum + Math.min(W - 4, fw), 0) + 2 * Math.max(0, feet.length - 1);
  let cursor = Math.floor((W - spread) / 2);
  for (const ship of room.ships) {
    const [fw, fh] = footprintOf(ship.size);
    let w = Math.min(W - 4, fw);
    let h = Math.min(H - 4, fh);
    const left = cursor;
    cursor += w + 2;
    const asset = (): RoomAsset => ({ id: `${room.id}-${++n}`, kind: "ship", name: ship.name, x: Math.max(1, feet.length > 1 ? left : Math.floor((W - w) / 2)), y: Math.floor((H - h) / 2), w, h, blocks: true, cover: true, ref: ship.id });
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
export const LIFE = 11;
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
  // Companions and transport (life 5): people who can be hired get stat blocks and a few
  // mercenaries sit in the bars, cells hold prisoners, bases keep speeders and wrecks lie in the
  // wilds, workshops sell speeders and markets mounts
  if ((next.life ?? 0) < 5) {
    for (const room of Object.values(next.areas).filter((a) => a.kind === "room")) {
      const building = next.areas[room.parentId ?? ""];
      if (!building) continue;
      const speciesNames = (ancestor(next, room.id, "planet")?.tags ?? []).filter((t) => t.startsWith("species:")).map((t) => t.slice(8));
      let changed = false;
      room.occupants = room.occupants.map((o) => {
        if (!HIRE_ROLES.includes(o.role) || o.hitPoints) return o;
        const stats = withStats(catalog, o, ctx.random, next.partyLevel);
        changed ||= !!stats.hitPoints;
        return stats;
      });
      if (/^(main bar|cantina)$/i.test(room.name) && ["cantina", "promenade"].includes(building.type) && !room.occupants.some((o) => o.role === "mercenary") && ctx.random.chance(0.5)) {
        room.occupants.push(person(ctx, "mercenary", "neutral", speciesNames));
        changed = true;
      }
      if (/detention|holding|pens/i.test(room.name) && !room.occupants.some((o) => o.captive)) {
        room.occupants.push(...captivesOf(ctx, room, building, speciesNames));
        changed = true;
      }
      for (const o of room.occupants) {
        if (o.role !== "merchant") continue;
        const trade = dealerTrade(next, building, room, ctx.random);
        if (trade && o.trade !== trade) { o.trade = trade; }
      }
      if (changed && room.layout) placeContents(room);
    }
    for (const building of Object.values(next.areas).filter((a) => a.kind === "building" && !a.vehicles)) placeVehicles(ctx, building);
    // Ships spend most of their time in their own berth (a few days at a time)
    for (const room of Object.values(next.areas)) for (const ship of room.ships) if (ship.voyage && !ship.voyage.homeStay) ship.voyage.homeStay = ctx.random.int(96, 216);
  }
  // Districts (life 6): the buildings of a settlement are put on one map of streets and alleys,
  // with second ways in, a roof and a ladder to it for each, and catwalks between roofs; and the
  // levels of each building are furnished (sentries on a gallery, pits under loose flagstones)
  if ((next.life ?? 0) < 6) {
    for (const building of Object.values(next.areas).filter((a) => a.kind === "building" && childrenOf(next, a.id).some((r) => r.layout))) furnishLevels(ctx, building);
    for (const settlement of Object.values(next.areas).filter((a) => a.kind === "settlement")) planDistricts(ctx, settlement.id);
  }
  // Passage (life 7): a ticket agent where the port takes arrivals, a smuggler's contact in the bar
  if ((next.life ?? 0) < 7) {
    for (const settlement of Object.values(next.areas).filter((a) => a.kind === "settlement")) {
      const rooms = childrenOf(next, settlement.id).filter((b) => b.kind === "building").flatMap((b) => childrenOf(next, b.id).filter((r) => r.kind === "room").map((room) => ({ room, building: b })));
      const ports = rooms.filter(({ room, building }) => PORT_TYPES.includes(building.type) && /arrivals|port office|airlock/i.test(room.name));
      if (!ports.length) continue;
      const speciesNames = (ancestor(next, settlement.id, "planet")?.tags ?? []).filter((t) => t.startsWith("species:")).map((t) => t.slice(8));
      if (!rooms.some(({ room }) => room.occupants.some((o) => o.role === "ticket agent"))) {
        const desk = ports[0].room;
        const clerk = desk.occupants.find((o) => o.role === "dockmaster" && !o.statBlock && o.count === 1);
        if (clerk) clerk.role = "ticket agent";
        else desk.occupants.push(person(ctx, "ticket agent", "friendly", speciesNames));
        if (desk.layout) placeContents(desk);
      }
      if (!rooms.some(({ room }) => room.occupants.some((o) => o.role === "smuggler" && o.disposition !== "hostile"))) {
        const bar = rooms.find(({ room, building }) => /^(main bar|cantina)$/i.test(room.name) && ["cantina", "promenade"].includes(building.type))?.room ?? rooms.find(({ building }) => PORT_TYPES.includes(building.type))?.room;
        if (bar) {
          bar.occupants.push(person(ctx, "smuggler", "neutral", speciesNames));
          if (bar.layout) placeContents(bar);
        }
      }
    }
  }
  // Hangars (life 8): a hangar is built to hold the ships that berth in it (see hangarRange). A building
  // with a hangar too small for them is planned again (the secret ways found stay found) and the
  // streets of its settlement are laid out again round it.
  if ((next.life ?? 0) < 8) {
    const settlements = new Set<string>();
    for (const building of Object.values(next.areas).filter((a) => a.kind === "building")) {
      const rooms = childrenOf(next, building.id).filter((r) => r.kind === "room");
      if (!rooms.some((r) => r.layout && !r.layout.form && holdsShips(r) && r.layout.width < hangarRange(r)[0])) continue;
      const found = new Set(rooms.filter((room) => room.secretEntry?.found).map((room) => room.id));
      planBuilding(next, building.id);
      for (const room of childrenOf(next, building.id)) if (room.secretEntry && found.has(room.id)) room.secretEntry.found = true;
      const settlement = ancestor(next, building.id, "settlement");
      if (settlement && next.districtPlans) settlements.add(settlement.id);
    }
    for (const id of settlements) planDistricts(ctx, id);
  }
  // Ways in and out (life 9): furniture, caches and ships are moved off the squares ways stand on,
  // and a way out that opens on a pocket between buildings is moved to a wall that opens on the street
  if ((next.life ?? 0) < 9) repairAccess(next, ctx.random);
  // Panels (life 10): cameras, alarm and access panels and info kiosks where the plans now put them
  if ((next.life ?? 0) < 10) addPanels(next, ctx.random);
  // Traffic (life 10): the day trips people already make get a vehicle, and more of them go (merchants
  // every few days, by hauler)
  if ((next.life ?? 0) < 10) {
    // ...droid dealers sell droids (they sold tools and kits before)
    for (const room of Object.values(next.areas).filter((a) => a.kind === "room" && next.areas[a.parentId ?? ""]?.type === "droid dealer" && /showroom|repair bay/i.test(a.name))) for (const o of room.occupants) if (o.role === "merchant") o.trade = "droids";
    for (const settlement of Object.values(next.areas).filter((a) => a.kind === "settlement")) addTraffic(next, settlement, ctx.random);
    // ...and rides parked at the houses and shops (those of a hostile base are left as they were)
    for (const building of Object.values(next.areas).filter((a) => a.kind === "building" && !a.vehicles?.length && !BUILDINGS[a.type]?.hostile)) placeVehicles(ctx, building);
  }
  // Resource nodes (life 11): caves, ruins and wrecks of worlds made before them get their veins, patches and salvage
  if ((next.life ?? 0) < 11) addNodes(next, ctx.random);
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
  // Droids that fell are powered down, not destroyed: they stay where they fell, to be mended
  const disabled: Occupant[] = [];
  const occupants = area.occupants.flatMap((o) => {
    if (o.disposition !== "hostile" || !o.hitPoints) return [o];
    const now = Array.from({ length: o.count }, (_, i) => standing.find((s) => s.id === `${o.id}-${i}`)?.hp ?? o.wounds?.[i] ?? o.hitPoints!);
    const alive = now.filter((hp) => hp > 0);
    const down = o.count - alive.length;
    const droid = isDroid(o) && o.creature === "droid";
    if (down) {
      slain += down;
      xp += (o.xp ?? 0) * down;
      if (!["wildlife", "horror"].includes(o.role)) people = true;
      gear.push(...o.loadout.map((name) => ({ name, quantity: down, source: "equipment" as const })));
      if (droid) disabled.push({ ...o, id: alive.length ? `${o.id}-down` : o.id, count: down, disposition: "neutral", role: "disabled droid", disabled: true, wounds: Array(down).fill(0), loadout: [], routine: undefined, ship: undefined });
    }
    if (!(droid && !alive.length)) kept.set(o.id, alive.length);
    if (!alive.length) return [];
    if (!down && !alive.some((hp, i) => hp !== (o.wounds?.[i] ?? o.hitPoints))) return [o];
    return [{ ...o, count: alive.length, wounds: alive.some((hp) => hp < o.hitPoints!) ? alive : undefined }];
  });
  for (const wreck of disabled) {
    const there = occupants.find((o) => o.id === wreck.id && o.disabled);
    if (there) there.count += wreck.count, there.wounds = [...(there.wounds ?? []), ...(wreck.wounds ?? [])];
    else occupants.push(wreck);
  }
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

export type Form = "stairs" | "lift" | "ladder" | "corridor" | "walkway" | "gallery" | "roof" | "pit";
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
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room" && formOf(a) !== "pit");
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
  const rooms = childrenOf(world, buildingId).filter((a) => a.kind === "room" && formOf(a) !== "pit");
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
      const [p0, p1, q0, q1] = planFor(room, building.type).size;
      // (A little larger than the plans were, 2026-10-16: the districts had a good deal of empty ground)
      const [w0, w1, h0, h1] = holdsShips(room) ? hangarRange(room) : [p0 + 1, p1 + 2, q0 + 1, q1 + 1];
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

// Who watches a place: the hostile creatures in it and, in the street of a district or on a roof
// or catwalk over it (house rule: all of that is in the open and in sight), those on the roofs
// and catwalks of the district
export function watchersAt(world: World, areaId: string): Occupant[] {
  const area = world.areas[areaId];
  if (!area) return [];
  return [...watchersOf(area), ...exposedRooms(world, areaId).flatMap((r) => watchersOf(r))];
}

// The roofs and catwalks of a district that can see (and be seen from) a place in the open: its
// street, or a roof or catwalk. Nothing for a room indoors.
// (House rule: watchers see about 30 feet, 6 squares; was 18, which put a whole district in sight.)
export const SIGHT_SQUARES = 6;

export function exposedRooms(world: World, areaId: string): Area[] {
  const area = world.areas[areaId];
  if (!area || (area.kind !== "building" && !openAir(area))) return [];
  const district = districtAt(world, areaId);
  if (!district) return [];
  // In sight: on the roofs and catwalks of this building and of those within 18 squares (90 feet) of it
  const boxes = world.districtPlans?.[district.id]?.boxes ?? {};
  const mine = boxes[area.kind === "building" ? area.id : area.parentId ?? ""];
  const near = (id: string) => {
    const other = boxes[id];
    if (!mine || !other) return true;
    const gap = Math.max(0, other.x - (mine.x + mine.width), mine.x - (other.x + other.width), other.y - (mine.y + mine.height), mine.y - (other.y + other.height));
    return gap <= SIGHT_SQUARES;
  };
  return district.buildingIds.filter(near).flatMap((id) => childrenOf(world, id)).filter((r) => r.kind === "room" && openAir(r) && r.id !== areaId);
}
const talks = (o: Occupant) => o.role !== "wildlife" && o.role !== "horror";
const alarmOf = (world: World, area: Area) => !!(area.kind === "room" && area.parentId && world.areas[area.parentId]?.alarm);

// What a Stealth check must beat: the watchers' best passive Perception, more once the alarm is up
export function watchDC(world: World, areaId: string): number {
  const area = world.areas[areaId];
  const best = Math.max(0, ...watchersAt(world, areaId).map((o) => o.saves?.wisdom ?? 0));
  return 10 + best + (alarmOf(world, area) ? 5 : 0);
}

// A level the watchers can actually be at: beasts and horrors do not question or warn
export function alertFor(area: Area, level: number, watchers: Occupant[] = watchersOf(area)): number {
  const clamped = Math.max(0, Math.min(4, level));
  return (clamped === ALERT.questioning || clamped === ALERT.confronting) && !watchers.some(talks) ? ALERT.attacking : clamped;
}

// Where the watch starts when the party arrives. `stealth` is the Stealth check total when sneaking.
export function arrivalAlert(world: World, areaId: string, approach: Approach, stealth = 0): number {
  const area = world.areas[areaId];
  if (!area || !watchersAt(world, areaId).length) return ALERT.unaware;
  const alarm = alarmOf(world, area);
  const open = alertFor(area, alarm ? ALERT.attacking : area.gateway ? ALERT.questioning : ALERT.confronting, watchersAt(world, areaId));
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
  const alert = alertFor(area, level, watchersAt(world, areaId));
  // (Back in their sight, the watch no longer calms down: calmAt goes.)
  const areas = { ...world.areas, [areaId]: { ...area, alert, allowed: allowed || undefined, calmAt: undefined } };
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
// The law's response (house rule; the books leave it to the game master). A crime raised here
// sends officers to the scene, in the law's own time: strict worlds within minutes, with heavy
// troopers; policed ones in ten minutes with a squad; frontier ones in half an hour with a
// constable or two. Lawless space sends no one, unless the crime was against the cartel that
// rules the place: its enforcers come then, whatever the law. The officers search the settlement
// the crime was done in for a time that depends on the crime and the law. The search is called
// off when its time is up, or when the party lies low in that district (a Stealth check). Leaving
// the district ends the search for the party: it does not follow them.
// ---------------------------------------------------------------------------------------------

export const CRIMES = { trespass: 1, theft: 1, brawl: 2, assault: 2, heinous: 3 } as const;
export type Crime = keyof typeof CRIMES;
export const CRIME_NAMES: Record<Crime, string> = { trespass: "trespassing", theft: "theft", brawl: "a brawl", assault: "assault", heinous: "a heinous crime" };
const SEARCH_MINUTES: Record<Crime, number> = { trespass: 30, theft: 60, brawl: 120, assault: 240, heinous: 720 };

export interface Pursuit {
  crime: Crime;
  scene: string; // the area where it was done
  district: string; // the settlement the officers search (see settlementOf)
  arrivesAt: number; // the minute the officers reach the scene
  searchUntil: number; // the minute the search for the offenders is called off
  officers: number;
  heavy: boolean; // security troopers rather than constables
  cartel: boolean; // the cartel's own enforcers answer, not the law
  met?: string[]; // the areas where a squad has already found the party (see engageOfficers)
  // The squads walking the district (see advanceSearch); absent in searches begun before they were
  squads?: Squad[];
  // Rooms where people saw the party while the search was on, the room they were last seen in,
  // and whether the search knows who they are (by questioning, or by a call on the comm)
  seen?: string[];
  known?: string;
  identified?: boolean;
  // Calls to security on the comm, due at a minute (see noteArrival)
  reports?: { area: string; at: number; who: string }[];
  // A room whose owner has hidden the party in it (see grantShelter)
  sheltered?: string;
  // What the search last did, for the map's status line
  lastNote?: string;
}

// A squad of officers walking the district: where it is, how many it has, and when it next moves
export interface Squad {
  id: string;
  at: string;
  count: number;
  heavy: boolean;
  next: number; // the minute it next moves
  step: number; // how many squares it has walked (0 at the scene)
}

// The settlement an area is in (or the area itself, out in space or where there is none)
export function settlementOf(world: World, areaId: string): string {
  for (let id: string | null = areaId; id; id = world.areas[id]?.parentId ?? null) if (world.areas[id]?.kind === "settlement") return id;
  return areaId;
}

// The response to a crime in a place of this law (0 lawless to 3 strict), or none
export function responseFor(law: number, crime: Crime, cartel: boolean): { delay: number; officers: number; heavy: boolean; search: number } | null {
  const serious = crime === "assault" || crime === "heinous";
  if (cartel) return { delay: 15, officers: 3, heavy: serious, search: SEARCH_MINUTES[crime] };
  if (law <= 0) return null;
  const hurry = crime === "heinous" ? 0.5 : crime === "theft" || crime === "trespass" ? 1.5 : 1;
  const delay = Math.round(({ 1: 30, 2: 10, 3: 4 } as Record<number, number>)[Math.min(3, law)] * hurry);
  const officers = law === 1 ? 2 : law === 2 ? 3 + (crime === "heinous" ? 1 : 0) : 5 + (serious ? 2 : 0);
  return { delay, officers, heavy: law === 3 || crime === "heinous", search: Math.round(SEARCH_MINUTES[crime] * [0, 0.5, 1, 2][Math.min(3, law)]) };
}

// Raises a crime seen or reported in an area: the officers are sent for, or the search they are
// already on is widened. A crime in a place a crime syndicate rules is against that cartel (house
// rule: its own men are the ones there), so its enforcers come even where the law does not.
export function reportCrime(world: World, areaId: string, crime: Crime, now: number): World {
  if (!world.areas[areaId]) return world;
  const ruler = ancestor(world, areaId, "planet")?.faction ?? ancestor(world, areaId, "system")?.faction ?? "";
  const cartel = CRIME.test(ruler);
  const resp = responseFor(lawAt(world, areaId), crime, cartel);
  if (!resp) return world;
  const district = settlementOf(world, areaId);
  const prior = world.pursuit && world.pursuit.district === district && now < world.pursuit.searchUntil ? world.pursuit : undefined;
  const arrivesAt = prior ? Math.min(prior.arrivesAt, now + resp.delay) : now + resp.delay;
  const heavy = !!(prior?.heavy || resp.heavy);
  const cartelled = !!(prior?.cartel || cartel);
  const officers = Math.max(prior?.officers ?? 0, resp.officers);
  const pursuit: Pursuit = {
    ...(prior ?? {}),
    crime: prior && CRIMES[prior.crime] > CRIMES[crime] ? prior.crime : crime,
    scene: areaId,
    district,
    arrivesAt,
    searchUntil: Math.max(prior?.searchUntil ?? 0, arrivesAt + resp.search),
    officers,
    heavy,
    cartel: cartelled,
    // A search already walking the district keeps its squads; a new one sends them from the scene
    squads: prior?.squads ?? startSquads(areaId, arrivesAt, officers, cartelled || heavy ? 3 : 2, heavy),
  };
  return addHeat({ ...world, pursuit }, district, crime, now);
}

// The squads a search sends: as many as the officers can make up, each walking from the scene
function startSquads(areaId: string, arrivesAt: number, officers: number, squads: number, heavy: boolean): Squad[] {
  const n = Math.max(1, Math.min(squads, officers));
  return Array.from({ length: n }, (_, i) => ({ id: `sq-${arrivesAt}-${i}`, at: areaId, count: Math.max(1, Math.ceil(officers / n)), heavy, next: arrivesAt, step: 0 }));
}

// ---------------------------------------------------------------------------------------------
// Criminal reputation, the watch calming down, the search on foot, the comms and the shelter
// (house rules; the books give none of this). Three cooldowns run side by side:
//  - the watch in a place calms down (`calmedAt`) ten minutes after the party has left where
//    the watchers can see it, and goes back to unaware;
//  - the search is short: the officers' time on the case (`searchUntil`, see reportCrime);
//  - the criminal reputation of a settlement is long: each crime adds points, and a day takes one
//    away. Heat 3 and up blockades the ways out of the settlement and stops vehicles while a search
//    is on, until the search cooldown is over.
// Officers in a search walk the district rather than wait for the party: a squad moves a room
// every two minutes (`advanceSearch`), questions whoever is in the room and sees the party when it
// walks in on them (a Stealth check, `squadSightDC`). People who saw the party tell the squad who
// it is when they are questioned, and those with a commlink call security (`noteArrival`) unless
// a comm jammer is running; the party can stop a call (`interceptCall`).
// ---------------------------------------------------------------------------------------------

export const WATCH_COOLDOWN = 10; // minutes out of sight before the watch in a place calms down
export const HEAT_POINTS: Record<Crime, number> = { trespass: 1, theft: 2, brawl: 2, assault: 3, heinous: 5 };
export const HEAT_DAY = 1440; // minutes for one point of heat to fade
export const SEARCH_STEP = 2; // minutes a squad takes to walk from one room to the next
export const REPORT_MINUTES = 2; // minutes before a call to security is put through

export const heatLevel = (points: number) => (points >= 9 ? 3 : points >= 6 ? 2 : points >= 3 ? 1 : 0);

// The heat of a settlement now: the points it had, less a day's fading for each day since
export function heatAt(world: World, settlementId: string, now: number): number {
  const h = world.heat?.[settlementId];
  if (!h) return 0;
  return Math.max(0, h.points - Math.floor(Math.max(0, now - h.at) / HEAT_DAY));
}

export function addHeat(world: World, settlementId: string, crime: Crime, now: number): World {
  const points = heatAt(world, settlementId, now) + HEAT_POINTS[crime];
  return { ...world, heat: { ...(world.heat ?? {}), [settlementId]: { points, at: now } } };
}

// A blockade holds the ways out of a settlement, and its vehicles, while the search is on
export function blockadeAt(world: World, settlementId: string, now: number): boolean {
  const p = world.pursuit;
  return !!p && p.district === settlementId && now < p.searchUntil && heatLevel(heatAt(world, settlementId, now)) >= 3;
}

// Why an exit cannot be taken at this minute (a blockade), or nothing
export function blockedExit(world: World, fromId: string, exit: Pick<Exit, "to">, now: number): string | undefined {
  const from = settlementOf(world, fromId);
  if (blockadeAt(world, from, now) && settlementOf(world, exit.to) !== from) return "the officers hold the way out of the settlement until the search is called off";
  return undefined;
}

// The watch in a place is calm when the party has been out of its sight for the cooldown
export const calmedAt = (area: Pick<Area, "calmAt">, now: number) => area.calmAt !== undefined && now >= area.calmAt;

// Can the watchers in one place see the party in another (the same place, or the roofs and
// catwalks in sight of it)?
export function inSight(world: World, watcherId: string, partyId: string): boolean {
  if (watcherId === partyId) return true;
  return exposedRooms(world, watcherId).some((r) => r.id === partyId) || exposedRooms(world, partyId).some((r) => r.id === watcherId);
}

// The party leaves a place: if the watchers there cannot see where it went, their watch starts to calm
export function leaveSight(world: World, fromId: string, toId: string, now: number): World {
  const area = world.areas[fromId];
  if (!area || !watchersAt(world, fromId).length || inSight(world, fromId, toId)) return world;
  return { ...world, areas: { ...world.areas, [fromId]: { ...area, calmAt: now + WATCH_COOLDOWN } } };
}

// Someone going about their life: not hostile, not held, not a lawman, not a droid or an animal
// (the people of a settlement carry no stat block, so no hit points either)
export const isCivilian = (o: Occupant) => o.disposition !== "hostile" && !o.captive && !o.disabled && !isLawman(o) && !/droid|wildlife|horror|guard|captive|patient/i.test(o.role);
export const hasCommlink = (o: Occupant) => (o.loadout ?? []).some((n) => /^commlink/i.test(n));
const isReporter = (o: Occupant) => isCivilian(o) && o.disposition === "neutral" && hasCommlink(o);

// The party is in a place of the district being searched: the people there see it, and those with
// a commlink who are not friends call security (unless a comm jammer is running in the district)
export function noteArrival(world: World, areaId: string, now: number, jammed: boolean): World {
  const p = world.pursuit;
  const area = world.areas[areaId];
  if (!p || !area || now >= p.searchUntil || settlementOf(world, areaId) !== p.district) return world;
  const people = area.occupants.filter(isCivilian);
  if (!people.length) return world;
  const seen = p.seen?.includes(areaId) ? p.seen : [...(p.seen ?? []), areaId];
  const callers = jammed ? [] : area.occupants.filter(isReporter).filter((o) => !(p.reports ?? []).some((r) => r.area === areaId && r.who === o.name));
  const reports = [...(p.reports ?? []), ...callers.map((o) => ({ area: areaId, at: now + REPORT_MINUTES, who: o.name }))];
  return { ...world, pursuit: { ...p, seen, known: areaId, reports } };
}

// Stops a call to security from being put through (the party talked the caller down or cut the line)
export function interceptCall(world: World, areaId: string, who: string): World {
  const p = world.pursuit;
  if (!p?.reports) return world;
  return { ...world, pursuit: { ...p, reports: p.reports.filter((r) => !(r.area === areaId && r.who === who)) } };
}

// The Stealth check a squad's passive Perception sets against the party; a sheltered party is hard to find
export const squadSightDC = (p: Pursuit, sheltered: boolean) => (sheltered ? 15 : 10 + (p.heavy ? 2 : 0));

// The rooms a squad can walk to from here: the exits in the same settlement, and the other
// buildings of the district from the street
function searchNeighbours(world: World, settlementId: string, id: string): string[] {
  const inTown = (a: string) => {
    const k = world.areas[a]?.kind;
    return (k === "room" || k === "building") && settlementOf(world, a) === settlementId;
  };
  const out = new Set<string>();
  for (const e of exitsOf(world, id)) if (!e.needsShip && !e.hidden && inTown(e.to)) out.add(e.to);
  const district = districtAt(world, id);
  if (world.areas[id]?.kind === "building" && district) for (const b of district.buildingIds) if (b !== id) out.add(b);
  return [...out];
}

export interface SearchStep {
  world: World;
  // A squad has walked in on the party: where, and the Stealth DC to stay hidden from it
  sighted?: { squad: Squad; area: string; dc: number };
  // A line for the map's status: what the officers did
  note?: string;
}

// Moves the squads of the search on to `now`. They walk the district, or straight for the party
// once the search knows who it is. Stops at the first squad that walks in on the party, so the
// caller can roll for it and call again.
export function advanceSearch(world: World, now: number, party: { area: string; jammed: boolean }): SearchStep {
  const p = world.pursuit;
  if (!p?.squads || now < p.arrivesAt || now >= p.searchUntil) return { world };
  let pur: Pursuit = { ...p, squads: p.squads.map((s) => ({ ...s })) };
  let note: string | undefined;
  // Calls put through (a jammer stops them) make the search know who the party is
  const due = (pur.reports ?? []).filter((r) => r.at <= now);
  if (due.length) {
    pur = { ...pur, reports: (pur.reports ?? []).filter((r) => r.at > now) };
    for (const r of due) {
      if (party.jammed) continue;
      pur = { ...pur, identified: true };
      note = `${r.who} called security: the officers know who the party is.`;
    }
  }
  // (Nothing to do returns the same world, so the caller saves nothing.)
  if (!due.length && !pur.squads!.some((s) => s.next <= now && s.next < pur.searchUntil)) return { world };
  for (const squad of pur.squads!) {
    while (squad.next <= now && squad.next < pur.searchUntil) {
      if (squad.step > 0) {
        let hop: string | undefined;
        const path = pur.identified && pur.known ? findPath(world, squad.at, pur.known) : null;
        if (path && path.length > 1) hop = path[1];
        else {
          const options = searchNeighbours(world, pur.district, squad.at);
          if (options.length) hop = createRandom(Math.imul(pur.arrivesAt, 1009) + Math.imul(squad.step, 7919) + [...squad.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)).pick(options);
        }
        if (hop) squad.at = hop;
      }
      squad.step += 1;
      squad.next += SEARCH_STEP;
      const area = world.areas[squad.at];
      if (!area) continue;
      // Questioning: the people in the room tell what they saw, and if the party was seen here, who it is
      if (area.occupants.some(isCivilian)) {
        note = `${squad.count} ${squad.heavy ? "troopers" : "constables"} question the people of ${area.name}${pur.seen?.includes(area.id) ? ": they know the party's face" : ""}.`;
        if (pur.seen?.includes(area.id) && !pur.identified) pur = { ...pur, identified: true };
      }
      // Sight: a squad walks in on the party, here or on a roof or catwalk in its sight
      if (squad.at === party.area || exposedRooms(world, party.area).some((r) => r.id === squad.at)) {
        const dc = squadSightDC(pur, pur.sheltered === party.area);
        return { world: { ...world, pursuit: { ...pur, squads: pur.squads!.map((s) => (s.id === squad.id ? squad : s)), lastNote: note ?? pur.lastNote } }, sighted: { squad: { ...squad }, area: squad.at, dc }, note };
      }
    }
  }
  return { world: { ...world, pursuit: { ...pur, lastNote: note ?? pur.lastNote } }, note };
}

// The owner of a room hides the party in it (or a room in the same building they keep for it): a
// hidden way or a locked door is opened for the search (house rule; a Persuade check)
export const shelterOwner = (o: Occupant) => isCivilian(o) && /bartender|barkeep|innkeep|resident|owner|landlord|proprietor|keeper|merchant|overseer|manager|mechanic|medic/i.test(o.role + " " + o.name);

export function grantShelter(world: World, fromId: string, exit: Exit): World {
  const target = world.areas[exit.to];
  if (!target || !world.pursuit) return world;
  const paths = exit.pathId ? world.paths.map((path) => (path.id === exit.pathId ? { ...path, locked: undefined, hidden: undefined } : path)) : world.paths;
  const areas = { ...world.areas, [target.id]: target.secretEntry ? { ...target, secretEntry: { ...target.secretEntry, found: true } } : target };
  return { ...world, paths, areas, pursuit: { ...world.pursuit, sheltered: target.id } };
}

// A squad that has found the party stops being a squad of the search (it is in the room now)
export const retireSquad = (world: World, squadId: string): World =>
  world.pursuit?.squads ? { ...world, pursuit: { ...world.pursuit, squads: world.pursuit.squads.filter((s) => s.id !== squadId) } } : world;

// The rooms of a building an owner could open for the party: those a hidden or locked way leads to
export const shelterExits = (world: World, fromId: string): Exit[] =>
  exitsOf(world, fromId).filter((e) => (e.hidden || e.locked || e.secret) && world.areas[e.to]?.kind === "room" && world.areas[e.to]?.parentId === world.areas[fromId]?.parentId);

// Where the search stands at a minute: coming (the officers are on their way), searching (they are
// out and the district is being searched), or nothing (no search, or it is over)
export function pursuitAt(world: World, now: number, areaId?: string): { phase: "coming" | "searching"; minutes: number; here: boolean; pursuit: Pursuit } | null {
  const p = world.pursuit;
  if (!p || now >= p.searchUntil) return null;
  const here = !!areaId && settlementOf(world, areaId) === p.district;
  return now < p.arrivesAt ? { phase: "coming", minutes: p.arrivesAt - now, here, pursuit: p } : { phase: "searching", minutes: p.searchUntil - now, here, pursuit: p };
}

// The party lies low in the district being searched, with this Stealth check. It holds, and the
// search is called off; or they are caught, and fined.
export const lieLowDC = (p: Pursuit) => 12 + p.officers + (p.heavy ? 2 : 0);

export function lieLow(world: World, check: number): { world: World; caught: boolean; fine: number } {
  const p = world.pursuit;
  if (!p) return { world, caught: false, fine: 0 };
  const dc = lieLowDC(p);
  if (check >= dc) return { world: { ...world, pursuit: undefined }, caught: false, fine: 0 };
  const law = Math.max(1, lawAt(world, p.scene));
  return { world: { ...world, pursuit: undefined }, caught: true, fine: 100 * CRIMES[p.crime] * law * (p.heavy ? 2 : 1) };
}

// ---------------------------------------------------------------------------------------------
// The law in person (house rule). Guards, officers and customs officers who are not hostile (yet)
// see what the party does in their sight: picking a lock, forcing a door or taking what is not
// theirs is Dexterity (Stealth) against the best passive Perception among them (`lawWatchDC`).
// Caught, they turn hostile at once (`turnLawmen`) and the fight starts. The officers a search
// sends are real: when the search reaches the party (at the scene, or when it walks into another
// place of the district and fails to keep out of sight) a squad stands in the room hostile
// (`engageOfficers`). A district sends at most two squads, three for heavy troopers.
// ---------------------------------------------------------------------------------------------

export const LAW_ROLES = ["guard", "officer", "customs officer"];
export const isLawman = (o: Occupant) => LAW_ROLES.includes(o.role) && o.disposition !== "hostile" && !o.captive && !o.disabled;

// The lawmen who can see what is done in a place: those in it and, in the open, on the roofs and catwalks
export function lawmenAt(world: World, areaId: string): Occupant[] {
  const area = world.areas[areaId];
  if (!area) return [];
  return [area, ...exposedRooms(world, areaId)].flatMap((a) => a.occupants.filter(isLawman));
}

export function lawWatchDC(world: World, areaId: string): number {
  const area = world.areas[areaId];
  const best = Math.max(1, ...lawmenAt(world, areaId).map((o) => o.saves?.wisdom ?? 1));
  return 10 + best + (area && alarmOf(world, area) ? 5 : 0);
}

// Every lawman who can see the party turns on it. `block` is a stat block for those who have none.
export function turnLawmen(world: World, areaId: string, block?: Occupant): World {
  const areas = { ...world.areas };
  for (const id of [areaId, ...exposedRooms(world, areaId).map((r) => r.id)]) {
    const area = areas[id];
    if (!area || !area.occupants.some(isLawman)) continue;
    areas[id] = {
      ...area,
      occupants: area.occupants.map((o) => {
        if (!isLawman(o)) return o;
        if (o.hitPoints || !block) return { ...o, disposition: "hostile" as const, routine: undefined };
        return { ...block, id: o.id, name: o.name, role: o.role, species: o.species, count: o.count, loadout: o.loadout.length ? o.loadout : block.loadout, disposition: "hostile" as const, wounds: undefined, routine: undefined };
      }),
    };
  }
  return setAlert({ ...world, areas }, areaId, ALERT.attacking);
}

export const maxSquads = (p: Pursuit) => (p.heavy || p.cartel ? 3 : 2);

// A squad of the search finds the party in this area: it stands there, hostile, and attacks
export function engageOfficers(world: World, areaId: string, block: Occupant, now: number, count = world.pursuit?.officers ?? 1): World {
  const p = world.pursuit;
  const area = world.areas[areaId];
  if (!p || !area) return world;
  const squad: Occupant = {
    ...block,
    id: `o-law-${now}-${p.met?.length ?? 0}`,
    name: p.cartel ? "Syndicate enforcers" : p.heavy ? "Security troopers" : "Constables",
    role: "guard",
    disposition: "hostile",
    count: Math.max(1, Math.min(6, count)),
    wounds: undefined,
    routine: undefined,
  };
  const met = [...(p.met ?? []), areaId];
  const placed: World = { ...world, areas: { ...world.areas, [areaId]: { ...area, occupants: [...area.occupants, squad] } }, pursuit: { ...p, met } };
  return setAlert(placed, areaId, ALERT.attacking, false);
}

// ---------------------------------------------------------------------------------------------
// Passage off world (house rule: the books price no fares). A ticket agent at a port sells a berth
// on a liner to any planet the lanes reach, at the fuel the trip burns at a Medium ship's price
// (see passageFare) and half an hour's wait for boarding. A smuggler in the port takes a passenger
// for 60% of that, no questions, but the customs scan must be fooled (Deception) or the party is
// reported for trespass; slipping aboard a freighter's hold unseen (Stealth) costs nothing and, if
// missed, a fine and the same report. All of them leave the party in orbit of the world they choose.
// ---------------------------------------------------------------------------------------------

export interface PassageOffer {
  to: string;
  name: string;
  system: string;
  fare: number;
  minutes: number;
}

export const SMUGGLER_SHARE = 0.6;
export const BOARDING_MINUTES = 30;
export const passageCheckDC = (kind: "smuggler" | "stowaway", law: number) => (kind === "smuggler" ? 10 : 12) + 2 * law;
export const stowawayFine = (law: number) => 50 * Math.max(1, law);

export function passageOffers(world: World, settlementId: string, rate: number, limit = 8): PassageOffer[] {
  const planet = ancestor(world, settlementId, "planet");
  if (!world.areas[settlementId]) return [];
  // A port that is not the planet's gateway has no take-off of its own: the liner lifts from the planet's
  // orbit and a shuttle goes up to it first (an hour, free like every shuttle)
  const direct = exitsOf(world, settlementId).some((e) => e.needsShip);
  const start = direct || !planet ? settlementId : planet.id;
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  const found: string[] = [];
  while (queue.length && found.length < limit * 2) {
    const current = queue.shift()!;
    for (const exit of exitsOf(world, current)) {
      if (!exit.needsShip || previous.has(exit.to)) continue;
      previous.set(exit.to, current);
      queue.push(exit.to);
      if (world.areas[exit.to]?.kind === "planet" && exit.to !== planet?.id) found.push(exit.to);
    }
  }
  return found.slice(0, limit).map((id) => {
    const steps: string[] = [];
    for (let at: string | null = id; at; at = previous.get(at) ?? null) steps.unshift(at);
    let fare = 0;
    let minutes = BOARDING_MINUTES + (direct || !planet ? 0 : 60);
    for (let i = 1; i < steps.length; i++) {
      const exit = exitsOf(world, steps[i - 1]).find((e) => e.to === steps[i]);
      if (!exit) continue;
      fare += passageFare(exit, rate);
      minutes += tripMinutes(exit, 1);
    }
    return { to: id, name: world.areas[id].name, system: ancestor(world, id, "system")?.name ?? "", fare: Math.max(10, fare), minutes };
  });
}

// ---------------------------------------------------------------------------------------------
// Ships in the round (house rule: the books give ships no deck plans, only the sizes of their
// stat blocks). A ship's size sets how many 5-foot squares it covers on a hangar floor (a Medium
// ship is 80 by 50 feet) and a hangar is built to hold the largest ship that berths in it with a
// margin round it. Inside, the party's ship has one deck, drawn on the 3D map: the bow to the east
// with the pilot's seat, navigation, and gunnery, bunks and a table amidships, cargo and the
// reactor aft, and the boarding ramp at the stern. The party boards by tapping the ship, flies
// by tapping the pilot's seat (the helm lists every take-off, landing and jump from where the
// ship stands) and walks down the ramp to leave. The deck is a room of a building of type
// "starship" that stands wherever its ship does.
// ---------------------------------------------------------------------------------------------

export const SHIP_FOOTPRINT: Record<string, [number, number]> = { Tiny: [6, 4], Small: [10, 6], Medium: [16, 10], Large: [26, 14], Huge: [40, 22], Gargantuan: [56, 30] };
export const footprintOf = (size: string): [number, number] => SHIP_FOOTPRINT[size] ?? SHIP_FOOTPRINT.Small;

// The floor a hangar needs for the ships that berth in it (an empty berth is for a Medium ship)
export function hangarRange(room: Pick<Area, "ships">): [number, number, number, number] {
  const base = ROOM_PLANS.find((p) => p.match.test("hangar"))!.size;
  const feet = (room.ships.length ? room.ships : [{ size: "Medium" }]).map((s) => footprintOf(s.size));
  const width = feet.reduce((sum, [w]) => sum + w, 0) + 2 * (feet.length - 1) + 8;
  const height = Math.max(...feet.map(([, h]) => h)) + 6;
  const w = Math.max(base[0], width);
  const h = Math.max(base[2], height);
  return [w, w + 2, h, h + 2];
}

const DECK_SIZE: Record<string, [number, number]> = { Tiny: [5, 3], Small: [10, 6], Medium: [16, 9], Large: [26, 13], Huge: [38, 19], Gargantuan: [52, 26] };
export const deckIdOf = (shipId: string) => `deck-${shipId}`;
export const shipBuildingIdOf = (shipId: string) => `ship-${shipId}`;
export const STATION = "station:";

// The deck of a ship: stations at the bow, bunks and a table amidships, cargo and engines aft
export function shipDeck(ship: Pick<Ship, "id" | "size">): RoomLayout {
  const [W, H] = DECK_SIZE[ship.size] ?? DECK_SIZE.Small;
  const rank = Math.max(0, SHIP_SIZE_ORDER.indexOf(ship.size));
  const assets: RoomAsset[] = [];
  let n = 0;
  const mid = Math.floor(H / 2);
  const add = (name: string, x: number, y: number, w = 1, h = 1, extra: Partial<RoomAsset> = {}) =>
    assets.push({ id: `${ship.id}-d${++n}`, kind: "furniture", name, x, y, w, h, blocks: true, cover: true, ...extra });
  add("Pilot's seat", W - 2, mid, 1, 1, { ref: `${STATION}helm`, cover: false });
  add("Boarding ramp", 0, mid, 1, 1, { ref: `${STATION}ramp`, cover: false });
  if (H >= 5) {
    add("Navigation console", W - 3, Math.max(0, mid - 2), 1, 1, { ref: `${STATION}nav` });
    add("Gunnery seat", W - 3, Math.min(H - 1, mid + 2), 1, 1, { ref: `${STATION}guns` });
  }
  if (rank >= 2) {
    add("Co-pilot's seat", W - 2, mid - 1, 1, 1, { ref: `${STATION}copilot`, cover: false });
    add("Bunk", 4, 0, 2, 1);
    add("Bunk", 7, 0, 2, 1);
    add("Table", Math.floor(W / 2), mid - 3 >= 1 ? mid - 3 : 1, 2, 1, { cover: true });
    add("Reactor core", 1, 0, 2, 2, { ref: `${STATION}engines` });
    add("Crate stack", 1, H - 2, 2, 2);
  } else if (rank === 1) {
    add("Bunk", 4, 0, 2, 1);
    add("Power coupling", 1, 0, 1, 1, { ref: `${STATION}engines` });
    add("Crate stack", 1, H - 2, 2, 2);
  } else {
    add("Power coupling", 1, 0, 1, 1, { ref: `${STATION}engines` });
  }
  if (rank >= 3) {
    for (let i = 0; i < Math.min(4, rank); i++) add("Bunk", 11 + (i % 2) * 3, i < 2 ? 0 : H - 1, 2, 1);
    add("Medical bed", Math.floor(W / 2) + 3, 0, 2, 1);
    add("Gunnery seat", W - 6, 1, 1, 1, { ref: `${STATION}guns` });
    add("Gunnery seat", W - 6, H - 2, 1, 1, { ref: `${STATION}guns` });
    add("Crate stack", 4, H - 2, 2, 2);
    add("Crate stack", 7, H - 2, 2, 2);
  }
  return { x: 0, y: 0, width: W, height: H, assets };
}

// ---------------------------------------------------------------------------------------------
// Crew (house rule; the books give crew actions, not who sits where). The seats of a ship are the
// stations on its deck: the helm, the co-pilot's seat, navigation, engineering and the gunnery seats
// (one on a small ship, up to three on a large one). The character flies the ship from wherever
// they sit and takes the helm's action; each other living party member (not a beast) seated at a
// station gives the ship one more action in a ship fight, and each one at a gunnery seat is a
// gunner, whose shots are not made from the helm (see shipFire). A ship whose crew was never
// assigned is crewed by the first companions in the party order, gunnery seats first.
// ---------------------------------------------------------------------------------------------

export interface Seat {
  id: string; // the deck asset's id
  name: string;
  station: string; // helm, copilot, nav, guns, engines
}

export function seatsOf(layout: RoomLayout | undefined): Seat[] {
  return (layout?.assets ?? []).filter((a) => a.ref?.startsWith(STATION) && a.ref !== `${STATION}ramp`).map((a) => ({ id: a.id, name: a.name, station: a.ref!.slice(STATION.length) }));
}

export interface CrewMember {
  id: string; // "self" for the character
  hp: number;
  kind?: string;
}

// Who is seated where, which of them count, and what that gives a ship fight
export function crewOf(seats: Seat[], assigned: Record<string, string> | undefined, members: CrewMember[]): { seated: Record<string, string>; crew: number; gunners: number } {
  const alive = (id: string) => members.some((m) => m.id === id && m.hp > 0 && m.kind !== "beast");
  let seated: Record<string, string> = {};
  if (assigned) {
    for (const seat of seats) if (assigned[seat.id] && alive(assigned[seat.id])) seated[seat.id] = assigned[seat.id];
  } else {
    // Companions in order, gunnery seats first, up to four
    const free = members.filter((m) => m.id !== "self" && m.hp > 0 && m.kind !== "beast").map((m) => m.id);
    const order = [...seats.filter((x) => x.station === "guns"), ...seats.filter((x) => x.station !== "guns" && x.station !== "helm")];
    order.forEach((seat, i) => {
      if (free[i] && i < 4) seated[seat.id] = free[i];
    });
  }
  // The helm's action is the base one; every other seat gives one, and the character gives one only when someone else flies
  const helm = seats.find((x) => x.station === "helm");
  const flying = helm ? seated[helm.id] : undefined;
  const counted = Object.entries(seated).filter(([seatId, id]) => {
    const seat = seats.find((x) => x.id === seatId);
    if (!seat || seat.station === "helm") return false;
    return id !== "self" || (!!flying && flying !== "self");
  });
  return { seated, crew: Math.min(4, counted.length), gunners: counted.filter(([seatId]) => seats.find((x) => x.id === seatId)?.station === "guns").length };
}

// The ship's own building and deck (made on the first boarding; `from` is the room it was boarded
// from, so that the party steps back out where it came in)
export function boardShip(world: World, ship: Pick<Ship, "id" | "name" | "size" | "role">, berthId: string, from?: string): { world: World; deckId: string } {
  const deckId = deckIdOf(ship.id);
  const buildingId = shipBuildingIdOf(ship.id);
  const parent = world.areas[berthId];
  const areas = { ...world.areas };
  const base = { description: "", danger: 0, occupants: [], ships: [], loot: [], position: parent?.position ?? { x: 0, y: 0, z: 0 } };
  const building: Area = { ...base, ...(areas[buildingId] ?? {}), id: buildingId, kind: "building", name: ship.name, parentId: berthId, type: "starship", tags: [`ship:${ship.id}`], description: `The ${ship.role.toLowerCase()} ${ship.name}.` } as Area;
  const old = areas[deckId];
  const deck: Area = {
    ...base, ...(old ?? {}),
    id: deckId, kind: "room", name: `${ship.name}, main deck`, parentId: buildingId, type: "deck",
    tags: [`ship:${ship.id}`, ...(from ? [`from:${from}`] : (old?.tags ?? []).filter((t) => t.startsWith("from:")))],
    layout: old?.layout ?? shipDeck(ship),
  } as Area;
  areas[buildingId] = building;
  areas[deckId] = deck;
  return { world: { ...world, areas }, deckId };
}

// The ship has flown: its building stands where it now is
export function moveShipInterior(world: World, shipId: string, berthId: string): World {
  const building = world.areas[shipBuildingIdOf(shipId)];
  if (!building || !world.areas[berthId]) return world;
  return { ...world, areas: { ...world.areas, [building.id]: { ...building, parentId: berthId } } };
}

// Where the ramp leads: the room the ship was boarded from if it still stands in that settlement
export function rampLeadsTo(world: World, shipId: string): string | undefined {
  const deck = world.areas[deckIdOf(shipId)];
  const building = world.areas[shipBuildingIdOf(shipId)];
  const berth = building?.parentId ? world.areas[building.parentId] : undefined;
  if (!deck || !berth || berth.kind !== "settlement") return undefined;
  const from = deck.tags.find((t) => t.startsWith("from:"))?.slice(5);
  if (from && world.areas[from] && trailOf(world, from).some((a) => a.id === berth.id)) return from;
  const bay = childrenOf(world, berth.id).filter((b) => b.kind === "building").flatMap((b) => childrenOf(world, b.id)).find((r) => r.kind === "room" && holdsShips(r));
  return bay?.id ?? berth.id;
}

// Every take-off, landing and jump the ship can make from where it stands. A port that is not its
// planet's gateway still lifts off to the orbit.
export function helmExits(world: World, berthId: string): Exit[] {
  const area = world.areas[berthId];
  if (!area) return [];
  const out = exitsOf(world, berthId).filter((e) => e.needsShip);
  if (area.kind === "settlement" && !out.some((e) => e.via === "leave")) {
    const planet = ancestor(world, berthId, "planet");
    if (planet) out.unshift({ to: planet.id, via: "leave", label: LEAVE.settlement!, travel: "", needsShip: true, fuel: tripFuel("surface") });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Taking a ship that is not the party's (house rule; the books give no heist). A ship that is not
// an enemy's can be bought, or taken by a side quest of four stages, each a choice with a check:
//   customs ... bribe the customs officer (credits), or forge a clearance (Deception)
//   terminal .. slice the hangar terminal (Intelligence, a slicer's kit helps). That starts the
//               countdown: the ship lifts off when it runs out, whatever the party has done
//   guards .... intimidate or charm the security (Charisma), or fight them (Strength or Dexterity)
//   lockout ... overcome the ship's lockout (Intelligence, a slicer's or security kit)
// A failed check raises the alarm, a crime the law answers, and the stage can be tried again while
// the countdown lasts. A failed fight, or four failures in all, ends it with the party caught.
// Taking the ship is a heinous crime. Leaving the quest is no crime.
// ---------------------------------------------------------------------------------------------

export type HeistStage = "customs" | "terminal" | "guards" | "lockout";
export type HeistHow = "bribe" | "forge" | "slice" | "intimidate" | "charm" | "fight" | "unlock";
export type HeistEnd = "stolen" | "lifted" | "caught" | "abandoned";
export interface Heist {
  shipId: string;
  shipName: string;
  value: number; // its price, which sets the bribe
  areaId: string; // the place the ship stands in
  stage: HeistStage;
  takeoffAt?: number; // the minute the ship lifts off, once the terminal is sliced
  fails: number;
}

export const HEIST_COUNTDOWN = 45; // minutes from the terminal being sliced to take-off
export const HEIST_MINUTES: Record<HeistStage, number> = { customs: 5, terminal: 10, guards: 10, lockout: 10 };
export const heistDC = (stage: HeistStage, law: number) => (stage === "lockout" ? 12 : 10) + law;
export const bribeCost = (value: number, law: number) => Math.round(value * 0.02 * (law + 1));
export const heistLifted = (heist: Heist, minute: number) => heist.takeoffAt !== undefined && minute >= heist.takeoffAt;

// A heist on a ship at a place, or nothing when the ship is an enemy's or not there
export function startHeist(world: World, shipId: string, areaId: string): Heist | null {
  const ship = world.areas[areaId]?.ships.find((s) => s.id === shipId);
  if (!ship || ship.owner === world.antagonist) return null;
  return { shipId, shipName: ship.name, value: ship.value, areaId, stage: "customs", fails: 0 };
}

// One attempt at the stage the heist is on, made once its minutes have passed (`minute` is the time
// after them). Returns the heist as it now stands (none when it has ended), and the crime to report.
export function heistStep(heist: Heist, how: HeistHow, success: boolean, minute: number): { heist?: Heist; ended?: HeistEnd; crime?: Crime } {
  // Getting the lockout open as the clock runs out still counts: the party is aboard before it lifts
  const aboard = heist.stage === "lockout" && success;
  if (!aboard && heistLifted(heist, minute)) return { ended: "lifted", crime: "theft" };
  const next = (stage: HeistStage, extra: Partial<Heist> = {}): { heist: Heist } => ({ heist: { ...heist, stage, ...extra } });
  const failed = (crime: Crime): { heist?: Heist; ended?: HeistEnd; crime?: Crime } => {
    const fails = heist.fails + 1;
    return fails >= 4 ? { ended: "caught", crime } : { heist: { ...heist, fails }, crime };
  };
  if (heist.stage === "customs") {
    if (success) return next("terminal");
    return failed("trespass");
  }
  if (heist.stage === "terminal") {
    if (success) return next("guards", { takeoffAt: minute + HEIST_COUNTDOWN });
    return failed("theft");
  }
  if (heist.stage === "guards") {
    if (how === "fight") return success ? next("lockout") : { ended: "caught", crime: "assault" };
    if (success) return next("lockout");
    return failed("assault");
  }
  if (success) return { ended: "stolen", crime: "heinous" };
  return failed("theft");
}

// Takes a ship out of the place it stands in, for the party (see Ship in the party's starships)
export function takeShip(world: World, shipId: string): { world: World; ship?: Ship; at?: string } {
  const at = Object.values(world.areas).find((a) => a.ships.some((s) => s.id === shipId));
  if (!at) return { world };
  const ship = at.ships.find((s) => s.id === shipId);
  return { world: updateArea(world, at.id, { ships: at.ships.filter((s) => s.id !== shipId) }).world, ship, at: at.id };
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
  // A way that has to be climbed (out of a pit): the DC of the check
  climb?: number;
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
  // Not equipment: the transport dataset's vehicles and mounts (the client adds them to the stock pool)
  vehicles: { label: "Speeders", categories: ["Vehicle"], lines: [2, 3], each: [1, 2] },
  mounts: { label: "Mounts and beasts", categories: ["Mount"], lines: [3, 5], each: [1, 2] },
  // Droids are not equipment: stat blocks (see droidStock), sold, bought back, repaired and fitted at a droid dealer
  droids: { label: "Droids", categories: ["Droid"], lines: [4, 6], each: [1, 1] },
};
export const MERCHANT_WARES = ["general", "general", "arms", "tech", "medical", "leisure"];
const ROLE_WARES: Record<string, string> = { bartender: "bar", mechanic: "tech", medic: "medical", dockmaster: "spacer", "ticket agent": "spacer", fence: "black", smuggler: "black" };
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
  // Allied and hostile contacts and rivals in the settlement (from downtime): they move how its people take to the customer
  contacts?: { allied: number; hostile: number };
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
  if (customer.contacts?.allied) add(Math.min(2, customer.contacts.allied), "friends in town");
  if (customer.contacts?.hostile) add(-Math.min(2, customer.contacts.hostile), "enemies and rivals in town");
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
  warehouse: [6, 18], "cargo bay": [0, 24], "transit hub": [0, 24], shipyard: [0, 24], "droid dealer": [8, 19], "vehicle dealer": [8, 19],
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
  // `by` is what carries them (a speeder, an airspeeder, a mount or a hauler)
  outing?: { at: string; every: number; phase: number; trip: number; by?: string };
}
export interface Voyage {
  // Area ids: the ship's own berth first, then the ports it calls at (berth rooms, or settlements,
  // planets and systems that nobody has mapped yet)
  ports: string[];
  // Hours in each port, minutes on each leg (from port i to the next), and where in the cycle day 1 starts
  stay: number;
  legs: number[];
  phase: number;
  // Hours in its own berth, where it is most of the time (absent in voyages made before life 5:
  // those stay as long in their own berth as anywhere)
  homeStay?: number;
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
  // What carries a person between settlements: speeder, airspeeder, mount or hauler
  vehicle?: string;
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
  const stayAt = (i: number) => (i === 0 && v.homeStay ? v.homeStay : v.stay) * 60;
  const cycle = v.legs.reduce((a, b) => a + b, 0) + v.ports.reduce((sum, _, i) => sum + stayAt(i), 0);
  let t = (((minutes + v.phase) % cycle) + cycle) % cycle;
  for (let i = 0; i < v.ports.length; i++) {
    if (t < stayAt(i)) return { at: v.ports[i] };
    t -= stayAt(i);
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
    if (where.moving) moving.push({ kind: "person", id: o.id, name: o.name, ...where.moving, occupant: o, ...(o.routine?.outing && settlementOf(world, where.moving.from) !== settlementOf(world, where.moving.to) ? { vehicle: o.routine.outing.by ?? "speeder" } : {}) });
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
  const buildings = childrenOf(world, settlement.id).filter((b) => b.kind === "building" && b.type !== "starship");
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
      if (elsewhere.length && !NIGHT_OWLS.includes(o.role) && r.chance(o.role === "merchant" ? 0.5 : 0.3)) {
        const there = r.pick(elsewhere);
        const trip = routeMinutes(world, settlement.id, there.id) / 60;
        if (trip > 0 && trip <= 6) routine.outing = { at: there.id, every: o.role === "merchant" ? r.int(2, 4) : r.int(4, 7), phase: r.int(0, 6), trip: Math.max(0.5, Math.round(trip * 4) / 4), by: outingVehicle(world, settlement, o.role, Math.max(0.5, trip), r) };
      }
      o.routine = routine;
      // Personal commlinks are cheap and common: a good many of the settlement's people carry one (house rule)
      if (!o.loadout.some((n) => /^commlink/i.test(n)) && r.chance(0.4)) o.loadout.push("Commlink");
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
      ship.voyage = { ports: calls, stay: r.int(12, 36), legs, phase: r.int(0, 3 * DAY), homeStay: r.int(96, 216) };
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
    exits.push({ to, via: "path", label: path.label, travel: path.travel, pathId: path.id, locked: path.locked, hidden: path.hidden, ...(path.climb ? { climb: path.climb } : {}), ...(path.kind === "hyperlane" || path.kind === "sublight" ? { needsShip: true, fuel: tripFuel(path.kind, path.travel), jump: path.kind === "hyperlane" || undefined } : {}) });
  }
  for (const child of childrenOf(world, id)) {
    if (child.gateway && ENTER[area.kind]) exits.push({ to: child.id, via: "enter", label: formOf(child) === "roof" ? "Climb the ladder to" : ENTER[area.kind]!, travel: "", ...(area.kind === "system" || area.kind === "planet" ? { needsShip: true, fuel: tripFuel("surface") } : {}) });
  }
  for (const child of childrenOf(world, id)) {
    if (child.secretEntry) exits.push({ to: child.id, via: "enter", label: `Slip in through the ${child.secretEntry.name.toLowerCase()} to`, travel: "", secret: true, hidden: !child.secretEntry.found || undefined });
  }
  const parent = area.parentId ? world.areas[area.parentId] : undefined;
  if (area.secretEntry && parent) {
    exits.push({ to: parent.id, via: "leave", label: `Slip out through the ${area.secretEntry.name.toLowerCase()} to`, travel: "", secret: true, hidden: !area.secretEntry.found || undefined });
  }
  if (area.gateway && parent && LEAVE[area.kind]) {
    exits.push({ to: parent.id, via: "leave", label: formOf(area) === "roof" ? "Climb down to" : LEAVE[area.kind]!, travel: "", ...(area.kind === "planet" || area.kind === "settlement" ? { needsShip: true, fuel: tripFuel("surface") } : {}) });
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
  // Who sits at which station of the deck (a station's asset id -> "self" for the character or a companion's id)
  crew?: Record<string, string>;
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
    .flatMap((area) => area.loot.filter((c) => !c.looted && !c.node && (c.locked || c.hidden)).map((cache) => ({ area, cache })))
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
  if (target.kind === "loot") return area.loot.filter((c) => !target.cacheId || c.id === target.cacheId).filter((c) => !c.node).every((c) => c.looted);
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
    else if (from.kind !== "system" && from.parentId !== to.parentId && !(path.label === "Catwalk" && from.kind === "room" && ancestor(world, from.id, "settlement")?.id === ancestor(world, to.id, "settlement")?.id) && !(path.label === "Transit line" && from.kind === "building" && ancestor(world, from.id, "planet")?.id === ancestor(world, to.id, "planet")?.id)) problems.push(`The ${path.label} between ${from.name} and ${to.name} crosses out of its ${world.areas[from.parentId!]?.kind}.`);
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

// ---------------------------------------------------------------------------------------------
// Gear, tools, companions and ground transport. What the party carries, and who and what goes
// along with it. Everything that comes from the books is read from the rules data (item
// descriptions, the tools and transport sets derived from the book text); what the books leave
// open is a house rule and is marked as one.
// ---------------------------------------------------------------------------------------------

// Hit die by size (5th edition: Tiny d4 to Gargantuan d20), for what a medpac or repair kit rolls
// when the creature is a stat block with no class
export const HIT_DIE_BY_SIZE: Record<string, number> = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };
export const hitDieOfSize = (size?: string) => HIT_DIE_BY_SIZE[size ?? "Medium"] ?? 8;

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countOf = (text: string, pattern: RegExp): number => {
  const m = text.match(pattern);
  if (!m) return 0;
  return NUMBER_WORDS[m[1].toLowerCase()] ?? (Number(m[1]) || 0);
};

// What using an item does, read from its description (and its category, for those with none).
// `uses` is how many times a kit can be used before it is spent (undefined: once, and it is gone).
export type GearUse =
  | { kind: "heal"; uses?: number }
  | { kind: "repair"; uses?: number }
  | { kind: "stabilize"; target: "organic" | "droid"; uses?: number }
  | { kind: "antidote"; uses?: number }
  | { kind: "substance"; ability?: string; pool?: "tech" | "force"; temp?: string; poolDice?: string; lowDice?: string; wisdomDc: number; constitutionDc: number; alcohol?: boolean }
  | { kind: "explosive"; form: "grenade" | "mine" | "charge" | "detonator"; radius: number; cone?: boolean; dc: number; save: string; damage: { dice: string; type: string }[]; conditions: string[]; lingers?: boolean }
  | { kind: "poison"; dc: number; dice: string }
  | { kind: "bolt"; dc: number }
  | { kind: "binders"; dc: number }
  | { kind: "spike"; tool: string }
  | { kind: "ram"; bonus: number }
  | { kind: "scout" }
  | { kind: "cutter" }
  | { kind: "jammer" }
  | { kind: "beacon" }
  // Information gear (house rule): a credit chip, a datacard, a datacron or a holocron is read once
  // (a check against `dc`); a commlink or holocomm calls an allied contact
  | { kind: "data"; form: "chip" | "card" | "cron" | "holocron"; dc: number }
  | { kind: "call" }
  | { kind: "game" }
  | { kind: "instrument" }
  | { kind: "tool" };

export interface GearFacts {
  name: string;
  equipmentCategory?: string;
  description?: string;
}

const EXPLOSIVE_CONDITIONS: [RegExp, string][] = [
  [/\bblinded\b/i, "Blinded"], [/\bdeafened\b/i, "Deafened"], [/\bstunned\b/i, "Stunned"], [/\bunconscious\b/i, "Unconscious"],
  [/\bfrightened\b/i, "Frightened"], [/\bshocked\b/i, "Shocked"], [/\bpoisoned\b/i, "Poisoned"], [/\bprone\b/i, "Prone"],
];

export function gearUse(item: GearFacts): GearUse | undefined {
  const name = item.name.toLowerCase();
  const text = (item.description ?? "").replace(/\s+/g, " ");
  const category = item.equipmentCategory ?? "";
  if (category === "Kit" || category === "Tool") return { kind: "tool" };
  if (category === "GamingSet") return { kind: "game" };
  if (category === "MusicalInstrument") return { kind: "instrument" };
  if (category === "Spice" || category === "AlcoholicBeverage") {
    const ability = (text.match(/using (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i) ?? [])[1]?.toLowerCase();
    const pool = /tech points/i.test(text) ? "tech" : /force points/i.test(text) ? "force" : undefined;
    const wis = Number((text.match(/DC (\d+) Wisdom saving throw or experience a low/i) ?? text.match(/DC (\d+) Wisdom saving throw to resist addiction/i) ?? [])[1]) || 14;
    const con = Number((text.match(/DC (\d+) Constitution saving throw (?:to resist addiction|or experience a low)/i) ?? [])[1]) || 14;
    return {
      kind: "substance",
      ability,
      pool,
      temp: (text.match(/gains (\d+d\d+) temporary hit points/i) ?? [])[1],
      poolDice: pool ? (text.match(/increases their current and maximum \w+ points by (\d+d\d+)/i) ?? [])[1] : undefined,
      lowDice: (text.match(/maximum hit points are reduced by (\d+d\d+)/i) ?? text.match(/maximum \w+ points are reduced by (\d+d\d+)/i) ?? [])[1],
      wisdomDc: category === "AlcoholicBeverage" ? con : wis,
      constitutionDc: category === "AlcoholicBeverage" ? wis : con,
      alcohol: category === "AlcoholicBeverage",
    };
  }
  if (category === "Explosive") {
    const form = /^grenade/.test(name) ? "grenade" : /^mine/.test(name) ? "mine" : /^charge/.test(name) ? "charge" : "detonator";
    const cone = /(\d+)-foot cone/i.exec(text);
    const radius = cone ? Number(cone[1]) : Number((text.match(/within (\d+) feet/i) ?? text.match(/(\d+)-foot[- ]radius/i) ?? text.match(/in a (\d+)-foot radius/i) ?? [])[1]) || 10;
    const save = (text.match(/DC \d+ (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i) ?? [])[1]?.toLowerCase() ?? "dexterity";
    const dc = Number((text.match(/DC (\d+) \w+ saving throw/i) ?? [])[1]) || 14;
    const clause = (text.match(/(?:takes|taking) ([^.]*?) damage on a failed save/i) ?? [])[1] ?? "";
    const damage = Array.from(clause.matchAll(/(\d+d\d+)\s+([a-z]+)/gi)).map((m) => ({ dice: m[1], type: m[2].toLowerCase() }));
    const afterSave = text.split(/saving throw\./i).slice(1).join(" ");
    const conditions = EXPLOSIVE_CONDITIONS.filter(([pattern]) => pattern.test(afterSave) || (/gas|fog/.test(name) && pattern.source.includes("poisoned") && pattern.test(text))).map(([, n]) => n);
    return { kind: "explosive", form, radius, cone: !!cone, dc, save, damage, conditions, lingers: /for 1 minute/i.test(text) && /enters|starts its turn/i.test(text) };
  }
  if (category === "Medical") {
    if (/medpac/.test(name)) return { kind: "heal" };
    if (/repair kit/.test(name)) return { kind: "repair", uses: countOf(text, /(\w+) uses/i) || 3 };
    if (/traumakit/.test(name)) return { kind: "stabilize", target: "organic", uses: countOf(text, /(\w+) uses/i) || 5 };
    if (/emergency battery/.test(name)) return { kind: "stabilize", target: "droid", uses: countOf(text, /(\w+) uses/i) || 10 };
    if (/antitoxkit/.test(name)) return { kind: "antidote", uses: countOf(text, /(\w+) charges/i) || 5 };
    if (/^poison/.test(name)) return { kind: "poison", dc: Number((text.match(/DC (\d+)/i) ?? [])[1]) || 14, dice: (text.match(/(\d+d\d+) poison damage/i) ?? [])[1] ?? "2d4" };
    return undefined;
  }
  if (category === "DataRecordingAndStorage") {
    if (/^credit chip/.test(name)) return { kind: "data", form: "chip", dc: Number((text.match(/DC (\d+)/i) ?? [])[1]) || 15 };
    if (/^(datacard|data disk)/.test(name)) return { kind: "data", form: "card", dc: 12 };
    if (/^datacron/.test(name)) return { kind: "data", form: "cron", dc: 15 };
    if (/^holocron/.test(name)) return { kind: "data", form: "holocron", dc: 15 };
  }
  if (category === "Communications" && /^(commlink|holocomm)/.test(name)) return { kind: "call" };
  if (/restraining bolt/.test(name)) return { kind: "bolt", dc: Number((text.match(/DC (\d+) Constitution saving throw/i) ?? [])[1]) || 14 };
  if (/^binders/.test(name)) return { kind: "binders", dc: Number((text.match(/DC (\d+) Strength or Dexterity/i) ?? [])[1]) || 14 };
  if (/computer spike/.test(name)) return { kind: "spike", tool: "Slicer's kit" };
  if (/security spike/.test(name)) return { kind: "spike", tool: "Security kit" };
  if (/ram, portable/.test(name)) return { kind: "ram", bonus: Number((text.match(/\+(\d+) bonus/i) ?? [])[1]) || 4 };
  if (/macrobinoculars/.test(name)) return { kind: "scout" };
  if (/fusion cutter/.test(name)) return { kind: "cutter" };
  if (/comm jammer/.test(name)) return { kind: "jammer" };
  if (/homing beacon/.test(name)) return { kind: "beacon" };
  return undefined;
}

// A tool the character can have proficiency in: the equipment's kits and implements, a gaming set
// or an instrument. Gaming sets and instruments each have one tool entry in the tools data.
export interface ToolFacts {
  name: string;
  kind: "kit" | "implements" | "gaming" | "instrument";
  summary?: string;
  skills?: { skill: string[]; text: string }[];
  feature?: { name: string; text: string };
  activities?: { activity: string; dc: number | null }[];
  worksOn?: string;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// The tool entry for an item the character carries (a Dejarik set is a gaming set)
export function toolFor(itemName: string, category: string | undefined, tools: ToolFacts[]): ToolFacts | undefined {
  if (category === "GamingSet") return tools.find((t) => t.kind === "gaming");
  if (category === "MusicalInstrument") return tools.find((t) => t.kind === "instrument");
  const wanted = squash(itemName);
  return tools.find((t) => squash(t.name) === wanted);
}

// Whether a character is trained with a tool (the tool itself, or its gaming set / instrument group)
export function toolTrained(character: { toolProficiencies?: string[] | null }, itemName: string, category?: string): boolean {
  const known = (character.toolProficiencies ?? []).map(squash);
  const wanted = squash(itemName);
  if (known.includes(wanted)) return true;
  if (category === "GamingSet") return known.some((k) => /gamingset|dejarik|pazaak|sabacc|chancecubes|kirgatz|chattaragul/.test(k));
  if (category === "MusicalInstrument") return known.some((k) => /instrument|bandfill|horn|drum|fanfar|fizzz|flute|lute|mandoviol|ommni|shawm|traz|valahorn|xantha|slitherhorn/.test(k));
  return false;
}

// A tool's special use, as the game applies it: a die (its size is the proficiency bonus, twice
// that with expertise) added once before the next rest, to one thing. Read from the feature's text;
// uses the game cannot apply are kept as notes.
export interface Boon {
  tool: string;
  feature: string;
  kind: "attack" | "damage" | "ac" | "check" | "medpac" | "meal" | "repair" | "herbal" | "poison" | "note";
  die: number;
  text: string;
  // For a boon that belongs to one kind of weapon ("blaster", "vibroweapon", "lightweapon")
  weapon?: string;
}
export function boonOf(tool: Pick<ToolFacts, "name" | "feature">, proficiency: number, expertise = false): Boon | undefined {
  const feature = tool.feature;
  if (!feature) return undefined;
  const text = feature.text;
  const die = Math.max(2, expertise ? proficiency * 2 : proficiency);
  const base = { tool: tool.name, feature: feature.name, die, text };
  const weapon = /lightweapon|focus generator/i.test(text) ? "lightweapon" : /blaster or vibroweapon/i.test(text) ? "blaster or vibroweapon" : /vibroweapon/i.test(text) ? "vibroweapon" : undefined;
  if (/bonus to AC against one attack/i.test(text)) return { ...base, kind: "ac" };
  if (/bonus to one (?:weapon attack|force attack|attack roll)/i.test(text)) return { ...base, kind: "attack", weapon };
  if (/bonus to one weapon damage roll|bonus to one force damage/i.test(text)) return { ...base, kind: "damage", weapon };
  if (/Hone Blade|extra damage equal to your Intelligence modifier/i.test(`${feature.name} ${text}`)) return { ...base, kind: "damage", weapon: "vibroweapon", die: 0 };
  if (/bonus to one check you make with the instrument/i.test(text)) return { ...base, kind: "check" };
  if (/medpac is consumed/i.test(text)) return { ...base, kind: "medpac" };
  if (/prepare a tasty meal|prepare and serve a meal/i.test(text)) return { ...base, kind: "meal" };
  if (/for each Hit Die the droid spends/i.test(text)) return { ...base, kind: "repair" };
  if (/remove one poison or disease/i.test(text)) return { ...base, kind: "herbal" };
  if (/dose of poison/i.test(text)) return { ...base, kind: "poison" };
  return { ...base, kind: "note", die: 0 };
}

// The condition names an explosive's text can put on a creature, as the conditions data has them
export const EXPLOSIVE_CONDITION_ROUNDS = 10; // "for 1 minute"

// ---------------------------------------------------------------------------------------------
// Gambling (Wretched Hives, "Gambling (Uptime)"): five checks, against the house at a fixed DC or
// against an opponent in a contest of three approaches that beat each other in a circle.
// ---------------------------------------------------------------------------------------------

export type GambleApproach = "deception" | "game" | "insight";
export const GAMBLE_ROUNDS = 5;
export const GAMBLE_HOUSE_DC = 20;
export const GAMBLE_STAKE: [number, number] = [20, 2000];

// The mode of a roll for a player's approach against an opponent's (-1 disadvantage, 0 straight, 1 advantage)
export function gambleMode(mine: GambleApproach, theirs: GambleApproach): number {
  if (mine === theirs) return 0;
  const beats: Record<GambleApproach, GambleApproach> = { deception: "game", game: "insight", insight: "deception" };
  return beats[mine] === theirs ? 1 : -1;
}
export function gambleResult(successes: number, stake: number): { change: number; debt: number; text: string } {
  if (successes <= 0) return { change: -stake, debt: stake, text: "You lose your entire stake, and accrue a debt equal to that amount." };
  if (successes === 1) return { change: -stake, debt: 0, text: "You lose your entire stake." };
  if (successes === 2) return { change: -Math.floor(stake / 2), debt: 0, text: "You lose half your stake." };
  if (successes === 3) return { change: 0, debt: 0, text: "You break even. Not bad." };
  if (successes === 4) return { change: stake, debt: 0, text: "You win an amount equal to your stake." };
  return { change: stake * 3, debt: 0, text: "You win an amount equal to three times your stake." };
}
// The chance that a round draws attention (10% for each success, Wretched Hives)
export const GAMBLE_COMPLICATION = 0.1;
export const GAMBLE_COMPLICATIONS = [
  "You are accused of cheating. You decide whether you did cheat or were framed.",
  "The town guards raid the gambling hall.",
  "A noble in town loses badly to you and loudly vows to get revenge.",
  "You won a sum from a low-ranking member of a nefarious guild, and the guild wants its money back.",
  "A local crime boss insists you start frequenting their gambling parlor, and no others.",
  "A high-stakes gambler insists that you take part in a game.",
];

// ---------------------------------------------------------------------------------------------
// Companions: the people and creatures that go along with the party. Each comes from a stat block
// of the rules data, so it fights with the numbers printed there.
//   hireling  a mercenary, bounty hunter or pilot, paid by the day (house rule: the books give no wages)
//   freed     someone set free from bonds, who chose to follow the party
//   droid     a disabled enemy droid mended and put under a restraining bolt, or reprogrammed
//   beast     a creature gentled with Animal Handling, or a mount bought in a market
//   character another of the user's characters, brought along as they stand on their sheet
// ---------------------------------------------------------------------------------------------

export type CompanionKind = "hireling" | "freed" | "droid" | "beast" | "character";

export interface Companion {
  id: string;
  name: string;
  kind: CompanionKind;
  statBlock?: string;
  species?: string;
  role: string;
  size?: string;
  creature?: string;
  armorClass: number;
  maxHp: number;
  hp: number;
  attack?: Occupant["attack"];
  profile?: StatProfile;
  speed: number;
  saves?: Record<string, number>;
  cr?: string;
  xp?: number;
  loadout: string[];
  // Credits a day (house rule)
  wage: number;
  // Can be ridden: a beast of a size that carries a rider
  mount?: boolean;
  // The restraining bolt on a droid (its grade), or "reprogrammed"
  bolt?: string;
  // The minute of the clock they joined, and how they came to
  joined: number;
  how?: string;
  // A droid's customizations fitted, the slots its motor supports, and the armor class and speed
  // it had before any (house rule: plating sets a base, so they are worked out from these)
  custom?: string[];
  motor?: number;
  stock?: { armorClass: number; speed: number };
}

export const COMPANION_LIMIT = 4;

// House rule: a share of what a creature is worth in experience, for each day of its service.
// CR 1/8 and 1/2 cost 10 credits a day, CR 1 20, CR 2 45, CR 5 180.
export const wageFor = (xp = 50) => Math.max(10, Math.round(xp / 10));
// House rule: a signing fee of five days' wages, 5% less for each step of goodwill
export const hireFee = (xp = 50, attitude = 0) => Math.max(0, Math.round(wageFor(xp) * 5 * (1 - 0.05 * attitude)));

// The roles that are for hire (house rule): those whose trade is going where the work is
export const HIRE_ROLES = ["bounty hunter", "smuggler", "pilot for hire", "mercenary"];
export const canHire = (o: Occupant) => HIRE_ROLES.includes(o.role) && o.disposition !== "hostile" && !!o.hitPoints && !o.captive && !o.disabled;

// A beast that can be ridden: one of the book's mounts, or any beast big enough to carry a rider
export function carriesRider(creature: { name?: string; size?: string }, mounts: { name: string }[] = []): boolean {
  const name = (creature.name ?? "").toLowerCase();
  return /large|huge|gargantuan/i.test(creature.size ?? "") || mounts.some((m) => name.includes(m.name.toLowerCase()));
}

// One of a group of occupants, as a companion
export function companionFrom(o: Occupant, kind: CompanionKind, joined: number, id: string, extra: Partial<Companion> = {}, mounts: { name: string }[] = []): Companion {
  const hurt = o.wounds?.[0];
  return {
    id,
    name: o.name,
    kind,
    statBlock: o.statBlock,
    species: o.species,
    role: o.role,
    size: o.size,
    creature: o.creature,
    armorClass: o.armorClass ?? 10,
    maxHp: o.hitPoints ?? 4,
    hp: Math.max(1, Math.min(o.hitPoints ?? 4, hurt ?? o.hitPoints ?? 4)),
    attack: o.attack,
    profile: o.profile,
    speed: o.speed || 30,
    saves: o.saves,
    cr: o.cr,
    xp: o.xp,
    loadout: [...o.loadout],
    wage: kind === "hireling" ? wageFor(o.xp) : 0,
    mount: kind === "beast" && carriesRider(o, mounts),
    joined,
    ...extra,
  };
}

// Bonds on a captive, and how to be rid of them (house rule: the books give the DCs of locks, 15
// for a moderate one, and of reprogramming a security routine, 20)
export interface Captive {
  restraint: "shackles" | "collar" | "cell";
  dc: number;
}
export const FREEING: Record<Captive["restraint"], { label: string; tools: string[]; ability: string[]; skill?: string }> = {
  shackles: { label: "Open the shackles", tools: ["Security kit"], ability: ["dexterity", "intelligence"] },
  cell: { label: "Pick the cell's lock", tools: ["Security kit"], ability: ["dexterity", "intelligence"] },
  collar: { label: "Slice the collar's lock", tools: ["Slicer's kit"], ability: ["intelligence"] },
};

// A Challenge Rating as a number ("1/2" is 0.5)
export const crOf = (o: Pick<Occupant, "cr">): number => {
  const text = String(o.cr ?? "0");
  if (text.includes("/")) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : 0;
  }
  return Number(text) || 0;
};
// Wisdom (Animal Handling) to gentle a wild creature (house rule): 10 + its Challenge Rating
// rounded up, 2 less when it is hurt. The most a character of a level can manage is a creature of
// Challenge Rating level + 2.
export const gentleDC = (o: Pick<Occupant, "cr">, hurt: boolean): number => 10 + Math.ceil(crOf(o)) + (hurt ? -2 : 0);
export const gentleLimit = (level: number) => level + 2;

// Disabled droids: after a fight a droid is not destroyed but powered down. It can be stabilized,
// mended, and put under a restraining bolt or reprogrammed (Restraining bolt, Repair kit and Emergency battery items; Slicer's kit).
export const isDroid = (o: Pick<Occupant, "creature" | "name">) => /droid/i.test(o.creature ?? "") || /\bdroid\b/i.test(o.name);
export const repairDC = (o: Pick<Occupant, "cr">) => 10 + Math.max(0, Math.ceil(crOf(o)));
// Reprogramming a droid that is not under a bolt: "reprogram a security routine" is DC 20 (Slicer's kit)
export const reprogramDC = (o: Pick<Occupant, "cr">) => 20 + (crOf(o) >= 5 ? 2 : 0);

// ---------------------------------------------------------------------------------------------
// Ground transport. Routes between settlements give their length in kilometres. The party can go
// on foot at the Player's Handbook travel pace (3 miles an hour, 8 hours a day), on a mount at its
// speed in feet / 10 miles an hour (the same scale: 30 ft. is 3 mph), in a speeder of its own at
// the miles an hour of the Expanded Content's Vehicles table, or in a hired ride (house rule: the
// books price no fares).
// ---------------------------------------------------------------------------------------------

export const KM_PER_MILE = 1.609;
export interface Transport {
  mounts: { name: string; cost: number; speed: number; capacity: number }[];
  vehicles: { name: string; cost: number; mph: number }[];
  pace: { pace: string; feetPerMinute: number; milesPerHour: number; milesPerDay: number; effect: string }[];
}
export interface Vehicle {
  id: string;
  name: string;
  // The kind in the Vehicles table: Airspeeder, Landspeeder or Speederbike
  model: string;
  mph: number;
  value: number;
  status: "parked" | "wrecked";
  owner: string;
  // House rule: the Vehicles table has no seats
  seats: number;
  // Belongs to the people of the settlement, not to an enemy: taking it is theft
  civil?: boolean;
}
export interface PartyVehicle extends Vehicle {
  // The settlement it is parked at
  areaId: string;
}
export const SEATS: Record<string, number> = { Speederbike: 2, Airspeeder: 4, Landspeeder: 6 };

export const kmOf = (travel = ""): number | undefined => {
  const m = travel.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return m ? Number(m[1]) : undefined;
};

// Hours and nights: a day's travel is 8 hours at the Player's Handbook pace, and the other 16 are rest
export function journeyMinutes(travelHours: number): number {
  const nights = Math.max(0, Math.ceil(travelHours / 8) - 1);
  return Math.max(1, Math.round((travelHours + nights * 16) * 60));
}

export interface Ride {
  id: string;
  label: string;
  minutes: number;
  fare: number;
  // The party vehicle or mount used
  vehicleId?: string;
  mountId?: string;
  // Why it cannot be used just now
  blocked?: string;
}

export function groundRides(args: { km: number; vehicles: PartyVehicle[]; companions: Companion[]; riders: number; transport: Transport; hire?: boolean | "remote"; transit?: boolean }): Ride[] {
  const { km, vehicles, companions, riders, transport } = args;
  const rides: Ride[] = [];
  const pace = transport.pace.find((p) => p.pace === "Normal")?.milesPerHour ?? 3;
  rides.push({ id: "foot", label: "On foot", minutes: journeyMinutes(km / (pace * KM_PER_MILE)), fare: 0 });
  const mounts = companions.filter((c) => c.mount && c.hp > 0);
  mounts.forEach((mount, i) => {
    // 30 ft. a round is the walking pace of 3 miles an hour, so a speed of N feet is N / 10 mph
    const mph = Math.max(1, mount.speed / 10);
    const twin = mounts.filter((m) => m.name === mount.name).length > 1;
    rides.push({ id: `mount-${mount.id}`, label: `Riding ${mount.name}${twin ? ` (${mount.hp}/${mount.maxHp} hp)` : ""}`, minutes: journeyMinutes(km / (mph * KM_PER_MILE)), fare: 0, mountId: mount.id });
  });
  for (const v of vehicles) {
    const blocked = v.status === "wrecked" ? "wrecked: needs repair" : riders > v.seats ? `seats ${v.seats}, party of ${riders}` : undefined;
    rides.push({ id: `vehicle-${v.id}`, label: v.name, minutes: Math.max(5, Math.round((km / (v.mph * KM_PER_MILE)) * 60)), fare: 0, vehicleId: v.id, ...(blocked ? { blocked } : {}) });
  }
  if (args.hire) {
    const mph = transport.vehicles.find((v) => v.name === "Landspeeder")?.mph ?? 220;
    // House rule: a town's cab or a village's hauler. The hauler (outposts, villages) is dearer and
    // slower to find, 2 credits + 1 per 10 km in a town and double that out in the sticks
    const remote = args.hire === "remote";
    rides.push({ id: "hired", label: remote ? "Hired hauler" : "Hired ride", minutes: Math.max(10, Math.round((km / (mph * KM_PER_MILE)) * 60) + (remote ? 40 : 10)), fare: (2 + Math.ceil(km / 10)) * (remote ? 2 : 1) });
  }
  // The transit line between two hubs: a fast mass-transit train that anyone may take, at a fare
  // far under a hired ride's (house rule: the books price no fares)
  if (args.transit) rides.push({ id: "transit", label: "Transit line", minutes: Math.max(10, Math.round((km / (180 * KM_PER_MILE)) * 60) + 15), fare: 2 + Math.ceil(km / 12) });
  return rides;
}

// Who runs a ride for hire: only places with a port or a town's worth of traffic (house rule)
export const hasRidesForHire = (world: World, settlementId: string): false | true | "remote" => {
  const s = world.areas[settlementId];
  if (!s || s.kind !== "settlement") return false;
  if (["city", "town", "station"].includes(s.type)) return true;
  return ["outpost", "village"].includes(s.type) ? "remote" : false;
};

// The vehicle a model name stands for (74-Z Speeder Bike is a speederbike)
export function modelOf(name: string, vehicles: Transport["vehicles"]): Transport["vehicles"][number] | undefined {
  const n = name.toLowerCase();
  if (/bike/.test(n)) return vehicles.find((v) => /bike/i.test(v.name));
  return vehicles.find((v) => n.includes(v.name.toLowerCase()));
}

// Who runs a speeder lot or a stable (life 5): the shopfront of a city's or town's workshop sells
// speeders; one stall in two of a town's or outpost's market, on a world that is not paved over, sells mounts
function dealerTrade(world: World, building: Area, room: Area, r: Random): string | undefined {
  const settlement = ancestor(world, room.id, "settlement");
  const planet = ancestor(world, room.id, "planet");
  if (!settlement) return undefined;
  if (building.type === "workshop" && /shopfront/i.test(room.name) && ["city", "town", "station"].includes(settlement.type)) return "vehicles";
  if (building.type === "vehicle dealer" && /showroom/i.test(room.name)) return "vehicles";
  if (building.type === "droid dealer" && /showroom|repair bay/i.test(room.name)) return "droids";
  if (building.type === "market" && /stalls/i.test(room.name) && ["town", "outpost", "village"].includes(settlement.type) && !["urban", "gas giant"].includes(planet?.type ?? "") && hashOf(room.id) % 2 === 0) return "mounts";
  return undefined;
}

// People held in bonds, for freeing (house rule; see Captive). Each is someone of the planet's peoples.
function captivesOf(ctx: Context, room: Area, building: Area, speciesNames: string[]): Occupant[] {
  const r = ctx.random;
  const pool = ctx.catalog.monsters.filter((m) => isType(m, /humanoid|human/i) && m.experiencePoints <= 200 && !/trooper|guard|champion|officer|inquisitor|hutt|kolkpravis|trandoshan|tusken|admiral|crime lord|wrestler|gorax|navy|death|purge|isb/i.test(m.name));
  if (!pool.length) return [];
  return Array.from({ length: r.int(1, 3) }, () => {
    const restraint: Captive["restraint"] = building.type === "camp" ? (r.chance(0.5) ? "collar" : "shackles") : building.type === "hideout" ? "cell" : r.chance(0.3) ? "collar" : "cell";
    const block = fromStatBlock(ctx, r.pick(pool), 1, "captive", "friendly");
    return { ...block, name: personName(r), species: speciesFor(ctx, speciesNames), loadout: [], captive: { restraint, dc: restraint === "collar" ? 20 : 15 } };
  });
}

// Speeders at an enemy's base are a prize (a bike or two); wrecks in the wild want mending
function placeVehicles(ctx: Context, building: Area) {
  const transport = ctx.catalog.transport;
  if (!transport || building.vehicles?.length) return;
  const r = ctx.random;
  const owner = building.faction ?? ctx.world.antagonist;
  const make = (model: string, name: string, status: Vehicle["status"]): Vehicle | undefined => {
    const v = transport.vehicles.find((x) => x.name === model);
    return v ? { id: nextId(ctx.world, "v"), name, model: v.name, mph: v.mph, value: v.cost, status, owner, seats: SEATS[v.name] ?? 2 } : undefined;
  };
  const bikeName = ctx.catalog.monsters.find((m) => /speeder bike/i.test(m.name))?.name ?? "Speederbike";
  let found: Vehicle | undefined;
  if (building.type === "wreck") found = make(r.pick(["Landspeeder", "Airspeeder", "Speederbike"]), "Wrecked speeder", "wrecked");
  else if (["camp", "hideout", "garrison", "command post"].includes(building.type) && r.chance(0.45)) found = make("Speederbike", bikeName, "parked");
  if (found) building.vehicles = [found];
  // Rides parked at the buildings of a settlement belong to its people (house rule): one at a
  // house, shop or port in about half of them, and a showroom's worth at a vehicle dealer
  else if (!BUILDINGS[building.type]?.hostile && CIVIL_RIDES[building.type] !== undefined && r.chance(CIVIL_RIDES[building.type])) {
    const models = building.type === "vehicle dealer" ? ["Landspeeder", "Speederbike", "Airspeeder", r.pick(["Landspeeder", "Speederbike"])] : [r.pick(["Landspeeder", "Landspeeder", "Speederbike", "Airspeeder"])];
    const owners = ["Dren", "Mala", "Orrin", "Teva", "Kell", "Sorra", "Bram", "Iska"];
    const vehicles = models.flatMap((m, i) => {
      const v = make(m, `${r.pick(owners)}'s ${m.toLowerCase()}`, "parked");
      return v ? [{ ...v, civil: true, owner: building.type === "vehicle dealer" ? "the dealer" : v.name.split("'")[0], name: building.type === "vehicle dealer" ? `${m} for sale` : v.name, id: v.id + i }] : [];
    });
    if (vehicles.length) building.vehicles = vehicles;
  }
}
const CIVIL_RIDES: Record<string, number> = { residences: 0.6, tenements: 0.4, market: 0.5, workshop: 0.6, cantina: 0.4, spaceport: 0.5, "transit hub": 0.3, "vehicle dealer": 1, warehouse: 0.3, medcenter: 0.3, promenade: 0.4 };

// The party's ships stand in the berths of the port they are at: where a berth has been left
// empty (a ship bought or taken from it, or one away on a voyage) the party's ship takes it. For
// showing only, like withPresence.
export function withPartyShips<T extends World>(world: T, ships: PartyShip[]): T {
  if (!ships.length) return world;
  const areas = { ...world.areas };
  const used = new Set<string>();
  for (const ship of ships) {
    const place = world.areas[ship.areaId];
    if (!place) continue;
    // Berth rooms under the settlement (or the building) the ship is at, the ones holding ships first
    const rooms = Object.values(world.areas).filter((a) => a.kind === "room" && a.layout && trailOf(world, a.id).some((t) => t.id === place.id) && a.layout.assets.some((x) => x.kind === "ship"));
    for (const room of rooms) {
      const current = areas[room.id];
      const berth = current.layout!.assets.find((a) => a.kind === "ship" && !used.has(a.id) && !current.ships.some((s) => s.id === a.ref));
      if (!berth) continue;
      used.add(berth.id);
      areas[room.id] = {
        ...current,
        ships: [...current.ships, ship],
        layout: { ...current.layout!, assets: current.layout!.assets.map((a) => (a === berth ? { ...a, ref: ship.id, name: ship.name } : a)) },
      };
      break;
    }
  }
  return { ...world, areas };
}

// ---------------------------------------------------------------------------------------------
// Downtime (Wretched Hives, Entertainment and Downtime). The tables and the words of every
// activity come from the derived `downtime.json` (see deriveDowntime in the importer); what is
// worked out here is the book's procedure: spend the money, make up to three checks (each one
// after the first five harder), add the roll modifier to a d100, read the table, and see whether a
// complication follows. Where the book leaves a result to the GM (who a contact is, what a piece
// of lore says) a house rule decides, and says so in the result.
// ---------------------------------------------------------------------------------------------

export interface DowntimeRow {
  min?: number;
  max?: number;
  text: string;
}
export interface DowntimeTable {
  title: string;
  die: number;
  rows: { roll: number; text: string }[];
}
export interface DowntimeActivityData {
  id: string;
  name: string;
  intro: string;
  resources: string;
  // Everything under Resources, its sub-headings too ("[Skill Training, ...] ...")
  resourcesFull?: string;
  resolution: string;
  complicationText: string;
  results: DowntimeRow[];
  complications: DowntimeTable[];
  uptime?: { resources: string; resolution: string; results?: { successes?: number; dc?: number; text: string }[] };
}
export interface DowntimeData {
  rollModifier: { dc: number; bonus: number }[];
  rivals: string[];
  activities: DowntimeActivityData[];
  sellers: Record<string, { dc: number; modifier: number }>;
  ingredients: Record<string, { cr: { min: number; max?: number }; modifier: number }>;
  blueprintDc: Record<string, number>;
  reverseDc: Record<string, number>;
  value: Record<string, { min: number; max?: number }>;
  valueModifier: Record<string, number>;
  buyers: Record<string, { days: string; modifier: number }>;
}

export const DOWNTIME = downtimeData as unknown as DowntimeData;
export const downtimeActivity = (id: string): DowntimeActivityData | undefined => DOWNTIME.activities.find((a) => a.id === id);

// A workweek is five days of work and two of rest
export const WORKWEEK = 7;

// A check's total against the DCs of the roll modifier table, the DCs raised by 5 for each check
// made beyond the first: the modifier it earns, or none when it meets no DC
export function checkModifier(total: number, attempt = 0): { bonus: number; met: boolean; dc: number | null } {
  let best: { bonus: number; dc: number } | null = null;
  for (const tier of DOWNTIME.rollModifier) if (total >= tier.dc + 5 * attempt) best = { bonus: tier.bonus, dc: tier.dc + 5 * attempt };
  return best ? { bonus: best.bonus, met: true, dc: best.dc } : { bonus: 0, met: false, dc: null };
}

// The row of a d100 table a total lands on
export function resultRow(activity: DowntimeActivityData, total: number): DowntimeRow {
  const rows = activity.results;
  return (
    rows.find((r) => (r.min === undefined || total >= r.min) && (r.max === undefined || total <= r.max)) ??
    (total < (rows[0].max ?? 40) ? rows[0] : rows[rows.length - 1])
  );
}

// What an activity asks, read from its Resources and Resolution text
export interface ActivitySpec {
  id: string;
  name: string;
  // Workweeks it takes (the days of an activity that is not measured in workweeks)
  workweeks: number;
  days?: number;
  // The least money that has to be spent
  cost: number;
  // Costs by the social class dealt with (carousing, espionage)
  tiers?: { cls: "lower" | "middle" | "upper"; cost: number }[];
  // A stake, between a least and a most (gambling)
  stake?: { min: number; max: number };
  // A bonus of +1 for each so many credits beyond so many, up to a maximum (bounty hunting, research)
  spendBonus?: { per: number; beyond: number; max: number };
  // The checks that may be made: ability, and the skill or tool in brackets
  checks: { ability: string; using: string }[];
  // Up to three checks, each after the first five harder
  multi: boolean;
  // An entry fee and the rent of a vehicle (racing)
  entry?: number;
  rent?: number;
}

const money = (s: string) => Number(s.replace(/,/g, ""));

export function activitySpec(activity: DowntimeActivityData): ActivitySpec {
  const text = `${activity.resources} ${activity.resolution}`;
  const first = activity.resources.match(/([\d,]+)\s*cr/);
  const tiers = activity.resources.match(/lower-, middle-, or upper-class costs ([\d,]+), ([\d,]+),? or ([\d,]+) cr/i);
  const stake = activity.resources.match(/stake of at least ([\d,]+) cr to a maximum of ([\d,]+) cr/i);
  const bonus = text.match(/\+1 bonus per ([\d,]+) cr (?:spent )?beyond the initial ([\d,]+) cr, up to a maximum bonus of \+(\d+)/i);
  const abilities = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma";
  const checks: { ability: string; using: string }[] = [];
  for (const m of activity.resolution.matchAll(new RegExp(`(${abilities}) \\(([^)]+)\\)`, "g"))) {
    if (!checks.some((c) => c.ability === m[1].toLowerCase() && c.using === m[2].toLowerCase())) checks.push({ ability: m[1].toLowerCase(), using: m[2].toLowerCase() });
  }
  // "an Intelligence check with the appropriate gaming set / artisan's tools"
  for (const m of activity.resolution.matchAll(new RegExp(`(${abilities}) check with (?:the appropriate|a|an) ([a-z' ]+?)(?:[,.]| or )`, "g"))) {
    const using = /gaming/i.test(m[2]) ? "gaming set" : /artisan|tools/i.test(m[2]) ? "tools" : m[2].trim();
    if (!checks.some((c) => c.using === using)) checks.push({ ability: m[1].toLowerCase(), using });
  }
  if (/attack roll using one of the character's weapons/i.test(activity.resolution)) checks.push({ ability: "strength", using: "attack roll" });
  const days = activity.resources.match(/at least (\w+) days/i);
  const entry = activity.resources.match(/([\d,]+) cr entry fee/i);
  const rent = activity.resources.match(/rent one for ([\d,]+) cr/i);
  return {
    id: activity.id,
    name: activity.name,
    workweeks: 1,
    ...(days ? { days: ({ five: 5, ten: 10, seven: 7 } as Record<string, number>)[days[1].toLowerCase()] ?? Number(days[1]) } : {}),
    cost: first ? money(first[1]) : 0,
    ...(tiers ? { tiers: [{ cls: "lower" as const, cost: money(tiers[1]) }, { cls: "middle" as const, cost: money(tiers[2]) }, { cls: "upper" as const, cost: money(tiers[3]) }] } : {}),
    ...(stake ? { stake: { min: money(stake[1]), max: money(stake[2]) } } : {}),
    ...(bonus ? { spendBonus: { per: money(bonus[1]), beyond: money(bonus[2]), max: Number(bonus[3]) } } : {}),
    checks,
    multi: /at least one, but up to three/i.test(activity.resolution),
    ...(entry ? { entry: money(entry[1]) } : {}),
    ...(rent ? { rent: money(rent[1]) } : {}),
  };
}

// The bonus that spending more earns (+1 for each so many credits beyond the least)
export function spendBonus(spec: ActivitySpec, spent: number): number {
  if (!spec.spendBonus) return 0;
  return Math.max(0, Math.min(spec.spendBonus.max, Math.floor((spent - spec.spendBonus.beyond) / spec.spendBonus.per)));
}

// What a result says happens, read from its words. Money comes back as `credits`; `stakeBack` is the
// share of the stake returned (gambling: the stake is paid first, and what is returned is what the
// result gives back).
export interface DowntimeOutcome {
  credits: number;
  stakeBack?: number;
  allied: number;
  hostile: number;
  blackmail: number;
  lore: number;
  loreItem: boolean;
  jailed: boolean;
  exhaustion: number;
  title: boolean;
  favor: boolean;
  advance: number;
  repairs: number;
}

const COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 };

export function outcomeOf(text: string): DowntimeOutcome {
  const out: DowntimeOutcome = { credits: 0, allied: 0, hostile: 0, blackmail: 0, lore: 0, loreItem: false, jailed: false, exhaustion: 0, title: false, favor: false, advance: 0, repairs: 0 };
  const t = text.replace(/,/g, "");
  const earn = t.match(/(?:earn(?:ing)?|win(?:ning)?|collect|resulting in a|result in a|paying)\D{0,24}?(\d+) cr/i);
  if (earn && !/left over/i.test(t)) out.credits = Number(earn[1]);
  const leftOver = t.match(/with (\d+) cr left over/i);
  if (leftOver) out.credits = Number(leftOver[1]);
  // Gambling's results are shares of the stake
  if (/lose (?:your|their) entire stake/i.test(t)) out.stakeBack = 0;
  else if (/lose half your stake/i.test(t)) out.stakeBack = 0.5;
  else if (/break even/i.test(t)) out.stakeBack = 1;
  else if (/win an amount equal to three times your stake/i.test(t)) out.stakeBack = 4;
  else if (/win an amount equal to your stake/i.test(t)) out.stakeBack = 2;
  const allied = t.match(/(?:make|makes) (an?|one|two|three) allied contacts?/i);
  if (allied) out.allied = COUNTS[allied[1].toLowerCase()] ?? 1;
  if (/hostile contact/i.test(t)) out.hostile = /two or more hostile/i.test(t) ? 2 : 1;
  const blackmail = t.match(/blackmail (one|two|three) (?:person|people)/i);
  if (blackmail) out.blackmail = COUNTS[blackmail[1].toLowerCase()];
  const lore = t.match(/learn (one|two|three|five) pieces? of lore/i);
  if (lore) out.lore = COUNTS[lore[1].toLowerCase()] ?? 5;
  out.loreItem = /location of an item worth/i.test(t);
  out.jailed = /(?:caught|arrested|jailed|jail)\b/i.test(t);
  out.exhaustion = /exhaustion/i.test(t) ? 1 : 0;
  out.title = /\b(title|nickname)\b/i.test(t);
  out.favor = /\bfavor\b/i.test(t);
  const advance = t.match(/advancing (?:only )?(half|one|two|three|four) workweeks?/i);
  if (advance) out.advance = COUNTS[advance[1].toLowerCase()] ?? 1;
  const repairs = t.match(/(\d+) cr in repairs/i);
  if (repairs) out.repairs = Number(repairs[1]);
  return out;
}

// The chance of a complication, in percent, from the activity's own words: "a 10 percent chance",
// and "an additional 10 percent chance ... for each check made during Resolution beyond the first"
export function complicationChance(activity: DowntimeActivityData, checksMade = 1, shady = false): number {
  const text = activity.complicationText;
  if (/shady (?:seller|buyer), they have a 50 percent chance/i.test(text)) return shady ? 50 : 10;
  const base = Number(text.match(/(\d+) percent chance/i)?.[1] ?? 10);
  const extra = /additional (\d+) percent chance[^.]*for each check made[^.]*beyond the first/i.exec(text);
  return Math.min(100, base + (extra ? Number(extra[1]) * Math.max(0, checksMade - 1) : 0));
}

// The table complications come from: the one for the social class where an activity has one for each
export function complicationTable(activity: DowntimeActivityData, cls?: "lower" | "middle" | "upper"): DowntimeTable | undefined {
  if (activity.complications.length > 1 && cls) {
    const named = activity.complications.find((t) => new RegExp(`^${cls}`, "i").test(t.title));
    if (named) return named;
  }
  return activity.complications[0];
}

// What a complication does that the game can apply, read from its text: money lost (a number, or
// dice times a number), a debt, a scar or nickname, a rival or foe made, a spell in jail
export interface ComplicationEffect {
  credits: number;
  rival: boolean;
  jailed: boolean;
  scar: boolean;
  nickname: boolean;
  banned: boolean;
  text: string;
}
export function complicationEffect(text: string, dice: (expr: string) => number): ComplicationEffect {
  const t = text.replace(/,/g, "");
  let credits = 0;
  const lifted = t.match(/(\d+d\d+) x (\d+) cr/i);
  if (lifted && /lifts|steal|lose|pays?/i.test(t)) credits = dice(lifted[1]) * Number(lifted[2]);
  const extra = t.match(/spent an additional (\d+) cr/i);
  if (extra) credits = Number(extra[1]);
  return {
    credits,
    rival: /\b(ire|revenge|foe|vows?|swears?|wants? (?:their|it) money back|challenged you|will kill|besmirching|grudge|bounty)\b/i.test(t),
    jailed: /\bjail|arrested\b/i.test(t),
    scar: /\bscar\b/i.test(t),
    nickname: /nickname/i.test(t),
    banned: /\bbanned\b/i.test(t),
    text,
  };
}

// Enhanced items for sale or to be found: their value by rarity. The book rolls percentile dice
// twice, keeps the higher and multiplies by the rarity's modifier (not below the rarity's least; half
// for consumables and modifications). Here the two rolls come from the item's own name, so a given
// item is always worth the same.
export function enhancedValue(item: { id?: string; name: string; searchableRarity?: string; type?: string }): number {
  const rarity = item.searchableRarity ?? "Standard";
  const modifier = DOWNTIME.valueModifier[rarity] ?? 10;
  const band = DOWNTIME.value[rarity] ?? { min: 0 };
  let h = 2166136261;
  for (const ch of item.id ?? item.name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const a = (h % 100) + 1;
  const b = ((h >>> 8) % 100) + 1;
  let value = Math.max(a, b) * modifier;
  value = Math.max(value, band.min);
  if (band.max !== undefined) value = Math.min(value, band.max);
  if (item.type === "Consumable" || item.type === "ItemModification") value = Math.round(value / 2);
  return Math.max(1, value);
}

// The multiplier of an item's value a seller asks, or a buyer offers, from the roll's row text:
// "a seller asking five times the item's value, or a shady seller asking two and a half times"
export function priceFactor(text: string): { plain: number; shady: number | null; favor: boolean } {
  const words: Record<string, number> = { "one-quarter": 0.25, "one quarter": 0.25, half: 0.5, "the full": 1, "one and a half times": 1.5, "two and a half times": 2.5, twice: 2, "five times": 5 };
  const find = (s: string): number => {
    for (const [word, value] of Object.entries(words)) if (s.toLowerCase().includes(word)) return value;
    return 1;
  };
  const shady = text.split(/or a shady (?:seller|buyer)/i);
  const isShadyOnly = /^\s*a shady (?:seller|buyer)/i.test(text);
  return {
    plain: isShadyOnly ? find(text) : find(shady[0]),
    shady: shady[1] !== undefined ? find(shady[1]) : isShadyOnly ? find(text) : null,
    favor: /\bfavor\b/i.test(text),
  };
}

// The rarity of the best enhanced item a check finds a seller for: the highest whose DC it meets
export function foundRarity(total: number): string | null {
  let best: string | null = null;
  for (const [rarity, row] of Object.entries(DOWNTIME.sellers)) if (total >= row.dc) best = rarity;
  return best;
}

// What happens when none of the checks of an activity meets a DC: the book's worked example ends
// "In this instance, ... they are caught and jailed", "they lose their entire stake, and accrue a
// debt equal to that amount", "they lose all of their bouts, and suffer one level of exhaustion"
export function failureOf(activity: DowntimeActivityData): { text: string; outcome: DowntimeOutcome; debt: boolean } | null {
  const found = Array.from(activity.resolution.matchAll(/In this instance[^.]*\./g)).pop();
  if (!found) return null;
  return { text: found[0].replace(/^In this instance,\s*/i, "").replace(/^since they failed to meet a DC,\s*/i, ""), outcome: outcomeOf(found[0]), debt: /accrue a debt/i.test(found[0]) };
}

// The things that can be trained, with their workweeks and the credits a workweek costs (null: the
// tool's own value), read from the Training activity's Resources text
export interface TrainingOption {
  id: string;
  kind: "language" | "weapon" | "tool" | "skill" | "save" | "feat";
  level: "training" | "proficiency" | "expertise";
  label: string;
  weeks: number;
  perWeek: number | null;
}
export function trainingOptions(): TrainingOption[] {
  const text = downtimeActivity("training")?.resourcesFull ?? "";
  const section = (title: RegExp) => text.match(new RegExp(`\\[(?:${title.source})\\]([^\\[]*)`, "i"))?.[1] ?? "";
  const out: TrainingOption[] = [];
  const list = (s: string, re: RegExp) => (s.match(re)?.[1] ?? "").split(/,\s*(?:or\s+)?|\s+or\s+/).map((n) => Number(n.replace(/[^\d]/g, ""))).filter(Boolean);
  const lang = section(/Language or Weapon/);
  const lw = lang.match(/takes (\d+) workweeks and costs ([\d,]+) cr per workweek/);
  if (lw) {
    for (const kind of ["language", "weapon"] as const) out.push({ id: `${kind}`, kind, level: "proficiency", label: kind === "language" ? "Learn a language" : "Train in a weapon", weeks: Number(lw[1]), perWeek: money(lw[2]) });
  }
  const levels = ["training", "proficiency", "expertise"] as const;
  const tool = section(/Tool Training, Proficiency, or Expertise/);
  const toolWeeks = list(tool, /takes ([\d, or]+) workweeks/);
  toolWeeks.forEach((weeks, i) => out.push({ id: `tool-${levels[i]}`, kind: "tool", level: levels[i], label: `Tool: ${levels[i]}`, weeks, perWeek: null }));
  const skill = section(/Skill Training, Proficiency, or Expertise/);
  const skillWeeks = list(skill, /takes ([\d, or]+) workweeks/);
  const credits = (part: string) => Array.from(part.matchAll(/([\d,]+) cr/g)).map((m) => money(m[1]));
  const skillCosts = credits(skill.match(/costs at least ([^.]*?) per workweek/)?.[1] ?? "");
  skillWeeks.forEach((weeks, i) => out.push({ id: `skill-${levels[i]}`, kind: "skill", level: levels[i], label: `Skill: ${levels[i]}`, weeks, perWeek: skillCosts[i] ?? 250 }));
  const save = section(/Saving Throw Training or Proficiency/);
  const saveWeeks = list(save, /takes ([\d, or]+) workweeks/);
  const saveCosts = credits(save.match(/costs ([^.]*?) per workweek/)?.[1] ?? "");
  saveWeeks.forEach((weeks, i) => out.push({ id: `save-${levels[i]}`, kind: "save", level: levels[i], label: `Saving throw: ${levels[i]}`, weeks, perWeek: saveCosts[i] ?? 750 }));
  const feat = section(/Feat/).match(/takes (\d+) workweeks and costs at least ([\d,]+) cr per workweek/);
  if (feat) out.push({ id: "feat", kind: "feat", level: "proficiency", label: "A feat", weeks: Number(feat[1]), perWeek: money(feat[2]) });
  return out;
}

// The rarity of the rare ingredient a creature of this Challenge Rating gives for crafting: the
// highest rarity whose range of Challenge Ratings it falls in
export function ingredientRarity(cr: number): string | null {
  let best: string | null = null;
  for (const [rarity, row] of Object.entries(DOWNTIME.ingredients)) if (cr >= row.cr.min && (row.cr.max === undefined || cr <= row.cr.max)) best = rarity;
  return best;
}

// What a character keeps of its downtime between visits to a settlement: contacts made, blackmail
// and lore held, blueprints learned, rivals, trainings under way, titles, and a log
export interface DowntimeContact {
  id: string;
  kind: "allied" | "hostile";
  cls: "lower" | "middle" | "upper";
  // The settlement it is in, and who it is (a person of that settlement where the world has one)
  where: string;
  whereName: string;
  name: string;
}
export interface DowntimeRival {
  id: string;
  name: string;
  motive: string;
  where: string;
  whereName: string;
  since: number;
}
export interface DowntimeTraining {
  id: string;
  option: string;
  label: string;
  topic: string;
  weeks: number;
  perWeek: number;
  done: number;
}
export interface DowntimeState {
  contacts: DowntimeContact[];
  blackmail: { id: string; cls: "lower" | "middle" | "upper"; where: string; whereName: string; name: string }[];
  lore: { id: string; topic: string; where: string; whereName: string }[];
  blueprints: string[];
  rare: Record<string, number>;
  // Skills, tools and saving throws trained to half proficiency, and to expertise, in downtime
  trained: string[];
  expertise: string[];
  rivals: DowntimeRival[];
  training: DowntimeTraining[];
  titles: string[];
  log: { day: number; text: string }[];
}
export const emptyDowntime = (): DowntimeState => ({ contacts: [], blackmail: [], lore: [], blueprints: [], rare: {}, trained: [], expertise: [], rivals: [], training: [], titles: [], log: [] });

// ---------------------------------------------------------------------------------------------
// Starship combat (Starships of the Galaxy, chapters 3, 5, 7 and 9). A ship's numbers come from
// its size, role, tier and equipment (`ships.json`, derived from the book's size texts and
// equipment tables, and the starship equipment data). The fight is on a grid of 50-foot squares
// (the book's variant), in rounds of ship turns. All of it is pure: a `ShipFight` goes in and a
// new one comes out, so the same code runs the client's fight and a node test.
// Where the book leaves the choice to a GM, a house rule decides and is named: ability score
// increases of a tier go to Dexterity, Strength, Constitution and Wisdom in turn; the character
// counts as a trained pilot (the proficiency bonus applies to attacks); secondary weapons are in
// turrets and others fixed forward; a diagonal move is 75 feet; deployments, power dice and
// modifications are not used.
// ---------------------------------------------------------------------------------------------

const SHIP_ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
type ShipAbility = (typeof SHIP_ABILITIES)[number];

interface ShipRole {
  name: string;
  abilities: Record<string, number>;
  armor: string;
  shields: string;
  reactor: string;
  coupling: string;
  speed: number;
  turning: number;
}
interface ShipSize {
  abilities: Record<string, number>;
  hullDie: number;
  hullDice: number[];
  firstHull: number;
  acUpgrade: number[];
  slots: number;
  roles: ShipRole[];
}
interface ShipAmmo {
  launcher: string;
  name: string;
  cost: number;
  dice?: string;
  diceHuge?: string;
  type?: string;
  normal: number;
  long: number;
  properties: string;
}
const SHIPS = shipData as unknown as Record<string, ShipSize> & {
  ammunition: { tertiary: ShipAmmo[]; quaternary: { name: string; save?: string; dc?: number; dice?: string; diceHuge?: string; type?: string; radius?: number; radiusHuge?: number }[] };
  armor: Record<string, { cap: number | null; dr: number }>;
  shields: Record<string, { capacity: number; regen: number }>;
};

// The sizes in order, smallest first
export const SHIP_SIZE_ORDER = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const sizeIndex = (size: string) => Math.max(0, SHIP_SIZE_ORDER.indexOf(size));
const mod = (score: number) => Math.floor((score - 10) / 2);

// The role of the book that a ship's role name stands for: the same name, one that contains it or is
// contained in it, else the size's first (ships made before the book's roles were used)
export function bookRole(size: string, roleName: string): ShipRole {
  const roles = SHIPS[size]?.roles ?? SHIPS.Medium.roles;
  const wanted = roleName.toLowerCase();
  return (
    roles.find((r) => r.name.toLowerCase() === wanted) ??
    roles.find((r) => wanted.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(wanted)) ??
    roles.find((r) => r.name.toLowerCase().split(" ").some((w) => w.length > 4 && wanted.includes(w))) ??
    roles[0]
  );
}
export const shipRoleNames = (size: string): string[] => (SHIPS[size]?.roles ?? []).map((r) => r.name);

export interface ShipWeapon {
  name: string;
  category: "Primary" | "Secondary" | "Tertiary" | "Quaternary";
  dice: string;
  damageType: string;
  // Primary and tertiary: normal and long range; secondary: close and normal range (feet)
  near: number;
  far: number;
  // A fixed hardpoint fires within the forward arc; a turret all round
  arc: "forward" | "turret";
  // Tertiary and quaternary weapons spend ammunition, and call for a saving throw
  ammo?: number;
  ammoName?: string;
  // The area of a bomb's blast, in feet
  radius?: number;
  save?: { ability: string; dc?: number };
  keen: number;
  heavy: boolean;
  ionizing: boolean;
  properties: string;
}

export interface ShipSheet {
  name: string;
  size: string;
  tier: number;
  role: string;
  abilities: Record<ShipAbility, number>;
  hullMax: number;
  hullDie: number;
  hullDice: number;
  shieldMax: number;
  shieldDie: number;
  shieldDice: number;
  shieldRegen: number;
  hasShield: boolean;
  shieldKind: string;
  armorKind: string;
  ac: number;
  reduction: number;
  speed: number;
  turning: number;
  weapons: ShipWeapon[];
  hyperdrive: boolean;
  // The proficiency bonus added to attack rolls and the save DC of its weapons
  proficiency: number;
}

// A ship's numbers from its size, role, tier and the names of the equipment it carries.
// `rows` is the starship equipment data (weapons, armor, shields).
export function shipSheet(
  ship: { name: string; size: string; role: string; tier: number; equipment: string[]; hyperdriveClass?: string },
  rows: { name: string; type: string; weaponCategory?: string; weaponSize?: string; damageNumberOfDice?: number; damageDieType?: number; damageType?: string; shortRange?: number; longRange?: number; reload?: number; properties?: string }[],
  proficiency = 2,
): ShipSheet {
  const size = SHIPS[ship.size] ? ship.size : "Medium";
  const base = SHIPS[size];
  const role = bookRole(size, ship.role);
  const tier = Math.max(0, Math.min(5, ship.tier ?? 0));
  const scores: Record<ShipAbility, number> = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
  for (const [a, n] of Object.entries(base.abilities)) if (a in scores) scores[a as ShipAbility] += n;
  for (const [a, n] of Object.entries(role.abilities)) if (a in scores) scores[a as ShipAbility] += n;
  // The ability score increases of the tiers: two points each tier, to Dexterity, Strength, Constitution and Wisdom in turn
  const order: ShipAbility[] = ["dexterity", "strength", "constitution", "wisdom"];
  for (let t = 0; t < tier; t++) {
    const a = order[t % order.length];
    scores[a] = Math.min(a === "dexterity" ? 22 : 20, scores[a] + 2);
  }
  const named = (type: string) => ship.equipment.map((n) => rows.find((r) => r.name === n && r.type === type)).filter(Boolean) as typeof rows;
  const armorRow = named("Armor")[0];
  const armorKind = armorRow ? armorRow.name.replace(/ armor$/i, "") : "Lightweight";
  const armor = SHIPS.armor[armorKind] ?? { cap: null, dr: 0 };
  const shieldRow = named("Shield")[0];
  const shieldKind = shieldRow ? shieldRow.name.replace(/ shield$/i, "") : "";
  const shield = SHIPS.shields[shieldKind];
  const dice = base.hullDice[tier] ?? base.hullDice[0];
  const die = base.hullDie;
  const average = Math.floor(die / 2) + 1;
  const hullEach = Math.max(1, average + mod(scores.constitution));
  const hullMax = Math.max(1, base.firstHull + mod(scores.constitution) + (dice - 1) * hullEach);
  const shieldEach = Math.max(1, average + mod(scores.strength));
  const shieldBase = Math.max(1, base.firstHull + mod(scores.strength) + (dice - 1) * shieldEach);
  const dexMod = mod(scores.dexterity);
  const ac = 10 + (armor.cap === null ? dexMod : Math.min(dexMod, armor.cap)) + (base.acUpgrade[tier] ?? 0);
  const weapons: ShipWeapon[] = [];
  for (const row of named("Weapon")) {
    const category = (row.weaponCategory ?? "Primary") as ShipWeapon["category"];
    const props = row.properties ?? "";
    const keen = Number(props.match(/keen (\d+)/i)?.[1] ?? 0);
    const common = { name: row.name, category, keen, heavy: /\bheavy\b/i.test(props), ionizing: /ionizing/i.test(props) || row.damageType === "ion", properties: props };
    if (category === "Primary" || category === "Secondary") {
      weapons.push({
        ...common,
        dice: `${row.damageNumberOfDice ?? 1}d${row.damageDieType ?? 6}`,
        damageType: row.damageType ?? "energy",
        near: row.shortRange ?? 800,
        far: row.longRange ?? 3200,
        arc: category === "Secondary" ? "turret" : "forward",
      });
    } else {
      // A launcher with the ammunition most often used in it: its damage and range, and as many pieces as it holds
      const launcher = row.name.replace(/^Assault /i, "").replace(/ launcher$/i, "");
      const ammo = SHIPS.ammunition.tertiary.filter((a) => a.launcher.toLowerCase().includes(launcher.toLowerCase()) || launcher.toLowerCase().includes(a.launcher.toLowerCase()));
      const choice = ammo.find((a) => /proton torpedo|concussion missile|cluster missile/i.test(a.name) && a.dice) ?? ammo.find((a) => a.dice);
      if (category === "Tertiary" && choice) {
        const huge = sizeIndex(size) >= sizeIndex("Huge");
        weapons.push({
          ...common,
          dice: (huge ? choice.diceHuge : choice.dice) ?? "2d8",
          damageType: choice.type ?? "energy",
          near: choice.normal,
          far: choice.long,
          arc: "forward",
          ammo: row.reload ?? 4,
          ammoName: choice.name,
          save: { ability: "dexterity" },
        });
      } else if (category === "Quaternary") {
        const bomb = SHIPS.ammunition.quaternary.find((b) => /proton bomb|seismic charge|bomblets/i.test(b.name) && b.dice) ?? SHIPS.ammunition.quaternary.find((b) => b.dice);
        const huge = sizeIndex(size) >= sizeIndex("Huge");
        weapons.push({
          ...common,
          dice: (huge ? bomb?.diceHuge : bomb?.dice) ?? "4d10",
          damageType: bomb?.type ?? "energy",
          near: 0,
          far: 100,
          arc: "forward",
          ammo: row.reload ?? 4,
          ammoName: bomb?.name,
          radius: (huge ? bomb?.radiusHuge : bomb?.radius) ?? 100,
          save: { ability: bomb?.save ?? "dexterity", dc: bomb?.dc ?? 15 },
        });
      }
    }
  }
  return {
    name: ship.name,
    size,
    tier,
    role: role.name,
    abilities: scores,
    hullMax,
    hullDie: die,
    hullDice: dice,
    shieldMax: shield ? Math.max(1, Math.round(shieldBase * shield.capacity)) : 0,
    shieldDie: die,
    shieldDice: shield ? dice : 0,
    shieldRegen: shield ? Math.max(1, Math.round(die * shield.regen)) : 0,
    hasShield: !!shield,
    shieldKind,
    armorKind,
    ac,
    reduction: armor.dr,
    speed: role.speed,
    turning: role.turning,
    weapons,
    hyperdrive: !!ship.hyperdriveClass || ship.equipment.some((n) => /hyperdrive/i.test(n)),
    proficiency,
  };
}

// ---- The fight

export const SHIP_SQUARE = 50;
// Facings, a step of 45 degrees clockwise from east
export const SHIP_FACINGS: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export interface ShipCombatant {
  id: string;
  name: string;
  side: "party" | "foe";
  sheet: ShipSheet;
  hull: number;
  shield: number;
  hullDiceLeft: number;
  shieldDiceLeft: number;
  systemDamage: number;
  slowed: number;
  ionized: boolean;
  disabled: boolean;
  stable: boolean;
  destroyed: boolean;
  destruction: { successes: number; failures: number };
  x: number;
  y: number;
  facing: number;
  // Flying speed left this turn, and the actions: crew that can act, and whether the helm has acted
  speedLeft: number;
  speedBonus: number;
  actions: number;
  actionsMax: number;
  helmUsed: boolean;
  gunners: number;
  fired: number[];
  ammo: Record<number, number>;
  boosts: { engines: number; shields: number; weapons: number };
  // Effects that last until the ship's next turn
  evading: boolean;
  flew: boolean;
  weaponsBoosted: boolean;
  directed: boolean;
  interfered: boolean;
  attackRun: boolean;
  movedToward: number;
  initiative: number;
  // The party's ship's crew actions per turn beyond the character's
  crew: number;
  fled: boolean;
}

export interface ShipFight {
  width: number;
  height: number;
  ships: ShipCombatant[];
  turn: number;
  round: number;
  log: string[];
  outcome: null | "victory" | "destroyed" | "fled" | "disabled";
  // Squares of asteroids or debris (difficult terrain)
  hazards: { x: number; y: number }[];
}

// Creates a ship in the fight at a place, facing a way
export function shipCombatant(id: string, side: "party" | "foe", sheet: ShipSheet, at: { x: number; y: number; facing: number }, crew = 0, hull?: number, gunners = crew): ShipCombatant {
  return {
    id,
    name: sheet.name,
    side,
    sheet,
    hull: Math.max(0, Math.min(hull ?? sheet.hullMax, sheet.hullMax)),
    shield: sheet.shieldMax,
    hullDiceLeft: sheet.hullDice,
    shieldDiceLeft: sheet.shieldDice,
    systemDamage: 0,
    slowed: 0,
    ionized: false,
    disabled: false,
    stable: false,
    destroyed: false,
    destruction: { successes: 0, failures: 0 },
    ...at,
    speedLeft: sheet.speed,
    speedBonus: 0,
    actions: 1 + crew,
    actionsMax: 1 + crew,
    helmUsed: false,
    gunners,
    fired: [],
    ammo: Object.fromEntries(sheet.weapons.map((w, i) => [i, w.ammo ?? 0])),
    boosts: { engines: 0, shields: 0, weapons: 0 },
    evading: false,
    flew: false,
    weaponsBoosted: false,
    directed: false,
    interfered: false,
    attackRun: false,
    movedToward: 0,
    initiative: 0,
    crew,
    fled: false,
  };
}

const dieRoll = (n: number, rng: () => number) => Math.floor(rng() * n) + 1;
const rollDice = (expr: string, rng: () => number, crit = false) => {
  const m = expr.match(/^(\d+)d(\d+)$/);
  if (!m) return Number(expr) || 0;
  const n = Number(m[1]) * (crit ? 2 : 1);
  let total = 0;
  for (let i = 0; i < n; i++) total += dieRoll(Number(m[2]), rng);
  return total;
};

// Feet between two squares: a straight square is 50, a diagonal 75 on average (50, then 100)
export function shipFeet(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diagonal = Math.min(dx, dy);
  return (Math.max(dx, dy) - diagonal) * SHIP_SQUARE + diagonal * 75;
}

// The angle between a ship's facing and the direction of a target, in degrees
export function bearingOff(ship: { x: number; y: number; facing: number }, target: { x: number; y: number }): number {
  const [fx, fy] = SHIP_FACINGS[ship.facing];
  const dx = target.x - ship.x;
  const dy = target.y - ship.y;
  if (!dx && !dy) return 0;
  const a = Math.atan2(fy, fx);
  const b = Math.atan2(dy, dx);
  let d = Math.abs(a - b);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

// Speed a ship has now: its role's, with slowed levels and what boosts and bad systems do to it
export function shipSpeed(c: ShipCombatant): number {
  const levels = Math.max(c.slowed, c.systemDamage >= 2 ? Math.max(c.slowed, 1) : 0);
  const slow = [0, 150, 250, 300][Math.min(3, levels)] ?? 0;
  if (c.disabled || levels >= 4) return 0;
  return Math.max(0, c.sheet.speed + c.speedBonus - slow);
}

// The ships (but not the one asked of) standing in a square
const occupied = (fight: ShipFight, x: number, y: number, except?: string) => fight.ships.some((s) => !s.destroyed && !s.fled && s.id !== except && s.x === x && s.y === y);

// Where a ship can get to this turn and what each place costs: forward a square in its facing (50 feet,
// 75 on a diagonal), turning 45 degrees for half the turning speed; it cannot end on another ship.
export function shipReach(fight: ShipFight, id: string, free90 = false): Map<string, { cost: number; facing: number; from?: string; steps: number }> {
  const ship = fight.ships.find((s) => s.id === id)!;
  const key = (x: number, y: number, f: number) => `${x},${y},${f}`;
  const best = new Map<string, { cost: number; facing: number; from?: string; steps: number }>();
  const start = key(ship.x, ship.y, ship.facing);
  best.set(start, { cost: 0, facing: ship.facing, steps: 0 });
  const queue: { x: number; y: number; f: number; cost: number; steps: number }[] = [{ x: ship.x, y: ship.y, f: ship.facing, cost: 0, steps: 0 }];
  const turn = ship.sheet.turning / 2;
  const limit = ship.speedLeft;
  const hazard = (x: number, y: number) => fight.hazards.some((h) => h.x === x && h.y === y);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const at = queue.shift()!;
    if ((best.get(key(at.x, at.y, at.f))?.cost ?? Infinity) < at.cost) continue;
    const moves: { x: number; y: number; f: number; cost: number }[] = [];
    // Forward
    const [dx, dy] = SHIP_FACINGS[at.f];
    const step = (dx && dy ? 75 : 50) * (hazard(at.x + dx, at.y + dy) ? 2 : 1);
    if (at.x + dx >= 0 && at.y + dy >= 0 && at.x + dx < fight.width && at.y + dy < fight.height) moves.push({ x: at.x + dx, y: at.y + dy, f: at.f, cost: step });
    // Turning a step either way
    for (const t of [-1, 1]) moves.push({ x: at.x, y: at.y, f: (at.f + t + 8) % 8, cost: turn });
    for (const m of moves) {
      const cost = at.cost + m.cost;
      if (cost > limit) continue;
      const k = key(m.x, m.y, m.f);
      if ((best.get(k)?.cost ?? Infinity) <= cost) continue;
      best.set(k, { cost, facing: m.f, from: key(at.x, at.y, at.f), steps: at.steps + 1 });
      queue.push({ x: m.x, y: m.y, f: m.f, cost, steps: at.steps + 1 });
    }
  }
  void free90;
  // Only the places a ship may end on: the cheapest way to each square, with the facing that costs least
  const squares = new Map<string, { cost: number; facing: number; from?: string; steps: number }>();
  best.forEach((v, k) => {
    const [x, y] = k.split(",").map(Number);
    if (occupied(fight, x, y, id)) return;
    const sq = `${x},${y}`;
    if (!squares.has(sq) || squares.get(sq)!.cost > v.cost) squares.set(sq, { ...v, from: k });
  });
  return squares;
}

// Moves a ship to a square it can reach, with the facing of the cheapest way there
export function shipMove(fight: ShipFight, id: string, x: number, y: number, facing?: number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed || (ship.speedLeft <= 0)) return fight;
  const reach = shipReach(fight, id);
  const found = reach.get(`${x},${y}`);
  if (!found || (found.cost === 0 && facing === undefined)) return fight;
  const toward = (a: ShipCombatant) => Math.max(0, shipFeet(a, { x, y }));
  const feet = found.cost;
  const moved = shipFeet(ship, { x, y });
  let end = facing ?? found.facing;
  // Facing in the direction of travel when the way there leaves it free
  if (facing === undefined && (x !== ship.x || y !== ship.y)) {
    const dx = Math.sign(x - ship.x);
    const dy = Math.sign(y - ship.y);
    const direct = SHIP_FACINGS.findIndex(([a, b]) => a === dx && b === dy);
    if (direct >= 0 && direct === found.facing) end = direct;
  }
  void toward;
  return {
    ...fight,
    ships: fight.ships.map((s) => (s.id === id ? { ...s, x, y, facing: end, speedLeft: Math.max(0, s.speedLeft - feet), movedToward: s.movedToward + (moved > 0 ? moved : 0) } : s)),
    log: [...fight.log, `${ship.name} moves ${feet} ft.`],
  };
}

// Turns a ship a step (45 degrees) either way for half its turning speed
export function shipTurn(fight: ShipFight, id: string, steps: number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed) return fight;
  const cost = (ship.sheet.turning / 2) * Math.abs(steps);
  if (cost > ship.speedLeft) return fight;
  return { ...fight, ships: fight.ships.map((s) => (s.id === id ? { ...s, facing: (s.facing + steps + 80) % 8, speedLeft: s.speedLeft - cost } : s)) };
}

// What a damage type does to shields and to hull, as halves (0.5), none (0) or all (1)
const SHIELD_FACTOR: Record<string, number> = { acid: 0.5, cold: 0.5, fire: 0.5, necrotic: 0.5, poison: 0, psychic: 0, sonic: 0 };
const HULL_FACTOR: Record<string, number> = { ion: 0.5, lightning: 0.5, necrotic: 0.5, poison: 0, psychic: 0, sonic: 0 };

// Damage dealt to a ship: its armor takes off the damage of an attack roll (at least 1 of it
// left), the shields take it first and then the hull. Returns the ship and what happened.
export function shipDamage(
  ship: ShipCombatant,
  amount: number,
  type: string,
  opts: { attack: boolean; crit?: boolean; disable?: boolean; sourceIon?: boolean } = { attack: true },
): { ship: ShipCombatant; shield: number; hull: number; note: string } {
  let raw = amount;
  if (opts.attack && ship.sheet.reduction > 0) raw = Math.max(1, raw - ship.sheet.reduction);
  const fs = SHIELD_FACTOR[type] ?? 1;
  const fh = HULL_FACTOR[type] ?? 1;
  let shield = ship.shield;
  let hull = ship.hull;
  let toShield = 0;
  let toHull = 0;
  let left = raw;
  if (shield > 0 && fs > 0) {
    const vsShield = Math.floor(left * fs);
    if (shield >= vsShield) {
      toShield = vsShield;
      shield -= vsShield;
      left = 0;
    } else {
      toShield = shield;
      left = left - Math.ceil(shield / fs);
      shield = 0;
    }
  } else if (shield > 0 && fs === 0) {
    left = 0;
  }
  if (left > 0 && fh > 0) {
    toHull = Math.floor(left * fh);
    hull = Math.max(0, hull - toHull);
  }
  let next: ShipCombatant = { ...ship, shield, hull };
  const notes: string[] = [];
  if (ship.hull > 0 && hull === 0) {
    const overflow = toHull - ship.hull;
    const instant = overflow >= ship.sheet.hullMax;
    // A non-player ship explodes at 0 hull, unless it was only ion damage or the attacker chose to disable it
    if (instant || (ship.side === "foe" && !opts.disable && type !== "ion")) {
      next = { ...next, destroyed: true };
      notes.push(`${ship.name} is destroyed!`);
    } else {
      next = { ...next, disabled: true, stable: type === "ion" || !!opts.disable, systemDamage: next.systemDamage };
      notes.push(`${ship.name} is disabled${next.stable ? " and stable" : ""}.`);
    }
  } else if (ship.hull === 0 && toHull > 0 && !next.destroyed) {
    // Damage at 0 hull points: a level of system damage, two from a critical hit, destroyed if it equals the maximum
    next = { ...next, stable: false, systemDamage: Math.min(6, next.systemDamage + (opts.crit ? 2 : 1)) };
    if (toHull >= ship.sheet.hullMax || next.systemDamage >= 6) {
      next = { ...next, destroyed: true };
      notes.push(`${ship.name} is destroyed!`);
    }
  }
  return { ship: next, shield: toShield, hull: toHull, note: notes.join(" ") };
}

// Sets the turn up for a ship: speed and actions are its own again, what lasted to its turn ends, the
// shields regenerate by their rate (spending a shield die), and a ship at 0 hull makes a destruction save
export function startShipTurn(fight: ShipFight, id: string, rng: () => number): ShipFight {
  let log = [...fight.log];
  const ships = fight.ships.map((s) => {
    if (s.id !== id || s.destroyed || s.fled) return s;
    let ship: ShipCombatant = {
      ...s,
      speedLeft: 0,
      speedBonus: 0,
      actions: s.actionsMax,
      helmUsed: false,
      fired: [],
      boosts: { engines: 0, shields: 0, weapons: 0 },
      evading: false,
      flew: false,
      weaponsBoosted: false,
      attackRun: false,
      movedToward: 0,
    };
    ship.speedLeft = shipSpeed(ship);
    // The shields come back by the regeneration rate, each time using a die; with system damage 4 they are halved
    if (ship.sheet.hasShield && ship.shield > 0 && ship.shieldDiceLeft > 0) {
      const max = Math.floor(ship.sheet.shieldMax / (ship.systemDamage >= 4 ? 2 : 1));
      const rate = Math.max(1, Math.floor(ship.sheet.shieldRegen / (ship.systemDamage >= 4 ? 2 : 1)));
      const back = Math.min(rate, max - ship.shield);
      if (back > 0) {
        ship = { ...ship, shield: ship.shield + back, shieldDiceLeft: ship.shieldDiceLeft - 1 };
        log.push(`${ship.name}'s shields regenerate ${back}.`);
      }
    }
    // A ship at 0 hull points that is not stable makes a destruction saving throw: 10 or higher succeeds
    if (ship.hull === 0 && ship.disabled && !ship.stable) {
      const d = dieRoll(20, rng);
      if (d === 20) {
        ship = { ...ship, hull: 1, disabled: false, destruction: { successes: 0, failures: 0 } };
        log.push(`${ship.name}: a destruction save of 20: 1 hull point, back in the fight.`);
      } else {
        const d2 = ship.destruction;
        const failures = d2.failures + (d === 1 ? 2 : d < 10 ? 1 : 0);
        const successes = d2.successes + (d >= 10 ? 1 : 0);
        ship = { ...ship, destruction: { successes, failures }, systemDamage: Math.min(6, ship.systemDamage + (d < 10 ? (d === 1 ? 2 : 1) : 0)) };
        log.push(`${ship.name}: destruction save ${d}, ${d >= 10 ? "success" : d === 1 ? "two failures" : "failure"} (${successes} of 3, system damage ${ship.systemDamage}).`);
        if (successes >= 3) ship = { ...ship, stable: true };
        if (ship.systemDamage >= 6) {
          ship = { ...ship, destroyed: true };
          log.push(`${ship.name}'s primary systems fail: it is lost.`);
        }
      }
    }
    return ship;
  });
  return { ...fight, ships, log };
}

// Whether the fight is over, and how for the party
export function shipOutcome(fight: ShipFight): ShipFight["outcome"] {
  const party = fight.ships.filter((s) => s.side === "party");
  const foes = fight.ships.filter((s) => s.side === "foe");
  if (party.every((s) => s.destroyed)) return "destroyed";
  if (party.every((s) => s.fled || s.destroyed)) return "fled";
  if (foes.every((s) => s.destroyed || s.fled || s.disabled)) return "victory";
  if (party.every((s) => s.disabled || s.destroyed || s.fled)) return "disabled";
  return null;
}

// The active ship's turn passes to the next ship that can act; a new round begins when everyone has had theirs
export function endShipTurn(fight: ShipFight, rng: () => number): ShipFight {
  const order = fight.ships;
  let turn = fight.turn;
  let round = fight.round;
  let next = fight;
  for (let i = 0; i < order.length; i++) {
    turn += 1;
    if (turn >= order.length) {
      turn = 0;
      round += 1;
    }
    const s = order[turn];
    if (!s.destroyed && !s.fled) break;
  }
  next = { ...fight, turn, round };
  const id = order[turn].id;
  next = startShipTurn(next, id, rng);
  const outcome = shipOutcome(next);
  return { ...next, outcome };
}

export interface ShipAttackOutcome {
  fight: ShipFight;
  hit: boolean;
  line: string;
}

// A weapon fired at a target: arc and range, the roll (or the target's saving throw for missiles and
// bombs), damage by the book's rules. `fromHelm` is the helm's crewmember firing (disadvantage with
// primary and secondary weapons unless an Attack Run or Dogfight, or a gunner fires).
export function shipFire(fight: ShipFight, shooterId: string, weaponIndex: number, targetId: string, rng: () => number, opts: { disable?: boolean; gunner?: boolean } = {}): ShipAttackOutcome {
  const shooter = fight.ships.find((s) => s.id === shooterId);
  const target = fight.ships.find((s) => s.id === targetId);
  const weapon = shooter?.sheet.weapons[weaponIndex];
  const fail = (line: string): ShipAttackOutcome => ({ fight: { ...fight, log: [...fight.log, line] }, hit: false, line });
  if (!shooter || !target || !weapon) return { fight, hit: false, line: "" };
  if (shooter.disabled || shooter.destroyed) return fail(`${shooter.name} cannot fire.`);
  if (shooter.fired.includes(weaponIndex)) return fail(`${weapon.name} has fired this turn.`);
  if (shooter.actions <= 0) return fail(`${shooter.name} has no action left.`);
  if ((weapon.ammo ?? 1) > 0 && weapon.ammo !== undefined && (shooter.ammo[weaponIndex] ?? 0) <= 0) return fail(`${weapon.name} is out of ammunition.`);
  const feet = shipFeet(shooter, target);
  const bearing = bearingOff(shooter, target);
  const forwardOk = weapon.arc === "turret" || bearing <= 45.01 || shooter.attackRun;
  if (!forwardOk) return fail(`${target.name} is outside the forward arc of ${weapon.name}.`);
  if (feet > weapon.far) return fail(`${target.name} is ${feet} ft. away, beyond ${weapon.far} ft.`);
  // Huge and larger ships' secondary weapons cannot be brought on small ships
  const bigShooter = sizeIndex(shooter.sheet.size) >= sizeIndex("Huge");
  if (bigShooter && weapon.category === "Secondary" && sizeIndex(target.sheet.size) <= sizeIndex("Small")) return fail(`${weapon.name} cannot target a ship that small.`);
  const proficiency = shooter.sheet.proficiency;
  const wis = mod(shooter.sheet.abilities.wisdom);
  const str = mod(shooter.sheet.abilities.strength);
  const badSystems = shooter.systemDamage >= 3 || shooter.ionized;
  let log = [...fight.log];
  let ships = fight.ships.map((s) => (s.id === shooterId ? { ...s, fired: [...s.fired, weaponIndex], actions: s.actions - 1, directed: false, interfered: false, ammo: { ...s.ammo, [weaponIndex]: weapon.ammo !== undefined ? (s.ammo[weaponIndex] ?? 0) - 1 : s.ammo[weaponIndex] } } : s));
  let adv = false;
  let dis = false;
  const reasons: string[] = [];
  if (shooter.directed) { adv = true; reasons.push("directed"); }
  if (shooter.interfered) { dis = true; reasons.push("interfered with"); }
  if (badSystems) { dis = true; reasons.push("systems damaged"); }
  if (shooter.evading || shooter.flew) { dis = true; reasons.push("busy flying"); }
  if (target.evading) { dis = true; reasons.push("target evading"); }
  if (feet <= SHIP_SQUARE && weapon.category !== "Quaternary") { dis = true; reasons.push("within 50 ft."); }
  if (weapon.category === "Secondary" && feet < weapon.near) { dis = true; reasons.push("inside close range"); }
  if ((weapon.category === "Primary" || weapon.category === "Tertiary") && feet > weapon.near && weapon.category === "Primary") { dis = true; reasons.push("beyond normal range"); }
  // The helm firing a primary or secondary weapon has disadvantage, unless it is an attack run or a gunner is at the gun
  if (!opts.gunner && (weapon.category === "Primary" || weapon.category === "Secondary") && !shooter.attackRun) { dis = true; reasons.push("fired from the helm"); }
  const mode = Number(adv) - Number(dis);
  const roll = () => {
    const a = dieRoll(20, rng);
    if (!mode) return a;
    const b = dieRoll(20, rng);
    return mode > 0 ? Math.max(a, b) : Math.min(a, b);
  };
  const cover = target.disabled ? 0 : 0;
  let hit = false;
  let amount = 0;
  let line = "";
  const keenAt = 20 - weapon.keen;
  const damageRoll = (crit: boolean) => {
    let n = rollDice(weapon.dice, rng, crit);
    if (shooter.weaponsBoosted) n = Math.max(n, rollDice(weapon.dice, rng, crit));
    return n + (weapon.category === "Primary" || weapon.category === "Secondary" ? str : 0) + (weapon.heavy && str > 0 ? Math.max(1, Math.ceil(str / 2)) : 0);
  };
  let attacked: ShipCombatant = target;
  if (weapon.category === "Primary" || weapon.category === "Secondary") {
    const d = roll();
    const total = d + proficiency + wis;
    const crit = d >= keenAt;
    hit = d !== 1 && (crit || total >= target.sheet.ac + cover);
    line = `${shooter.name} fires ${weapon.name} at ${target.name} (${d} + ${proficiency + wis} = ${total} against AC ${target.sheet.ac}${reasons.length ? `; ${reasons.join(", ")}` : ""})`;
    if (hit) {
      amount = Math.max(1, damageRoll(crit));
      const result = shipDamage(target, amount, weapon.damageType, { attack: true, crit, disable: opts.disable });
      attacked = result.ship;
      line += ` and hits for ${result.shield} on the shields${result.hull ? ` and ${result.hull} on the hull` : ""}${crit ? " (critical)" : ""}. ${result.note}`.trimEnd();
    } else line += " and misses.";
  } else {
    // Missiles, torpedoes and bombs: a saving throw against the weapon's DC, half damage on a success
    const dc = weapon.save?.dc ?? 8 + proficiency + wis;
    const sizeDiff = sizeIndex(shooter.sheet.size) - sizeIndex(target.sheet.size);
    const saveAdv = sizeDiff >= 2 || (feet > weapon.near && weapon.category === "Tertiary");
    const saveDis = sizeDiff <= -2 || mode > 0;
    const ability = (weapon.save?.ability ?? "dexterity") as ShipAbility;
    const bonus = mod(target.sheet.abilities[ability]) + (["strength", "dexterity"].includes(ability) && target.sheet.size ? 0 : 0);
    const a = dieRoll(20, rng);
    const b = saveAdv !== saveDis ? dieRoll(20, rng) : a;
    const d = saveAdv && !saveDis ? Math.max(a, b) : saveDis && !saveAdv ? Math.min(a, b) : a;
    const saved = target.evading ? d + bonus + 5 >= dc : d + bonus >= dc;
    const full = rollDice(weapon.dice, rng, false);
    amount = saved ? Math.floor(full / 2) : full;
    hit = !saved;
    line = `${shooter.name} launches ${weapon.ammoName ?? weapon.name} at ${target.name}: ${ability.slice(0, 3).toUpperCase()} save ${d + bonus} against DC ${dc}, ${saved ? "saves" : "fails"}`;
    if (amount > 0) {
      const result = shipDamage(target, amount, weapon.damageType, { attack: false, disable: opts.disable });
      attacked = result.ship;
      line += `, ${result.shield} on the shields${result.hull ? ` and ${result.hull} on the hull` : ""}. ${result.note}`.trimEnd();
    } else line += ".";
  }
  ships = ships.map((s) => (s.id === targetId ? attacked : s));
  log.push(line);
  const next: ShipFight = { ...fight, ships, log };
  return { fight: { ...next, outcome: shipOutcome(next) }, hit, line };
}

export type ShipHelmAction = "evade" | "fly" | "hardTurn" | "attackRun";

// A helm action (one a turn). Evade: attacks against the ship have disadvantage and its own have too;
// Fly: the speed again, with disadvantage on attacks; Hard Turn: 90 degrees for free; Attack Run:
// after 150 feet toward a target, a shot with no disadvantage from the forward arc
export function shipHelm(fight: ShipFight, id: string, action: ShipHelmAction, turnSteps = 2): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed || ship.helmUsed || ship.actions <= 0) return fight;
  const speed = shipSpeed(ship);
  const patch: Partial<ShipCombatant> = { helmUsed: true, actions: ship.actions - 1 };
  let line = "";
  if (action === "evade") {
    patch.evading = true;
    line = `${ship.name} evades: attacks against it have disadvantage until its next turn.`;
  } else if (action === "fly") {
    patch.speedLeft = ship.speedLeft + speed;
    patch.flew = true;
    line = `${ship.name} flies: ${speed} ft. more speed this turn.`;
  } else if (action === "hardTurn") {
    patch.facing = (ship.facing + turnSteps + 8) % 8;
    line = `${ship.name} makes a hard turn.`;
  } else {
    if (ship.movedToward < 150) {
      return { ...fight, log: [...fight.log, `${ship.name}: an attack run needs 150 ft. of movement toward the target first.`] };
    }
    patch.attackRun = true;
    line = `${ship.name} makes an attack run: its next shot suffers no penalty.`;
  }
  return { ...fight, ships: fight.ships.map((s) => (s.id === id ? { ...s, ...patch } : s)), log: [...fight.log, line] };
}

export type ShipBoost = "engines" | "shields" | "weapons";

// Boost a function: DC 10 Strength check, each boost of a function after the first this turn 5 higher
export function shipBoost(fight: ShipFight, id: string, what: ShipBoost, rng: () => number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed || ship.actions <= 0 || ship.boosts[what] > 0) return fight;
  const dc = 10 + 5 * (ship.boosts.engines + ship.boosts.shields + ship.boosts.weapons);
  const d = dieRoll(20, rng);
  const total = d + mod(ship.sheet.abilities.strength);
  const ok = total >= dc;
  const patch: Partial<ShipCombatant> = { actions: ship.actions - 1, boosts: { ...ship.boosts, [what]: 1 } };
  let line = `${ship.name} boosts its ${what}: Strength (Boost) ${total} against DC ${dc}, ${ok ? "succeeds" : "fails"}.`;
  if (ok) {
    if (what === "engines") {
      patch.speedBonus = ship.speedBonus + 50;
      patch.speedLeft = ship.speedLeft + 50;
    } else if (what === "shields") {
      const gained = dieRoll(ship.sheet.shieldDie, rng);
      patch.shield = ship.shield + gained;
      line += ` ${gained} temporary shield points.`;
    } else patch.weaponsBoosted = true;
  }
  return { ...fight, ships: fight.ships.map((s) => (s.id === id ? { ...s, ...patch } : s)), log: [...fight.log, line] };
}

// Patch: spend a Hull Die to mend the hull (Constitution check, DC 10 or half the missing hull points)
export function shipPatch(fight: ShipFight, id: string, rng: () => number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.destroyed || ship.actions <= 0 || ship.hullDiceLeft <= 0 || ship.hull >= ship.sheet.hullMax) return fight;
  const dc = Math.max(10, Math.ceil((ship.sheet.hullMax - ship.hull) / 2));
  const d = dieRoll(20, rng) + mod(ship.sheet.abilities.constitution);
  const ok = d >= dc;
  const a = dieRoll(ship.sheet.hullDie, rng);
  const rolled = ok ? a : Math.min(a, dieRoll(ship.sheet.hullDie, rng));
  const healed = Math.max(1, rolled + mod(ship.sheet.abilities.constitution));
  const hull = Math.min(ship.sheet.hullMax, ship.hull + healed);
  const stable = ship.hull === 0 && hull > 0;
  return {
    ...fight,
    ships: fight.ships.map((s) => (s.id === id ? { ...s, hull, hullDiceLeft: s.hullDiceLeft - 1, actions: s.actions - 1, disabled: stable ? false : s.disabled, stable: stable ? false : s.stable } : s)),
    log: [...fight.log, `${ship.name} patches the hull: Constitution (Patch) ${d} against DC ${dc}, ${ok ? "succeeds" : "fails"}: ${healed} hull points.`],
  };
}

// Regenerate Shields as an action: spend a Shield Die (DC 10 or half the missing shield points)
export function shipRegenerate(fight: ShipFight, id: string, rng: () => number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.destroyed || ship.actions <= 0 || ship.shieldDiceLeft <= 0 || !ship.sheet.hasShield || ship.shield >= ship.sheet.shieldMax) return fight;
  const dc = Math.max(10, Math.ceil((ship.sheet.shieldMax - ship.shield) / 2));
  const d = dieRoll(20, rng) + mod(ship.sheet.abilities.strength);
  const ok = d >= dc;
  const a = dieRoll(ship.sheet.shieldDie, rng);
  const rolled = ok ? a : Math.min(a, dieRoll(ship.sheet.shieldDie, rng));
  const back = Math.max(1, rolled + mod(ship.sheet.abilities.strength));
  const shield = Math.min(ship.sheet.shieldMax, ship.shield + back);
  return {
    ...fight,
    ships: fight.ships.map((s) => (s.id === id ? { ...s, shield, shieldDiceLeft: s.shieldDiceLeft - 1, actions: s.actions - 1 } : s)),
    log: [...fight.log, `${ship.name} regenerates its shields: Strength (Boost) ${d} against DC ${dc}, ${ok ? "succeeds" : "fails"}: ${back}.`],
  };
}

// Direct: the next attack of a friendly ship has advantage. Interfere: Charisma (Interfere) against
// the target's Wisdom (Scan); on a success its next attack roll has disadvantage.
export function shipDirect(fight: ShipFight, id: string, allyId: string): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.actions <= 0 || ship.disabled) return fight;
  return {
    ...fight,
    ships: fight.ships.map((s) => (s.id === id ? { ...s, actions: s.actions - 1 } : s.id === allyId ? { ...s, directed: true } : s)),
    log: [...fight.log, `${ship.name} directs: the next attack has advantage.`],
  };
}
export function shipInterfere(fight: ShipFight, id: string, targetId: string, rng: () => number): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  const target = fight.ships.find((s) => s.id === targetId);
  if (!ship || !target || ship.actions <= 0 || ship.disabled || shipFeet(ship, target) > 1000) return fight;
  const a = dieRoll(20, rng) + mod(ship.sheet.abilities.charisma);
  const b = dieRoll(20, rng) + mod(target.sheet.abilities.wisdom);
  const ok = a > b;
  return {
    ...fight,
    ships: fight.ships.map((s) => (s.id === id ? { ...s, actions: s.actions - 1 } : s.id === targetId && ok ? { ...s, interfered: true } : s)),
    log: [...fight.log, `${ship.name} interferes with ${target.name}: Charisma (Interfere) ${a} against Wisdom (Scan) ${b}, ${ok ? "succeeds: disadvantage on its next attack" : "fails"}.`],
  };
}

// Taking a ship out of the fight by hyperdrive: needs a hyperdrive and a turn spent flying away
export function shipFlee(fight: ShipFight, id: string): ShipFight {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed || !ship.sheet.hyperdrive || ship.actions <= 0) return fight;
  const next = { ...fight, ships: fight.ships.map((s) => (s.id === id ? { ...s, fled: true, actions: 0 } : s)), log: [...fight.log, `${ship.name} jumps to hyperspace.`] };
  return { ...next, outcome: shipOutcome(next) };
}

// The computer's pilot: one step of an NPC ship's turn. It closes to its best weapon's range and
// faces its target, fires everything that can fire, evades when the hull is low, and goes on.
// Returns the new fight and whether its turn is over.
export function shipAi(fight: ShipFight, id: string, rng: () => number): { fight: ShipFight; done: boolean } {
  const ship = fight.ships.find((s) => s.id === id);
  if (!ship || ship.disabled || ship.destroyed || ship.fled) return { fight, done: true };
  const foes = fight.ships.filter((s) => s.side !== ship.side && !s.destroyed && !s.fled);
  if (!foes.length) return { fight, done: true };
  const target = [...foes].sort((a, b) => shipFeet(ship, a) - shipFeet(ship, b))[0];
  let next = fight;
  const me = () => next.ships.find((s) => s.id === id)!;
  // Fire whatever can fire
  const guns = ship.sheet.weapons
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => !me().fired.includes(i) && (w.ammo === undefined || (me().ammo[i] ?? 0) > 0))
    .sort((a, b) => (b.w.category === "Primary" ? 1 : 0) - (a.w.category === "Primary" ? 1 : 0));
  // First get into position: toward the target until its nearest gun's normal range, facing it
  const range = Math.min(...ship.sheet.weapons.filter((w) => w.category !== "Quaternary").map((w) => w.near || w.far), 1000);
  if (!me().helmUsed && me().speedLeft > 0 && (shipFeet(me(), target) > Math.max(range, 100) || bearingOff(me(), target) > 45)) {
    const reach = shipReach(next, id);
    const candidates: { x: number; y: number; score: number }[] = [];
    reach.forEach((v, k) => {
      const [x, y] = k.split(",").map(Number);
      const probe = { x, y, facing: v.facing };
      const feet = shipFeet(probe, target);
      const off = bearingOff(probe, target);
      candidates.push({ x, y, score: Math.abs(feet - Math.max(range, 100)) + (off > 45 ? 400 : 0) + v.cost / 10 });
    });
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (best && (best.x !== me().x || best.y !== me().y)) next = shipMove(next, id, best.x, best.y);
    // Turn toward the target when nothing else did
    if (bearingOff(me(), target) > 45) {
      for (const t of [1, -1]) {
        const trial = shipTurn(next, id, t);
        if (bearingOff(trial.ships.find((s) => s.id === id)!, target) < bearingOff(me(), target)) { next = trial; break; }
      }
    }
  }
  for (const { w, i } of guns) {
    if (me().actions <= 0) break;
    const feet = shipFeet(me(), target);
    if (feet > w.far) continue;
    if (w.arc === "forward" && bearingOff(me(), target) > 45.01) continue;
    const out = shipFire(next, id, i, target.id, rng, { gunner: true });
    next = out.fight;
    if (next.outcome) return { fight: next, done: true };
  }
  // A damaged ship evades if it has the helm free
  if (!me().helmUsed && me().actions > 0 && me().hull < me().sheet.hullMax / 3) next = shipHelm(next, id, "evade");
  return { fight: next, done: true };
}

// Starts a fight: ships placed on opposite sides facing each other, initiative rolled (Dexterity
// modifier and a d20; a ship's own is the lowest of its crew's), the first turn begun
export function startShipFight(party: ShipCombatant[], foes: ShipCombatant[], rng: () => number, size = { width: 30, height: 18 }): ShipFight {
  const place = (list: ShipCombatant[], side: "party" | "foe") =>
    list.map((s, i) => ({
      ...s,
      x: side === "party" ? 3 : size.width - 4,
      y: Math.floor(size.height / 2) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2,
      facing: side === "party" ? 0 : 4,
    }));
  const all = [...place(party, "party"), ...place(foes, "foe")].map((s) => ({ ...s, initiative: dieRoll(20, rng) + mod(s.sheet.abilities.dexterity) }));
  all.sort((a, b) => b.initiative - a.initiative);
  // A few rocks and debris between them
  const hazards: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) hazards.push({ x: 8 + Math.floor(rng() * (size.width - 16)), y: 2 + Math.floor(rng() * (size.height - 4)) });
  const fight: ShipFight = { width: size.width, height: size.height, ships: all, turn: 0, round: 1, log: ["Ships clash: roll for initiative!"], outcome: null, hazards };
  return startShipTurn(fight, all[0].id, rng);
}

// Refitting a ship at a port (Starships of the Galaxy, Refitting): 100 credits for each hull die
// missing, times the size's cost modifier, and a time that depends on the size. It gives back all
// the hull and shield points and the dice.
export function refitPlan(sheet: { size: string; hullMax: number; hullDice: number }, hull: number): { dice: number; cost: number; hours: number } | null {
  if (hull >= sheet.hullMax) return null;
  const refit = (SHIPS as any).refit as { cost: Record<string, number>; hours: Record<string, number> };
  const perDie = Math.max(1, sheet.hullMax / sheet.hullDice);
  const dice = Math.max(1, Math.ceil((sheet.hullMax - hull) / perDie));
  return { dice, cost: Math.round(100 * dice * (refit.cost[sheet.size] ?? 1)), hours: refit.hours[sheet.size] ?? 8 };
}

// ---------------------------------------------------------------------------------------------
// Districts (house rule; the books give no city). A settlement's buildings stand in districts of
// up to six that belong together and share one map of streets and alleys: the palace with the
// garrison and the archive (the civic quarter); the market with the workshops, the warehouses and
// the homes of the working people (market row); the spaceport with the gates, the cantina and
// whatever hides near them (the docks). Settlements of five or six buildings are one district.
// The grouping is worked out from what the buildings are, so older worlds have it too.
// ---------------------------------------------------------------------------------------------

export type DistrictTheme = "civic" | "market" | "docks";

export interface District {
  id: string; // the settlement's id and the district's number: "<settlement>/<n>"
  settlementId: string;
  theme: DistrictTheme;
  name: string;
  buildingIds: string[];
}

const THEMES: [RegExp, DistrictTheme][] = [
  [/^(palace|garrison|archive|command post|operations center)$/, "civic"],
  [/^(market|workshop|warehouse|residences|tenements|droid dealer|vehicle dealer|engineering|habitat ring|cargo bay|medcenter)$/, "market"],
  [/^(spaceport|landing field|landing pad|docking ring|city gate|town gate|cantina|promenade|hideout|transit hub|shipyard)$/, "docks"],
];
const WILD_SETTLEMENTS = ["cave system", "ruins", "crash site", "raider camp"];
export const DISTRICT_MAX = 6;

// A number in [0, 1) from a key: the same key always gives the same number
export function unitOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// The districts of a settlement (none for wild sites, where a building stands alone). The
// buildings are put in a line by what they are (civic, then market, then docks) and by where they
// stand, and the line is cut into as few districts as will hold them, of near the same size, so a
// district is four to six buildings where the settlement has the buildings for it.
export function districtsOf(world: World, settlementId: string): District[] {
  const settlement = world.areas[settlementId];
  if (!settlement || settlement.kind !== "settlement" || WILD_SETTLEMENTS.includes(settlement.type)) return [];
  const buildings = childrenOf(world, settlementId).filter((a) => a.kind === "building" && a.type !== "starship");
  if (!buildings.length) return [];
  const palace = buildings.some((b) => b.type === "palace");
  const order: DistrictTheme[] = ["civic", "market", "docks"];
  const themeOf = (b: Area): DistrictTheme => {
    if (b.type === "residences" && palace) return "civic";
    return THEMES.find(([re]) => re.test(b.type))?.[1] ?? "market";
  };
  const line = buildings
    .map((b) => ({ b, theme: themeOf(b) }))
    .sort((p, q) => order.indexOf(p.theme) - order.indexOf(q.theme) || p.b.position.x - q.b.position.x || p.b.id.localeCompare(q.b.id));
  const count = Math.max(1, Math.ceil(line.length / DISTRICT_MAX), Math.round(line.length / 5));
  const size = Math.floor(line.length / count);
  const extra = line.length % count;
  const used = new Map<string, number>();
  const districts: District[] = [];
  let at = 0;
  for (let n = 0; n < count; n++) {
    const members = line.slice(at, at + size + (n < extra ? 1 : 0));
    at += members.length;
    // Named for what most of it is
    const votes = order.map((theme) => ({ theme, n: members.filter((m) => m.theme === theme).length })).sort((p, q) => q.n - p.n);
    const theme = votes[0].theme;
    const base = theme === "civic" ? (members.some((m) => m.b.type === "palace") ? "Palace Quarter" : "Civic Quarter")
      : theme === "market" ? "Market Row"
      : members.some((m) => /port|landing|docking|shipyard/.test(m.b.type)) ? "Dockside" : "Gate Quarter";
    used.set(base, (used.get(base) ?? 0) + 1);
    districts.push({ id: `${settlementId}/${n}`, settlementId, theme, name: used.get(base)! > 1 ? `${base} ${used.get(base)}` : base, buildingIds: members.map((m) => m.b.id) });
  }
  return districts;
}

// The district an area (a building or a room in one) is in, if it is in a settlement
export function districtAt(world: World, areaId: string): District | undefined {
  const building = trailOf(world, areaId).find((a) => a.kind === "building");
  const settlementId = building?.parentId;
  if (!building || !settlementId) return undefined;
  return districtsOf(world, settlementId).find((d) => d.buildingIds.includes(building.id));
}

// ---------------------------------------------------------------------------------------------
// The people in a district (house rule). Now and then an encounter waits there for the party:
// someone who needs help, a gang that means to rob them, a fixer with a job and, once the party
// has earned renown with the settlement's faction, a master who teaches the path of powers the
// party lacks: the Force to one who has tech, tech to one who has the Force, and to one who has
// neither whichever suits their alignment and skills. One encounter is open at a time; it stays
// until it is dealt with or the party leaves the district. Rolls are keyed by district, day and
// hour, so the same visit always comes out the same way.
// ---------------------------------------------------------------------------------------------

export const MASTER_RENOWN = 3;

export type EncounterKind = "help" | "robbery" | "fixer" | "master";

export interface Encounter {
  id: string;
  kind: EncounterKind;
  districtId: string;
  settlementId: string;
  person: string;
  title: string;
  text: string;
  target?: string; // the fixer's job: a building of the district the party is to reach
  faction?: string; // whose renown the party earns or loses
}

// What the party knows of itself, for who will teach it and what
export interface Learner {
  level: number;
  credits: number;
  force: boolean; // it can already use Force powers
  tech: boolean; // it can already use tech powers
  forceAlign: "Light" | "Dark" | "Universal" | "None";
  // What suits it when it has neither (see leaningOf)
  leaning: "force" | "tech";
  known: string[];
}

export const forceAlignOf = (text: string | null | undefined): Learner["forceAlign"] =>
  /dark/i.test(text ?? "") ? "Dark" : /light/i.test(text ?? "") ? "Light" : /universal/i.test(text ?? "") ? "Universal" : "None";

// Which path suits someone with neither: the Force for one with a Force alignment or whose
// Wisdom or Charisma is the greater, tech for one trained in technical skills or whose
// Intelligence is
export function leaningOf(forceAlignment: string | null | undefined, skills: string[], abilities: Record<string, number> = {}): Learner["leaning"] {
  if (forceAlignOf(forceAlignment) !== "None") return "force";
  if (skills.some((s) => /technology|piloting|investigation|engineering|mechanics/i.test(s))) return "tech";
  return Math.max(abilities.wisdom ?? 10, abilities.charisma ?? 10) > (abilities.intelligence ?? 10) ? "force" : "tech";
}

// The path a master offers: the one the learner lacks
export function pathToTeach(learner: Learner): "force" | "tech" | null {
  if (learner.force && learner.tech) return null;
  if (learner.force) return "tech";
  if (learner.tech) return "force";
  return learner.leaning;
}

export interface EncounterOption {
  label: string;
  abilities?: string[]; // the check, if there is one
  skill?: string;
  dc?: number;
  cost?: number; // paid before anything else
}

export function optionsOf(enc: Encounter, level: number, path?: "force" | "tech" | null): EncounterOption[] {
  if (enc.kind === "help") return [{ label: "Help them (Wisdom, Medicine, DC 12)", abilities: ["wisdom"], skill: "medicine", dc: 12 }, { label: "Walk on" }];
  if (enc.kind === "robbery")
    return [
      { label: "Talk your way out (Charisma, DC 13)", abilities: ["charisma"], dc: 13 },
      { label: "Fight them off (Strength or Dexterity, DC 12)", abilities: ["strength", "dexterity"], dc: 12 },
    ];
  if (enc.kind === "fixer") return [{ label: "Hear the job" }, { label: "Walk on" }];
  const cost = 200 * level;
  return [{ label: `Learn ${path === "tech" ? "tech" : "the ways of the Force"} from them (${cost} credits, two days)`, cost }, { label: "Walk on" }];
}

// What a master gives one who takes up a path: its first powers (an at-will one and one of the
// first level, of the learner's alignment where the path has one, and none already known) and a
// pool of power points to cast them with (house rule: the character's level plus the casting
// ability's modifier, at least two). The points are spent from the same pool a caster's are.
export interface Teaching {
  path: "force" | "tech";
  powers: any[];
  points: number;
}

export function teachingFor(learner: Learner, seed: string, castMod = 0): Teaching | null {
  const path = pathToTeach(learner);
  if (!path) return null;
  const kind = path === "force" ? "Force" : "Tech";
  const fits = (p: any, level: number) =>
    p.powerType === kind && p.level === level && !learner.known.includes(p.name) && (path === "tech" || p.forceAlignment === "Universal" || p.forceAlignment === learner.forceAlign || (learner.forceAlign === "None" && p.forceAlignment === "Universal"));
  const pick = (level: number, salt: string) => {
    const pool = (powerData as any[]).filter((p) => fits(p, level));
    return pool.length ? pool[Math.floor(unitOf(`${seed}|${salt}`) * pool.length)] : undefined;
  };
  const powers = [pick(0, "at-will"), pick(1, "first")].filter(Boolean);
  if (!powers.length) return null;
  return { path, powers, points: Math.max(2, Math.min(14, learner.level + castMod)) };
}

// What an encounter comes to: the message to the party and what changes. `success` is the check's
// result (ignored where there is none).
export interface EncounterResult {
  message: string;
  credits?: number;
  renown?: number;
  damage?: number;
  crime?: boolean; // a brawl in the street, reported to the law
  quest?: Quest;
  teaching?: Teaching;
}

export function encounterResult(enc: Encounter, option: number, success: boolean, learner: Learner, targetName = "the place", castMod = 0): EncounterResult {
  const lost = -Math.floor(learner.credits * 0.1);
  if (enc.kind === "help") {
    if (option !== 0) return { message: `You walk on. Someone else will have to help ${enc.person}.` };
    return success
      ? { message: `${enc.person} gets to a medcentre. They press a few credits into your hand.`, credits: 50 * learner.level, renown: 1 }
      : { message: `You try, but ${enc.person} is past what you can do here. They thank you anyway.` };
  }
  if (enc.kind === "robbery") {
    if (option === 0) return success ? { message: "They look at your holster and find someone else to bother." } : { message: "They take a tenth of your credits and go.", credits: lost };
    return success
      ? { message: "You put them down in the alley. Someone will have heard the brawl.", credits: 25 * learner.level, crime: true }
      : { message: "They get the better of you: a tenth of your credits gone, and a cut to pay for.", credits: lost, damage: 3, crime: true };
  }
  if (enc.kind === "fixer") {
    if (option !== 0) return { message: "You leave the fixer to their deals." };
    const quest: Quest = {
      id: `job-${enc.id}`,
      title: `A job from ${enc.person}`,
      description: `${enc.person} wants a package taken to ${targetName}. It pays ${100 * learner.level} credits.`,
      status: "active",
      objectives: [{ description: `Take the package to ${targetName}`, completed: false, target: { kind: "reach", areaId: enc.target ?? "" } }],
      reward: { credits: 100 * learner.level, items: [], experience: 0 },
    };
    return { message: `${enc.person} hands you a chip with the drop point on it.`, quest };
  }
  if (option !== 0) return { message: "You thank the master and go on." };
  const teaching = teachingFor(learner, enc.id, castMod);
  return teaching
    ? { message: `${enc.person} takes you through the first lessons: ${teaching.powers.map((p) => p.name).join(" and ")}. You can now ${teaching.path === "force" ? "use the Force" : "use tech powers"}.`, teaching }
    : { message: `${enc.person} has nothing more to teach one of your kind.` };
}

const PEOPLE = ["Old Dathan", "Pell", "Maro Vell", "Sabe Tarn", "Ilsa Korr", "Teb Rooks", "Ysolde Nim", "Carro Dask"];
const GANGS = ["Three Hutt runners", "Two Rim hoodlums with vibroknives", "A gang of street kids with slugthrowers", "A bruiser and his two lookouts"];
const TROUBLES = ["a sick child needs a medpac they cannot pay for", "a brother has not come out of the alley behind the cantina", "a stall was smashed and the owner is bleeding"];

// Whether an encounter waits in the district for the party at this hour, and which one. `avoid` is
// the building the party is in (a fixer's job goes elsewhere). The master comes once to a
// settlement, to a party with renown enough with its faction and a path to be taught.
export function rollEncounter(world: World, district: District, day: number, hour: number, learner: Learner, renown: number, avoid: string): Encounter | null {
  const key = `${district.id}|${day}|${hour}`;
  if (unitOf(`${key}|spawn`) >= 0.4) return null;
  const settlementId = district.settlementId;
  const master = renown >= MASTER_RENOWN && !!pathToTeach(learner) && !!teachingFor(learner, key) && !(world.mastersTaught ?? []).includes(settlementId);
  const pick = unitOf(`${key}|kind`);
  const others = district.buildingIds.filter((id) => id !== avoid);
  // weights: help 40, robbery 35 (if there is money to take), fixer 25 (if there is a place to send them)
  const robbery = learner.credits >= 100 ? 35 : 0;
  const fixer = others.length > 0 ? 25 : 0;
  const at = pick * (40 + robbery + fixer);
  const kind: EncounterKind = master && pick < 0.3 ? "master" : at < 40 ? "help" : at < 40 + robbery ? "robbery" : fixer ? "fixer" : "help";
  const person = PEOPLE[Math.floor(unitOf(`${key}|person`) * PEOPLE.length)];
  const base = { id: `${key}|${kind}`, districtId: district.id, settlementId, person, faction: factionAt(world, settlementId) };
  if (kind === "master") {
    const path = pathToTeach(learner);
    const teacher = path === "force" ? "a Force master" : "a master of tech";
    return { ...base, kind, title: "A master in the street", text: `${person}, ${teacher}, has heard what you have done for people here and says you have the gift. For a fee they will start you on the path.` };
  }
  if (kind === "robbery") {
    const gang = GANGS[Math.floor(unitOf(`${key}|gang`) * GANGS.length)];
    return { ...base, kind, title: "A gang in the alley", text: `${gang} step out in front of you and ask for "a contribution".` };
  }
  if (kind === "fixer") {
    const target = others[Math.floor(unitOf(`${key}|target`) * others.length)];
    return { ...base, kind, target, title: `A job from ${person}`, text: `${person} offers work: a package, no questions, to be taken to another building of this district.` };
  }
  const trouble = TROUBLES[Math.floor(unitOf(`${key}|trouble`) * TROUBLES.length)];
  return { ...base, kind: "help", title: "Someone in trouble", text: `${person} is in the street and says ${trouble}.` };
}

// ---------------------------------------------------------------------------------------------
// District plans (house rule; the books give no city). The buildings of a district stand on one
// grid of 5-foot squares: alleys of three squares between neighbours in a row, an avenue of six
// between rows and a street round the whole. A building keeps its rooms as they were planned and
// is moved as a whole, so a room's place on its grid is now a place in the district. Then:
//   - every building of three rooms or more gets a second way in, on the other side of it;
//   - every building gets a roof that can be climbed to by a ladder up its outside wall, seen
//     from the street, with sentries on it (snipers, where the building is hostile);
//   - roofs at the same height with up to a dozen squares between them are joined by a catwalk.
// The roof, the ladder and the catwalk are rooms of their own, open to the air, so that what is
// on them can be seen from the street and shot at from it, and the other way about.
// ---------------------------------------------------------------------------------------------

export interface DistrictPlan {
  id: string;
  name: string;
  theme: DistrictTheme;
  width: number;
  height: number;
  // Each building's box on the district's grid, in squares
  boxes: Record<string, { x: number; y: number; width: number; height: number }>;
  // Paved ground between the buildings
  ways: { x: number; y: number; width: number; height: number; kind: "avenue" | "alley" }[];
}

const ALLEY = 3;
const AVENUE = 6;
const EDGE = 6;
const CATWALK_SPAN = 12;

const floorsOf = (l: RoomLayout): [number, number] => [l.level ?? 0, (l.level ?? 0) + (l.climb?.levels ?? 0) + (l.tall ? 1 : 0)];
const layoutsClash = (a: RoomLayout, b: RoomLayout) => overlap(a, b) && floorsOf(a)[0] <= floorsOf(b)[1] && floorsOf(b)[0] <= floorsOf(a)[1];

// A room open to the air: a roof, or a walkway between two places
export const openAir = (a: Pick<Area, "tags">) => formOf(a) === "roof" || formOf(a) === "walkway";

// The squares of a room's wall that nothing is against (no other room at the same floors, no way in)
function freeWallSquares(all: Area[], room: Area, side: Side): number[] {
  const l = room.layout!;
  const length = side === "n" || side === "s" ? l.width : l.height;
  return Array.from({ length }, (_, i) => i).filter((i) => {
    const s = wallSquare(l, side, i);
    const beyond: RoomLayout = { x: l.x + s.x + (side === "e" ? 1 : side === "w" ? -1 : 0), y: l.y + s.y + (side === "s" ? 1 : side === "n" ? -1 : 0), width: 1, height: 1, assets: [], level: l.level, climb: l.climb, tall: l.tall };
    return !all.some((o) => o !== room && o.layout && layoutsClash(beyond, o.layout)) && !l.assets.some((a) => a.side && a.x === s.x && a.y === s.y);
  });
}

// The square outside a wall square, on the district's grid
const outsideOf = (l: RoomLayout, side: Side, along: number) => {
  const s = wallSquare(l, side, along);
  return { x: l.x + s.x + (side === "e" ? 1 : side === "w" ? -1 : 0), y: l.y + s.y + (side === "s" ? 1 : side === "n" ? -1 : 0) };
};

// The ground of a district that can be walked to from its streets: not inside a building at the
// ground floor, and joined to the margin round the plan. A way out that opens anywhere else
// (a walled-in pocket between buildings, the inside of another room) leads nowhere.
const STREET_MARGIN = 3;
export function streetGround(rooms: Area[], width: number, height: number): (x: number, y: number) => boolean {
  const M = STREET_MARGIN;
  const solid = rooms.filter((a) => a.layout && (a.layout.level ?? 0) >= 0 && formOf(a) !== "gallery" && !openAir(a));
  const inRoom = (x: number, y: number) => solid.some((a) => x >= a.layout!.x && x < a.layout!.x + a.layout!.width && y >= a.layout!.y && y < a.layout!.y + a.layout!.height);
  const inside = (x: number, y: number) => x >= -M && y >= -M && x < width + M && y < height + M;
  const seen = new Set<string>([`${-M},${-M}`]);
  const stack: [number, number][] = [[-M, -M]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (!inside(nx, ny) || inRoom(nx, ny) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      stack.push([nx, ny]);
    }
  }
  return (x, y) => seen.has(`${x},${y}`);
}

// Whether something that blocks stands on a square of a room (a way in the wall is not such a thing)
const blockedAt = (l: RoomLayout, x: number, y: number) => l.assets.some((a) => !a.side && a.blocks && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);

// A wall square for a way out on this side of a room: nothing against it, nothing standing on it,
// opening on to the street, and leaving every way of the room still reachable. Tries the squares
// nearest the middle first. Returns the square, or nothing.
function wayOutSquare(all: Area[], room: Area, side: Side, reach: (x: number, y: number) => boolean, ignore?: RoomAsset): number | undefined {
  const l = room.layout!;
  const free = freeWallSquares(all, room, side).filter((i) => {
    const sq = wallSquare(l, side, i);
    const o = outsideOf(l, side, i);
    return reach(o.x, o.y) && !blockedAt(l, sq.x, sq.y) && !l.assets.some((a) => a !== ignore && a.side && a.x === sq.x && a.y === sq.y);
  });
  const middle = free.length ? free[Math.floor(free.length / 2)] : 0;
  for (const i of [...free].sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle))) {
    const sq = wallSquare(l, side, i);
    const probe: RoomAsset = { id: "probe", kind: "exit", name: "probe", x: sq.x, y: sq.y, w: 1, h: 1, side };
    l.assets.push(probe);
    const faults = floorFaults(l);
    l.assets.pop();
    if (!faults) return i;
  }
  return undefined;
}

// A door set in the wall two rooms share, at the middle of what they share (or the nearest square
// to it that is free); false if they share no wall
function doorBetween(a: Area, b: Area, path: Path): boolean {
  const la = a.layout!;
  const lb = b.layout!;
  let side: Side | undefined;
  let low = 0;
  let high = -1;
  if (la.x + la.width === lb.x || lb.x + lb.width === la.x) {
    side = la.x + la.width === lb.x ? "e" : "w";
    low = Math.max(la.y, lb.y);
    high = Math.min(la.y + la.height, lb.y + lb.height) - 1;
  } else if (la.y + la.height === lb.y || lb.y + lb.height === la.y) {
    side = la.y + la.height === lb.y ? "s" : "n";
    low = Math.max(la.x, lb.x);
    high = Math.min(la.x + la.width, lb.x + lb.width) - 1;
  }
  if (!side || high < low) return false;
  const vertical = side === "e" || side === "w";
  const taken = (l: RoomLayout, s: Side, at: number) => {
    const sq = wallSquare(l, s, at - (vertical ? l.y : l.x));
    return l.assets.some((x) => x.side && x.x === sq.x && x.y === sq.y);
  };
  const middle = Math.floor((low + high) / 2);
  const options = Array.from({ length: high - low + 1 }, (_, i) => low + i).sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle));
  const at = options.find((o) => !taken(la, side!, o) && !taken(lb, OPPOSITE[side!], o));
  if (at === undefined) return false;
  la.assets.push({ id: `${a.id}-${la.assets.length + 1}`, kind: "door", name: path.label, ...wallSquare(la, side, at - (vertical ? la.y : la.x)), w: 1, h: 1, side, ref: path.id, to: b.id });
  lb.assets.push({ id: `${b.id}-${lb.assets.length + 1}`, kind: "door", name: path.label, ...wallSquare(lb, OPPOSITE[side], at - (vertical ? lb.y : lb.x)), w: 1, h: 1, side: OPPOSITE[side], ref: path.id, to: a.id });
  return true;
}

export function planDistrict(ctx: Context, district: District): DistrictPlan | undefined {
  const { world } = ctx;
  const existing = world.districtPlans?.[district.id];
  if (existing) return existing;
  let members = district.buildingIds.map((id) => world.areas[id]).filter((b): b is Area => !!b);
  for (const b of members) if (childrenOf(world, b.id).some((a) => a.kind === "room" && !a.layout)) planBuilding(world, b.id);
  const roomsOf = (b: Area) => childrenOf(world, b.id).filter((a) => a.kind === "room" && a.layout);
  members = members.filter((b) => roomsOf(b).length > 0);
  if (members.length < 2) return undefined;
  const r = createRandom(Math.floor(unitOf(`${district.id}|plan`) * 1e9));

  // Each building's rooms start from its own corner, then are set down where the building goes
  const sized = members.map((b) => {
    const rooms = roomsOf(b);
    const x = Math.min(...rooms.map((a) => a.layout!.x));
    const y = Math.min(...rooms.map((a) => a.layout!.y));
    for (const a of rooms) {
      a.layout!.x -= x;
      a.layout!.y -= y;
    }
    return { b, width: Math.max(...rooms.map((a) => a.layout!.x + a.layout!.width)), height: Math.max(...rooms.map((a) => a.layout!.y + a.layout!.height)) };
  });
  const order = [...sized].sort((p, q) => Number(!!q.b.gateway) - Number(!!p.b.gateway) || q.width * q.height - p.width * p.height);
  const target = Math.max(...order.map((o) => o.width), Math.ceil(Math.sqrt(order.reduce((n, o) => n + o.width * o.height, 0)) * 1.8));
  const rows: (typeof order)[] = [[]];
  let rowWidth = 0;
  for (const o of order) {
    const row = rows[rows.length - 1];
    if (row.length && rowWidth + ALLEY + o.width > target) {
      rows.push([o]);
      rowWidth = o.width;
    } else {
      rowWidth += (row.length ? ALLEY : 0) + o.width;
      row.push(o);
    }
  }
  const boxes: DistrictPlan["boxes"] = {};
  const ways: DistrictPlan["ways"] = [];
  let y = EDGE;
  let right = 0;
  rows.forEach((row, n) => {
    const tall = Math.max(...row.map((o) => o.height));
    let x = EDGE;
    row.forEach((o, i) => {
      boxes[o.b.id] = { x, y, width: o.width, height: o.height };
      for (const a of roomsOf(o.b)) {
        a.layout!.x += x;
        a.layout!.y += y;
      }
      x += o.width;
      if (i < row.length - 1) {
        ways.push({ x, y, width: ALLEY, height: tall, kind: "alley" });
        x += ALLEY;
      }
    });
    right = Math.max(right, x);
    y += tall;
    if (n < rows.length - 1) {
      ways.push({ x: EDGE, y, width: 0, height: AVENUE, kind: "avenue" });
      y += AVENUE;
    }
  });
  const width = right + EDGE;
  const height = y + EDGE;
  for (const w of ways) if (w.kind === "avenue") w.width = right - EDGE;

  const everyRoom = () => members.flatMap(roomsOf);

  // (Ground a way out can open on: the streets, not a pocket between buildings or the foot of an
  // upper floor that overhangs the door.) Every way out the buildings were planned with is made to open on it.
  const reach = streetGround(everyRoom(), width, height);
  fixStreetWays(everyRoom, reach);

  // A second way in, on the side of the building farthest from the first, for any building of
  // three rooms or more that has none
  for (const b of members) {
    const rooms = roomsOf(b);
    const real = rooms.filter((a) => !formOf(a));
    if (real.length < 3 || real.filter((a) => a.gateway).length >= 2) continue;
    const root = real.find((a) => a.gateway) ?? real[0];
    const from = { x: root.layout!.x + root.layout!.width / 2, y: root.layout!.y + root.layout!.height / 2 };
    const candidates = real
      .filter((a) => a !== root && !a.gateway && (a.layout!.level ?? 0) === 0 && !a.tags.includes("code:K") && !a.tags.includes("code:H") && !holdsShips(a) && !a.secretEntry)
      .sort((p, q) => Math.hypot(q.layout!.x - from.x, q.layout!.y - from.y) - Math.hypot(p.layout!.x - from.x, p.layout!.y - from.y));
    for (const room of candidates) {
      // On a side whose wall opens on the street and has a square nothing stands on
      const l = room.layout!;
      let placed = false;
      for (const side of ["s", "n", "e", "w"] as Side[]) {
        const at = wayOutSquare(everyRoom(), room, side, reach);
        if (at === undefined) continue;
        l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind: "exit", name: "Side entrance", ...wallSquare(l, side, at), w: 1, h: 1, side, to: b.id });
        room.gateway = true;
        placed = true;
        break;
      }
      if (placed) break;
    }
  }

  // Open-air rooms of the district
  const make = (b: Area, name: string, form: Form, layout: RoomLayout, tags: string[]): Area => {
    const area: Area = {
      id: nextId(world, "a"), kind: "room", parentId: b.id, name, type: name.toLowerCase(), description: "", tags: [`form:${form}`, ...tags],
      position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], faction: b.faction, layout,
    };
    world.areas[area.id] = area;
    return area;
  };
  // The ground (level 0, nothing built at or above it) a ladder's foot can stand on
  const groundOpen = (px: number, py: number) => !everyRoom().some((o) => o.layout && (o.layout.level ?? 0) >= 0 && !openAir(o) && px >= o.layout.x && px < o.layout.x + o.layout.width && py >= o.layout.y && py < o.layout.y + o.layout.height)
    && px >= 0 && py >= 0 && px < width && py < height;

  // A roof for each building, on the highest room that has a wall to the street to set a ladder
  // against (hangars have their own sky)
  const roofs: { roof: Area; building: Area }[] = [];
  for (const b of members) {
    const real = roomsOf(b).filter((a) => !formOf(a) && (a.layout!.level ?? 0) >= 0 && !a.layout!.roof);
    const ranked = [...real].sort((p, q) => (q.layout!.level ?? 0) - (p.layout!.level ?? 0) || q.layout!.width * q.layout!.height - p.layout!.width * p.layout!.height);
    for (const room of ranked) {
      const l = room.layout!;
      let spot: { side: Side; along: number } | undefined;
      for (const side of r.shuffle(["s", "n", "e", "w"] as Side[])) {
        const free = freeWallSquares(everyRoom(), room, side).filter((i) => {
          const o = outsideOf(l, side, i);
          return groundOpen(o.x, o.y) && reach(o.x, o.y);
        });
        if (free.length) {
          spot = { side, along: free[Math.floor(free.length / 2)] };
          break;
        }
      }
      if (!spot) continue;
      const roofLevel = (l.level ?? 0) + 1;
      const layout: RoomLayout = { x: l.x, y: l.y, width: l.width, height: l.height, assets: [], level: roofLevel, form: "roof" };
      // Not inside something that stands higher over it (a hangar over a lower room)
      if (everyRoom().some((o) => o !== room && o.layout && layoutsClash(layout, o.layout))) continue;
      layout.assets.push({ id: "", kind: "exit", name: "Ladder down", ...wallSquare(layout, spot.side, spot.along), w: 1, h: 1, side: spot.side, to: b.id });
      const roof = make(b, "Roof", "roof", layout, [`low:${roofLevel}`, "rise:0"]);
      layout.assets[0].id = `${roof.id}-1`;
      roof.gateway = true;
      roofs.push({ roof, building: b });
      break;
    }
  }

  // Catwalks between roofs at the same height: the shortest ones first, so that the buildings are
  // joined into a chain, and then one more now and then for a way round
  type Span = { a: Area; b: Area; ba: Area; bb: Area; layout: RoomLayout; gap: number };
  const spans: Span[] = [];
  for (let i = 0; i < roofs.length; i++) {
    for (let j = i + 1; j < roofs.length; j++) {
      const [p, q] = [roofs[i], roofs[j]];
      const [pl, ql] = [p.roof.layout!, q.roof.layout!];
      if (pl.level !== ql.level) continue;
      const level = pl.level ?? 1;
      const tryAcross = (first: typeof p, second: typeof p, axis: "x" | "y") => {
        const [fl, sl] = [first.roof.layout!, second.roof.layout!];
        const gap = axis === "x" ? sl.x - (fl.x + fl.width) : sl.y - (fl.y + fl.height);
        if (gap < 1 || gap > CATWALK_SPAN) return;
        const lo = axis === "x" ? Math.max(fl.y, sl.y) : Math.max(fl.x, sl.x);
        const hi = (axis === "x" ? Math.min(fl.y + fl.height, sl.y + sl.height) : Math.min(fl.x + fl.width, sl.x + sl.width)) - 1;
        if (hi - lo + 1 < 2) return;
        const at = Math.floor((lo + hi - 1) / 2);
        const layout: RoomLayout = axis === "x"
          ? { x: fl.x + fl.width, y: at, width: gap, height: 2, assets: [], level, form: "walkway" }
          : { x: at, y: fl.y + fl.height, width: 2, height: gap, assets: [], level, form: "walkway" };
        if (everyRoom().some((o) => o !== first.roof && o !== second.roof && o.layout && layoutsClash(layout, o.layout))) return;
        spans.push({ a: first.roof, b: second.roof, ba: first.building, bb: second.building, layout, gap });
      };
      for (const [first, second] of [[p, q], [q, p]] as const) {
        tryAcross(first, second, "x");
        tryAcross(first, second, "y");
      }
    }
  }
  spans.sort((p, q) => p.gap - q.gap);
  const group = new Map<string, string>(members.map((b) => [b.id, b.id]));
  const root = (id: string): string => (group.get(id) === id ? id : root(group.get(id)!));
  let made = 0;
  for (const span of spans) {
    const [ga, gb] = [root(span.ba.id), root(span.bb.id)];
    const joins = ga !== gb;
    if (!joins && (made >= members.length || !r.chance(0.35))) continue;
    // Not across another catwalk
    if (everyRoom().some((o) => o.layout && formOf(o) === "walkway" && layoutsClash(span.layout, o.layout))) continue;
    const walk = make(span.ba, `Catwalk to ${span.bb.name}`, "walkway", span.layout, [`low:${span.layout.level}`, "rise:0"]);
    const one = addPath(world, span.a, walk, "Catwalk", "10 ft.");
    const two = addPath(world, walk, span.b, "Catwalk", `${span.gap * 5} ft.`);
    if (!one || !two || !doorBetween(span.a, walk, one) || !doorBetween(walk, span.b, two)) {
      // No door to be had: take it back
      delete world.areas[walk.id];
      world.paths = world.paths.filter((p) => p !== one && p !== two);
      continue;
    }
    if (joins) group.set(ga, gb);
    made++;
  }

  // The roofs are furnished (vents, tanks, crates for cover) and given their sentries
  for (const { roof, building } of roofs) {
    const template = BUILDINGS[building.type];
    const hostile = !!template?.hostile && (template.hostile !== "faction" || (building.faction ?? world.antagonist) === world.antagonist);
    const posted = hostile || /^(palace|garrison|command post|operations center|spaceport|city gate|town gate)$/.test(building.type);
    roof.danger = hostile ? Math.max(1, building.danger - 1) : 0;
    furnishRoom(roof, r, building.type);
    if (posted) {
      roof.tags.push("code:g");
      populateRoom(ctx, roof);
    }
    placeContents(roof, r);
  }

  const plan: DistrictPlan = { id: district.id, name: district.name, theme: district.theme, width, height, boxes, ways };
  world.districtPlans = { ...(world.districtPlans ?? {}), [district.id]: plan };
  return plan;
}

// Every way out of a building (an exit set in a ground-floor wall) is made to open on the street:
// a way that opens on a pocket, or under an upper floor that overhangs it, is moved to another
// wall of its room; failing that it is taken out if its building has another that works, or moved
// to another ground-floor room of the building. Returns how many were moved and how many could not be.
function fixStreetWays(rooms: () => Area[], reach: (x: number, y: number) => boolean): { moved: number; unresolved: number } {
  const out = { moved: 0, unresolved: 0 };
  const touched = new Set<Area>();
  const beyondOf = (l: RoomLayout, a: RoomAsset) => ({ x: l.x + a.x + (a.side === "e" ? 1 : a.side === "w" ? -1 : 0), y: l.y + a.y + (a.side === "s" ? 1 : a.side === "n" ? -1 : 0) });
  const ground = (o: Area) => (o.layout!.level ?? 0) <= 0 && !openAir(o);
  const works = (o: Area) => o.layout!.assets.some((a) => a.kind === "exit" && a.side && reach(beyondOf(o.layout!, a).x, beyondOf(o.layout!, a).y));
  for (const room of rooms()) {
    const l = room.layout!;
    if (!ground(room)) continue;
    for (const way of l.assets.filter((a) => a.kind === "exit" && a.side)) {
      const o = beyondOf(l, way);
      if (reach(o.x, o.y)) continue;
      // Another wall square of the same room (any side) that opens on the street, with this way set aside
      const saved = l.assets;
      l.assets = saved.filter((a) => a !== way);
      let moved = false;
      for (const side of ["s", "n", "e", "w"] as Side[]) {
        const at = wayOutSquare(rooms(), room, side, reach);
        if (at === undefined) continue;
        Object.assign(way, wallSquare(l, side, at), { side });
        moved = true;
        break;
      }
      l.assets = saved;
      if (moved) {
        out.moved++;
        touched.add(room);
        continue;
      }
      const others = rooms().filter((x) => x !== room && x.parentId === room.parentId && ground(x));
      if (way.name === "Side entrance" || others.some(works)) {
        // A dead way, and the building has another that opens on the street: it is taken out
        l.assets = saved.filter((a) => a !== way);
        if (!l.assets.some((a) => a.kind === "exit")) room.gateway = false;
        out.moved++;
        touched.add(room);
        continue;
      }
      // The only way in: moved to another ground-floor room that has a wall on the street
      const host = others.find((x) => (["s", "n", "e", "w"] as Side[]).some((side) => wayOutSquare(rooms(), x, side, reach) !== undefined));
      const side = host && (["s", "n", "e", "w"] as Side[]).find((sd) => wayOutSquare(rooms(), host, sd, reach) !== undefined);
      if (host && side) {
        const hl = host.layout!;
        hl.assets.push({ ...way, id: `${host.id}-${hl.assets.length + 1}`, ...wallSquare(hl, side, wayOutSquare(rooms(), host, side, reach)!), side });
        host.gateway = true;
        l.assets = saved.filter((a) => a !== way);
        if (!l.assets.some((a) => a.kind === "exit")) room.gateway = false;
        out.moved++;
        touched.add(room);
        touched.add(host);
      } else out.unresolved++;
    }
  }
  // Whoever stands by a way that moved goes with it
  for (const room of touched) placeContents(room);
  return out;
}

// Mends the ways in and out of the planned districts of a world (mutates it): ways are kept
// clear of anything that blocks, so that every door, side entrance, secret way and stair of a room
// can be walked to; and a way out of a building that opens on a pocket between buildings, or on
// nothing, is moved to a wall of its room that opens on the street (a side entrance with no such wall
// is taken out). Returns how many rooms were mended, ways moved and ways that could not be.
export function repairAccess(world: World, random: Random = createRandom(world.seed + 9)): { mended: number; moved: number; unresolved: number } {
  const out = { mended: 0, moved: 0, unresolved: 0 };
  for (const plan of Object.values(world.districtPlans ?? {})) {
    const members = Object.keys(plan.boxes).map((id) => world.areas[id]).filter((b): b is Area => !!b);
    const roomsOf = () => members.flatMap((b) => childrenOf(world, b.id).filter((a) => a.kind === "room" && a.layout));
    // Nothing stands on a way, and every way can be walked to
    for (const room of roomsOf()) {
      const l = room.layout!;
      const standsOn = l.assets.some((w) => w.side && blockedAt(l, w.x, w.y));
      if (standsOn || floorFaults({ ...l, assets: l.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship") })) {
        repairFloor(room, random);
        out.mended++;
      }
    }
    // A way out that opens on the street
    const moved = fixStreetWays(roomsOf, streetGround(roomsOf(), plan.width, plan.height));
    out.moved += moved.moved;
    out.unresolved += moved.unresolved;
  }
  return out;
}

// The districts of a settlement, planned (nothing for wild sites)
export function planDistricts(ctx: Context, settlementId: string) {
  for (const district of districtsOf(ctx.world, settlementId)) planDistrict(ctx, district);
}

// ---------------------------------------------------------------------------------------------
// A fight in the street of a district. The ground is the district's own, with the buildings as
// blocks of a height (a shot cannot pass through one, and the party cannot walk into one); the
// roofs and the catwalks are raised floors, with their cover; a ladder joins the street to a roof.
// Coordinates are the district's grid, as the rooms' places on it are.
// ---------------------------------------------------------------------------------------------

export interface DistrictArena {
  district: string;
  width: number;
  height: number;
  assets: RoomAsset[];
  platforms: { z: number; x: number; y: number; width: number; height: number }[];
  links: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number } }[];
}

export function districtArena(world: World, districtId: string): DistrictArena | undefined {
  const plan = world.districtPlans?.[districtId];
  if (!plan) return undefined;
  const rooms = Object.keys(plan.boxes).flatMap((id) => childrenOf(world, id)).filter((a) => a.kind === "room" && a.layout);
  const assets: RoomAsset[] = [];
  const platforms: DistrictArena["platforms"] = [];
  const links: DistrictArena["links"] = [];
  for (const room of rooms) {
    const l = room.layout!;
    const level = l.level ?? 0;
    if (!openAir(room)) {
      if (level < 0) continue;
      // The block a building makes: as high as its room's roof
      assets.push({ id: `block-${room.id}`, kind: "furniture", name: world.areas[room.parentId ?? ""]?.name ?? "Building", x: l.x, y: l.y, w: l.width, h: l.height, blocks: true, height: level + 1 + (l.climb?.levels ?? 0) });
      continue;
    }
    platforms.push({ z: level, x: l.x, y: l.y, width: l.width, height: l.height });
    for (const a of l.assets) {
      if (a.kind === "furniture" && !a.side) assets.push({ ...a, id: `${room.id}-${a.id}`, x: l.x + a.x, y: l.y + a.y, z: level });
      // The ladder from the street to a roof
      if (a.kind === "exit" && a.side && formOf(room) === "roof") {
        const foot = { x: l.x + a.x + (a.side === "e" ? 1 : a.side === "w" ? -1 : 0), y: l.y + a.y + (a.side === "s" ? 1 : a.side === "n" ? -1 : 0), z: 0 };
        links.push({ from: foot, to: { x: l.x + a.x, y: l.y + a.y, z: level } });
      }
    }
  }
  // A little cover on the street before each way in: a pair of crates a few squares out
  for (const id of Object.keys(plan.boxes)) {
    const front = districtFront(world, id);
    if (!front) continue;
    for (const [i, side] of [-2, 2].entries()) {
      const x = front.x + front.outward.x * 3 + Math.abs(front.outward.y) * side;
      const y = front.y + front.outward.y * 3 + Math.abs(front.outward.x) * side;
      const inside = assets.some((a) => a.height && x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h);
      if (!inside && x >= 0 && y >= 0 && x < plan.width && y < plan.height) assets.push({ id: `crate-${id}-${i}`, kind: "furniture", name: "Crate stack", x, y, w: 1, h: 1, blocks: true, cover: true });
    }
  }
  return { district: districtId, width: plan.width, height: plan.height, assets, platforms, links };
}

// The square before a building's main way in, on its district's grid, and which way it faces
export function districtFront(world: World, buildingId: string): { x: number; y: number; outward: { x: number; y: number } } | undefined {
  const rooms = childrenOf(world, buildingId).filter((a) => a.kind === "room" && a.layout);
  const root = rooms.find((a) => a.gateway && !formOf(a)) ?? rooms.find((a) => a.gateway) ?? rooms[0];
  const exit = root?.layout?.assets.find((a) => a.kind === "exit" && a.side);
  if (!root?.layout || !exit) return undefined;
  const outward = { x: exit.side === "w" ? -1 : exit.side === "e" ? 1 : 0, y: exit.side === "n" ? -1 : exit.side === "s" ? 1 : 0 };
  return { x: root.layout.x + exit.x + outward.x, y: root.layout.y + exit.y + outward.y, outward };
}

// ---------------------------------------------------------------------------------------------
// What the levels of a building hold (house rule). A hostile building keeps a sentry on its
// gallery, a perch over the room (a gunner or sniper that can be shot back at from the floor, and
// that shoots down at it). Some rooms have a pit under a loose flagstone: whoever steps on it
// falls a level (1d6 damage) into a pit it can climb out of (Athletics or Dexterity, DC 12; a
// failure costs a minute and can be tried again). Passive Perception notices the flagstone from
// two squares away; Search finds it.
// ---------------------------------------------------------------------------------------------

export const PIT_CLIMB_DC = 12;

function furnishLevels(ctx: Context, building: Area) {
  const { world } = ctx;
  if (building.tags.includes("levels")) return;
  building.tags.push("levels");
  const r = createRandom(Math.floor(unitOf(`${building.id}|levels`) * 1e9));
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room" && a.layout);
  const template = BUILDINGS[building.type];
  const hostile = !!template?.hostile && (template.hostile !== "faction" || (building.faction ?? world.antagonist) === world.antagonist);
  const wild = WILD_BUILDINGS.includes(building.type);
  for (const gallery of rooms.filter((a) => formOf(a) === "gallery")) {
    if (!hostile || gallery.occupants.length) continue;
    gallery.tags.push("code:g");
    gallery.danger = Math.max(1, building.danger - 1);
    populateRoom(ctx, gallery);
    placeContents(gallery, r);
  }
  for (const room of rooms) {
    const l = room.layout!;
    if (formOf(room) || room.gateway || (l.level ?? 0) !== 0 || l.width < 6 || l.height < 5) continue;
    if (!r.chance(hostile || wild ? 0.3 : 0.08)) continue;
    // A square clear of the walls (and so of the doors) and of everything in the room
    const spots: { x: number; y: number }[] = [];
    for (let y = 2; y < l.height - 2; y++) for (let x = 2; x < l.width - 2; x++) {
      if (!l.assets.some((a) => a.x - 1 <= x && x <= a.x + a.w && a.y - 1 <= y && y <= a.y + a.h)) spots.push({ x, y });
    }
    if (!spots.length) continue;
    const spot = r.pick(spots);
    const pitLayout: RoomLayout = { x: l.x + spot.x - 1, y: l.y + spot.y - 1, width: 3, height: 3, assets: [], level: -1, form: "pit" };
    if (rooms.some((o) => o !== room && o.layout && layoutsClash(pitLayout, o.layout))) continue;
    const pit: Area = {
      id: nextId(world, "a"), kind: "room", parentId: building.id, name: "Pit", type: "pit", description: "A pit under the floor, deep enough to hurt and not too deep to climb out of.",
      tags: ["form:pit", "low:-1", "rise:0"], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], faction: building.faction, layout: pitLayout,
    };
    world.areas[pit.id] = pit;
    pitLayout.assets.push({ id: `${pit.id}-1`, kind: "stairs", name: "Climb out", x: 1, y: 1, w: 1, h: 1, to: room.id });
    if (!addPath(world, room, pit, "Climb out of the pit", "10 ft.", { hidden: true, climb: PIT_CLIMB_DC })) {
      delete world.areas[pit.id];
      continue;
    }
    l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind: "furniture", name: "Loose flagstone", x: spot.x, y: spot.y, w: 1, h: 1, ref: pit.id });
  }
}

// The trap squares of a room that have not been found, and those that have
export const trapsIn = (room: Pick<Area, "layout">, found: boolean) =>
  (room.layout?.assets ?? []).filter((a) => a.kind === "furniture" && a.name === (found ? "Pit trap" : "Loose flagstone") && a.ref);

// A room with a gallery over part of it, or the gallery itself, as a place to fight: the room's
// own grid with the gallery as a raised floor of half a level, and the stairs as the way up
export function levelsArena(world: World, roomId: string): { host: Area; gallery: Area; platforms: DistrictArena["platforms"]; links: DistrictArena["links"]; assets: RoomAsset[] } | undefined {
  const room = world.areas[roomId];
  if (!room?.layout) return undefined;
  const host = formOf(room) === "gallery" ? world.areas[tagId(room, "host") ?? ""] : room;
  if (!host?.layout) return undefined;
  const gallery = formOf(room) === "gallery" ? room : childrenOf(world, host.parentId ?? "").find((g) => formOf(g) === "gallery" && tagId(g, "host") === host.id);
  if (!gallery?.layout) return undefined;
  const [h, g] = [host.layout, gallery.layout];
  const z = (g.level ?? 0) - (h.level ?? 0);
  const stairs = h.assets.find((a) => a.kind === "stairs" && a.to === gallery.id);
  return {
    host,
    gallery,
    platforms: [{ z, x: g.x - h.x, y: g.y - h.y, width: g.width, height: g.height }],
    links: stairs ? [{ from: { x: stairs.x, y: stairs.y, z: 0 }, to: { x: stairs.x, y: stairs.y - 1, z } }] : [],
    assets: g.assets.filter((a) => a.kind === "furniture" && !a.side).map((a) => ({ ...a, id: `${gallery.id}-${a.id}`, x: g.x - h.x + a.x, y: g.y - h.y + a.y, z })),
  };
}

// The lines of a transit hub (house rule): to the hub of each other settlement of its planet that
// has one, over the ground, at the distance the settlements' own route has
function linkTransit(ctx: Context, settlement: Area) {
  const { world } = ctx;
  const hubOf = (s: Area) => childrenOf(world, s.id).find((b) => b.kind === "building" && b.type === "transit hub");
  const hub = hubOf(settlement);
  const planet = ancestor(world, settlement.id, "planet");
  if (!hub || !planet) return;
  for (const other of childrenOf(world, planet.id).filter((a) => a.kind === "settlement" && a.id !== settlement.id)) {
    const there = hubOf(other);
    if (!there || WILD_SETTLEMENTS.includes(other.type)) continue;
    const km = Math.max(5, Math.round(distance(settlement, other) * 25));
    addPath(world, hub, there, "Transit line", `${km} km`);
  }
}

// ---------------------------------------------------------------------------------------------
// Enhanced items in play (Wretched Hives, "Enhanced Items": attunement, consumables, cybernetic
// augmentations; the Prosthetics of the Equipment chapter). What an item does is read from its
// text where the wording is regular; the rest is shown and not applied.
// ---------------------------------------------------------------------------------------------

export const ITEM_ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;

export interface ItemEffects {
  // A bonus to the weapon's own attack and damage rolls (or to unarmed strikes, for handwraps)
  attack?: number;
  damage?: number;
  unarmed?: boolean;
  // A bonus to armor class, and "your AC becomes 13 + your Dexterity modifier" without armor
  ac?: number;
  acBase?: { base: number; ability: string };
  // A droid's "base AC becomes 19" (plating)
  acSet?: number;
  // "Your Strength score becomes 19" (no effect when it is higher already), "increases by 1, to a
  // maximum of 20" (`max`; a package raises the maximum as well)
  setScores?: Record<string, number>;
  raiseScores?: Record<string, { by: number; max: number }>;
  // Speed gained, in feet, and temporary hit points given (adrenals, barriers)
  speed?: number;
  tempHp?: number;
  // Side effect: one other ability score falls by 1
  falls?: boolean;
}

// What a stimpac, an adrenal, a barrier or a collimator does for how long; `fight` ones last for
// the minute of a fight (ten rounds) and wait for the next one when taken outside it (house
// rule, like a substance's high)
export interface TimedEffect {
  kind: "stimpac" | "adrenal" | "barrier" | "collimator";
  minutes: number;
  effects: ItemEffects;
  // A collimator is applied to one kind of weapon
  weapon?: string;
}

export interface ItemFacts {
  name: string;
  type: string;
  subtype?: string;
  rarity: string;
  // Attunement slots it takes (0: none needed)
  attune: number;
  effects: ItemEffects;
  text: string;
  // Augmentations: replacement or enhancement, and the body parts replaced
  augment?: "enhancement" | "replacement";
  parts?: string[];
  timed?: TimedEffect;
  // A modification: the kind of item it goes in ("blaster", "armor", "augment"...) and the
  // properties it gives the item ("absorbing 2")
  modKind?: string;
  properties?: string[];
  // A chassis: the kind of item it upgrades, and the rarity it brings
  chassis?: string;
  // A droid customization: a part (replaces a physical part) or a protocol
  droid?: "part" | "protocol";
}

export const ATTUNEMENT_LIMIT_NOTE = "A creature can be attuned to as many items as its proficiency bonus; standard, premium and prototype items take one, advanced, legendary and artifact two.";
export const attunementLimit = (level: number) => 2 + Math.floor(((Number(level) || 1) - 1) / 4);
export const attunementSlots = (requires: boolean, rarity: string) => (!requires ? 0 : /advanced|legendary|artifact/i.test(rarity) ? 2 : 1);

const plainText = (text: string) => text.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const abilityOf = (word: string) => (ITEM_ABILITIES as readonly string[]).find((a) => a === word.toLowerCase());

// What a text gives: the bonuses of the weapon, armor class, ability scores, speed. Conditional
// lines ("when you do so", "instead of", "while ... attuned to this armor, X and Y") are left out.
export function parseItemEffects(source: string): ItemEffects {
  const effects: ItemEffects = {};
  const text = plainText(source);
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    if (/\binstead of\b|\bwhen you do so\b|\blose the\b|\bfor each saving throw\b/i.test(sentence)) continue;
    const bonus = sentence.match(/\+(\d+) bonus to (attack and damage rolls|attack rolls and damage rolls|attack rolls|damage rolls)/i);
    if (bonus && !/force attack|tech attack|force powers|grenade|save DC|wrist launcher|dart/i.test(sentence) && effects.attack === undefined && effects.damage === undefined) {
      const n = Number(bonus[1]);
      if (/attack/i.test(bonus[2])) effects.attack = n;
      if (/damage/i.test(bonus[2])) effects.damage = n;
      if (/unarmed strikes/i.test(sentence)) effects.unarmed = true;
    }
    const ac = sentence.match(/\+(\d+) bonus to AC/i);
    if (ac && effects.ac === undefined) effects.ac = Number(ac[1]);
    const plating = sentence.match(/base AC becomes (\d+)/i);
    if (plating) effects.acSet = Number(plating[1]);
    const quick = sentence.match(/(?:your|its) speed increases by (\d+) feet/i);
    if (quick && effects.speed === undefined && !/\bwhile\b|\bwhen\b/i.test(sentence)) effects.speed = Number(quick[1]);
    const base = sentence.match(/AC becomes (\d+) \+ your (\w+) modifier/i);
    if (base && abilityOf(base[2]) && /aren't wearing armor|not wearing armor/i.test(sentence)) effects.acBase = { base: Number(base[1]), ability: abilityOf(base[2])! };
    for (const m of sentence.matchAll(/(?:your|the target's) (\w+) score (?:becomes|is(?: treated as)?) (\d+)/gi)) {
      const a = abilityOf(m[1]);
      if (a) effects.setScores = { ...(effects.setScores ?? {}), [a]: Number(m[2]) };
    }
    const raise = sentence.match(/(?:your|the target's) (\w+) score increases by (\d+)(?:, to a maximum of (\d+)|, and (?:your|its) maximum for this score increases by (\d+))/i);
    if (raise && abilityOf(raise[1])) effects.raiseScores = { ...(effects.raiseScores ?? {}), [abilityOf(raise[1])!]: { by: Number(raise[2]), max: raise[3] ? Number(raise[3]) : 20 + Number(raise[4]) } };
  }
  if (/Side Effect:\s*One ability score/i.test(text)) effects.falls = true;
  return effects;
}

// A stimpac, adrenal, barrier or collimator's effect, for how long
export function parseTimedEffect(name: string, consumableType: string | undefined, source: string): TimedEffect | undefined {
  const text = plainText(source);
  const length = text.match(/lasts? (?:for )?(\d+) (minute|hour)s?/i) ?? text.match(/for (\d+) (minute|hour)s?/i);
  const minutes = length ? Number(length[1]) * (/hour/i.test(length[2]) ? 60 : 1) : 1;
  const collimator = text.match(/apply this \w+ to one (\w+)(?: or \w+)? within 5 feet, granting it a \+(\d+) bonus to attack and damage rolls for 1 minute/i);
  if (collimator) return { kind: "collimator", minutes: 1, weapon: collimator[1].toLowerCase(), effects: { attack: Number(collimator[2]), damage: Number(collimator[2]) } };
  if (consumableType === "Stimpacs") return { kind: "stimpac", minutes, effects: parseItemEffects(text) };
  if (consumableType === "Barriers") {
    const hp = Number((text.match(/barrier has (\d+) hit points/i) ?? [])[1]);
    const hours = Number((text.match(/lasts (\d+) hours?/i) ?? [])[1]) || 1;
    return hp ? { kind: "barrier", minutes: hours * 60, effects: { tempHp: hp } } : undefined;
  }
  if (consumableType === "Adrenals") {
    const effects: ItemEffects = {};
    const speed = text.match(/speed increases by (\d+) feet/i);
    if (speed) effects.speed = Number(speed[1]);
    const hp = text.match(/current and maximum hit points increase by (\d+)/i);
    if (hp) effects.tempHp = Number(hp[1]);
    return { kind: "adrenal", minutes, effects };
  }
  return undefined;
}

// Body parts an augmentation takes, from "This augmentation replaces an arm", "both legs", "your
// eyes and face". Two arms, two legs, two eyes, two ears; one face, torso and throat.
export function augmentationParts(text: string): string[] {
  const m = plainText(text).match(/replaces ([^.]*)\./i);
  if (!m) return [];
  const parts: string[] = [];
  const clause = m[1].toLowerCase();
  // An arm, a forearm and a hand are one limb (one place for a replacement); so are a leg and a foot
  const groups: [RegExp, string, RegExp][] = [
    [/\b(?:arms?|forearms?|hands?)\b/, "arm", /\b(?:both|arms|forearms|hands)\b/],
    [/\b(?:legs?|foot|feet)\b/, "leg", /\b(?:both|legs|feet)\b/],
    [/\beyes?\b/, "eye", /\b(?:both|eyes)\b/],
    [/\bears?\b/, "ear", /\b(?:both|ears)\b/],
    [/\bface\b/, "face", /$^/],
    [/\btorso\b/, "torso", /$^/],
    [/\bthroat\b/, "throat", /$^/],
  ];
  for (const [present, key, both] of groups) {
    if (present.test(clause)) for (let i = 0; i < (both.test(clause) ? 2 : 1); i++) parts.push(key);
  }
  return parts;
}

// The prosthetics of the Equipment chapter (house rule for their effects: none beyond replacing
// the part; the books give them no numbers)
export const PROSTHESES: Record<string, string[]> = {
  "arm prosthesis": ["arm"], "forearm prosthesis": ["arm"], "hand prosthesis": ["arm"],
  "leg prosthesis": ["leg"], "foot prosthesis": ["leg"], "eye prosthesis": ["eye"], "ear prosthesis": ["ear"],
  "facial prosthesis": ["face"], "throat prosthesis": ["throat"], "torso prosthesis": ["torso"],
};
export const BODY_PARTS: Record<string, number> = { arm: 2, leg: 2, eye: 2, ear: 2, face: 1, torso: 1, throat: 1 };

// What an enhanced item row amounts to in play; undefined for those with nothing to apply
export function itemFactsOf(row: { name: string; type: string; subtype?: string; searchableRarity: string; requiresAttunement?: boolean; text?: string; consumableType?: string; cyberneticAugmentationType?: string }): ItemFacts | undefined {
  const text = row.text ?? "";
  const base = { name: row.name, type: row.type, subtype: row.subtype, rarity: row.searchableRarity, attune: attunementSlots(!!row.requiresAttunement, row.searchableRarity), text: plainText(text) };
  if (row.type === "Consumable") {
    const timed = parseTimedEffect(row.name, row.consumableType, text);
    return timed ? { ...base, effects: {}, timed } : undefined;
  }
  if (row.type === "ItemModification") {
    const properties = Array.from(plainText(text).matchAll(/gains? the ([a-z\-]+(?: \d+)?) property/gi)).map((m) => m[1].toLowerCase());
    return { ...base, text: base.text.slice(0, 320), effects: parseItemEffects(text), modKind: String(row.subtype ?? "").toLowerCase(), properties };
  }
  if (/ Chassis \(/.test(row.name)) {
    const kind = chassisKind(row);
    return kind ? { ...base, text: base.text.slice(0, 200), effects: {}, chassis: kind } : undefined;
  }
  if (row.type === "DroidCustomization") {
    return { ...base, effects: parseItemEffects(text), droid: /protocol/i.test((row as any).droidCustomizationType ?? "") ? "protocol" : "part" };
  }
  if (row.type === "CyberneticAugmentation") {
    return { ...base, effects: parseItemEffects(text), augment: /replacement/i.test(row.cyberneticAugmentationType ?? row.subtype ?? "") ? "replacement" : "enhancement", parts: augmentationParts(text) };
  }
  if (["Weapon", "Armor", "Shield", "Focus", "AdventuringGear"].includes(row.type)) return { ...base, effects: parseItemEffects(text) };
  return undefined;
}

// ---- Modifiable items (Wretched Hives, "Modifiable Items"; and its "Common Modifications" variant,
// which is the house setting here: every plain weapon, armor, shield, wristpad, focus generator
// and piece of clothing is a standard chassis with four modification slots)
export const RARITY_ORDER = ["standard", "premium", "prototype", "advanced", "legendary", "artifact"];
export const rarityRank = (rarity: string) => Math.max(0, RARITY_ORDER.indexOf(String(rarity).toLowerCase()));
// Base slots 4; augment slots by rarity (prototype and advanced 1, legendary and artifact 2)
export const MOD_BASE_SLOTS = 4;
export const augmentSlots = (rarity: string) => [0, 0, 1, 1, 2, 2][rarityRank(rarity)];
export const MOD_KINDS = ["blaster", "vibroweapon", "lightweapon", "armor", "clothing", "wristpad", "focus generator"] as const;

// Which kind of modification a plain item takes
export function modKindOf(item: { name: string; equipmentCategory?: string; weaponClassification?: string; armorClassification?: string }): string | undefined {
  const name = item.name.toLowerCase();
  const weapon = String(item.weaponClassification ?? "").toLowerCase();
  if (item.equipmentCategory === "Weapon") return /blaster/.test(weapon) ? "blaster" : /vibro/.test(weapon) ? "vibroweapon" : /light/.test(weapon) ? "lightweapon" : undefined;
  if (item.equipmentCategory === "Armor") return "armor";
  if (item.equipmentCategory === "Clothing") return "clothing";
  if (name === "wristpad") return "wristpad";
  if (name === "focus generator") return "focus generator";
  return undefined;
}
// What a chassis row upgrades
function chassisKind(row: { name: string; type: string; subtype?: string }): string | undefined {
  const sub = String(row.subtype ?? "").toLowerCase();
  if (/blaster/.test(row.name.toLowerCase())) return "blaster";
  if (/vibroweapon/.test(row.name.toLowerCase())) return "vibroweapon";
  if (/lightweapon/.test(row.name.toLowerCase())) return "lightweapon";
  if (row.type === "Armor" || row.type === "Shield") return "armor";
  if (row.type === "AdventuringGear") return "clothing";
  if (row.type === "Focus") return /tech/.test(sub) ? "wristpad" : "focus generator";
  return undefined;
}
// What a modification kind goes into: the kind of the item, with armor mods in shields too
export const modFits = (modKind: string, itemKind: string) => modKind === itemKind || (modKind === "augment");

// A plain item as modified: its rarity (standard unless a chassis was fitted) and what is in it
export interface Fitted {
  rarity: string;
  mods: string[];
  crystal?: string;
}

// ---- Color crystals (Forcecasting Color Crystal Modifier, Color Crystal): the check's DC reached
// gives the d100's modifier; the crystal is the color rolled or any below it
export const CRYSTAL_MODIFIER: [number, number][] = [[1, -15], [5, -10], [10, -5], [15, 0], [20, 5], [25, 10], [30, 20]];
export const CRYSTALS: [number, string][] = [
  [20, "Blue"], [40, "Red"], [60, "Green"], [70, "Yellow"], [80, "Purple"], [90, "Orange"], [93, "Viridian"], [96, "Cyan"], [97, "Bronze"], [98, "Silver"], [99, "White"], [Infinity, "Black"],
];
export const crystalModifier = (check: number) => CRYSTAL_MODIFIER.filter(([dc]) => check >= dc).map(([, m]) => m).pop() ?? -15;
export const crystalFor = (d100: number) => CRYSTALS.find(([top]) => d100 <= top)![1];
// The colors at or below one rolled, in the table's order
export const crystalsUpTo = (color: string) => CRYSTALS.map(([, c]) => c).slice(0, CRYSTALS.findIndex(([, c]) => c === color) + 1);

// ---- Droid customizations (Wretched Hives): a motor supports two, upgraded to six
export const DROID_MOTOR_COST: Record<number, number> = { 3: 2000, 4: 10000, 5: 50000, 6: 200000 };
export const DROID_BASE_SLOTS = 2;
export const droidPlan = (rarity: string, size = "medium", removing = false) => augmentPlan(rarity, size, removing);

// ---- Information gear (house rule): what reading a credit chip, datacard, datacron or holocron
// gives. A chip is credits; the others, a d100: lore of a place, a blueprint, or credits.
export function readOutcome(form: "chip" | "card" | "cron" | "holocron", d100: number): "credits" | "lore" | "blueprint" {
  if (form === "chip") return "credits";
  if (form === "holocron") return d100 <= 60 ? "lore" : "blueprint";
  return d100 <= 40 ? "lore" : d100 <= 75 ? "blueprint" : "credits";
}
// The rarity of a blueprint a level can find (the book's tiers: levels 1-4 standard and premium...)
export const blueprintRarity = (level: number, d100: number): string => {
  const top = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return RARITY_ORDER[Math.min(top, Math.floor((d100 / 100) * (top + 1)))];
};
// Credits in a chip or a card: 2d6 x 25 x the level's tier (1 to 4)
export const readCredits = (two6: number, level: number) => two6 * 25 * Math.max(1, Math.ceil(level / 5));

// Effects of what is active, added up (scores are applied by scoresWith)
export function sumEffects(list: ItemEffects[]): ItemEffects {
  const total: ItemEffects = {};
  for (const e of list) {
    if (e.ac) total.ac = (total.ac ?? 0) + e.ac;
    if (e.speed) total.speed = (total.speed ?? 0) + e.speed;
    if (e.tempHp) total.tempHp = Math.max(total.tempHp ?? 0, e.tempHp);
    if (e.acBase && (!total.acBase || e.acBase.base > total.acBase.base)) total.acBase = e.acBase;
  }
  return total;
}

// Ability scores with items applied: set first (no effect when the score is higher already), then
// raised up to the cap, then a side effect lowers the ability chosen for it by 1
export function scoresWith(scores: Record<string, number>, list: ItemEffects[], falls: string[] = []): Record<string, number> {
  const out: Record<string, number> = { ...scores };
  for (const e of list) for (const [a, v] of Object.entries(e.setScores ?? {})) out[a] = Math.max(out[a] ?? 10, v);
  for (const e of list) for (const [a, r] of Object.entries(e.raiseScores ?? {})) out[a] = Math.min((out[a] ?? 10) + r.by, Math.max(out[a] ?? 10, r.max));
  for (const a of falls) if (a in out) out[a] = Math.max(1, out[a] - 1);
  return out;
}

// A short line saying what an item's effects are
export function describeEffects(e: ItemEffects): string {
  const parts: string[] = [];
  if (e.attack || e.damage) parts.push(`+${e.attack ?? 0}/+${e.damage ?? 0} attack/damage${e.unarmed ? " (unarmed)" : ""}`);
  if (e.ac) parts.push(`+${e.ac} AC`);
  if (e.acBase) parts.push(`AC ${e.acBase.base} + ${e.acBase.ability.slice(0, 3)} unarmored`);
  for (const [a, v] of Object.entries(e.setScores ?? {})) parts.push(`${a.slice(0, 3)} ${v}`);
  for (const [a, r] of Object.entries(e.raiseScores ?? {})) parts.push(`${a.slice(0, 3)} +${r.by} (max ${r.max})`);
  if (e.speed) parts.push(`+${e.speed} ft. speed`);
  if (e.tempHp) parts.push(`${e.tempHp} temporary hit points`);
  if (e.falls) parts.push("side effect: another score -1");
  return parts.join(", ");
}

// ---- Cybernetic augmentation
// The check's DC by rarity (Installation/Removal DC by Rarity)
export const INSTALL_DC: Record<string, number> = { standard: 10, premium: 14, prototype: 18, advanced: 22, legendary: 26, artifact: 30 };
export const SIZE_TIME: Record<string, number> = { tiny: 0.25, small: 0.5, medium: 1, large: 2, huge: 5, gargantuan: 10 };
export const AUGMENT_HOURS = 8;
export const SURGEON_RATE = 100; // credits per hour with an NPC

// How many augmentations a creature supports (the proficiency bonus; prostheses do not count
// against it but do count towards the side effects)
export const augmentationLimit = attunementLimit;

export function augmentPlan(rarity: string, size = "medium", removing = false) {
  const hours = AUGMENT_HOURS * (SIZE_TIME[size.toLowerCase()] ?? 1) * (removing ? 0.5 : 1);
  return { hours, cost: hours * SURGEON_RATE, dc: INSTALL_DC[rarity.toLowerCase()] ?? 10 };
}

// The body's side effects by how many augmentations (prostheses too) it carries
export const AUGMENT_SIDE_EFFECTS: [number, string][] = [
  [2, "disadvantage on saving throws against effects that deal ion damage"],
  [4, "vulnerability to ion damage"],
  [6, "counts as a droid for powers that affect only droids or constructs"],
];
export const sideEffectsOf = (count: number) => AUGMENT_SIDE_EFFECTS.filter(([n]) => count >= n).map(([, text]) => text);

// Whether the parts an augmentation takes are free, given the parts taken already
export function partsFree(taken: string[], wants: string[]): boolean {
  const used: Record<string, number> = {};
  for (const p of taken) used[p] = (used[p] ?? 0) + 1;
  const need: Record<string, number> = {};
  for (const p of wants) need[p] = (need[p] ?? 0) + 1;
  return Object.entries(need).every(([p, n]) => (used[p] ?? 0) + n <= (BODY_PARTS[p] ?? 1));
}

// ---------------------------------------------------------------------------------------------
// Traffic, lifts and incidents (house rules; the books give none of this).
//  - The people who spend a day in another settlement (`Routine.outing`) go by a vehicle: a
//    speeder, an airspeeder, a mount, or a hauler for a merchant with goods. More of them go, and
//    merchants go every few days. The map shows them on their way (`Mover.vehicle`).
//  - A party that wants to go where someone is going can ask for a lift (`liftsBetween`): they
//    leave when the person does, and the fare is a few credits.
//  - Now and then one of the settlement's people does something against the law: steals, starts
//    a brawl, or takes a parked speeder (`rollIncident`). They hide somewhere in the settlement (a
//    carjacker takes the speeder to another one), and the constables search for them as they
//    would for the party: squads walk the rooms, question whoever is in them, and now and then get
//    a tip that sends them straight to the hiding place (`advanceIncidents`). The party can find
//    the culprit first and turn them in for a reward (`closeIncident`).
// ---------------------------------------------------------------------------------------------

// Gives the day trips of a settlement's people a vehicle, and sends more of them out (life 10)
function addTraffic(world: World, settlement: Area, r: Random) {
  const elsewhere = childrenOf(world, settlement.parentId ?? "").filter((s) => s.kind === "settlement" && s.id !== settlement.id && ["city", "town", "outpost", "village", "station"].includes(s.type));
  for (const b of childrenOf(world, settlement.id).filter((x) => x.kind === "building")) {
    for (const room of childrenOf(world, b.id).filter((x) => x.kind === "room")) {
      for (const o of room.occupants) {
        const routine = o.routine;
        if (!routine) continue;
        if (!o.statBlock && !o.loadout.some((n) => /^commlink/i.test(n)) && r.chance(0.4)) o.loadout.push("Commlink");
        if (routine.outing) {
          routine.outing.by ??= outingVehicle(world, settlement, o.role, routine.outing.trip, r);
          continue;
        }
        if (!elsewhere.length || NIGHT_OWLS.includes(o.role) || o.disposition === "hostile" || !r.chance(o.role === "merchant" ? 0.4 : 0.15)) continue;
        const there = r.pick(elsewhere);
        const trip = routeMinutes(world, settlement.id, there.id) / 60;
        if (trip > 0 && trip <= 6) routine.outing = { at: there.id, every: o.role === "merchant" ? r.int(2, 4) : r.int(4, 7), phase: r.int(0, 6), trip: Math.max(0.5, Math.round(trip * 4) / 4), by: outingVehicle(world, settlement, o.role, Math.max(0.5, trip), r) };
      }
    }
  }
}

export function outingVehicle(world: World, settlement: Area, role: string, tripHours: number, r: Random): string {
  if (role === "merchant") return tripHours > 3 || r.chance(0.5) ? "hauler" : "speeder";
  const biome = ancestor(world, settlement.id, "planet")?.type ?? "";
  if (/desert|ice|forest|jungle|swamp|temperate/i.test(biome) && tripHours <= 3 && r.chance(0.35)) return "mount";
  return tripHours > 3 && r.chance(0.7) ? "airspeeder" : "speeder";
}

export interface Lift {
  id: string;
  who: string;
  whoId: string;
  vehicle: string;
  departs: number; // the minute they set out
  minutes: number; // from now to arriving: the wait and the journey
  fare: number;
}

// Lifts the people of the settlements offer between two of them, leaving within ten hours
export function liftsBetween(world: World, from: string, to: string, now: number): Lift[] {
  const out: Lift[] = [];
  for (const { o } of presenceIndex(world).people) {
    const trip = o.routine?.outing;
    if (!trip || !o.routine) continue;
    const home = settlementOf(world, o.routine.home);
    const going = home === from && trip.at === to;
    const coming = trip.at === from && home === to;
    if (!going && !coming) continue;
    const day = Math.floor(now / DAY);
    for (let d = day; d <= day + trip.every; d++) {
      if ((d + trip.phase) % trip.every !== 0) continue;
      const departs = d * DAY + (going ? 7 : 21 - trip.trip) * 60;
      if (departs < now) continue;
      if (departs - now <= 600) out.push({ id: `lift-${o.id}`, who: o.name, whoId: o.id, vehicle: trip.by ?? "speeder", departs, minutes: departs - now + Math.round(trip.trip * 60), fare: Math.max(2, Math.round(trip.trip * 6)) });
      break;
    }
  }
  return out.sort((a, b) => a.departs - b.departs).slice(0, 3);
}

export type IncidentKind = "theft" | "brawl" | "carjacking";
export const INCIDENT_WORDS: Record<IncidentKind, { crime: Crime; what: string }> = {
  theft: { crime: "theft", what: "a theft" },
  brawl: { crime: "brawl", what: "a brawl" },
  carjacking: { crime: "theft", what: "the theft of a speeder" },
};
export const INCIDENT_COOLDOWN = 45; // minutes the constables search for a culprit from the time they arrive, in strict law (more where it is lax)

export interface Incident {
  id: string;
  kind: IncidentKind;
  settlement: string;
  scene: string; // the room it was done in
  culprit: string; // Occupant.id
  name: string;
  hideAt: string; // the room the culprit is lying low in (or the settlement they fled to)
  was?: Routine; // what they were doing before, restored when it is over
  vehicle?: Vehicle & { from: string }; // a speeder taken, and the building it was taken from
  loot: number; // credits taken (a theft)
  startedAt: number;
  arrivesAt: number;
  searchUntil: number;
  squads: Squad[];
  tipped?: boolean; // the constables know where the culprit is
  status: "open" | "caught" | "fled" | "cold" | "turned in";
  note: string;
}

const hourOfClock = (minutes: number) => Math.floor(minutes / 60);

// Where an occupant is stored (the room whose list holds them)
function homeOf(world: World, occupantId: string): Area | undefined {
  return Object.values(world.areas).find((a) => a.occupants.some((o) => o.id === occupantId));
}

// The rooms of the settlement's friendly buildings
function townRooms(world: World, settlementId: string): Area[] {
  return childrenOf(world, settlementId)
    .filter((b) => b.kind === "building" && b.type !== "starship" && !BUILDINGS[b.type]?.hostile)
    .flatMap((b) => childrenOf(world, b.id).filter((a) => a.kind === "room" && !formOf(a) && (a.layout?.level ?? 0) >= 0));
}

// Rolls the hour for a crime in a settlement. Rare (about one a day in a policed town), and not
// while another is open there. Returns the world with the culprit in hiding, or the same world.
export function rollIncident(world: World, settlementId: string, hour: number, now: number): World {
  const settlement = world.areas[settlementId];
  if (!settlement || settlement.kind !== "settlement") return world;
  if ((world.incidents ?? []).some((i) => i.settlement === settlementId && i.status === "open")) return world;
  const law = lawAt(world, settlementId);
  const key = `${settlementId}|incident|${hour}`;
  const chance = law === 0 ? 0.006 : 0.01 + 0.003 * Math.min(3, law);
  if (unitOf(`${key}|roll`) >= chance) return world;
  // Who: a civilian of the settlement who is somewhere just now, with a life to leave
  const present = withPresence(world, now);
  const rooms = townRooms(present, settlementId);
  const people = rooms.flatMap((room) => room.occupants.filter((o) => isCivilian(o) && o.disposition === "neutral" && o.count === 1 && !!o.routine && !o.wanted && !["service droid", "musician", "patient"].includes(o.role)).map((o) => ({ o, room })));
  if (!people.length) return world;
  const { o: culprit, room: scene } = people[Math.floor(unitOf(`${key}|who`) * people.length)];
  const pick = unitOf(`${key}|kind`);
  const parked = childrenOf(world, settlementId).filter((b) => b.kind === "building" && (b.vehicles ?? []).some((v) => v.status === "parked"));
  const kind: IncidentKind = pick < 0.45 ? "theft" : pick < 0.8 || !parked.length ? "brawl" : "carjacking";
  // Where: a room to lie low in, or for a carjacker another settlement of the planet
  const hides = rooms.filter((r) => r.id !== scene.id);
  const others = childrenOf(world, settlement.parentId ?? "").filter((s) => s.kind === "settlement" && s.id !== settlementId);
  let hideAt = hides.length ? hides[Math.floor(unitOf(`${key}|hide`) * hides.length)].id : scene.id;
  let vehicle: Incident["vehicle"];
  const areas = { ...world.areas };
  if (kind === "carjacking") {
    const building = parked[Math.floor(unitOf(`${key}|building`) * parked.length)];
    const taken = building.vehicles!.find((v) => v.status === "parked")!;
    vehicle = { ...taken, from: building.id };
    areas[building.id] = { ...building, vehicles: building.vehicles!.filter((v) => v !== taken) };
    if (others.length) hideAt = others[Math.floor(unitOf(`${key}|far`) * others.length)].id;
  }
  const home = homeOf(world, culprit.id)!;
  const was = culprit.routine;
  areas[home.id] = { ...areas[home.id] ?? home, occupants: (areas[home.id] ?? home).occupants.map((o) => (o.id === culprit.id ? { ...o, wanted: key, routine: { home: hideAt, stops: [] } } : o)) };
  const resp = responseFor(law, INCIDENT_WORDS[kind].crime, false);
  const arrivesAt = now + (resp?.delay ?? 0);
  const squadCount = !resp ? 0 : law >= 3 ? 2 : 1;
  const incident: Incident = {
    id: key,
    kind,
    settlement: settlementId,
    scene: scene.id,
    culprit: culprit.id,
    name: culprit.name,
    hideAt,
    was,
    vehicle,
    loot: kind === "theft" ? 20 * (1 + Math.floor(unitOf(`${key}|loot`) * 10)) : 0,
    startedAt: now,
    arrivesAt,
    searchUntil: arrivesAt + (resp ? Math.round(INCIDENT_COOLDOWN * [1, 2, 1.5, 1][Math.min(3, law)] * (kind === "brawl" ? 1 : 1.5)) : 60),
    squads: Array.from({ length: squadCount }, (_, i) => ({ id: `sq-${key}-${i}`, at: scene.id, count: law >= 3 ? 4 : 2, heavy: law >= 3, next: arrivesAt, step: 0 })),
    status: kind === "carjacking" && others.length ? "fled" : "open",
    note: `${culprit.name} is wanted for ${INCIDENT_WORDS[kind].what} at ${scene.name}.`,
  };
  return { ...world, areas, incidents: [incident, ...(world.incidents ?? [])].slice(0, 10) };
}

// Ends an incident: the culprit goes back to what they were doing, and the speeder to its building
export function closeIncident(world: World, id: string, status: Incident["status"], note: string): World {
  const incident = (world.incidents ?? []).find((i) => i.id === id);
  if (!incident) return world;
  const areas = { ...world.areas };
  const home = homeOf(world, incident.culprit);
  if (home) areas[home.id] = { ...areas[home.id], occupants: areas[home.id].occupants.map((o) => (o.id === incident.culprit ? { ...o, wanted: undefined, routine: incident.was } : o)) };
  if (incident.vehicle) {
    const building = areas[incident.vehicle.from];
    const { from: _from, ...back } = incident.vehicle;
    if (building && status !== "cold") areas[building.id] = { ...building, vehicles: [...(building.vehicles ?? []), back] };
  }
  return { ...world, areas, incidents: (world.incidents ?? []).map((i) => (i.id === id ? { ...i, status, note, squads: [] } : i)) };
}

// Moves the constables of every open incident on to `now`. A squad walks the settlement, questions
// the people of each room it comes to (a quarter of the time somebody tells it where the culprit
// went), and once it has the tip goes there. Finding the culprit ends it. Past its time the search
// is called off. Returns the world and what the constables did.
export function advanceIncidents(world: World, now: number): { world: World; notes: string[] } {
  const notes: string[] = [];
  let next = world;
  for (const incident of world.incidents ?? []) {
    if (incident.status !== "open" && incident.status !== "fled") continue;
    if (now >= incident.searchUntil) {
      next = closeIncident(next, incident.id, "cold", `The search for ${incident.name} was called off.`);
      notes.push(`The constables give up the search for ${incident.name}.`);
      continue;
    }
    if (!incident.squads.length || now < incident.arrivesAt || !incident.squads.some((s) => s.next <= now)) continue;
    const squads = incident.squads.map((s) => ({ ...s }));
    let tipped = !!incident.tipped;
    let caught = false;
    for (const squad of squads) {
      while (!caught && squad.next <= now && squad.next < incident.searchUntil) {
        if (squad.step > 0) {
          const path = tipped && incident.status === "open" ? findPath(next, squad.at, incident.hideAt) : null;
          if (path && path.length > 1) squad.at = path[1];
          else {
            const options = searchNeighbours(next, incident.settlement, squad.at);
            if (options.length) squad.at = createRandom(Math.imul(incident.startedAt, 1009) + Math.imul(squad.step, 7919) + [...squad.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)).pick(options);
          }
        }
        squad.step += 1;
        squad.next += SEARCH_STEP;
        const area = next.areas[squad.at];
        if (!area) continue;
        if (area.occupants.some(isCivilian) && !tipped && unitOf(`${incident.id}|tip|${squad.id}|${squad.step}`) < 0.25) {
          tipped = true;
          notes.push(`A witness in ${area.name} tells the constables where ${incident.name} went.`);
        }
        if (squad.at === incident.hideAt && incident.status === "open") caught = true;
      }
      if (caught) break;
    }
    if (caught) {
      next = closeIncident(next, incident.id, "caught", `${incident.name} was caught in ${next.areas[incident.hideAt]?.name}.`);
      notes.push(`The constables catch ${incident.name} in ${next.areas[incident.hideAt]?.name}.`);
    } else {
      next = { ...next, incidents: (next.incidents ?? []).map((i) => (i.id === incident.id ? { ...i, squads, tipped } : i)) };
    }
  }
  return { world: next, notes };
}

// The credits for turning a culprit in: the stolen sum, and a reward by the law
export const incidentReward = (world: World, incident: Incident) => incident.loot + 25 * Math.max(1, lawAt(world, incident.settlement)) * (incident.kind === "carjacking" ? 3 : 1);


// ---------------------------------------------------------------------------------------------
// Droid dealers (house rules; the books give no droid prices). A droid dealer's showroom and repair
// bay sell the droid stat blocks of the rules data (`monsters.json`, type droid) at 6 credits an
// experience point (150 at least): an astromech (CR 1/2) 600, a protocol droid a few hundred, a
// medical unit more. Droids built for war (security, battle, assassin, tactical, probe) are only
// sold where the law allows, or at 1.6 times by the black market, and nothing dearer than the
// settlement can carry is on the floor. The dealer buys the party's droids back at 40% of the
// price, less for the hurt; mends one at a credit rate by its challenge (5 + 5 per CR a hit point);
// and fits the customizations the party carries for the fee of a surgeon (see augmentPlan), with no
// check and no kit. The motor upgrade is the party's own (see DROID_MOTOR_COST).
// ---------------------------------------------------------------------------------------------

export interface DroidStat {
  id: string;
  name: string;
  experiencePoints: number;
  challengeRating?: string | number;
  hitPoints?: number;
  size?: string;
}
export interface DroidLine {
  id: string;
  name: string;
  xp: number;
  cr: string;
  price: number;
  combat: boolean;
  quantity: number;
}
export const COMBAT_DROIDS = /security|battle|destroyer|assassin|enforcer|tactical|probe|tracker|seeker|interrog|sabotage|hailfire|vulture|spider|persuader|bomber|remote|weaponized|blastromech|behemoth|DSD1|^B[12] series|^BX series|^HK|^IG|^IT-O|^T-Series|^Z-58|^KX/i;
export const droidPrice = (xp: number) => Math.max(150, Math.round(xp * 6));
export const crNumber = (cr: string | number | undefined): number => {
  if (typeof cr === "number") return cr;
  if (!cr) return 0;
  if (cr.includes("/")) {
    const [a, b] = cr.split("/").map(Number);
    return b ? a / b : 0;
  }
  return Number(cr) || 0;
};

// What a dealer has on the floor today: a few droids by a seeded draw, none that the law forbids, none dearer than the settlement carries
export function droidStock(world: World, trader: Occupant, placeId: string, day: number, droids: DroidStat[], bought: Record<string, number> = {}): DroidLine[] {
  const market = marketAt(world, placeId);
  const black = !!WARES[trader.trade ?? ""]?.black;
  const r = createRandom(hashOf(trader.id) + day * 104729);
  const legal = (d: DroidStat) => !COMBAT_DROIDS.test(d.name) || market.law <= 1 || black;
  const pool = droids.filter((d) => d.experiencePoints > 0 && legal(d) && droidPrice(d.experiencePoints) <= market.cap);
  const picked = r.shuffle(pool).slice(0, r.int(WARES.droids.lines[0], WARES.droids.lines[1]));
  return picked
    .filter((d) => !(bought[`droid:${d.id}`] > 0))
    .map((d) => ({ id: d.id, name: d.name, xp: d.experiencePoints, cr: String(d.challengeRating ?? "0"), price: Math.round(droidPrice(d.experiencePoints) * (black ? 1.6 : 1) * (0.92 + (hashOf(`${d.id}:${day}`) % 17) / 100)), combat: COMBAT_DROIDS.test(d.name), quantity: 1 }))
    .sort((a, b) => a.price - b.price);
}

// What the dealer pays for one of the party's droids, by what it would sell for and how hurt it is
export const droidOffer = (xp: number, hp: number, maxHp: number) => Math.round(droidPrice(xp) * 0.4 * Math.max(0.25, hp / Math.max(1, maxHp)));
// The cost of mending a droid to full: a hit point is 5 credits and 5 for each point of challenge
export const droidRepairPrice = (cr: string | number | undefined, missing: number) => Math.max(0, Math.ceil(missing * (5 + 5 * crNumber(cr))));

// ---------------------------------------------------------------------------------------------
// Gathering and materials (HOUSE RULES). Star Wars 5e has no rules for harvesting or mining: it has
// the Scavenging kit ("harvest and scavenge ores and metals"), the Bioanalysis kit ("harvest and
// store plants"), the Archaeologist kit ("collect crystals, gems, relics"), Jeweler's implements
// (refine gems) and Tinker's implements (improvise an item from scraps), and the Crafting downtime
// activity, which spends raw materials worth half an item's value. So here:
//  - Caves, ruins and wrecks hold resource nodes (a vein, a patch, a hulk's guts) of four families;
//    a node has a tier that matches the book's rarities (standard, premium, prototype, advanced) and
//    its check DC is the book's blueprint DC for that rarity (10, 14, 18, 22).
//  - A harvest is a check with the family's kit (10 minutes). Without a kit only the lowest tier can
//    be worked, at +5 to the DC. A tool the character is trained with adds the proficiency bonus (in
//    GameBoard) and one more unit. Every 5 over the DC is one more unit.
//  - A node gives a few harvests and then runs dry; it recovers three days after it was emptied.
//  - Materials are kept in stacks (`playState.materials`). In the Crafting downtime activity the
//    raw materials (half the item's value) can be paid with them at their value, a shortfall is paid
//    in credits. Refining 4 units of a material makes one of the refined kind, worth half as much
//    again as the four were (a kit of the family and a check at the tier's DC).
// ---------------------------------------------------------------------------------------------

export type MaterialFamily = "ore" | "plant" | "crystal" | "salvage";
export interface ResourceNode {
  family: MaterialFamily;
  tier: number;
  material: string;
  charges: number;
  max: number;
  // The minute on the clock when it ran dry
  emptiedAt?: number;
}
export const RARITY_TIERS = ["Standard", "Premium", "Prototype", "Advanced"];
export const NODE_RESPAWN = 3 * 24 * 60;
export const HARVEST_MINUTES = 10;

export const FAMILIES: Record<MaterialFamily, { label: string; verb: string; kits: RegExp; kitNames: string; ability: string; skill: string; refiners: RegExp }> = {
  ore: { kitNames: "a scavenging kit", label: "Ore and metal", verb: "mine", kits: /scavenging kit/i, ability: "intelligence", skill: "Investigation", refiners: /armormech|armstech|scavenging kit/i },
  plant: { kitNames: "a bioanalysis kit or biochemist's kit", label: "Plants and herbs", verb: "gather", kits: /bioanalysis kit|biochemist's kit/i, ability: "wisdom", skill: "Nature", refiners: /biochemist|bioanalysis|chef/i },
  crystal: { kitNames: "an archaeologist kit or jeweler's implements", label: "Crystals and gems", verb: "cut free", kits: /archaeologist kit|jeweler's implements/i, ability: "intelligence", skill: "Investigation", refiners: /jeweler|artificer|archaeologist/i },
  salvage: { kitNames: "a scavenging kit, tinker's or astrotech's implements or a mechanic's kit", label: "Salvage and parts", verb: "strip", kits: /scavenging kit|tinker's implements|mechanic's kit|astrotech's implements/i, ability: "intelligence", skill: "Technology", refiners: /tinker|mechanic|astrotech|cybertech/i },
};

// Raw materials by family and tier, each with a value in credits per unit
export const MATERIALS: Record<string, { name: string; family: MaterialFamily; tier: number; value: number; refined?: boolean }> = {};
const RAW: Record<MaterialFamily, [string, number][]> = {
  ore: [["Scrap metal", 5], ["Durasteel ore", 40], ["Phrik ore", 300], ["Cortosis ore", 2000]],
  plant: [["Medicinal herbs", 5], ["Bacta moss", 40], ["Kolto bloom", 300], ["Ancient sap", 2000]],
  crystal: [["Rough crystal", 10], ["Raw gemstone", 50], ["Kyber shard", 400], ["Pure kyber", 2500]],
  salvage: [["Scrap electronics", 8], ["Power cell", 45], ["Droid brain core", 350], ["Intact hypermatter cell", 2200]],
};
for (const family of Object.keys(RAW) as MaterialFamily[]) {
  RAW[family].forEach(([name, value], tier) => {
    MATERIALS[`${family}-${tier}`] = { name, family, tier, value };
    MATERIALS[`${family}-${tier}-r`] = { name: `Refined ${name.toLowerCase()}`, family, tier, value: Math.round(value * 6), refined: true };
  });
}
export const REFINE_UNITS = 4;

export type Materials = Record<string, number>;
export const materialsOf = (character: { playState?: any } | null | undefined): Materials => ({ ...((character?.playState as any)?.materials ?? {}) });
export const materialsWorth = (stock: Materials) => Object.entries(stock).reduce((sum, [id, n]) => sum + (MATERIALS[id]?.value ?? 0) * n, 0);

export const harvestDc = (tier: number) => [10, 14, 18, 22][Math.min(3, Math.max(0, tier))];

export function makeNode(r: Random, id: string, family: MaterialFamily, danger: number): LootCache {
  const tier = Math.min(3, Math.floor(danger / 2) + (danger > 0 && r.chance(0.25) ? 1 : 0));
  const max = r.int(2, 4);
  const material = `${family}-${tier}`;
  const names: Record<MaterialFamily, string[]> = {
    ore: ["Mineral vein", "Exposed seam", "Ore outcrop"],
    plant: ["Patch of growth", "Hardy undergrowth", "Cluster of blooms"],
    crystal: ["Crystal cluster", "Gem-bearing rock", "Glittering geode"],
    salvage: ["Stripped wreckage", "Salvageable machinery", "Heap of parts"],
  };
  return { id, name: r.pick(names[family]), kind: "node", credits: 0, items: [], node: { family, tier, material, charges: max, max } };
}

// A node as it stands at a time on the clock: one that ran dry has come back after its respawn
export function nodeAt(node: ResourceNode, now: number): ResourceNode {
  if (node.charges > 0 || node.emptiedAt === undefined || now - node.emptiedAt < NODE_RESPAWN) return node;
  return { ...node, charges: node.max, emptiedAt: undefined };
}

// Gives the caves, ruins and wrecks of an older world their nodes, in a room of the kind the plan names
function addNodes(world: World, r: Random) {
  for (const building of Object.values(world.areas).filter((a) => a.kind === "building")) {
    const template = BUILDINGS[building.type];
    if (!template || !["cave", "ruin", "wreck"].includes(building.type)) continue;
    for (const room of Object.values(world.areas).filter((a) => a.kind === "room" && a.parentId === building.id)) {
      if (room.loot.some((c) => c.node)) continue;
      const entry = template.rooms.map((line) => line.split("|")).find(([name]) => name === room.name);
      const family = entry?.[1]?.split(" ").find((c) => c.startsWith("N:"))?.slice(2) as MaterialFamily | undefined;
      if (!family) continue;
      const cache = makeNode(r, `n${++world.counter}`, family, room.danger);
      room.loot.push(cache);
      if (room.layout) {
        const spot = findSpot(room.layout, r, "wall", 1, 1);
        if (spot) room.layout.assets.push({ id: `${room.id}-n${room.layout.assets.length + 1}`, kind: "loot", name: cache.name, ...spot, blocks: true, cover: true, ref: cache.id });
      }
    }
  }
}

// What a harvest gives: a unit, one more for every 5 over the DC, and one more with a trained tool
export const harvestYield = (total: number, dc: number, trained: boolean) => Math.min(6, Math.max(1, 1 + Math.floor((total - dc) / 5) + (trained ? 1 : 0)));

// Pays a cost in credits with materials first: the dearest unit that still fits in what is left is
// taken, down to the cheapest; what no unit fits is left to credits
export function spendMaterials(stock: Materials, cost: number): { stock: Materials; paid: number; spent: [string, number][]; shortfall: number } {
  const left = { ...stock };
  const spent: Record<string, number> = {};
  let owed = cost;
  const ids = Object.keys(left).filter((id) => MATERIALS[id] && left[id] > 0).sort((a, b) => MATERIALS[b].value - MATERIALS[a].value);
  for (const id of ids) {
    const unit = MATERIALS[id].value;
    const n = Math.min(left[id], Math.floor(owed / unit));
    if (n > 0) { left[id] -= n; spent[id] = n; owed -= n * unit; }
  }
  // The last of it may be covered by one more unit than is owed, if that is better than paying in credits
  if (owed > 0) {
    const covering = ids.filter((id) => left[id] > 0).sort((a, b) => MATERIALS[a].value - MATERIALS[b].value).find((id) => MATERIALS[id].value >= owed && MATERIALS[id].value <= owed * 1.5);
    if (covering) { left[covering]--; spent[covering] = (spent[covering] ?? 0) + 1; owed = 0; }
  }
  for (const id of Object.keys(left)) if (left[id] <= 0) delete left[id];
  return { stock: left, paid: cost - owed, spent: Object.entries(spent), shortfall: owed };
}
