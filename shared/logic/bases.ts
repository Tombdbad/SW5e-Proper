// Bases (2026-10-26, asked by the user: "start with deploying tents at a location / claiming the hideout of defeated enemies, set down
// chests and other storage, add items to this storage and have it persist; we will extend the base building mechanic in future"). The
// books have no rules for building a base: everything here is a house rule, labelled where the game shows it. A leaf module (no game
// state but the world it is handed), like gear.ts: index.ts re-exports it, GameBoard plays it and the 3D map draws it.
//
// A base is kept in the world (`world.bases`), so it stays where it was set up for as long as the campaign lasts. It is a camp (pitched
// anywhere the party stands, with a tent or a shelter) or a site (a hostile building the party has cleared and claimed). What stands in
// it are pieces, each of a type in PIECE_TYPES: a shelter to sleep in, storage to leave things in. To add a kind of piece later (a
// workbench, a turret, a light, a wall, a bed, a garden), add a role and a type and, if it does something, a line where that role is read
// (`piecesWith`); how it is drawn is its `look` in the map's asset library (siteAssets.tsx `BasePieceModel`).

export type BaseKind = "camp" | "site";
// What a piece is for. New roles go here (and where they are read: `piecesWith`)
export type PieceRole = "shelter" | "storage";
export type PiecePlace = "outdoors" | "indoors";

export interface PieceType {
  id: string;
  name: string;
  role: PieceRole;
  // The squares it covers (along x and y before it is turned)
  w: number;
  h: number;
  // What it holds, in pounds (storage)
  lb?: number;
  // How it is drawn (siteAssets.tsx BASE_LOOKS)
  look: string;
  // Where it may be set down
  places: PiecePlace[];
  // Minutes to set it up (and as long to take it down)
  minutes: number;
  // What it gives the base: a shelter to sleep in, beds (people it shelters)
  shelter?: boolean;
  beds?: number;
}

// The piece types made from an item of the rules data: the item is taken from the pack when the piece is set down, and goes back to the
// pack when it is taken down. The capacity of storage is the item's own ("A chest stores 300 lb."), read by `containerOf` in gear.ts.
const ITEM_PIECES: { pattern: RegExp; type: Omit<PieceType, "id" | "name" | "lb"> }[] = [
  { pattern: /^tent\b/i, type: { role: "shelter", w: 2, h: 2, look: "tent", places: ["outdoors"], minutes: 10, shelter: true, beds: 2 } },
  { pattern: /^emergency shelter$/i, type: { role: "shelter", w: 2, h: 2, look: "dome", places: ["outdoors", "indoors"], minutes: 1, shelter: true, beds: 4 } },
  { pattern: /^chest$/i, type: { role: "storage", w: 1, h: 1, look: "chest", places: ["outdoors", "indoors"], minutes: 1 } },
  { pattern: /^crate$/i, type: { role: "storage", w: 1, h: 1, look: "crate", places: ["outdoors", "indoors"], minutes: 1 } },
  { pattern: /^(footlocker|trunk|locker)\b/i, type: { role: "storage", w: 1, h: 1, look: "locker", places: ["outdoors", "indoors"], minutes: 1 } },
];
// What a crate holds in pounds: the book gives it in cubic feet (4) and gallons; 4 cubic feet of mixed gear is about 200 lb (house rule)
const CRATE_LB = 200;

// The piece an item can be set down as, if any (`lb` is what `containerOf` reads from the item's text)
export function pieceTypeOf(item: { name: string; lb?: number }): PieceType | undefined {
  const hit = ITEM_PIECES.find((p) => p.pattern.test(item.name));
  if (!hit) return undefined;
  const lb = hit.type.role === "storage" ? item.lb ?? (/^crate$/i.test(item.name) ? CRATE_LB : 100) : undefined;
  return { ...hit.type, id: `item:${item.name}`, name: item.name, ...(lb ? { lb } : {}) };
}

export interface BasePiece {
  id: string;
  // The type's id (`item:Chest`), and the item it was made from (given back when it is taken down)
  type: string;
  item?: string;
  name: string;
  role: PieceRole;
  look: string;
  // Where it stands: the area it was set down in (a building, when out in front of it, or a room), and its square on that map (the
  // party's squares: a district's grid, or a building's), its size and which way it faces (quarter turns)
  areaId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  face: number;
  lb?: number;
  shelter?: boolean;
  beds?: number;
  // What is kept in it (storage): item names, one entry each, as a character's equipment is
  items: string[];
  placedAt: number;
}

