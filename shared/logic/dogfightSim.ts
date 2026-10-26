// ---------------------------------------------------------------------------------------------
// The dogfight's steps (HOUSE RULES; see dogfight.ts for the model). One call to `stepDogfight` advances the
// fight by the time given, in ticks of 1/60 s so that nothing passes through anything, and returns the same
// state (it is changed in place). Damage goes through the starship fight's `shipDamage`; what is a house rule
// here is how often things fire, how well they aim, how fast they fly, and what a capital ship's generators do.
// ---------------------------------------------------------------------------------------------
import { headingOf, shipDamage, type Vec3 } from "./index";
import {
  AIR, ARENA, CLASSES, STATION, classIndex, clamp, foeSheet, frameOf, isCapital, makeVessel, toLocal, toWorld, turned, vadd, vdist, vdot, vlen, vmul, vnorm, vsub, wrapAngle,
  type Dogfight, type DogfightInput, type Fx, type Gun, type HullVolume, type Interior, type Part, type Projectile, type Vessel,
} from "./dogfight";
import { TUNNEL, clearanceAt, crossAxes, doorHole, doorOpen, makeTunnel } from "./tunnel";

// ---- Dice and chances
// (`again`: a weapon system that rolls a 1 or a 2 on a damage die again)
export function rolled(expr: string, roll: () => number, again = false): number {
  const m = expr.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  if (!m) return Number(expr) || 0;
  let total = Number(m[3] ?? 0);
  for (let i = 0; i < Number(m[1]); i++) {
    let die = 1 + Math.floor(roll() * Number(m[2]));
    if (again && die <= 2) die = 1 + Math.floor(roll() * Number(m[2]));
    total += die;
  }
  return total;
}
const mean = (expr: string) => {
  const m = expr.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 + Number(m[3] ?? 0) : Number(expr) || 0;
};
const abilityMod = (score: number) => Math.floor((score - 10) / 2);
// d20 + attack against AC, as a chance
const toHit = (bonus: number, ac: number) => clamp((21 + bonus - ac) / 20, 0.05, 0.95);

// Seconds a ship's explosion lasts, by class
const DYING: Record<string, number> = { Tiny: 0.5, Small: 0.7, Medium: 1.6, Large: 3.2, Huge: 5.5, Gargantuan: 8, Station: 9 };
// Bolts of a turret: metres a second, and the share of a moving target's travel they are aimed ahead by
// (house rule: a big turret's bolt only glances off a small craft's shields and rolling hull: `small` of its dice to a Tiny to Medium craft)
const BOLT = { speed: 230, lead: 0.8, error: 0.011, small: 0.55 };
// Ordnance in flight: speed, turn (rad/s), life, fuse distance
const ORD: Record<string, { speed: number; turn: number; life: number; fuse: number }> = {
  missile: { speed: 175, turn: 2.1, life: 6.5, fuse: 9 },
  torpedo: { speed: 120, turn: 1.0, life: 9, fuse: 12 },
  rocket: { speed: 210, turn: 0.3, life: 3.2, fuse: 7 },
  bomb: { speed: 0, turn: 0, life: 6, fuse: 10 },
};
// Point defense: the chance a shot brings down a missile, torpedo or rocket (the heavier the less), and the reach of the bays' launch
const PD = { kill: { missile: 0.34, torpedo: 0.2, rocket: 0.42 } as Record<string, number>, hit: 0.1, range: 230 };
const HANGAR = { alert: 900, every: 9, cap: { Huge: 2, Gargantuan: 3, Station: 3 } as Record<string, number> };

export const partyOf = (s: Dogfight): Vessel => s.vessels.find((v) => v.id === s.me)!;
export const isDown = (v: Vessel) => v.dying > 0 || v.c.destroyed || (v.side === "foe" && v.c.disabled) || (!!v.ground && v.c.hull <= 0);
export const hostiles = (s: Dogfight, v: Vessel) => s.vessels.filter((o) => o.side !== v.side && !isDown(o));
const generatorsUp = (v: Vessel) => v.parts.some((p) => p.kind === "generator" && p.alive);
// A foe capital ship is shielded by its generators; the party's own big ship keeps the sheet's shield pool
export const shielded = (v: Vessel) => v.side === "foe" && isCapital(v.cls) && generatorsUp(v);
export const partWorld = (v: Vessel, part: Part): Vec3 => toWorld(v, part.at);
const say = (s: Dogfight, line: string) => {
  s.said.push(line);
  s.log.push(line);
  if (s.log.length > 60) s.log.shift();
};
const boom = (s: Dogfight, p: Vec3, size: number, kind: Fx["kind"] = "boom", by?: number) => s.fx.push({ kind, p, size, by });

