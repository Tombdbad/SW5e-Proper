// A simulated pilot for the dogfight (tests and tuning only): it picks what to shoot at, steers on it, fires when the reticule is on
// something, sends ordnance at a capital ship's parts and hull, and flies the station tunnel along its centre line.
import { readFileSync } from "node:fs";
import { createRandom, headingOf, shipSheet, type Vec3 } from "../../shared/logic/index";
import {
  ARENA, dogfightStart, isCapital, vdist, vlen, vnorm, vsub, wrapAngle, clamp, classIndex,
  type Dogfight, type DogfightInput, type ScenarioId, type StarshipRow, type Vessel,
} from "../../shared/logic/dogfight";
import { dogfightPayout, hostiles, isDown, partFacing, partWorld, partyOf, stepDogfight } from "../../shared/logic/dogfightSim";

export const rows = JSON.parse(readFileSync(new URL("../../shared/data/sw5e/starshipEquipment.json", import.meta.url), "utf8")) as StarshipRow[];

// A party ship of a size and role with typical equipment (the book's role armor, a shield, two cannon and a launcher or bomb layer)
// (`more`: what the shipyard has done to the ship: `mods` and `enhanced`, as the campaign keeps them)
export function partyShip(size: string, role: string, tier = 1, extra: string[] = [], more: Record<string, unknown> = {}) {
  const small = ["Tiny", "Small", "Medium"].includes(size);
  const mount = small ? "Small" : "Huge";
  const weapon = (cat: string, re: RegExp) => rows.find((r) => r.type === "Weapon" && r.weaponSize === mount && r.weaponCategory === cat && re.test(r.name))?.name;
  const equipment = [
    weapon("Primary", small ? /^Laser cannon$/ : /point-defense/),
    weapon("Primary", small ? /^Laser cannon$/ : /point-defense/),
    small ? undefined : weapon("Secondary", /turbolaser/),
    weapon("Tertiary", small ? /^Missile launcher$/ : /missile launcher/),
    weapon("Quaternary", /./),
    "Deflection armor",
    small && size === "Tiny" ? undefined : "Directional shield",
    ...extra,
  ].filter(Boolean) as string[];
  return shipSheet({ name: "Test Wing", size, role, tier, equipment, ...more } as Parameters<typeof shipSheet>[0], rows, Math.max(2, tier + 1));
}

export function start(scenario: ScenarioId, seed: number, size = "Small", role = "Attack Fighter", tier = 1): Dogfight {
  return dogfightStart({ seed, scenario, rows, ship: { sheet: partyShip(size, role, tier), owner: "the party" } });
}

const angleTo = (me: Vessel, to: Vec3) => {
  const d = vsub(to, me.p);
  return { yaw: wrapAngle(Math.atan2(d[2], d[0]) - me.yaw), pitch: Math.asin(clamp(d[1] / (vlen(d) || 1), -1, 1)) - me.pitch };
};
const steerTo = (me: Vessel, to: Vec3): DogfightInput["steer"] => {
  const a = angleTo(me, to);
  return { x: clamp(a.yaw * 2.2, -1, 1), y: clamp(-a.pitch * 2.2, -1, 1) };
};

// What to attack: a shielded capital ship's generators, then its bays, then the nearest of its turrets that shoots, else the nearest foe
export function chooseTarget(s: Dogfight, me: Vessel): { point: Vec3; vessel: Vessel; part: number } | null {
  const foes = hostiles(s, me);
  if (!foes.length) return null;
  const small = foes.filter((v) => classIndex(v.cls) <= classIndex("Medium"));
  const near = (a: Vessel) => vdist(a.p, me.p);
  const capital = foes.filter((v) => classIndex(v.cls) >= classIndex("Large")).sort((a, b) => near(a) - near(b))[0];
  // Fighters in the party's face first
  const close = small.filter((v) => near(v) < (capital ? 230 : 420)).sort((a, b) => near(a) - near(b))[0];
  if (close) return { point: close.p, vessel: close, part: -1 };
  if (capital) {
    const pick = (kind: string) => capital.parts.filter((p) => p.alive && p.kind === kind).sort((a, b) => vdist(partWorld(capital, a), me.p) - vdist(partWorld(capital, b), me.p))[0];
    const gen = pick("generator");
    if (gen) return { point: partWorld(capital, gen), vessel: capital, part: gen.id };
    const bay = pick("hangar");
    if (bay && capital.cls !== "Station") return { point: partWorld(capital, bay), vessel: capital, part: bay.id };
    const port = capital.parts.find((p) => p.kind === "port");
    if (port && capital.cls === "Station") return { point: partWorld(capital, port), vessel: capital, part: -1 };
    return { point: capital.p, vessel: capital, part: -1 };
  }
  const far = small.sort((a, b) => near(a) - near(b))[0];
  return far ? { point: far.p, vessel: far, part: -1 } : null;
}

