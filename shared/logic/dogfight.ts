// ---------------------------------------------------------------------------------------------
// Dogfight (HOUSE RULES; the books give no real-time fight, so this is the starship fight of
// Starships of the Galaxy played in seconds instead of rounds, and sized by the book's own ship sizes).
//
// Every ship in the arena is a `Vessel` wrapped round a `ShipCombatant`: its hull, shields, armor and
// weapons are the ship sheet's (`shipSheet`), its damage goes through the same `shipDamage` as the
// turn-based fight, and its ordnance is the ammunition the sheet counts (a Small missile launcher
// holds 4, an assault launcher on a Huge ship 8 or 24, a bomb deployer 4, a bomb layer 8). What the
// arena adds is size:
//   Tiny to Medium   fighters and small craft. They fly fast and turn hard; a foe's pilot holds back
//                    (`foePace`) so that the party's craft can get onto it. Hull and shields from the sheet.
//   Large            a corvette or cruiser: slow, with turrets and point defense, still shielded by its sheet.
//   Huge, Gargantuan the capital ships. They crawl. Their shields are generators on the hull: while any
//                    stands the hull takes no damage at all; shoot them out first. Their turrets
//                    (batteries and point defense) can be shot out too but need not be. A carrier's
//                    hangar bays launch fighters until the bays are destroyed.
//   Station          bigger than any ship and not moving. Its generators gate its hull as a capital ship's
//                    do and its hangars launch fighters, but its armor cannot be broken from outside
//                    (the hull stops at `STATION.floor` of its worth). It is destroyed from within: with
//                    the generators down the port opens, and a craft small enough flies in, down the
//                    tunnel and into the reactor chamber, puts ordnance into the core and flies out up the
//                    exhaust shaft before it goes (tunnel.ts, and the race's rules for the run).
// The foes' numbers (damage, rates of fire, accuracy) are labelled house rules below; the bot in
// tests/ships/dogfight.test.ts plays the fight to keep them honest.
// ---------------------------------------------------------------------------------------------
import { bookRole, createRandom, headingOf, SHIP_SIZE_ORDER, shipCombatant, shipSheet, type Craft, type ShipCombatant, type ShipSheet, type ShipWeapon, type Vec3 } from "./index";
import type { Clearance, Tunnel } from "./tunnel";
import shipData from "../data/sw5e/ships.json";

export type { Vec3, Craft };
export type ArenaClass = "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan" | "Station";
export const ARENA_CLASSES = [...SHIP_SIZE_ORDER, "Station"] as ArenaClass[];
export const classIndex = (cls: ArenaClass) => ARENA_CLASSES.indexOf(cls);
// A capital ship (shielded by generators) or bigger
export const isCapital = (cls: ArenaClass) => classIndex(cls) >= classIndex("Huge");

// ---- Vectors (x ahead, y up, z to starboard when yaw and pitch are 0, as the flight model has them)
export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const vdist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// A craft's axes in the world: ahead, up and to starboard
export interface Frame { f: Vec3; u: Vec3; r: Vec3 }
export function frameOf(yaw: number, pitch: number, roll = 0): Frame {
  const f = headingOf(yaw, pitch);
  const r0 = vnorm([-f[2], 0, f[0]]);
  const u0 = vcross(r0, f);
  if (!roll) return { f, r: r0, u: u0 };
  // Rolled to starboard (positive) the top of the craft tips toward its right
  const [c, s] = [Math.cos(roll), Math.sin(roll)];
  return { f, r: vadd(vmul(r0, c), vmul(u0, -s)), u: vadd(vmul(u0, c), vmul(r0, s)) };
}
// A point of a vessel's own frame (x ahead, y up, z starboard) in the world, and a world point in the vessel's frame
export function toWorld(at: { p: Vec3; yaw: number; pitch: number }, local: Vec3, roll = 0): Vec3 {
  const { f, u, r } = frameOf(at.yaw, at.pitch, roll);
  return [at.p[0] + f[0] * local[0] + u[0] * local[1] + r[0] * local[2], at.p[1] + f[1] * local[0] + u[1] * local[1] + r[1] * local[2], at.p[2] + f[2] * local[0] + u[2] * local[1] + r[2] * local[2]];
}
export function toLocal(at: { p: Vec3; yaw: number; pitch: number }, world: Vec3, roll = 0): Vec3 {
  const { f, u, r } = frameOf(at.yaw, at.pitch, roll);
  const d = vsub(world, at.p);
  return [vdot(d, f), vdot(d, u), vdot(d, r)];
}

// ---- The arena's scale (house rules)
export const ARENA = {
  tick: 1 / 60,
  // A tabletop round is six seconds: shields regenerate their rate in that time, once they have not been hit for `shieldWait`
  round: 6,
  shieldWait: 3,
  // Metres of arena for each foot of a weapon's range, held between these
  feet: 0.08,
  rangeMin: 140,
  rangeMax: 520,
  // Metres a second for each foot a round the sheet gives as speed (350 ft a round: 70 m/s)
  speed: 0.2,
  // The party's craft: the cruise throttle at 0, the aim assist (radians off the nose, besides the target's own size), the
  // chance of a shot on target to hit, and the pitch limit
  cruise: 0.4,
  assist: 0.3,
  aimParty: 0.9,
  pitchLimit: 1.2,
  // Rates of fire in seconds: guns, turret batteries, point defense, a launcher's interval, a bomb's
  gun: 0.6,
  battery: 4,
  pd: 0.5,
  launch: 1.2,
  drop: 0.9,
  // The party's shield recharges slowly (house rule): it waits `partyWait` seconds without a hit, then takes back this share of the
  // sheet's rate (a foe's shield takes back all of it after `shieldWait`). A ship with no shield fitted is lent one for the sortie, this
  // share of its hull points strong.
  partyWait: 5,
  partyRegen: 0.3,
  lentShield: 0.75,
  // The throttle is a setting that holds: W and S move it by `throttleRate` of its range a second, a notch of the wheel by `dialStep`. The
  // craft rolls at its turn rate times `roll` (held between the two), and leans into a yaw by `lean` radians for show.
  throttleRate: 0.5,
  dialStep: 0.1,
  roll: 1.4,
  rollMin: 0.8,
  rollMax: 3,
  // The roll is a turning speed that eases to what the keys ask for (seconds to take up the difference): let go, it dies away in a moment and
  // the craft stays where it is turned
  rollEase: 0.12,
  lean: 0.5,
  // A part chosen as the target is aimed at from this wide a cone round the nose (the cone for any other part is a share of `assist`)
  subAssist: 0.8,
  // How far from the craft the parts of a ship can be chosen as the target
  subRange: 900,
  // Foes: the chance of a shot on target hitting is the sheet's (d20 + attack against AC) times this, and their fire is slowed
  aimFoe: 0.3,
  foeReload: 3.2,
  // The edge of the arena, in metres from where the fight began: past it the craft is called back and, a few seconds on, has fled
  bound: 3400,
  fleeAfter: 8,
  // Ramming: damage by speed at the impact (a hull strike at 40 m/s is about 14), the speed below which a scrape costs nothing
  rammed: 0.25,
  graze: 16,
  limit: 150,
};