export interface Base {
  id: string;
  name: string;
  kind: BaseKind;
  // The building the base is at (a camp: the building the party stood in front of or in; a site: the building claimed)
  areaId: string;
  // The settlement it is in (to find it from anywhere in the settlement)
  settlementId?: string;
  founded: number;
  pieces: BasePiece[];
}

export type WorldWithBases = { bases?: Base[]; counter: number };
const copyOf = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const nextId = (world: WorldWithBases, prefix: string) => `${prefix}${++world.counter}`;

export const basesOf = (world: WorldWithBases): Base[] => world.bases ?? [];
// The base at a building (the building itself, or the building a room is in)
export const baseAt = (world: WorldWithBases, buildingId: string): Base | undefined => basesOf(world).find((b) => b.areaId === buildingId);
// Every piece set down in the given areas (a building and its rooms), with the base it belongs to
export const piecesIn = (world: WorldWithBases, areaIds: Set<string>): { base: Base; piece: BasePiece }[] =>
  basesOf(world).flatMap((base) => base.pieces.filter((p) => areaIds.has(p.areaId)).map((piece) => ({ base, piece })));
// The pieces of a role in a base (what a shelter, storage or a future workbench is read by)
export const piecesWith = (base: Base | undefined, role: PieceRole): BasePiece[] => (base?.pieces ?? []).filter((p) => p.role === role);
// The squares a piece covers, turned
export function squaresOf(p: Pick<BasePiece, "x" | "y" | "w" | "h" | "face">): { x: number; y: number }[] {
  const [w, h] = p.face % 2 ? [p.h, p.w] : [p.w, p.h];
  const out: { x: number; y: number }[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push({ x: p.x + i, y: p.y + j });
  return out;
}

export interface BaseResult<T = undefined> {
  world: WorldWithBases;
  error?: string;
  made?: T;
}

// A camp where the party stands: a base with nothing in it yet, at the building the party is in or in front of. There is one base to a
// building; setting down a piece where there is none founds a camp first (`setDown` does it)
export function foundBase<W extends WorldWithBases>(world: W, o: { areaId: string; settlementId?: string; name?: string; kind?: BaseKind; minute: number }): BaseResult<Base> & { world: W } {
  const have = baseAt(world, o.areaId);
  if (have) return { world, made: have };
  const next = copyOf(world);
  const base: Base = { id: nextId(next, "base"), name: o.name ?? (o.kind === "site" ? "Claimed hideout" : "Camp"), kind: o.kind ?? "camp", areaId: o.areaId, settlementId: o.settlementId, founded: o.minute, pieces: [] };
  next.bases = [...basesOf(next), base];
  return { world: next, made: base };
}

// A cleared hostile site taken for the party's own (whether it may be is `claimableSite` in index.ts, which knows the buildings)
export function claimBase<W extends WorldWithBases>(world: W, o: { areaId: string; settlementId?: string; name: string; minute: number }): BaseResult<Base> & { world: W } {
  const have = baseAt(world, o.areaId);
  if (have?.kind === "site") return { world, error: "It is yours already." };
  if (have) {
    const next = copyOf(world);
    const base = next.bases!.find((b) => b.id === have.id)!;
    Object.assign(base, { kind: "site", name: o.name });
    return { world: next, made: base };
  }
  return foundBase(world, { ...o, kind: "site" });
}

// Set a piece down on the given square (the map has checked the squares are free and open): the base at the building is founded if
// there is none. The caller takes the item from the pack.
export function setDown<W extends WorldWithBases>(world: W, o: { buildingId: string; settlementId?: string; type: PieceType; item?: string; areaId: string; x: number; y: number; face?: number; place: PiecePlace; minute: number }): BaseResult<BasePiece> & { world: W } {
  if (!o.type.places.includes(o.place)) return { world, error: `A ${o.type.name.toLowerCase()} is set up ${o.type.places.join(" or ")} only.` };
  const founded = foundBase(world, { areaId: o.buildingId, settlementId: o.settlementId, minute: o.minute });
  const next = founded.world;
  const base = next.bases!.find((b) => b.id === founded.made!.id)!;
  const piece: BasePiece = {
    id: nextId(next, "piece"),
    type: o.type.id,
    item: o.item,
    name: o.type.name,
    role: o.type.role,
    look: o.type.look,
    areaId: o.areaId,
    x: o.x,
    y: o.y,
    w: o.type.w,
    h: o.type.h,
    face: o.face ?? 0,
    ...(o.type.lb ? { lb: o.type.lb } : {}),
    ...(o.type.shelter ? { shelter: true, beds: o.type.beds } : {}),
    items: [],
    placedAt: o.minute,
  };
  // The squares must not be another piece's
  const mine = new Set(squaresOf(piece).map((q) => `${q.x},${q.y}`));
  if (base.pieces.some((p) => p.areaId === piece.areaId && squaresOf(p).some((q) => mine.has(`${q.x},${q.y}`)))) return { world, error: "Something stands there already." };
  base.pieces.push(piece);
  return { world: next, made: piece };
}

// Take a piece down: what is kept in it and the item it was made from come back to the caller (for the pack). An empty camp is gone with
// its last piece; a claimed site stays the party's.
export function takeDown<W extends WorldWithBases>(world: W, pieceId: string): BaseResult<{ item?: string; items: string[] }> & { world: W } {
  const next = copyOf(world);
  const base = basesOf(next).find((b) => b.pieces.some((p) => p.id === pieceId));
  if (!base) return { world, error: "That is not there any more." };
  const piece = base.pieces.find((p) => p.id === pieceId)!;
  base.pieces = base.pieces.filter((p) => p.id !== pieceId);
  if (!base.pieces.length && base.kind === "camp") next.bases = basesOf(next).filter((b) => b.id !== base.id);
  return { world: next, made: { item: piece.item, items: piece.items } };
}

// How much a piece holds now, by a weight for each item name
export const storedPounds = (piece: Pick<BasePiece, "items">, pounds: (name: string) => number) => Math.round(piece.items.reduce((n, name) => n + pounds(name), 0) * 10) / 10;

// Put things in storage, as far as it has room: what did not fit comes back in `made.left`
export function store<W extends WorldWithBases>(world: W, pieceId: string, names: string[], pounds: (name: string) => number): BaseResult<{ stored: string[]; left: string[] }> & { world: W } {
  const next = copyOf(world);
  const piece = basesOf(next).flatMap((b) => b.pieces).find((p) => p.id === pieceId);
  if (!piece) return { world, error: "That is not there any more." };
  if (piece.role !== "storage") return { world, error: `Nothing can be kept in the ${piece.name.toLowerCase()}.` };
  let room = (piece.lb ?? Infinity) - storedPounds(piece, pounds);
  const stored: string[] = [];
  const left: string[] = [];
  for (const name of names) {
    const w = pounds(name);
    if (w <= room + 1e-9) {
      piece.items.push(name);
      stored.push(name);
      room -= w;
    } else left.push(name);
  }
  if (!stored.length) return { world, error: `The ${piece.name.toLowerCase()} is full (${piece.lb} lb).`, made: { stored, left } };
  return { world: next, made: { stored, left } };
}

// Take things out of storage (one of each name asked for, as far as there are)
export function unstore<W extends WorldWithBases>(world: W, pieceId: string, names: string[]): BaseResult<{ taken: string[] }> & { world: W } {
  const next = copyOf(world);
  const piece = basesOf(next).flatMap((b) => b.pieces).find((p) => p.id === pieceId);
  if (!piece) return { world, error: "That is not there any more." };
  const taken: string[] = [];
  for (const name of names) {
    const at = piece.items.indexOf(name);
    if (at < 0) continue;
    piece.items.splice(at, 1);
    taken.push(name);
  }
  return { world: next, made: { taken } };
}

// Rename a base
export function renameBase<W extends WorldWithBases>(world: W, baseId: string, name: string): BaseResult & { world: W } {
  if (!name.trim()) return { world, error: "A name is needed." };
  const next = copyOf(world);
  const base = basesOf(next).find((b) => b.id === baseId);
  if (!base) return { world, error: "There is no such base." };
  base.name = name.trim();
  return { world: next };
}
