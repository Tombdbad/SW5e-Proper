// The floors of caves (2026-10-20). A cave is not a building of rectangular rooms: its passages wind, are mostly two to five squares
// wide (never under two, never over six), and open now and then into a chamber. A room of a cave keeps its rectangle on the building's
// grid (so rooms still meet at walls and doors), but only some of its squares stand: this makes the mask of which, from where the ways
// in and out are, as rows of text (`#` stands, `.` is rock). Pure and seeded, so a cave is the same each time; the planner (index.ts)
// sets it on the layout, `standsAt` reads it, and the map draws rock round its edge. tests/world/caves.test.ts holds it to the rules.

export type CaveStyle = "mouth" | "tunnel" | "chamber";
export interface CaveWay {
  x: number;
  y: number;
  side: "n" | "s" | "e" | "w";
}

// What a room of a cave is, from its name: the mouth opens wide on the way out, a chamber is a room of the cave, anything else a tunnel
export const caveStyleOf = (name: string): CaveStyle => (/mouth|entrance/i.test(name) ? "mouth" : /chamber|den|hollow|grotto|cavern|nest|lair|vault|cell/i.test(name) ? "chamber" : "tunnel");

export const MIN_WIDTH = 2;
export const MAX_WIDTH = 6;

const stream = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

type Grid = boolean[][];
const make = (w: number, h: number): Grid => Array.from({ length: h }, () => Array(w).fill(false));
const inside = (g: Grid, x: number, y: number) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;
const at = (g: Grid, x: number, y: number) => inside(g, x, y) && g[y][x];

// Every square within `r` of a point (in squares, the middle of a square at +0.5) stands
function stamp(g: Grid, cx: number, cy: number, r: number) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) if (inside(g, x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) g[y][x] = true;
}

// How thick the passage is at each square: the side of the largest block of floor, all of it standing, that holds the square (so a
// crossing of two tunnels each two wide is two wide, not as wide as the tunnels are long). 0 where there is rock.
export function thickness(g: Grid): number[][] {
  const [h, w] = [g.length, g[0]?.length ?? 0];
  const out = g.map((row) => row.map(() => 0));
  const solid = (x: number, y: number, k: number) => {
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (!at(g, x + i, y + j)) return false;
    return true;
  };
  for (let k = 1; k <= Math.min(w, h); k++)
    for (let y = 0; y + k <= h; y++)
      for (let x = 0; x + k <= w; x++) if (solid(x, y, k)) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) out[y + j][x + i] = Math.max(out[y + j][x + i], k);
  return out;
}

const regions = (g: Grid): [number, number][][] => {
  const seen = g.map((row) => row.map(() => false));
  const out: [number, number][][] = [];
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      if (!g[y][x] || seen[y][x]) continue;
      const part: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        part.push([cx, cy]);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) if (at(g, nx, ny) && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
      }
      out.push(part);
    }
  return out;
};

// A winding line from one point to another: the straight line with a wander across it that grows and fades, as a list of points a half
// square apart, and a width (as a radius in squares) that drifts between `lo` and `hi`
function wind(next: () => number, from: [number, number], to: [number, number], wander: number, lo: number, hi: number): [number, number, number][] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.max(2, Math.round(length * 2));
  const [dx, dy] = [(to[0] - from[0]) / (length || 1), (to[1] - from[1]) / (length || 1)];
  const phase = [next() * 6.28, next() * 6.28];
  const waves = [1 + next() * 1.5, 2 + next() * 2];
  let r = lo + next() * (hi - lo);
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * wander;
    const off = bend * (0.65 * Math.sin(t * Math.PI * waves[0] + phase[0]) + 0.35 * Math.sin(t * Math.PI * waves[1] + phase[1]));
    r = Math.max(lo, Math.min(hi, r + (next() - 0.5) * 0.35));
    out.push([from[0] + (to[0] - from[0]) * t - dy * off, from[1] + (to[1] - from[1]) * t + dx * off, r]);
  }
  return out;
}

// The square just inside the room from a way, `depth` squares in
const inner = (w: CaveWay, depth: number, width: number, height: number): [number, number] => {
  const [dx, dy] = w.side === "w" ? [1, 0] : w.side === "e" ? [-1, 0] : w.side === "n" ? [0, 1] : [0, -1];
  return [Math.max(0.5, Math.min(width - 0.5, w.x + 0.5 + dx * depth)), Math.max(0.5, Math.min(height - 0.5, w.y + 0.5 + dy * depth))];
};