// What each size of ship is in the arena: its length in metres, the semi-axes of the ellipsoid its hull is hit and rammed as,
// the share of the sheet's speed it keeps (the larger the slower: a Huge ship crawls and a Gargantuan one barely moves), how well
// it turns, the share of its speed a foe's pilot holds back, and what shooting it down pays (house rule)
export interface ClassSpec { length: number; half: Vec3; pace: number; turn: number; foePace: number; foeTurn: number; bounty: number }
export const CLASSES: Record<ArenaClass, ClassSpec> = {
  Tiny: { length: 5, half: [2.6, 1.4, 2.4], pace: 1, turn: 0.7, foePace: 0.45, foeTurn: 0.4, bounty: 100 },
  Small: { length: 12, half: [6, 2.4, 5.4], pace: 1, turn: 0.6, foePace: 0.45, foeTurn: 0.37, bounty: 250 },
  Medium: { length: 32, half: [16, 5, 11], pace: 0.9, turn: 0.5, foePace: 0.6, foeTurn: 0.5, bounty: 500 },
  Large: { length: 96, half: [48, 10, 15], pace: 0.5, turn: 0.3, foePace: 1, foeTurn: 1, bounty: 1200 },
  Huge: { length: 340, half: [170, 30, 60], pace: 0.1, turn: 0.12, foePace: 1, foeTurn: 1, bounty: 3000 },
  Gargantuan: { length: 860, half: [430, 70, 130], pace: 0.04, turn: 0.06, foePace: 1, foeTurn: 1, bounty: 6000 },
  Station: { length: 1900, half: [950, 950, 950], pace: 0, turn: 0.012, foePace: 1, foeTurn: 1, bounty: 12000 },
};
// The station: its hull stops at `floor` of its worth under fire from outside; the reactor core's health; the seconds to spare when the core goes (on top of the
// time the way out takes at three quarters of the craft's top speed); the biggest craft that fits the port is Medium
export const STATION = { floor: 0.4, reactor: 30, escape: 6, port: "Medium" as ArenaClass };

// ---- Parts: what stands on a capital ship's hull. Each has hit points of its own.
export type PartKind = "generator" | "battery" | "pd" | "hangar" | "port";
export interface Part {
  id: number;
  kind: PartKind;
  // Its place in the vessel's frame (x ahead, y up, z to starboard), the radius it is hit as, and its health
  at: Vec3;
  r: number;
  hp: number;
  hpMax: number;
  alive: boolean;
  // The turret's reload, and which sheet weapon it fires (a hangar: the bay's launch timer)
  wait: number;
  weapon: number;
  // A hangar's complement still aboard, and a port's door (0 shut to 1 open)
  stock: number;
  open: number;
}

// ---- A gun: one of the sheet's weapons, with the arena's range, rate of fire and what is left of its ammunition
export type GunKind = "laser" | "battery" | "pd" | "missile" | "torpedo" | "rocket" | "bomb";
export interface Gun {
  i: number;
  name: string;
  cat: ShipWeapon["category"];
  kind: GunKind;
  dice: string;
  type: string;
  range: number;
  reload: number;
  wait: number;
  ammo: number;
  ammoMax: number;
  radius: number;
  ionizing: boolean;
  // To hit, and to damage (from weapon systems and enhanced ship weapons), and whether damage dice of 1 and 2 are rolled again
  bonus: number;
  plus: number;
  reroll: boolean;
  turret: boolean;
  // The saving throw DC of a warhead that the book fixes (a bomb's 15); else the shooter's own
  dc: number | null;
}

export interface Bay { part: number; stock: number }
export interface Vessel {
  id: number;
  side: "party" | "foe";
  name: string;
  cls: ArenaClass;
  role: string;
  owner: string;
  imperial: boolean;
  c: ShipCombatant;
  p: Vec3;
  yaw: number;
  pitch: number;
  // A foe's roll is its lean into a turn; the party's is the roll the pilot has put on the craft, and its lean into a yaw is `bank` (for show)
  roll: number;
  // The party's rolling speed (radians a second, to the right positive)
  rollVel: number;
  bank: number;
  speed: number;
  top: number;
  turn: number;
  accel: number;
  half: Vec3;
  volume: HullVolume;
  reach: number;
  ac: number;
  guns: Gun[];
  parts: Part[];
  // Seconds since it was hit (shields regenerate after a wait)
  calm: number;
  // The carrier that launched it
  home: number | null;
  // How a foe flies: which side it slants to, how long it breaks off, what it is hunting, a missile's reload, the evasive timer
  ai: { side: 1 | -1; breakUntil: number; fire: number; missile: number; jink: number };
  // Seconds of explosion left once its hull is gone; 0 while it flies
  dying: number;
  // What it pays when it goes down
  bounty: number;
}

// ---- Shots in the air: a turret's bolt, a missile or torpedo, a rocket, a bomb
export interface Projectile {
  id: number;
  kind: "bolt" | "missile" | "torpedo" | "rocket" | "bomb";
  by: number;
  side: "party" | "foe";
  p: Vec3;
  v: Vec3;
  life: number;
  dice: string;
  type: string;
  radius: number;
  // Homing: the vessel and part it chases (part -1: the hull), how fast it turns, how close it fuses
  target: number | null;
  part: number;
  turn: number;
  fuse: number;
  // Damage added to its dice, and whether dice of 1 and 2 are rolled again
  bonus: number;
  reroll?: boolean;
  dc: number | null;
  // Seconds since it left the rail (a bomb arms after a moment)
  armed: number;
}

// Something that happened in the last step, for the scene: a shot fired, a hit, a blast, a shield taking a hit, a launch
export interface Shot { from: Vec3; to: Vec3; by: "player" | "foe"; hit: boolean; at: number; heavy?: boolean }
export interface Fx { kind: "boom" | "spark" | "shield" | "launch" | "pd" | "wreck" | "port"; p: Vec3; size: number; by?: number }