// ---- Hulls: an ellipsoid (small craft, the station) or a convex solid of planes (the capital ships), in the vessel's own frame
export interface HullBody { p: Vec3; yaw: number; pitch: number; half: Vec3; volume: HullVolume }
// Where a ray meets a vessel's hull: the distance along it, 0 when it starts inside, null when it misses
export function hullRay(v: HullBody, origin: Vec3, dir: Vec3): number | null {
  const { f, u, r } = frameOf(v.yaw, v.pitch);
  const o = vsub(origin, v.p);
  const lo: Vec3 = [vdot(o, f), vdot(o, u), vdot(o, r)];
  const ld: Vec3 = [vdot(dir, f), vdot(dir, u), vdot(dir, r)];
  if (v.volume.kind === "ellipsoid") {
    const sc = (a: Vec3): Vec3 => [a[0] / v.half[0], a[1] / v.half[1], a[2] / v.half[2]];
    const so = sc(lo);
    const sd = sc(ld);
    const a = vdot(sd, sd);
    const b = 2 * vdot(so, sd);
    const c = vdot(so, so) - 1;
    if (c <= 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a === 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 ? t : null;
  }
  // A convex solid: the ray is clipped by each plane (n.p <= d); it enters at the last entry and leaves at the first exit
  let enter = 0;
  let leave = Infinity;
  for (const pl of v.volume.planes) {
    const slope = vdot(pl.n, ld);
    const room = pl.d - vdot(pl.n, lo);
    if (Math.abs(slope) < 1e-9) {
      if (room < 0) return null;
      continue;
    }
    const t = room / slope;
    if (slope < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return null;
  }
  return leave < 0 ? null : enter;
}
export interface HullHit { inside: boolean; depth: number; normal: Vec3; surface: Vec3 }
// Whether a point is inside the hull grown by `grow` metres, how deep, the surface's normal there (out of the hull) and the point on the surface
// that the point is pushed to
export function hullPoint(v: HullBody, p: Vec3, grow = 0): HullHit {
  const { f, u, r } = frameOf(v.yaw, v.pitch);
  const d = vsub(p, v.p);
  const l: Vec3 = [vdot(d, f), vdot(d, u), vdot(d, r)];
  const world = (a: Vec3): Vec3 => [f[0] * a[0] + u[0] * a[1] + r[0] * a[2], f[1] * a[0] + u[1] * a[1] + r[1] * a[2], f[2] * a[0] + u[2] * a[1] + r[2] * a[2]];
  if (v.volume.kind === "ellipsoid") {
    const [hx, hy, hz] = v.half;
    const k = Math.hypot(l[0] / (hx + grow), l[1] / (hy + grow), l[2] / (hz + grow));
    const g = vnorm([l[0] / (hx * hx), l[1] / (hy * hy), l[2] / (hz * hz)]);
    const normal: Vec3 = vlen(l) < 1e-6 ? [0, 1, 0] : g;
    return { inside: k < 1, depth: (1 - k) * Math.min(hx, hy, hz), normal: world(normal), surface: vadd(v.p, world(vmul(l, 1 / Math.max(k, 0.01)))) };
  }
  let best = Infinity;
  let n: Vec3 = [0, 1, 0];
  for (const pl of v.volume.planes) {
    const room = pl.d + grow - vdot(pl.n, l);
    if (room < best) {
      best = room;
      n = pl.n;
    }
  }
  return { inside: best > 0, depth: best, normal: world(n), surface: vadd(v.p, world(vadd(l, vmul(n, best)))) };
}

// ---- Damage
// Damage to a vessel's hull and shields. A capital ship's hull takes none while a generator stands; a station's armor holds at `STATION.floor`
export function damageVessel(s: Dogfight, v: Vessel, amount: number, type: string, at: Vec3, by: number, src = "other"): "absorbed" | "hit" | "down" | "none" {
  if (isDown(v) || amount <= 0) return "none";
  if (shielded(v)) {
    boom(s, at, 1 + amount / 14, "shield", by);
    return "absorbed";
  }
  // Armor turns aside shots but not warheads (house rule): its damage reduction does not apply to missiles, torpedoes, rockets and bombs
  const warhead = src === "missile" || src === "torpedo" || src === "rocket" || src === "bomb";
  const res = shipDamage(v.c, Math.max(1, Math.round(amount)), type, { attack: !warhead });
  v.c = res.ship;
  v.calm = 0;
  if (v.id === s.me) s.taken[src] = (s.taken[src] ?? 0) + res.shield + res.hull;
  if (v.cls === "Station") {
    const floor = Math.ceil(v.c.sheet.hullMax * STATION.floor);
    if (v.c.hull < floor) v.c = { ...v.c, hull: floor, destroyed: false, disabled: false };
  }
  if (res.shield > 0 && res.hull === 0) boom(s, at, 0.6 + amount / 20, "shield", by);
  else boom(s, at, 0.5 + amount / 24, "spark", by);
  if (v.id !== s.me && isDown(v)) {
    destroy(s, v, by);
    return "down";
  }
  return "hit";
}
function destroy(s: Dogfight, v: Vessel, by: number) {
  if (v.dying > 0) return;
  v.dying = DYING[v.cls] ?? 1;
  const mine = by === s.me || by < 0;
  if (v.side === "foe") {
    const key = v.ground ? v.ground.kind : v.cls;
    s.kills[key] = (s.kills[key] ?? 0) + 1;
    say(s, v.ground || v.c.destroyed ? `${v.name} is destroyed.` : `${v.name} is disabled and drifts.`);
  } else if (v.ground && s.air) {
    s.air.lost++;
    say(s, `${v.name} is destroyed!`);
  }
  void mine;
  boom(s, v.p, CLASSES[v.cls].length * 0.35, "wreck", by);
  if (s.lock === v.id) s.lock = null;
}
function damagePart(s: Dogfight, v: Vessel, part: Part, amount: number, at: Vec3, by: number) {
  if (!part.alive || part.kind === "port" || amount <= 0) return;
  part.hp -= amount;
  boom(s, at, 0.6 + amount / 20, "spark", by);
  if (part.hp > 0) return;
  part.alive = false;
  part.hp = 0;
  s.partsDown[part.kind] = (s.partsDown[part.kind] ?? 0) + 1;
  boom(s, partWorld(v, part), part.kind === "generator" ? part.r * 1.6 : part.r * 1.1, "boom", by);
  if (s.lock === v.id && s.lockPart === part.id) s.lockPart = -1;
  if (part.kind === "generator") say(s, generatorsUp(v) ? `${v.name}: a shield generator is down.` : `${v.name}: the shields are down!`);
  else if (part.kind === "hangar") say(s, `${v.name}: a hangar bay is destroyed.`);
  else if (part.kind === "battery" || part.kind === "pd") say(s, `${v.name}: a turret is silenced (${v.parts.filter((p) => (p.kind === "battery" || p.kind === "pd") && p.alive).length} left).`);
}

// ---- Aim: the vessel (and part of it) the reticule is on, within a weapon's range
// Whether a part can be seen from a point: the hull of its own ship does not stand between (a turret under the keel is out of sight above the deck)
export function partVisible(v: Vessel, part: Part, from: Vec3): boolean {
  const wp = partWorld(v, part);
  const d = vsub(wp, from);
  const dist = vlen(d);
  if (dist < 1) return true;
  const t = hullRay(v, from, vmul(d, 1 / dist));
  return t === null || t >= dist - part.r - 12;
}
// What can be chosen as the target on a ship: its turrets, generators and hangar bays that are standing and in sight within `range`, nearest
// first. The order is by bands of 40 metres, and by number within a band: a pair of turrets either side of the craft are as near as each other, and
// ordered by their distances alone they would change places with every step and the key would go back and forth between them.
export const SUBTARGETS = ["battery", "pd", "generator", "hangar"];
export function subTargets(v: Vessel, from: Vec3, range: number): Part[] {
  const band = (p: Part) => Math.round(vdist(partWorld(v, p), from) / 40);
  return v.parts
    .filter((p) => p.alive && SUBTARGETS.includes(p.kind) && vdist(partWorld(v, p), from) <= range && partVisible(v, p, from))
    .sort((a, b) => band(a) - band(b) || a.id - b.id);
}
export interface AimPoint { vessel: number; part: number; dist: number; point: Vec3 }
// What is on the reticule (along the nose) or, with `ray`, under the cursor (along the ray from the camera through it: `dist` is then from the
// ray's origin, and `range` should allow for the camera standing behind the craft)
export function aimFrom(s: Dogfight, from: Vessel, range: number, lockOnly = true, ray?: { o: Vec3; d: Vec3 }): AimPoint | null {
  const f = ray ? vnorm(ray.d) : headingOf(from.yaw, from.pitch);
  const origin = ray ? ray.o : from.p;
  const assist = ray ? ARENA.cursorAssist : ARENA.assist;
  let best: { score: number; aim: AimPoint } | null = null;
  const candidates = s.lock !== null && lockOnly ? hostiles(s, from).filter((o) => o.id === s.lock) : hostiles(s, from);
  for (const o of candidates) {
    const d = vsub(o.p, origin);
    const dist = vlen(d);
    if (dist > range + o.reach) continue;
    // Parts first: a turret, generator or bay the reticule is on
    for (const part of o.parts) {
      if (!part.alive || part.kind === "port") continue;
      const wp = partWorld(o, part);
      const dp = vsub(wp, origin);
      const dd = vlen(dp);
      if (dd > range) continue;
      const ang = Math.acos(clamp(vdot(f, dp) / (dd || 1), -1, 1));
      const size = Math.asin(Math.min(1, part.r / (dd || 1)));
      const chosen = o.id === s.lock && s.lockPart === part.id;
      if (ang - size <= assist * (chosen ? ARENA.subAssist : 0.45) && partVisible(o, part, from.p)) {
        const score = Math.max(0, ang - size) + dd * 1e-5 - (chosen ? 1 : 0);
        if (!best || score < best.score) best = { score, aim: { vessel: o.id, part: part.id, dist: dd, point: wp } };
      }
    }
    if (isCapital(o.cls) || o.cls === "Large") {
      const t = hullRay(o, origin, f);
      if (t !== null && t <= range) {
        const score = 0.4 + t * 1e-5;
        if (!best || score < best.score) best = { score, aim: { vessel: o.id, part: -1, dist: t, point: vadd(origin, vmul(f, t)) } };
      }
      continue;
    }
    // A small craft: within the assist cone, wider by the craft's own size
    const ang = Math.acos(clamp(vdot(f, d) / (dist || 1), -1, 1));
    const size = Math.asin(Math.min(1, o.reach / (dist || 1)));
    if (dist <= range && ang - size <= assist) {
      const score = 0.1 + Math.max(0, ang - size) + dist * 1e-5;
      if (!best || score < best.score) best = { score, aim: { vessel: o.id, part: -1, dist, point: o.p } };
    }
  }
  return best?.aim ?? null;
}

// ---- Firing
function muzzle(v: Vessel, side: number): Vec3 {
  return toWorld(v, [v.reach * 0.7, 0, side * Math.min(v.reach * 0.5, 4)], v.side === "party" ? v.roll : 0);
}
function spawn(s: Dogfight, b: Omit<Projectile, "id" | "armed">): Projectile {
  const shot: Projectile = { ...b, id: s.nextId++, armed: 0 };
  s.shots.push(shot);
  return shot;
}
// A feedback shield (an upgrade) strikes back at the ship that hit the party's craft with a cannon or a turret
function strikeBack(s: Dogfight, me: Vessel, by: number, roll: () => number) {
  const dice = me.c.sheet.feedback;
  if (!dice || me.id !== s.me) return;
  const foe = s.vessels.find((v) => v.id === by && v.side === "foe");
  if (foe && !isDown(foe)) damageVessel(s, foe, rolled(dice, roll), "energy", foe.p, me.id, "party");
}
const sheetAttack = (v: Vessel) => v.c.sheet.proficiency + abilityMod(v.c.sheet.abilities.dexterity);

// Where a laser that hits nothing ends: `range` on from the muzzle, toward where the cursor's ray is `range` beyond the craft, or straight
// ahead of the nose when the guns are aimed by the reticule
function farPoint(me: Vessel, input: DogfightInput, from: Vec3, range: number): Vec3 {
  if (!input.aim) return vadd(me.p, vmul(headingOf(me.yaw, me.pitch), range));
  const d = vnorm(input.aim.d);
  const beyond = vadd(input.aim.o, vmul(d, Math.max(0, vdot(vsub(me.p, input.aim.o), d)) + range));
  return vadd(from, vmul(vnorm(vsub(beyond, from)), range));
}

// The party's guns: lasers fire at what the reticule is on, or at what is under the cursor (the guns follow it: house rule, `input.aim`);
// batteries and point defense are turrets that pick their own targets
function fireParty(s: Dogfight, me: Vessel, input: DogfightInput, h: number, roll: () => number) {
  const aim = s.aim;
  let side = 1;
  for (const g of me.guns) {
    g.wait = Math.max(0, g.wait - h);
    if (g.wait > 0) continue;
    if (g.kind === "laser") {
      if (!input.fire) continue;
      g.wait = g.reload;
      s.fired++;
      side = -side;
      const from = muzzle(me, side);
      if (!aim || aim.dist > g.range) {
        s.events.push({ from, to: farPoint(me, input, from, g.range), by: "player", hit: false, at: s.t });
        continue;
      }
      const target = s.vessels.find((v) => v.id === aim.vessel)!;
      const part = aim.part >= 0 ? target.parts[aim.part] : null;
      const hit = roll() < toHit(sheetAttack(me) + g.bonus, part ? 10 : target.ac) * ARENA.aimParty;
      s.events.push({ from, to: aim.point, by: "player", hit, at: s.t });
      if (!hit) continue;
      s.hits++;
      const dmg = rolled(g.dice, roll, g.reroll) + g.plus;
      if (part) damagePart(s, target, part, dmg, aim.point, me.id);
      else damageVessel(s, target, dmg, g.ionizing ? "ion" : g.type, aim.point, me.id, "party");
    } else if (g.kind === "battery" || g.kind === "pd") {
      // Turrets: the locked target, else the nearest foe in range, from anywhere on the hull
      const targets = hostiles(s, me).filter((o) => vdist(o.p, me.p) <= g.range + o.reach);
      const target = (s.lock !== null ? targets.find((o) => o.id === s.lock) : undefined) ?? targets.sort((a, b) => vdist(a.p, me.p) - vdist(b.p, me.p))[0];
      if (!target) continue;
      g.wait = g.reload;
      const from = toWorld(me, [0, me.half[1] + 2, (roll() < 0.5 ? -1 : 1) * me.half[2] * 0.6]);
      const hit = roll() < toHit(sheetAttack(me) + g.bonus, target.ac) * ARENA.aimParty;
      s.events.push({ from, to: target.p, by: "player", hit, at: s.t, heavy: g.kind === "battery" });
      if (hit) damageVessel(s, target, rolled(g.dice, roll, g.reroll) + g.plus, g.type, target.p, me.id, "party");
    }
  }
  // Ordnance: the chosen launcher's missile, a bomb dropped
  const ord = me.guns.filter((g) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket");
  if (ord.length) {
    s.sel = ((s.sel % ord.length) + ord.length) % ord.length;
    if (ord[s.sel].ammo <= 0) {
      const next = ord.findIndex((g) => g.ammo > 0);
      if (next >= 0) s.sel = next;
    }
    const g = ord[s.sel];
    if (input.missile && g.ammo > 0 && g.wait <= 0) {
      g.ammo--;
      g.wait = g.reload;
      // A part chosen as the target is what the warhead homes on; else what the reticule is on, else the ship that is locked
      const chosen = s.lock !== null && s.lockPart >= 0 && s.vessels.find((v) => v.id === s.lock)?.parts[s.lockPart]?.alive ? { vessel: s.lock, part: s.lockPart } : null;
      launch(s, me, g, chosen ?? aim ?? (s.lock !== null ? { vessel: s.lock, part: -1 } : null), roll);
    }
  }
  const bomb = me.guns.find((g) => g.kind === "bomb" && g.ammo > 0);
  if (bomb && input.bomb && bomb.wait <= 0) {
    bomb.ammo--;
    bomb.wait = bomb.reload;
    spawnBomb(s, me, bomb, bombRelease(me));
    s.events.push({ from: me.p, to: me.p, by: "player", hit: false, at: s.t });
  }
}
function launch(s: Dogfight, from: Vessel, g: Gun, aim: { vessel: number; part: number } | null, roll: () => number, at?: Vec3) {
  const f = headingOf(from.yaw, from.pitch);
  const o = ORD[g.kind];
  const p = at ?? vadd(from.p, vmul(f, from.reach + 4));
  // (house rule: a foe's warheads are older stock; they turn at half the rate, so that a hard break at the last moment makes them overshoot)
  const turn = o.turn * (from.side === "foe" ? 0.5 : 1);
  const spread = g.kind === "rocket" ? 0.05 : 0.01;
  const dir = vnorm([f[0] + (roll() - 0.5) * spread * 2, f[1] + (roll() - 0.5) * spread * 2, f[2] + (roll() - 0.5) * spread * 2]);
  spawn(s, {
    kind: g.kind as Projectile["kind"], by: from.id, side: from.side, p, v: vmul(dir, o.speed + Math.max(0, from.speed) * 0.5), life: o.life, dice: g.dice, type: g.type, radius: g.radius,
    target: aim ? aim.vessel : null, part: aim ? aim.part : -1, turn, fuse: o.fuse, bonus: g.plus, reroll: g.reroll, dc: g.dc,
  });
  boom(s, p, 1, "launch", from.id);
}

// ---- Foes
// How a fighter keeps from the party's craft: distance bands in metres, by class
const BAND: Record<string, [number, number]> = { Tiny: [50, 110], Small: [70, 140], Medium: [140, 260] };

// A foe's steering, as a point it wants to fly toward: at the craft when it is far, away from it when it is too close (it breaks off and
// comes round again), and across it at the middle distance so that it does not fly straight into the line of fire. Bodies it could
// collide with are a -1 signal that pushes it off.
function foeAim(s: Dogfight, foe: Vessel, me: Vessel): Vec3 {
  const [near, far] = BAND[foe.cls] ?? BAND.Small;
  const to = vsub(me.p, foe.p);
  const dist = vlen(to) || 1;
  const unit = vmul(to, 1 / dist);
  let seek: Vec3;
  if (dist > far) seek = unit;
  else if (dist < near || foe.ai.breakUntil > s.t) {
    if (foe.ai.breakUntil <= s.t) foe.ai.breakUntil = s.t + 1.6;
    const side: Vec3 = [-unit[2], 0, unit[0]];
    seek = [-unit[0] + side[0] * 0.6 * foe.ai.side, -unit[1] + 0.2, -unit[2] + side[2] * 0.6 * foe.ai.side];
  } else {
    seek = [unit[0] - unit[2] * 0.5 * foe.ai.side, unit[1], unit[2] + unit[0] * 0.5 * foe.ai.side];
  }
  for (const body of s.vessels) {
    if (body.id === foe.id || isDown(body)) continue;
    if (classIndex(body.cls) >= classIndex("Large")) {
      // A hull: out and away from its middle while inside the margin round it
      const near = hullPoint(body, foe.p, foe.reach + 40);
      if (near.inside) seek = vadd(seek, vmul(near.normal, 1 + 3 * Math.min(1, near.depth / 60)));
      continue;
    }
    const d = vsub(foe.p, body.p);
    const gap = vlen(d);
    const margin = foe.reach + body.reach + 25;
    if (gap >= margin || gap === 0) continue;
    seek = vadd(seek, vmul(d, (3 * (margin - gap)) / margin / gap));
  }
  return seek;
}
// Turns a vessel toward a heading by at most its turn rate, and flies it on at its speed
function flyToward(v: Vessel, aim: Vec3, h: number, speed: number) {
  const len = vlen(aim) || 1;
  const yaw = Math.atan2(aim[2] / len, aim[0] / len);
  const pitch = Math.asin(clamp(aim[1] / len, -1, 1));
  const step = v.turn * h;
  v.yaw += clamp(wrapAngle(yaw - v.yaw), -step, step);
  v.pitch += clamp(wrapAngle(pitch - v.pitch), -step, step);
  v.pitch = clamp(v.pitch, -ARENA.pitchLimit, ARENA.pitchLimit);
  v.speed += clamp(speed - v.speed, -v.accel * h, v.accel * h);
  v.roll += (clamp(wrapAngle(yaw - v.yaw) * 0.8, -0.7, 0.7) - v.roll) * Math.min(1, 3 * h);
}
function advance(v: Vessel, h: number) {
  const f = headingOf(v.yaw, v.pitch);
  v.p = [v.p[0] + f[0] * v.speed * h, v.p[1] + f[1] * v.speed * h, v.p[2] + f[2] * v.speed * h];
}

// ---- In the air of a planet (house rules, dogfight.ts): the ground, bombs that fall, the pieces on the ground and the bombers' runs
// Where a bomb let go at `p` with velocity `vel` meets the ground, and when
export function bombFall(p: Vec3, vel: Vec3, gravity: number): { at: Vec3; t: number } {
  const t = (vel[1] + Math.sqrt(Math.max(0, vel[1] * vel[1] + 2 * gravity * Math.max(0, p[1])))) / gravity;
  return { at: [p[0] + vel[0] * t, 0, p[2] + vel[2] * t], t };
}
const fallOf = (s: Dogfight) => AIR.gravity * (s.air?.g ?? 1);
// A bomb as it leaves the craft: just ahead of the nose, at the craft's own velocity
export function bombRelease(v: Vessel): { p: Vec3; vel: Vec3 } {
  const f = headingOf(v.yaw, v.pitch);
  return { p: vadd(v.p, vmul(f, v.reach + 3)), vel: vmul(f, Math.max(v.speed, 8)) };
}
// What a bomber goes for: one of the other side's pieces on the ground that stands, each bomber its own (by its place among the bombers),
// the nearest first
const bombTarget = (s: Dogfight, v: Vessel) => {
  const left = s.vessels.filter((o) => o.ground && o.side !== v.side && !isDown(o)).sort((a, b) => a.id - b.id);
  if (!left.length) return undefined;
  const bombers = s.vessels.filter((o) => o.side === v.side && !o.ground && !isDown(o) && o.guns.some((g) => g.kind === "bomb" && g.ammo > 0));
  const k = Math.max(0, bombers.indexOf(v));
  return left[k % left.length];
};
// A heading that keeps a flyer off the ground: up, the harder the lower it is
function keepUp(s: Dogfight, v: Vessel, aim: Vec3): Vec3 {
  if (!s.air) return aim;
  const len = vlen(aim) || 1;
  const low = AIR.floor + v.reach - v.p[1];
  return low > 0 ? [aim[0], Math.max(aim[1], (len * low) / 25), aim[2]] : aim;
}
// A bomber with bombs left flies at its run height toward where its bombs must leave to fall on the target, and lets them go there
function bomberRun(s: Dogfight, v: Vessel, h: number): boolean {
  const bomb = v.guns.find((g) => g.kind === "bomb" && g.ammo > 0);
  const target = s.air && bomb ? bombTarget(s, v) : undefined;
  if (!bomb || !target) return false;
  const rel = bombRelease(v);
  const fall = bombFall(rel.p, rel.vel, fallOf(s));
  const miss = vsub(target.p, fall.at);
  const flat = Math.hypot(miss[0], miss[2]);
  // Over the release point: a bomb goes (one a pass: the blast reaches a building it falls beside)
  bomb.wait = Math.max(0, bomb.wait - h);
  if (flat < Math.max(14, target.reach + bomb.radius * 0.4) && bomb.wait <= 0) {
    bomb.ammo--;
    bomb.wait = 4;
    spawnBomb(s, v, bomb, rel);
    say(s, `${v.name} is bombing ${target.name}!`);
    v.ai.breakUntil = s.t + 7;
  }
  // Past the target, or just bombed: on out for a while, then round for another run (it cannot turn tight enough to circle it)
  const to = vsub(target.p, v.p);
  const ahead = vdot(headingOf(v.yaw, 0), vnorm([to[0], 0, to[2]]));
  if (v.ai.breakUntil <= s.t && ahead < 0 && Math.hypot(to[0], to[2]) < 450) v.ai.breakUntil = s.t + 6;
  if (v.ai.breakUntil > s.t) {
    flyToward(v, keepUp(s, v, [Math.cos(v.yaw), clamp((AIR.bombRun - v.p[1]) / 60, -0.4, 0.4), Math.sin(v.yaw)]), h, v.top * 0.9);
    return true;
  }
  // Toward the target, at the height of the run (the lead: where the bombs would land is put on it)
  const dx = target.p[0] - v.p[0] + miss[0] * 0.3;
  const dz = target.p[2] - v.p[2] + miss[2] * 0.3;
  const across = Math.hypot(dx, dz) || 1;
  flyToward(v, keepUp(s, v, [dx, clamp((AIR.bombRun - v.p[1]) / 60, -0.4, 0.4) * across, dz]), h, v.top * 0.9);
  return true;
}
function spawnBomb(s: Dogfight, v: Vessel, bomb: Gun, rel: { p: Vec3; vel: Vec3 }) {
  spawn(s, { kind: "bomb", by: v.id, side: v.side, p: rel.p, v: rel.vel, life: s.air ? AIR.bombLife : ORD.bomb.life, dice: bomb.dice, type: bomb.type, radius: bomb.radius, target: null, part: -1, turn: 0, fuse: ORD.bomb.fuse, bonus: bomb.plus, reroll: bomb.reroll, dc: bomb.dc });
  boom(s, vadd(v.p, vmul(headingOf(v.yaw, v.pitch), v.reach)), 1, "launch", v.id);
}
// A piece on the ground: a vehicle drives its route (the leg's end, then the next), a flak turret turns its guns on the party's craft
function stepGround(s: Dogfight, v: Vessel, me: Vessel, h: number) {
  const role = v.ground!;
  if (isDown(v)) return;
  if (role.kind === "flak" && !role.route) {
    const to = vsub(me.p, v.p);
    const len = vlen(to) || 1;
    v.yaw = Math.atan2(to[2], to[0]);
    v.pitch = Math.asin(clamp(to[1] / len, -1, 1));
  }
  if (!role.route || role.arrived) return;
  const leg = role.leg ?? 0;
  const goal = role.route[Math.min(leg + 1, role.route.length - 1)];
  const to = vsub([goal[0], v.p[1], goal[2]], v.p);
  const dist = Math.hypot(to[0], to[2]);
  if (dist < 8) {
    if (leg + 2 >= role.route.length) {
      role.arrived = true;
      v.speed = 0;
      if (s.air) {
        s.air.arrived++;
        say(s, `${v.name} ${v.side === "party" ? "gets through" : "gets away"}.`);
      }
      return;
    }
    role.leg = leg + 1;
    return;
  }
  v.yaw = Math.atan2(to[2], to[0]);
  v.pitch = 0;
  v.speed = v.top;
  advance(v, h);
  // a flak speeder in a convoy keeps its guns on the party's craft as it drives (the guns turn, not the hull: `aimYaw` for the scene)
}

function moveFoe(s: Dogfight, v: Vessel, me: Vessel, h: number) {
  if (isDown(v)) {
    // A wreck drifts on and slows (in the air it falls, and stops on the ground)
    v.speed *= 1 - Math.min(1, 0.4 * h);
    if (s.air && !v.ground) {
      v.pitch = Math.max(-1.2, v.pitch - 0.8 * h);
      if (v.p[1] <= v.half[1]) v.speed = 0;
    }
    if (!v.ground) advance(v, h);
    if (s.air) v.p[1] = Math.max(v.half[1] * 0.5, v.p[1]);
    return;
  }
  if (v.ground) return stepGround(s, v, me, h);
  if (v.cls === "Station") return;
  if (classIndex(v.cls) <= classIndex("Medium")) {
    if (!bomberRun(s, v, h)) flyToward(v, keepUp(s, v, foeAim(s, v, me)), h, v.top);
    advance(v, h);
    if (s.air) v.p[1] = Math.max(v.reach, v.p[1]);
    return;
  }
  // The larger ships hold course; they turn toward the party only when it is behind them, and back toward the arena if they stray
  const to = vsub(me.p, v.p);
  const bearing = Math.abs(wrapAngle(Math.atan2(to[2], to[0]) - v.yaw));
  const stray = vlen([v.p[0], 0, v.p[2]]) > 1700;
  let aim: Vec3;
  if (stray) aim = [-v.p[0], 0, -v.p[2]];
  else if (v.cls === "Large") aim = vlen(to) > 380 ? to : [-to[2], 0, to[0]];
  else aim = bearing > 1.9 ? to : headingOf(v.yaw, 0);
  aim = [aim[0], 0, aim[2]];
  flyToward(v, aim, h, v.top);
  v.pitch = 0;
  advance(v, h);
}

function foeFire(s: Dogfight, v: Vessel, me: Vessel, h: number, roll: () => number) {
  if (isDown(v) || me.c.hull <= 0) return;
  const f = headingOf(v.yaw, v.pitch);
  const to = vsub(me.p, v.p);
  const dist = vlen(to);
  const facing = dist ? vdot(f, to) / dist : 0;
  v.ai.fire -= h;
  v.ai.missile -= h;
  for (const g of v.guns) g.wait = Math.max(0, g.wait - h);
  // Lasers: a shot when in range and facing; the chance is d20 + attack against AC, spoiled by the foe's aim
  if (v.ai.fire <= 0 && classIndex(v.cls) <= classIndex("Medium")) {
    const guns = v.guns.filter((g) => g.kind === "laser" || (g.kind === "battery" && g.turret));
    // (flak turns its guns on the craft wherever it is: it need not face it, and it reaches further)
    const flak = v.ground?.kind === "flak";
    for (const g of guns) {
      const range = flak ? Math.max(g.range, 420) : Math.min(g.range, 240);
      if (g.wait > 0 || dist > range || (!flak && facing < Math.cos(0.5))) continue;
      g.wait = Math.max(g.reload, ARENA.foeReload) * (1 + roll() * 0.4);
      const hit = roll() < toHit(sheetAttack(v) + g.bonus, me.ac) * ARENA.aimFoe;
      s.events.push({ from: muzzle(v, roll() < 0.5 ? -1 : 1), to: me.p, by: "foe", hit, at: s.t });
      if (hit) {
        damageVessel(s, me, rolled(g.dice, roll), g.ionizing ? "ion" : g.type, me.p, v.id, "laser");
        strikeBack(s, me, v.id, roll);
      }
    }
    v.ai.fire = 0.25;
  }
  // Ordnance: a homing missile or torpedo at the party now and then (a big ship's tubes need no facing)
  const arc = classIndex(v.cls) >= classIndex("Large") || v.ground?.kind === "flak" ? -1 : 0.8;
  if (v.ai.missile <= 0 && dist > 140 && dist < (arc < 0 ? 700 : 420) && facing > arc) {
    const g = v.guns.find((x) => (x.kind === "missile" || x.kind === "torpedo" || x.kind === "rocket") && x.ammo > 0);
    if (g) {
      g.ammo--;
      v.ai.missile = 15 + roll() * 8;
      launch(s, v, g, { vessel: me.id, part: -1 }, roll);
      say(s, `${v.name} fires a ${g.kind}!`);
    }
  }
}

// The way a part faces: out from the hull's middle along the surface's normal. A turret cannot fire through its own ship, so it covers the
// hemisphere it faces (a little more); a craft under a dorsal turret is safe from it.
export function partFacing(v: Vessel, part: Part): Vec3 {
  const grad: Vec3 = vnorm([part.at[0] / (v.half[0] * v.half[0]), part.at[1] / (v.half[1] * v.half[1]), part.at[2] / (v.half[2] * v.half[2])]);
  const { f, u, r } = frameOf(v.yaw, v.pitch);
  return vnorm([f[0] * grad[0] + u[0] * grad[1] + r[0] * grad[2], f[1] * grad[0] + u[1] * grad[1] + r[1] * grad[2], f[2] * grad[0] + u[2] * grad[1] + r[2] * grad[2]]);
}
const covers = (v: Vessel, part: Part, from: Vec3, to: Vec3, slack = 0.1) => {
  const d = vsub(to, from);
  const l = vlen(d) || 1;
  return vdot(partFacing(v, part), vmul(d, 1 / l)) > -slack;
};

// A capital ship's turrets, point defense and hangars
function stepParts(s: Dogfight, v: Vessel, me: Vessel, h: number, roll: () => number) {
  if (isDown(v) || !v.parts.length) return;
  const dist0 = vdist(v.p, me.p);
  for (const part of v.parts) {
    if (!part.alive) continue;
    part.wait = Math.max(0, part.wait - h);
    if (part.wait > 0) continue;
    const at = partWorld(v, part);
    if (part.kind === "battery" && part.weapon >= 0 && me.c.hull > 0) {
      const g = v.guns[part.weapon];
      const d = vsub(me.p, at);
      const dist = vlen(d);
      if (dist > g.range || dist < 20 || !covers(v, part, at, me.p)) continue;
      part.wait = Math.max(g.reload, ARENA.battery) * (0.8 + roll() * 0.7);
      const t = dist / BOLT.speed;
      const f = headingOf(me.yaw, me.pitch);
      const lead: Vec3 = [me.p[0] + f[0] * me.speed * t * BOLT.lead, me.p[1] + f[1] * me.speed * t * BOLT.lead, me.p[2] + f[2] * me.speed * t * BOLT.lead];
      const err = BOLT.error * dist;
      const aim = vnorm(vsub([lead[0] + (roll() - 0.5) * 2 * err, lead[1] + (roll() - 0.5) * 2 * err, lead[2] + (roll() - 0.5) * 2 * err], at));
      spawn(s, { kind: "bolt", by: v.id, side: v.side, p: at, v: vmul(aim, BOLT.speed), life: g.range / BOLT.speed + 0.4, dice: g.dice, type: g.type, radius: 0, target: null, part: -1, turn: 0, fuse: 0, bonus: g.plus, dc: null });
      boom(s, at, 0.6, "launch", v.id);
    } else if (part.kind === "pd") {
      // Point defense shoots down what flies at the ship first, and the party's craft when it comes close
      const g = part.weapon >= 0 ? v.guns[part.weapon] : undefined;
      const range = Math.min(g?.range ?? PD.range, PD.range);
      const incoming = s.shots
        .filter((b) => b.side !== v.side && b.kind !== "bolt" && b.kind !== "bomb" && vdist(b.p, at) <= range && covers(v, part, at, b.p, 0.3))
        .sort((a, b) => vdist(a.p, at) - vdist(b.p, at))[0];
      if (incoming) {
        part.wait = g ? Math.max(0.45, g.reload) : 0.5;
        const killed = roll() < (PD.kill[incoming.kind] ?? 0.3);
        s.events.push({ from: at, to: incoming.p, by: "foe", hit: killed, at: s.t });
        if (killed) {
          incoming.life = 0;
          boom(s, incoming.p, 0.8, "pd", v.id);
        }
      } else if (g && vdist(at, me.p) <= range && me.c.hull > 0 && covers(v, part, at, me.p)) {
        part.wait = Math.max(g.reload, 0.6) * (1 + roll() * 0.5);
        const hit = roll() < PD.hit;
        s.events.push({ from: at, to: me.p, by: "foe", hit, at: s.t });
        if (hit) {
          damageVessel(s, me, rolled(g.dice, roll), g.type, me.p, v.id, "pd");
          strikeBack(s, me, v.id, roll);
        }
      }
    } else if (part.kind === "hangar") {
      const cap = HANGAR.cap[v.cls] ?? 3;
      const aloft = s.vessels.filter((o) => o.home === v.id && !isDown(o)).length;
      if (dist0 <= HANGAR.alert && part.stock > 0 && aloft < cap && s.fighter) {
        part.wait = HANGAR.every * (0.8 + roll() * 0.5);
        part.stock--;
        const at2 = vadd(at, vmul(frameOf(v.yaw, v.pitch).u, -part.r));
        const fighter = makeVessel(s.fighter, { name: s.fighter.name, owner: v.owner, imperial: v.imperial }, "foe", { p: at2, yaw: v.yaw + (roll() - 0.5) * 0.6 }, s.seed + s.nextId, s.nextId++);
        fighter.home = v.id;
        fighter.speed = fighter.top * 0.8;
        s.vessels.push(fighter);
        boom(s, at2, 1.2, "launch", v.id);
        say(s, `${v.name} launches a fighter.`);
      } else part.wait = 0.5;
    }
  }
}

// ---- The party's craft
// The craft turns about its own axes (`turned`): yaw to the right and pitch up turn the nose to the craft's right and up, in whatever
// attitude it is in, with no limit on the pitch, and nothing but A and D rolls it (the mouse and the pad are yaw and pitch only). The speed
// goes to the throttle's setting and stays there.
function flyParty(s: Dogfight, me: Vessel, input: DogfightInput, h: number) {
  const turn = Math.max(me.turn, 0.3);
  const want = (input.roll ?? 0) * clamp(me.turn * ARENA.roll, ARENA.rollMin, ARENA.rollMax);
  me.rollVel += (want - me.rollVel) * Math.min(1, h / ARENA.rollEase);
  if (!want && Math.abs(me.rollVel) < 0.02) me.rollVel = 0;
  me.roll = wrapAngle(me.roll + me.rollVel * h);
  const to = turned(me.yaw, me.pitch, me.roll, input.steer.x * turn * h, -input.steer.y * turn * h);
  me.yaw = to.yaw;
  me.pitch = to.pitch;
  me.roll = to.roll;
  const target = s.throttle * me.top;
  const step = me.accel * h * (target < me.speed ? 1.6 : 1);
  me.speed += clamp(target - me.speed, -step, step);
  advance(me, h);
}

// Ships and the party's craft: hulls are rammed as ellipsoids, small craft as spheres. A graze costs nothing; a hard hit costs hull by its speed.
function collide(s: Dogfight, me: Vessel, h: number, roll: () => number) {
  const f = headingOf(me.yaw, me.pitch);
  s.bumpWait = Math.max(0, s.bumpWait - h);
  for (const o of s.vessels) {
    if (o.id === me.id || isDown(o)) continue;
    if (classIndex(o.cls) >= classIndex("Large")) {
      const hp = hullPoint(o, me.p, me.reach * 0.7);
      if (!hp.inside) continue;
      // An open port is a hole in the hull
      const port = o.parts.find((p) => p.kind === "port" && p.open >= 1);
      if (port && vdist(me.p, partWorld(o, port)) < port.r) continue;
      // Pushed back out to the surface along its normal, the speed into it lost
      const n = hp.normal;
      const out = vadd(hp.surface, vmul(n, 0.5));
      const closing = Math.max(0, -vdot(vmul(f, me.speed), n));
      me.p = out;
      if (closing > ARENA.graze && s.bumpWait <= 0) {
        const dmg = Math.round((closing - ARENA.graze * 0.5) * ARENA.rammed);
        s.bumps++;
        s.bumpWait = 0.9;
        damageVessel(s, me, dmg, "kinetic", me.p, o.id, "ram");
        say(s, `You strike ${o.name}'s hull!`);
        boom(s, me.p, 1.4, "spark", o.id);
      }
      // Turn along the hull and lose speed
      const v = vsub(vmul(f, me.speed), vmul(n, vdot(vmul(f, me.speed), n) * 1.25));
      const sp = vlen(v);
      if (sp > 1) {
        me.yaw = Math.atan2(v[2], v[0]);
        me.pitch = clamp(Math.asin(clamp(v[1] / sp, -1, 1)), -ARENA.pitchLimit, ARENA.pitchLimit);
        me.speed = sp * 0.9;
      } else me.speed = 0;
    } else {
      const gap = vdist(o.p, me.p);
      const min = o.reach + me.reach * 0.7;
      if (gap >= min || gap === 0) continue;
      const push = vmul(vsub(o.p, me.p), 1 / gap);
      o.p = vadd(o.p, vmul(push, min - gap));
      if (s.bumpWait > 0) continue;
      s.bumps++;
      s.bumpWait = 0.9;
      const amount = 2 + Math.floor(roll() * 3);
      damageVessel(s, me, amount, "kinetic", me.p, o.id, "ram");
      damageVessel(s, o, amount + 1, "kinetic", o.p, me.id, "party");
      boom(s, vmul(vadd(o.p, me.p), 0.5), 1, "spark", o.id);
    }
  }
  void h;
}

// ---- Shots in the air
function stepShots(s: Dogfight, me: Vessel, h: number, roll: () => number) {
  const keep: Projectile[] = [];
  for (const b of s.shots) {
    b.life -= h;
    b.armed += h;
    if (b.life <= 0) {
      // A bomb or warhead that runs out of road goes off where it is; a bolt just ends
      if (b.kind !== "bolt" && b.armed > 0.5) detonate(s, b, null, -1, roll);
      continue;
    }
    // Homing: turn the velocity toward the target's part or hull
    if (b.target !== null && b.turn > 0) {
      const t = s.vessels.find((v) => v.id === b.target && !isDown(v));
      if (t) {
        const aimAt = b.part >= 0 && t.parts[b.part]?.alive ? partWorld(t, t.parts[b.part]) : t.p;
        const speed = vlen(b.v);
        const want = vnorm(vsub(aimAt, b.p));
        const have = vnorm(b.v);
        const ang = Math.acos(clamp(vdot(want, have), -1, 1));
        const k = ang > 1e-4 ? Math.min(1, (b.turn * h) / ang) : 1;
        b.v = vmul(vnorm(vadd(vmul(have, 1 - k), vmul(want, k))), Math.min(speed + 140 * h, ORD[b.kind]?.speed ?? speed));
      } else b.target = null;
    }
    if (s.air && b.kind === "bomb") b.v = [b.v[0] * (1 - 0.02 * h), b.v[1] - fallOf(s) * h, b.v[2] * (1 - 0.02 * h)];
    b.p = vadd(b.p, vmul(b.v, h));
    if (s.air && b.p[1] <= 0) {
      // The ground: a bolt ends, a warhead or a bomb goes off where it strikes
      b.p = [b.p[0], 0, b.p[2]];
      if (b.kind !== "bolt") detonate(s, b, null, -1, roll);
      else boom(s, b.p, 0.8, "spark", b.by);
      continue;
    }
    let spent = false;
    for (const o of s.vessels) {
      if (o.side === b.side || isDown(o)) continue;
      // The party's own craft is a sphere; capital parts are spheres on the hull
      if (b.kind === "bomb" && b.armed < 0.35) continue;
      let hitPart = -1;
      let hit = false;
      for (const part of o.parts) {
        if (!part.alive || part.kind === "port") continue;
        if (vdist(b.p, partWorld(o, part)) <= part.r + b.fuse * (b.kind === "bolt" ? 0 : 0.6)) {
          hitPart = part.id;
          hit = true;
          break;
        }
      }
      if (!hit) {
        if (classIndex(o.cls) >= classIndex("Large")) hit = hullPoint(o, b.p, b.kind === "bolt" ? 0 : b.fuse * 0.5).inside;
        else hit = vdist(b.p, o.p) <= o.reach * 0.8 + (b.kind === "bolt" ? 1.5 : b.fuse * 0.7);
      }
      if (hit) {
        detonate(s, b, o, hitPart, roll);
        spent = true;
        break;
      }
    }
    if (!spent) keep.push(b);
  }
  s.shots = keep;
  void me;
}

// A shot arrives (or a bomb goes off): the hit takes the dice; a blast also hurts what is within its radius
function detonate(s: Dogfight, b: Projectile, hit: Vessel | null, part: number, roll: () => number) {
  const dmg = rolled(b.dice, roll, b.reroll) + b.bonus;
  if (b.kind === "bolt") {
    if (hit) {
      const amount = classIndex(hit.cls) <= classIndex("Medium") ? Math.max(1, Math.round(dmg * BOLT.small)) : dmg;
      boom(s, b.p, 1 + amount / 14, "spark", b.by);
      damageVessel(s, hit, amount, b.type, b.p, b.by, "bolt");
      strikeBack(s, hit, b.by, roll);
    }
    return;
  }
  const radius = Math.max(b.radius, 6);
  boom(s, b.p, radius * 0.5, "boom", b.by);
  if (b.side === "party" && hit) s.hits++;
  for (const o of s.vessels) {
    if (o.side === b.side || isDown(o)) continue;
    // Direct hit: full; splash: half for ordnance, full for a bomb, within the radius of the burst
    let hitHull = o === hit && part < 0;
    for (const p of o.parts) {
      if (!p.alive || p.kind === "port") continue;
      const d = vdist(partWorld(o, p), b.p);
      if (o === hit && p.id === part) damagePart(s, o, p, dmg, b.p, b.by);
      else if (d <= radius + p.r) damagePart(s, o, p, Math.round(dmg * (b.kind === "bomb" ? 1 : 0.5)), b.p, b.by);
    }
    if (classIndex(o.cls) >= classIndex("Large")) {
      if (!hitHull && hullPoint(o, b.p, radius).inside) hitHull = true;
    } else if (vdist(o.p, b.p) <= o.reach + radius) hitHull = true;
    if (hitHull) {
      let amount = o === hit ? dmg : Math.round(dmg * (b.kind === "bomb" ? 1 : 0.5));
      if (savesAgainst(s, o, b, roll)) amount = Math.floor(amount / 2);
      damageVessel(s, o, amount, b.type, b.p, b.by, b.kind);
    }
  }
}
// Missiles, torpedoes and bombs allow a Dexterity saving throw for half, as the tabletop fight does (DC 8 + the shooter's proficiency and
// Wisdom modifier); a ship of Large size or more cannot dodge a warhead
export function savesAgainst(s: Dogfight, o: Vessel, b: Projectile, roll: () => number): boolean {
  if (classIndex(o.cls) >= classIndex("Large")) return false;
  const by = s.vessels.find((v) => v.id === b.by);
  const dc = b.dc ?? 8 + (by ? by.c.sheet.proficiency + abilityMod(by.c.sheet.abilities.wisdom) : 3);
  const sheet = o.c.sheet;
  const bonus = abilityMod(sheet.abilities.dexterity) + ((sheet.saveProficient ?? []).includes("dexterity") ? sheet.proficiency : 0) + (sheet.saveBonus ?? 0);
  if (1 + Math.floor(roll() * 20) + bonus >= dc) return true;
  // Flares (an upgrade): a failed save of the party's craft is rolled again, with a flare, a few times a fight (a use a tier, at least one)
  if (o.id === s.me && sheet.flares && s.flares > 0) {
    s.flares--;
    say(s, "You release a flare!");
    return 1 + Math.floor(roll() * 20) + bonus >= dc;
  }
  return false;
}

// ---- The active weapon: the nose cannon, each ordnance launcher and the bombs, in that order. The mouse fires the active one; the keys and
// buttons still fire each kind on its own.
export interface WeaponSlot { kind: "guns" | "ordnance" | "bomb"; name: string; ammo: number | null; ammoMax: number | null; ordnance: number }
const isOrdnance = (g: Gun) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket";
export function weaponSlots(me: Vessel): WeaponSlot[] {
  const slots: WeaponSlot[] = [];
  const lasers = me.guns.filter((g) => g.kind === "laser");
  if (lasers.length) slots.push({ kind: "guns", name: lasers[0].name, ammo: null, ammoMax: null, ordnance: -1 });
  me.guns.filter(isOrdnance).forEach((g, i) => slots.push({ kind: "ordnance", name: g.name, ammo: g.ammo, ammoMax: g.ammoMax, ordnance: i }));
  const bomb = me.guns.find((g) => g.kind === "bomb");
  if (bomb) slots.push({ kind: "bomb", name: bomb.name, ammo: bomb.ammo, ammoMax: bomb.ammoMax, ordnance: -1 });
  return slots;
}
// The active weapon moves on to the next one that has something to fire
function cycleWeapon(s: Dogfight, me: Vessel) {
  const slots = weaponSlots(me);
  for (let k = 1; k <= slots.length; k++) {
    const i = (s.slot + k) % slots.length;
    if (slots[i].ammo === null || slots[i].ammo! > 0) {
      s.slot = i;
      break;
    }
  }
  const now = slots[s.slot];
  if (now?.kind === "ordnance") s.sel = now.ordnance;
}
// The ordnance launcher chosen (the pick key, or one that ran dry and passed the choice on) is the active weapon if an ordnance launcher was
function followOrdnance(s: Dogfight, me: Vessel) {
  const slots = weaponSlots(me);
  if (slots[s.slot]?.kind !== "ordnance") return;
  const n = slots.filter((x) => x.kind === "ordnance").length;
  const at = slots.findIndex((x) => x.kind === "ordnance" && x.ordnance === ((s.sel % n) + n) % n);
  if (at >= 0) s.slot = at;
}
// The input with the trigger turned into the active weapon's own control
function triggered(s: Dogfight, me: Vessel, input: DogfightInput): DogfightInput {
  const kind = weaponSlots(me)[s.slot]?.kind;
  return { ...input, fire: input.fire || kind === "guns", missile: input.missile || kind === "ordnance", bomb: input.bomb || kind === "bomb" };
}

// ---- The step
function retarget(s: Dogfight, me: Vessel) {
  const f = headingOf(me.yaw, me.pitch);
  const list = hostiles(s, me)
    .filter((o) => vdist(o.p, me.p) < 1400 + o.reach)
    .sort((a, b) => {
      const ka = vlen(vsub(a.p, me.p)) * (1.2 - 0.5 * Math.max(0, vdot(f, vnorm(vsub(a.p, me.p)))));
      const kb = vlen(vsub(b.p, me.p)) * (1.2 - 0.5 * Math.max(0, vdot(f, vnorm(vsub(b.p, me.p)))));
      return ka - kb;
    });
  const at = list.findIndex((o) => o.id === s.lock);
  s.lock = at + 1 < list.length ? list[at + 1].id : at >= 0 ? null : list[0]?.id ?? null;
  s.lockPart = -1;
}
// The next part of the locked ship becomes the target (the ship the reticule is on is locked first, else the nearest one with parts); after
// the last part, the ship itself
function subTarget(s: Dogfight, me: Vessel) {
  if (s.lock === null) {
    const on = s.aim ? s.vessels.find((v) => v.id === s.aim!.vessel) : undefined;
    const near = on ?? hostiles(s, me).filter((o) => o.parts.length).sort((a, b) => vdist(a.p, me.p) - vdist(b.p, me.p))[0];
    if (!near) return;
    s.lock = near.id;
    s.lockPart = -1;
  }
  const v = s.vessels.find((x) => x.id === s.lock);
  if (!v) return;
  const list = subTargets(v, me.p, ARENA.subRange);
  const at = list.findIndex((p) => p.id === s.lockPart);
  s.lockPart = at + 1 < list.length ? list[at + 1].id : at >= 0 ? -1 : list[0]?.id ?? -1;
}
// The test build's unlimited hull and weapons: whatever the last step took is given back
function unlimited(s: Dogfight, me: Vessel) {
  const sheet = me.c.sheet;
  me.c = { ...me.c, hull: sheet.hullMax, shield: sheet.shieldMax, disabled: false, destroyed: false, systemDamage: 0 };
  for (const g of me.guns) g.ammo = g.ammoMax;
}

function tick(s: Dogfight, raw: DogfightInput, h: number, roll: () => number) {
  const me = partyOf(s);
  s.t += h;
  s.god = !!raw.god;
  if (raw.pick !== undefined && raw.pick !== s.pickSeen) {
    s.pickSeen = raw.pick;
    s.sel++;
    followOrdnance(s, me);
  }
  if (raw.cycle !== undefined && raw.cycle !== s.cycleSeen) {
    s.cycleSeen = raw.cycle;
    cycleWeapon(s, me);
  }
  const input = raw.trigger ? triggered(s, me, raw) : raw;
  if (s.interior) {
    stepInterior(s, me, input, h, roll);
    if (s.god) unlimited(s, me);
    finish(s, me);
    return;
  }
  if (input.retarget !== undefined && input.retarget !== s.retargetSeen) {
    s.retargetSeen = input.retarget;
    retarget(s, me);
  }
  if (input.subtarget !== undefined && input.subtarget !== s.subSeen) {
    s.subSeen = input.subtarget;
    subTarget(s, me);
  }
  if (s.lock !== null && !s.vessels.some((v) => v.id === s.lock && !isDown(v))) s.lock = null;
  if (s.lock === null || !s.vessels.find((v) => v.id === s.lock)?.parts[s.lockPart]?.alive) s.lockPart = -1;
  // The throttle: held keys move its setting, and so does the wheel (a count of notches); the speed follows it
  if (input.throttle) s.throttle = clamp(s.throttle + input.throttle * ARENA.throttleRate * h, 0, 1);
  if (input.dial !== undefined && input.dial !== s.dialSeen) {
    s.throttle = clamp(s.throttle + (input.dial - s.dialSeen) * ARENA.dialStep, 0, 1);
    s.dialSeen = input.dial;
  }
  flyParty(s, me, input, h);
  if (s.air) groundStrike(s, me);
  // The edge of the arena (in the air, the ceiling too)
  const high = !!s.air && me.p[1] > s.air.ceiling;
  if (vlen([me.p[0], s.air ? 0 : me.p[1], me.p[2]]) > s.bound || high) {
    s.warnings.outside += h;
    const home = vnorm(vmul(me.p, -1));
    me.yaw += clamp(wrapAngle(Math.atan2(home[2], home[0]) - me.yaw), -0.4 * h, 0.4 * h);
    if (high) me.pitch = Math.max(-0.6, me.pitch - 0.5 * h);
  } else s.warnings.outside = Math.max(0, s.warnings.outside - h);
  collide(s, me, h, roll);
  const range = Math.max(...me.guns.filter((g) => g.kind === "laser").map((g) => g.range), 160);
  // What the guns are aimed at: what is under the cursor if there is one (the ray starts at the camera, which stands behind the craft), else
  // what the reticule is on. The distance is the craft's own, which is what the guns' range is measured from.
  const ray = input.aim;
  const reach = ray ? range + vdist(ray.o, me.p) : range;
  s.aim = aimFrom(s, me, reach, true, ray) ?? (s.lock !== null ? aimFrom(s, me, reach, false, ray) : null);
  if (s.aim && ray) s.aim.dist = vdist(me.p, s.aim.point);
  fireParty(s, me, input, h, roll);
  followOrdnance(s, me);
  // (a vessel launched this tick is stepped in the same loop)
  for (const v of s.vessels) {
    if (v.id === s.me) continue;
    moveFoe(s, v, me, h);
    if (v.side === "party") continue;
    foeFire(s, v, me, h, roll);
    stepParts(s, v, me, h, roll);
    if (v.dying > 0 && !v.ground) {
      v.dying -= h;
      if (v.dying <= 0) v.dying = -1;
      else if (roll() < h * 10) boom(s, toWorld(v, [(roll() - 0.5) * v.half[0] * 1.4, (roll() - 0.5) * v.half[1], (roll() - 0.5) * v.half[2]]), CLASSES[v.cls].length * 0.1, "boom");
    }
  }
  s.vessels = s.vessels.filter((v) => v.dying >= 0);
  stepShots(s, me, h, roll);
  // Missile warning: the nearest homing shot at the party
  const homing = s.shots.filter((b) => b.side === "foe" && b.target === me.id && b.kind !== "bolt");
  s.warnings.missile = homing.length ? Math.min(...homing.map((b) => vdist(b.p, me.p))) : 0;
  // Shields come back after a while without a hit: a foe's in full, the party's slowly (a capital foe has generators instead of a shield)
  for (const v of s.vessels) {
    v.calm += h;
    const sheet = v.c.sheet;
    const mine = v.id === s.me;
    if ((isCapital(v.cls) && !mine) || isDown(v) || !sheet.hasShield || v.c.shield >= sheet.shieldMax) continue;
    if (v.calm <= (mine ? ARENA.partyWait : ARENA.shieldWait)) continue;
    v.c = { ...v.c, shield: Math.min(sheet.shieldMax, v.c.shield + (sheet.shieldRegen / ARENA.round) * (mine ? ARENA.partyRegen : 1) * h) };
  }
  // The station's port opens when its generators are gone
  const station = s.vessels.find((v) => v.cls === "Station" && !isDown(v));
  if (station) {
    const port = station.parts.find((p) => p.kind === "port");
    if (port && !generatorsUp(station) && port.open < 1) {
      port.open = Math.min(1, port.open + h / 3);
      if (port.open >= 1) {
        say(s, "The port is open: fly in!");
        boom(s, partWorld(station, port), 80, "port");
      }
    }
    if (port && port.open >= 1 && station.parts.every((p) => p.kind !== "generator" || !p.alive)) {
      const pw = partWorld(station, port);
      if (vdist(me.p, pw) < port.r * 0.8 && me.speed > 8) enterStation(s, me, station);
    }
  }
  if (s.god) unlimited(s, me);
  finish(s, me);
}

// The party's craft strikes the ground: pushed back up, levelled, and hurt by how fast it came down (a graze costs nothing)
function groundStrike(s: Dogfight, me: Vessel) {
  const floor = me.half[1] + 1;
  if (me.p[1] >= floor) return;
  const down = -headingOf(me.yaw, me.pitch)[1] * me.speed;
  me.p = [me.p[0], floor, me.p[2]];
  if (me.pitch < 0.08) me.pitch = 0.08;
  if (down > AIR.graze && s.bumpWait <= 0) {
    s.bumps++;
    s.bumpWait = 0.9;
    me.speed *= 0.6;
    damageVessel(s, me, Math.round((down - AIR.graze * 0.5) * AIR.crash), "kinetic", me.p, -1, "ground");
    say(s, "You strike the ground!");
    boom(s, me.p, 2, "spark");
  }
}
// How an air fight ends: the goal met (the bombers down, the targets bombed, the convoy through or destroyed), or lost
function airFinish(s: Dogfight, me: Vessel): boolean {
  const a = s.air!;
  const ground = (side: "party" | "foe") => s.vessels.filter((v) => v.ground && v.side === side && (side === "party" || v.ground.target));
  let won = false;
  let why = "";
  if (a.goal === "defend") {
    const bombers = s.vessels.filter((v) => v.side === "foe" && !isDown(v) && v.guns.some((g) => g.kind === "bomb" && g.ammo > 0));
    if (a.lost * 2 >= a.total) why = `${a.lost} of ${a.total} buildings lost`;
    else won = !bombers.length;
  } else if (a.goal === "raid") {
    won = ground("foe").every(isDown);
  } else if (a.goal === "escort") {
    const mine = ground("party");
    if (mine.every(isDown)) why = "the convoy was destroyed";
    else won = mine.every((v) => isDown(v) || v.ground?.arrived);
  } else {
    const theirs = s.vessels.filter((v) => v.ground && v.side === "foe" && v.ground.kind === "vehicle");
    won = theirs.every(isDown);
    if (!won && theirs.every((v) => isDown(v) || v.ground?.arrived)) why = `${a.arrived} of the convoy got away`;
  }
  void me;
  if (why) {
    a.why = why;
    end(s, "failed");
  } else if (won) end(s, "clear");
  return won || !!why;
}

function finish(s: Dogfight, me: Vessel) {
  if (s.over) return;
  if (s.air && me.c.hull > 0 && airFinish(s, me)) return;
  const foes = s.vessels.filter((v) => v.side === "foe" && !isDown(v));
  const station = s.vessels.find((v) => v.cls === "Station");
  if (me.c.hull <= 0) end(s, "shot-down");
  else if (s.stationDown) end(s, "station");
  else if (s.interior?.phase === "lost") end(s, "lost-in-station");
  else if (!s.interior && !foes.length) end(s, "clear");
  else if (!s.interior && s.warnings.outside > ARENA.fleeAfter) end(s, "fled");
  else if (s.t >= s.limit) end(s, "time");
  void station;
}
function end(s: Dogfight, outcome: NonNullable<Dogfight["outcome"]>) {
  s.over = true;
  s.outcome = outcome;
}

// Advance by `dt` seconds in ticks. The state is changed in place and returned; `events`, `fx` and `said` are what this call did.
export function stepDogfight(s: Dogfight, input: DogfightInput, dt: number, roll: () => number): Dogfight {
  s.events = [];
  s.fx = [];
  s.said = [];
  if (s.over) return s;
  s.acc += dt;
  let n = 0;
  while (s.acc >= ARENA.tick && n++ < 15 && !s.over) {
    s.acc -= ARENA.tick;
    tick(s, input, ARENA.tick, roll);
  }
  if (s.acc > ARENA.tick * 3) s.acc = 0;
  return s;
}

// ---------------------------------------------------------------------------------------------
// The station run (see tunnel.ts). The race's rules, in a tunnel.
// ---------------------------------------------------------------------------------------------
function enterStation(s: Dogfight, me: Vessel, station: Vessel) {
  const tunnel = makeTunnel(s.seed + 5, me.reach);
  s.interior = {
    tunnel,
    craft: { p: [...tunnel.points[3]] as Vec3, yaw: 0, pitch: 0, speed: Math.max(me.speed, me.top * 0.5) },
    boost: 1, boosting: false, rest: 0, near: 3, where: "tunnel", gates: 0, t: 0,
    core: { hp: STATION.reactor, hpMax: STATION.reactor }, escape: 0,
    mines: tunnel.mines.map(() => false), turrets: tunnel.turrets.map(() => ({ hp: 6, wait: 1.5 })), doors: tunnel.doors.map(() => 1),
    pursuers: [], spawned: false, stuck: 0, phase: "run",
  };
  s.shots = [];
  s.lock = null;
  s.lockPart = -1;
  s.aim = null;
  // (the tunnel is flown level)
  me.roll = 0;
  me.rollVel = 0;
  say(s, "You fly into the station: gates, mines and doors ahead. Torpedo the core!");
  boom(s, partWorld(station, station.parts.find((p) => p.kind === "port")!), 60, "port");
}

const CORE_GUN = 0.25;

function stepInterior(s: Dogfight, me: Vessel, input: DogfightInput, h: number, roll: () => number) {
  const I = s.interior as Interior;
  const T = I.tunnel;
  const c = I.craft;
  I.t += h;
  const rc = Math.max(2.5, me.reach * 0.55);
  // The boost meter: drained while held, refilled slowly once it has been let go (the race's rates)
  const boosting = input.throttle > 0 && I.boost > 0.02;
  if (boosting) {
    I.boost = Math.max(0, I.boost - 0.22 * h);
    I.rest = 0;
  } else {
    I.rest += h;
    if (I.rest > 0.8) I.boost = Math.min(1, I.boost + 0.07 * h);
  }
  I.boosting = boosting;
  const top = me.top * (boosting ? 1.2 : 0.62);
  const target = input.throttle < 0 ? 0 : top;
  c.speed += clamp(target - c.speed, -me.accel * h * (input.throttle < 0 ? 1.6 : 1), me.accel * h);
  const turn = Math.max(me.turn, 0.5) * 0.9;
  c.yaw += input.steer.x * turn * h;
  c.pitch = clamp(c.pitch - input.steer.y * turn * h, -1.2, 1.2);
  const heading = headingOf(c.yaw, c.pitch);
  c.p = vadd(c.p, vmul(heading, c.speed * h));
  // Walls: out of the free space, the craft is pushed back in, turned along the wall, and a hard hit costs hull (a graze nothing)
  const cl = clearanceAt(T, c.p, I.where === "tunnel" ? I.near : -1);
  I.where = cl.where;
  I.near = cl.where === "tunnel" ? cl.index : T.points.length - 1;
  if (cl.depth < rc) {
    const out = vnorm(vsub(c.p, cl.q));
    c.p = vadd(cl.q, vmul(out, Math.max(0, cl.radius - rc)));
    const v = vmul(heading, c.speed);
    const into = vdot(v, out);
    if (into > 0) {
      if (into > ARENA.graze) {
        const dmg = Math.round((into - ARENA.graze * 0.5) * ARENA.rammed);
        damageVessel(s, me, dmg, "kinetic", c.p, -1, "wall");
        boom(s, c.p, 1.2, "spark");
        say(s, "You scrape the wall!");
      }
      const nv = vsub(v, vmul(out, into * 1.2));
      const sp = vlen(nv);
      if (sp > 1) {
        c.yaw = Math.atan2(nv[2], nv[0]);
        c.pitch = clamp(Math.asin(clamp(nv[1] / sp, -1, 1)), -1.2, 1.2);
        c.speed = sp * 0.92;
      }
    }
  }
  // Gates, in order
  const gate = T.gates[I.gates];
  if (gate && vdist(c.p, gate.p) <= gate.r) {
    I.gates++;
    boom(s, gate.p, gate.r, "port");
  }
  // Doors: an iris that shuts; closed on the craft it is a wall
  T.doors.forEach((d, k) => {
    I.doors[k] = doorOpen(d, I.t);
    const off = vsub(c.p, d.p);
    const along = vdot(off, d.t);
    if (Math.abs(along) > rc + 1.5) return;
    const across = vsub(off, vmul(d.t, along));
    if (vlen(across) + rc <= doorHole(d, I.doors[k])) return;
    // Shut on the craft: it is pushed back out the side it came from, and a hard hit costs hull
    c.p = vadd(d.p, vadd(across, vmul(d.t, (along < 0 ? -1 : 1) * (rc + 1.6))));
    const impact = Math.abs(c.speed * vdot(heading, d.t));
    if (impact > ARENA.graze) {
      damageVessel(s, me, Math.round((impact - ARENA.graze * 0.5) * ARENA.rammed), "kinetic", c.p, -1, "wall");
      boom(s, c.p, 1.4, "spark");
      say(s, "A blast door!");
    }
    c.speed = Math.max(4, c.speed * 0.4);
  });
  // Mines go off as the craft comes near, and take the chasers with them
  T.mines.forEach((m, k) => {
    if (I.mines[k]) return;
    for (const pr of I.pursuers) {
      if (vdist(pr.p, m.p) < TUNNEL.trigger) {
        I.mines[k] = true;
        pr.hp = 0;
        boom(s, m.p, 10, "boom");
      }
    }
    if (I.mines[k] || vdist(c.p, m.p) > TUNNEL.trigger + rc) return;
    I.mines[k] = true;
    boom(s, m.p, 12, "boom");
    damageVessel(s, me, rolled("2d6", roll), "energy", c.p, -1, "mine");
    say(s, "A mine!");
  });
  // Turrets on the walls fire slow bolts at the craft
  T.turrets.forEach((t, k) => {
    const st = I.turrets[k];
    if (st.hp <= 0) return;
    st.wait = Math.max(0, st.wait - h);
    const d = vsub(c.p, t.p);
    const dist = vlen(d);
    if (st.wait > 0 || dist > TUNNEL.turretRange || dist < 12 || vdot(t.n, d) / dist < 0.1) return;
    st.wait = 3.2 + roll() * 1.6;
    const f = headingOf(c.yaw, c.pitch);
    const lead = vadd(c.p, vmul(f, c.speed * (dist / BOLT.speed) * BOLT.lead));
    const err = BOLT.error * dist * 1.4;
    const aim = vnorm(vsub([lead[0] + (roll() - 0.5) * 2 * err, lead[1] + (roll() - 0.5) * 2 * err, lead[2] + (roll() - 0.5) * 2 * err], t.p));
    spawn(s, { kind: "bolt", by: -2, side: "foe", p: t.p, v: vmul(aim, BOLT.speed), life: dist / BOLT.speed + 0.4, dice: "3d6", type: "energy", radius: 0, target: null, part: -1, turn: 0, fuse: 0, bonus: 0, dc: null });
  });
  // The chasers: they appear once the run is under way, follow the centre line behind the craft, and fire
  if (!I.spawned && I.near > T.points.length * 0.18) {
    I.spawned = true;
    for (let k = 0; k < 3; k++) {
      const idx = Math.max(1, I.near - 7 - k * 3);
      I.pursuers.push({ id: k, p: [...T.points[idx]] as Vec3, yaw: c.yaw, pitch: c.pitch, hp: 6, hpMax: 6, wait: 2 + k, lag: 0.3 + k * 0.35 });
    }
    say(s, "Fighters on your tail! Drop a bomb behind you.");
  }
  for (const pr of I.pursuers) {
    if (pr.hp <= 0) continue;
    // Each holds a place behind the craft on the centre line, a little off it
    const want = Math.max(1, I.near - 5 - pr.id * 2);
    const target = T.points[Math.min(T.points.length - 1, want)];
    const { right } = crossAxes(T.tangents[Math.min(T.points.length - 1, want)]);
    const goal = vadd(target, vmul(right, (pr.id - 1) * T.radii[want] * 0.35));
    pr.p = vadd(pr.p, vmul(vsub(goal, pr.p), Math.min(1, 1.8 * h)));
    pr.yaw = Math.atan2(c.p[2] - pr.p[2], c.p[0] - pr.p[0]);
    pr.wait = Math.max(0, pr.wait - h);
    const dist = vdist(pr.p, c.p);
    if (pr.wait <= 0 && dist < 230) {
      pr.wait = 2.6 + roll() * 1.2;
      const hit = roll() < 0.22;
      s.events.push({ from: pr.p, to: c.p, by: "foe", hit, at: s.t });
      if (hit) damageVessel(s, me, rolled("2d6", roll), "energy", c.p, -1, "chaser");
    }
  }
  for (const pr of I.pursuers) if (pr.hp <= 0) boom(s, pr.p, 8, "boom");
  I.pursuers = I.pursuers.filter((pr) => pr.hp > 0);
  // The party's guns, ordnance and bombs
  stepInteriorFire(s, me, input, h, roll);
  stepInteriorShots(s, me, h, roll);
  // The core: gone, the reactor goes critical and the shaft is the only way out
  if (I.core.hp <= 0 && I.escape === 0 && I.phase === "run") {
    // The time the way out takes at three quarters of top speed, and a little to spare
    const way = vdist(c.p, T.shaft.from) + vdist(T.shaft.from, T.shaft.to);
    I.escape = Math.round(clamp(way / Math.max(10, me.top * 0.75) + STATION.escape, 16, 50));
    I.phase = "escape";
    boom(s, T.core.p, 90, "boom");
    say(s, `The core is breached! ${I.escape} seconds: out through the shaft!`);
  }
  if (I.phase === "escape") {
    I.escape = Math.max(0.001, I.escape - h);
    if (I.escape <= 0.002) {
      I.phase = "lost";
      boom(s, c.p, 120, "boom");
      say(s, "The reactor goes up with you in it.");
    }
    if (c.p[1] >= T.shaft.to[1] - 30 && cl.where === "shaft") {
      I.phase = "out";
      s.stationDown = true;
      const st = s.vessels.find((v) => v.cls === "Station");
      if (st) {
        st.c = { ...st.c, hull: 0, destroyed: true };
        st.dying = DYING.Station;
        s.kills.Station = (s.kills.Station ?? 0) + 1;
      }
      say(s, "You are out: the station is destroyed.");
    }
  }
  // Tow back if jammed in the rock
  I.stuck = c.speed < 3 ? I.stuck + h : 0;
  if (I.stuck > 3.5 && cl.where === "tunnel") {
    const back = Math.max(0, I.near - 5);
    c.p = [...T.points[back]] as Vec3;
    c.speed = 8;
    I.stuck = 0;
    say(s, "Towed back clear of the wall.");
  }
  if (me.c.hull <= 0) I.phase = "lost";
}

function stepInteriorFire(s: Dogfight, me: Vessel, input: DogfightInput, h: number, roll: () => number) {
  const I = s.interior as Interior;
  const T = I.tunnel;
  const c = I.craft;
  const f = headingOf(c.yaw, c.pitch);
  // What the reticule is on: a wall turret or the core (the fight's `aim` then has part -2)
  type InteriorAim = { kind: "turret" | "core"; id: number; point: Vec3; dist: number };
  const found: { aim: InteriorAim | null; best: number } = { aim: null, best: Infinity };
  const consider = (kind: InteriorAim["kind"], id: number, point: Vec3, r: number) => {
    const d = vsub(point, c.p);
    const dist = vlen(d);
    if (dist > 340 || dist < 1) return;
    const ang = Math.acos(clamp(vdot(f, d) / dist, -1, 1)) - Math.asin(Math.min(1, r / dist));
    if (ang <= ARENA.assist * 0.8 && ang + dist * 1e-4 < found.best) {
      found.best = ang + dist * 1e-4;
      found.aim = { kind, id, point, dist };
    }
  };
  T.turrets.forEach((t, k) => I.turrets[k].hp > 0 && consider("turret", k, t.p, 3));
  if (I.core.hp > 0) consider("core", 0, T.core.p, T.core.r);
  const aim = found.aim;
  s.aim = aim ? { vessel: s.me, part: -2, dist: aim.dist, point: aim.point } : null;
  let side = 1;
  for (const g of me.guns) {
    g.wait = Math.max(0, g.wait - h);
    if (g.wait > 0) continue;
    if (g.kind === "laser" && input.fire) {
      g.wait = g.reload;
      s.fired++;
      side = -side;
      const from = vadd(c.p, vadd(vmul(f, me.reach * 0.7), vmul(crossAxes(f).right, side * Math.min(me.reach * 0.5, 4))));
      if (!aim) {
        s.events.push({ from, to: vadd(c.p, vmul(f, g.range)), by: "player", hit: false, at: s.t });
        continue;
      }
      const hit = roll() < 0.85;
      s.events.push({ from, to: aim.point, by: "player", hit, at: s.t });
      if (!hit) continue;
      s.hits++;
      const dmg = rolled(g.dice, roll, g.reroll) + g.plus;
      if (aim.kind === "turret") {
        I.turrets[aim.id].hp -= dmg;
        boom(s, aim.point, 0.8, "spark");
        if (I.turrets[aim.id].hp <= 0) boom(s, aim.point, 4, "boom");
      } else {
        I.core.hp -= dmg * CORE_GUN;
        boom(s, aim.point, 1.2, "spark");
      }
    }
  }
  const ord = me.guns.filter((g) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket");
  if (ord.length) {
    s.sel = ((s.sel % ord.length) + ord.length) % ord.length;
    if (ord[s.sel].ammo <= 0) {
      const next = ord.findIndex((g) => g.ammo > 0);
      if (next >= 0) s.sel = next;
    }
    const g = ord[s.sel];
    if (input.missile && g.ammo > 0 && g.wait <= 0) {
      g.ammo--;
      g.wait = g.reload;
      const o = ORD[g.kind];
      const p = vadd(c.p, vmul(f, me.reach + 4));
      const dir = aim ? vnorm(vsub(aim.point, p)) : f;
      // In the tunnel a warhead flies at a point (a turret or the core), not at a vessel; `part` -3 is the core
      spawn(s, { kind: g.kind as Projectile["kind"], by: me.id, side: "party", p, v: vmul(dir, o.speed + c.speed * 0.5), life: o.life, dice: g.dice, type: g.type, radius: g.radius, target: null, part: aim ? (aim.kind === "core" ? -3 : aim.id) : -1, turn: 0, fuse: o.fuse, bonus: g.plus, reroll: g.reroll, dc: g.dc });
      boom(s, p, 1, "launch", me.id);
    }
  }
  const bomb = me.guns.find((g) => g.kind === "bomb" && g.ammo > 0);
  if (bomb && input.bomb && bomb.wait <= 0) {
    bomb.ammo--;
    bomb.wait = bomb.reload;
    // Dropped behind the craft, where it hangs: the chasers fly into it
    spawn(s, { kind: "bomb", by: me.id, side: "party", p: vsub(c.p, vmul(f, me.reach + 7)), v: [0, 0, 0], life: 20, dice: bomb.dice, type: bomb.type, radius: Math.max(bomb.radius, 24), target: null, part: -1, turn: 0, fuse: 18, bonus: bomb.plus, reroll: bomb.reroll, dc: bomb.dc });
    boom(s, vsub(c.p, vmul(f, me.reach)), 1, "launch", me.id);
  }
  void roll;
}

// Shots in the tunnel: the turrets' bolts at the craft, the party's warheads at turrets and the core, bombs at the chasers
function stepInteriorShots(s: Dogfight, me: Vessel, h: number, roll: () => number) {
  const I = s.interior as Interior;
  const T = I.tunnel;
  const c = I.craft;
  const keep: Projectile[] = [];
  const rc = Math.max(2.5, me.reach * 0.55);
  for (const b of s.shots) {
    b.life -= h;
    b.armed += h;
    if (b.life <= 0) {
      if (b.kind === "bomb" && b.side === "party") interiorBlast(s, me, b, roll);
      continue;
    }
    // Warheads that were aimed at the core home on it
    if (b.side === "party" && b.part === -3) {
      const want = vnorm(vsub(T.core.p, b.p));
      b.v = vmul(vnorm(vadd(vmul(vnorm(b.v), 0.96), vmul(want, 0.04))), vlen(b.v));
    }
    b.p = vadd(b.p, vmul(b.v, h));
    // Out of the tunnel's free space: gone
    if (clearanceAt(T, b.p, -1).depth < 0 && b.kind !== "bomb") {
      boom(s, b.p, 3, "spark");
      continue;
    }
    if (b.side === "foe") {
      if (vdist(b.p, c.p) <= rc + 1.5) {
        damageVessel(s, me, Math.max(1, Math.round(rolled(b.dice, roll) * BOLT.small)), b.type, c.p, b.by, "bolt");
        boom(s, b.p, 1.5, "spark");
        continue;
      }
      keep.push(b);
      continue;
    }
    // The party's: a warhead goes off at a turret, the core or a chaser; a bomb when something flies near it
    let burst = false;
    if (b.kind === "bomb") burst = b.armed > 0.4 && I.pursuers.some((pr) => pr.hp > 0 && vdist(pr.p, b.p) <= b.fuse);
    else {
      burst = T.turrets.some((t, k) => I.turrets[k].hp > 0 && vdist(t.p, b.p) <= b.fuse) || (I.core.hp > 0 && vdist(T.core.p, b.p) <= T.core.r + b.fuse * 0.5);
    }
    if (burst) interiorBlast(s, me, b, roll);
    else keep.push(b);
  }
  s.shots = keep;
}
function interiorBlast(s: Dogfight, me: Vessel, b: Projectile, roll: () => number) {
  const I = s.interior as Interior;
  const T = I.tunnel;
  const radius = Math.max(b.radius, 12);
  const dmg = rolled(b.dice, roll, b.reroll) + b.bonus;
  boom(s, b.p, radius, "boom", b.by);
  T.turrets.forEach((t, k) => {
    if (I.turrets[k].hp > 0 && vdist(t.p, b.p) <= radius + 3) {
      I.turrets[k].hp -= dmg;
      if (I.turrets[k].hp <= 0) boom(s, t.p, 5, "boom");
    }
  });
  for (const pr of I.pursuers) if (pr.hp > 0 && vdist(pr.p, b.p) <= radius + 6) pr.hp -= dmg;
  if (I.core.hp > 0 && vdist(T.core.p, b.p) <= radius + T.core.r) {
    // Ordnance does the core its full dice; a bomb at the wall does half
    I.core.hp -= b.kind === "bomb" ? dmg * 0.5 : dmg;
    boom(s, T.core.p, 30, "boom");
  }
  void me;
}

// ---------------------------------------------------------------------------------------------
// What the fight pays (house rule)
// ---------------------------------------------------------------------------------------------
export const PART_PAY: Record<string, number> = { generator: 150, hangar: 120, battery: 40, pd: 20 };
// What a piece on the ground pays when it is destroyed (house rule)
export const GROUND_PAY: Record<string, number> = { building: 300, flak: 150, vehicle: 250 };
export function dogfightPayout(s: Dogfight): { credits: number; note: string } {
  const me = partyOf(s);
  const kills = Object.entries(s.kills);
  const total = kills.reduce((n, [, k]) => n + k, 0);
  const pay = kills.reduce((n, [cls, k]) => n + k * (CLASSES[cls as keyof typeof CLASSES]?.bounty ?? GROUND_PAY[cls] ?? 0), 0);
  // In the air: what the party kept standing (a building, a vehicle of the convoy) pays as well
  const a = s.air;
  const saved = a && (a.goal === "defend" || a.goal === "escort") && s.outcome === "clear" ? (a.total - a.lost) * 250 : 0;
  const parts = Object.entries(s.partsDown).reduce((n, [kind, k]) => n + k * (PART_PAY[kind] ?? 0), 0);
  const cleared = s.outcome === "clear" || s.outcome === "station";
  const bonus = (cleared ? 500 + (s.outcome === "station" ? 3000 : 0) : 0) + saved;
  const names = kills.map(([cls, k]) => `${k} ${cls}`).join(", ");
  const partNote = Object.keys(s.partsDown).length ? `, ${Object.entries(s.partsDown).map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`).join(" and ")} shot out` : "";
  const end =
    s.outcome === "station" ? ", the station destroyed" :
    s.outcome === "clear" ? ", the sky clear" :
    s.outcome === "shot-down" ? ", shot down" :
    s.outcome === "lost-in-station" ? ", lost with the station" :
    s.outcome === "fled" ? ", broke off" :
    s.outcome === "failed" ? `, failed: ${a?.why ?? "the goal was lost"}` : "";
  const keptNote = a && (a.goal === "defend" || a.goal === "escort") ? `, ${a.total - a.lost} of ${a.total} ${a.goal === "defend" ? "buildings" : "vehicles"} kept` : "";
  const note = `${total} of ${s.foesTotal} foes down${names ? ` (${names})` : ""}${partNote}${keptNote}, ${Math.max(0, Math.round(me.c.hull))} hull left${end} (house rule: the books give no dogfight)`;
  return { credits: pay + parts + bonus, note };
}