// Two squares of floor that touch only at a corner (the other two squares of their 2 by 2 are rock) cannot be walked between: one of the rock
// squares is made floor
function fixPinches(g: Grid, next: () => number) {
  for (let pass = 0; pass < 6; pass++) {
    let any = false;
    for (let y = 0; y + 1 < g.length; y++)
      for (let x = 0; x + 1 < g[0].length; x++) {
        const [a, b, c, d] = [g[y][x], g[y][x + 1], g[y + 1][x], g[y + 1][x + 1]];
        if (a && d && !b && !c) { const f = next() < 0.5; g[f ? y : y + 1][f ? x + 1 : x] = true; any = true; }
        else if (b && c && !a && !d) { const f = next() < 0.5; g[f ? y : y + 1][f ? x : x + 1] = true; any = true; }
      }
    if (!any) return;
  }
}

// Takes out what is too thin: a square whose passage is a single square wide goes, again and again, except the ways and their throats
function trim(g: Grid, keep: Set<string>) {
  for (let pass = 0; pass < 12; pass++) {
    const doomed: [number, number][] = [];
    const t = thickness(g);
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] && !keep.has(`${x},${y}`) && t[y][x] < MIN_WIDTH) doomed.push([x, y]);
    if (!doomed.length) return;
    for (const [x, y] of doomed) g[y][x] = false;
  }
}

// Fills a square that is shut in on three sides or more (a notch), so that edges are not ragged to the point of 1-square teeth
function smooth(g: Grid, keep: Set<string>) {
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < g.length; y++)
      for (let x = 0; x < g[0].length; x++) {
        if (g[y][x] || keep.has(`${x},${y}`)) continue;
        const n = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => at(g, a, b)).length;
        if (n >= 3) g[y][x] = true;
      }
}

