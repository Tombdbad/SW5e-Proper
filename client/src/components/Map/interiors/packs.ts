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
// This project's own pieces (2026-11-09, built in Mixar, vertex-coloured like the converted packs and turned into the room's palette the same way): bars and booths, beds and bunks,
// a medcentre's bed and tank, a workshop's bench, cart and rack, a throne room's dais. They stand in place of the kits' where a room asks for the same name.
const MOD = "mixar-modular";
const CONSOLES = Object.fromEntries(["Console", "Monitoring console", "Guard console", "Navigation console", "Terminal", "Data terminal", "Information terminal", "Desk"].map((n) => [n, `${SPACE}/desk_computer`]));

export const PACKS = {
  // Dignitaries: the Space Station Kit's walls and furniture in the Imperial palette (blue-greys and white, crimson trim), with
  // a sofa and a low table from the Furniture Kit (the station kit has neither)
  station: {
    tone: "imperial",
    walls: true,
    pieces: { Bed: `${STATION}/bed-double`, Table: `${STATION}/table`, "Low table": `${FURNITURE}/tableCoffeeSquare`, Couch: `${FURNITURE}/loungeSofa`, Cabinet: `${STATION}/container-tall`, Chair: `${STATION}/chair-armrest-headrest`, Dais: `${MOD}/palace_f_dais`, Bench: `${MOD}/palace_f_bench_long` },
  },
  // Servants and residents: the Furniture Kit in the frontier palette drawn from the world's walls (dust, rust and sand)
  furniture: {
    tone: "frontier",
    world: true,
    pieces: { Bed: `${MOD}/living_bed`, Couch: `${FURNITURE}/loungeSofa`, "Low table": `${FURNITURE}/tableCoffeeSquare`, Table: `${FURNITURE}/table`, Cabinet: `${MOD}/living_wardrobe`, Bunk: `${MOD}/living_bunk`, Shelving: `${MOD}/living_shelf_unit` },
  },
  // Bars, cantinas and common rooms: the counter with its stools' height, the round tables, a booth, a jukebox and a stage, in the frontier palette drawn from the world's walls
  cantina: {
    tone: "frontier",
    world: true,
    pieces: { "Bar counter": `${MOD}/cantina_bar_straight`, Table: `${MOD}/cantina_table_round`, "Sabacc table": `${MOD}/cantina_table_round`, Booth: `${MOD}/cantina_booth_seat`, "Drink dispenser": `${MOD}/cantina_jukebox`, Bandstand: `${MOD}/cantina_stage`, Bed: `${MOD}/living_bed` },
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
      Workbench: `${MOD}/tech_workbench`,
      "Tool cart": `${MOD}/work_tool_cart`,
      "Tool rack": `${MOD}/work_parts_rack`,
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
    pieces: { "Medical bed": `${MOD}/med_med_bed`, "Supply cabinet": `${MOD}/med_supply_cabinet`, "Instrument cart": `${MOD}/work_tool_cart`, "Bacta tank": `${MOD}/med_bacta_tank`, ...CONSOLES },
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
  [/main bar|cantina|\bbar\b|common room|commons|dance floor|gambling|gaming floor|high-stakes|lounge|salon|dining/i, "cantina"],
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

// The pack a building's walls are drawn from: one for the whole building, whatever its rooms are furnished like (two rooms that
// share a wall must not each draw it in its own texture: 2026-11-01, the user)
export const wallPackOf = (buildingType = ""): PackId | undefined => packOf("", buildingType);

// What the project's own pieces are called in the room plans (2026-11-09): any room, with a pack or none, draws these by their name where its pack has no piece of the name. The
// kits' pieces (a pack's `pieces`) win where a pack names one; these fill in the rest, in the pieces' own colours (a room with no pack) or the pack's palette (one with)
export const OWN: Record<string, string> = {
  "Bar counter": "cantina_bar_straight", Table: "cantina_table_round", "Sabacc table": "cantina_table_round", Booth: "cantina_booth_seat", "Drink dispenser": "cantina_jukebox", Bandstand: "cantina_stage",
  Stool: "cantina_stool", Banner: "palace_f_banner_long", Brazier: "palace_f_brazier", Statue: "palace_f_statue", Fountain: "palace_f_fountain", Rug: "palace_f_rug_runner", Throne: "palace_f_throne", Dais: "palace_f_dais",
  "Banquet table": "palace_f_banquet_table", Bench: "living_bench", "Long bench": "palace_f_bench_long",
  Bed: "living_bed", Bunk: "living_bunk", Cabinet: "living_wardrobe", Shelving: "living_shelf_unit", "Goods shelf": "living_shelf_unit", "Display shelf": "living_shelf_unit", Wardrobe: "living_wardrobe",
  "Kitchen counter": "living_kitchen_counter", Stove: "living_stove", "Water jar": "living_water_jar", "Floor lamp": "living_floor_lamp", Cushions: "living_cushions", "Mess table": "living_table_long", "Dining table": "living_table_long",
  Console: "tech_console_desk", "Guard console": "tech_console_desk", "Monitoring console": "tech_console_desk", "Navigation console": "tech_console_desk", Desk: "tech_console_desk", "Console bank": "tech_console_bank",
  Terminal: "tech_terminal", "Data terminal": "tech_terminal", "Information terminal": "tech_terminal", "Server rack": "tech_server_rack", Locker: "tech_locker_bank", Crate: "tech_crate_small", "Equipment crate": "tech_crate_small", "Crate stack": "tech_crate_large",
  Workbench: "tech_workbench", "Power coupling": "tech_generator", Generator: "tech_generator", "Command chair": "tech_control_chair", "Security scanner": "tech_scanner_arch", "Cable reel": "tech_cable_reel",
  "Medical bed": "med_med_bed", "Bacta tank": "med_bacta_tank", "Supply cabinet": "med_supply_cabinet", "Medical cabinet": "med_supply_cabinet", "IV stand": "med_iv_stand", "Privacy screen": "med_privacy_screen", "Medical chair": "med_med_chair", Sink: "med_sink", "Scanner arch": "med_scanner_arch",
  "Tool cart": "work_tool_cart", "Instrument cart": "work_tool_cart", "Tool rack": "work_parts_rack", "Parts rack": "work_parts_rack", "Parts bin": "work_fuel_drum", "Fuel drum": "work_fuel_drum", Forge: "work_forge", "Engine block": "work_engine_block",
  "Charging station": "work_droid_charger", "Droid charger": "work_droid_charger", "Vehicle lift": "work_lift_arm", Hoist: "work_hoist", "Tire stack": "work_tire_stack",
};
// The same pieces made for a round or oval room's curve (2026-11-09, built in Mixar as arcs of 45 degrees on a circle of radius 3, their backs to the wall): a piece against the wall of a
// round room is drawn as its curved version where it has one (the squares it stands on are the straight piece's; the curve follows the room's)
export const CURVED: Record<string, string> = {
  "Bar counter": "curve_bar", "Sales counter": "curve_counter", "Refreshment stall": "curve_counter", Bench: "curve_bench", Couch: "curve_couch", Shelving: "curve_shelf", "Goods shelf": "curve_shelf", "Display shelf": "curve_shelf", "Wares rack": "curve_shelf",
  Cabinet: "curve_cabinet", "Supply cabinet": "curve_cabinet", "Medical cabinet": "curve_cabinet", "Display case": "curve_display", Console: "curve_console", "Guard console": "curve_console", "Monitoring console": "curve_console", "Navigation console": "curve_console",
  Locker: "curve_lockers", Booth: "curve_booth", Sink: "curve_sink", Bandstand: "curve_stage", Dais: "curve_stage", Barricade: "curve_rail", Planter: "curve_planter",
};
// The file of a piece in a room's pack (a path under /assets), or undefined where the pack has none
// (`own` false for a piece that carries stock drawn on it, whose wares are set on the code's shape: interiors/Stock.tsx)
export function pieceOf(pack: PackId | undefined, name: string, own = true, curved = false): string | undefined {
  if (curved && own && CURVED[name]) return `/assets/${MOD}/${CURVED[name]}.glb`;
  const file = pack ? (PACKS[pack].pieces as Record<string, string>)[name] : undefined;
  if (file) return `/assets/${file}.glb`;
  return own && OWN[name] ? `/assets/${MOD}/${OWN[name]}.glb` : undefined;
}

// ---------------------------------------------------------------------------------------------
// Setting a piece on its footprint
// ---------------------------------------------------------------------------------------------

// How tall a piece may stand, in squares (a square is a little under two metres); the rest are chest high
const TALL: [RegExp, number][] = [[/statue|banner|hoist/i, 2.2], [/server rack|forge|lift|scanner/i, 1.8], [/floor lamp|brazier|iv stand|privacy screen/i, 1.4], [/rug|cushions/i, 0.1], [/bar counter|booth|stool|kitchen|stove|sink|cart/i, 0.8], [/reactor core/i, 2], [/mast|chimney|vent stack/i, 2.2], [/tank/i, 1.5], [/locker|cabinet|bookcase/i, 1.3], [/bed|bunk|couch|table|bench|desk|workbench/i, 0.6], [/console|terminal/i, 0.9]];
export const maxHeightOf = (name: string) => TALL.find(([m]) => m.test(name))?.[1] ?? 1;
// Pieces that are drawn longer to fill a long footprint (a counter, a bench, a run of pipe) rather than repeated
export const stretches = (name: string) => /table|bench|workbench|desk|counter|pipe run|shelving|dais|banner|rug|console bank|parts rack/i.test(name) && !/low table|sabacc/i.test(name);

// Which way a piece on the squares `a` (corner `x`,`y`, size `w` by `h`) in a room `width` by `height` faces: its back to the
// wall it stands against, so a console on the west wall looks east. Pieces in the open face south, as they are drawn.
// Turns about the upright axis: 0 faces +z, pi/2 faces +x.
// In a round or oval room (`round`, 2026-11-06) a piece round the curve has its back to the curve: it faces the middle, to the nearest quarter turn
// (its squares are square to the room; the curved pieces of the ring follow the curve itself)
export function facing(a: { x: number; y: number; w: number; h: number }, width: number, height: number, round = false): number {
  if (round) {
    const dx = width / 2 - (a.x + a.w / 2);
    const dz = height / 2 - (a.y + a.h / 2);
    if (Math.abs(dx) < 0.75 && Math.abs(dz) < 0.75) return 0;
    return Math.abs(dz) * width >= Math.abs(dx) * height ? (dz > 0 ? 0 : Math.PI) : dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
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