export type ScenarioId = "skirmish" | "cruiser" | "carrier" | "battleship" | "dreadnought" | "station";
export interface Scenario { id: ScenarioId; name: string; intro: string; limit: number; interior: boolean; tag: string }
export const SCENARIOS: Scenario[] = [
  { id: "skirmish", name: "Skirmish", tag: "fighters", limit: 120, interior: false, intro: "A patrol of fighters and a bomber close on your craft. Shoot them down; boost to get onto them, and keep the shields up." },
  { id: "cruiser", name: "Cruiser hunt", tag: "Large", limit: 210, interior: false, intro: "A cruiser with its fighter escort. Its batteries are slow and its point defense shoots down missiles: fly in close, and put your ordnance into the hull." },
  { id: "carrier", name: "Carrier strike", tag: "Huge", limit: 330, interior: false, intro: "A carrier crawls through the system, launching fighters while its bays stand. Take out the shield generators, then the hangar bays, then bring the hull down." },
  { id: "battleship", name: "Battleship assault", tag: "Huge", limit: 330, interior: false, intro: "A battleship: all hull and guns. No shot touches the hull while a shield generator stands; the batteries can be left alone, if you can stay clear of them." },
  { id: "dreadnought", name: "Dreadnought", tag: "Gargantuan", limit: 420, interior: false, intro: "The largest ship in the sky: four generators, a forest of turrets and a hangar deck. It barely moves; its fighters do." },
  { id: "station", name: "Station raid", tag: "Station", limit: 480, interior: true, intro: "A battle station. Shoot out its shield generators, find the port, and fly in: down the tunnel, torpedo the reactor core, and out up the shaft before it goes. Its armor will not break from outside." },
];
export const scenarioOf = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

// A fighter chasing the party's craft down the tunnel: where it is, and how long to its next shot
export interface TunnelFoe { id: number; p: Vec3; yaw: number; pitch: number; hp: number; hpMax: number; wait: number; lag: number }
// The run through a station (tunnel.ts has the geometry): the party's craft in the tunnel's own frame, its boost meter (the
// race's), the centre-line point it is nearest, the gates passed in order, what has gone off or been shot out, the chasers, the core
export interface Interior {
  tunnel: Tunnel;
  craft: Craft;
  boost: number;
  boosting: boolean;
  rest: number;
  near: number;
  where: Clearance["where"];
  gates: number;
  t: number;
  // The core's health, and the seconds left to get out once it is gone (0 until then)
  core: { hp: number; hpMax: number };
  escape: number;
  mines: boolean[];
  turrets: { hp: number; wait: number }[];
  doors: number[];
  pursuers: TunnelFoe[];
  spawned: boolean;
  stuck: number;
  phase: "run" | "escape" | "out" | "lost";
}

// `fire`, `missile` and `bomb` fire a kind of weapon; `trigger` fires the active weapon (the mouse's left button) and `cycle`, a count of
// presses, makes the next weapon the active one (the right button). `retarget` and `pick` are counts of presses too.
// `steer` is yaw (x, to the right) and pitch (y, down) in the craft's own frame, `roll` the roll to starboard, `throttle` the throttle's
// setting being moved up or down while it is held and `dial` a count of notches (the wheel); `subtarget` moves the target on to the next
// part of the locked ship; `god` is the test build's unlimited hull and weapons.
export interface DogfightInput { steer: { x: number; y: number }; throttle: -1 | 0 | 1; roll?: number; dial?: number; fire?: boolean; missile?: boolean; bomb?: boolean; trigger?: boolean; retarget?: number; subtarget?: number; pick?: number; cycle?: number; god?: boolean }

export interface Dogfight {
  seed: number;
  scenario: ScenarioId;
  t: number;
  acc: number;
  limit: number;
  // How far from where the fight began the arena reaches (a station's far side must be inside it)
  bound: number;
  vessels: Vessel[];
  shots: Projectile[];
  nextId: number;
  // The party's vessel id, the target locked (a vessel id or null), the count of retarget, ordnance-pick and weapon-cycle presses seen, the
  // ordnance gun chosen, and the active weapon (an index of `weaponSlots`)
  me: number;
  lock: number | null;
  // The part of the locked ship that is the target (-1: the ship, whatever the reticule is on)
  lockPart: number;
  retargetSeen: number;
  subSeen: number;
  pickSeen: number;
  cycleSeen: number;
  sel: number;
  slot: number;
  // The throttle's setting (0 to 1) and the notches of the dial seen; the flares the party can still release (an upgrade); whether the test
  // build's unlimited hull and weapons are on
  throttle: number;
  dialSeen: number;
  flares: number;
  god: boolean;
  // What the reticule is on now (for the scene): a vessel and the part of it (-1: the hull; -2: a turret or the core in the tunnel), how far, where
  aim: { vessel: number; part: number; dist: number; point: Vec3 } | null;
  // Kills by class, parts shot out, the foes at the start and the party's shots and hits
  kills: Record<string, number>;
  partsDown: Record<string, number>;
  // Damage the party's craft took, by what dealt it (laser, pd, bolt, missile, torpedo, rocket, bomb, ram, wall, mine, chaser)
  taken: Record<string, number>;
  foesTotal: number;
  fired: number;
  hits: number;
  bumps: number;
  // Seconds before another collision costs hull (one blow at a time, not one a tick)
  bumpWait: number;
  // What the last step did, for the scene and the HUD
  events: Shot[];
  fx: Fx[];
  said: string[];
  log: string[];
  warnings: { missile: number; outside: number };
  // The sheet launched fighters are built from, the station run once begun, and whether the station's reactor has gone
  fighter: ShipSheet | null;
  interior: Interior | null;
  stationDown: boolean;
  outcome: null | "clear" | "shot-down" | "time" | "fled" | "station" | "lost-in-station";
  over: boolean;
  tier: number;
  // Weapons the party's craft was given because the ship had none fitted, or for the raid (house rules), named for the report
  loaned: string[];
  // What the player is told before the fight begins
  briefing: string[];
}

// ---- Size, speed and turning from the sheet
export const classOf = (size: string): ArenaClass => (size in CLASSES ? (size as ArenaClass) : "Medium");

export function topSpeed(sheet: ShipSheet, cls: ArenaClass, foe: boolean): number {
  const spec = CLASSES[cls];
  return Math.max(0, sheet.speed * ARENA.speed * spec.pace * (foe ? spec.foePace : 1));
}
// Radians a second: a Small attack fighter (350 ft a round, turning 100) turns at 1.9; the larger the ship, the slower it comes about
export function turnRate(sheet: ShipSheet, cls: ArenaClass, foe: boolean): number {
  const spec = CLASSES[cls];
  const ratio = sheet.speed / Math.max(50, sheet.turning);
  const rate = 0.9 * ratio * spec.turn * (foe ? spec.foeTurn / spec.turn : 1);
  return clamp(rate, cls === "Station" ? 0.004 : 0.02, 2.2);
}

