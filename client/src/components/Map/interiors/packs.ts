// Which converted packs furnish and wall a room (2026-10-19). A room is dressed from the packs of one style, never from two
// styles: its pieces (furniture, machines, walls) are all turned into the style's palette (tones.ts) when they load, so a room
// reads as one place whichever kit a piece came from. A piece the style lacks (a couch in the station kit) is drawn by the code
// as before. Pure: tests/interiors/packs.test.ts.

export interface Pack {
  // The palette in shared/art/tones.json the style's pieces are turned into; `world` takes its ramp from the colour of the
  // walls on the world the place stands on (a frontier room on a desert is dust, on ice slate)
  tone: string;
  world?: boolean;
  // Whether the room's straight walls are the Space Station Kit's (the frontier's are plain stone, adobe, timber)
  walls?: boolean;
  // Furniture by the name `ROOM_PLANS` gives it: the file under /assets (without ".glb")
  pieces: Record<string, string>;
}

const SPACE = "kenney-space";
const STATION = "kenney-station";
const FURNITURE = "kenney-furniture";
const CONSOLES = Object.fromEntries(["Console", "Monitoring console", "Guard console", "Navigation console", "Terminal", "Data terminal", "Information terminal", "Desk"].map((n) => [n, `${SPACE}/desk_computer`]));

export const PACKS = {
  // Dignitaries: the Space Station Kit's walls and furniture in the Imperial palette (blue-greys and white, crimson trim), with
  // a sofa and a low table from the Furniture Kit (the station kit has neither)
  station: {
    tone: "imperial",
    walls: true,
    pieces: { Bed: `${STATION}/bed-double`, Table: `${STATION}/table`, "Low table": `${FURNITURE}/tableCoffeeSquare`, Couch: `${FURNITURE}/loungeSofa`, Cabinet: `${STATION}/container-tall`, Chair: `${STATION}/chair-armrest-headrest` },
  },
  // Servants and residents: the Furniture Kit in the frontier palette drawn from the world's walls (dust, rust and sand)
  furniture: {
    tone: "frontier",
    world: true,
    pieces: { Bed: `${FURNITURE}/bedSingle`, Couch: `${FURNITURE}/loungeSofa`, "Low table": `${FURNITURE}/tableCoffeeSquare`, Table: `${FURNITURE}/table`, Cabinet: `${FURNITURE}/cabinetBedDrawer`, Bunk: `${FURNITURE}/bedBunk` },
  },
  // Workshops, depots and hangars: station walls and the Space Kit's machines in steel with hazard yellow
  industrial: {
    tone: "industrial",
    walls: true,
    pieces: {
      ...CONSOLES,
      "Reactor core": `${SPACE}/machine_generatorLarge`,
      "Coolant tank": `${SPACE}/machine_barrelLarge`,
      "Water tank": `${SPACE}/machine_barrelLarge`,
      "Parts bin": `${SPACE}/barrels`,
      "Cooling unit": `${SPACE}/machine_wireless`,
      "Sensor mast": `${SPACE}/satelliteDish`,
      "Antenna mast": `${SPACE}/satelliteDish`,
      "Vent stack": `${SPACE}/chimney`,
      "Pipe run": `${SPACE}/pipe_straight`,
      "Command chair": `${SPACE}/desk_chair`,
      Workbench: `${STATION}/table-large`,
      "Tool cart": `${STATION}/table-inset-small`,
      Locker: `${STATION}/container-tall`,
      Footlocker: `${STATION}/container`,
    },
  },
  // Garrisons, barracks and guard posts: olive drab with amber
  military: {
    tone: "military",
    walls: true,
    pieces: { ...CONSOLES, Bunk: `${FURNITURE}/bedBunk`, Footlocker: `${STATION}/container`, Locker: `${STATION}/container-tall`, "Mess table": `${STATION}/table`, "Command chair": `${SPACE}/desk_chair`, "Sensor mast": `${SPACE}/satelliteDish`, "Parts bin": `${SPACE}/barrels` },
  },
  // Medcentres and apothecaries: white and teal with red marks
  medical: {
    tone: "medical",
    walls: true,
    pieces: { "Medical bed": `${STATION}/bed-single`, "Supply cabinet": `${STATION}/container-tall`, "Instrument cart": `${STATION}/table-inset-small`, "Bacta tank": `${SPACE}/machine_barrelLarge`, ...CONSOLES },
  },
  // Ships and stations: the Space Station Kit as its makers drew it, in gunmetal blue with orange
  hull: {
    tone: "hull",
    walls: true,
    pieces: { ...CONSOLES, "Command chair": `${SPACE}/desk_chair`, Bunk: `${FURNITURE}/bedBunk`, Locker: `${STATION}/container-tall`, Footlocker: `${STATION}/container`, "Reactor core": `${SPACE}/machine_generatorLarge`, "Coolant tank": `${SPACE}/machine_barrelLarge` },
  },
  // Hideouts and camps: dark rust and crimson, no station walls (a raider's camp is rock and canvas)
  criminal: {
    tone: "criminal",
    pieces: { Bed: `${FURNITURE}/bedSingle`, Couch: `${FURNITURE}/loungeSofa`, "Low table": `${FURNITURE}/tableCoffeeSquare`, Table: `${FURNITURE}/table`, Cabinet: `${FURNITURE}/cabinetBedDrawer`, "Parts bin": `${SPACE}/barrels` },
  },
} satisfies Record<string, Pack>;

