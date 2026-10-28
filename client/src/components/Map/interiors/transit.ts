// Going up to a roof and down from it, seen (2026-10-27, the user: "add a simple animation for climbing up/down ladders, the magic-ly appearing on
// a roof is a little jarring"; jumping, grapple hooks, jetpacks, rocket boots and climbing now work outside a fight too). The party's figure
// is carried along a path from where it stands to where it arrives, over a time set by the way and the height. Pure: the map reads the path
// every frame and tests read it in node (tests/interiors/transit.test.ts).
export type TransitKind = "ladder" | "grips" | "hook" | "fly" | "leap" | "jump" | "descent";

// Where it happens, in the world's own squares (a square's middle is its index + 0.5): the wall's point, the way out from the wall (a unit
// vector from the building towards the street), where the figure stands in the street at the foot, where it stands on the roof, and the
// roof's height
export interface TransitGeom {
  wall: [number, number];
  out: [number, number];
  pad: [number, number];
  roof: [number, number];
  top: number;
}
export interface TransitPose {
  x: number;
  z: number;
  y: number;
  // The way the figure faces (about the vertical axis, as the map turns a walker: atan2(dx, dz))
  yaw: number;
  // On a ladder or a line: hands on it, and how far up it is
  climbing: boolean;
  // A jetpack or rocket boots burning
  burning: boolean;
}

// How long it takes: a ladder or a line a little under a second a floor, a flight faster, a leap quick, a drop faster still
export function transitMs(kind: TransitKind, levels: number): number {
  const floors = Math.max(1, levels);
  switch (kind) {
    case "fly": return 700 + 450 * floors;
    case "leap": return 1100 + 150 * floors;
    case "jump": return 650 + 120 * floors;
    case "descent": return 800 + 650 * floors;
    default: return 600 + 800 * floors;
  }
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, v: number) => a + (b - a) * v;
// The fraction of [from, to] that t has covered
const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from));

// Where the figure is at time t (0 to 1) going up (to the roof) or down (to the street) from `start` (where it stands now, in squares'
// middles)
export function transitAt(kind: TransitKind, up: boolean, g: TransitGeom, start: [number, number], t: number): TransitPose {
  const [wx, wz] = g.wall;
  const [ox, oz] = g.out;
  // Where it clings to the wall (in front of the ladder or the line) and where it stands to jump or take off
  const cling: [number, number] = [wx + ox * 0.22, wz + oz * 0.22];
  const stand: [number, number] = [wx + ox * 0.7, wz + oz * 0.7];
  const faceWall = Math.atan2(-ox, -oz);
  const between = (a: [number, number], b: [number, number], v: number): [number, number] => [lerp(a[0], b[0], v), lerp(a[1], b[1], v)];
  const yawOf = (a: [number, number], b: [number, number], keep: number) => (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-4 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : keep);
  const done = (p: Omit<TransitPose, "yaw"> & { yaw?: number }, from: [number, number], to: [number, number]): TransitPose => ({ ...p, yaw: p.yaw ?? yawOf(from, to, faceWall) });
  const top = g.top;

  if (up) {
    if (kind === "fly") {
      // a few steps to the wall, straight up on the burn, then over the edge to the roof
      if (t < 0.12) { const [x, z] = between(start, stand, ease(part(t, 0, 0.12))); return done({ x, z, y: 0, climbing: false, burning: false }, start, stand); }
      if (t < 0.72) { const v = ease(part(t, 0.12, 0.72)); return { x: stand[0], z: stand[1], y: v * (top + 0.5), yaw: faceWall, climbing: false, burning: true }; }
      const v = ease(part(t, 0.72, 1));
      const [x, z] = between(stand, g.roof, v);
      return done({ x, z, y: lerp(top + 0.5, top, v), climbing: false, burning: v < 0.8 }, stand, g.roof);
    }
    if (kind === "leap") {
      // a short run at the wall, the spring (an arc up to the edge), a moment hanging by the hands, then hauled over
      if (t < 0.14) { const [x, z] = between(start, stand, ease(part(t, 0, 0.14))); return done({ x, z, y: 0, climbing: false, burning: false }, start, stand); }
      if (t < 0.5) { const v = part(t, 0.14, 0.5); const [x, z] = between(stand, cling, v); return { x, z, y: (top - 0.25) * ease(v) + 0.45 * Math.sin(Math.PI * v), yaw: faceWall, climbing: false, burning: false }; }
      if (t < 0.68) { const v = part(t, 0.5, 0.68); return { x: cling[0], z: cling[1], y: top - 0.25 - 0.04 * Math.sin(v * 12), yaw: faceWall, climbing: true, burning: false }; }
      const v = ease(part(t, 0.68, 1));
      const [x, z] = between(cling, g.roof, v);
      return done({ x, z, y: lerp(top - 0.25, top, v) + 0.18 * Math.sin(Math.PI * v), climbing: v < 0.4, burning: false }, cling, g.roof);
    }
    // a ladder, friction grips or a hook's line: to the foot, up it hand over hand, and over the edge
    if (t < 0.14) { const [x, z] = between(start, cling, ease(part(t, 0, 0.14))); return done({ x, z, y: 0, climbing: false, burning: false }, start, cling); }
    if (t < 0.86) { const v = part(t, 0.14, 0.86); return { x: cling[0] + Math.sin(v * 22) * 0.02, z: cling[1], y: top * v, yaw: faceWall, climbing: true, burning: false }; }
    const v = ease(part(t, 0.86, 1));
    const [x, z] = between(cling, g.roof, v);
    return done({ x, z, y: top + 0.12 * Math.sin(Math.PI * v), climbing: false, burning: false }, cling, g.roof);
  }

  // Down: from the roof, over the edge to the street
  if (kind === "jump") {
    // a step to the edge and off it, falling faster as it goes
    if (t < 0.18) { const [x, z] = between(start, g.wall, ease(part(t, 0, 0.18))); return done({ x, z, y: top, climbing: false, burning: false }, start, g.wall); }
    const v = part(t, 0.18, 1);
    const [x, z] = between(g.wall, g.pad, 1 - (1 - v) * (1 - v));
    return done({ x, z, y: top * (1 - v * v), climbing: false, burning: false }, g.wall, g.pad);
  }
  if (kind === "fly" || kind === "descent") {
    // off the edge, then down on the burn (or the repulsor's slow fall)
    if (t < 0.15) { const [x, z] = between(start, stand, ease(part(t, 0, 0.15))); return done({ x, z, y: top, climbing: false, burning: false }, start, stand); }
    if (t < 0.88) { const v = ease(part(t, 0.15, 0.88)); return { x: stand[0], z: stand[1], y: top * (1 - v), yaw: faceWall, climbing: false, burning: true }; }
    const [x, z] = between(stand, g.pad, ease(part(t, 0.88, 1)));
    return done({ x, z, y: 0, climbing: false, burning: false }, stand, g.pad);
  }
  // a ladder, grips or a line: over the edge onto it, down it, off its foot
  if (t < 0.14) { const [x, z] = between(start, cling, ease(part(t, 0, 0.14))); return done({ x, z, y: top, climbing: false, burning: false }, start, cling); }
  if (t < 0.86) { const v = part(t, 0.14, 0.86); return { x: cling[0] + Math.sin(v * 22) * 0.02, z: cling[1], y: top * (1 - v), yaw: faceWall, climbing: true, burning: false }; }
  const [x, z] = between(cling, g.pad, ease(part(t, 0.86, 1)));
  return done({ x, z, y: 0, climbing: false, burning: false }, cling, g.pad);
}

