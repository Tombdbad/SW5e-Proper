// ---------------------------------------------------------------------------------------------
// The station's inside (HOUSE RULES): the run from the port to the reactor and out again. It borrows
// the speeder race's rules: gates passed in order along a course, hazards on it (mines, as the race's),
// a hull that only an impact met head on costs (a graze costs nothing), a boost drawn from a meter that
// refills, and a fixed tick so that nothing passes through a wall. Unlike the race the course is a
// tunnel in the air, a chain of capsules round a centre line, then the reactor's chamber (a sphere with
// the core at its middle) and the exhaust shaft up from its top.
// The geometry is pure and static; what changes in the run (mines gone off, turrets shot out) is the
// `Interior` state in dogfight.ts. The scene builds the tunnel's mesh from the same arrays.
// ---------------------------------------------------------------------------------------------
import { createRandom, headingOf, type Vec3 } from "./index";

export const TUNNEL = {
  // Metres between points of the centre line, and its length; the base radius (raised for a big craft); the bend allowed a point
  step: 10, length: 2600, base: 26, curve: 0.036,
  // The reactor chamber's radius, the shaft's length and radius
  chamber: 125, shaft: 640, shaftRadius: 42,
  // How many of each there are on the way
  gates: 9, mines: 14, turrets: 10, doors: 3,
  // Where a mine goes off, and a turret's reach
  trigger: 8, turretRange: 260,
};

export interface TunnelGate { s: number; p: Vec3; r: number }
export interface TunnelMine { id: number; p: Vec3 }
// A turret on the wall: where it stands and the way it faces (into the tunnel)
export interface TunnelTurret { id: number; p: Vec3; n: Vec3; s: number }
// A blast door across the tunnel: its iris opens and shuts every `period` seconds
export interface TunnelDoor { id: number; s: number; p: Vec3; t: Vec3; r: number; period: number; phase: number }
export interface Tunnel {
  seed: number;
  step: number;
  points: Vec3[];
  radii: number[];
  tangents: Vec3[];
  length: number;
  gates: TunnelGate[];
  mines: TunnelMine[];
  turrets: TunnelTurret[];
  doors: TunnelDoor[];
  // The chamber: its middle, radius; the core at the middle; the shaft's two ends and radius
  chamber: { p: Vec3; r: number };
  core: { p: Vec3; r: number };
  shaft: { from: Vec3; to: Vec3; r: number };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const within = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Two axes at right angles to a direction along the tunnel
export function crossAxes(t: Vec3): { right: Vec3; up: Vec3 } {
  const right = unit(Math.abs(t[1]) > 0.97 ? cross(t, [1, 0, 0]) : cross(t, [0, 1, 0]));
  return { right, up: cross(right, t) };
}

// A tunnel from a seed. `reach` is the craft's largest half size: the tunnel is wide enough to fly (about three times it).
export function makeTunnel(seed: number, reach = 6): Tunnel {
  const r = createRandom(seed + 77);
  const n = Math.round(TUNNEL.length / TUNNEL.step);
  const base = Math.max(TUNNEL.base, reach * 3.4);
  const points: Vec3[] = [];
  const radii: number[] = [];
  let p: Vec3 = [0, 0, 0];
  let yaw = 0;
  let pitch = 0;
  let ky = 0;
  let kp = 0;
  const phase = r.next() * 6;
  for (let i = 0; i < n; i++) {
    points.push(p);
    radii.push(base * (0.84 + 0.16 * Math.sin(i * 0.09 + phase)) * (i < 6 ? 1.25 - i * 0.04 : 1));
    // A straight run in, then bends that come and go
    if (i > 24) {
      ky += (r.next() - 0.5) * 0.018 - ky * 0.07;
      kp += (r.next() - 0.5) * 0.01 - kp * 0.09 - pitch * 0.006;
      ky = within(ky, -TUNNEL.curve, TUNNEL.curve);
      kp = within(kp, -TUNNEL.curve * 0.5, TUNNEL.curve * 0.5);
      yaw += ky;
      pitch = within(pitch + kp, -0.32, 0.32);
    }
    p = add(p, mul(headingOf(yaw, pitch), TUNNEL.step));
  }
  const tangents = points.map((q, i) => unit(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]) as Vec3));
  const end = tangents[n - 1];
  const chamberP = add(points[n - 1], mul(end, TUNNEL.chamber * 0.97));
  const top = add(chamberP, [0, TUNNEL.chamber * 0.98, 0]);
  const length = (n - 1) * TUNNEL.step;

  // Gates: lit rings, evenly spaced after the run in
  const spacing = Math.floor((n - 30) / (TUNNEL.gates + 1));
  const gates: TunnelGate[] = Array.from({ length: TUNNEL.gates }, (_, k) => {
    const s = 22 + spacing * (k + 1);
    return { s, p: points[s], r: radii[s] * 0.62 };
  });
  const near = (s: number, avoid: number[], gap: number) => avoid.every((a) => Math.abs(a - s) > gap);
  const gateAt = gates.map((g) => g.s);

  // Doors: iris doors in the second half, clear of the gates
  const doors: TunnelDoor[] = [];
  for (let k = 0; k < TUNNEL.doors; k++) {
    let s = Math.floor(n * (0.4 + 0.17 * k) + r.next() * 6);
    while (!near(s, gateAt, 4)) s++;
    gateAt.push(s);
    doors.push({ id: k, s, p: points[s], t: tangents[s], r: radii[s] * 0.95, period: 6 + r.next() * 3, phase: r.next() });
  }
  // Mines hang in the tunnel clear of the gates and doors, more in the second half
  const mines: TunnelMine[] = [];
  for (let k = 0; mines.length < TUNNEL.mines && k < 400; k++) {
    const s = Math.floor(30 + r.next() * (n - 36));
    if (!near(s, gateAt, 3) || (s < n * 0.4 && r.chance(0.5))) continue;
    const { right, up } = crossAxes(tangents[s]);
    const a = r.next() * Math.PI * 2;
    const d = radii[s] * (0.15 + r.next() * 0.5);
    mines.push({ id: mines.length, p: add(points[s], add(mul(right, Math.cos(a) * d), mul(up, Math.sin(a) * d))) });
  }
  // Turrets on the walls, facing in
  const turrets: TunnelTurret[] = [];
  for (let k = 0; turrets.length < TUNNEL.turrets && k < 200; k++) {
    const s = Math.floor(50 + r.next() * (n - 60));
    const { right, up } = crossAxes(tangents[s]);
    const a = r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + (r.next() - 0.5) * 0.7;
    const out = add(mul(right, Math.cos(a)), mul(up, Math.sin(a)));
    turrets.push({ id: turrets.length, p: add(points[s], mul(out, radii[s] - 1)), n: mul(out, -1), s });
  }
  turrets.sort((a, b) => a.s - b.s);
  turrets.forEach((t, i) => (t.id = i));
  return { seed, step: TUNNEL.step, points, radii, tangents, length, gates, mines, turrets, doors, chamber: { p: chamberP, r: TUNNEL.chamber }, core: { p: chamberP, r: 15 }, shaft: { from: top, to: add(top, [0, TUNNEL.shaft, 0]), r: TUNNEL.shaftRadius } };
}