export type PackId = keyof typeof PACKS;
export const hasWalls = (id: PackId): boolean => !!(PACKS[id] as Pack).walls;

// Which pack a room is furnished from: first by the room's own name (a palace's servants live like servants), then by the
// kind of building. The first rule that matches decides; none is the code's own furniture and plain walls.
const ROOMS: [RegExp, PackId][] = [
  [/bedchambers|guest rooms|palatial suite|audience|dignitary|grand hall|^hall$/i, "station"],
  [/servants|quarters|apartments|tenement|residence|booth|\bden\b|rooming/i, "furniture"],
];
const BUILDINGS: [RegExp, PackId][] = [
  [/^(palace|estates|manor house|royal hangar)$/, "station"],
  [/^(starship|station|space station|docking ring|habitat ring|transit hub)$/, "hull"],
  [/^(garrison|command post|operations center|guardhouse|gatehouse|city gate|town gate)$/, "military"],
  [/^(medcenter|apothecary)$/, "medical"],
  [/^(workshop|engineering|warehouse|cargo bay|cargo hangar|refuelling depot|junkyard|scrap dealer|tech shop|shipyard|spaceport|public hangar|private hangar|droid dealer|vehicle dealer)$/, "industrial"],
  [/^(residences|tenements|rooming house)$/, "furniture"],
];

export function packOf(roomName: string, buildingType = ""): PackId | undefined {
  const building = buildingType.toLowerCase();
  // A hideout's den is a raider's, not a resident's
  if (/^(hideout|camp)$/.test(building)) return "criminal";
  const byRoom = ROOMS.find(([match]) => match.test(roomName))?.[1];
  if (byRoom) return byRoom;
  return BUILDINGS.find(([match]) => match.test(building))?.[1];
}

// The file of a piece in a room's pack (a path under /assets), or undefined where the pack has none
export function pieceOf(pack: PackId | undefined, name: string): string | undefined {
  if (!pack) return undefined;
  const file = (PACKS[pack].pieces as Record<string, string>)[name];
  return file ? `/assets/${file}.glb` : undefined;
}

// ---------------------------------------------------------------------------------------------
// Setting a piece on its footprint
// ---------------------------------------------------------------------------------------------

// How tall a piece may stand, in squares (a square is a little under two metres); the rest are chest high
const TALL: [RegExp, number][] = [[/reactor core/i, 2], [/mast|chimney|vent stack/i, 2.2], [/tank/i, 1.5], [/locker|cabinet|bookcase/i, 1.3], [/bed|bunk|couch|table|bench|desk|workbench/i, 0.6], [/console|terminal/i, 0.9]];
export const maxHeightOf = (name: string) => TALL.find(([m]) => m.test(name))?.[1] ?? 1;
// Pieces that are drawn longer to fill a long footprint (a counter, a bench, a run of pipe) rather than repeated
export const stretches = (name: string) => /table|bench|workbench|desk|counter|pipe run|shelving|dais/i.test(name) && !/low table/i.test(name);

// Which way a piece on the squares `a` (corner `x`,`y`, size `w` by `h`) in a room `width` by `height` faces: its back to the
// wall it stands against, so a console on the west wall looks east. Pieces in the open face south, as they are drawn.
// Turns about the upright axis: 0 faces +z, pi/2 faces +x.
export function facing(a: { x: number; y: number; w: number; h: number }, width: number, height: number): number {
  const gaps: [number, number][] = [[a.y, 0], [height - (a.y + a.h), Math.PI], [a.x, Math.PI / 2], [width - (a.x + a.w), -Math.PI / 2]];
  const [gap, turn] = gaps.reduce((best, g) => (g[0] < best[0] ? g : best));
  return gap <= 0.5 ? turn : 0;
}

