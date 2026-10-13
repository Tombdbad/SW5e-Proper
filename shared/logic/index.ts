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
  attack?: { name: string; bonus: number; damage: string; damageType?: string };
  // Ability modifiers, for saving throws
  saves?: Record<string, number>;
  // Equipment names from the equipment data
  loadout: string[];
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
//   @n the room this one opens off (its index in the list); without it, the room before
const BUILDINGS: Record<string, { hostile?: "faction" | "criminal" | "wild" | "horror"; rooms: string[] }> = {
  spaceport: { rooms: ["Arrivals concourse|s p", "Customs office|s g", "Docking bay|S s d", "Maintenance hangar|S d L:workshop", "Control tower|s K @0", "Bonded warehouse|L:cargo K g @1"] },
  "landing field": { rooms: ["Landing field|S s", "Fuel depot|d L:workshop", "Port office|s L:coin K @0"] },
  "landing pad": { rooms: ["Landing pad|S s", "Fuel depot|d L:workshop"] },
  "docking ring": { rooms: ["Airlock|s", "Docking arm|S d", "Customs lock|s g @0", "Freight lift|L:cargo @2"] },
  "city gate": { rooms: ["Gate|g", "Guard room|g L:armory K"] },
  "town gate": { rooms: ["Gate|g", "Watch post|L:armory K"] },
  trailhead: { rooms: ["Trailhead|", "Old shelter|L:remains"] },
  cantina: { rooms: ["Entrance|", "Main bar|s p p", "Private booth|p", "Back room|p g K @1", "Cellar|L:stash H"] },
  promenade: { rooms: ["Promenade|p p", "Cantina|s p", "Trade stalls|s s L:coin @0", "Storeroom|L:cargo K"] },
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

const FACTIONS = ["Galactic Empire", "Hutt Cartel", "Trade Federation", "Black Sun", "Sith Empire", "Rebel Alliance", "Local militia", "Czerka Corporation", "Tusken tribes"];

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
    attack: best ? { name: best.name, bonus: best.attackBonus ?? 0, damage: best.damageRoll!, damageType: best.damageType?.toLowerCase() } : undefined,
    saves: Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((a) => [a, Number(monster[`${a}Modifier`]) || 0])),
    loadout: statBlockLoadout(monster, equipment),
  };
}

const fromStatBlock = (ctx: Context, monster: Sw5eMonster, count: number, role: string, disposition: Occupant["disposition"]) =>
  statBlockOccupant(monster, ctx.catalog.equipment, nextId(ctx.world, "o"), count, role, disposition);

// As many of one kind of creature as the budget allows (never more than six)
function encounter(ctx: Context, pool: Sw5eMonster[], budget: number, role: string): Occupant[] {
  const affordable = pool.filter((m) => m.experiencePoints > 0 && m.experiencePoints <= budget);
  if (!affordable.length) return [];
  // Prefer creatures worth a real share of the budget over a crowd of trivial ones
  const worthwhile = affordable.filter((m) => m.experiencePoints >= budget / 8);
  const monster = ctx.random.pick(worthwhile.length ? worthwhile : affordable);
  let count = 1;
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

function person(ctx: Context, role: string, disposition: Occupant["disposition"], speciesNames: string[]): Occupant {
  const core = ctx.catalog.species.filter((s) => s.contentSource === "PHB" && !/droid/i.test(s.name));
  const species = speciesNames.length && ctx.random.chance(0.6) ? ctx.random.pick(speciesNames) : ctx.random.pick(core.length ? core : ctx.catalog.species).name;
  const gear = (ROLE_GEAR[role] ?? []).map((pattern) => pickGear(ctx, pattern)).filter((g): g is string => !!g);
  return { id: nextId(ctx.world, "o"), name: personName(ctx.random), role, disposition, count: 1, species, loadout: gear };
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
      room.occupants.push(person(ctx, staff, r.chance(0.5) ? "friendly" : "neutral", speciesNames));
    } else if (code === "p") {
      if (r.chance(0.35)) room.occupants.push(person(ctx, r.pick(["smuggler", "bounty hunter", "informant", "gambler", "pilot for hire"]), "neutral", speciesNames));
      else room.occupants.push({ id: nextId(world, "o"), name: r.pick(["Locals", "Travelers", "Off-duty workers", "Spacers"]), role: "civilians", disposition: "neutral", count: r.int(2, 6), loadout: [] });
    } else if (code === "g" || code === "b") {
      const forces = forcesOf(ctx, template?.hostile === "criminal" ? "pirate syndicate" : faction);
      if (hostileFaction && budget > 0) {
        const pool = code === "b" && forces.leaders.length ? forces.leaders : forces.troops;
        const found = encounter(ctx, pool, code === "b" ? budget * 1.5 : budget, code === "b" ? "leader" : "guard");
        room.occupants.push(...(found.length ? found : encounter(ctx, forces.troops, budget, "guard")));
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
  const world: World = {
    version: 1,
    seed,
    name: options.name ?? "The Galaxy",
    partyLevel: Math.min(20, Math.max(1, Math.round(options.partyLevel ?? 1))),
    partySize: Math.max(1, Math.round(options.partySize ?? 1)),
    antagonist: options.antagonist ?? r.pick(FACTIONS.slice(0, 5)),
    rootId: "",
    startId: "",
    areas: {},
    paths: [],
    counter: 0,
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
      faction: seedSystem.factions?.[0]?.replace(/\s*\(.*\)$/, "") ?? r.pick(FACTIONS),
    });
    planetNames.set(system.id, seedSystem.planets ?? []);
  }
  const perRegion = Math.min(3, Math.max(1, options.systemsPerRegion ?? 1));
  for (const region of regions) {
    while (childrenOf(world, region.id).length < perRegion) {
      placeSystem(region, uniqueName(ctx, () => `${placeName(r)} System`), { faction: r.pick(FACTIONS) });
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
    if (area.kind === "room") populateRoom(ctx, area);
    else childrenOf(next, id).forEach((c) => visit(c.id));
  };
  visit(areaId);
  return next;
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
  const parent = area.parentId ? world.areas[area.parentId] : undefined;
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
