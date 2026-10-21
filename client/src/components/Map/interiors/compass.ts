// The compass (2026-10-21): which way the map's camera looks, in the points the user names a wall by. North is the top of every room's plan
// (the edge at y = 0, the scene's -z: interiors/packs.ts `facing` calls a piece on it the "north wall", and a piece against it faces south),
// east is +x. Pure (tests/interiors/compass.test.ts); Compass.tsx draws it.
export type Flat = { x: number; z: number };

// The bearing the screen's top points to, in radians clockwise from north (0 north, pi/2 east, pi south, -pi/2 west): the direction the
// camera looks along the ground plus the direction its "up" leans along it. Looking steeply down (the overhead view) the first is small and
// the second is large, looking level the other way round, so their sum is the heading either way.
export function bearingOf(look: Flat, up: Flat): number {
  const [x, z] = [look.x + up.x, look.z + up.z];
  return Math.atan2(x, -z);
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const pointOf = (bearing: number): string => POINTS[(((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8)];

// The wall of a room on a side of its plan, by the compass: the plan's own `n e s w` sides are north (y = 0), east (x = width), south, west
export const WALL_NAMES: Record<string, string> = { n: "north", e: "east", s: "south", w: "west" };
