// The inside of a starship (2026-11-09; the user: "build modular asset packs (pertinent to faction) for ship interiors, and logic to generate full interior ship maps ...
// these interiors must be walkable, in-game maps for players to explore with all the relevant areas for the wide variety of ships from small/medium (omit any tiny and
// small ships whose size limits its interior to consist of only a cockpit) to gargantuan"). HOUSE RULES: the books give ships a size and a role and no deck plans.
//
// A ship's size sets how many decks it has and how big each is (FRAMES, in squares of 5 ft.; a square is 1.4 m on the map); its role and its maker set what is aboard
// (the programs below). A deck is laid out the way a ship's is built, with a few long passages (spines) down its length and the compartments packed along them:
//
//    stern zone | strip | strip | strip ... | bow zone         the strips run the ship's length, a spine between each two; a stair column
//    (engines)  | spine ------ spine ------ |  (the bridge)     breaks a strip where a stairwell climbs from one spine through every deck
//
// The decks are one on another, the same frame each, so a stairwell is a column the plan keeps free on every deck. The stairwells are the settlements' (stairBlock: a
// landing on every deck with a doorway to the passage there, a switchback flight between each two, no door on the way up), the compartments are rooms of a building of type
// "starship" with their doors, windows and furniture, and the ship's stations (the pilot's seat, the co-pilot's, navigation, engineering, the gunnery seats and the boarding
// ramp) are pieces of furniture in them. A ship of a size that cannot hold more than a cockpit (Tiny, and a Small fighter, bomber, scout or scrambler) keeps its one-deck
// plan (shipDeck); a Small shuttle has a cabin and an engine bay as well; Medium and up have the plans below. Huge and Gargantuan ships are a kilometre long and more, far
// beyond a map at the people's scale: the map shows the sections the crew works in, their passages folded (house rule, shown at the helm).
//
// Since 2026-11-15 the inside follows the outside: where the kit measured the outline of the ship's hull (shared/art/shipHulls.json), the decks are the hull's and
// the plan is laid out in its outline, the helm at its cockpit, the ramp at its ramp, the engine room at its engines, the glass where the hull has glass (see
// "The plan that follows the hull" below, planFromHull). The frames above are kept for a hull with no outline, or one too small to hold the plan.
//
// Pure: the same ship and seed give the same ship. tests/ships/interior.test.ts walks every size, role and faction, and every hull's outline.
import {
  createRandom, floorFaults, floorsOf, furnishRoom, stairBlock, standsAt, wallSquare,
  type Area, type Form, type Path, type RoomAsset, type RoomLayout, type Side,
} from "./index";
import hullFile from "../art/shipHulls.json";
import shipKit from "../art/shipKit.json";

type Rng = ReturnType<typeof createRandom>;

export interface ShipSpec { id: string; name: string; size: string; role: string; owner?: string }

// ---- Whose make a ship is --------------------------------------------------------------------------------------------------------------------
// (the client's models.tsx draws the same kits: the owner names the faction)
export type ShipFaction = "imperial" | "rebel" | "republic" | "separatist" | "mandalorian" | "criminal" | "civilian";
export const FACTIONS: ShipFaction[] = ["imperial", "rebel", "republic", "separatist", "mandalorian", "criminal", "civilian"];
const FACTION_OF: [RegExp, ShipFaction][] = [
  [/separatist|trade federation|techno union|banking clan|confedera|droid army/i, "separatist"],
  [/mandalor|death watch/i, "mandalorian"],
  [/empire|imperial|first order|sith/i, "imperial"],
  [/rebel|resistance|new republic/i, "rebel"],
  [/republic|jedi/i, "republic"],
  [/hutt|black sun|pirate|crimson dawn|pyke|cartel|syndicate|smuggl|crime|zann/i, "criminal"],
];
export const shipFactionOf = (owner = ""): ShipFaction => FACTION_OF.find(([re]) => re.test(owner))?.[1] ?? "civilian";

// ---- The hull a ship is drawn with, and the outline of its inside (the contract between the kit and the planner, 2026-11-15) -----------------------
// The starship kit (tools/blender/build-ships.py) builds one hull per faction and size (and a shuttle for some) into client/public/figures/ships.glb,
// shared/art/shipKit.json (each hull's box in metres) and shared/art/shipHulls.json: for every hull, the inside it has room for, measured from the
// mesh itself, as squares of the map. How it is measured and regenerated: tools/refs/ships.md, "The inside's outline". The planner below reads it
// and nothing else of the model, so the inside follows the outside; it stays pure (the file is data, the same for every world).
const KIT_SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const KIT_CLASS_SIZE: Record<string, string> = { fighter: "small", shuttle: "small", freighter: "medium", capital: "large" };
const classOfShip = (ship: Pick<ShipSpec, "size" | "role">): string => {
  const role = `${ship.role} ${ship.size}`.toLowerCase();
  return /fighter|interceptor|skiff|tiny|bomber/.test(role) ? "fighter" : /shuttle|transport|courier|small/.test(role) ? "shuttle" : /freighter|hauler|smuggl|medium/.test(role) ? "freighter" : "capital";
};
// The kit hull of a ship: its faction's of its size (a shuttle's own where the faction has one), else the freighter yards'. `has` says which hulls
// the kit holds (the client passes its loaded kit; the planner the outlines file). models.tsx draws the same name.
export function shipKitName(ship: Pick<ShipSpec, "size" | "role" | "owner">, has: (name: string) => boolean): string {
  const size = KIT_SIZES.find((s) => s === ship.size.toLowerCase()) ?? KIT_CLASS_SIZE[classOfShip(ship)];
  const own = `ship_${shipFactionOf(ship.owner)}_${size}`;
  const shuttle = /shuttle|transport/i.test(ship.role) ? `${own}_shuttle` : "";
  return shuttle && has(shuttle) ? shuttle : has(own) ? own : `ship_civilian_${size}`;
}

// A place on the outline: a square of a deck, and (for a ramp, a window or an engine) the side of it the hull's wall is on, "down" for a belly ramp
export interface HullMark { deck: number; x: number; y: number; side?: Side | "down" }
export interface HullDeck {
  // 0 the bottom deck; the floor's height in metres above the ship's foot (the kit's y) and the clear height over it
  level: number; floor: number; head: number;
  // rows[y] (y squares from the port side, B rows) = flat half-open runs [x0, x1, x0, x1, ...] of the squares inside the hull (x squares from the stern)
  rows: number[][];
}
export interface HullPlan {
  // metres a square (1 / UNITS_PER_M = 1.4066 at real size; a folded hull's are bigger, and differ along (x) and across (z))
  cell: [number, number];
  // the kit's metres (x, z) of square (0, 0)'s outer corner: the stern, the port side
  origin: [number, number];
  // the grid, L squares toward the bow by B across
  L: number; B: number;
  // a Huge or Gargantuan hull, a kilometre long and more: its plan is fitted into the section the map shows (FRAMES), its shape kept, its size not
  folded: boolean;
  decks: HullDeck[];
  // where the helm is (the cockpit or bridge goes there), the boarding ramp or hatch, the engines' exhausts (the stern-most squares inside behind them),
  // the glass at the hull's wall (a square inside, `side` the wall it looks out of; the cockpit's glass among them), other hatches (airlocks, docking)
  cockpit: HullMark; ramp: HullMark; engines: HullMark[]; windows: HullMark[]; hatches: HullMark[];
}
export interface HullFile { units: string; hulls: Record<string, HullPlan> }
// Is the square (x, y) of a deck inside the hull?
export const insideHull = (deck: Pick<HullDeck, "rows">, x: number, y: number): boolean => {
  const runs = deck.rows[y];
  if (!runs) return false;
  for (let i = 0; i + 1 < runs.length; i += 2) if (x >= runs[i] && x < runs[i + 1]) return true;
  return false;
};

// ---- Which ships have an inside -------------------------------------------------------------------------------------------------------------
// A Tiny ship, and a Small one that is a fighter, a bomber, a scout or a scrambler, is a cockpit and nothing more (shipDeck); a Small shuttle has room for a cabin
export const hasInterior = (ship: Pick<ShipSpec, "size" | "role">): boolean =>
  ["Medium", "Large", "Huge", "Gargantuan"].includes(ship.size) || (ship.size === "Small" && /shuttle/i.test(ship.role));

// ---- The frame of each size -----------------------------------------------------------------------------------------------------------------
// L long (x, the bow to +x), B across (y, port to the north), D decks, `n` strips with a spine of width `s` between each two, a stern zone `sw` long and a bow zone `bw`,
// and `blocks` stairwells. A strip is `(B - s (n - 1)) / n` deep: 6 on a Medium ship, 8 on the rest (a stairwell is 6 deep).
export interface Frame { L: number; B: number; D: number; n: number; s: number; sw: number; bw: number; blocks: number }
export const FRAMES: Record<string, Frame> = {
  Medium: { L: 24, B: 14, D: 2, n: 2, s: 2, sw: 5, bw: 6, blocks: 1 },
  Large: { L: 60, B: 19, D: 4, n: 2, s: 3, sw: 10, bw: 10, blocks: 2 },
  Huge: { L: 84, B: 19, D: 5, n: 2, s: 3, sw: 14, bw: 12, blocks: 3 },
  Gargantuan: { L: 120, B: 30, D: 6, n: 3, s: 3, sw: 16, bw: 14, blocks: 4 },
};
const stripDepth = (f: Frame) => (f.B - f.s * (f.n - 1)) / f.n;
// The gunnery seats a ship has (the crew rules count up to four crew; more seats than that are for show)
const GUNS: Record<string, number> = { Medium: 2, Large: 3, Huge: 4, Gargantuan: 4 };

// ---- What is aboard --------------------------------------------------------------------------------------------------------------------------
// A kind of deck is a list of rooms that must be there (in this order, first to last) and a pool of rooms to fill what is left. A deck is one kind or two joined.
type Kind = "engineering" | "cargo" | "hangar" | "crew" | "officers" | "security" | "medical" | "command" | "habitat" | "industry" | "science" | "luxury";
interface Menu { stern?: string; bow?: string; must: string[]; fill: string[] }
const MENUS: Record<Kind, Menu> = {
  engineering: { stern: "Engine room", must: ["Reactor control", "Machine shop"], fill: ["Power room", "Maintenance bay", "Shield generator", "Life support", "Hyperdrive core", "Fuel cells", "Droid bay", "Spare parts store", "Coolant pumps"] },
  cargo: { stern: "Cargo hold", must: ["Cargo hold"], fill: ["Cargo bay", "Spare parts store", "Hold annex", "Cargo bay", "Locker room"] },
  hangar: { stern: "Fighter bay", must: ["Flight deck", "Ready room"], fill: ["Vehicle bay", "Maintenance bay", "Munitions store", "Launch bay", "Droid bay"] },
  crew: { must: ["Crew quarters", "Galley", "Refresher"], fill: ["Crew quarters", "Mess hall", "Recreation room", "Gym", "Lounge", "Crew quarters", "Refresher", "Locker room", "Laundry"] },
  officers: { must: ["Officers' quarters", "Officers' mess", "Captain's cabin"], fill: ["Officers' quarters", "Conference room", "Library", "Refresher", "Briefing room"] },
  security: { must: ["Armory", "Brig"], fill: ["Security station", "Interrogation room", "Training room", "Munitions store", "Troop bay", "Locker room"] },
  medical: { must: ["Medbay"], fill: ["Surgery", "Quarantine ward", "Pharmacy", "Refresher", "Medbay"] },
  command: { bow: "Bridge", must: ["Communications room", "Navigation chamber"], fill: ["Sensor suite", "Ready room", "Briefing room", "War room", "Captain's cabin", "Computer core", "Conference room"] },
  habitat: { must: ["Colonist quarters", "Hydroponics"], fill: ["Colonist quarters", "Arboretum", "Market deck", "Residences", "Galley", "Medbay", "Recreation room", "Colonist quarters"] },
  industry: { must: ["Foundry", "Assembly line"], fill: ["Fabrication shop", "Refinery", "Cargo bay", "Machine shop", "Droid factory", "Foundry"] },
  science: { must: ["Laboratory", "Observatory"], fill: ["Archive", "Specimen hold", "Data center", "Laboratory", "Library", "Computer core"] },
  luxury: { must: ["Grand salon", "Guest suites"], fill: ["Dining room", "Casino", "Lounge", "Guest suites", "Passenger cabin", "Recreation room", "Passenger cabin"] },
};
// Rooms a faction's ships have beyond the common ones (put first among a kind's must-haves, so they are not the ones left out)
const FACTION_ROOMS: Record<ShipFaction, Partial<Record<Kind, string[]>>> = {
  imperial: { security: ["Interrogation room"], crew: ["Barracks"], officers: ["Briefing room"] },
  republic: { crew: ["Clone barracks"], officers: ["Conference room"], command: ["War room"], science: ["Archive"] },
  rebel: { command: ["Briefing room"], crew: ["Mess hall"], hangar: ["Ready room"] },
  separatist: { crew: ["Droid rack bay"], industry: ["Droid factory"], hangar: ["Droid bay"] },
  mandalorian: { security: ["Training hall", "Armory"], industry: ["Forge room"], crew: ["Mess hall"] },
  criminal: { luxury: ["Throne room"], security: ["Holding pens"], cargo: ["Hold annex"], crew: ["Lounge"] },
  civilian: { crew: ["Lounge"], cargo: ["Hold annex"] },
};

