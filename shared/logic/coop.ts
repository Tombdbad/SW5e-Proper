// Co-op (2026-10-29; the user: up to four players on the local network, each walking the settlement alone or together, the party
// travelling between settlements, planets and systems as one through a "room" that every member joins, then picks a craft and a role).
// Pure rules and data shapes shared by the server (server/coop.ts, which owns a session) and the client (lib/coop.ts, which shows it).
//
// What a session is: one campaign, up to MAX_PLAYERS members, each with a character of their own and a place of their own in the
// campaign's world. The campaign (world, clock, ships, speeders, quests) is shared: every change a client makes is sent as a patch
// (`diffJson`) and applied by the server and by every other client (`applyChanges`), so Play itself stays the code it was.

export const MAX_PLAYERS = 4;

// ---------------------------------------------------------------------------------------------
// Patches: the difference between two versions of a JSON value, as a list of paths to set or delete
// ---------------------------------------------------------------------------------------------

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Path = (string | number)[];
export interface Op {
  p: Path;
  // the new value; absent with `d`
  v?: unknown;
  // delete the key at the path
  d?: 1;
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((k) => k in b && sameJson(a[k], b[k]));
  }
  return false;
}

// The operations that turn `base` into `next`. Objects are compared key by key; an array of the same length is compared item by item (a
// player's change to one occupant is one small op, not the room), a longer or shorter one is set whole.
export function diffJson(base: unknown, next: unknown, path: Path = [], out: Op[] = []): Op[] {
  if (base === next) return out;
  if (isObject(base) && isObject(next)) {
    for (const key of Object.keys(next)) {
      if (!(key in base)) out.push({ p: [...path, key], v: next[key] });
      else diffJson(base[key], next[key], [...path, key], out);
    }
    for (const key of Object.keys(base)) if (!(key in next)) out.push({ p: [...path, key], d: 1 });
    return out;
  }
  if (Array.isArray(base) && Array.isArray(next) && base.length === next.length) {
    next.forEach((item, i) => diffJson(base[i], item, [...path, i], out));
    return out;
  }
  if (!sameJson(base, next)) out.push({ p: path, v: next });
  return out;
}

// The value with the operations applied. Nothing is changed in place: only the objects on a path are copied, so that what did not change
// keeps its identity (React and the query cache see only what moved). An operation whose parent is not there (someone else removed it) is skipped.
export function applyOps<T>(root: T, ops: Op[]): T {
  let out: any = root;
  for (const op of ops) out = applyOne(out, op.p, op);
  return out;
}

function applyOne(node: any, path: Path, op: Op): any {
  if (!path.length) return op.d ? undefined : op.v;
  const [key, ...rest] = path;
  if (Array.isArray(node)) {
    if (typeof key !== "number" || key < 0 || key > node.length) return node;
    if (rest.length && key >= node.length) return node;
    const child = applyOne(node[key], rest, op);
    if (child === node[key] && key < node.length) return node;
    const copy = node.slice();
    copy[key] = child;
    return copy;
  }
  if (isObject(node)) {
    if (rest.length && !(key in node)) return node;
    const k = String(key);
    if (!rest.length && op.d) {
      if (!(k in node)) return node;
      const { [k]: _gone, ...others } = node;
      return others;
    }
    const child = applyOne(node[k], rest, op);
    if (child === node[k] && k in node) return node;
    return { ...node, [k]: child };
  }
  return node;
}

// What a client sends for a save: for each campaign field it changed, the operations from the version everyone last agreed on
export type Changes = Record<string, Op[]>;

// Fields that are each player's own, never shared: where the party is (every member has a place) is kept by the session
export const PERSONAL = ["currentLocation"] as const;

export function changesBetween(base: Record<string, unknown>, next: Record<string, unknown>): Changes {
  const out: Changes = {};
  for (const key of Object.keys(next)) {
    if ((PERSONAL as readonly string[]).includes(key)) continue;
    const ops = diffJson(base?.[key], next[key]);
    if (ops.length) out[key] = ops;
  }
  return out;
}

