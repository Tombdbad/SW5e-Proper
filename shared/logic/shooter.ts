// The real-time shooter mode (2026-10-29; the user: "a real time (first/third person) shooter mode that does away with the dice rolling and turn
// based combat for intense FPS combat with thrown grenades, blaster fire, animated lightsabre combat; inspiration KOTOR and Star Wars
// Battlefront 2"; "top down view should NOT be available"). The campaign is played in one of two modes (`modeOf`): the tabletop (dice, turns)
// or this one. In it a fight is not rolled: a shot is a bolt that flies, and hits what it passes through; damage is the weapon's printed
// dice taken at their average; a miss is the shooter's spread; a grenade is a thrown thing that bounces and bursts; a lightsaber is a swing with
// an arc, and held up it turns the bolts of those in front of it back. All of this is HOUSE RULE (the books have no real-time play).
//
// Pure: the scene (client/src/components/Map/interiors/Shooter.tsx) gives each frame the party's place and what the map allows (`Env`), and gets
// events back. Units are squares (5 ft.) and seconds; x and y are the map's grid (a square (i, j) holds [i, i+1) x [j, j+1)), h is height.
// Seeded, so a test replays a fight exactly.

export type PlayMode = "tabletop" | "shooter";
export const modeOf = (rules: unknown): PlayMode => ((rules as { mode?: string } | null | undefined)?.mode === "shooter" ? "shooter" : "tabletop");

// ---- Numbers (house rules) -------------------------------------------------------------------------------------------------------------
export const SHOOT = {
  height: 1.3, radius: 0.3, eye: 1.15, head: 0.8,
  headshot: 1.5,
  boltSpeed: 24, boltLife: 2.2,
  // The party's aim: a cone's half angle (radians) at rest, what moving, flying and each shot in a row add, and how fast it settles
  spread: { base: 0.03, moving: 0.03, air: 0.05, perShot: 0.012, max: 0.16, settle: 0.12 },
  // What a hit on the party loses to armor: a fraction per point of Armor Class over 10, to at most this
  armor: 0.02, armorMax: 0.4,
  // Enemies: how far they see, how long they wait to react, how often a volley comes (seconds), and what their aim is off by
  sight: 16, react: [0.5, 1.1] as [number, number], volley: [1.3, 2.3] as [number, number], telegraph: 0.35, burstGap: 0.18,
  aimError: 0.1, aimPerBonus: 0.008, aimPerArmor: 0.05,
  fleeAt: 0.22, fleeTime: 3.5,
  // The saber: reach (squares), the arc (half angle), the swing and the instant it lands, the chain's window, and the focus that holds it up
  saber: { reach: 1.9, arc: 1.15, swing: 0.45, lands: 0.2, chain: 1.0, comboBonus: 0.15, comboMax: 3 },
  focus: { max: 20, perBolt: 4, perStrike: 7, regen: 5, broken: 1.2 },
  grenade: { fuse: 1.6, speed: 12, lift: 6, gravity: 18, bounce: 0.45, friction: 0.55, near: 0.4, edge: 0.5, blind: 5 },
  flash: 0.6,
};

// ---- Dice, read as their average ---------------------------------------------------------------------------------------------------------
export function avgDice(expr: string | undefined, bonus = 0): number {
  const text = String(expr ?? "").replace(/\s+/g, "");
  let total = bonus;
  for (const m of text.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)(?!d)/g)) {
    if (m[3]) total += (m[1] === "-" ? -1 : 1) * (Number(m[2] || 1) * (Number(m[3]) + 1)) / 2;
    else if (m[5]) total += (m[4] === "-" ? -1 : 1) * Number(m[5]);
  }
  return Math.max(0, total);
}