// The decks of a ship from the bottom up, each a list of kinds
export function decksOf(size: string, role: string, faction: ShipFaction): Kind[][] {
  const r = role.toLowerCase();
  if (size === "Small") return [["cargo"]];
  if (size === "Medium") {
    const top: Kind[] = /yacht/.test(r) ? ["command", "luxury"] : /navigator/.test(r) ? ["command", "science"] : ["command", "crew"];
    const low: Kind[] = /gunship|missile/.test(r) ? ["engineering", "security"] : ["engineering", "cargo"];
    return [low, top];
  }
  if (size === "Large") {
    const middle: Kind[] = /ambassador/.test(r) ? ["luxury", "crew"] : /explorer/.test(r) ? ["science", "cargo"] : /tender/.test(r) ? ["industry", "cargo"] : ["cargo", "security"];
    return [["hangar", "engineering"], middle, ["crew", "medical"], ["command", "officers"]];
  }
  if (size === "Huge") {
    if (/carrier/.test(r)) return [["hangar", "engineering"], ["hangar", "cargo"], ["security", "crew"], ["crew", "medical"], ["command", "officers"]];
    if (/colonizer/.test(r)) return [["engineering", "cargo"], ["habitat", "cargo"], ["habitat", "crew"], ["habitat", "medical"], ["command", "officers"]];
    return [["hangar", "engineering"], ["cargo", "security"], ["crew", "crew"], ["crew", "medical"], ["command", "officers"]];
  }
  // Gargantuan
  if (/industrial/.test(r)) return [["engineering", "cargo"], ["industry", "industry"], ["industry", "cargo"], ["crew", "medical"], ["crew", "officers"], ["command", "officers"]];
  if (/metropolis/.test(r)) return [["engineering", "cargo"], ["habitat", "cargo"], ["luxury", "habitat"], ["habitat", "crew"], ["luxury", "medical"], ["command", "officers"]];
  if (/researcher/.test(r)) return [["engineering", "cargo"], ["science", "cargo"], ["science", "science"], ["crew", "medical"], ["science", "officers"], ["command", "officers"]];
  const flag = faction === "imperial" || faction === "republic" ? "officers" : "crew";
  return [["hangar", "engineering"], ["hangar", "cargo"], ["security", "crew"], ["crew", "medical"], [flag, "crew"], ["command", "officers"]];
}

// Room widths along the ship (squares): [least, most]; everything else is 4 to 9
const WIDTHS: Record<string, [number, number]> = {
  "Flight deck": [12, 24], "Fighter bay": [10, 24], "Vehicle bay": [10, 18], "Launch bay": [10, 18], "Dropship bay": [10, 18],
  "Cargo hold": [8, 16], "Cargo bay": [7, 14], "Hold annex": [5, 10], "Engine room": [6, 12], Foundry: [8, 16], "Assembly line": [10, 20], Refinery: [8, 14], "Droid factory": [10, 18],
  "Grand salon": [8, 14], "Throne room": [8, 14], Casino: [8, 14], "Market deck": [8, 16], Arboretum: [8, 14], Hydroponics: [7, 12], Observatory: [6, 10], "Training room": [6, 10], "Training hall": [8, 12],
  Brig: [5, 9], Armory: [5, 9], "Gunnery station": [3, 4], "Equipment locker": [2, 4], Refresher: [3, 5], "Locker room": [3, 5], Laundry: [3, 5], "Escape pod bay": [3, 6],
  "Captain's cabin": [4, 7], "Admiral's suite": [6, 9], "Crew quarters": [5, 9], Barracks: [6, 10], "Clone barracks": [6, 10], "Droid rack bay": [6, 10], "Troop bay": [6, 10], "Colonist quarters": [6, 10],
};
// (a bigger ship has bigger rooms, not only more of them: a Gargantuan ship's rooms are twice as long as a Medium one's, bar the closets)
const SMALL_ROOMS = /^(Gunnery station|Equipment locker|Refresher|Locker room|Laundry|Escape pod bay)$/;
const SCALE: Record<string, number> = { Large: 1.2, Huge: 1.5, Gargantuan: 2 };
const widthOf = (name: string, scale = 1): [number, number] => {
  const [lo, hi] = WIDTHS[name] ?? [4, 9];
  return SMALL_ROOMS.test(name) || scale === 1 ? [lo, hi] : [Math.round(lo * scale), Math.round(hi * scale)];
};

// ---- A plan: rooms on their deck's grid ----------------------------------------------------------------------------------------------
interface PRoom {
  key: string;
  name: string;
  deck: number;
  x: number; y: number; w: number; h: number;
  form?: Form;
  role?: "spine" | "junction" | "zone" | "strip" | "cap" | "landing" | "flight" | "lift" | "anchor";
  // a strip or zone room that borders the hull: which of its sides
  edge?: Side[];
  extra?: Partial<RoomLayout>;
  tags?: string[];
  entry?: boolean;
}
interface PDoor { a: string; b: string; seam?: boolean; at?: { a: { x: number; y: number; side: Side }; b: { x: number; y: number; side: Side } } }
export interface InteriorPlan {
  frame: Frame; faction: ShipFaction; rooms: PRoom[]; doors: PDoor[]; entry: string;
  // a plan in a hull's outline: the hull, its kit name, the decks dropped from it (nothing could join them) and where the helm was put (the cockpit mark,
  // or the square under it on the highest deck that is joined)
  hull?: HullPlan; hullName?: string; dropped?: number[]; helmMark?: HullMark;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Fills the intervals of the strips with rooms from the queue (then from the pool): each interval is tiled exactly, every room within its width range where it can be
function tile(intervals: { strip: number; x0: number; x1: number }[], queue: string[], pool: string[], r: Rng, scale: number): { strip: number; name: string; x: number; w: number }[] {
  const out: { strip: number; name: string; x: number; w: number }[] = [];
  const fill = [...pool];
  let cycle = 0;
  const nextFill = () => fill[cycle++ % Math.max(1, fill.length)] ?? "Cargo bay";
  for (const { strip, x0, x1 } of intervals) {
    let left = x1 - x0;
    if (left <= 0) continue;
    const row: string[] = [];
    // rooms from the queue while the next one fits at its least width
    let least = 0;
    while (queue.length) {
      const at = queue.findIndex((n) => least + widthOf(n, scale)[0] <= left);
      if (at < 0) break;
      const [name] = queue.splice(at, 1);
      row.push(name);
      least += widthOf(name, scale)[0];
    }
    // then fillers while another fits
    for (let guard = 0; guard < 12; guard++) {
      const name = nextFill();
      if (least + widthOf(name, scale)[0] > left) break;
      row.push(name);
      least += widthOf(name, scale)[0];
      if (least + 6 > left) break;
    }
    if (!row.length) row.push(left <= 3 ? "Equipment locker" : nextFill());
    // widths: the least each, then the rest shared out up to each room's most, the last room taking whatever is left
    const widths = row.map((n) => Math.min(widthOf(n, scale)[0], left));
    let spare = left - widths.reduce((a, b) => a + b, 0);
    for (let guard = 0; spare > 0 && guard < 400; guard++) {
      const i = guard % row.length;
      if (widths[i] < widthOf(row[i], scale)[1]) { widths[i]++; spare--; }
      else if (row.every((n, j) => widths[j] >= widthOf(n, scale)[1])) { widths[widths.length - 1] += spare; spare = 0; }
    }
    // (a shuffle within the interval: rooms that must be there keep to the strip, but not always to the same end of it)
    const order = r.shuffle(row.map((_, i) => i));
    let x = x0;
    for (const i of order) {
      out.push({ strip, name: row[i], x, w: widths[i] });
      x += widths[i];
    }
  }
  return out;
}

// The overlap of two spans [a0, a1) and [b0, b1)
const spanOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

// The old plan, kept for a ship whose hull has no outline (or one too small to hold the plan): the frame of its size, a box
export function planFrame(ship: ShipSpec, seed: number): InteriorPlan {
  const frame = FRAMES[ship.size] ?? FRAMES.Medium;
  const faction = shipFactionOf(ship.owner);
  const r = createRandom(seed);
  const { L, B, D, n, s, sw, bw, blocks } = frame;
  const sd = stripDepth(frame);
  const decks = decksOf(ship.size, ship.role, faction);
  const rooms: PRoom[] = [];
  const doors: PDoor[] = [];
  const key = (deck: number, what: string) => `d${deck}-${what}`;
  const mid0 = sw;
  const mid1 = L - bw;
  const stripY = (j: number) => j * (sd + s);
  const spineY = (k: number) => (k + 1) * sd + k * s;

  // The stairwells: a junction of each spine to climb from, and the column the stairwell takes of the strip beside it
  const spines = n - 1;
  const stairs: { b: number; spine: number; side: "n" | "s"; strip: number; jx: number; mirror: boolean }[] = [];
  for (let b = 0; b < blocks; b++) {
    const spine = b % spines;
    const side: "n" | "s" = Math.floor(b / spines) % 2 === 0 ? "n" : "s";
    const cx = mid0 + Math.round(((b + 0.5) * (mid1 - mid0)) / blocks);
    stairs.push({ b, spine, side, strip: side === "n" ? spine : spine + 1, jx: clamp(cx - 2, mid0 + 1, mid1 - 5), mirror: r.chance(0.5) });
  }

  // Rooms asked of every deck: the gunnery seats (the first in the bow zone of the top deck, the rest one to a deck from the bottom)
  const guns = GUNS[ship.size] ?? 1;
  const gunDecks = Array.from({ length: Math.max(0, guns - 1) }, (_, i) => i % D);

  for (let d = 0; d < D; d++) {
    const kinds = decks[d] ?? ["cargo"];
    const menu = kinds.map((k) => MENUS[k]);
    const extra = kinds.flatMap((k) => FACTION_ROOMS[faction][k] ?? []);
    const queue = [...new Set<string>([...extra, ...menu.flatMap((m) => m.must)])];
    // (a second crew deck wants a second galley and so on: every must-have is wanted, but each only once, so the pool is cycled for the rest)
    for (let i = 0; i < gunDecks.filter((g) => g === d).length; i++) queue.unshift("Gunnery station");
    const pool = [...new Set(menu.flatMap((m) => m.fill))];
    const top = d === D - 1;
    // (the stern of the bottom deck is where the ship is boarded: its bay or its hold; a ship whose stern is a bay keeps its engine room among the compartments)
    const sternName = kinds.map((k) => MENUS[k].stern).find(Boolean) ?? pool[(d * 3) % pool.length];
    if (kinds.includes("engineering") && sternName !== "Engine room") queue.unshift("Engine room");

    // -- The spines: segments between the junctions the stairwells climb from
    for (let k = 0; k < spines; k++) {
      const cuts = stairs.filter((st) => st.spine === k).sort((p, q) => p.jx - q.jx);
      let x = mid0;
      let i = 0;
      for (const st of cuts) {
        if (st.jx - x >= 2) rooms.push({ key: key(d, `spine${k}.${i++}`), name: "Passage", deck: d, x, y: spineY(k), w: st.jx - x, h: s, form: "corridor", role: "spine" });
        rooms.push({ key: key(d, `junction${st.b}`), name: "Junction", deck: d, x: st.jx, y: spineY(k), w: 4, h: s, form: "corridor", role: "junction" });
        x = st.jx + 4;
      }
      if (mid1 - x >= 2) rooms.push({ key: key(d, `spine${k}.${i++}`), name: "Passage", deck: d, x, y: spineY(k), w: mid1 - x, h: s, form: "corridor", role: "spine" });
    }

    // -- The strips: what is left of each, tiled with compartments
    const intervals: { strip: number; x0: number; x1: number }[] = [];
    for (let j = 0; j < n; j++) {
      const cols = stairs.filter((st) => st.strip === j).sort((p, q) => p.jx - q.jx);
      let x = mid0;
      for (const st of cols) {
        if (st.jx + 1 - x > 0) intervals.push({ strip: j, x0: x, x1: st.jx + 1 });
        x = st.jx + 3;
      }
      if (mid1 - x > 0) intervals.push({ strip: j, x0: x, x1: mid1 });
    }
    for (const t of tile(r.shuffle(intervals), queue, pool, r, SCALE[ship.size] ?? 1)) {
      rooms.push({ key: key(d, `s${t.strip}.${t.x}`), name: t.name, deck: d, x: t.x, y: stripY(t.strip), w: t.w, h: sd, role: "strip", edge: [...(t.strip === 0 ? ["n" as Side] : []), ...(t.strip === n - 1 ? ["s" as Side] : [])] });
    }
    // -- The caps over the stairwells: what is left of the strip beyond the flights
    for (const st of stairs) {
      const cap = sd - 6;
      if (cap < 2) continue;
      const y0 = st.side === "n" ? stripY(st.strip) : spineY(st.spine) + s + 6;
      rooms.push({ key: key(d, `cap${st.b}`), name: "Equipment locker", deck: d, x: st.jx + 1, y: y0, w: 2, h: cap, role: "cap", edge: st.strip === 0 && st.side === "n" ? ["n"] : st.strip === n - 1 && st.side === "s" ? ["s"] : [] });
    }

    // -- The zones at the ends: a stern of one room, a bow of one room, or of a bridge or cockpit between two (house rule: the command deck is forward)
    rooms.push({ key: key(d, "stern"), name: sternName, deck: d, x: 0, y: 0, w: sw, h: B, role: "zone", edge: ["w", "n", "s"] });
    if (top) {
      const mainName = ship.size === "Medium" ? "Cockpit" : "Bridge";
      const mainH = ship.size === "Medium" ? B - 6 : Math.min(B, 12 + (n - 2) * 2);
      const first = Math.floor((B - mainH) / 2);
      const flank = (name: string, y: number, h: number, edge: Side[]) => rooms.push({ key: key(d, `bow.${y}`), name, deck: d, x: L - bw, y, w: bw, h, role: "zone", edge: ["e", ...edge] });
      if (first >= 2) {
        // the flanks: forward gun stations, the pods' bay, the rest from the pool
        const northName = guns ? "Gunnery station" : pool[0];
        const pieces = (name0: string, y0: number, h0: number, edge: Side[], pick: string[]) => {
          const count = Math.max(1, Math.ceil(h0 / 9));
          for (let i = 0; i < count; i++) {
            const y = y0 + Math.floor((h0 * i) / count);
            const h = y0 + Math.floor((h0 * (i + 1)) / count) - y;
            flank(i === 0 ? name0 : pick[i % pick.length], y, h, [...(i === 0 ? edge : [])]);
          }
        };
        pieces(northName, 0, first, ["n"], pool);
        pieces("Escape pod bay", first + mainH, B - first - mainH, ["s"], ["Locker room", "Refresher", ...pool]);
      }
      rooms.push({ key: key(d, "bow.main"), name: mainName, deck: d, x: L - bw, y: first >= 2 ? first : 0, w: bw, h: first >= 2 ? mainH : B, role: "zone", edge: ["e"] });
    } else {
      rooms.push({ key: key(d, "bow"), name: menu.map((m) => m.bow).find(Boolean) ?? pool[(d * 5 + 1) % pool.length], deck: d, x: L - bw, y: 0, w: bw, h: B, role: "zone", edge: ["e", "n", "s"] });
    }
  }

  // ---- Doors (as pairs of rooms; the squares are found when the rooms are made)
  const at = (deck: number) => rooms.filter((q) => q.deck === deck);
  const touch = (a: PRoom, b: PRoom) => {
    if (a.deck !== b.deck || a === b) return 0;
    if (a.x + a.w === b.x || b.x + b.w === a.x) return Math.max(0, spanOverlap(a.y, a.y + a.h, b.y, b.y + b.h));
    if (a.y + a.h === b.y || b.y + b.h === a.y) return Math.max(0, spanOverlap(a.x, a.x + a.w, b.x, b.x + b.w));
    return 0;
  };
  const joined = new Set<string>();
  const link = (a: PRoom, b: PRoom, extra: Partial<PDoor> = {}) => {
    const id = [a.key, b.key].sort().join("|");
    if (joined.has(id)) return;
    joined.add(id);
    doors.push({ a: a.key, b: b.key, ...extra });
  };
  for (let d = 0; d < D; d++) {
    const here = at(d);
    const spineParts = here.filter((q) => q.role === "spine" || q.role === "junction");
    const zones = here.filter((q) => q.role === "zone");
    // each spine runs its segments and junctions end to end
    for (const p of spineParts) for (const q of spineParts) if (p.key < q.key && p.y === q.y && touch(p, q)) link(p, q);
    // its ends meet the zone beside them that it touches most
    for (const p of spineParts) {
      for (const end of [p.x === mid0 ? "w" : "", p.x + p.w === mid1 ? "e" : ""]) {
        if (!end) continue;
        const best = zones.filter((z) => (end === "w" ? z.x + z.w === p.x : z.x === p.x + p.w) && touch(z, p) > 0).sort((u, v) => touch(v, p) - touch(u, p))[0];
        if (best) link(p, best);
      }
    }
    // the zone's rooms one above the next
    const stern = zones.filter((z) => z.x === 0).sort((p, q) => p.y - q.y);
    const bow = zones.filter((z) => z.x === L - bw).sort((p, q) => p.y - q.y);
    for (const col of [stern, bow]) for (let i = 1; i < col.length; i++) link(col[i - 1], col[i]);
    // a compartment opens on the spine it touches most (and, if it touches two along three squares each, on both)
    for (const c of here.filter((q) => q.role === "strip")) {
      const near = spineParts.map((p) => [p, touch(c, p)] as const).filter(([, t]) => t > 0).sort((u, v) => v[1] - u[1]);
      if (near[0]) link(c, near[0][0]);
      for (const [p, t] of near.slice(1)) if (t >= 3 && p.y !== near[0][0].y) link(c, p);
    }
    // a cap opens on the compartment beside it
    for (const c of here.filter((q) => q.role === "cap")) {
      const beside = here.filter((q) => q.role === "strip" && touch(c, q) > 0).sort((u, v) => touch(v, c) - touch(u, c));
      if (beside[0]) link(c, beside[0]);
    }
    // some rooms side by side are joined too, so that the decks are not trees (a ship's crew goes round)
    const row = here.filter((q) => q.role === "strip").sort((p, q) => p.y - q.y || p.x - q.x);
    for (let i = 1; i < row.length; i++) if (row[i - 1].y === row[i].y && touch(row[i - 1], row[i]) >= 3 && r.chance(0.35)) link(row[i - 1], row[i]);
  }

  // ---- The stairwells: a landing on every deck, a flight between each two (stairBlock)
  for (const st of stairs) {
    const host: Pick<RoomLayout, "x" | "y" | "width" | "height"> = { x: st.jx, y: spineY(st.spine), width: 4, height: s };
    const block = stairBlock(host, st.side, 1, st.mirror, D - 1, 0);
    const landing = (f: number) => key(f, `land${st.b}`);
    const flight = (f: number) => key(f, `flight${st.b}`);
    for (const { floor, layout } of block.landings) {
      rooms.push({ key: landing(floor), name: floor === 0 ? "Stairwell" : `Stairwell, deck ${floor + 1}`, deck: floor, x: layout.x, y: layout.y, w: layout.width, h: layout.height, form: "corridor", role: "landing", tags: [`block:${st.b}`, ...(floor === 0 ? ["lane:hall"] : []), `landing:${floor}`] });
    }
    block.ups.forEach((layout, f) => {
      rooms.push({ key: flight(f), name: `Stairs up to deck ${f + 2}`, deck: f, x: layout.x, y: layout.y, w: layout.width, h: layout.height, form: "stairs", role: "flight", extra: { climb: layout.climb, switchback: layout.switchback }, tags: [`block:${st.b}`, `storey:${f}`] });
    });
    // its doors: two to a door, one in each room
    const roomOf = (name: string, deck: number) => (name === "host" ? key(deck, `junction${st.b}`) : name.startsWith("land") ? landing(Number(name.slice(4))) : flight(Number(name.slice(2))));
    for (const id of [...new Set(block.doors.map((q) => q.key))]) {
      const [d1, d2] = block.doors.filter((q) => q.key === id);
      const floor = id.startsWith("floor") ? Number(id.slice(5)) : 0;
      doors.push({ a: roomOf(d1.room, floor), b: roomOf(d2.room, floor), seam: !id.startsWith("floor"), at: { a: { x: d1.x, y: d1.y, side: d1.side }, b: { x: d2.x, y: d2.y, side: d2.side } } });
    }
  }

  // ---- Where the ship is boarded: a room of the bottom deck that stands at the hull
  const bottom = rooms.filter((q) => q.deck === 0 && q.role !== "landing" && q.role !== "flight" && q.edge && q.edge.length);
  const entry = bottom.find((q) => /^(fighter bay|cargo hold)$/.test(q.name)) ?? bottom.find((q) => q.role === "zone") ?? bottom[0];
  entry.entry = true;
  return { frame, faction, rooms, doors, entry: entry.key };
}

// ---- The plan that follows the hull (2026-11-15) -------------------------------------------------------------------------------------------
// The user: a ship's inside did not match its outside. The decks and their outlines are now the hull's (shared/art/shipHulls.json, measured from the
// kit's meshes), and the plan is laid out in them:
//   1. the hull's decks, each with the kinds of decksOf merged into (or spread over) that many (the command kind on the deck the helm is on)
//   2. the rooms the hull fixes first: the bridge or cockpit at the cockpit mark, an engine room at the engines on each deck that has them, and the
//      boarding room round the ramp mark on the bottom deck (its wall on the ramp's side)
//   3. the band down the hull's length where the decks are longest: the stairwells (stairBlock, against a junction of the band) where a column of
//      squares is inside on every deck; HOUSE RULE: where none is, or the ship is Large or bigger, a turbolift (a `lift` room, one door on each deck
//      it serves; a ladder where a hull is too narrow for one) wherever its footprint is inside the decks it joins
//   4. on every deck, passages (spines) down the band and every `sd + s` squares across it (the more, the wider the hull: a saucer has three or four),
//      then a passage carved (two squares wide, else one) from every room or passage the spines do not reach (a cockpit in a side tube, a lift) to them
//   5. compartments along the passages, each a rectangle as deep as the outline lets it be over its columns (shallower toward a taper; no sliver under
//      two squares), the role's and the faction's rooms first (MENUS, FACTION_ROOMS); then rooms in the pockets left, each opening onto its neighbour
//   6. doors: a room onto the passage it touches most, passages end to end, the rest onto a neighbour that is reached; a room nothing reaches is left out
// The windows are the hull's window marks on a room's outline wall, the boarding ramp the ramp mark. A Huge or Gargantuan hull is `folded` (HOUSE RULE:
// a kilometre and more of ship cannot be walked; the kit fits its outline into the section the map shows, FRAMES) and is laid out the same way.
const HULLS: Record<string, HullPlan> = ((hullFile as unknown as Partial<HullFile>).hulls ?? {}) as Record<string, HullPlan>;
const KIT_SHIPS = (shipKit as unknown as { ships: Record<string, { length: number; beam: number }> }).ships;
// The kit hull a ship is drawn with, and its outline if the kit measured one
export const hullNameOf = (ship: Pick<ShipSpec, "size" | "role" | "owner">): string => shipKitName(ship, (n) => n in HULLS);
export const hullOf = (ship: Pick<ShipSpec, "size" | "role" | "owner">): HullPlan | undefined => HULLS[hullNameOf(ship)];
export const hullNames = (): string[] => Object.keys(HULLS);

interface Rect { x: number; y: number; w: number; h: number }
const OUT: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
// How many squares a point is from a rectangle (0 inside it)
export const rectDistance = (R: Rect, x: number, y: number) => Math.max(0, R.x - x, x - (R.x + R.w - 1)) + Math.max(0, R.y - y, y - (R.y + R.h - 1));

// The kinds of the decks, merged into or spread over the hull's decks; the command deck is the one the helm is on
function decksFor(kinds: Kind[][], n: number, helmDeck: number): Kind[][] {
  const K = kinds.length;
  const out: Kind[][] = K >= n
    ? range(0, n).map((i) => [...new Set(kinds.slice(Math.floor((i * K) / n), Math.floor(((i + 1) * K) / n)).flat())])
    : range(0, n).map((i) => [...kinds[Math.min(K - 1, Math.floor((i * K) / n))]]);
  if (!out[helmDeck].includes("command") && kinds.flat().includes("command")) {
    for (const k of out) if (k.includes("command")) k.splice(k.indexOf("command"), 1);
    out[helmDeck].unshift("command");
    for (const k of out) if (!k.length) k.push("crew");
  }
  return out;
}

// HOUSE RULE (parked fighters): a hangar holds as many of its maker's Small hulls as stand in it with a square of deck round each, bow to +x
const HANGARS = /^(flight deck|fighter bay|vehicle bay|launch bay)$/i;
const SQUARE_M = 1.4066;
function parkFighters(room: Area, faction: ShipFaction) {
  const name = KIT_SHIPS[`ship_${faction}_small`] ? `ship_${faction}_small` : "ship_civilian_small";
  const kit = KIT_SHIPS[name];
  const l = room.layout;
  if (!kit || !l) return;
  const [fw, fh] = [Math.ceil(kit.length / SQUARE_M), Math.ceil(kit.beam / SQUARE_M)];
  // (a third of the floor at most, but one wherever one fits with its walkway round it)
  const most = Math.max(1, Math.floor((l.width * l.height) / (fw * fh * 3)));
  let n = 0;
  for (let y = 1; y + fh + 1 <= l.height && n < most; y++) {
    for (let x = 1; x + fw + 1 <= l.width && n < most; x++) {
      if (l.assets.some((o) => o.x < x + fw + 1 && x - 1 < o.x + o.w && o.y < y + fh + 1 && y - 1 < o.y + o.h)) continue;
      let stands = true;
      for (let yy = y; yy < y + fh && stands; yy++) for (let xx = x; xx < x + fw; xx++) if (!standsAt(l, xx, yy)) { stands = false; break; }
      if (!stands) continue;
      l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind: "furniture", name: "Parked starfighter", x, y, w: fw, h: fh, blocks: true, ref: `hull:${name}` });
      if (floorFaults(l)) { l.assets.pop(); continue; }
      n++;
    }
  }
}