// The wall's geometry for a roof or balcony layout, from the way that joins it to the street (its ladder: an `exit` set in the wall) or, with
// none, the edge of the layout nearest the party: in the world's own squares
export interface EdgeLayout { x: number; y: number; width: number; height: number }
export type Edge = "n" | "e" | "s" | "w";
const NORMAL: Record<Edge, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
export function geomOf(layout: EdgeLayout, top: number, way: { side: Edge; x: number; y: number } | undefined, near: [number, number]): TransitGeom {
  const side: Edge = way?.side ?? nearestEdge(layout, near);
  // the square on the edge the way stands on: the way's own, else the one beside where the party is
  const along = way
    ? side === "n" || side === "s" ? way.x : way.y
    : side === "n" || side === "s" ? Math.max(0, Math.min(layout.width - 1, Math.floor(near[0] - layout.x))) : Math.max(0, Math.min(layout.height - 1, Math.floor(near[1] - layout.y)));
  const [ox, oz] = NORMAL[side];
  const wall: [number, number] = side === "n" ? [layout.x + along + 0.5, layout.y] : side === "s" ? [layout.x + along + 0.5, layout.y + layout.height] : side === "w" ? [layout.x, layout.y + along + 0.5] : [layout.x + layout.width, layout.y + along + 0.5];
  return {
    wall,
    out: [ox, oz],
    pad: [wall[0] + ox * 0.5, wall[1] + oz * 0.5],
    roof: [wall[0] - ox * 0.5, wall[1] - oz * 0.5],
    top,
  };
}
function nearestEdge(layout: EdgeLayout, [px, pz]: [number, number]): Edge {
  const gaps: [Edge, number][] = [["n", Math.abs(pz - layout.y)], ["s", Math.abs(pz - (layout.y + layout.height))], ["w", Math.abs(px - layout.x)], ["e", Math.abs(px - (layout.x + layout.width))]];
  return gaps.sort((a, b) => a[1] - b[1])[0][0];
}
