// The shape of a room's floor (2026-10-19). A room is a rectangle of squares, and the map has always
// rounded its outside corners (see `RoundedFloor`, `CornerWall`); a round or oval room is the same
// thing taken as far as it goes: corner radii of half the shorter side. These say which squares
// that leaves standing, so that nothing is furnished or walked in the part that was cut away.
// Pure, so the planner (shared/logic) and the map (client) share it (tests/interiors/footprint.test.ts).

export type Radii = [nw: number, ne: number, se: number, sw: number];
export type Shape = "rect" | "round" | "oval" | "chamfer";

// The corner radii of a shape, for a room w by h: `round` a circle or, in a long room, a stadium; `oval` the same but
// with the radius of each corner stretched to the longer side (an ellipse as close as a rounded rectangle gets); `chamfer` cuts the corners
export function radiiOf(shape: Shape, w: number, h: number): Radii {
  const short = Math.min(w, h) / 2;
  switch (shape) {
    case "round": return [short, short, short, short];
    case "oval": { const r = Math.min(Math.max(w, h) / 2.4, short); return [r, r, r, r]; }
    case "chamfer": return [1, 1, 1, 1];
    default: return [0, 0, 0, 0];
  }
}

// Whether the point (px, py) of a w-by-h room, in squares from its north-west corner, is inside a floor with these corner radii
export function insideFloor(w: number, h: number, radii: Radii, px: number, py: number): boolean {
  if (px < 0 || py < 0 || px > w || py > h) return false;
  const corners: [number, number, number][] = [
    [radii[0], radii[0], radii[0]],
    [w - radii[1], radii[1], radii[1]],
    [w - radii[2], h - radii[2], radii[2]],
    [radii[3], h - radii[3], radii[3]],
  ];
  const quadrant = [px < radii[0] && py < radii[0], px > w - radii[1] && py < radii[1], px > w - radii[2] && py > h - radii[2], px < radii[3] && py > h - radii[3]];
  for (let i = 0; i < 4; i++) {
    if (!quadrant[i] || corners[i][2] <= 0) continue;
    const [cx, cy, r] = corners[i];
    if ((px - cx) ** 2 + (py - cy) ** 2 > r * r) return false;
  }
  return true;
}

// The squares of a room that stand: a square stands if its middle is inside the floor and so is at
// least half of it (sampled at its middle and four points inside its corners)
export function standing(w: number, h: number, radii: Radii): boolean[][] {
  const grid: boolean[][] = [];
  for (let x = 0; x < w; x++) {
    grid[x] = [];
    for (let y = 0; y < h; y++) {
      const samples: [number, number][] = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
      const inside = samples.filter(([dx, dy]) => insideFloor(w, h, radii, x + dx, y + dy)).length;
      grid[x][y] = insideFloor(w, h, radii, x + 0.5, y + 0.5) && inside >= 3;
    }
  }
  return grid;
}

// Is a doorway at the middle of a side still on a standing square (a way in must never open on rock)?
export function waysStand(w: number, h: number, radii: Radii): boolean {
  const grid = standing(w, h, radii);
  const mid = (n: number) => Math.floor(n / 2);
  return grid[mid(w)][0] && grid[mid(w)][h - 1] && grid[0][mid(h)] && grid[w - 1][mid(h)];
}

// ---- The wall line of a room (2026-10-26) ----------------------------------------------------------------------------------------
// A room's wall runs round its outline: the straight sides between the corners and a quarter circle at each rounded corner. `outline`
// gives it as one path, walked clockwise seen from above (north along +x, then east, south and west), so that a door or window can be
// set on the wall where it really is: on the curve of a round room, not on the straight line of its bounding square (where it used to
// stand, with the curved wall running on through it). Coordinates are squares from the room's north-west corner, x east and z south.
export type Side = "n" | "e" | "s" | "w";
export interface OutlinePoint {
  // The point on the wall line, the way the path goes on (unit), and the way into the room (unit)
  p: [number, number];
  t: [number, number];
  n: [number, number];
}
type Piece =
  | { kind: "line"; side: Side; from: [number, number]; dir: [number, number]; length: number; start: number }
  | { kind: "arc"; corner: 0 | 1 | 2 | 3; c: [number, number]; r: number; phi0: number; length: number; start: number };
