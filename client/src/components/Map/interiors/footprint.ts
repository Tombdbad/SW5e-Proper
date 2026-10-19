// The shape of a room's floor (2026-10-19). A room is a rectangle of squares, and the map has always
// rounded its outside corners (see `RoundedFloor`, `CornerWall`); a round or oval room is the same
// thing taken as far as it goes: corner radii of half the shorter side. These say which squares
// that leaves standing, so that nothing is furnished or walked in the part that was cut away.
// Pure (tests/interiors/footprint.test.ts).

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
