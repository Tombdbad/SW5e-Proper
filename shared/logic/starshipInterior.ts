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
// Pure: the same ship and seed give the same ship. tests/ships/interior.test.ts walks every size, role and faction.
import {
  createRandom, floorFaults, floorsOf, furnishRoom, stairBlock, standsAt, wallSquare,
  type Area, type Form, type Path, type RoomAsset, type RoomLayout, type Side,
} from "./index";

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
  role?: "spine" | "junction" | "zone" | "strip" | "cap" | "landing" | "flight";
  // a strip or zone room that borders the hull: which of its sides
  edge?: Side[];
  extra?: Partial<RoomLayout>;
  tags?: string[];
  entry?: boolean;
}
interface PDoor { a: string; b: string; seam?: boolean; at?: { a: { x: number; y: number; side: Side }; b: { x: number; y: number; side: Side } } }
export interface InteriorPlan { frame: Frame; faction: ShipFaction; rooms: PRoom[]; doors: PDoor[]; entry: string }

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

export function planInterior(ship: ShipSpec, seed: number): InteriorPlan {
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
      tags: [`ship:${ship.id}`, `deck:${p.deck}`, ...(p.form ? [`form:${p.form}`, `low:${p.deck}`, `rise:${p.role === "flight" ? 1 : 0}`] : []), ...(p.tags ?? []).map(block)],
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
    const free = (l: RoomLayout, sq: { x: number; y: number }, side: Side) => standsAt(l, sq.x, sq.y) && !l.assets.some((o) => o.x <= sq.x && sq.x < o.x + o.w && o.y <= sq.y && sq.y < o.y + o.h) &&
      // (and not beside a door already in the same wall: two doors side by side are one wide gap)
      !l.assets.some((o) => o.kind === "door" && o.side === side && Math.abs(o.x - sq.x) + Math.abs(o.y - sq.y) <= 1);
    for (let d = 0; d <= wall.hi - wall.lo; d++) {
      for (const c of d ? [middle - d, middle + d] : [middle]) {
        if (c < wall.lo || c > wall.hi) continue;
        const sa = wallSquare(la, wall.side, c - (vertical ? la.y : la.x));
        const sb = wallSquare(lb, OPP[wall.side], c - (vertical ? lb.y : lb.x));
        if (!free(la, sa, wall.side) || !free(lb, sb, OPP[wall.side])) continue;
        give(a, { kind: "door", name: path.label, x: sa.x, y: sa.y, w: 1, h: 1, side: wall.side, ref: path.id, to: b.id, ...(seam ? { seam: true } : {}) });
        give(b, { kind: "door", name: path.label, x: sb.x, y: sb.y, w: 1, h: 1, side: OPP[wall.side], ref: path.id, to: a.id, ...(seam ? { seam: true } : {}) });
        paths.push(path);
        return true;
      }
    }
    return false;
  };
  const planned = new Map(plan.rooms.map((p) => [p.key, p]));
  // the stairwells' doors first (their squares are fixed), then the rest
  for (const dd of plan.doors.filter((q) => q.at)) doorBetween(planned.get(dd.a)!, planned.get(dd.b)!, !!dd.seam, dd.at);
  for (const dd of plan.doors.filter((q) => !q.at)) doorBetween(planned.get(dd.a)!, planned.get(dd.b)!, false);

  // ---- Windows: the bridge looks out at the bow, the rest have a porthole or two on the hull
  const w = (p: PRoom) => areas.get(p.key)!;
  for (const p of sorted) {
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
  {
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
    const copies = clamp(Math.round(area / 70), 1, 3);
    for (let i = 0; i < copies; i++) furnishRoom(room, r, "starship");
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
  return { rooms: [...areas.values()], paths, entryId, seats };
}

// ---- A Small shuttle: three compartments end to end (the engines, the cabin with the boarding ramp, the cockpit) -----------------------------------
const SHUTTLE = { L: 11, B: 7 };
export function planShuttle(ship: ShipSpec): InteriorPlan {
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
export function shipInteriorOf(ship: ShipSpec, buildingId: string, entryId: string, seed: number): BuiltInterior & { plan: InteriorPlan } {
  const plan = ship.size === "Small" ? planShuttle(ship) : planInterior(ship, seed);
  return { ...buildInterior(ship, plan, buildingId, entryId, seed), plan };
}