// The point of a segment nearest a position, and how far along it (0 to 1)
function onSegment(a: Vec3, b: Vec3, p: Vec3): { q: Vec3; u: number } {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  const u = within(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2, 0, 1);
  return { q: add(a, mul(ab, u)), u };
}

export interface Clearance {
  // How deep inside the free space the point is along the best volume (negative: in rock), and the middle of that volume's axis
  depth: number;
  q: Vec3;
  radius: number;
  // Which part of the tunnel it is in: a centre-line point's index, or the chamber or the shaft
  where: "tunnel" | "chamber" | "shaft";
  index: number;
}
// The free space is a chain of capsules, a sphere and a capsule up. `hint` is the centre-line index the craft was last at,
// searched a few points either side (pass -1 to look at the whole line).
export function clearanceAt(t: Tunnel, p: Vec3, hint = -1): Clearance {
  let best: Clearance = { depth: -Infinity, q: p, radius: 0, where: "tunnel", index: 0 };
  const n = t.points.length;
  const from = hint < 0 ? 0 : Math.max(0, hint - 12);
  const to = hint < 0 ? n - 2 : Math.min(n - 2, hint + 12);
  for (let i = from; i <= to; i++) {
    const { q, u } = onSegment(t.points[i], t.points[i + 1], p);
    const radius = t.radii[i] + (t.radii[i + 1] - t.radii[i]) * u;
    const depth = radius - len(sub(p, q));
    if (depth > best.depth) best = { depth, q, radius, where: "tunnel", index: u > 0.5 ? i + 1 : i };
  }
  const dc = t.chamber.r - len(sub(p, t.chamber.p));
  if (dc > best.depth) best = { depth: dc, q: t.chamber.p, radius: t.chamber.r, where: "chamber", index: n - 1 };
  const sh = onSegment(t.shaft.from, t.shaft.to, p);
  const ds = t.shaft.r - len(sub(p, sh.q));
  if (ds > best.depth) best = { depth: ds, q: sh.q, radius: t.shaft.r, where: "shaft", index: n - 1 };
  return best;
}

// A door's opening, 0 shut to 1 wide open, at a time: shut for a moment each period
export function doorOpen(d: TunnelDoor, t: number): number {
  const w = 0.5 + 0.5 * Math.cos(((t / d.period + d.phase) % 1) * Math.PI * 2);
  return within((w - 0.15) / 0.55, 0, 1);
}
// The radius of the hole in a door when it is `open`
export const doorHole = (d: TunnelDoor, open: number) => d.r * (0.12 + 0.88 * open);