// ---- Weapons ---------------------------------------------------------------------------------------------------------------------
export interface Gun {
  name: string;
  damage: number;
  type: string;
  // Seconds between shots; automatic weapons hold the trigger (and spread more)
  interval: number;
  auto: boolean;
  // Range in squares, normal and long (past normal the spread widens, past long a bolt dies)
  range: number;
  long: number;
  mag: number;
  left: number;
  // What is in the pack to reload from: cells (a power cell or generator refills the whole magazine) or single rounds (a cartridge, an arrow)
  reserve: number;
  cells?: boolean;
  // What reloads have used up so far (to be taken out of the pack when the fight is over)
  spent: number;
  reload: number;
}
export interface Blade {
  name: string;
  damage: number;
  type: string;
  // A lightsaber (or any blade that lets the wielder hold off bolts)
  saber: boolean;
}
const feetOf = (props: string[], re: RegExp, fallback: number) => Number(props.join(";").match(re)?.[1] ?? fallback);
// The party's gun from the fight kit (`combatKit`): printed dice at their average, rate by how heavy the shot is, automatic weapons trade damage for volume
export function gunOf(kit: { rangedWeapon?: string; rangedDice?: string; rangedDamage?: number; rangedType?: string; rangedProps?: string[]; ammo?: { left: number; max: number; family?: string; round?: string; plain?: string; reserves: Record<string, number> } }): Gun | undefined {
  if (!kit.rangedWeapon) return undefined;
  const props = kit.rangedProps ?? [];
  const auto = props.some((p) => /^auto$|^rapid|^burst/i.test(p));
  const each = avgDice(kit.rangedDice, kit.rangedDamage ?? 0);
  const damage = auto ? Math.max(1, each * 0.45) : each;
  const interval = auto ? 0.2 : each <= 4.5 ? 0.33 : each <= 8 ? 0.5 : each <= 12 ? 0.85 : 1.4;
  const range = feetOf(props, /range (\d+)\//i, 60) / 5;
  const long = feetOf(props, /range \d+\/(\d+)/i, 240) / 5;
  const a = kit.ammo;
  // (a bow draws a round at a time from the pack: its magazine is the one nocked)
  const mag = a ? (a.max > 0 ? a.max : 1) : feetOf(props, /reload (\d+)/i, 0) || 12;
  const loaded = a ? a.reserves[a.round ?? a.plain ?? ""] : undefined;
  const reserve = a ? Math.max(0, loaded ?? Object.values(a.reserves).reduce((x, y) => x + Math.max(0, y), 0)) : 0;
  const cells = a ? a.family === "cell" || a.family === "generator" : false;
  return { name: kit.rangedWeapon, damage, type: (kit.rangedType ?? "energy").toLowerCase(), interval, auto, range, long, mag, left: a ? a.left : mag, reserve, cells, spent: 0, reload: a && a.max <= 0 ? 0.7 : 1.6 };
}
export function bladeOf(kit: { meleeWeapon?: string; meleeDice?: string; meleeDamage?: number; meleeType?: string }): Blade | undefined {
  if (!kit.meleeWeapon) return undefined;
  return { name: kit.meleeWeapon, damage: Math.max(1, avgDice(kit.meleeDice, kit.meleeDamage ?? 0)), type: (kit.meleeType ?? "kinetic").toLowerCase(), saber: /lightsaber|saber|lightfoil|shoto|doublesaber/i.test(kit.meleeWeapon) };
}

// A grenade from the rules text: how far it bursts, what it does ("2d8 acid"), or that it only blinds
export interface GrenadeKind {
  name: string;
  radius: number;
  damage: number;
  type: string;
  blinds: boolean;
}
export function grenadeOf(item: { name: string; description?: string }): GrenadeKind | undefined {
  if (!/grenade/i.test(item.name) || /launcher/i.test(item.name)) return undefined;
  const text = item.description ?? "";
  const radius = Number(text.match(/within (\d+) feet/i)?.[1] ?? 10) / 5;
  const dmg = text.match(/(\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage/i);
  return { name: item.name, radius, damage: dmg ? avgDice(dmg[1]) : 0, type: (dmg?.[2] ?? "kinetic").toLowerCase(), blinds: /blinded/i.test(text) };
}

// ---- The units and the field -------------------------------------------------------------------------------------------------------
export type Side = "player" | "ally" | "foe";
export interface Unit {
  id: string;
  name: string;
  side: Side;
  x: number;
  y: number;
  h: number;
  facing: number;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  gun?: Gun;
  blade?: Blade;
  // The stat block's attack: a bonus to hit, shots in a volley, how far it reaches (squares)
  bonus: number;
  volley: number;
  reach: number;
  leader?: boolean;
  gang?: string;
  // Stands its ground (a soldier, a hunter, a nemesis) rather than running at a fifth of its hit points
  brave: boolean;
  // What the party's blows did to it by type, and who last struck the character (for the Nemesis system)
  struck: Record<string, number>;
  mode: "idle" | "engage" | "flee" | "gone";
  dead: boolean;
  fled: boolean;
  // timers, seconds
  wait: number; fire: number; volleyLeft: number; strafe: number; strafeDir: number; flee: number; blind: number; stagger: number; burst: number; swing: number; chain: number; combo: number; recoil: number; reloading: number; focusLock: number;
  // The unit is aiming a volley at its target (the scene draws the telegraph)
  aiming: number;
  focus: number;
  blocking: boolean;
  // A swing has landed its blow / a reload is under way (so each happens once)
  landed: boolean;
  wasReloading: boolean;
}
export interface Bolt { id: number; owner: string; side: Side; x: number; y: number; h: number; vx: number; vy: number; vh: number; damage: number; type: string; life: number; reflected?: boolean; cell: [number, number] }
export interface Grenade { id: number; owner: string; side: Side; x: number; y: number; h: number; vx: number; vy: number; vh: number; fuse: number; kind: GrenadeKind; bounces: number }
export type Event =
  | { type: "shot"; from: string; x: number; y: number; h: number }
  | { type: "hit"; target: string; by: string; amount: number; head?: boolean; x: number; y: number; h: number }
  | { type: "down"; id: string; by?: string }
  | { type: "fled"; id: string }
  | { type: "deflect"; by: string; x: number; y: number; h: number }
  | { type: "explode"; x: number; y: number; h: number; radius: number }
  | { type: "alert"; id: string }
  | { type: "swing"; id: string }
  | { type: "reload"; id: string }
  | { type: "blocked"; id: string };

export interface Env {
  // Whether a bolt, or a thrown thing, is stopped at this point (a wall, or something higher than it flies)
  blocks: (x: number, y: number, h: number) => boolean;
  // Whether a body can stand in this square
  walkable: (x: number, y: number) => boolean;
  floorAt: (x: number, y: number) => number;
}
export interface Sim {
  units: Unit[];
  bolts: Bolt[];
  grenades: Grenade[];
  time: number;
  seq: number;
  seed: number;
  // The party's aim point (where the crosshair is) for a deflected bolt to go to, and the party's current spread
  aim?: { x: number; y: number; h: number };
  spread: number;
  surprise: boolean;
  lastHitOnPlayer?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// mulberry32, seeded by the sim and what step it is on
function rand(sim: Sim): number {
  sim.seed = (sim.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(sim.seed ^ (sim.seed >>> 15), 1 | sim.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (sim: Sim, [lo, hi]: [number, number]) => lo + (hi - lo) * rand(sim);
export const dirOf = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = (u: Unit) => !u.dead && u.mode !== "gone";
export const playerOf = (sim: Sim) => sim.units.find((u) => u.side === "player")!;
export const foesLeft = (sim: Sim) => sim.units.filter((u) => u.side === "foe" && alive(u));

export function blankUnit(base: Pick<Unit, "id" | "name" | "side" | "x" | "y" | "hp" | "maxHp"> & Partial<Unit>): Unit {
  return {
    h: 0, facing: 0, ac: 10, speed: 4, bonus: 2, volley: 1, reach: 1.2, brave: true, struck: {}, mode: base.side === "foe" ? "idle" : "engage", dead: false, fled: false,
    wait: 0, fire: 0, volleyLeft: 0, strafe: 0, strafeDir: 1, flee: 0, blind: 0, stagger: 0, burst: 0, swing: 0, chain: 0, combo: 0, recoil: 0, reloading: 0, focusLock: 0, aiming: 0,
    focus: SHOOT.focus.max, blocking: false, landed: false, wasReloading: false, ...base,
  };
}
export function newSim(units: Unit[], opts: { seed?: number; surprise?: boolean } = {}): Sim {
  return { units, bolts: [], grenades: [], time: 0, seq: 1, seed: opts.seed ?? 1, spread: SHOOT.spread.base, surprise: !!opts.surprise };
}

// ---- Seeing and standing -----------------------------------------------------------------------------------------------------------
export function sees(env: Env, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, eye = SHOOT.eye * 0.8): boolean {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.ceil(d / 0.35);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const [x, y] = [from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t];
    // (neither end's own square counts: whoever stands in a square the street calls a wall sees out of it)
    if ((Math.floor(x) === Math.floor(from.x) && Math.floor(y) === Math.floor(from.y)) || (Math.floor(x) === Math.floor(to.x) && Math.floor(y) === Math.floor(to.y))) continue;
    if (env.blocks(x, y, from.h + eye + (to.h - from.h) * t)) return false;
  }
  return true;
}
// Moves a unit by (dx, dy) if its body fits there, sliding along a wall on the axis that is free
export function walk(u: Unit, dx: number, dy: number, env: Env): boolean {
  const fits = (x: number, y: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => env.walkable(x + a * SHOOT.radius * 0.8, y + b * SHOOT.radius * 0.8));
  let moved = false;
  if (fits(u.x + dx, u.y)) { u.x += dx; moved = true; }
  if (fits(u.x, u.y + dy)) { u.y += dy; moved = true; }
  if (moved) u.h = env.floorAt(u.x, u.y);
  return moved;
}

// ---- Hurting -----------------------------------------------------------------------------------------------------------------------
function hurt(sim: Sim, target: Unit, amount: number, type: string, by: Unit | undefined, events: Event[], at: { x: number; y: number; h: number }, head = false) {
  if (!alive(target) || amount <= 0) return;
  const cut = target.side === "player" || target.side === "ally" ? clamp((target.ac - 10) * SHOOT.armor, 0, SHOOT.armorMax) : 0;
  const dealt = Math.max(1, Math.round(amount * (1 - cut)));
  target.hp = Math.max(0, target.hp - dealt);
  if (by && by.side !== "foe" && target.side === "foe") target.struck[type] = (target.struck[type] ?? 0) + dealt;
  if (target.side === "player" && by) sim.lastHitOnPlayer = by.id;
  events.push({ type: "hit", target: target.id, by: by?.id ?? "", amount: dealt, head, ...at });
  if (target.mode === "idle" && target.side === "foe") alertFoe(sim, target, events);
  if (target.hp <= 0) {
    target.dead = true;
    target.blocking = false;
    events.push({ type: "down", id: target.id, by: by?.id });
    if (target.leader) breakGang(sim, target, events);
  }
}
// When the leader of a gang falls the rest break and run (as in the turn-based fight)
function breakGang(sim: Sim, leader: Unit, events: Event[]) {
  if (!leader.gang) return;
  for (const u of sim.units) if (u.side === "foe" && u.gang === leader.gang && alive(u) && !u.leader && u.mode !== "flee") startFleeing(u, events);
}
function startFleeing(u: Unit, events: Event[]) {
  u.mode = "flee";
  u.flee = SHOOT.fleeTime;
  u.aiming = 0;
  events.push({ type: "fled", id: u.id });
}
function alertFoe(sim: Sim, u: Unit, events: Event[]) {
  if (u.mode !== "idle") return;
  u.mode = "engage";
  u.wait = between(sim, SHOOT.react);
  events.push({ type: "alert", id: u.id });
}
// A noise (a shot, an explosion) wakes the foes that hear it
export function noise(sim: Sim, x: number, y: number, radius: number, events: Event[]) {
  for (const u of sim.units) if (u.side === "foe" && u.mode === "idle" && alive(u) && dist(u, { x, y }) <= radius) alertFoe(sim, u, events);
}

// ---- Shooting ------------------------------------------------------------------------------------------------------------------------
function launch(sim: Sim, owner: Unit, gun: { damage: number; type: string; long: number }, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, spread: number, events: Event[]) {
  const dx = to.x - from.x, dy = to.y - from.y, dh = to.h - from.h;
  const d = Math.hypot(dx, dy) || 1e-6;
  // The aim is off by an angle within the spread (a square-rooted draw puts most shots near the line)
  const yaw = Math.atan2(dx, dy) + (rand(sim) * 2 - 1) * spread * (0.4 + 0.6 * rand(sim));
  const pitch = Math.atan2(dh, d) + (rand(sim) * 2 - 1) * spread * 0.6;
  const speed = SHOOT.boltSpeed;
  sim.bolts.push({
    id: sim.seq++, owner: owner.id, side: owner.side, x: from.x, y: from.y, h: from.h, cell: [Math.floor(from.x), Math.floor(from.y)],
    vx: Math.sin(yaw) * Math.cos(pitch) * speed, vy: Math.cos(yaw) * Math.cos(pitch) * speed, vh: Math.sin(pitch) * speed,
    damage: gun.damage, type: gun.type, life: Math.min(SHOOT.boltLife, gun.long / speed),
  });
  events.push({ type: "shot", from: owner.id, ...from });
  noise(sim, from.x, from.y, 18, events);
}
// The party fires from `from` (the muzzle) at `to` (the point under the crosshair). False when the gun cannot: empty, reloading, between shots
export function firePlayer(sim: Sim, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, events: Event[], moving: boolean, airborne: boolean): boolean {
  const p = playerOf(sim);
  const g = p.gun;
  if (!g || p.dead || p.reloading > 0 || p.fire > 0 || p.stagger > 0 || p.blocking) return false;
  if (g.left <= 0) return false;
  g.left--;
  p.fire = g.interval;
  const far = Math.hypot(to.x - from.x, to.y - from.y) > g.range ? 1.5 : 1;
  sim.spread = clamp(Math.max(sim.spread, SHOOT.spread.base) + SHOOT.spread.perShot * (g.auto ? 1.4 : 1), 0, SHOOT.spread.max);
  const spread = clamp((sim.spread + (moving ? SHOOT.spread.moving : 0) + (airborne ? SHOOT.spread.air : 0)) * far, 0, SHOOT.spread.max * 1.5);
  p.facing = Math.atan2(to.x - from.x, to.y - from.y);
  launch(sim, p, g, from, to, spread, events);
  return true;
}
export function reloadPlayer(sim: Sim, events: Event[]): boolean {
  const p = playerOf(sim);
  const g = p.gun;
  if (!g || p.reloading > 0 || g.left >= g.mag || g.reserve <= 0) return false;
  p.reloading = g.reload;
  p.blocking = false;
  events.push({ type: "reload", id: p.id });
  return true;
}
// Raises or lowers the saber to hold off bolts and blows from the front
export function setBlock(sim: Sim, on: boolean) {
  const p = playerOf(sim);
  p.blocking = on && !!p.blade?.saber && p.focusLock <= 0 && p.swing <= 0 && !p.dead;
}
// A swing of the party's blade; chained within a second of the last it hits harder (the combo)
export function swingPlayer(sim: Sim, events: Event[]): boolean {
  const p = playerOf(sim);
  if (!p.blade || p.dead || p.swing > 0 || p.stagger > 0) return false;
  p.combo = p.chain > 0 ? Math.min(SHOOT.saber.comboMax, p.combo + 1) : 0;
  p.swing = SHOOT.saber.swing;
  p.chain = SHOOT.saber.chain + SHOOT.saber.swing;
  p.blocking = false;
  events.push({ type: "swing", id: p.id });
  return true;
}
// Throws a grenade along `dir` (a unit vector over the ground) and `up` (the aim's rise), from the hand
export function throwGrenade(sim: Sim, kind: GrenadeKind, from: { x: number; y: number; h: number }, dir: [number, number, number]): void {
  const p = playerOf(sim);
  const g = SHOOT.grenade;
  const flat = Math.hypot(dir[0], dir[1]) || 1;
  sim.grenades.push({ id: sim.seq++, owner: p.id, side: "player", x: from.x, y: from.y, h: from.h, vx: (dir[0] / flat) * g.speed, vy: (dir[1] / flat) * g.speed, vh: g.lift + Math.max(-2, dir[2]) * g.speed * 0.5, fuse: g.fuse, kind, bounces: 0 });
}

// ---- A frame -------------------------------------------------------------------------------------------------------------------------
// `player` is where the party is and where it looks (the scene moves it). Returns what happened.
export function step(sim: Sim, dt: number, env: Env, player: { x: number; y: number; h: number; facing: number; moving?: boolean; airborne?: boolean }): Event[] {
  const events: Event[] = [];
  sim.time += dt;
  const p = playerOf(sim);
  if (!p.dead) {
    p.x = player.x; p.y = player.y; p.h = player.h; p.facing = player.facing;
  }
  sim.spread = Math.max(SHOOT.spread.base, sim.spread - SHOOT.spread.settle * dt * 2);
  // timers
  for (const u of sim.units) {
    for (const k of ["fire", "strafe", "blind", "stagger", "swing", "reloading", "focusLock", "wait", "burst"] as const) u[k] = Math.max(0, u[k] - dt);
    u.chain = Math.max(0, u.chain - dt);
    if (u.chain === 0 && u.swing === 0) u.combo = 0;
  }
  // The party's reload completes; its focus comes back when the saber is down
  if (!p.dead) {
    if (!p.blocking && p.focusLock === 0) p.focus = Math.min(SHOOT.focus.max, p.focus + SHOOT.focus.regen * dt);
  }
  finishReload(p);
  // The party's swing lands
  if (p.swing > 0 && !p.landed && p.swing <= SHOOT.saber.swing - SHOOT.saber.lands) {
    p.landed = true;
    landSwing(sim, p, events);
  }
  if (p.swing === 0) p.landed = false;

  for (const u of sim.units) if (u.side !== "player" && alive(u)) think(sim, u, dt, env, events);
  stepBolts(sim, dt, env, events);
  stepGrenades(sim, dt, env, events);
  // The ones who ran are gone when their time is up
  for (const u of sim.units) if (u.mode === "flee" && (u.flee -= dt) <= 0 && !u.dead) { u.mode = "gone"; u.fled = true; }
  return events;
}
function finishReload(p: Unit) {
  const g = p.gun;
  if (!g) return;
  if (p.reloading > 0) p.wasReloading = true;
  else if (p.wasReloading) {
    p.wasReloading = false;
    // A power cell fills the whole magazine, one cell at a time; rounds go in one for one
    const take = g.cells ? (g.reserve > 0 ? 1 : 0) : Math.min(g.mag - g.left, g.reserve);
    g.left = g.cells ? (take ? g.mag : g.left) : g.left + take;
    g.reserve -= take;
    g.spent += take;
  }
}
function landSwing(sim: Sim, p: Unit, events: Event[]) {
  const b = p.blade!;
  const [fx, fy] = dirOf(p.facing);
  const damage = b.damage * (1 + SHOOT.saber.comboBonus * p.combo);
  for (const u of sim.units) {
    if (u.side !== "foe" || !alive(u)) continue;
    const d = dist(p, u);
    if (d > SHOOT.saber.reach + SHOOT.radius || Math.abs(u.h - p.h) > 1) continue;
    const off = Math.acos(clamp(((u.x - p.x) * fx + (u.y - p.y) * fy) / (d || 1), -1, 1));
    if (off > SHOOT.saber.arc) continue;
    // A saber in an enemy's hands turns a blow aside now and then, when it faces the swing
    if (u.blade?.saber && u.swing === 0 && rand(sim) < 0.3) { events.push({ type: "blocked", id: u.id }); continue; }
    hurt(sim, u, damage, b.type, p, events, { x: u.x, y: u.y, h: u.h + SHOOT.height * 0.6 });
    u.stagger = 0.25;
  }
  noise(sim, p.x, p.y, 8, events);
}

// ---- What the others do ----------------------------------------------------------------------------------------------------------
function opponents(sim: Sim, u: Unit) {
  return sim.units.filter((o) => alive(o) && (u.side === "foe" ? o.side !== "foe" : o.side === "foe"));
}
function nearest(sim: Sim, u: Unit, list: Unit[]) {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const o of list) {
    const d = dist(u, o);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}
function steer(u: Unit, goal: { x: number; y: number }, speed: number, dt: number, env: Env, away = false) {
  const angle = Math.atan2(goal.x - u.x, goal.y - u.y) + (away ? Math.PI : 0);
  // Try the straight way, then either side, so a wall is gone round and not walked into
  for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
    const a = angle + turn * (u.strafeDir || 1);
    if (walk(u, Math.sin(a) * speed * dt, Math.cos(a) * speed * dt, env)) return true;
  }
  return false;
}
function think(sim: Sim, u: Unit, dt: number, env: Env, events: Event[]) {
  if (u.stagger > 0) return;
  const foes = opponents(sim, u);
  const target = nearest(sim, u, foes);
  if (!target) return;
  const d = dist(u, target);
  const seen = sees(env, { x: u.x, y: u.y, h: u.h }, { x: target.x, y: target.y, h: target.h });
  // Not yet aware: it notices the party in plain sight and near (the unaware see less far)
  if (u.mode === "idle") {
    if (seen && d <= SHOOT.sight * (sim.surprise ? 0.55 : 1)) alertFoe(sim, u, events);
    return;
  }
  if (u.mode === "flee") {
    const hunter = nearest(sim, u, foes) ?? target;
    steer(u, hunter, u.speed * 1.15, dt, env, true);
    return;
  }
  u.facing = Math.atan2(target.x - u.x, target.y - u.y);
  if (u.wait > 0) return;
  if (!u.brave && !u.leader && u.hp <= u.maxHp * SHOOT.fleeAt && u.side === "foe") return void startFleeing(u, events);
  const blind = u.blind > 0;
  const ranged = !!u.gun && u.gun.range > 1.6;
  if (ranged) {
    const want = clamp(u.gun!.range * 0.55, 4, 10);
    if (!seen || d > want + 2.5) steer(u, target, u.speed, dt, env);
    else if (d < want - 2.5) steer(u, target, u.speed * 0.8, dt, env, true);
    else {
      if (u.strafe <= 0) { u.strafe = between(sim, [0.9, 2.2]); u.strafeDir = rand(sim) < 0.5 ? -1 : 1; }
      const a = u.facing + (Math.PI / 2) * u.strafeDir;
      if (!walk(u, Math.sin(a) * u.speed * 0.55 * dt, Math.cos(a) * u.speed * 0.55 * dt, env)) u.strafeDir *= -1;
    }
    // A volley: a pause to aim (the scene shows it), then the shots, aimed where the target is
    if (!seen || d > u.gun!.long) u.aiming = 0;
    else {
      if (u.aiming > 0) {
        u.aiming -= dt;
        if (u.aiming <= 0) u.volleyLeft = u.volley;
      } else if (u.volleyLeft === 0 && u.fire <= 0) {
        u.aiming = SHOOT.telegraph;
        u.fire = between(sim, SHOOT.volley);
      }
      if (u.volleyLeft > 0 && u.burst <= 0 && u.aiming <= 0) {
        // One shot of the volley: the aim is off by more for a high Armor Class, a low bonus, a long way, or a blinding flash
        const err = (SHOOT.aimError - u.bonus * SHOOT.aimPerBonus + Math.max(0, target.ac - 12) * SHOOT.aimPerArmor * 0.1) * (d > u.gun!.range ? 1.5 : 1) * (blind ? 4 : 1);
        const spread = clamp(err, 0.012, 0.3);
        const from = { x: u.x, y: u.y, h: u.h + SHOOT.eye * 0.85 };
        const to = { x: target.x, y: target.y, h: target.h + SHOOT.height * 0.55 };
        launch(sim, u, u.gun!, from, to, spread, events);
        u.volleyLeft--;
        u.burst = SHOOT.burstGap;
      }
    }
    return;
  }
  // In close: run at it, wind up, strike
  const reach = u.reach + SHOOT.radius;
  if (d > reach * 0.9) steer(u, target, u.speed, dt, env);
  if (u.swing > 0) {
    if (u.swing - dt <= 0 && d <= reach + 0.4) meleeBlow(sim, u, target, events);
  } else if (d <= reach + 0.2 && u.fire <= 0 && !blind) {
    u.swing = 0.5;
    u.fire = 1.2;
    events.push({ type: "swing", id: u.id });
  }
}
function meleeBlow(sim: Sim, u: Unit, target: Unit, events: Event[]) {
  const damage = u.blade?.damage ?? u.gun?.damage ?? 4;
  // Held up in front of the blow, the party's saber takes it, for focus
  if (target.side === "player" && target.blocking && target.focus >= SHOOT.focus.perStrike) {
    const [fx, fy] = dirOf(target.facing);
    const off = Math.acos(clamp(((u.x - target.x) * fx + (u.y - target.y) * fy) / (dist(u, target) || 1), -1, 1));
    if (off < 1.3) {
      target.focus -= SHOOT.focus.perStrike;
      events.push({ type: "blocked", id: target.id });
      return;
    }
  }
  hurt(sim, target, damage, u.blade?.type ?? "kinetic", u, events, { x: target.x, y: target.y, h: target.h + 0.7 });
}

// ---- Bolts and grenades ------------------------------------------------------------------------------------------------------------
function stepBolts(sim: Sim, dt: number, env: Env, events: Event[]) {
  const p = playerOf(sim);
  for (const b of sim.bolts) {
    // The step is taken in short pieces so a bolt does not pass through a wall or a body between frames
    const pieces = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 0.3));
    const sdt = dt / pieces;
    for (let i = 0; i < pieces && b.life > 0; i++) {
      const [ox, oy, oh] = [b.x, b.y, b.h];
      // A bolt turned back by the saber bends towards the nearest foe, so that holding off a volley is also a way of striking
      if (b.reflected) {
        const foe = nearest(sim, { ...p, x: b.x, y: b.y } as Unit, sim.units.filter((u) => u.side === "foe" && alive(u) && dist(u, b) < 14));
        if (foe) {
          const dx = foe.x - b.x, dy = foe.y - b.y, dh = foe.h + SHOOT.height * 0.55 - b.h, d = Math.hypot(dx, dy, dh) || 1;
          const k = Math.min(1, 7 * sdt), speed = Math.hypot(b.vx, b.vy, b.vh);
          const [nx, ny, nh] = [b.vx / speed + ((dx / d) - b.vx / speed) * k, b.vy / speed + ((dy / d) - b.vy / speed) * k, b.vh / speed + ((dh / d) - b.vh / speed) * k];
          const n = Math.hypot(nx, ny, nh) || 1;
          b.vx = (nx / n) * speed; b.vy = (ny / n) * speed; b.vh = (nh / n) * speed;
        }
      }
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.h += b.vh * sdt; b.life -= sdt;
      // (the square it was fired from does not stop it: a sentry on a roof shoots from a square the street calls a wall)
      const home = Math.floor(b.x) === b.cell[0] && Math.floor(b.y) === b.cell[1];
      if ((!home && env.blocks(b.x, b.y, b.h)) || b.h < env.floorAt(b.x, b.y) - 0.05) { b.life = 0; break; }
      // The party's saber, held up in front, turns a bolt from the front back along the aim
      if (b.side === "foe" && p.blocking && !p.dead && dist(b, p) < 0.85 && Math.abs(b.h - (p.h + 0.8)) < 0.9) {
        const [fx, fy] = dirOf(p.facing);
        const off = Math.acos(clamp(((ox - p.x) * fx + (oy - p.y) * fy) / (Math.hypot(ox - p.x, oy - p.y) || 1), -1, 1));
        if (off < 1.4 && p.focus >= SHOOT.focus.perBolt) {
          p.focus -= SHOOT.focus.perBolt;
          if (p.focus < SHOOT.focus.perBolt) { p.blocking = false; p.focusLock = SHOOT.focus.broken; }
          const to = sim.aim ?? { x: p.x + fx * 10, y: p.y + fy * 10, h: p.h + 1 };
          const dx = to.x - b.x, dy = to.y - b.y, dh = to.h - b.h, d = Math.hypot(dx, dy, dh) || 1;
          const speed = SHOOT.boltSpeed * 1.1;
          Object.assign(b, { side: "player" as Side, owner: p.id, reflected: true, vx: (dx / d) * speed, vy: (dy / d) * speed, vh: (dh / d) * speed, life: 1.6 });
          events.push({ type: "deflect", by: p.id, x: b.x, y: b.y, h: b.h });
          continue;
        }
      }
      let hit = false;
      for (const u of sim.units) {
        if (!alive(u) || u.side === b.side || u.id === b.owner) continue;
        if (b.side === "ally" && u.side === "player") continue;
        if (dist(b, u) > SHOOT.radius || b.h < u.h || b.h > u.h + SHOOT.height) continue;
        // A saber in an enemy's hands turns the odd bolt aside
        if (u.side === "foe" && u.blade?.saber && b.side !== "foe" && rand(sim) < 0.35 && !b.reflected) { events.push({ type: "blocked", id: u.id }); b.life = 0; hit = true; break; }
        const head = b.h > u.h + SHOOT.head;
        const owner = sim.units.find((x) => x.id === b.owner);
        hurt(sim, u, b.damage * (head && b.side !== "foe" ? SHOOT.headshot : 1), b.type, owner, events, { x: b.x, y: b.y, h: b.h }, head && b.side !== "foe");
        b.life = 0;
        hit = true;
        break;
      }
      if (hit) break;
    }
  }
  sim.bolts = sim.bolts.filter((b) => b.life > 0);
}
function stepGrenades(sim: Sim, dt: number, env: Env, events: Event[]) {
  const G = SHOOT.grenade;
  const keep: Grenade[] = [];
  for (const g of sim.grenades) {
    g.fuse -= dt;
    g.vh -= G.gravity * dt;
    let [nx, ny, nh] = [g.x + g.vx * dt, g.y + g.vy * dt, g.h + g.vh * dt];
    // a wall turns it back along the axis that was blocked
    if (env.blocks(nx, g.y, nh) || !env.walkable(nx, g.y)) { g.vx *= -G.bounce; nx = g.x; g.bounces++; }
    if (env.blocks(g.x, ny, nh) || !env.walkable(g.x, ny)) { g.vy *= -G.bounce; ny = g.y; g.bounces++; }
    const floor = env.floorAt(nx, ny);
    if (nh <= floor) {
      nh = floor;
      g.vh = Math.abs(g.vh) > 1.5 ? -g.vh * G.bounce : 0;
      g.vx *= G.friction; g.vy *= G.friction;
      g.bounces++;
    }
    g.x = nx; g.y = ny; g.h = nh;
    if (g.fuse <= 0) {
      explode(sim, g, env, events);
      continue;
    }
    keep.push(g);
  }
  sim.grenades = keep;
}
function explode(sim: Sim, g: Grenade, env: Env, events: Event[]) {
  events.push({ type: "explode", x: g.x, y: g.y, h: g.h, radius: g.kind.radius });
  noise(sim, g.x, g.y, 24, events);
  const owner = sim.units.find((u) => u.id === g.owner);
  for (const u of sim.units) {
    if (!alive(u)) continue;
    const d = Math.hypot(u.x - g.x, u.y - g.y, (u.h + 0.6) - g.h);
    if (d > g.kind.radius + SHOOT.radius) continue;
    // A wall between the burst and the body shelters it
    if (!sees(env, { x: g.x, y: g.y, h: g.h }, { x: u.x, y: u.y, h: u.h }, 0.3)) continue;
    const reach = d / (g.kind.radius + SHOOT.radius);
    const fall = reach <= SHOOT.grenade.near ? 1 : 1 - (1 - SHOOT.grenade.edge) * ((reach - SHOOT.grenade.near) / (1 - SHOOT.grenade.near));
    if (g.kind.blinds) u.blind = SHOOT.grenade.blind;
    if (g.kind.blinds) u.stagger = Math.max(u.stagger, SHOOT.flash);
    if (g.kind.damage > 0) hurt(sim, u, g.kind.damage * fall, g.kind.type, owner, events, { x: u.x, y: u.y, h: u.h + 0.7 });
  }
}

// ---- How it ends -----------------------------------------------------------------------------------------------------------------
export type Result = "ongoing" | "victory" | "down";
export function resultOf(sim: Sim): Result {
  const p = playerOf(sim);
  if (p.dead || p.hp <= 0) return "down";
  return foesLeft(sim).length === 0 ? "victory" : "ongoing";
}
// Rounds the fight counts as (the game's clock runs a minute to ten rounds of six seconds)
export const roundsOf = (sim: Sim) => Math.max(1, Math.ceil(sim.time / 6));

// ---- Where everyone starts ---------------------------------------------------------------------------------------------------------
// Puts each foe and companion on ground a body can stand on, so that a fight can always be won: one with no place of its own (an open
// field has no plan) stands about nine squares ahead of the party; one in a square the map calls a wall (a sentry in a room above the
// street, a post inside a building) comes out to the nearest free square. No two stand in the same square.
export function placeUnits(sim: Sim, env: Env, around: { x: number; y: number; facing: number }): void {
  const taken: { x: number; y: number }[] = [{ x: around.x, y: around.y }];
  const free = (x: number, y: number) => env.walkable(x, y) && taken.every((t) => Math.hypot(t.x - x, t.y - y) > 0.9);
  for (const u of sim.units) {
    if (u.side === "player") continue;
    const placed = Number.isFinite(u.x) && Number.isFinite(u.y);
    if (placed && free(u.x, u.y)) {
      u.h = env.floorAt(u.x, u.y);
      taken.push({ x: u.x, y: u.y });
      continue;
    }
    const [fx, fy] = dirOf(around.facing);
    const from = placed ? { x: u.x, y: u.y } : { x: around.x + fx * 9, y: around.y + fy * 9 };
    let best: { x: number; y: number } | null = null;
    for (let r = 0.5; r <= 18 && !best; r += 0.5) {
      for (let k = 0; k < 16 && !best; k++) {
        const a = (k / 16) * Math.PI * 2 + r;
        const [x, y] = [Math.floor(from.x + Math.sin(a) * r) + 0.5, Math.floor(from.y + Math.cos(a) * r) + 0.5];
        if (free(x, y)) best = { x, y };
      }
    }
    // (nowhere at all: beside the party, so that the fight can still be fought and ended)
    u.x = best?.x ?? around.x + 1;
    u.y = best?.y ?? around.y;
    u.h = env.floorAt(u.x, u.y);
    taken.push({ x: u.x, y: u.y });
  }
}