// (`forced`: decks dropped from the start, the plan made again without them when the helm on one of them could not be reached)
export function planFromHull(ship: ShipSpec, seed: number, hull: HullPlan, hullName: string, report?: string[], forced: number[] = [], toBody = false, retry = true): InteriorPlan | undefined {
  const faction = shipFactionOf(ship.owner);
  const r = createRandom(seed);
  const { L, B } = hull;
  const D = hull.decks.length;
  // (why a hull could not hold the plan, for the tests: the caller's list)
  const why = (w: string) => { report?.push(`${hullName}: ${w}`); return undefined; };
  // (a hull that holds less than a cockpit and a cabin, four squares each, has no inside of its own: the frame's plan stands in; a cramped hull, a
  // slim gunship or a shuttle, gets a cramped plan: the cockpit at its mark, a hold with the ramp, an engine nook if one fits)
  const squares = hull.decks.reduce((a, dk) => a + dk.rows.reduce((b, runs) => { for (let i = 0; i + 1 < runs.length; i += 2) b += runs[i + 1] - runs[i]; return b; }, 0), 0);
  if (!D || squares < 8) return why(`holds ${squares} squares`);
  const small = ship.size === "Small";
  const base = FRAMES[ship.size] ?? FRAMES.Medium;
  const s = small ? 2 : base.s;
  const sd = small ? 4 : stripDepth(base);
  const dcap = sd + 2;
  const scale = SCALE[ship.size] ?? 1;
  const rooms: PRoom[] = [];
  const doors: PDoor[] = [];
  const key = (d: number, what: string) => `d${d}-${what}`;

  // ---- The decks' squares: -1 outside the hull, 0 free, n the n-th room's
  const grid = hull.decks.map((deck) => {
    const g = new Int32Array(L * B);
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) g[y * L + x] = insideHull(deck, x, y) ? 0 : -1;
    return g;
  });
  for (const d of forced) grid[d].fill(-1);
  const at = (d: number, x: number, y: number) => (d < 0 || d >= D || x < 0 || y < 0 || x >= L || y >= B ? -1 : grid[d][y * L + x]);
  const roomOf = (id: number) => (id > 0 ? rooms[id - 1] : undefined);
  const put = (p: PRoom, decks: number[] = [p.deck]) => {
    rooms.push(p);
    for (const d of decks) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) grid[d][y * L + x] = rooms.length;
    return p;
  };
  // Whether a rectangle of a deck is all free (a table of sums, made again after the deck changes)
  // (`main`: only in the deck's main body, see the ways between the decks)
  const mains: (Uint8Array | undefined)[] = [];
  const freeTest = (d: number, main = false) => {
    const W = L + 1;
    const S = new Int32Array(W * (B + 1));
    const m = main ? mains[d] : undefined;
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) S[(y + 1) * W + x + 1] = (grid[d][y * L + x] === 0 && (!m || m[y * L + x]) ? 0 : 1) + S[y * W + x + 1] + S[(y + 1) * W + x] - S[y * W + x];
    return (R: Rect) => R.x >= 0 && R.y >= 0 && R.w > 0 && R.h > 0 && R.x + R.w <= L && R.y + R.h <= B && S[(R.y + R.h) * W + R.x + R.w] - S[R.y * W + R.x + R.w] - S[(R.y + R.h) * W + R.x] + S[R.y * W + R.x] === 0;
  };
  // The biggest free rectangle of a size range within `reach` squares of a point (and meeting `must`), the nearer the better
  // (a room the hull fixes takes no more than a third of its deck, or half of a lone deck: the rest is for the ways up and the other rooms)
  const deckCap = hull.decks.map((dk) => Math.max(4, Math.floor(dk.rows.reduce((b, runs) => { for (let i = 0; i + 1 < runs.length; i += 2) b += runs[i + 1] - runs[i]; return b; }, 0) * (D > 1 ? 0.34 : 0.5))));
  const findRect = (d: number, tx: number, ty: number, wr: number[], hr: number[], reach: number, must?: (R: Rect) => boolean): Rect | undefined => {
    const ok = freeTest(d);
    let best: Rect | undefined;
    let score = -Infinity;
    for (let w = wr[1]; w >= wr[0]; w--) for (let h = hr[1]; h >= hr[0]; h--) {
      for (let y = ty - h + 1 - reach; y <= ty + reach; y++) for (let x = tx - w + 1 - reach; x <= tx + reach; x++) {
        const R = { x, y, w, h };
        if (w * h > deckCap[d]) continue;
        const dd = rectDistance(R, tx, ty);
        if (dd > reach || (must && !must(R)) || !ok(R)) continue;
        const sc = Math.min(w * h, wr[1] * hr[1]) - 12 * dd - 0.1 * (Math.abs(x + w / 2 - tx - 0.5) + Math.abs(y + h / 2 - ty - 0.5));
        if (sc > score) { score = sc; best = R; }
      }
    }
    return best;
  };
  const grow = (d: number, tx: number, ty: number, wr: number[], hr: number[], reach: number, must?: (R: Rect) => boolean) =>
    findRect(d, tx, ty, wr, hr, reach, must) ?? findRect(d, tx, ty, [Math.min(2, wr[0]), wr[1]], [Math.min(3, hr[0]), hr[1]], reach + 1, must) ?? findRect(d, tx, ty, [2, wr[1]], [2, hr[1]], reach + 4, must);

  // ---- What each deck holds
  // (the helm's deck: the cockpit mark's, or if that deck was dropped, the highest left, under the mark: the nearest inside square there)
  const markDeck = clamp(hull.cockpit.deck, 0, D - 1);
  const helmDeck = forced.includes(markDeck) ? Math.max(...range(0, D).filter((d) => !forced.includes(d))) : markDeck;
  // (a deck's body: its squares joined square to square to the ramp's on the bottom deck, the biggest such stretch on the others)
  const bodyOf = (d: number): Uint8Array => {
    const label = new Int32Array(L * B).fill(-1);
    const sizes: number[] = [];
    for (let i = 0; i < L * B; i++) {
      if (grid[d][i] === -1 || label[i] >= 0) continue;
      const stack = [i];
      label[i] = sizes.length;
      let n = 0;
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const [x, y] = [c % L, Math.floor(c / L)];
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const j = ny * L + nx;
          if (nx >= 0 && ny >= 0 && nx < L && ny < B && grid[d][j] !== -1 && label[j] < 0) { label[j] = sizes.length; stack.push(j); }
        }
      }
      sizes.push(n);
    }
    const r0 = hull.ramp;
    const pick = d === 0 && r0.x >= 0 && r0.y >= 0 && r0.x < L && r0.y < B && label[r0.y * L + r0.x] >= 0 ? label[r0.y * L + r0.x] : sizes.indexOf(Math.max(...sizes));
    return Uint8Array.from(label, (v) => (v === pick && v >= 0 ? 1 : 0));
  };
  const nearestInside = (d: number, tx: number, ty: number, body?: Uint8Array) => {
    let best = { x: tx, y: ty, n: Infinity };
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) if (at(d, x, y) !== -1 && (!body || body[y * L + x]) && Math.abs(x - tx) + Math.abs(y - ty) < best.n) best = { x, y, n: Math.abs(x - tx) + Math.abs(y - ty) };
    return best;
  };
  const kinds: Kind[][] = small ? range(0, D).map(() => ["cargo"] as Kind[]) : decksFor(decksOf(ship.size, ship.role, faction), D, helmDeck);
  const queues: string[][] = [];
  const pools: string[][] = [];
  for (let d = 0; d < D; d++) {
    const menu = kinds[d].map((k) => MENUS[k]);
    const extra = kinds[d].flatMap((k) => FACTION_ROOMS[faction][k] ?? []);
    queues.push(small ? [] : [...new Set<string>([...extra, ...menu.flatMap((m) => m.must)])]);
    pools.push(small ? ["Cargo hold", "Refresher", "Equipment locker"] : [...new Set(menu.flatMap((m) => m.fill))]);
  }
  const guns = small ? 0 : GUNS[ship.size] ?? 1;
  const gunOrder = [helmDeck, ...range(0, D).filter((d) => d !== helmDeck)];
  for (let i = 0; i < guns; i++) queues[gunOrder[i % D]].unshift("Gunnery station");

  // ---- The rooms the hull fixes: the helm, the engines, the boarding room
  const ramp = { ...hull.ramp, deck: 0 };
  const awayFromRamp = (d: number) => (R: Rect) => d !== 0 || rectDistance(R, ramp.x, ramp.y) > 1;
  // (`toBody`: a helm that could not be reached at its mark goes to the nearest square of its deck's body)
  const cm = helmDeck === markDeck && !toBody ? hull.cockpit : { deck: helmDeck, ...nearestInside(helmDeck, hull.cockpit.x, hull.cockpit.y, bodyOf(helmDeck)) };
  const helmName = small || ship.size === "Medium" ? "Cockpit" : "Bridge";
  const [cw, ch] = small ? [[2, 4], [3, 5]] : ship.size === "Medium" ? [[4, 7], [5, 9]] : [[Math.round(7 * scale), Math.round(11 * scale)], [7, Math.min(B, Math.round(12 * scale))]];
  // (smaller and smaller, the mark kept within two squares: a cramped hull's cockpit is a nook; only then farther off)
  const away = awayFromRamp(helmDeck);
  const helmRect = findRect(helmDeck, cm.x, cm.y, cw, ch, 1, away) ?? findRect(helmDeck, cm.x, cm.y, [2, cw[1]], [2, ch[1]], 2, away) ?? findRect(helmDeck, cm.x, cm.y, [1, cw[1]], [1, ch[1]], 2, (R) => R.w * R.h >= 4 && away(R))
    ?? findRect(helmDeck, cm.x, cm.y, [1, cw[1]], [1, ch[1]], 2, (R) => R.w * R.h >= 3 && rectDistance(R, ramp.x, ramp.y) > 0) ?? findRect(helmDeck, cm.x, cm.y, [2, cw[1]], [2, ch[1]], 6, away) ?? findRect(helmDeck, cm.x, cm.y, [1, cw[1]], [1, ch[1]], 8, (R) => R.w * R.h >= 3);
  if (!helmRect) return why("no room for the cockpit");
  put({ key: key(helmDeck, "helm"), name: helmName, deck: helmDeck, ...helmRect, role: "anchor" });
  const engineName = small ? "Engine bay" : "Engine room";
  let engines = 0;
  for (const d of [...new Set(hull.engines.map((m) => clamp(m.deck, 0, D - 1)))].sort((p, q) => p - q)) {
    const m = hull.engines.filter((e) => clamp(e.deck, 0, D - 1) === d).sort((p, q) => Math.abs(p.y + 0.5 - B / 2) - Math.abs(q.y + 0.5 - B / 2) || p.x - q.x)[0];
    const [lo, hi] = small ? [2, 3] : widthOf(engineName, scale);
    const er = grow(d, m.x, m.y, [Math.min(lo, small ? 2 : 4), hi], [small ? 2 : 4, small ? 5 : sd], 1, awayFromRamp(d));
    if (!er) continue;
    put({ key: key(d, "engines"), name: engineName, deck: d, ...er, role: "anchor" });
    engines++;
  }
  if (!engines) {
    const d = Math.max(0, kinds.findIndex((k) => k.includes("engineering")));
    queues[d].unshift(engineName);
  }
  const k0 = kinds[0];
  const entryName = small ? (faction === "imperial" || faction === "republic" ? "Troop bay" : "Passenger cabin") : k0.includes("hangar") ? "Fighter bay" : k0.includes("cargo") ? "Cargo hold" : k0.includes("security") ? "Troop bay" : "Cargo hold";
  {
    const [lo, hi] = small ? [3, 6] : widthOf(entryName, scale);
    const hh = small ? 6 : entryName === "Fighter bay" ? Math.max(6, Math.min(B, Math.round(hi * 0.6))) : dcap;
    const side = ramp.side;
    const onSide = (R: Rect) => (side === "n" ? R.y === ramp.y : side === "s" ? R.y + R.h - 1 === ramp.y : side === "w" ? R.x === ramp.x : side === "e" ? R.x + R.w - 1 === ramp.x : true);
    const er = findRect(0, ramp.x, ramp.y, [Math.min(lo, small ? 3 : 6), hi], [3, hh], 0, onSide) ?? findRect(0, ramp.x, ramp.y, [2, hi], [2, hh], 0, onSide) ?? findRect(0, ramp.x, ramp.y, [1, hi], [1, hh], 0, (R) => R.w * R.h >= 2)
      ?? findRect(0, ramp.x, ramp.y, [2, hi], [2, hh], 1) ?? findRect(0, ramp.x, ramp.y, [1, hi], [1, hh], 1, (R) => R.w * R.h >= 2) ?? findRect(0, ramp.x, ramp.y, [2, hi], [2, hh], 4) ?? findRect(0, ramp.x, ramp.y, [1, hi], [1, hh], 4, (R) => R.w * R.h >= 2);
    if (!er) return why("entry");
    put({ key: key(0, "entry"), name: entryName, deck: 0, ...er, role: "anchor", entry: true });
    const i = queues[0].indexOf(entryName);
    if (i >= 0) queues[0].splice(i, 1);
  }

  // ---- The band down the hull: the rows where the decks run longest (near the middle)
  const rowsFree = (d: number, x: number, y: number, h: number) => { for (let i = 0; i < h; i++) if (at(d, x, y + i) !== 0) return false; return true; };
  const longest = (d: number, y: number) => {
    let best = 0;
    let run = 0;
    for (let x = 0; x < L; x++) { run = rowsFree(d, x, y, s) ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };
  let y0 = 0;
  {
    let best = -Infinity;
    for (let y = 0; y + s <= B; y++) {
      const sc = range(0, D).reduce((a, d) => a + longest(d, y), 0) - 0.3 * Math.abs(y + s / 2 - B / 2);
      if (sc > best) { best = sc; y0 = y; }
    }
  }

  const isWayRole = (p: PRoom) => p.role === "landing" || p.role === "flight";
  // ---- The ways between the decks
  // (they stand in each deck's main body: the stretch of it, joined square to square, that holds the boarding room on the bottom deck, the helm on its
  // deck, and is the biggest on the others; an island of a deck apart from it, a pod or a fin, is reached only if a passage can be carved to it)
  for (let d = 0; d < D; d++) {
    const label = new Int32Array(L * B).fill(-1);
    const sizes: number[] = [];
    for (let i = 0; i < L * B; i++) {
      if (grid[d][i] === -1 || label[i] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      const stack = [i];
      label[i] = id;
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const [x, y] = [c % L, Math.floor(c / L)];
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= L || ny >= B) continue;
          const j = ny * L + nx;
          if (grid[d][j] !== -1 && label[j] < 0) { label[j] = id; stack.push(j); }
        }
      }
      sizes.push(n);
    }
    const anchor = rooms.find((p) => p.deck === d && (d === 0 ? p.entry : d === helmDeck && p.name === helmName));
    const pick = anchor ? label[anchor.y * L + anchor.x] : sizes.indexOf(Math.max(...sizes));
    mains[d] = Uint8Array.from(label, (v) => (v === pick ? 1 : 0));
  }
  const comp = range(0, D);
  const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  const together = () => range(0, D).every((d) => find(d) === find(0));
  let blocks = 0;
  // (how many pieces a deck's main body is in, a rectangle taken out of it: a stairwell or a lift is not put where it would cut a narrow way in two)
  const pieces = (d: number, ...out: Rect[]) => {
    const open = (i: number) => {
      const [x, y] = [i % L, Math.floor(i / L)];
      const q = roomOf(grid[d][i]);
      return grid[d][i] !== -1 && !!mains[d]?.[i] && !out.some((R) => x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h) && !(q && (q.role === "lift" || isWayRole(q)));
    };
    const seen = new Uint8Array(L * B);
    let n = 0;
    for (let i = 0; i < L * B; i++) {
      if (seen[i] || !open(i)) continue;
      n++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const [x, y] = [c % L, Math.floor(c / L)];
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const j = ny * L + nx;
          if (nx < 0 || ny < 0 || nx >= L || ny >= B || seen[j] || !open(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    return n;
  };
  if (D > 1 && !small) {
    const tests = range(0, D).map((d) => freeTest(d, true));
    // (a stairwell climbs from the bottom deck as high as its column stays inside the hull: the tallest first)
    // (against a junction of the band; where no column there is inside, against a junction anywhere, joined to the passages later)
    const cands: { jx: number; jy: number; jh: number; side: "n" | "s"; top: number }[] = [];
    for (const off of [false, true]) {
      if (off && cands.length) break;
      for (let jy = off ? 0 : y0; jy <= (off ? B - 2 : y0); jy++) {
        const jh = off ? 2 : s;
        for (let jx = 0; jx + 4 <= L; jx++) {
          for (const side of ["s", "n"] as const) {
            const J = { x: jx, y: jy, w: 4, h: jh };
            const C = side === "s" ? { x: jx + 1, y: jy + jh, w: 2, h: 6 } : { x: jx + 1, y: jy - 6, w: 2, h: 6 };
            let top = -1;
            while (top + 1 < D && tests[top + 1](J) && tests[top + 1](C)) top++;
            if (top >= 1) cands.push({ jx, jy, jh, side, top });
          }
        }
      }
    }
    const tallest = Math.max(0, ...cands.map((c) => c.top));
    const chosen: typeof cands = [];
    const whole = range(0, D).map((d) => pieces(d));
    for (let b = 0; b < base.blocks; b++) {
      const target = ((b + 0.5) * L) / base.blocks;
      const order = cands.filter((c) => chosen.every((o) => Math.abs(o.jx - c.jx) >= 8)).sort((p, q) => (q.top === tallest ? 1 : 0) - (p.top === tallest ? 1 : 0) || Math.abs(p.jx - target) - Math.abs(q.jx - target) || Math.abs(p.jy + 1 - B / 2) - Math.abs(q.jy + 1 - B / 2));
      const foot = (c: (typeof cands)[number]): Rect[] => [{ x: c.jx, y: c.jy, w: 4, h: c.jh }, c.side === "s" ? { x: c.jx + 1, y: c.jy + c.jh, w: 2, h: 6 } : { x: c.jx + 1, y: c.jy - 6, w: 2, h: 6 }];
      const pick = order.slice(0, 16).find((c) => range(0, c.top + 1).every((d) => pieces(d, ...foot(c)) <= whole[d])) ?? order[0];
      if (pick) chosen.push(pick);
    }
    for (const st of chosen.sort((p, q) => p.jx - q.jx)) {
      const b = blocks++;
      const T = st.top + 1;
      const host = { x: st.jx, y: st.jy, width: 4, height: st.jh };
      const block = stairBlock(host, st.side, 1, r.chance(0.5), T - 1, 0);
      for (let d = 0; d < T; d++) put({ key: key(d, `junction${b}`), name: "Junction", deck: d, x: st.jx, y: st.jy, w: 4, h: st.jh, form: "corridor", role: "junction" });
      const landing = (f: number) => key(f, `land${b}`);
      const flight = (f: number) => key(f, `flight${b}`);
      for (const { floor, layout } of block.landings) {
        put({ key: landing(floor), name: floor === 0 ? "Stairwell" : `Stairwell, deck ${floor + 1}`, deck: floor, x: layout.x, y: layout.y, w: layout.width, h: layout.height, form: "corridor", role: "landing", tags: [`block:${b}`, ...(floor === 0 ? ["lane:hall"] : []), `landing:${floor}`] });
      }
      block.ups.forEach((layout, f) => {
        put({ key: flight(f), name: `Stairs up to deck ${f + 2}`, deck: f, x: layout.x, y: layout.y, w: layout.width, h: layout.height, form: "stairs", role: "flight", extra: { climb: layout.climb, switchback: layout.switchback }, tags: [`block:${b}`, `storey:${f}`] }, f === T - 2 ? [f, f + 1] : [f]);
      });
      const nameOf = (name: string, deck: number) => (name === "host" ? key(deck, `junction${b}`) : name.startsWith("land") ? landing(Number(name.slice(4))) : flight(Number(name.slice(2))));
      for (const id of [...new Set(block.doors.map((q) => q.key))]) {
        const [d1, d2] = block.doors.filter((q) => q.key === id);
        const floor = id.startsWith("floor") ? Number(id.slice(5)) : 0;
        doors.push({ a: nameOf(d1.room, floor), b: nameOf(d2.room, floor), seam: !id.startsWith("floor"), at: { a: { x: d1.x, y: d1.y, side: d1.side }, b: { x: d2.x, y: d2.y, side: d2.side } } });
      }
      for (let d = 1; d < T; d++) comp[find(d)] = find(0);
    }
  }
  // HOUSE RULE (turbolifts): a Large ship or bigger has one at least; any decks the stairwells do not join are joined by lifts (by ladders where no lift fits)
  const lifts: { p: PRoom; lo: number; hi: number }[] = [];
  const wantLift = !small && ship.size !== "Medium";
  for (let guard = 0; D > 1 && guard < 2 * D && (!together() || (wantLift && !lifts.length)); guard++) {
    const tests = range(0, D).map((d) => freeTest(d, true));
    let best: { R: Rect; lo: number; hi: number; form: Form } | undefined;
    let bestScore = -Infinity;
    const cands: { R: Rect; lo: number; hi: number; form: Form; sc: number }[] = [];
    for (const [form, w, h] of [["lift", Math.max(3, D), 3], ["lift", 3, 3], ["ladder", 2, 2], ["ladder", 2, 1], ["ladder", 1, 2]] as [Form, number, number][]) {
      if (best) break;
      for (let y = 0; y + h <= B; y++) {
        for (let x = 0; x + w <= L; x++) {
          const R = { x, y, w, h };
          for (let d = 0; d < D; ) {
            if (!tests[d](R)) { d++; continue; }
            let e = d;
            while (e + 1 < D && tests[e + 1](R)) e++;
            const span = range(d, e + 1);
            const gain = together() ? e - d : new Set(span.map(find)).size - 1 || (wantLift && !lifts.length ? 0.5 : 0);
            if (e > d && gain > 0 && span.length <= w + 2 * h - 2 + (w > 2 ? 2 : 0)) {
              const nearBand = y + h === y0 || y === y0 + s ? 30 : 0;
              const onBand = y < y0 + s && y0 < y + h ? 600 : 0;
              const sc = gain * 1000 + (e - d) * 10 + nearBand - onBand - Math.abs(x + w / 2 - L / 2) * 0.2 - Math.abs(y + h / 2 - B / 2) * 0.1;
              cands.push({ R, lo: d, hi: e, form, sc });
              if (sc > bestScore) { bestScore = sc; best = { R, lo: d, hi: e, form }; }
            }
            d = e + 1;
          }
        }
      }
    }
    if (!best) break;
    {
      const whole = range(0, D).map((d) => pieces(d));
      const top = cands.sort((u, v) => v.sc - u.sc).slice(0, 24);
      const fine = top.find((c) => c.sc > bestScore - 500 && range(c.lo, c.hi + 1).every((d) => pieces(d, c.R) <= whole[d]));
      if (fine) best = fine;
    }
    const p = put({ key: key(best.lo, `lift${lifts.length}`), name: best.form === "lift" ? "Turbolift" : "Ladder", deck: best.lo, ...best.R, form: best.form, role: "lift", extra: { climb: { toward: "e", levels: best.hi - best.lo } } }, range(best.lo, best.hi + 1));
    lifts.push({ p, lo: best.lo, hi: best.hi });
    for (let d = best.lo + 1; d <= best.hi; d++) comp[find(d)] = find(best.lo);
  }
  // HOUSE RULE (dropped decks): a deck no stairwell, turbolift or ladder can join to the bottom one is dropped from the plan: that part of the hull is
  // machinery or void. What it held goes to the highest deck that is joined, and so does the bridge if the cockpit mark was on it (to the square under
  // the mark there, or the nearest inside square to it)
  const dropped = range(0, D).filter((d) => find(d) !== find(0));
  const joinedDecks = range(0, D).filter((d) => find(d) === find(0));
  const highest = joinedDecks[joinedDecks.length - 1];
  for (const d of dropped) {
    report?.push(`${hullName}: deck ${d + 1} dropped`);
    grid[d].fill(-1);
    queues[highest].push(...queues[d].filter((n) => !queues[highest].includes(n) || n === "Gunnery station"));
    pools[highest] = [...new Set([...pools[highest], ...pools[d]])];
    queues[d] = [];
  }
  let helmMark: HullMark = { deck: helmDeck, x: cm.x, y: cm.y };
  if (dropped.includes(helmDeck)) {
    const helmRoom = rooms[0];
    let best = { x: cm.x, y: cm.y, d: Infinity };
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) {
      if (at(highest, x, y) === -1 || !mains[highest]?.[y * L + x]) continue;
      const dd = Math.abs(x - cm.x) + Math.abs(y - cm.y);
      if (dd < best.d) best = { x, y, d: dd };
    }
    helmMark = { deck: highest, x: best.x, y: best.y };
    const R = findRect(highest, best.x, best.y, cw, ch, 1) ?? findRect(highest, best.x, best.y, [2, cw[1]], [2, ch[1]], 2) ?? findRect(highest, best.x, best.y, [1, cw[1]], [1, ch[1]], 2, (Q) => Q.w * Q.h >= 3) ?? findRect(highest, best.x, best.y, [1, cw[1]], [1, ch[1]], 8, (Q) => Q.w * Q.h >= 3);
    if (!R) return why(`no room for the bridge on deck ${highest + 1}`);
    Object.assign(helmRoom, { deck: highest, key: key(highest, "helm"), ...R });
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) grid[highest][y * L + x] = 1;
  }

  // ---- The passages: spines down the band and every `sd + s` squares across it
  const isWay = (p?: PRoom) => !!p && (p.role === "landing" || p.role === "flight");
  for (let d = 0; d < D; d++) {
    const bands = [0];
    for (let k = 1; y0 - k * (s + sd) >= 0; k++) bands.push(-k);
    for (let k = 1; y0 + k * (s + sd) + s <= B; k++) bands.push(k);
    let n = 0;
    for (const k of bands) {
      const y = y0 + k * (s + sd);
      const least = small ? 4 : k === 0 ? 2 : 6;
      for (let x = 0; x < L; ) {
        if (!rowsFree(d, x, y, s)) { x++; continue; }
        let e = x;
        while (e < L && rowsFree(d, e, y, s)) e++;
        if (e - x >= least) put({ key: key(d, `spine${n++}`), name: "Passage", deck: d, x, y, w: e - x, h: s, form: "corridor", role: "spine" });
        x = e;
      }
    }
  }

  // ---- How much each two rooms of a deck touch (squares of wall they share), the stairwells' parts left out
  const touches = (d: number) => {
    const m = new Map<string, number>();
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) {
      const a = at(d, x, y);
      if (a <= 0 || isWay(roomOf(a))) continue;
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        const b = at(d, nx, ny);
        if (b <= 0 || b === a || isWay(roomOf(b))) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return [...m.entries()].map(([k, n]) => { const [a, b] = k.split("|").map(Number); return { a, b, n }; });
  };

  // A passage carved through the free squares from one set of rooms to another, `wd` squares wide: its straight runs as rectangles
  const carve = (d: number, src: Set<number>, dst: Set<number>, wd: number): Rect[] | undefined => {
    const ok = (x: number, y: number) => { for (let j = 0; j < wd; j++) for (let i = 0; i < wd; i++) if (at(d, x + i, y + j) !== 0) return false; return true; };
    const meets = (x: number, y: number, set: Set<number>) => {
      for (let i = 0; i < wd; i++) if (set.has(at(d, x - 1, y + i)) || set.has(at(d, x + wd, y + i)) || set.has(at(d, x + i, y - 1)) || set.has(at(d, x + i, y + wd))) return true;
      return false;
    };
    // (a search over square, heading and the steps taken since the last turn: a one-square-wide passage turns only after two steps, so that every
    // straight piece of it has a square for each of its two doors)
    const least = wd === 1 ? 2 : 1;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const state = (c: number, dir: number, run: number) => (c * 5 + dir) * 3 + run;
    const prev = new Int32Array(L * B * 15).fill(-2);
    const queue: number[] = [];
    for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) if (ok(x, y) && meets(x, y, src)) { const st = state(y * L + x, 4, 0); prev[st] = -1; queue.push(st); }
    let goal = -1;
    for (let qi = 0; qi < queue.length && goal < 0; qi++) {
      const st = queue[qi];
      const run = st % 3;
      const dir = Math.floor(st / 3) % 5;
      const c = Math.floor(st / 15);
      const [x, y] = [c % L, Math.floor(c / L)];
      if (meets(x, y, dst) && (run >= least || (dir === 4 && wd > 1))) { goal = st; break; }
      for (let k = 0; k < 4; k++) {
        if (dir !== 4 && k !== dir && run < least) continue;
        const [nx, ny] = [x + DIRS[k][0], y + DIRS[k][1]];
        if (nx < 0 || ny < 0 || nx + wd > L || ny + wd > B || !ok(nx, ny)) continue;
        const ns = state(ny * L + nx, k, k === dir ? Math.min(2, run + 1) : 1);
        if (prev[ns] !== -2) continue;
        prev[ns] = st;
        queue.push(ns);
      }
    }
    if (goal < 0) return undefined;
    const chain: { x: number; y: number }[] = [];
    for (let st = goal; st >= 0; st = prev[st]) { const c = Math.floor(st / 15); chain.unshift({ x: c % L, y: Math.floor(c / L) }); }
    if (chain.length === 1) return [{ ...chain[0], w: wd, h: wd }];
    const out: Rect[] = [];
    for (let i = 0; i < chain.length - 1; ) {
      const [dx, dy] = [chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y];
      let j = i + 1;
      while (j + 1 < chain.length && chain[j + 1].x - chain[j].x === dx && chain[j + 1].y - chain[j].y === dy) j++;
      const [a, b] = [chain[i], chain[j]];
      if (!out.length) out.push({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + wd, h: Math.abs(a.y - b.y) + wd });
      else out.push(dx > 0 ? { x: a.x + wd, y: a.y, w: b.x - a.x, h: wd } : dx < 0 ? { x: b.x, y: a.y, w: a.x - b.x, h: wd } : dy > 0 ? { x: a.x, y: a.y + wd, w: wd, h: b.y - a.y } : { x: a.x, y: b.y, w: wd, h: a.y - b.y });
      i = j;
    }
    // (a path that crosses itself is not taken)
    const seen = new Set<number>();
    for (const R of out) for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) { if (seen.has(y * L + x) || at(d, x, y) !== 0) return undefined; seen.add(y * L + x); }
    return out;
  };
  // ---- Every room and passage of a deck joined to the rest: a passage carved from each part the spines do not reach
  for (let d = 0; d < D; d++) {
    const givenUp = new Set<number>();
    for (let guard = 0; guard < 24; guard++) {
      const ids = rooms.map((p, i) => [p, i + 1] as const).filter(([p]) => !isWay(p) && (p.deck === d || (p.role === "lift" && p.deck <= d && d <= p.deck + (p.extra?.climb?.levels ?? 0)))).map(([, i]) => i);
      if (ids.length < 2) break;
      const uf = new Map(ids.map((i) => [i, i]));
      const root = (i: number): number => (uf.get(i) === i ? i : root(uf.get(i)!));
      // (a lift is not a way along a deck: what stands either side of it is joined by a passage round it)
      const near = touches(d);
      for (const t of near) if (rooms[t.a - 1].role !== "lift" && rooms[t.b - 1].role !== "lift") uf.set(root(t.a), root(t.b));
      // (a lift that stands against a room of the deck opens onto it; one that stands alone has a passage carved to it)
      const against = new Set(near.flatMap((t) => [t.a, t.b]));
      const groups = new Map<number, number[]>();
      for (const i of ids) groups.set(root(i), [...(groups.get(root(i)) ?? []), i]);
      if (groups.size < 2) break;
      const area = (g: number[]) => g.reduce((a, i) => a + (rooms[i - 1].role === "spine" ? rooms[i - 1].w * rooms[i - 1].h * 10 : rooms[i - 1].w * rooms[i - 1].h), 0);
      const all = [...groups.values()].sort((p, q) => area(q) - area(p));
      const other = all.slice(1).find((g) => !givenUp.has(Math.min(...g)) && !g.every((i) => rooms[i - 1].role === "lift" && against.has(i)));
      if (!other) break;
      const main = new Set(all.filter((g) => g !== other).flat());
      const from = new Set(other);
      const path = carve(d, from, main, 2) ?? carve(d, from, main, 1);
      if (!path) { givenUp.add(Math.min(...other)); continue; }
      for (const R of path) put({ key: key(d, `way${rooms.length}`), name: "Passage", deck: d, ...R, form: "corridor", role: "spine" });
    }
  }

  // ---- The compartments: along the passages, then in the pockets left
  const cycle = range(0, D).map(() => 0);
  // (a name fits a room as long as its least width, and a hall's, eight squares or more, is not laid out less than five deep)
  const fits = (n: string, room: number, depth: number) => widthOf(n, scale)[0] <= room && (WIDTHS[n]?.[0] ?? 4) < 8 || (widthOf(n, scale)[0] <= room && depth >= 5);
  const take = (d: number, room: number, depth = 99): string => {
    const q = queues[d];
    const i = q.findIndex((n) => fits(n, room, depth));
    if (i >= 0) return q.splice(i, 1)[0];
    const pool = pools[d];
    for (let k = 0; k < pool.length; k++) {
      const n = pool[cycle[d]++ % pool.length];
      if (fits(n, room, depth)) return n;
    }
    return room <= 4 ? "Equipment locker" : pool[0] ?? "Cargo bay";
  };
  let closets = 0;
  const CLOSETS = ["Equipment locker", "Refresher", "Locker room"];
  for (let d = 0; d < D; d++) {
    const passages = rooms.filter((p) => p.deck === d && p.role === "spine").sort((p, q) => q.w * q.h - p.w * p.h);
    for (const C of passages) {
      const horiz = C.w >= C.h;
      const len = horiz ? C.w : C.h;
      if (len < 3) continue;
      for (const side of (horiz ? ["n", "s"] : ["w", "e"]) as Side[]) {
        const sq = (a: number, k: number) => (horiz ? { x: C.x + a, y: side === "n" ? C.y - 1 - k : C.y + C.h + k } : { x: side === "w" ? C.x - 1 - k : C.x + C.w + k, y: C.y + a });
        const dep = range(0, len).map((a) => { let k = 0; while (k < dcap && at(d, sq(a, k).x, sq(a, k).y) === 0) k++; return k; });
        for (let a = 0; a < len; ) {
          if (dep[a] < 2) { a++; continue; }
          let e = a;
          while (e < len && dep[e] >= 2) e++;
          const run = e - a;
          const name = take(d, run, Math.max(...dep.slice(a, e)));
          const [lo, hi] = widthOf(name, scale);
          let w = Math.min(lo, run);
          let bestArea = -1;
          for (let v = Math.min(lo, run); v <= Math.min(hi, run); v++) {
            const rest = run - v;
            const area = v * Math.min(...dep.slice(a, a + v)) * (rest > 0 && rest < 3 ? 0.6 : 1);
            if (area > bestArea) { bestArea = area; w = v; }
          }
          // (a stub of one or two squares left at the end of the run goes to the room)
          if (run - w > 0 && run - w < 3) w = run;
          const depth = Math.min(...dep.slice(a, a + w));
          const R = horiz ? { x: C.x + a, y: side === "n" ? C.y - depth : C.y + C.h, w, h: depth } : { x: side === "w" ? C.x - depth : C.x + C.w, y: C.y + a, w: depth, h: w };
          put({ key: key(d, `s${rooms.length}`), name, deck: d, ...R, role: "strip" });
          a += w;
        }
      }
    }
    // the pockets: the biggest rectangle at each free square beside a room, sharing two squares of wall with it at least
    const A = clamp(Math.round(9 * scale), 6, 16);
    for (const pass of [0, 1, 2, 3]) {
      let ok = freeTest(d);
      let placed = 0;
      for (let y = 0; y < B; y++) for (let x = 0; x < L; x++) {
        for (const side of ["n", "s", "w", "e"] as Side[]) {
          if (at(d, x, y) !== 0) break;
          const nid = at(d, x + OUT[side][0], y + OUT[side][1]);
          const nb = roomOf(nid);
          if (!nb || isWay(nb) || nb.role === "lift" || (pass === 0 && nb.form !== "corridor")) continue;
          let best: Rect | undefined;
          let bestA = 0;
          for (let ln = 2; ln <= A; ln++) for (let dp = 2; dp <= Math.min(A, dcap + 2) && dp <= ln * 4; dp++) {
            if (ln * dp <= bestA || ln > dp * 4) continue;
            for (let o = 0; o < ln; o++) {
              const R = side === "n" ? { x: x - o, y, w: ln, h: dp } : side === "s" ? { x: x - o, y: y - dp + 1, w: ln, h: dp } : side === "w" ? { x, y: y - o, w: dp, h: ln } : { x: x - dp + 1, y: y - o, w: dp, h: ln };
              if (!ok(R)) continue;
              let t = 0;
              for (let i = 0; i < ln; i++) {
                const [ex, ey] = side === "n" ? [R.x + i, R.y - 1] : side === "s" ? [R.x + i, R.y + R.h] : side === "w" ? [R.x - 1, R.y + i] : [R.x + R.w, R.y + i];
                if (at(d, ex, ey) === nid) t++;
              }
              if (t < 2) continue;
              bestA = ln * dp;
              best = R;
              break;
            }
          }
          if (!best) continue;
          const name = best.w * best.h < 9 ? CLOSETS[closets++ % CLOSETS.length] : take(d, Math.max(best.w, best.h), Math.min(best.w, best.h));
          put({ key: key(d, `p${rooms.length}`), name, deck: d, ...best, role: "zone" });
          ok = freeTest(d);
          placed++;
        }
      }
      if (!placed && pass > 0) break;
    }
  }
  // (a ship with guns has a gunnery station: a small compartment is given over to one if none was laid out)
  if (guns && !rooms.some((p) => p.name === "Gunnery station")) {
    const spare = rooms.filter((p) => !p.form && p.role !== "anchor" && p.w * p.h >= 6).sort((p, q) => p.w * p.h - q.w * q.h)[0];
    if (spare) spare.name = "Gunnery station";
  }

  // ---- Doors
  const joined = new Set<string>();
  // (a door takes a wall square of each room of its own: a narrow room, a passage one square wide, has room for few)
  const load = new Map<string, number>();
  const cap = (p: PRoom) => (p.w <= 2 || p.h <= 2 ? p.w * p.h : 2 * (p.w + p.h) - 4);
  // (the squares fixed doors take, room by room: `key:x,y` in the room's own squares)
  const usedSq = new Set<string>();
  // A door into a room one square wide is given its square here, one door to a square (where three passages meet at a square the third finds another way)
  const narrowDoor = (a: PRoom, b: PRoom): PDoor["at"] | null | undefined => {
    if (Math.min(a.w, a.h) > 1 && Math.min(b.w, b.h) > 1) return undefined;
    const opts: { a: { x: number; y: number; side: Side }; b: { x: number; y: number; side: Side }; mid: number }[] = [];
    if (a.x + a.w === b.x || b.x + b.w === a.x) {
      const east = a.x + a.w === b.x;
      const [lo, hi] = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)];
      for (let y = lo; y < hi; y++) opts.push({ a: { x: east ? a.w - 1 : 0, y: y - a.y, side: east ? "e" : "w" }, b: { x: east ? 0 : b.w - 1, y: y - b.y, side: east ? "w" : "e" }, mid: Math.abs(y + 0.5 - (lo + hi) / 2) });
    } else if (a.y + a.h === b.y || b.y + b.h === a.y) {
      const south = a.y + a.h === b.y;
      const [lo, hi] = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
      for (let x = lo; x < hi; x++) opts.push({ a: { x: x - a.x, y: south ? a.h - 1 : 0, side: south ? "s" : "n" }, b: { x: x - b.x, y: south ? 0 : b.h - 1, side: south ? "n" : "s" }, mid: Math.abs(x + 0.5 - (lo + hi) / 2) });
    }
    const o = opts.sort((u, v) => u.mid - v.mid).find((c) => !usedSq.has(`${a.key}:${c.a.x},${c.a.y}`) && !usedSq.has(`${b.key}:${c.b.x},${c.b.y}`));
    if (!o) return null;
    usedSq.add(`${a.key}:${o.a.x},${o.a.y}`);
    usedSq.add(`${b.key}:${o.b.x},${o.b.y}`);
    return { a: o.a, b: o.b };
  };
  const link = (a: PRoom, b: PRoom) => {
    const id = [a.key, b.key].sort().join("|");
    if (joined.has(id)) return true;
    if ((load.get(a.key) ?? 0) >= cap(a) || (load.get(b.key) ?? 0) >= cap(b)) return false;
    const fixed = a.deck === b.deck ? narrowDoor(a, b) : undefined;
    if (fixed === null) return false;
    joined.add(id);
    for (const k of [a.key, b.key]) load.set(k, (load.get(k) ?? 0) + 1);
    doors.push({ a: a.key, b: b.key, ...(fixed ? { at: fixed } : {}) });
    return true;
  };
  const corridor = (p: PRoom) => p.form === "corridor";
  // a lift: a door on each deck it serves, to a passage beside it there if it can (each in a square of its own)
  const fixedUsed = usedSq;
  for (const dd of doors) if (dd.at) { fixedUsed.add(`${dd.a}:${dd.at.a.x},${dd.at.a.y}`); fixedUsed.add(`${dd.b}:${dd.at.b.x},${dd.at.b.y}`); }
  // (the decks with the fewest squares to open onto choose first, so that each deck has one)
  for (const { p, lo, hi } of lifts) {
    const choices = range(lo, hi + 1).map((d) => {
      const opts: { q: PRoom; x: number; y: number; nx: number; ny: number; side: Side }[] = [];
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        for (const side of ["n", "s", "w", "e"] as Side[]) {
          const [nx, ny] = [x + OUT[side][0], y + OUT[side][1]];
          if (nx >= p.x && nx < p.x + p.w && ny >= p.y && ny < p.y + p.h) continue;
          const q = roomOf(at(d, nx, ny));
          if (q && !isWay(q) && q.role !== "lift") opts.push({ q, x, y, nx, ny, side });
        }
      }
      // (not at the end of a passage one square wide: that square is where it meets the next piece)
      const atEnd = (o: { q: PRoom; nx: number; ny: number }) => Math.min(o.q.w, o.q.h) === 1 && (o.q.w > o.q.h ? o.nx === o.q.x || o.nx === o.q.x + o.q.w - 1 : o.ny === o.q.y || o.ny === o.q.y + o.q.h - 1);
      opts.sort((u, v) => Number(atEnd(u)) - Number(atEnd(v)) || Number(!!v.q.entry) - Number(!!u.q.entry) || Number(corridor(v.q)) - Number(corridor(u.q)) || (u.q.key < v.q.key ? -1 : u.q.key > v.q.key ? 1 : 0) || u.y - v.y || u.x - v.x);
      return { d, opts };
    });
    // (then a door to every other passage beside it, the lift being the join of what it stands between)
    const opened = new Set<string>();
    for (const extra of [false, true]) {
      for (const { opts } of [...choices].sort((u, v) => u.opts.length - v.opts.length || u.d - v.d)) {
        for (const o of opts) {
          if (opened.has(o.q.key) || (extra && !corridor(o.q) && o.q.role !== "anchor") || fixedUsed.has(`${p.key}:${o.x - p.x},${o.y - p.y}`) || fixedUsed.has(`${o.q.key}:${o.nx - o.q.x},${o.ny - o.q.y}`)) continue;
          fixedUsed.add(`${p.key}:${o.x - p.x},${o.y - p.y}`);
          fixedUsed.add(`${o.q.key}:${o.nx - o.q.x},${o.ny - o.q.y}`);
          opened.add(o.q.key);
          doors.push({ a: p.key, b: o.q.key, at: { a: { x: o.x - p.x, y: o.y - p.y, side: o.side }, b: { x: o.nx - o.q.x, y: o.ny - o.q.y, side: OPP[o.side] } } });
          if (!extra) break;
        }
      }
    }
  }
  for (const dd of doors) for (const k of [dd.a, dd.b]) load.set(k, (load.get(k) ?? 0) + 1);

  const pairs = range(0, D).flatMap((d) => touches(d).map((t) => ({ ...t, d, A: rooms[t.a - 1], B: rooms[t.b - 1] }))).filter((t) => t.A.role !== "lift" && t.B.role !== "lift");
  // passages end to end
  for (const t of pairs) if (corridor(t.A) && corridor(t.B)) link(t.A, t.B);
  // a room onto the passage it touches most (and a second it touches along three squares)
  for (const p of rooms) {
    if (p.form || p.role === "lift") continue;
    const near = pairs.filter((t) => (t.A === p && corridor(t.B)) || (t.B === p && corridor(t.A))).map((t) => ({ q: t.A === p ? t.B : t.A, n: t.n })).sort((u, v) => v.n - u.n || (u.q.key < v.q.key ? -1 : 1));
    if (near[0]) link(p, near[0].q);
    if (near[1] && near[1].n >= 3) link(p, near[1].q);
  }
  const entryKey = key(0, "entry");
  const reach = () => {
    const next = new Map<string, string[]>();
    for (const dd of doors) { next.set(dd.a, [...(next.get(dd.a) ?? []), dd.b]); next.set(dd.b, [...(next.get(dd.b) ?? []), dd.a]); }
    const seen = new Set([entryKey]);
    const queue = [entryKey];
    while (queue.length) for (const o of next.get(queue.pop()!) ?? []) if (!seen.has(o)) { seen.add(o); queue.push(o); }
    return seen;
  };
  // the rest: a room the passages do not reach opens onto a neighbour that is reached
  for (let guard = 0; guard < 60; guard++) {
    const seen = reach();
    let added = false;
    for (const t of [...pairs].sort((u, v) => v.n - u.n)) {
      if (seen.has(t.A.key) === seen.has(t.B.key)) continue;
      if (!link(t.A, t.B)) continue;
      seen.add(t.A.key);
      seen.add(t.B.key);
      added = true;
    }
    if (!added) break;
  }
  // some rooms side by side are joined too, so that the decks are not trees
  for (const t of pairs) if (!t.A.form && !t.B.form && t.n >= 3 && t.A.role !== "anchor" && t.B.role !== "anchor" && r.chance(0.25)) link(t.A, t.B);
  // a room nothing reaches is left out (the hull keeps the space: a void, ducts and frames)
  const seen = reach();
  // (for a look at a plan that failed: the rooms, doors and what was reached ride on the caller's report)
  if (report) Object.assign(report, { rooms, doors, seen });
  // (a helm nothing reaches: the plan is made again with it in its deck's body, under the mark; if that is not reached either and the deck is above
  // the bottom one and the deck under it is reached, the deck is dropped)
  if (retry && !seen.has(rooms[0].key) && !toBody) {
    report?.push(`${hullName}: the helm on deck ${rooms[0].deck + 1} cannot be reached at the mark; it goes to the deck's body`);
    return planFromHull(ship, seed, hull, hullName, report, forced, true);
  }
  if (retry && !seen.has(rooms[0].key) && rooms[0].deck > 0 && forced.length < D - 1 && rooms.some((p) => p.deck === rooms[0].deck - 1 && p.key !== entryKey && seen.has(p.key))) {
    report?.push(`${hullName}: the helm on deck ${rooms[0].deck + 1} cannot be reached; that deck is dropped`);
    return planFromHull(ship, seed, hull, hullName, report, [...forced, rooms[0].deck], true);
  }
  if (rooms.some((p) => p.role === "anchor" && p.name !== engineName && !seen.has(p.key))) return why("anchor " + rooms.filter((p) => p.role === "anchor" && !seen.has(p.key)).map((p) => p.name).join());
  const kept = rooms.filter((p) => seen.has(p.key));
  const keys = new Set(kept.map((p) => p.key));
  // (a deck whose rooms nothing reaches, its way up cut off inside it, is dropped too)
  for (let d = 0; d < D; d++) if (!dropped.includes(d) && !kept.some((p) => p.deck === d)) { dropped.push(d); report?.push(`${hullName}: deck ${d + 1} dropped (nothing on it is reached)`); }
  dropped.sort((p, q) => p - q);
  // (an engine room nothing reaches is given up: another compartment, if there is one, is the engine room)
  if (!kept.some((p) => p.name === engineName)) {
    const spare = kept.filter((p) => !p.form && p.role !== "anchor" && p.w * p.h >= (small ? 2 : 9)).sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (spare) spare.name = engineName;
  }
  const frame: Frame = { L, B, D, n: 1, s, sw: 0, bw: 0, blocks };
  return { frame, faction, rooms: kept, doors: doors.filter((dd) => keys.has(dd.a) && keys.has(dd.b)), entry: entryKey, hull, hullName, dropped, helmMark };
}