// ---- Guns from the sheet's weapons
export function gunKind(w: ShipWeapon, cls: ArenaClass): GunKind {
  if (w.category === "Quaternary") return "bomb";
  if (w.category === "Tertiary") {
    const n = (w.ammoName ?? w.name).toLowerCase();
    return /torpedo/.test(n) ? "torpedo" : /rocket|cluster/.test(n) ? "rocket" : "missile";
  }
  if (w.category === "Secondary") return "battery";
  return classIndex(cls) >= classIndex("Large") && /point-defense/i.test(w.name) ? "pd" : "laser";
}
export const rangeOf = (w: ShipWeapon) => clamp(Math.round(w.far * ARENA.feet), ARENA.rangeMin, ARENA.rangeMax);
// The bomb a launcher drops in the arena: the heaviest the book lists for its size, the proton bomb (4d10 in a 100-foot burst, 8d10 in a
// 200-foot one on a Huge ship or larger), not the sheet's default bomblets (house rule: the ordnance is chosen for the sortie). A Tiny craft keeps the sheet's.
const PROTON = (shipData as unknown as { ammunition: { quaternary: { name: string; dice?: string; diceHuge?: string; radius?: number; radiusHuge?: number; dc?: number; type?: string }[] } }).ammunition.quaternary.find((b) => b.name === "Proton Bomb");
export function gunsOf(sheet: ShipSheet, cls: ArenaClass): Gun[] {
  return sheet.weapons.map((w, i) => {
    const kind = gunKind(w, cls);
    const heavy = kind === "bomb" && cls !== "Tiny" && PROTON;
    const big = classIndex(cls) >= classIndex("Huge");
    const rapid = Number(w.properties.match(/rapid (\d+)/i)?.[1] ?? 0);
    const base = kind === "laser" ? ARENA.gun : kind === "battery" ? ARENA.battery : kind === "pd" ? ARENA.pd : kind === "bomb" ? ARENA.drop : ARENA.launch;
    const reload = base * (w.heavy ? 1.5 : 1) * (rapid ? 0.75 : 1);
    return {
      i,
      name: w.name,
      cat: w.category,
      kind,
      dice: heavy ? ((big ? PROTON!.diceHuge : PROTON!.dice) ?? w.dice) : w.dice,
      type: heavy ? (PROTON!.type ?? w.damageType) : w.damageType,
      range: kind === "bomb" ? 60 : rangeOf(w),
      reload,
      wait: 0,
      ammo: w.ammo ?? 0,
      ammoMax: w.ammo ?? 0,
      radius: heavy ? clamp(Math.round(((big ? PROTON!.radiusHuge : PROTON!.radius) ?? 100) * 0.4), 18, 90) : w.radius ? clamp(Math.round(w.radius * 0.4), 18, 90) : kind === "rocket" ? 8 : kind === "torpedo" ? 12 : kind === "missile" ? 10 : 0,
      ionizing: w.ionizing,
      bonus: w.attackBonus ?? 0,
      plus: w.damageBonus ?? 0,
      reroll: !!w.rerollLow,
      turret: w.arc === "turret",
      dc: kind === "bomb" ? (heavy ? PROTON!.dc ?? 15 : w.save?.dc ?? 15) : (w.save?.dc ?? null),
    };
  });
}

// A weapon for a ship that has none fitted (the party's ship in the play-through test, or one stripped by a yard): house rule
export function fallbackWeapon(size: string): ShipWeapon {
  const big = SHIP_SIZE_ORDER.indexOf(size) >= SHIP_SIZE_ORDER.indexOf("Large");
  return { name: big ? "Ship's battery" : "Ship's cannon", category: big ? "Secondary" : "Primary", dice: big ? "3d8" : "2d6", damageType: "energy", near: 1200, far: 4800, arc: big ? "turret" : "forward", keen: 0, heavy: false, ionizing: false, properties: "Power (house rule)" };
}
export function breachTorpedo(): ShipWeapon {
  return { name: "Breaching torpedo", category: "Tertiary", dice: "4d10", damageType: "energy", near: 1200, far: 4800, arc: "forward", ammo: 2, ammoName: "Breaching torpedo", keen: 0, heavy: true, ionizing: false, properties: "Proton warhead for a reactor (house rule)", save: { ability: "dexterity" } };
}

// ---- Layouts: the shape of a capital ship's hull and where its parts stand. Positions are in the hull's own frame (x ahead, y up, z to
// starboard) from the hull's measures; the scene builds the model from the same numbers, so a turret is where its model is and a shot
// that touches the model touches the hull.
export type HullStyle = "cutter" | "frigate" | "carrier" | "wedge" | "citadel" | "station";
export interface HullSpec {
  style: HullStyle;
  length: number;
  beam: number;
  height: number;
  // The deck: the height of the top of the hull along its middle (the hull is centred on its origin), and the tower's place (x, height above the deck)
  deck: number;
  tower: [number, number];
}
export function hullSpec(cls: ArenaClass, role: string): HullSpec {
  const [hx, hy, hz] = CLASSES[cls].half;
  const carrier = /carrier|tender|mobile|industrial/i.test(role);
  const base = { length: hx * 2, beam: hz * 2, height: hy * 2, deck: hy };
  switch (cls) {
    case "Station":
      return { style: "station", ...base, tower: [0, 0] };
    case "Gargantuan":
      return { style: "citadel", ...base, tower: [-hx * 0.22, 70] };
    case "Huge":
      return carrier ? { style: "carrier", ...base, tower: [-hx * 0.2, 40] } : { style: "wedge", ...base, tower: [-hx * 0.22, 34] };
    case "Large":
      return { style: /frigate|corvette|cruiser|ambassador|explorer|picket/i.test(role) ? "frigate" : "cutter", ...base, tower: [-hx * 0.15, 8] };
    default:
      return { style: "cutter", ...base, tower: [0, 0] };
  }
}