const mem = new WeakMap<Dogfight, { peelUntil: number }>();
export function botInput(s: Dogfight): DogfightInput {
  const me = partyOf(s);
  if (s.interior) return botInterior(s, me);
  const target = chooseTarget(s, me);
  if (!target) return { steer: { x: 0, y: 0 }, throttle: 1 };
  const dist = vdist(target.point, me.p);
  let aimPoint = target.point;
  // Lead a fighter a little
  if (classIndex(target.vessel.cls) <= classIndex("Medium")) {
    const h = headingOf(target.vessel.yaw, target.vessel.pitch);
    const t = dist / 400;
    aimPoint = [target.point[0] + h[0] * target.vessel.speed * t, target.point[1] + h[1] * target.vessel.speed * t, target.point[2] + h[2] * target.vessel.speed * t];
  }
  // A part on a capital ship's hull is come at from outside it: first to a point above the part, then the nose onto the part
  if (target.part >= 0 && classIndex(target.vessel.cls) >= classIndex("Large") && dist > 330) {
    const n = partFacing(target.vessel, target.vessel.parts[target.part]);
    aimPoint = [target.point[0] + n[0] * 150, target.point[1] + n[1] * 150, target.point[2] + n[2] * 150];
  }
  let steer = steerTo(me, aimPoint);
  let throttle: -1 | 0 | 1 = dist > 150 ? 1 : 0;
  // A strafing run on a capital ship: fire as it closes, peel off outward before the hull, and come back round
  const memory = mem.get(s) ?? { peelUntil: 0 };
  mem.set(s, memory);
  const portOpen = target.vessel.parts.some((p) => p.kind === "port" && p.open >= 1);
  if (classIndex(target.vessel.cls) >= classIndex("Large") && !portOpen) {
    const near = target.part >= 0 ? dist < 85 : dist - Math.max(...target.vessel.half) < 110;
    if (near && memory.peelUntil < s.t) memory.peelUntil = s.t + 2.2;
    if (memory.peelUntil > s.t) {
      const away = vnorm(vsub(me.p, target.vessel.p));
      steer = steerTo(me, [me.p[0] + away[0] * 400, me.p[1] + away[1] * 400 + 60, me.p[2] + away[2] * 400]);
      throttle = 1;
    }
  }
  // Keep clear of hulls: turn away when about to fly into one
  for (const o of s.vessels) {
    if (o.id === me.id || isDown(o) || classIndex(o.cls) < classIndex("Large") || o.parts.some((p) => p.kind === "port" && p.open >= 1)) continue;
    const ahead = vnorm(vsub(aimPoint, me.p));
    void ahead;
    const l = vdist(o.p, me.p);
    if (l < o.reach + 140) {
      const out = steerTo(me, [me.p[0] + (me.p[0] - o.p[0]), me.p[1] + (me.p[1] - o.p[1]), me.p[2] + (me.p[2] - o.p[2])]);
      const inside = l < Math.max(...o.half) * 1.05 + 60;
      if (inside && target.vessel.id !== o.id) steer = out;
      else if (inside && target.part < 0) steer = out;
    }
  }
  // Weave while near a capital ship's guns, and break hard from a missile that is about to arrive
  const nearCapital = s.vessels.some((o) => o.side === "foe" && !isDown(o) && classIndex(o.cls) >= classIndex("Large") && vdist(o.p, me.p) < o.reach + 420);
  if (nearCapital) throttle = 1;
  if (nearCapital && target.part >= 0) steer = { x: clamp(steer.x + 0.3 * Math.sin(s.t * 2.3), -1, 1), y: clamp(steer.y + 0.3 * Math.cos(s.t * 1.7), -1, 1) };
  if (s.warnings.missile > 0 && s.warnings.missile < 170) {
    steer = { x: Math.floor(s.t / 3) % 2 ? 1 : -1, y: -0.5 };
    throttle = 1;
  }
  // Fire only at what it means to hit: not a shielded hull, not a turret when a generator is the aim
  const aimed = !!s.aim && s.aim.vessel === target.vessel.id && (s.aim.part >= 0 || !isShieldedTarget({ vessel: target.vessel, part: -1 }) || classIndex(target.vessel.cls) <= classIndex("Medium"));
  const onCapital = classIndex(target.vessel.cls) >= classIndex("Large");
  const ord = me.guns.filter((g) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket");
  const hasOrd = ord.some((g) => g.ammo > 0);
  const missile = aimed && hasOrd && target.vessel.cls !== "Station" && ((onCapital && dist < 300 && !isShieldedTarget(target)) || (!onCapital && target.vessel.cls !== "Tiny" && dist < 260 && target.vessel.cls !== "Small") || (target.vessel.cls === "Medium" && dist < 300));
  const bomb = aimed && onCapital && dist < 55;
  return { steer, throttle: hold(s, throttle), fire: aimed || (!!s.aim && s.aim.part >= 0 && s.aim.vessel !== target.vessel.id && classIndex(target.vessel.cls) <= classIndex("Medium")), missile, bomb };
}
// The throttle is a setting that holds: what the pilot wanted of it in the old terms (full, cruise, none) is moved toward by holding it up or down
const hold = (s: Dogfight, want: -1 | 0 | 1): -1 | 0 | 1 => {
  const goal = want > 0 ? 1 : want < 0 ? 0 : ARENA.cruise;
  return s.throttle < goal - 0.04 ? 1 : s.throttle > goal + 0.04 ? -1 : 0;
};
const isShieldedTarget = (t: { vessel: Vessel; part: number }) => t.part < 0 && t.vessel.parts.some((p) => p.kind === "generator" && p.alive);

function botInterior(s: Dogfight, me: Vessel): DogfightInput {
  const I = s.interior!;
  const T = I.tunnel;
  const c = I.craft;
  let to: Vec3;
  if (I.where === "tunnel") to = T.points[Math.min(T.points.length - 1, I.near + 8)];
  else if (I.where === "chamber") to = I.core.hp > 0 ? T.core.p : T.shaft.from;
  else to = T.shaft.to;
  if (I.where === "chamber" && I.core.hp > 0) to = T.core.p;
  // Weave round the nearest mine ahead that lies in the way
  const f = headingOf(c.yaw, c.pitch);
  let mine: Vec3 | null = null;
  let best = 110;
  T.mines.forEach((m, k) => {
    if (I.mines[k]) return;
    const d = vsub(m.p, c.p);
    const ahead = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (ahead < 5 || ahead > best) return;
    const lateral = Math.hypot(d[0] - f[0] * ahead, d[1] - f[1] * ahead, d[2] - f[2] * ahead);
    if (lateral < 17) {
      mine = m.p;
      best = ahead;
    }
  });
  if (mine) {
    const m = mine as Vec3;
    to = [to[0] + (c.p[0] - m[0]) * 3, to[1] + (c.p[1] - m[1]) * 3, to[2] + (c.p[2] - m[2]) * 3];
  }
  const a = angleTo({ ...me, p: c.p, yaw: c.yaw, pitch: c.pitch } as Vessel, to);
  const steer = { x: clamp(a.yaw * 2.4, -1, 1), y: clamp(-a.pitch * 2.4, -1, 1) };
  const dCore = vdist(c.p, T.core.p);
  const ord = me.guns.some((g) => (g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket") && g.ammo > 0);
  const missile = I.core.hp > 0 && ord && dCore < 230 && !!s.aim;
  const bomb = I.pursuers.some((p) => p.hp > 0) && me.guns.some((g) => g.kind === "bomb" && g.ammo > 0) && I.near > 40 && s.t % 5 < 0.1;
  return { steer, throttle: I.where === "chamber" && I.core.hp > 0 && dCore < 160 ? 0 : 1, fire: !!s.aim, missile, bomb };
}

export interface Run { s: Dogfight; seconds: number; hull: number; shield: number; ok: boolean }
export function play(s: Dogfight, seed = 1, max = 700): Run {
  const r = createRandom(seed * 7 + 3);
  const dt = 1 / 30;
  for (let t = 0; t < max && !s.over; t += dt) stepDogfight(s, botInput(s), dt, r.next);
  const me = partyOf(s);
  return { s, seconds: s.t, hull: me.c.hull, shield: me.c.shield, ok: s.outcome === "clear" || s.outcome === "station" };
}
export { dogfightPayout };
export { isCapital };