// The plan of a ship: its hull's if the kit measured one that holds it, else the frame of its size (`given`: a hull to use instead, for the tests)
export function planInterior(ship: ShipSpec, seed: number, given?: { name: string; hull: HullPlan }): InteriorPlan {
  const name = given?.name ?? hullNameOf(ship);
  const hull = given ? given.hull : HULLS[name];
  return (hull && planFromHull(ship, seed, hull, name)) || planFrame(ship, seed);
}
export function planShuttle(ship: ShipSpec, seed = 0, given?: { name: string; hull: HullPlan }): InteriorPlan {
  const name = given?.name ?? hullNameOf(ship);
  const hull = given ? given.hull : HULLS[name];
  return (hull && planFromHull(ship, seed, hull, name)) || planFrameShuttle(ship);
}

// ---- Making the rooms ----------------------------------------------------------------------------------------------------------------------
const STATION = "station:";
// Puts a piece in a room if it has none by that name: on the first square (or block of squares) that leaves the floor whole, nearest the middle of a wall
function ensure(room: Area, name: string, w = 1, h = 1) {
  const l = room.layout!;
  if (l.assets.some((a) => a.name === name)) return;
  const spots: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y + h <= l.height; y++) for (let x = 0; x + w <= l.width; x++) {
    const rim = Math.min(x, y, l.width - x - w, l.height - y - h);
    spots.push({ x, y, d: rim * 100 + Math.abs(x + w / 2 - l.width / 2) + Math.abs(y + h / 2 - l.height / 2) });
  }
  for (const spot of spots.sort((p, q) => p.d - q.d)) {
    if (!standsAt(l, spot.x, spot.y) || l.assets.some((o) => o.x < spot.x + w && spot.x < o.x + o.w && o.y < spot.y + h && spot.y < o.y + o.h)) continue;
    l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind: "furniture", name, x: spot.x, y: spot.y, w, h, blocks: true });
    if (!floorFaults(l)) return;
    l.assets.pop();
  }
}
const STATION_OF: Record<string, string> = { "Pilot's seat": "helm", "Co-pilot's seat": "copilot", "Navigation console": "nav", "Gunnery seat": "guns" };