// What a hull occupies: an ellipsoid of the class's half sizes, or a convex solid given by planes (n·p <= d) in the hull's frame. A wedge
// narrows to the bow, the blocky hulls have cut corners at the bow.
export interface HullPlane { n: Vec3; d: number }
export type HullVolume = { kind: "ellipsoid" } | { kind: "convex"; planes: HullPlane[] };
export function hullVolume(cls: ArenaClass, role: string): HullVolume {
  const spec = hullSpec(cls, role);
  const [hx, hy, hz] = CLASSES[cls].half;
  const box: HullPlane[] = [{ n: [0, 1, 0], d: hy }, { n: [0, -1, 0], d: hy }, { n: [-1, 0, 0], d: hx }];
  // A plane through two points of the plan (x, z) on the starboard side, facing out; mirrored for port
  const edge = (ax: number, az: number, bx: number, bz: number, side: 1 | -1): HullPlane => {
    const ex = bx - ax;
    const ez = bz - az;
    const l = Math.hypot(ex, ez) || 1;
    // (nz, -nx) is perpendicular to the edge; take the one that points away from the plan's middle
    let nx = ez / l;
    let nz = -ex / l;
    if (nx * ax + nz * az < 0) {
      nx = -nx;
      nz = -nz;
    }
    const n: Vec3 = [nx, 0, nz * side];
    return { n, d: nx * ax + nz * az };
  };
  switch (spec.style) {
    case "wedge":
      return { kind: "convex", planes: [...box, edge(hx, 0, -hx, hz, 1), edge(hx, 0, -hx, hz, -1)] };
    case "carrier":
      return { kind: "convex", planes: [...box, { n: [1, 0, 0], d: hx }, { n: [0, 0, 1], d: hz }, { n: [0, 0, -1], d: hz }] };
    case "citadel":
      return { kind: "convex", planes: [...box, { n: [0, 0, 1], d: hz }, { n: [0, 0, -1], d: hz }, edge(hx, hz * 0.4, hx * 0.65, hz, 1), edge(hx, hz * 0.4, hx * 0.65, hz, -1), { n: [1, 0, 0], d: hx }] };
    case "frigate":
    case "cutter":
      return cls === "Large"
        ? { kind: "convex", planes: [...box, { n: [0, 0, 1], d: hz }, { n: [0, 0, -1], d: hz }, edge(hx, hz * 0.25, hx * 0.7, hz, 1), edge(hx, hz * 0.25, hx * 0.7, hz, -1), { n: [1, 0, 0], d: hx }] }
        : { kind: "ellipsoid" };
    default:
      return { kind: "ellipsoid" };
  }
}
// The width of the hull's deck at a station along its length, for placing turrets on it (a wedge narrows to the bow)
export function deckHalfWidth(cls: ArenaClass, role: string, x: number): number {
  const spec = hullSpec(cls, role);
  const [hx, , hz] = CLASSES[cls].half;
  if (spec.style === "wedge") return Math.max(2, (hz * (hx - x)) / (2 * hx));
  if (x > hx * 0.7) return Math.max(2, hz * (1 - ((x - hx * 0.7) / (hx * 0.3)) * 0.75));
  return hz;
}

interface PartSeed { kind: PartKind; at: Vec3; r: number }
// Turrets along the deck in pairs, generators on the tower's shoulders and the stern, hangar bays at the bow or under the flight deck. Offsets
// across the hull are shares of the deck's half width where it is, so that a wedge's turrets stand on the wedge.
export function partSeeds(cls: ArenaClass, role: string, seed: number): PartSeed[] {
  const rand = createRandom(seed + 31);
  const spec = hullSpec(cls, role);
  const [, hy] = CLASSES[cls].half;
  const L = spec.length;
  const w = (x: number, share: number) => deckHalfWidth(cls, role, x) * share;
  const out: PartSeed[] = [];
  const pair = (kind: PartKind, x: number, y: number, share: number, r: number) => {
    const z = w(x, share);
    out.push({ kind, at: [x, y, z], r }, { kind, at: [x, y, -z], r });
  };
  switch (cls) {
    case "Large": {
      pair("battery", L * 0.12, spec.deck + 1, 0.5, 4.5);
      pair("pd", L * 0.3, spec.deck + 1, 0.4, 3);
      if (rand.chance(0.5)) out.push({ kind: "pd", at: [-L * 0.3, spec.deck + 1, 0], r: 3 });
      break;
    }
    case "Huge": {
      const carrier = spec.style === "carrier";
      // Generators: domes on the tower's flanks and one aft
      pair("generator", spec.tower[0], spec.deck + spec.tower[1] * 0.55, 0.3, 9);
      out.push({ kind: "generator", at: [-L * 0.38, spec.deck + 4, 0], r: 8 });
      for (let i = 0; i < 3; i++) pair("battery", L * (0.3 - i * 0.12), spec.deck + 1.5, 0.55 + i * 0.1, 7);
      pair("battery", L * 0.05, -hy - 1.5, 0.5, 7);
      for (let i = 0; i < 4; i++) pair("pd", L * (0.4 - i * 0.2), spec.deck + 1, 0.3 + (i % 2) * 0.35, 4.5);
      if (carrier) {
        out.push({ kind: "hangar", at: [L * 0.3, -hy * 0.6, 0], r: 14 });
        out.push({ kind: "hangar", at: [-L * 0.02, -hy - 1, 0], r: 14 });
      } else if (rand.chance(0.5)) out.push({ kind: "hangar", at: [L * 0.42, -hy * 0.4, 0], r: 11 });
      break;
    }
    case "Gargantuan": {
      pair("generator", spec.tower[0], spec.deck + spec.tower[1] * 0.6, 0.18, 14);
      pair("generator", spec.tower[0] + L * 0.2, spec.deck + 12, 0.45, 12);
      for (let i = 0; i < 5; i++) pair("battery", L * (0.38 - i * 0.14), spec.deck + 2, 0.5 + (i % 2) * 0.3, 10);
      for (let i = 0; i < 4; i++) pair("battery", L * (0.3 - i * 0.18), -hy - 2, 0.45, 10);
      for (let i = 0; i < 6; i++) pair("pd", L * (0.42 - i * 0.15), spec.deck + 1, 0.2 + (i % 3) * 0.28, 6);
      out.push({ kind: "hangar", at: [L * 0.32, -hy * 0.7, 0], r: 20 });
      out.push({ kind: "hangar", at: [-L * 0.1, -hy - 2, 0], r: 20 });
      break;
    }
    case "Station": {
      const R = L / 2;
      // Four generator towers at mid latitudes, the batteries across the shell (two stand by each generator), bays and the port on the equator
      const on = (lon: number, lat: number, lift = 0): Vec3 => [Math.cos(lat) * Math.cos(lon) * (R + lift), Math.sin(lat) * (R + lift), Math.cos(lat) * Math.sin(lon) * (R + lift)];
      const gens: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const lon = (i / 4) * Math.PI * 2 + 0.5 + rand.next() * 0.3;
        const lat = (i % 2 ? 0.55 : -0.5) + rand.next() * 0.1;
        gens.push([lon, lat]);
        out.push({ kind: "generator", at: on(lon, lat, 26), r: 40 });
      }
      for (const [lon, lat] of gens) for (let k = 0; k < 2; k++) out.push({ kind: k ? "pd" : "battery", at: on(lon + (k ? 0.07 : -0.07), lat + 0.04 * (k ? 1 : -1), 8), r: 16 });
      for (let i = 0; i < 12; i++) out.push({ kind: i % 3 === 0 ? "pd" : "battery", at: on(rand.next() * Math.PI * 2, (rand.next() - 0.5) * 2.2, 8), r: 16 });
      for (let i = 0; i < 2; i++) out.push({ kind: "hangar", at: on(Math.PI * (i + 0.5), 0.08, 2), r: 44 });
      // The port: on the equator, on the side the party arrives from
      out.push({ kind: "port", at: on(Math.PI + 0.9, -0.04, 0), r: 60 });
      break;
    }
    default:
      break;
  }
  return out;
}

