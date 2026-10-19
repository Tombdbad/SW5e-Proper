// Which converted pack furnishes a room (2026-10-19). A room is furnished from one pack or from the map's own code, never from
// two packs: the pack's pieces share one palette (tools/convert-assets.mjs `tone=`), so a room reads as one place. A piece
// the pack lacks (a couch in the station kit) is drawn by the code as before. Pure: tests/interiors/packs.test.ts.

export interface Pack {
  // The folder under client/public/assets, the palette it was converted in, and the furniture it draws
  dir: string;
  tone: "imperial" | "frontier";
  pieces: Record<string, string>;
}

export const PACKS = {
  // Dignitaries: the Space Station Kit in the Imperial palette (blue-greys and white), with a sofa and a low table from the
  // Furniture Kit converted in the same palette (the station kit has neither)
  station: {
    dir: "/assets/kenney-station",
    tone: "imperial",
    pieces: { Bed: "bed-double", Table: "table", "Low table": "furniture-kit-table-low", Couch: "furniture-kit-sofa", Cabinet: "container-tall" },
  },
  // Servants and residents: the Furniture Kit in the frontier palette (dust, rust and sand)
  furniture: {
    dir: "/assets/kenney-furniture",
    tone: "frontier",
    pieces: { Bed: "bedSingle", Couch: "loungeSofa", "Low table": "tableCoffeeSquare", Table: "table", Cabinet: "cabinetBedDrawer" },
  },
} satisfies Record<string, Pack>;

export type PackId = keyof typeof PACKS;

// Which pack a room is furnished from, by the room's name (the first rule that matches; none is the code's own furniture)
const ROOMS: [RegExp, PackId][] = [
  [/bedchambers|guest rooms|palatial suite|audience|dignitary|grand hall|^hall$/i, "station"],
  [/servants|quarters|apartments|tenement|residence|booth|\bden\b|rooming/i, "furniture"],
];

export function packOf(roomName: string): PackId | undefined {
  return ROOMS.find(([match]) => match.test(roomName))?.[1];
}

// The file of a piece in a room's pack, or undefined where the pack has none
export function pieceOf(pack: PackId | undefined, name: string): string | undefined {
  if (!pack) return undefined;
  const file = (PACKS[pack].pieces as Record<string, string>)[name];
  return file ? `${PACKS[pack].dir}/${file}.glb` : undefined;
}