// The squares along a wall that two rooms share, as the first room's own and then the second's
function sharedWall(la: RoomLayout, lb: RoomLayout): { side: Side; lo: number; hi: number } | undefined {
  const [fa, fb] = [floorsOf(la), floorsOf(lb)];
  if (!(fa[0] <= fb[1] && fb[0] <= fa[1])) return undefined;
  if (la.x + la.width === lb.x || lb.x + lb.width === la.x) {
    const lo = Math.max(la.y, lb.y);
    const hi = Math.min(la.y + la.height, lb.y + lb.height) - 1;
    if (lo <= hi) return { side: la.x + la.width === lb.x ? "e" : "w", lo, hi };
  }
  if (la.y + la.height === lb.y || lb.y + lb.height === la.y) {
    const lo = Math.max(la.x, lb.x);
    const hi = Math.min(la.x + la.width, lb.x + lb.width) - 1;
    if (lo <= hi) return { side: la.y + la.height === lb.y ? "s" : "n", lo, hi };
  }
  return undefined;
}
const OPP: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

export interface BuiltInterior { rooms: Area[]; paths: Path[]; entryId: string; seats: { id: string; station: string }[] }

// The plan as areas of a building: `idOf` names a room (the boarding room has the id the rest of the game knows), `pathId` a passage
export function buildInterior(ship: ShipSpec, plan: InteriorPlan, buildingId: string, entryId: string, seed: number): BuiltInterior {
  const r = createRandom(seed + 977);
  const { frame } = plan;
  const areas = new Map<string, Area>();
  const ids = new Map<string, string>();
  let count = 0;
  const sorted = [...plan.rooms].sort((p, q) => p.deck - q.deck || p.y - q.y || p.x - q.x);
  const isForm = (p: PRoom) => !!p.form;
  for (const p of sorted) ids.set(p.key, p.entry ? entryId : `${buildingId}-r${++count}`);
  for (const p of sorted) {
    const id = ids.get(p.key)!;
    const part = p.x + p.w / 2 < frame.L * 0.34 ? "aft" : p.x + p.w / 2 > frame.L * 0.66 ? "forward" : "amidships";
    const side = p.y + p.h / 2 < frame.B * 0.4 ? "port side" : p.y + p.h / 2 > frame.B * 0.6 ? "starboard side" : "centre line";
    const layout: RoomLayout = {
      x: p.x, y: p.y, width: p.w, height: p.h, assets: [],
      ...(p.deck ? { level: p.deck } : {}),
      ...(p.form ? { form: p.form } : {}),
      ...(p.extra ?? {}),
    };
    // (a stairwell's rooms say which junction it stands against, as a building's stair block says its host: `block:` is the id of the junction on the bottom deck)
    const block = (t: string) => (t.startsWith("block:") ? `block:${ids.get(`d0-junction${t.slice(6)}`)}` : t);
    areas.set(p.key, {
      id, kind: "room", parentId: buildingId, name: p.name, type: p.entry ? "deck" : p.name.toLowerCase(),
      description: `Deck ${p.deck + 1}, ${part}, ${side}.`,
      tags: [`ship:${ship.id}`, `deck:${p.deck}`, ...(p.form ? [`form:${p.form}`, `low:${p.deck}`, `rise:${p.extra?.climb?.levels ?? 0}`] : []), ...(p.tags ?? []).map(block)],
      position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], layout,
    } as Area);
  }
  const paths: Path[] = [];
  const give = (a: Area, spec: Omit<RoomAsset, "id">) => { a.layout!.assets.push({ ...spec, id: `${a.id}-${a.layout!.assets.length + 1}` }); };
  const nPath = (() => { let n = 0; return () => `${buildingId}-p${++n}`; })();
  // A door between two rooms in a wall they share: the nearest free square to the middle of it
  const doorBetween = (A: PRoom, Bq: PRoom, seam: boolean, fixed?: PDoor["at"]) => {
    const a = areas.get(A.key)!;
    const b = areas.get(Bq.key)!;
    const path: Path = { id: nPath(), from: a.id, to: b.id, kind: "door", label: seam ? "Stairwell" : "Hatch", travel: "10 ft." };
    if (fixed) {
      // (a fixed door on the square the boarding ramp took: the ramp gives way, and is put in again beside it)
      for (const [l, sq] of [[a.layout!, fixed.a], [b.layout!, fixed.b]] as const) {
        const i = l.assets.findIndex((o) => o.ref === `${STATION}ramp` && o.x === sq.x && o.y === sq.y);
        if (i >= 0) { l.assets.splice(i, 1); rampPut = false; }
      }
      give(a, { kind: "door", name: path.label, x: fixed.a.x, y: fixed.a.y, w: 1, h: 1, side: fixed.a.side, ref: path.id, to: b.id, ...(seam ? { seam: true } : {}) });
      give(b, { kind: "door", name: path.label, x: fixed.b.x, y: fixed.b.y, w: 1, h: 1, side: fixed.b.side, ref: path.id, to: a.id, ...(seam ? { seam: true } : {}) });
      paths.push(path);
      return true;
    }
    const wall = sharedWall(a.layout!, b.layout!);
    if (!wall) return false;
    const [la, lb] = [a.layout!, b.layout!];
    const vertical = wall.side === "e" || wall.side === "w";
    const middle = Math.floor((wall.lo + wall.hi) / 2);
    let strict = true;
    // (in a hull's narrow joins the boarding ramp gives way to a door, and is put in again beside it)
    const isRamp = (o: RoomAsset) => !strict && o.ref === `${STATION}ramp`;
    const free = (l: RoomLayout, sq: { x: number; y: number }, side: Side) => standsAt(l, sq.x, sq.y) && !l.assets.some((o) => !isRamp(o) && o.x <= sq.x && sq.x < o.x + o.w && o.y <= sq.y && sq.y < o.y + o.h) &&
      // (and not beside a door already in the same wall: two doors side by side are one wide gap; a hull's narrow joins take one where there is no other square)
      (!strict || !l.assets.some((o) => o.kind === "door" && o.side === side && Math.abs(o.x - sq.x) + Math.abs(o.y - sq.y) <= 1));
    for (const pass of plan.hull ? [true, false] : [true])
    for (let d = 0; d <= wall.hi - wall.lo && ((strict = pass), true); d++) {
      for (const c of d ? [middle - d, middle + d] : [middle]) {
        if (c < wall.lo || c > wall.hi) continue;
        const sa = wallSquare(la, wall.side, c - (vertical ? la.y : la.x));
        const sb = wallSquare(lb, OPP[wall.side], c - (vertical ? lb.y : lb.x));
        if (!free(la, sa, wall.side) || !free(lb, sb, OPP[wall.side])) continue;
        for (const [l, sq] of [[la, sa], [lb, sb]] as const) {
          const i = l.assets.findIndex((o) => o.ref === `${STATION}ramp` && o.x === sq.x && o.y === sq.y);
          if (i >= 0) { l.assets.splice(i, 1); rampPut = false; }
        }
        give(a, { kind: "door", name: path.label, x: sa.x, y: sa.y, w: 1, h: 1, side: wall.side, ref: path.id, to: b.id, ...(seam ? { seam: true } : {}) });
        give(b, { kind: "door", name: path.label, x: sb.x, y: sb.y, w: 1, h: 1, side: OPP[wall.side], ref: path.id, to: a.id, ...(seam ? { seam: true } : {}) });
        paths.push(path);
        return true;
      }
    }
    return false;
  };
  const planned = new Map(plan.rooms.map((p) => [p.key, p]));
  const hull = plan.hull;
  const clear = (l: RoomLayout, x: number, y: number) => x >= 0 && y >= 0 && x < l.width && y < l.height && standsAt(l, x, y) && !l.assets.some((o) => o.x <= x && x < o.x + o.w && o.y <= y && y < o.y + o.h);
  // (a hull's boarding ramp is where the hull opens: on the ramp mark, put in before the doors so that they keep clear of it)
  let rampPut = false;
  const placeRamp = () => {
    if (!hull) return;
    const p = planned.get(plan.entry)!;
    const room = areas.get(plan.entry)!;
    const l = room.layout!;
    const m = hull.ramp;
    const mx = clamp(m.x - p.x, 0, p.w - 1);
    const my = clamp(m.y - p.y, 0, p.h - 1);
    const side = m.side && m.side !== "down" ? m.side : undefined;
    const along: [number, number][] = side === "n" || side === "s" ? [[0, 0], [-1, 0], [1, 0]] : side ? [[0, 0], [0, -1], [0, 1]] : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    // (in a room too narrow to step round it, the ramp is a hatch in the floor one walks over: it does not block)
    for (const [dx, dy] of along) {
      for (const blocks of [true, false]) {
        const [x, y] = [mx + dx, my + dy];
        if (rampPut || !clear(l, x, y) || l.assets.some((o) => o.kind === "door" && o.x === x && o.y === y)) continue;
        give(room, { kind: "furniture", name: "Boarding ramp", x, y, w: 1, h: 1, ...(blocks ? { blocks: true } : {}), ref: `${STATION}ramp`, cover: false, ...(side ? { side } : {}) });
        if (floorFaults(l)) { l.assets.pop(); continue; }
        rampPut = true;
      }
    }
  };
  placeRamp();
  // the stairwells' doors first (their squares are fixed), then the rest
  for (const dd of plan.doors.filter((q) => q.at)) doorBetween(planned.get(dd.a)!, planned.get(dd.b)!, !!dd.seam, dd.at);
  for (const dd of plan.doors.filter((q) => !q.at)) doorBetween(planned.get(dd.a)!, planned.get(dd.b)!, false);
  // (a hull's plan: a room whose planned door found no square in its wall opens onto another neighbour that is reached; one that cannot is left out)
  if (hull) {
    const reached = () => {
      const next = new Map<string, string[]>();
      for (const p of paths) { next.set(p.from, [...(next.get(p.from) ?? []), p.to]); next.set(p.to, [...(next.get(p.to) ?? []), p.from]); }
      const seen = new Set([entryId]);
      const queue = [entryId];
      while (queue.length) for (const o of next.get(queue.pop()!) ?? []) if (!seen.has(o)) { seen.add(o); queue.push(o); }
      return seen;
    };
    // (a lift stands beside the rooms of every deck it serves, and is mended like a room)
    const span = (p: PRoom): [number, number] => [p.deck, p.deck + (p.role === "lift" ? p.extra?.climb?.levels ?? 0 : 0)];
    const beside = (p: PRoom, q: PRoom) => span(p)[0] <= span(q)[1] && span(q)[0] <= span(p)[1] && ((p.x + p.w === q.x || q.x + q.w === p.x) ? spanOverlap(p.y, p.y + p.h, q.y, q.y + q.h) > 0 : (p.y + p.h === q.y || q.y + q.h === p.y) && spanOverlap(p.x, p.x + p.w, q.x, q.x + q.w) > 0);
    const walkable = (q: PRoom) => q.role !== "flight" && q.role !== "landing";
    for (let guard = 0; guard < 400; guard++) {
      const seen = reached();
      const lost = sorted.filter((p) => !seen.has(ids.get(p.key)!) && walkable(p));
      if (!lost.length) break;
      let mended = false;
      for (const p of lost) {
        const by = sorted.filter((q) => q !== p && walkable(q) && seen.has(ids.get(q.key)!) && beside(p, q)).sort((u, v) => Number(!!v.form) - Number(!!u.form));
        if (by.some((q) => doorBetween(p, q, false))) { mended = true; seen.add(ids.get(p.key)!); }
      }
      if (!mended) break;
    }
    const seen = reached();
    for (const p of sorted) {
      if (seen.has(ids.get(p.key)!) || p.entry) continue;
      const id = ids.get(p.key)!;
      areas.delete(p.key);
      for (let i = paths.length - 1; i >= 0; i--) if (paths[i].from === id || paths[i].to === id) paths.splice(i, 1);
      for (const a of areas.values()) a.layout!.assets = a.layout!.assets.filter((x) => x.to !== id);
    }
    for (let i = sorted.length - 1; i >= 0; i--) if (!areas.has(sorted[i].key)) sorted.splice(i, 1);
  }

  // ---- Windows: the bridge looks out at the bow, the rest have a porthole or two on the hull
  const w = (p: PRoom) => areas.get(p.key)!;
  // (a hull's glass is where the kit put it: a window on a room's wall at each window mark, a viewport if the room is the bridge or the cockpit)
  if (hull) {
    for (const m of hull.windows) {
      const side = m.side;
      if (!side || side === "down") continue;
      const p = sorted.find((q) => !isForm(q) && q.deck === m.deck && q.x <= m.x && m.x < q.x + q.w && q.y <= m.y && m.y < q.y + q.h);
      if (!p) continue;
      const onWall = side === "n" ? m.y === p.y : side === "s" ? m.y === p.y + p.h - 1 : side === "w" ? m.x === p.x : m.x === p.x + p.w - 1;
      if (!onWall) continue;
      const a = w(p);
      const l = a.layout!;
      const [x, y] = [m.x - p.x, m.y - p.y];
      if (!clear(l, x, y) || l.assets.some((o) => (o.kind === "door" || o.kind === "window") && Math.abs(o.x - x) + Math.abs(o.y - y) <= (o.kind === "door" ? 1 : 0))) continue;
      const big = /^(bridge|cockpit)$/i.test(p.name);
      const pane = big ? { size: "wide" as const, latch: "locked" as const, dc: 20 } : { size: "small" as const, latch: "locked" as const, dc: 15 };
      give(a, { kind: "window", name: big ? "Viewport" : "Porthole", x, y, w: 1, h: 1, side, pane, to: buildingId });
    }
  }
  for (const p of hull ? [] : sorted) {
    if (isForm(p) || !p.edge?.length) continue;
    const a = w(p);
    const l = a.layout!;
    const sides = p.edge.filter((e) => (e === "e" ? p.x + p.w === frame.L : e === "w" ? p.x === 0 : e === "n" ? p.y === 0 : p.y + p.h === frame.B));
    const big = /^(bridge|cockpit)$/.test(p.name);
    for (const side of big ? (["e"] as Side[]) : sides) {
      const length = side === "n" || side === "s" ? l.width : l.height;
      if (length < 3) continue;
      const wanted = big ? Math.max(1, Math.floor(length / 3)) : r.chance(0.55) ? 1 : 0;
      for (let i = 0; i < wanted; i++) {
        const along = big ? Math.round(((i + 0.5) * length) / wanted - 0.5) : 1 + r.int(0, Math.max(0, length - 3));
        const sq = wallSquare(l, side, clamp(along, 0, length - 1));
        const inside = { x: sq.x + (side === "e" ? -1 : side === "w" ? 1 : 0), y: sq.y + (side === "s" ? -1 : side === "n" ? 1 : 0) };
        if (!standsAt(l, sq.x, sq.y) || l.assets.some((o) => o.x <= sq.x && sq.x < o.x + o.w && o.y <= sq.y && sq.y < o.y + o.h) || l.assets.some((o) => o.kind === "door" && Math.abs(o.x - sq.x) + Math.abs(o.y - sq.y) <= 1)) continue;
        void inside;
        const pane = big ? { size: "wide" as const, latch: "locked" as const, dc: 20 } : { size: "small" as const, latch: "locked" as const, dc: 15 };
        give(a, { kind: "window", name: big ? "Viewport" : "Porthole", x: sq.x, y: sq.y, w: 1, h: 1, side, pane, to: buildingId });
      }
    }
  }

  // ---- The boarding ramp: in the room of the bottom deck that stands at the hull, on a wall that is the hull's
  const entryPlan = planned.get(plan.entry)!;
  const entryRoom = areas.get(plan.entry)!;
  if (hull && !rampPut) placeRamp();
  if (hull && !rampPut) {
    // (no square at the mark would take it: the nearest one that leaves the floor whole)
    const l = entryRoom.layout!;
    const m = hull.ramp;
    const spots: { x: number; y: number; d: number }[] = [];
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) spots.push({ x, y, d: Math.abs(entryPlan.x + x - m.x) + Math.abs(entryPlan.y + y - m.y) });
    for (const sq of spots.sort((p, q) => p.d - q.d)) {
      if (!clear(l, sq.x, sq.y) || l.assets.some((o) => o.kind === "door" && Math.abs(o.x - sq.x) + Math.abs(o.y - sq.y) <= 1)) continue;
      give(entryRoom, { kind: "furniture", name: "Boarding ramp", x: sq.x, y: sq.y, w: 1, h: 1, blocks: true, ref: `${STATION}ramp`, cover: false });
      if (floorFaults(l)) { l.assets.pop(); continue; }
      break;
    }
  }
  if (!hull) {
    const l = entryRoom.layout!;
    const order = (entryPlan.edge ?? []).filter((e) => (e === "e" ? entryPlan.x + entryPlan.w === frame.L : e === "w" ? entryPlan.x === 0 : e === "n" ? entryPlan.y === 0 : entryPlan.y + entryPlan.h === frame.B));
    const sides = [...order.filter((e) => e !== "e"), ...order.filter((e) => e === "e")];
    let put = false;
    for (const side of sides) {
      const length = side === "n" || side === "s" ? l.width : l.height;
      const middle = Math.floor(length / 2);
      for (let d = 0; d < length && !put; d++) {
        for (const c of d ? [middle - d, middle + d] : [middle]) {
          if (c < 0 || c >= length) continue;
          const sq = wallSquare(l, side, c);
          if (!standsAt(l, sq.x, sq.y) || l.assets.some((o) => o.x <= sq.x && sq.x < o.x + o.w && o.y <= sq.y && sq.y < o.y + o.h) || l.assets.some((o) => o.kind === "door" && Math.abs(o.x - sq.x) + Math.abs(o.y - sq.y) <= 1)) continue;
          give(entryRoom, { kind: "furniture", name: "Boarding ramp", x: sq.x, y: sq.y, w: 1, h: 1, blocks: true, ref: `${STATION}ramp`, cover: false });
          if (floorFaults(l)) { l.assets.pop(); continue; }
          put = true;
          break;
        }
      }
      if (put) break;
    }
  }

  // ---- Furniture, then the stations: a big room has its furnishings twice or three times over
  const seats: { id: string; station: string }[] = [];
  const taken: Record<string, number> = {};
  const limit: Record<string, number> = { helm: 1, copilot: 1, nav: 1, engines: 1, guns: GUNS[ship.size] ?? 1 };
  const claim = (station: string) => ((taken[station] = (taken[station] ?? 0) + 1) <= (limit[station] ?? 1));
  for (const p of sorted) {
    if (isForm(p)) continue;
    const room = areas.get(p.key)!;
    const area = p.w * p.h;
    if (HANGARS.test(p.name)) parkFighters(room, plan.faction);
    const copies = clamp(Math.round(area / 70), 1, 3);
    // (a cramped hull's nooks keep their floor for the stations)
    if (!hull || area > 8) for (let i = 0; i < copies; i++) furnishRoom(room, r, "starship");
    if (p.name === "Bridge") ensure(room, "Viewscreen", 3, 1);
    // (a station the plan could not place by chance is put in by hand, on the first square that leaves the floor whole)
    if (p.name === "Cockpit" || p.name === "Bridge") for (const name of ["Pilot's seat", "Co-pilot's seat", "Navigation console"]) ensure(room, name);
    if (p.name === "Engine room") ensure(room, "Reactor core", 2, 2);
    if (p.name === "Engine bay") ensure(room, "Power coupling");
    if (p.name === "Gunnery station") ensure(room, "Gunnery seat");
    for (const a of room.layout!.assets) {
      if (a.kind !== "furniture" || a.ref) continue;
      const station = STATION_OF[a.name] ?? (a.name === "Reactor core" && p.name === "Engine room" ? "engines" : a.name === "Power coupling" && p.name === "Engine bay" ? "engines" : undefined);
      if (!station) continue;
      if (!claim(station)) {
        // (a seat the ship has no use for stays a seat nobody is seated at: a plain piece of furniture)
        continue;
      }
      a.ref = `${STATION}${station}`;
      if (station === "helm" || station === "copilot") a.cover = false;
      seats.push({ id: a.id, station });
    }
  }
  // (HOUSE RULE, a cramped hull: a station its rooms had no place for is fitted where there is floor, the cockpit first, then the hold: a gunner's seat
  // in the cockpit, a power coupling for the engineer beside the ramp)
  if (hull) {
    const wanted: [string, string][] = [["helm", "Pilot's seat"], ["copilot", "Co-pilot's seat"], ["nav", "Navigation console"], ["guns", "Gunnery seat"], ["engines", "Power coupling"]];
    const order = [...sorted.filter((p) => /^(cockpit|bridge)$/i.test(p.name)), ...sorted.filter((p) => p.entry), ...sorted.filter((p) => !p.form && !p.entry && !/^(cockpit|bridge)$/i.test(p.name))];
    for (const [station, name] of wanted) {
      if (ship.size === "Small" && (station === "copilot" || station === "nav" || station === "guns")) continue;
      if (seats.some((x) => x.station === station)) continue;
      for (const p of order) {
        const room = areas.get(p.key);
        if (!room) continue;
        const before = room.layout!.assets.length;
        // (a room with that piece already is passed over: ensure puts one of a name in a room)
        if (room.layout!.assets.some((a) => a.name === name)) continue;
        ensure(room, name);
        if (room.layout!.assets.length === before) {
          // (no square leaves the floor whole: a seat one can stand at, that does not block)
          const l = room.layout!;
          let put = false;
          for (let y = 0; y < l.height && !put; y++) for (let x = 0; x < l.width && !put; x++) {
            if (!clear(l, x, y)) continue;
            l.assets.push({ id: `${room.id}-${l.assets.length + 1}`, kind: "furniture", name, x, y, w: 1, h: 1 });
            put = true;
          }
          if (!put) continue;
        }
        const a = room.layout!.assets[room.layout!.assets.length - 1];
        a.ref = `${STATION}${station}`;
        if (station === "helm" || station === "copilot") a.cover = false;
        seats.push({ id: a.id, station });
        break;
      }
    }
  }
  return { rooms: [...areas.values()], paths, entryId, seats };
}