// A part's health from the ship: generators are worth the shields they replace (spread over the generators), turrets by size
export function buildParts(cls: ArenaClass, role: string, sheet: ShipSheet, seed: number): Part[] {
  const seeds = partSeeds(cls, role, seed);
  const gens = seeds.filter((s) => s.kind === "generator").length || 1;
  const scale = Math.max(1, sheet.hullMax / 60);
  return seeds.map((s, id) => {
    const hp =
      s.kind === "generator" ? Math.max(12, Math.round((sheet.shieldMax * 0.3) / gens + 5 * scale)) :
      s.kind === "battery" ? Math.round(6 + 4 * scale) :
      s.kind === "pd" ? Math.round(4 + 2 * scale) :
      s.kind === "hangar" ? Math.round(14 + 6 * scale) :
      9999;
    return { id, kind: s.kind, at: s.at, r: s.r, hp, hpMax: hp, alive: true, wait: 1 + (id % 5) * 0.8, weapon: -1, stock: s.kind === "hangar" ? (cls === "Station" ? 12 : cls === "Gargantuan" ? 8 : 6) : 0, open: 0 };
  });
}

// ---- Building a ship for the arena from a sheet
export interface ShipInput { name: string; owner?: string; imperial?: boolean; cls?: ArenaClass }
export function makeVessel(sheet: ShipSheet, input: ShipInput, side: "party" | "foe", at: { p: Vec3; yaw: number; pitch?: number }, seed: number, id: number): Vessel {
  const cls = input.cls ?? classOf(sheet.size);
  const spec = CLASSES[cls];
  const foe = side === "foe";
  const c = shipCombatant(`v${id}`, side, sheet, { x: 0, y: 0, facing: 0 });
  const parts = isCapital(cls) ? buildParts(cls, sheet.role, sheet, seed) : [];
  // A capital ship's shield is its generators: the sheet's shield pool is theirs, so the hull starts with none of its own
  if (isCapital(cls) && foe) c.shield = 0;
  const guns = gunsOf(sheet, cls);
  // Turrets fire the sheet's weapons: batteries the secondary ones, point defense the primary
  const battery = guns.findIndex((g) => g.kind === "battery");
  const point = guns.findIndex((g) => g.kind === "pd");
  const anyGun = guns.findIndex((g) => g.kind === "laser" || g.kind === "battery");
  for (const p of parts) p.weapon = p.kind === "battery" ? (battery >= 0 ? battery : anyGun) : p.kind === "pd" ? (point >= 0 ? point : anyGun) : -1;
  const top = topSpeed(sheet, cls, foe);
  const reach = Math.max(...spec.half);
  return {
    id,
    side,
    name: sheet.name || input.name,
    cls,
    role: sheet.role,
    owner: input.owner ?? (foe ? "pirates" : "the party"),
    imperial: input.imperial ?? /empire|imperial|first order|sith/i.test(input.owner ?? ""),
    c,
    p: at.p,
    yaw: at.yaw,
    pitch: at.pitch ?? 0,
    roll: 0,
    rollVel: 0,
    bank: 0,
    speed: cls === "Station" ? 0 : top * (foe ? 0.7 : 0),
    top,
    turn: turnRate(sheet, cls, foe),
    accel: Math.max(0.5, top * 0.5),
    half: spec.half,
    volume: hullVolume(cls, sheet.role),
    reach,
    ac: sheet.ac,
    guns,
    parts,
    calm: 99,
    home: null,
    ai: { side: id % 2 ? 1 : -1, breakUntil: 0, fire: 1 + (id % 4) * 0.7, missile: 4 + (id % 3) * 3, jink: 0 },
    dying: 0,
    bounty: spec.bounty,
  };
}

// ---- Foes: what each kind of ship carries, from the starship equipment data
export type StarshipRow = Parameters<typeof shipSheet>[1][number];
export type FoeKind = "droid" | "interceptor" | "fighter" | "bomber" | "gunship" | "cruiser" | "carrier" | "battleship" | "warship" | "station";
interface FoeKit { size: string; role: string; cls?: ArenaClass; primary: [RegExp, number]; secondary?: [RegExp, number]; tertiary?: RegExp; quaternary?: RegExp; shield: boolean; armor: string }
const KITS: Record<FoeKind, FoeKit> = {
  droid: { size: "Tiny", role: "Droid", primary: [/^(Light laser cannon|Blaster cannon|Laser cannon)$/, 1], shield: false, armor: "Deflection" },
  // What a carrier or station launches: no shields, no armor, as the canon's drone fighters (house rule)
  interceptor: { size: "Small", role: "Superiority Fighter", primary: [/^(Light laser cannon|Laser cannon|Blaster cannon)$/, 2], shield: false, armor: "Lightweight" },
  fighter: { size: "Small", role: "Attack Fighter", primary: [/^(Laser cannon|Light laser cannon|Assault laser cannon|Twin laser cannon|Blaster cannon)$/, 2], shield: true, armor: "Reinforced" },
  bomber: { size: "Small", role: "Bomber", primary: [/^(Light laser cannon|Laser cannon)$/, 1], tertiary: /^Torpedo launcher$/, quaternary: /^Bomb deployer$/, shield: true, armor: "Deflection" },
  gunship: { size: "Medium", role: "Gunship", primary: [/^(Laser cannon|Twin laser cannon|Assault laser cannon)$/, 2], secondary: [/^(Particle beam|Slug railgun)$/, 1], tertiary: /^Missile launcher$/, shield: true, armor: "Deflection" },
  cruiser: { size: "Large", role: "Cruiser", primary: [/^Blaster point-defense$/, 2], secondary: [/^(Double turbolaser battery|Turbolaser battery)$/, 2], tertiary: /^Assault missile launcher$/, shield: true, armor: "Deflection" },
  carrier: { size: "Huge", role: "Carrier", primary: [/^(Blaster point-defense|Laser cannon point-defense)$/, 2], secondary: [/^(Light turbolaser battery|Turbolaser battery)$/, 2], tertiary: /^Assault torpedo launcher$/, shield: true, armor: "Deflection" },
  battleship: { size: "Huge", role: "Battleship", primary: [/^(Blaster point-defense|Laser cannon point-defense)$/, 2], secondary: [/^(Heavy turbolaser battery|Assault turbolaser battery)$/, 2], tertiary: /^Assault missile launcher$/, quaternary: /^Bomb layer$/, shield: true, armor: "Reinforced" },
  warship: { size: "Gargantuan", role: "Warship", primary: [/^(Laser cannon point-defense|Blaster point-defense)$/, 2], secondary: [/^(Heavy turbolaser battery|Assault turbolaser battery)$/, 2], tertiary: /^Assault torpedo launcher$/, shield: true, armor: "Reinforced" },
  station: { size: "Gargantuan", role: "Industrial Center", cls: "Station", primary: [/^(Laser cannon point-defense|Blaster point-defense)$/, 2], secondary: [/^(Heavy turbolaser battery|Assault turbolaser battery)$/, 2], tertiary: /^Assault torpedo launcher$/, shield: true, armor: "Reinforced" },
};
export const FOE_NAMES: Record<FoeKind, string[]> = {
  droid: ["Vulture", "Needle", "Buzzer", "Sting"],
  interceptor: ["Drone", "Interceptor"],
  fighter: ["Talon", "Shrike", "Raptor", "Falcon", "Viper", "Kestrel"],
  bomber: ["Hammer", "Anvil", "Mallet"],
  gunship: ["Bulldog", "Marauder", "Brute"],
  cruiser: ["Vigilant", "Reprisal", "Tenacity", "Resolute"],
  carrier: ["Dominion", "Sovereign", "Hegemon"],
  battleship: ["Retribution", "Annihilator", "Thunderhead"],
  warship: ["Executor", "Leviathan", "Juggernaut"],
  station: ["Starfall Citadel", "The Anvil", "Bastion Prime"],
};