// A campaign with the changes applied. Time never runs backward (every client keeps the clock, and the one who travels moves it on): the
// shared clock is the later of the two.
export function applyChanges<T extends Record<string, any>>(campaign: T, changes: Changes): T {
  let out: any = campaign;
  for (const [key, ops] of Object.entries(changes)) {
    // (a top-level op at path [] replaces the field)
    const before = out?.[key];
    let after = applyOps(before, ops);
    if (key === "timeElapsed" && Number(before?.total) > Number(after?.total)) after = before;
    if (after !== before) out = { ...out, [key]: after };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

// What the others need to draw a member's follower: who it is and what it looks like (the rest of a companion is its owner's)
export interface Pet { id: string; name: string; kind: string; hp: number; role?: string; species?: string; creature?: string; size?: string; statBlock?: string }
export function cleanPets(list: unknown): Pet[] {
  if (!Array.isArray(list)) return [];
  const text = (v: unknown, n = 60) => (typeof v === "string" && v ? v.slice(0, n) : undefined);
  return list.slice(0, 12).filter((p) => p && typeof p === "object").map((p: any) => ({
    id: String(p.id ?? "").slice(0, 60), name: String(p.name ?? "").slice(0, 60), kind: String(p.kind ?? "").slice(0, 20), hp: Number(p.hp) || 0,
    role: text(p.role), species: text(p.species), creature: text(p.creature), size: text(p.size, 20), statBlock: text(p.statBlock),
  })).filter((p) => p.id);
}
export interface CoopMember {
  // the character's id as text: a character is in a session once
  id: string;
  characterId: number;
  // the player's name for the character
  name: string;
  // where this member is in the world (an area id)
  areaId: string;
  connected: boolean;
  host?: boolean;
  color: string;
  // The companions and beasts that follow this member (a character's own: shown on the others' screens, walking behind them)
  pets?: Pet[];
}

export const MEMBER_COLORS = ["#38bdf8", "#f472b6", "#a3e635", "#fbbf24"];

// The code a friend types: four letters, none that look like another
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function makeCode(random: () => number = Math.random, taken: (code: string) => boolean = () => false): string {
  for (let tries = 0; tries < 200; tries++) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
    if (!taken(code)) return code;
  }
  return "ZZZZ";
}

// ---------------------------------------------------------------------------------------------
// Travel as a party (the "room")
// ---------------------------------------------------------------------------------------------
// Walking about a settlement is each member's own. Leaving it (to another settlement, a planet's orbit, another system) is the party's:
// whoever sets out opens a room, every member joins, then each chooses a craft and a role, and when all are ready the crafts go.
//
// House rules (the books give no rule for a party split over several vehicles or ships; labelled on screen): a craft with several seats
// has one pilot, and the others are gunners or passengers; a ship's helm can be backed by a co-pilot, a navigator and an engineer, one
// each, and up to three gunners. Whoever pilots flies the trip (the road, the jump) on their own screen; the rest of the craft's crew
// rides with them and arrives when they do. A member who goes alone (on foot, a hired ride, a passage on a liner) travels on their own.

export type CraftKind = "ship" | "vehicle" | "solo";

export interface Craft {
  id: string;
  kind: CraftKind;
  label: string;
  // seats (a solo way has no limit)
  seats: number;
  // the ride (ground) this craft is, as Play's `ridesFor` names it
  rideId?: string;
  // the party ship it is, and the id of its main deck (the crew of a ship that is flown from its helm board by it)
  shipId?: string;
  deck?: string;
  // why it cannot be taken just now
  blocked?: string;
}

export interface Seat {
  craft: string;
  role: string;
}

export type RoomPhase = "gather" | "crew" | "underway";

export interface TravelRoom {
  id: number;
  // the member who set out
  by: string;
  // where from and to (area ids), and what the way is called
  from: string;
  to: string;
  title: string;
  // the exit as Play named it (opaque here; each pilot's Play takes the trip with it)
  exit: unknown;
  ship: boolean;
  // set out from the helm of a ship the member is aboard: a ship's crew goes aboard its deck and stays there while it flies (else they
  // arrive at the destination like any rider)
  aboard: boolean;
  // the ships (craft ids) whose crews have boarded
  boarded: string[];
  crafts: Craft[];
  // members who pressed Join (in the gather phase), the choices made, and who is ready
  joined: string[];
  seats: Record<string, Seat>;
  ready: string[];
  phase: RoomPhase;
  // underway: the units (a craft with crew, or a member alone) that have not arrived yet, by their leader's member id
  pending: string[];
}

export const VEHICLE_ROLES = ["pilot", "gunner", "passenger"];
export const SHIP_ROLES = ["pilot", "co-pilot", "navigator", "engineer", "gunner", "passenger"];
export const SOLO_ROLE = "alone";
// Most of one ship role aboard (a ship has one helm, one navigation console, one engineering station and up to three gunnery seats)
export const ROLE_LIMIT: Record<string, number> = { pilot: 1, "co-pilot": 1, navigator: 1, engineer: 1, gunner: 3 };

export const rolesOf = (craft: Craft): string[] => (craft.kind === "ship" ? SHIP_ROLES : craft.kind === "vehicle" ? VEHICLE_ROLES : [SOLO_ROLE]);

// The seat a member takes by default: the first way that can be used, as its pilot if nobody else is
export function defaultSeat(room: Pick<TravelRoom, "crafts" | "seats">, member: string): Seat | undefined {
  const open = room.crafts.find((c) => !c.blocked && c.kind !== "solo" && Object.values(room.seats).filter((s) => s.craft === c.id).length < c.seats);
  const solo = room.crafts.find((c) => !c.blocked && c.kind === "solo");
  const craft = open ?? solo;
  if (!craft) return undefined;
  if (craft.kind === "solo") return { craft: craft.id, role: SOLO_ROLE };
  const piloted = Object.entries(room.seats).some(([m, s]) => m !== member && s.craft === craft.id && s.role === "pilot");
  return { craft: craft.id, role: piloted ? "passenger" : "pilot" };
}

// What is wrong with the crews as they stand (empty when the room can go): a list of plain sentences, naming the craft
export function crewIssues(room: Pick<TravelRoom, "crafts" | "seats" | "joined">): string[] {
  const issues: string[] = [];
  for (const member of room.joined) {
    const seat = room.seats[member];
    const craft = seat && room.crafts.find((c) => c.id === seat.craft);
    if (!seat || !craft) issues.push(`${member} has not chosen a craft`);
    else if (craft.blocked) issues.push(`${craft.label} cannot be used: ${craft.blocked}`);
    else if (!rolesOf(craft).includes(seat.role)) issues.push(`${craft.label} has no ${seat.role} seat`);
  }
  for (const craft of room.crafts) {
    if (craft.kind === "solo") continue;
    const crew = Object.entries(room.seats).filter(([m, s]) => s.craft === craft.id && room.joined.includes(m));
    if (!crew.length) continue;
    if (crew.length > craft.seats) issues.push(`${craft.label} seats ${craft.seats}, with ${crew.length} aboard`);
    const count = (role: string) => crew.filter(([, s]) => s.role === role).length;
    if (count("pilot") === 0) issues.push(`${craft.label} needs a pilot`);
    for (const [role, limit] of Object.entries(ROLE_LIMIT)) if (count(role) > limit) issues.push(`${craft.label} has ${count(role)} ${role}s (most ${limit})`);
    // (a craft's pilot takes one of its seats; the guns and the back seats take the rest)
    if (craft.kind === "vehicle" && count("gunner") > Math.max(1, craft.seats - 1)) issues.push(`${craft.label} has no seat for ${count("gunner")} gunners`);
  }
  return issues;
}

// The units that travel: each craft with crew (led by its pilot) and each member alone. Keyed by the leader's member id.
export function unitsOf(room: Pick<TravelRoom, "crafts" | "seats" | "joined">): { leader: string; craft: string; crew: string[] }[] {
  const units: { leader: string; craft: string; crew: string[] }[] = [];
  for (const craft of room.crafts) {
    const crew = room.joined.filter((m) => room.seats[m]?.craft === craft.id);
    if (!crew.length) continue;
    if (craft.kind === "solo") for (const m of crew) units.push({ leader: m, craft: craft.id, crew: [m] });
    else units.push({ leader: crew.find((m) => room.seats[m].role === "pilot") ?? crew[0], craft: craft.id, crew });
  }
  return units;
}

// The room as it stands once the member is gone (they left the session mid-journey): off the lists, their crew without a pilot
// handed over to the first aboard
export function withoutMember(room: TravelRoom, member: string): TravelRoom {
  const seats = { ...room.seats };
  delete seats[member];
  return {
    ...room,
    joined: room.joined.filter((m) => m !== member),
    ready: room.ready.filter((m) => m !== member),
    pending: room.pending.filter((m) => m !== member),
    seats,
  };
}

// Seats on a ship (house rule: the books give a ship a crew, not seats for visitors): a Tiny ship is a fighter with one, a Small one has
// two, anything bigger takes the whole party
export const shipSeats = (size: string): number => (/^tiny$/i.test(size) ? 1 : /^small$/i.test(size) ? 2 : MAX_PLAYERS);

// A group move is one that leaves the settlement or the planet: a way that needs a ship, or a road of kilometres. A street, a door or a stair is the member's own.
export function isGroupExit(exit: { needsShip?: boolean; travel?: string }): boolean {
  if (exit.needsShip) return true;
  const km = (exit.travel ?? "").match(/(\d+(?:\.\d+)?)\s*km\b/i);
  return !!km && Number(km[1]) > 0;
}