// ---- A Small shuttle: three compartments end to end (the engines, the cabin with the boarding ramp, the cockpit) -----------------------------------
const SHUTTLE = { L: 11, B: 7 };
export function planFrameShuttle(ship: ShipSpec): InteriorPlan {
  const faction = shipFactionOf(ship.owner);
  const frame: Frame = { L: SHUTTLE.L, B: SHUTTLE.B, D: 1, n: 1, s: 0, sw: 3, bw: 3, blocks: 0 };
  const rooms: PRoom[] = [
    { key: "d0-stern", name: "Engine bay", deck: 0, x: 0, y: 0, w: 3, h: 7, role: "zone", edge: ["w", "n", "s"] },
    { key: "d0-cabin", name: faction === "imperial" || faction === "republic" ? "Troop bay" : "Passenger cabin", deck: 0, x: 3, y: 0, w: 5, h: 7, role: "strip", edge: ["n", "s"], entry: true },
    { key: "d0-bow", name: "Cockpit", deck: 0, x: 8, y: 0, w: 3, h: 7, role: "zone", edge: ["e", "n", "s"] },
  ];
  return { frame, faction, rooms, doors: [{ a: "d0-stern", b: "d0-cabin" }, { a: "d0-cabin", b: "d0-bow" }], entry: "d0-cabin" };
}

// ---- The interior of a ship as areas and passages, ready to be put in a world ---------------------------------------------------------------------
export function shipInteriorOf(ship: ShipSpec, buildingId: string, entryId: string, seed: number, given?: { name: string; hull: HullPlan }): BuiltInterior & { plan: InteriorPlan } {
  const plan = ship.size === "Small" ? planShuttle(ship, seed, given) : planInterior(ship, seed, given);
  return { ...buildInterior(ship, plan, buildingId, entryId, seed), plan };
}