// The equipment of a foe, by name: the first row that matches a pattern in each category and mount (the rows are the book's; the
// patterns choose among them)
export function foeEquipment(rows: StarshipRow[], kind: FoeKind, tier: number, rand: ReturnType<typeof createRandom>): string[] {
  const kit = KITS[kind];
  const mount = ["Tiny", "Small", "Medium"].includes(kit.size) ? "Small" : "Huge";
  const weapons = rows.filter((r) => r.type === "Weapon" && r.weaponSize === mount);
  const take = (category: string, pattern: RegExp, count: number) => {
    const pool = weapons.filter((r) => r.weaponCategory === category && pattern.test(r.name));
    const any = weapons.filter((r) => r.weaponCategory === category);
    return Array.from({ length: count }, () => (pool.length ? rand.pick(pool) : any.length ? rand.pick(any) : undefined)?.name).filter(Boolean) as string[];
  };
  const names: string[] = [];
  names.push(...take("Primary", kit.primary[0], kit.primary[1]));
  if (kit.secondary) names.push(...take("Secondary", kit.secondary[0], kit.secondary[1]));
  if (kit.tertiary) names.push(...take("Tertiary", kit.tertiary, 1));
  if (kit.quaternary) names.push(...take("Quaternary", kit.quaternary, 1));
  const armor = rows.find((r) => r.type === "Armor" && r.name.startsWith(kit.armor));
  if (armor) names.push(armor.name);
  if (kit.shield) {
    const shield = rows.find((r) => r.type === "Shield" && r.name.startsWith(kit.size === "Small" && tier < 2 ? "Quick-Charge" : isCapital(kit.cls ?? classOf(kit.size)) ? "Fortress" : "Directional"));
    if (shield) names.push(shield.name);
  }
  return names;
}

export function foeSheet(rows: StarshipRow[], kind: FoeKind, tier: number, rand: ReturnType<typeof createRandom>, name?: string): ShipSheet {
  const kit = KITS[kind];
  const equipment = foeEquipment(rows, kind, tier, rand);
  return shipSheet({ name: name ?? rand.pick(FOE_NAMES[kind]), size: kit.size, role: kit.role, tier, equipment }, rows, Math.max(2, tier + 1));
}

// The shield a ship with none is lent (house rule): a deflector of three quarters of its hull points, regenerating at a die of its hull a round
export function lentShield(sheet: ShipSheet): Pick<ShipSheet, "hasShield" | "shieldMax" | "shieldDie" | "shieldDice" | "shieldRegen" | "shieldKind"> {
  return { hasShield: true, shieldMax: Math.max(4, Math.round(sheet.hullMax * ARENA.lentShield)), shieldDie: sheet.hullDie, shieldDice: sheet.hullDice, shieldRegen: Math.max(1, sheet.hullDie), shieldKind: "Deflector" };
}

// What the party flies: a ship's sheet, with a weapon lent if it has none (a yard stripped it, or the test ship has no equipment) and a
// shield if it has none
export function partySheet(sheet: ShipSheet, scenario: ScenarioId): { sheet: ShipSheet; loaned: string[] } {
  const loaned: string[] = [];
  let weapons = [...sheet.weapons];
  const firing = weapons.some((w) => w.category === "Primary" || w.category === "Secondary");
  if (!firing) {
    weapons = [fallbackWeapon(sheet.size), ...weapons];
    loaned.push(weapons[0].name);
  }
  // The raid: the contact lends two breaching torpedoes if the ship carries none, so that the core can be reached
  if (scenario === "station" && !weapons.some((w) => w.category === "Tertiary" && (w.ammo ?? 0) >= 2)) {
    weapons = [...weapons, breachTorpedo()];
    loaned.push("Breaching torpedo");
  }
  if (!sheet.hasShield) loaned.push("Deflector shield");
  return { sheet: { ...sheet, ...(sheet.hasShield ? {} : lentShield(sheet)), weapons }, loaned };
}

// ---- A fight begins
export interface StartOptions {
  seed: number;
  scenario: ScenarioId;
  rows: StarshipRow[];
  // The party's ship, as a sheet, and what it is called and who owns it (for the model)
  ship: { sheet: ShipSheet; owner?: string };
}
// Distance ahead the capital target lies, and who defends it
const SETUPS: Record<ScenarioId, { foe: FoeKind; at: number; escorts: (cls: ArenaClass) => FoeKind[] }> = {
  skirmish: { foe: "fighter", at: 0, escorts: (cls) => skirmishFoes(cls) },
  cruiser: { foe: "cruiser", at: 520, escorts: () => ["fighter", "fighter"] },
  carrier: { foe: "carrier", at: 760, escorts: () => ["fighter"] },
  battleship: { foe: "battleship", at: 820, escorts: () => ["fighter"] },
  dreadnought: { foe: "warship", at: 1300, escorts: () => ["fighter"] },
  station: { foe: "station", at: 2500, escorts: () => ["fighter", "fighter"] },
};
// What a skirmish is against, by the party's size: the same weight as the party's craft
function skirmishFoes(cls: ArenaClass): FoeKind[] {
  switch (cls) {
    case "Tiny": return ["droid", "droid", "droid", "fighter"];
    case "Small": return ["fighter", "fighter", "fighter", "bomber"];
    case "Medium": return ["fighter", "fighter", "fighter", "gunship"];
    case "Large": return ["fighter", "fighter", "fighter", "fighter", "gunship", "gunship"];
    default: return ["cruiser", "fighter", "fighter", "fighter", "fighter", "fighter"];
  }
}