export interface Outline {
  length: number;
  pieces: Piece[];
}
// Where each corner's arc starts (0 points east, a quarter turn toward +z is south), as `CORNER_START` in the map's Walls
export const ARC_START = [Math.PI, Math.PI * 1.5, 0, Math.PI / 2] as const;
export function outline(w: number, h: number, radii: Radii): Outline {
  const [nw, ne, se, sw] = radii;
  const pieces: Piece[] = [];
  let s = 0;
  const line = (side: Side, from: [number, number], to: [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length > 1e-9) pieces.push({ kind: "line", side, from, dir: [(to[0] - from[0]) / length, (to[1] - from[1]) / length], length, start: s });
    s += length;
  };
  const arc = (corner: 0 | 1 | 2 | 3, r: number) => {
    if (r <= 1e-9) return;
    const c: [number, number] = [[r, w - r, w - r, r][corner], [r, r, h - r, h - r][corner]];
    const length = (r * Math.PI) / 2;
    pieces.push({ kind: "arc", corner, c, r, phi0: ARC_START[corner], length, start: s });
    s += length;
  };
  line("n", [nw, 0], [w - ne, 0]);
  arc(1, ne);
  line("e", [w, ne], [w, h - se]);
  arc(2, se);
  line("s", [w - se, h], [sw, h]);
  arc(3, sw);
  line("w", [0, h - sw], [0, nw]);
  arc(0, nw);
  return { length: s, pieces };
}
// The point of the path at `s` along it (wrapped round)
export function outlineAt(o: Outline, s: number): OutlinePoint {
  const at = ((s % o.length) + o.length) % o.length;
  const piece = o.pieces.find((p) => at <= p.start + p.length + 1e-9) ?? o.pieces[o.pieces.length - 1];
  const d = at - piece.start;
  if (piece.kind === "line") {
    const [dx, dz] = piece.dir;
    // clockwise round the room, the inside is to the right of the way the path goes: (dx, dz) turned a quarter to +z
    return { p: [piece.from[0] + dx * d, piece.from[1] + dz * d], t: [dx, dz], n: [-dz, dx] };
  }
  const phi = piece.phi0 + d / piece.r;
  const [c, sn] = [Math.cos(phi), Math.sin(phi)];
  return { p: [piece.c[0] + piece.r * c, piece.c[1] + piece.r * sn], t: [-sn, c], n: [-c, -sn] };
}
// Where on the path the wall is at a square of a side (`along` is the square's index along it, from the north or west end): the point
// of the outline across from the middle of that square's edge. On a straight stretch that is the edge itself; at a rounded corner it is
// the curve, further in
export function outlineOf(o: Outline, w: number, h: number, side: Side, along: number): number {
  const u = along + 0.5;
  // The bounding point, and which pieces may hold it: the side's line or the arcs at its ends
  const want: [number, number] = side === "n" ? [u, 0] : side === "s" ? [u, h] : side === "w" ? [0, u] : [w, u];
  let best = 0;
  let far = Infinity;
  for (const piece of o.pieces) {
    if (piece.kind === "line") {
      if (piece.side !== side) continue;
      const d = (want[0] - piece.from[0]) * piece.dir[0] + (want[1] - piece.from[1]) * piece.dir[1];
      if (d < -1e-9 || d > piece.length + 1e-9) continue;
      return piece.start + d;
    }
    // On an arc: the point of the curve with the same x (north and south sides) or z (west and east), on the side's half of the arc
    const ends: Record<Side, number[]> = { n: [0, 1], e: [1, 2], s: [2, 3], w: [3, 0] };
    if (!ends[side].includes(piece.corner)) continue;
    const across = side === "n" || side === "s" ? want[0] - piece.c[0] : want[1] - piece.c[1];
    if (Math.abs(across) > piece.r + 1e-9) continue;
    const off = Math.sqrt(Math.max(0, piece.r * piece.r - across * across));
    const p: [number, number] = side === "n" ? [want[0], piece.c[1] - off] : side === "s" ? [want[0], piece.c[1] + off] : side === "w" ? [piece.c[0] - off, want[1]] : [piece.c[0] + off, want[1]];
    let phi = Math.atan2(p[1] - piece.c[1], p[0] - piece.c[0]) - piece.phi0;
    phi = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (phi > Math.PI / 2 + 1e-6) continue;
    const gap = Math.hypot(p[0] - want[0], p[1] - want[1]);
    if (gap < far) {
      far = gap;
      best = piece.start + phi * piece.r;
    }
  }
  return best;
}
// The stretches of the path that are wall, given the stretches taken by doors and windows ([from, to] along the path): what is left,
// split where the path turns from a side to a corner, as straight runs (in squares along their side, as the map's wall runs are) and arcs
// (angles about their corner's centre)
export interface WallStretches {
  runs: { side: Side; a: number; b: number }[];
  arcs: { corner: 0 | 1 | 2 | 3; r: number; from: number; to: number }[];
}
export function wallStretches(o: Outline, w: number, h: number, gaps: [number, number][]): WallStretches {
  const out: WallStretches = { runs: [], arcs: [] };
  // The gaps as stretches within [0, length), a gap over the start split in two
  const cut: [number, number][] = [];
  for (const [a, b] of gaps) {
    const from = ((a % o.length) + o.length) % o.length;
    const to = from + (b - a);
    if (to > o.length) cut.push([from, o.length], [0, to - o.length]);
    else cut.push([from, to]);
  }
  for (const piece of o.pieces) {
    let keep: [number, number][] = [[piece.start, piece.start + piece.length]];
    for (const [a, b] of cut) keep = keep.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : ([[x, Math.max(x, a)], [Math.min(y, b), y]] as [number, number][]).filter(([p, q]) => q - p > 1e-6)));
    for (const [x, y] of keep) {
      if (piece.kind === "arc") out.arcs.push({ corner: piece.corner, r: piece.r, from: piece.phi0 + (x - piece.start) / piece.r, to: piece.phi0 + (y - piece.start) / piece.r });
      else {
        // squares along the side from its north or west end
        const along = (d: number) => {
          const [px, pz] = [piece.from[0] + piece.dir[0] * d, piece.from[1] + piece.dir[1] * d];
          return piece.side === "n" || piece.side === "s" ? px : pz;
        };
        const [p, q] = [along(x - piece.start), along(y - piece.start)];
        out.runs.push({ side: piece.side, a: Math.min(p, q), b: Math.max(p, q) });
      }
    }
  }
  return out;
}

// How far in from its bounding edge a room's wall line is on a side at `u` (squares along that side from its north or west end): 0 on
// a straight stretch, more toward a rounded corner. A room set against a round one fills that much, so that it meets the curve
export function insetAt(w: number, h: number, radii: Radii, side: Side, u: number): number {
  const [nw, ne, se, sw] = radii;
  const length = side === "n" || side === "s" ? w : h;
  const [first, last] = side === "n" ? [nw, ne] : side === "s" ? [sw, se] : side === "w" ? [nw, sw] : [ne, se];
  const v = Math.max(0, Math.min(length, u));
  const bend = (r: number, d: number) => (r > 0 && d < r ? r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))) : 0);
  return Math.max(bend(first, v), bend(last, length - v));
}
