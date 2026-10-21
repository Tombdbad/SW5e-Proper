// The on-screen stick (2026-10-20): its size, how its deflection becomes a speed, and the run toggle. One place for the three scenes that
// have one (walking in the shoulder and first-person views, the speeder race and the dogfight). Pure: tests/interiors/stick.test.ts.
import { create } from "zustand";

// A thumb has room on a phone: the pad is 158 px across (a tenth less than it was, 2026-10-21), its knob 58 px, and the knob travels 50 px from the middle
export const STICK = { size: 158, knob: 58, travel: 50, radius: 79 };

// How the stick's deflection (0 to 1, the length of the vector from its middle) maps to a fraction of top speed: a small dead zone, a curve
// that is nearly straight (`expo` 0 is a straight line, 1 a cube; it was 0.6, which left half the stick at a quarter of the speed and made
// the party crawl) and full speed a little before the rim, so that a thumb need not reach the edge of the pad to run
export const DEAD = 0.08;
export const EXPO = 0.15;
export const FULL = 0.9;
export function shaped(deflection: number, expo = EXPO, dead = DEAD, full = FULL): number {
  const d = Math.max(0, Math.min(1, deflection));
  if (d <= dead) return 0;
  const u = Math.min(1, (d - dead) / (full - dead));
  return (1 - expo) * u + expo * u * u * u;
}

// Squares a second on the map: running is the full speed the party has always walked at, walking is 15% slower
export const RUN_SPEED = 7;
export const WALK_FACTOR = 0.85;
export const paceOf = (deflection: number, run: boolean): number => shaped(deflection) * (run ? 1 : WALK_FACTOR);

// The Run button: on at the start (the speed the party has always had), remembered
const saved = (): boolean => {
  try {
    return localStorage.getItem("sw5e.run") !== "0";
  } catch {
    return true;
  }
};
export const useRun = create<{ run: boolean; toggle: () => void }>((set, get) => ({
  run: saved(),
  toggle: () => {
    const run = !get().run;
    try { localStorage.setItem("sw5e.run", run ? "1" : "0"); } catch {}
    set({ run });
  },
}));

// Where a thumb is on the pad (pixels from its middle, y down) as the stick's (strafe, forward), each from -1 to 1 within the unit disc: the
// length of the vector is the deflection (full at `travel` pixels), and up on the pad is forward
export function stickOf(dx: number, dy: number, travel = STICK.travel): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [0, 0];
  const k = Math.min(1, len / travel);
  return [(dx / len) * k, (-dy / len) * k];
}
// The push on the ground (x, z) of a forward and a strafe push for a camera looking along `yaw`: forward is (sin yaw, cos yaw) and right is
// (-cos yaw, sin yaw), which is what interiors/aim.ts `lookDirection` and `rightOf` say (tests/interiors/stick.test.ts holds the two together)
export function groundPush(forward: number, strafe: number, yaw: number): [number, number] {
  const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
  return [s * forward - c * strafe, c * forward + s * strafe];
}

// The eight directions of the grid, the way the map's walk moves (x, then y which is the scene's z), the first being straight on in +z, each
// next one a step of 45 degrees toward +x
export const GRID_DIRS: [number, number][] = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
// The squares to try stepping to, for a push in the direction (dx, dz) on the ground, best first: the nearest of the eight directions, then,
// where that is blocked, the two beside it (a diagonal slides along a wall as either of its two straight steps; a straight one gives way to
// the diagonals either side, nearest the push first), so that a thumb a little off a wall's normal goes along the wall and one straight into
// it stops. Empty for no push at all.
export function gridSteps(dx: number, dz: number): [number, number][] {
  if (Math.hypot(dx, dz) < 1e-6) return [];
  const a = Math.atan2(dx, dz);
  const octant = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  const apart = (i: number) => {
    const d = Math.abs((i * Math.PI) / 4 - a) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  };
  const [sx, sy] = GRID_DIRS[octant];
  if (sx && sy) {
    const straight: [number, number][] = [[sx, 0], [0, sy]];
    const along = (p: [number, number]) => dx * p[0] + dz * p[1];
    return [[sx, sy], ...straight.sort((p, q) => along(q) - along(p))];
  }
  const beside = [-1, 1].map((k) => (octant + k + 8) % 8).sort((x, y) => apart(x) - apart(y)).map((i) => GRID_DIRS[i]);
  return [[sx, sy], ...beside];
}

// The walk the stick asks for (LocalMap `stepToward`): the squares the party is walking, with what to do on arriving (a tap's walk has one) and
// how fast (a fraction of the full pace; a tap's walk is the full pace)
export interface Walk {
  path: { x: number; y: number }[];
  then?: (squares: number) => void;
  total: number;
  pace?: number;
}
type Sq = { x: number; y: number };
// A push of the stick on the ground in the direction (dx, dz), as the walk to be: the square being entered is kept and one more is queued
// after it, the nearest of the eight directions that is open (a diagonal only past two open squares, `rule` being the stair rule between two
// squares where there is one). Whatever else was queued, a walk begun by a tap among it, is dropped: the stick is in charge, and one that
// waited for a tap's walk to end left the party standing. The old walk if no step can be made.
export function stickWalk(walk: Walk | null, feet: Sq, dx: number, dz: number, pace: number, open: (x: number, y: number) => boolean, rule?: ((a: Sq, b: Sq) => boolean) | null): Walk | null {
  const keep = walk ? walk.path.slice(0, 1) : [];
  const from = keep.length ? keep[0] : { x: Math.round(feet.x), y: Math.round(feet.y) };
  for (const [mx, my] of gridSteps(dx, dz)) {
    const next = { x: from.x + mx, y: from.y + my };
    if (!open(next.x, next.y) || (mx && my && !(open(from.x + mx, from.y) && open(from.x, from.y + my)))) continue;
    if (rule && (!rule(from, next) || (mx && my && !(rule(from, { x: from.x + mx, y: from.y }) && rule(from, { x: from.x, y: from.y + my }))))) continue;
    return { path: [...keep, next], total: keep.length + 1, pace };
  }
  return walk;
}