// What a scenario asks of a ship of a class, said before the fight begins (advice, not a rule)
export function scenarioAdvice(id: ScenarioId, cls: ArenaClass): string {
  const i = classIndex(cls);
  switch (id) {
    case "skirmish":
      return `${skirmishFoes(cls).length} foes of about your own weight.`;
    case "cruiser":
      return i <= classIndex("Small") ? "A cruiser's shields outlast a fighter's guns: keep your missiles and bombs for its hull, and stay clear of its missiles." : i >= classIndex("Large") ? "You are the cruiser's own size: a slugging match." : "A fair fight for a ship your size.";
    case "carrier":
    case "battleship":
    case "dreadnought":
      return i <= classIndex("Small")
        ? "Hard for a craft this small: shoot out the generators first, then bomb what is left, and keep moving past the guns."
        : i <= classIndex("Large")
          ? "Heavy going: the generators first, then the hull; the guns need not be shot out, but they hurt."
          : "A match of giants.";
    case "station":
      return i > classIndex(STATION.port)
        ? "Your ship is too big for the station's port: one of its strike craft flies the run in."
        : "Shoot out the generators, fly in through the port, torpedo the reactor and get out up the shaft. Two breaching torpedoes are lent if you carry none.";
  }
}

export function dogfightStart(o: StartOptions): Dogfight {
  const rand = createRandom(o.seed);
  const scenario = scenarioOf(o.scenario);
  const setup = SETUPS[scenario.id];
  const tier = clamp(o.ship.sheet.tier, 0, 5);
  // The port takes a craft of Medium size at most: a larger ship sends one of its strike craft down the tunnel (house rule)
  const tooBig = scenario.interior && classIndex(classOf(o.ship.sheet.size)) > classIndex(STATION.port);
  const flown = tooBig ? foeSheet(o.rows, "fighter", tier, rand, `${o.ship.sheet.name}'s strike craft`) : o.ship.sheet;
  const { sheet: mine, loaned } = partySheet(flown, scenario.id);
  const s: Dogfight = {
    seed: o.seed, scenario: scenario.id, t: 0, acc: 0, limit: scenario.limit, bound: ARENA.bound, vessels: [], shots: [], nextId: 1, me: 0, lock: null, lockPart: -1, retargetSeen: 0, subSeen: 0, pickSeen: 0, cycleSeen: 0, sel: 0, slot: 0, throttle: ARENA.cruise, dialSeen: 0, flares: Math.max(1, tier), god: false,
    aim: null, kills: {}, partsDown: {}, taken: {}, foesTotal: 0, fired: 0, hits: 0, bumps: 0, bumpWait: 0, events: [], fx: [], said: [], log: [], warnings: { missile: 0, outside: 0 },
    fighter: null, interior: null, stationDown: false, outcome: null, over: false, tier, loaned, briefing: [scenario.intro],
  };
  const party = makeVessel(mine, { name: mine.name, owner: o.ship.owner }, "party", { p: [0, 0, 0], yaw: 0 }, o.seed, s.nextId++);
  party.speed = party.top * ARENA.cruise;
  party.calm = 99;
  s.me = party.id;
  s.vessels.push(party);
  const imperial = rand.chance(0.5);
  const owner = imperial ? "the Empire" : rand.pick(["pirates", "the Black Sun", "a warlord", "the Hutts"]);
  s.fighter = foeSheet(o.rows, "interceptor", tier, rand, "Interceptor");
  const place = (kind: FoeKind, p: Vec3, yaw: number, speedShare = 0.7) => {
    const kit = KITS[kind];
    const sheet = foeSheet(o.rows, kind, tier, rand);
    const v = makeVessel(sheet, { name: sheet.name, owner, imperial, cls: kit.cls }, "foe", { p, yaw }, o.seed + s.nextId, s.nextId++);
    v.speed = v.top * speedShare;
    s.vessels.push(v);
    return v;
  };
  // The target first, then its escort ringed round the party
  if (scenario.id !== "skirmish") {
    const slant = (rand.next() - 0.5) * 0.9;
    const target = place(setup.foe, [setup.at, (rand.next() - 0.5) * 120, (rand.next() - 0.5) * 260], Math.PI / 2 + slant + (rand.chance(0.5) ? Math.PI : 0), 0.8);
    if (target.cls === "Station") target.yaw = 0;
    s.bound = Math.max(ARENA.bound, setup.at + Math.max(...target.half) + 1500);
    // The carrier's and station's fighters begin launching when the party is within reach
    if (target.cls === "Station") for (const part of target.parts) if (part.kind === "hangar") part.wait = 3 + rand.next() * 6;
  }
  const escorts = setup.escorts(party.cls);
  escorts.forEach((kind, i) => {
    const angle = (i / escorts.length) * Math.PI * 2 + (rand.next() - 0.5) * 0.5;
    const dist = 200 + rand.next() * 90 + (scenario.id === "skirmish" ? 0 : 160);
    const base = scenario.id === "skirmish" ? 0 : setup.at * 0.55;
    place(kind, [base + Math.cos(angle) * dist, (rand.next() - 0.5) * 80, Math.sin(angle) * dist], angle + Math.PI);
  });
  s.foesTotal = s.vessels.filter((v) => v.side === "foe").length;
  s.briefing.push(...sortieLines(o.ship.sheet.name, tooBig, loaned));
  return s;
}

// What the pilot is told about the ship before the fight: a ship too big for the port, and what was lent (house rules)
const sortieLines = (name: string, tooBig: boolean, loaned: string[]) => [
  ...(tooBig ? [`${name} is too big for the station's port: you fly one of its strike craft.`] : []),
  ...(loaned.length ? [`${loaned.join(" and ")} lent for the sortie (house rule).`] : []),
];
export function sortieNotes(sheet: ShipSheet, scenario: ScenarioId): string[] {
  const tooBig = scenarioOf(scenario).interior && classIndex(classOf(sheet.size)) > classIndex(STATION.port);
  // (what the shipyard has fitted to the ship is in the fight: its numbers, its weapons' bonuses, flares and feedback)
  const fitted = !tooBig && sheet.mods?.length ? [`Upgrades fitted: ${sheet.mods.join(", ")}.`] : [];
  return [...sortieLines(sheet.name, tooBig, tooBig ? [] : partySheet(sheet, scenario).loaned), ...fitted];
}