// The turn about the upright axis of a piece the code draws (CodeFurniture, and the stock on it: Stock.tsx), which is built lying along x with
// its back to -z and its front to +z, and stood a quarter turn (front to +x) where its footprint is taller than wide. A piece against a wall
// has its back to it (`face`, from `facing`): where the wall is behind the front's side, the piece is turned half a turn. A wall at an end of
// a piece (the piece's front is neither toward nor away from it) and open floor leave the piece as drawn.
export function codeTurn(face: number, w: number, h: number): number {
  const drawn = w >= h ? 0 : Math.PI / 2;
  return Math.cos(face - drawn) < -1e-6 ? drawn + Math.PI : drawn;
}

export interface Fit {
  // About the upright axis, from the model's own frame, and the uniform scale
  turn: number;
  scale: number;
  // How much longer than that the piece is drawn along the footprint's longer side
  stretch: number;
  // Centres of the copies along the footprint's longer side (in squares from its middle): a long counter is several tables
  offsets: number[];
  // Whether the longer side of the footprint is x (else z)
  alongX: boolean;
}

// Sets a model of `size` (x, y, z, the longer side of its floor along x as the kits are made) on a footprint `w` by `h` squares,
// facing `face`: turned to lie along the footprint's longer side, scaled to fit it and the height the piece may reach, and
// repeated (or, for a counter or bench, stretched) along a side that is much longer than one piece.
export function fitPiece(size: [number, number, number], w: number, h: number, face: number, maxHeight: number, stretchy = false): Fit {
  const [sx, sy, sz] = size;
  const quarter = (t: number) => Math.abs(Math.abs(t) - Math.PI / 2) < 1e-6;
  let turn = face;
  // The footprint is longer one way and the model, as faced, the other: turn it a quarter
  const lies = (t: number) => (quarter(t) ? sz >= sx : sx >= sz);
  if (Math.max(w, h) / Math.min(w, h) >= 1.5 && Math.max(sx, sz) / Math.min(sx, sz) >= 1.25 && lies(turn) !== w >= h) turn += Math.PI / 2;
  const [ex, ez] = quarter(turn) ? [sz, sx] : [sx, sz];
  const alongX = w >= h;
  const [long, short, eLong, eShort] = alongX ? [w, h, ex, ez] : [h, w, ez, ex];
  const one = Math.min(maxHeight / Math.max(sy, 0.01), short / Math.max(eShort, 0.01), long / Math.max(eLong, 0.01));
  const natural = Math.max(eLong * one, 0.01);
  if (stretchy) return { turn, scale: one, stretch: Math.max(1, Math.min(2.2, long / natural)), alongX, offsets: [0] };
  // Otherwise repeat it, at most one to a square, where another fits at a decent size
  const count = Math.max(1, Math.min(Math.round(long), Math.floor(long / natural + 0.15)));
  const scale = count > 1 ? Math.min(maxHeight / Math.max(sy, 0.01), short / Math.max(eShort, 0.01), long / count / Math.max(eLong, 0.01)) : one;
  return { turn, scale, stretch: 1, alongX, offsets: Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * (long / count)) };
}

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------

// A straight run of wall `length` squares long as tiles of the Space Station Kit (1 by 1 and 0.3 deep, origin on the floor in
// the middle of the piece, one face the front): the same number of tiles each time, stretched a little to fill it. Every
// third tile (not the ends) is the kit's detailed panel.
export interface WallTile {
  file: string;
  // The middle of the tile along the run, from the run's start, and its length
  at: number;
  length: number;
}
export const WALL_FILES = { plain: `/assets/${STATION}/wall.glb`, detail: `/assets/${STATION}/wall-detail.glb`, panel: `/assets/${STATION}/wall-window.glb` };
export function wallTiles(length: number, seed = 0): WallTile[] {
  const n = Math.max(1, Math.round(length));
  const each = length / n;
  return Array.from({ length: n }, (_, i) => ({
    file: n >= 3 && i > 0 && i < n - 1 && (i + seed) % 3 === 0 ? WALL_FILES.panel : WALL_FILES.plain,
    at: (i + 0.5) * each,
    length: each,
  }));
}