function build(width: number, height: number, ways: CaveWay[], style: CaveStyle, seed: number, plain = false): Grid | undefined {
  const next = stream(seed);
  const g = make(width, height);
  const keep = new Set<string>();
  // The ways: the square itself and its throat, two wide and two deep (the neighbour along the wall, and the two squares inward)
  const targets: [number, number][] = [];
  for (const w of ways) {
    const [dx, dy] = w.side === "w" ? [1, 0] : w.side === "e" ? [-1, 0] : w.side === "n" ? [0, 1] : [0, -1];
    const [sx, sy] = dx ? [0, w.y + 1 < height ? 1 : -1] : [w.x + 1 < width ? 1 : -1, 0];
    for (const [px, py] of [[0, 0], [sx, sy], [dx, dy], [dx + sx, dy + sy], [2 * dx, 2 * dy], [2 * dx + sx, 2 * dy + sy]]) {
      const [x, y] = [w.x + px, w.y + py];
      if (inside(g, x, y)) {
        g[y][x] = true;
        keep.add(`${x},${y}`);
      }
    }
    targets.push(inner(w, 2.5, width, height));
  }
  const meander = plain ? 0.8 : Math.min(width, height) / 3;
  if (style === "chamber") {
    // A rounded, ragged room: an ellipse whose edge wavers, with the ways joined to its middle
    const [cx, cy] = [width / 2 + (next() - 0.5) * 1.5, height / 2 + (next() - 0.5) * 1.5];
    const [rx, ry] = [Math.max(2.4, width * (0.34 + next() * 0.12)), Math.max(2.4, height * (0.34 + next() * 0.12))];
    const waves = [[2 + Math.floor(next() * 2), next() * 6.28, 0.12 + next() * 0.1], [3 + Math.floor(next() * 3), next() * 6.28, 0.06 + next() * 0.06]];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const a = Math.atan2((y + 0.5 - cy) / ry, (x + 0.5 - cx) / rx);
        const edge = 1 + waves.reduce((s, [k, p, amp]) => s + amp * Math.sin(k * a + p), 0);
        if (Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) <= edge) g[y][x] = true;
      }
    for (const t of targets) for (const [x, y, r] of wind(next, t, [cx, cy], 1.2, 1, 1.4)) stamp(g, x, y, r);
  } else {
    // A tunnel winds from way to way (a dead end for one way: out to a pocket), the mouth wide at its way out
    // (a tunnel with one way runs on into the room to a dead end: well away from the way, towards the far side)
    const far = (): [number, number] => {
      const [fx, fy] = [targets[0][0] < width / 2 ? width * (0.65 + next() * 0.25) : width * (0.1 + next() * 0.25), targets[0][1] < height / 2 ? height * (0.6 + next() * 0.3) : height * (0.1 + next() * 0.3)];
      return [Math.max(1.5, Math.min(width - 1.5, fx)), Math.max(1.5, Math.min(height - 1.5, fy))];
    };
    const spots = targets.length > 1 ? targets : [...targets, far()];
    // Nearest first, so that the line runs through the room and not back and forth across it
    const order = [spots[0]];
    const rest = spots.slice(1);
    while (rest.length) {
      const last = order[order.length - 1];
      rest.sort((p, q) => Math.hypot(p[0] - last[0], p[1] - last[1]) - Math.hypot(q[0] - last[0], q[1] - last[1]));
      order.push(rest.shift()!);
    }
    const [lo, hi] = plain ? [1.0, 1.3] : style === "mouth" ? [1.2, 1.9] : [0.95, 1.5];
    for (let i = 1; i < order.length; i++) for (const [x, y, r] of wind(next, order[i - 1], order[i], meander, lo, hi)) stamp(g, x, y, r);
    // A mouth is wider where it meets the way out, then narrows into the rock
    if (style === "mouth" && targets.length && !plain) stamp(g, targets[0][0], targets[0][1], 2.2);
    // And now and then a tunnel widens into a small bay
    if (style === "tunnel" && !plain && next() < 0.35) {
      const p = order[Math.floor(next() * order.length)];
      stamp(g, p[0] + (next() - 0.5) * 2, p[1] + (next() - 0.5) * 2, 2.3);
    }
  }
  if (style === "chamber") smooth(g, keep);
  fixPinches(g, next);
  trim(g, keep);
  fixPinches(g, next);
  // One piece, holding every way, of some size
  const parts = regions(g);
  if (!parts.length) return undefined;
  const main = parts.reduce((a, b) => (b.length > a.length ? b : a));
  const inMain = new Set(main.map(([x, y]) => `${x},${y}`));
  if (ways.some((w) => !inMain.has(`${w.x},${w.y}`))) return undefined;
  for (const part of parts) if (part !== main) for (const [x, y] of part) g[y][x] = false;
  if (main.length < Math.max(10, width * height * 0.18)) return undefined;
  // Within the rules: nowhere under two wide, and (but in a chamber) nowhere over six
  const thick = thickness(g);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!g[y][x]) continue;
      const w = thick[y][x];
      if (w < MIN_WIDTH && !keep.has(`${x},${y}`)) return undefined;
      if (style !== "chamber" && w > MAX_WIDTH) return undefined;
    }
  return g;
}

// The mask of a room of a cave, `width` by `height`, with these ways, in this style. Tries other turns of the seed until the rules hold; a
// room too small for a passage of two squares is left whole.
export function caveMask(width: number, height: number, ways: CaveWay[], style: CaveStyle, seed: number): string[] {
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = build(width, height, ways, style, seed * 977 + attempt * 7919 + 13);
    if (g) return g.map((row) => row.map((s) => (s ? "#" : ".")).join(""));
  }
  // Many ways in a small room: plain passages of two or three squares between them, which hold the rules
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = build(width, height, ways, style === "chamber" ? "tunnel" : style, seed * 131 + attempt * 31 + 5, true);
    if (g) return g.map((row) => row.map((s) => (s ? "#" : ".")).join(""));
  }
  return Array.from({ length: height }, () => "#".repeat(width));
}

export const maskGrid = (mask: string[]): Grid => mask.map((row) => Array.from(row, (c) => c === "#"));
export const maskStands = (mask: string[] | undefined, x: number, y: number) => (mask ? mask[y]?.[x] === "#" : true);

// What a mask is like: the narrowest and widest passage, the share of squares in passages of five or fewer, and the pieces it is in
export function describeMask(mask: string[]) {
  const g = maskGrid(mask);
  let min = Infinity;
  let max = 0;
  let narrow = 0;
  let total = 0;
  const thick = thickness(g);
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      if (!g[y][x]) continue;
      const w = thick[y][x];
      min = Math.min(min, w);
      max = Math.max(max, w);
      total++;
      if (w <= 5) narrow++;
    }
  return { min, max, narrow: total ? narrow / total : 1, total, pieces: regions(g).length };
}
