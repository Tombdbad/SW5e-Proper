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
  // At most this many of a side aim at once (a crowd takes turns: a fight against many is a fight, not a wall of bolts)
  maxShooters: 3,
  // Crouching behind cover (house rule): a smaller body, a steadier aim, and a lower mark for those who shoot at it
  crouch: { height: 0.8, spread: 0.6 },
  // How often a foe looks for its way round a wall (seconds), and how many squares it will search
  path: { every: 0.6, limit: 1500 },
  // Powers (house rule: the books' turns do not exist here): how wide the cone is that a power finds its target in (half angle), the pause after
  // one, how fast something pushed or pulled flies (squares a second), and the longest a condition lasts
  power: { cone: 0.5, pause: 0.9, knock: 9, longest: 8 },
  // Gear (2026-11-02; the user: every item has its use in the shooter too). What a poisoned body's aim is worse by, a blinded party's, the
  // seconds an item takes in the hand (the party cannot fire meanwhile; a foe stands still for its medpac), how long a burning body keeps
  // burning out of the fire, how long a mine takes to arm and a charge's timer (the book's six seconds), how near a mine is set off, how far a
  // hand reaches to bind, heal or revive, and a thrown thing's speed when a foe lobs it
  poisoned: 1.5, blinded: 2.5,
  use: 0.8, medpac: 1.2, burnAfter: 1.5, burnDps: 1.5,
  mine: { arm: 1.5, timer: 6, trigger: 0.6 },
  hand: 1.7,
  lob: { min: 6, max: 14, every: [7, 12] as [number, number] },
  // A foe's cry for help (house rule): after a while of fighting, or once its side is half down; the help comes this many seconds later
  backup: { after: 10, delay: 12 },
  // What a foe does with its hands takes a moment the party can see and cut short (2026-11-02, the user: foes throwing, spraying, healing or
  // calling "need relevant animations"): the wind-up of a throw, of a spray or a breath, the call on the comlink; a blow that staggers it this
  // long or more breaks it off
  act: { throw: 0.5, spray: 0.55, call: 1.4, breaks: 0.4 },
  // A blow in close (2026-11-02, the user: "balance melee damage"; a beast struck five times in six seconds and never missed): the stat
  // block's attacks a round come as one blow every `round` seconds shared between them (the tabletop's six-second round at the pace the
  // party's own fire keeps), each landing as often as its attack roll would against the Armor Class (`hitChance`), after a wind-up the party
  // can step out of
  melee: { round: 4, fastest: 1.2, windup: 0.5 },
};
// How often an attack roll lands: a d20 + the bonus against the Armor Class (a 1 always misses, a 20 always hits), as a chance and not a die
export const hitChance = (bonus: number, ac: number) => clamp((21 - ac + bonus) / 20, 0.05, 0.95);
// A monster (2026-11-02, the user: "Monsters should not use grenades, weapons, or items"): a beast, a plant, an aberration, the undead, an
// elemental, wildlife. It fights with what it is: its bite, claws, spit and breath, never a blaster, a grenade or a medpac.
export const monstrous = (o: { creature?: string; role?: string }) => /beast|plant|tree|aberration|undead|elemental|monstrosity|ooze|swarm of (?:tiny |small )?beasts/i.test(o.creature ?? "") || /wildlife|horror|beast/i.test(o.role ?? "");

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
// Outside a fight the shooter has no dice either (house rule, 2026-11-02; the user: a prompt to roll on landing from a jetpack "is WRONG"):
// a check is the Player's Handbook's passive check, 10 + the bonus, +5 with advantage and -5 with disadvantage (`passiveD20`), made at once
// with no prompt; any other die the tabletop would throw shows its middle face (`passiveFace`: d20 10, d8 4, d6 3, d4 2)
export const passiveFace = (sides: number) => Math.max(1, Math.floor((sides + 1) / 2));
export const passiveD20 = (edge: number) => 10 + 5 * Math.sign(edge);
// A fall in the shooter (house rule): no check is made in the air (the pack is lit, or fired in a burst, by the player before the ground:
// Space or Left Shift), and what is not done in time hits the ground: the dice at their average, rounded down
export const passiveDamage = (dice: number, sides: number, half = false) => {
  const total = Math.floor((dice * (sides + 1)) / 2);
  return half ? Math.floor(total / 2) : total;
};

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
  // How hard it kicks (0 to 1: a hold-out barely, a heavy repeater or a sniper rifle hard) and how steady its aim is (a share of the party's
  // spread: a rifle's long barrel is steadier than a pistol, a scattergun wilder): see `gunKick`
  kick?: number;
  steady?: number;
  // What reloads have used up so far (to be taken out of the pack when the fight is over)
  spent: number;
  reload: number;
  // A launcher fires the grenades in the pack (`shell`, set by the scene to the one next to throw) and they burst where they strike; a round
  // that explodes (a rocket, a missile: its ammunition's rider) bursts where its bolt stops
  launcher?: boolean;
  shell?: GrenadeKind;
  burst?: GrenadeKind;
  // A bipod or tripod carried: crouched and still, the aim is steadier and the kick less (house rule for "increased stability")
  brace?: boolean;
}
export interface Blade {
  name: string;
  damage: number;
  type: string;
  // A lightsaber (or any blade that lets the wielder hold off bolts)
  saber: boolean;
}
// How a gun kicks and how steady it is, by its kind (its name) and how heavy a shot it fires (house rule, 2026-10-30: the user asked for "recoil
// animations and spread depending on the weapon's fire power and type"). Each shot of a hard-kicking gun throws the aim off further, so a heavy
// gun fired fast sprays; a rifle or a sniper rifle aimed with care groups its shots tighter than a pistol.
export function gunKick(name: string, damage = 0): { kick: number; steady: number } {
  const n = name.toLowerCase();
  const [kick, steady] = /hold-?out|derringer|sporting/.test(n) ? [0.15, 1.1] : /shotgun|scatter/.test(n) ? [0.8, 1.9] : /sniper|slugthrower rifle|cycler/.test(n) ? [0.85, 0.35]
    : /heavy|repeat|cannon|launcher|rotary/.test(n) ? [0.8, 1.3] : /carbine/.test(n) ? [0.4, 0.85] : /rifle|bowcaster/.test(n) ? [0.55, 0.65] : /pistol|blaster$/.test(n) ? [0.3, 1] : [0.4, 1];
  return { kick: Math.max(0.1, Math.min(1, kick + Math.max(0, damage - 7) * 0.025)), steady };
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
  return { name: kit.rangedWeapon, damage, type: (kit.rangedType ?? "energy").toLowerCase(), interval, auto, range, long, mag, left: a ? a.left : mag, reserve, cells, spent: 0, reload: a && a.max <= 0 ? 0.7 : 1.6, ...gunKick(kit.rangedWeapon, each) };
}
// (`meleeExtra`: more dice on each blow, a top-grade calibrator's or shock gloves' on an unarmed strike)
export function bladeOf(kit: { meleeWeapon?: string; meleeDice?: string; meleeDamage?: number; meleeType?: string; meleeExtra?: { dice: string } }): Blade | undefined {
  if (!kit.meleeWeapon) return undefined;
  return { name: kit.meleeWeapon, damage: Math.max(1, avgDice(kit.meleeDice, kit.meleeDamage ?? 0) + avgDice(kit.meleeExtra?.dice)), type: (kit.meleeType ?? "kinetic").toLowerCase(), saber: /lightsaber|saber|lightfoil|shoto|doublesaber/i.test(kit.meleeWeapon) };
}

// A grenade from the rules text: how far it bursts, what it does ("2d8 acid"), or that it only blinds
export interface GrenadeKind {
  name: string;
  radius: number;
  damage: number;
  type: string;
  blinds: boolean;
  // What else the burst does, in seconds (house rule: a condition's turns at six seconds each, at most SHOOT.power.longest): stuns (stunned,
  // shocked, paralyzed, unconscious), knocks down (prone: a short stagger), frightens (the brave are only shaken), poisons (a worse aim)
  stun?: number;
  prone?: boolean;
  fear?: number;
  poison?: number;
  // The ground it leaves burning (or full of gas) for so many seconds, and what that does each second to whoever stands in it
  lingers?: number;
  dps?: number;
  // (an incendiary rocket: its burst, and the ground ablaze over a wider radius, squares)
  lingerRadius?: number;
  // Bursts in a cone the way it faces (a breaching charge), not all round
  cone?: boolean;
}
export function grenadeOf(item: { name: string; description?: string }): GrenadeKind | undefined {
  if (!/grenade/i.test(item.name) || /launcher/i.test(item.name)) return undefined;
  const text = item.description ?? "";
  const radius = Number(text.match(/within (\d+) feet/i)?.[1] ?? 10) / 5;
  const dmg = text.match(/(\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage/i);
  return { name: item.name, radius, damage: dmg ? avgDice(dmg[1]) : 0, type: (dmg?.[2] ?? "kinetic").toLowerCase(), blinds: /blinded/i.test(text) };
}
// Seconds a condition lasts here: its turns at six seconds each, at most SHOOT.power.longest
export const secondsOf = (rounds = 1) => Math.min(SHOOT.power.longest, Math.max(1, rounds) * 6);
// A burst read from the rules (an explosive's `gearUse`, a stat block's area action, an exploding round): the dice at their average, the
// conditions it brings as seconds of what the shooter has (see GrenadeKind), the ground left burning
// (`fire`: a burst that also leaves the ground ablaze, over its own radius in feet, at its dice a turn)
export function blastOf(name: string, b: { radius: number; cone?: boolean; damage: { dice: string; type: string }[]; conditions?: string[]; lingers?: boolean; rounds?: number; fireDice?: string; fire?: { radius: number; dice: string } }): GrenadeKind {
  if (b.fire) return { ...blastOf(name, { ...b, fire: undefined }), lingers: 60, dps: Math.max(0.5, avgDice(b.fire.dice) / 6), lingerRadius: Math.max(1, b.fire.radius / 5) };
  const has = (re: RegExp) => (b.conditions ?? []).some((c) => re.test(c));
  const secs = secondsOf(b.rounds ?? 1);
  const total = b.damage.reduce((n, d) => n + avgDice(d.dice), 0);
  // (the type of the heaviest part names the burst: a thermal detonator's 2d10 kinetic over its 2d6 fire)
  const main = [...b.damage].sort((x, y) => avgDice(y.dice) - avgDice(x.dice))[0];
  const lingerType = main?.type ?? (has(/poison/i) ? "poison" : "fire");
  return {
    name, radius: Math.max(1, b.radius / 5), damage: b.lingers ? 0 : total, type: (b.lingers ? lingerType : main?.type ?? "kinetic").toLowerCase(), blinds: has(/blind/i),
    ...(has(/stun|shock|paralyz|unconscious|incapacitat|restrain/i) ? { stun: has(/shock/i) && !has(/stun|paralyz/i) ? Math.min(2, secs) : secs } : {}),
    ...(has(/prone/i) ? { prone: true } : {}),
    ...(has(/frighten/i) ? { fear: secs } : {}),
    ...(has(/poison/i) ? { poison: secs } : {}),
    // (ground set ablaze or filled for "1 minute": the fight's minute, at the dice a turn spread over its six seconds)
    ...(b.lingers ? { lingers: 60, dps: Math.max(0.5, (avgDice(b.fireDice) || total) / 6) } : {}),
    ...(b.cone ? { cone: true } : {}),
  };
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
  // Crouching behind cover (the party's)
  crouch?: boolean;
  // The party's force or tech points and the powers it can use in real time (keys 1 to 4), and the pause before the next
  points?: number;
  powers?: RtPower[];
  powerCd?: number;
  // Being pushed or pulled: a velocity (squares a second), for how long, and the damage if it strikes a wall
  knock?: { vx: number; vy: number; t: number; strike: number; type: string };
  // The squares a foe is walking to get round a wall, how long until it looks again, and how long until it checks it is not stuck in one
  path?: { x: number; y: number }[];
  pathT: number;
  stuckT: number;
  // ---- What the rules add (2026-11-02): seconds poisoned (a worse aim, a slower swing) and burning (and how hard), temporary hit points, damage
  // types it shrugs off, takes double or ignores, conditions it cannot be given, damage its armour takes off every blow (at least 1 stays),
  // hit points a stat block's regeneration gives every six seconds
  poisoned: number;
  burning: number;
  burnDps?: number;
  // fire's and gas's damage not yet dealt (see seep)
  dot?: Record<string, number>;
  temp: number;
  resist?: string[];
  vulnerable?: string[];
  immune?: string[];
  condImmune?: string[];
  absorb?: number;
  regen?: number;
  regenT?: number;
  // A dose of poison on the blade for the next blow that lands (its damage), and a substance's high (seconds: a steadier aim, temporary hit
  // points again every six seconds)
  venom?: number;
  high?: { t: number; temp: number; every: number };
  // What a foe carries and uses (see FoeKit), seconds of an item in its hands (a medpac: it stands still), and its next go at a thrown thing
  kit?: FoeKit;
  using?: number;
  // Taken alive (binders, a restraining bolt): out of the fight, not dead
  bound?: boolean;
  // Waiting off the map for a call for help (see SHOOT.backup); `caller` carries a comlink and calls
  reserve?: boolean;
  caller?: boolean;
  // Small enough to bind (Small or Medium); a droid or construct (bolts, repair kits, emergency batteries)
  small?: boolean;
  droid?: boolean;
  // What its attack's hit brings besides damage (a stat block's "or be poisoned": its conditions, see GrenadeKind)
  rider?: GrenadeKind;
  // A monster (see `monstrous`): its shots are spat or flung, not fired from a gun
  natural?: boolean;
  // What its hands (or jaws) are about: a throw, a spray or breath, a call for help, under way for `t` seconds more (SHOOT.act)
  act?: { kind: "throw" | "spray" | "call"; t: number; blast?: FoeBlast; target?: string };
  // (the party only) half damage from a burst, a cone or a breath, by the item that gives it (Reflex Enhancer: "no damage if you succeed on
  // a saving throw, and only half damage if you fail", taken at its middle: house rule); once a fight, to drop to 1 hit point instead of 0
  evade?: boolean;
  endure?: boolean;
}
// What a foe has to use besides its attack (2026-11-02, house rule): the area actions of its stat block (a flamethrower's cone, a grenade's
// sphere: thrown, `left` times or every so many seconds as its recharge goes), medpacs for itself, an antidote and an extinguisher for its own
// poison and fire. A nemesis carries what it learned to carry against the party (nemesis.ts `kit`).
// (`natural`: a monster's: spat, flung or breathed, a glob that bursts where it strikes and not a grenade with a fuse)
export interface FoeBlast { kind: GrenadeKind; thrown: boolean; range: number; left: number; every: number; cd: number; line?: boolean; around?: boolean; natural?: boolean }
export interface FoeKit { blasts: FoeBlast[]; medpacs: number; heal: number; antidote?: boolean; extinguisher?: boolean }
// A power as the fight plays it (the game reads these from the power's text: client/src/lib/sw5e/realtimePowers.ts). The dice are taken at
// their average, a condition lasts seconds, a push or a pull sends a creature a distance.
export type PowerKind = "damage" | "heal" | "stun" | "fear" | "blind" | "push" | "pull";
export interface RtPower {
  id: string;
  name: string;
  cost: number;
  kind: PowerKind;
  // damage dealt (or hit points healed), and its type
  damage: number;
  type: string;
  // how far it reaches (squares), the radius round its target that it also takes (squares), how long a condition lasts, how far a creature is moved (squares)
  range: number;
  radius: number;
  seconds: number;
  distance: number;
  // the damage when what is pushed strikes a wall
  strike: number;
}
// (`natural`: spat or flung by a monster, drawn as what it is: a glob, a spine)
export interface Bolt { id: number; owner: string; side: Side; x: number; y: number; h: number; vx: number; vy: number; vh: number; damage: number; type: string; life: number; reflected?: boolean; cell: [number, number]; burst?: GrenadeKind; natural?: boolean }
export interface Grenade { id: number; owner: string; side: Side; x: number; y: number; h: number; vx: number; vy: number; vh: number; fuse: number; kind: GrenadeKind; bounces: number; impact?: boolean; natural?: boolean }
// A mine or charge set on the ground: arming, then set off by a body of the other side that comes near (a mine), its timer (a charge), or the
// remote detonator it is paired with (`paired`: only that)
export interface Mine { id: number; owner: string; side: Side; x: number; y: number; h: number; facing: number; kind: GrenadeKind; arm: number; timer?: number; paired: boolean; name: string }
// Ground that hurts whoever stands in it (fire, gas) for so many seconds more
export interface Field { id: number; owner: string; x: number; y: number; h: number; radius: number; t: number; dps: number; type: string; poison?: number }
// What the party carries into a fight and can use there (keys Z and T, the Item button): read by the game from each item's rules (`gearUse`)
export type GearAct =
  | { act: "heal"; amount: number; droid?: boolean }
  | { act: "revive"; droid: boolean }
  | { act: "cure" }
  | { act: "stim"; temp: number; seconds: number; every?: number }
  | { act: "boost"; temp: number; ac: number; damage: number }
  | { act: "coat"; damage: number }
  | { act: "throw"; blast: GrenadeKind }
  // (`pairs`: a remote detonator carried pairs this many set at once, which then go off only to it)
  | { act: "set"; blast: GrenadeKind; mine: boolean; pairs?: number }
  | { act: "detonate"; range: number; pairs: number }
  | { act: "blink"; range: number }
  | { act: "spray"; range: number; blind: number }
  | { act: "edge"; damage: number; saber: boolean }
  | { act: "bind"; droid: boolean }
  | { act: "jam" }
  | { act: "rocket"; blast: GrenadeKind; damage: number };
export interface FightGear { name: string; count: number; act: GearAct }
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
  | { type: "blocked"; id: string }
  // a bolt stopped by a wall or the floor
  | { type: "impact"; x: number; y: number; h: number }
  // a power cast: from the party's hand to where it takes hold
  | { type: "power"; id: string; kind: PowerKind; name: string; x: number; y: number; h: number; tx: number; ty: number; th: number }
  // an item used (by the party or a foe: a medpac, an antidote, a jammer), with what it did; a foe's area action (a cone or line from x to tx)
  | { type: "use"; id: string; name: string; text: string }
  | { type: "spray"; id: string; name: string; dmgType: string; x: number; y: number; h: number; tx: number; ty: number; th: number }
  | { type: "lob"; id: string; natural?: boolean }
  // a call for help: made, jammed, answered
  | { type: "call"; id: string; jammed: boolean }
  | { type: "arrive"; id: string }
  // a foe begins something with its hands that takes a moment (the scene plays its wind-up), or is stopped in it; a blow that misses
  | { type: "act"; id: string; act: "throw" | "spray" | "call" | "heal"; seconds: number }
  | { type: "broken"; id: string }
  | { type: "miss"; id: string; target: string };

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
  mines: Mine[];
  fields: Field[];
  // The party's comm jammer is on; a foe has called for help (and when the help comes)
  jammed?: boolean;
  called?: boolean;
  backupAt?: number;
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
    focus: SHOOT.focus.max, blocking: false, landed: false, wasReloading: false, pathT: 0, stuckT: 0, poisoned: 0, burning: 0, temp: 0, ...base,
  };
}
export function newSim(units: Unit[], opts: { seed?: number; surprise?: boolean } = {}): Sim {
  // (those waiting for a call are off the map until it comes)
  for (const u of units) if (u.reserve) u.mode = "gone";
  return { units, bolts: [], grenades: [], time: 0, seq: 1, seed: opts.seed ?? 1, spread: SHOOT.spread.base, surprise: !!opts.surprise, mines: [], fields: [] };
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
// Whether a body fits at a point: all four of its corners stand on ground
export const fitsAt = (env: Env, x: number, y: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => env.walkable(x + a * SHOOT.radius * 0.8, y + b * SHOOT.radius * 0.8));
// How tall a body is just now
export const heightOf = (u: Pick<Unit, "crouch">) => (u.crouch ? SHOOT.crouch.height : SHOOT.height);

// A body in a wall (put there by a map that changed under it: the party went through a door, a room was drawn again) is brought out to
// the nearest square it fits in. Without this a unit in a wall can never move again, for every step it tries ends in the wall.
export function unstick(u: Unit, env: Env): boolean {
  if (fitsAt(env, u.x, u.y)) return false;
  for (let r = 0.5; r <= 9; r += 0.5) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + r;
      const [x, y] = [Math.floor(u.x + Math.sin(a) * r) + 0.5, Math.floor(u.y + Math.cos(a) * r) + 0.5];
      if (fitsAt(env, x, y)) {
        u.x = x;
        u.y = y;
        u.h = env.floorAt(x, y);
        u.path = undefined;
        return true;
      }
    }
  }
  return false;
}

// The way round a wall: the squares from one point to another over ground a body can stand on (eight ways, never cutting a corner), or
// null when there is none within `limit` squares searched
export function route(env: Env, from: { x: number; y: number }, to: { x: number; y: number }, limit: number = SHOOT.path.limit): { x: number; y: number }[] | null {
  const a = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const b = { x: Math.floor(to.x), y: Math.floor(to.y) };
  if (a.x === b.x && a.y === b.y) return [];
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, { x: number; y: number }>([[key(a.x, a.y), a]]);
  const queue = [a];
  let found = false;
  for (let head = 0, n = 0; head < queue.length && n < limit; head++, n++) {
    const c = queue[head];
    if (c.x === b.x && c.y === b.y) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [nx, ny] = [c.x + dx, c.y + dy];
      if (prev.has(key(nx, ny))) continue;
      if (!(env.walkable(nx + 0.5, ny + 0.5) || (nx === b.x && ny === b.y))) continue;
      if (dx && dy && !(env.walkable(c.x + dx + 0.5, c.y + 0.5) && env.walkable(c.x + 0.5, c.y + dy + 0.5))) continue;
      prev.set(key(nx, ny), c);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!found) return null;
  const out: { x: number; y: number }[] = [];
  for (let c = b; !(c.x === a.x && c.y === a.y); c = prev.get(key(c.x, c.y))!) out.unshift({ x: c.x + 0.5, y: c.y + 0.5 });
  return out;
}
// Whether the way straight from one point to another is ground a body can walk
function lineWalkable(env: Env, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  for (let i = 1, n = Math.ceil(d / 0.3); i < n; i++) {
    const t = i / n;
    if (!fitsAt(env, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false;
  }
  return true;
}

// Moves a unit by (dx, dy) if its body fits there, sliding along a wall on the axis that is free
export function walk(u: Unit, dx: number, dy: number, env: Env): boolean {
  const fits = (x: number, y: number) => fitsAt(env, x, y);
  const [ox, oy] = [u.x, u.y];
  if (fits(u.x + dx, u.y)) u.x += dx;
  if (fits(u.x, u.y + dy)) u.y += dy;
  u.h = env.floorAt(u.x, u.y);
  // (it counts as a step only if it went a fair part of the way: a push straight at a wall "fits" along the wall by nothing at all, which made
  // a foe at a wall think it was walking, and never try another way)
  return Math.hypot(u.x - ox, u.y - oy) > Math.hypot(dx, dy) * 0.3;
}

// ---- Hurting -----------------------------------------------------------------------------------------------------------------------
function hurt(sim: Sim, target: Unit, amount: number, type: string, by: Unit | undefined, events: Event[], at: { x: number; y: number; h: number }, head = false) {
  if (!alive(target) || amount <= 0) return;
  // (the stat block's and the sheet's resistances, vulnerabilities and immunities, by damage type)
  const t = type.toLowerCase();
  const has = (list?: string[]) => !!list?.some((x) => x.toLowerCase().includes(t));
  if (has(target.immune)) return;
  const typed = amount * (has(target.resist) ? 0.5 : 1) * (has(target.vulnerable) ? 2 : 1);
  const cut = target.side === "player" || target.side === "ally" ? clamp((target.ac - 10) * SHOOT.armor, 0, SHOOT.armorMax) : 0;
  let dealt = Math.max(1, Math.round(typed * (1 - cut)) - (target.absorb ?? 0));
  // Temporary hit points go first
  const shield = Math.min(target.temp, dealt);
  target.temp -= shield;
  const shown = dealt;
  dealt -= shield;
  target.hp = Math.max(0, target.hp - dealt);
  // (armour that will not let its wearer fall: once, to 1 hit point instead)
  if (target.hp <= 0 && target.endure) {
    target.endure = false;
    target.hp = 1;
    events.push({ type: "use", id: target.id, name: "Enhanced Endurance", text: "held on at 1" });
  }
  if (dealt <= 0) return void events.push({ type: "hit", target: target.id, by: by?.id ?? "", amount: shown, head, ...at });
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
// What a burst, a cone or a power's rider does besides damage (GrenadeKind's conditions), unless the body cannot be given that condition
function afflict(sim: Sim, u: Unit, k: Pick<GrenadeKind, "blinds" | "stun" | "prone" | "fear" | "poison">, events: Event[]) {
  if (!alive(u)) return;
  const immune = (re: RegExp) => !!u.condImmune?.some((c) => re.test(c));
  if (k.blinds && !immune(/blind/i)) { u.blind = Math.max(u.blind, SHOOT.grenade.blind); u.stagger = Math.max(u.stagger, SHOOT.flash); }
  if (k.stun && !immune(/stun|paraly/i)) u.stagger = Math.max(u.stagger, k.stun);
  if (k.prone && !immune(/prone/i)) u.stagger = Math.max(u.stagger, 1);
  if (k.poison && !immune(/poison/i)) u.poisoned = Math.max(u.poisoned, k.poison);
  if (k.fear && !immune(/frighten/i)) {
    // (the party and its own do not run: they are shaken for a moment; nor do the brave)
    if (u.side !== "foe" || u.brave || u.leader) u.stagger = Math.max(u.stagger, Math.min(2, k.fear));
    else if (u.mode !== "flee") { startFleeing(u, events); u.flee = k.fear; }
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
function launch(sim: Sim, owner: Unit, gun: { damage: number; type: string; long: number; burst?: GrenadeKind }, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, spread: number, events: Event[]) {
  const dx = to.x - from.x, dy = to.y - from.y, dh = to.h - from.h;
  const d = Math.hypot(dx, dy) || 1e-6;
  // The aim is off by an angle within the spread (a square-rooted draw puts most shots near the line)
  const yaw = Math.atan2(dx, dy) + (rand(sim) * 2 - 1) * spread * (0.4 + 0.6 * rand(sim));
  const pitch = Math.atan2(dh, d) + (rand(sim) * 2 - 1) * spread * 0.6;
  const speed = SHOOT.boltSpeed;
  sim.bolts.push({
    id: sim.seq++, owner: owner.id, side: owner.side, x: from.x, y: from.y, h: from.h, cell: [Math.floor(from.x), Math.floor(from.y)],
    vx: Math.sin(yaw) * Math.cos(pitch) * speed, vy: Math.cos(yaw) * Math.cos(pitch) * speed, vh: Math.sin(pitch) * speed,
    damage: gun.damage, type: gun.type, life: Math.min(SHOOT.boltLife, gun.long / speed), ...(gun.burst ? { burst: gun.burst } : {}), ...(owner.natural ? { natural: true } : {}),
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
  if (g.launcher && !g.shell) return false;
  g.left--;
  p.fire = g.interval;
  const far = Math.hypot(to.x - from.x, to.y - from.y) > g.range ? 1.5 : 1;
  // (braced on a bipod or tripod: crouched and not moving)
  const braced = !!g.brace && !!p.crouch && !moving;
  // (each shot opens the cone by how hard the gun kicks; the cone is narrower for a steadier gun)
  const kick = (g.kick ?? 0.4) * (braced ? 0.5 : 1);
  sim.spread = clamp(Math.max(sim.spread, SHOOT.spread.base) + SHOOT.spread.perShot * (g.auto ? 1.4 : 1) * (0.5 + kick * 1.25), 0, SHOOT.spread.max);
  // (poisoned or blinded the aim is worse; a substance's high steadies it)
  const state = (p.poisoned > 0 ? SHOOT.poisoned : 1) * (p.blind > 0 ? SHOOT.blinded : 1) * (p.high && p.high.t > 0 ? 0.85 : 1) * (braced ? 0.5 : 1);
  const spread = clamp((sim.spread * (g.steady ?? 1) + (moving ? SHOOT.spread.moving : 0) + (airborne ? SHOOT.spread.air : 0)) * far * (p.crouch ? SHOOT.crouch.spread : 1) * state, 0, SHOOT.spread.max * 2);
  p.facing = Math.atan2(to.x - from.x, to.y - from.y);
  if (g.launcher && g.shell) {
    // A grenade fired from the launcher: flatter and faster than a throw, and it bursts where it strikes
    const dx = to.x - from.x, dy = to.y - from.y, flat = Math.hypot(dx, dy) || 1;
    const yaw = Math.atan2(dx, dy) + (rand(sim) * 2 - 1) * spread;
    const speed = 22;
    sim.grenades.push({ id: sim.seq++, owner: p.id, side: "player", x: from.x, y: from.y, h: from.h, vx: Math.sin(yaw) * speed, vy: Math.cos(yaw) * speed, vh: ((to.h - from.h) / flat) * speed + 2, fuse: 3, kind: g.shell, bounces: 0, impact: true });
    events.push({ type: "shot", from: p.id, ...from });
    noise(sim, from.x, from.y, 18, events);
    return true;
  }
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
// The party casts the power in slot `index`. Returns "" when it was cast, else why not (the scene says it).
export function castPower(sim: Sim, index: number, env: Env, events: Event[]): string {
  const p = playerOf(sim);
  const power = p.powers?.[index];
  if (!power) return "";
  if (p.dead || p.stagger > 0) return "Cannot cast now";
  if ((p.powerCd ?? 0) > 0) return "";
  if ((p.points ?? 0) < power.cost) return `Not enough points for ${power.name} (${power.cost})`;
  const from = { x: p.x, y: p.y, h: p.h + 1.0 };
  let at = { x: p.x, y: p.y, h: p.h + 1.0 };
  if (power.kind === "heal") {
    if (p.hp >= p.maxHp) return `${power.name}: already unhurt`;
    p.hp = Math.min(p.maxHp, p.hp + power.damage);
  } else {
    // The foe nearest the line of the aim, within the power's reach and the cone, and in sight
    const [fx, fy] = dirOf(p.facing);
    let target: Unit | undefined;
    let best = Infinity;
    for (const u of sim.units) {
      if (u.side !== "foe" || !alive(u) || u.mode === "gone") continue;
      const d = dist(p, u);
      // (reach is measured from the body: a power with a reach of one square takes whoever stands next to the party)
      if (d > power.range + 0.8) continue;
      const off = Math.acos(clamp(((u.x - p.x) * fx + (u.y - p.y) * fy) / (d || 1), -1, 1));
      if (off > SHOOT.power.cone || !sees(env, { x: p.x, y: p.y, h: p.h }, { x: u.x, y: u.y, h: u.h })) continue;
      const score = off * 6 + d * 0.1;
      if (score < best) [target, best] = [u, score];
    }
    if (!target) return `${power.name}: nothing in its reach`;
    at = { x: target.x, y: target.y, h: target.h + SHOOT.height * 0.6 };
    for (const u of sim.units) {
      if (u.side !== "foe" || !alive(u) || u.mode === "gone") continue;
      if (u !== target && dist(u, target) > power.radius) continue;
      if (u.mode === "idle") alertFoe(sim, u, events);
      if (power.kind === "damage") {
        hurt(sim, u, power.damage, power.type, p, events, { x: u.x, y: u.y, h: u.h + SHOOT.height * 0.6 });
        u.stagger = Math.max(u.stagger, 0.3);
      } else if (power.kind === "stun") u.stagger = Math.max(u.stagger, Math.min(SHOOT.power.longest, power.seconds));
      else if (power.kind === "blind") u.blind = Math.max(u.blind, Math.min(SHOOT.power.longest, power.seconds));
      else if (power.kind === "fear") {
        // (the brave do not run: they are shaken for a moment)
        if (u.brave || u.leader) u.stagger = Math.max(u.stagger, Math.min(2, power.seconds));
        else { u.mode = "flee"; u.flee = Math.min(SHOOT.power.longest, power.seconds); }
      } else {
        const way = power.kind === "push" ? 1 : -1;
        const d = dist(p, u) || 1;
        const secs = Math.max(0.15, power.distance / SHOOT.power.knock);
        u.knock = { vx: ((u.x - p.x) / d) * SHOOT.power.knock * way, vy: ((u.y - p.y) / d) * SHOOT.power.knock * way, t: secs, strike: power.strike, type: power.type };
        u.stagger = Math.max(u.stagger, secs + 0.2);
      }
    }
  }
  p.points = (p.points ?? 0) - power.cost;
  p.powerCd = SHOOT.power.pause;
  events.push({ type: "power", id: p.id, kind: power.kind, name: power.name, ...from, tx: at.x, ty: at.y, th: at.h });
  return "";
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

// ---- The party's gear ------------------------------------------------------------------------------------------------------------------
// The body in front of the party within a hand's reach that `ok` accepts (the nearest to the line of its look)
function inReach(sim: Sim, p: Unit, ok: (u: Unit) => boolean, reach: number = SHOOT.hand): Unit | undefined {
  const [fx, fy] = dirOf(p.facing);
  let best: Unit | undefined;
  let score = Infinity;
  for (const u of sim.units) {
    if (u === p || !ok(u)) continue;
    const d = dist(p, u);
    if (d > reach + SHOOT.radius || Math.abs(u.h - p.h) > 1.2) continue;
    const off = d < 0.3 ? 0 : Math.acos(clamp(((u.x - p.x) * fx + (u.y - p.y) * fy) / d, -1, 1));
    if (off > 1.2) continue;
    if (off + d * 0.2 < score) [best, score] = [u, off + d * 0.2];
  }
  return best;
}
// The party uses an item (house rules after each item's text: a moment in the hand, no save or roll). Returns "" when it was used (the scene
// then takes one from the pack), KEPT when it was used and is not used up (a detonator, a jammer switched on), else why not. `aim` is the point
// under the crosshair; `place` moves the party (the teleporter).
export const KEPT = "kept";
export function applyGear(sim: Sim, gear: FightGear, env: Env, events: Event[], aim?: { x: number; y: number; h: number } | null, place?: (x: number, y: number) => boolean): string {
  const p = playerOf(sim);
  if (p.dead || p.stagger > 0) return "Cannot use anything now";
  if (gear.count <= 0) return `No ${gear.name} left`;
  const a = gear.act;
  const said = (text: string) => events.push({ type: "use", id: p.id, name: gear.name, text });
  const busy = () => { p.fire = Math.max(p.fire, SHOOT.use); p.blocking = false; };
  const front = () => {
    const [fx, fy] = dirOf(p.facing);
    return { x: p.x + fx * 0.6, y: p.y + fy * 0.6, h: p.h + 1.0 };
  };
  if (a.act === "heal") {
    // A companion in front who is hurt and of the kind it is for (a medpac for flesh, a repair kit for a droid), else the party
    const ally = inReach(sim, p, (u) => u.side === "ally" && alive(u) && u.hp < u.maxHp && !!u.droid === !!a.droid);
    if (ally) {
      const was = ally.hp;
      ally.hp = Math.min(ally.maxHp, ally.hp + a.amount);
      said(`${ally.name} +${Math.round(ally.hp - was)}`);
    } else {
      if (a.droid) return "A repair kit is for a droid: stand by a hurt droid of yours";
      if (p.hp >= p.maxHp) return "You are not hurt";
      const was = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + a.amount);
      said(`+${Math.round(p.hp - was)}`);
    }
  } else if (a.act === "revive") {
    const down = inReach(sim, p, (u) => u.side === "ally" && u.dead && !u.fled && !!u.droid === a.droid);
    if (!down) return a.droid ? "Stand by a droid of yours that is down" : "Stand by a companion who has fallen";
    down.dead = false;
    down.hp = 1;
    down.mode = "engage";
    said(`${down.name} is back up`);
  } else if (a.act === "cure") {
    // (no poison in the body: it guards against poison for the rest of the fight, the book's "advantage against poison")
    const was = p.poisoned > 0;
    p.poisoned = 0;
    if (!was) p.condImmune = [...(p.condImmune ?? []), "poisoned"];
    said(was ? "the poison is neutralized" : "guarded against poison");
  } else if (a.act === "stim") {
    p.temp = Math.max(p.temp, a.temp);
    p.high = { t: a.seconds, temp: a.temp, every: a.every ?? 6 };
    said(a.temp ? `${a.temp} temporary hit points` : "a high");
  } else if (a.act === "boost") {
    p.temp = Math.max(p.temp, a.temp);
    p.ac += a.ac;
    if (a.damage) { if (p.gun) p.gun.damage += a.damage; if (p.blade) p.blade.damage += a.damage; }
    said([a.temp && `${a.temp} temporary hit points`, a.ac && `+${a.ac} AC`, a.damage && `+${a.damage} damage`].filter(Boolean).join(", "));
  } else if (a.act === "coat") {
    if (!p.blade) return "Poison goes on a blade";
    p.venom = a.damage;
    said("on the blade, for the next blow");
  } else if (a.act === "throw") {
    if (!aim) return "Look where to throw it";
    const from = front();
    const d: [number, number, number] = [aim.x - from.x, aim.y - from.y, (aim.h - from.h) / Math.max(1, Math.hypot(aim.x - from.x, aim.y - from.y))];
    const len = Math.hypot(d[0], d[1]) || 1;
    throwGrenade(sim, a.blast, from, [d[0] / len, d[1] / len, d[2]]);
  } else if (a.act === "set") {
    // A mine arms in a moment and goes off for the first of the other side near it; a charge, set facing the way the party looks, goes off on
    // its timer, or on the remote detonator when the party carries one (paired)
    const paired = !!a.pairs && sim.mines.filter((m) => m.paired).length < a.pairs;
    sim.mines.push({ id: sim.seq++, owner: p.id, side: "player", x: p.x, y: p.y, h: env.floorAt(p.x, p.y), facing: p.facing, kind: a.blast, arm: SHOOT.mine.arm, ...(a.mine ? {} : { timer: SHOOT.mine.timer }), paired, name: gear.name });
    said(a.mine ? (paired ? "set, paired with the detonator" : "set: it arms in a moment") : paired ? "set, paired with the detonator" : `set: ${SHOOT.mine.timer} seconds`);
  } else if (a.act === "detonate") {
    const near = sim.mines.filter((m) => m.paired && m.side === "player" && Math.hypot(m.x - p.x, m.y - p.y) <= a.range);
    if (!near.length) return sim.mines.some((m) => m.paired) ? "The paired charges are out of the detonator's reach" : "Nothing paired is set";
    for (const m of near) blow(sim, { x: m.x, y: m.y, h: m.h + 0.2 }, m.kind, m.owner, env, events, m.facing);
    sim.mines = sim.mines.filter((m) => !near.includes(m));
    said(`${near.length} set off`);
    // (the detonator is not used up)
    return KEPT;
  } else if (a.act === "blink") {
    if (!aim || !place) return "Look where to step to";
    const dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy) || 1;
    const go = Math.min(d, a.range);
    // (to a free square in sight within its reach, the farthest along the aim)
    for (let s = go; s >= 1; s -= 0.5) {
      const [x, y] = [p.x + (dx / d) * s, p.y + (dy / d) * s];
      if (!fitsAt(env, Math.floor(x) + 0.5, Math.floor(y) + 0.5) || !sees(env, p, { x, y, h: env.floorAt(x, y) })) continue;
      if (!place(Math.floor(x), Math.floor(y))) continue;
      said("through the portal");
      busy();
      return "";
    }
    return "No free ground in sight there";
  } else if (a.act === "spray") {
    // A cone of mist: fires in it put out (and the party's own), those in it blinded a moment, once each (the book's save makes them immune)
    const [fx, fy] = dirOf(p.facing);
    const inCone = (x: number, y: number) => {
      const d = Math.hypot(x - p.x, y - p.y);
      return d <= a.range + 0.5 && (d < 0.5 || Math.acos(clamp(((x - p.x) * fx + (y - p.y) * fy) / d, -1, 1)) <= 0.5);
    };
    const before = sim.fields.length;
    sim.fields = sim.fields.filter((f) => !(f.type === "fire" && inCone(f.x, f.y)));
    p.burning = 0;
    let blinded = 0;
    for (const u of sim.units) {
      if (!alive(u) || u === p) continue;
      if (inCone(u.x, u.y)) {
        u.burning = 0;
        if (u.side === "foe" && !u.condImmune?.includes("mist")) { afflict(sim, u, { blinds: true }, events); u.blind = Math.min(u.blind, a.blind); u.condImmune = [...(u.condImmune ?? []), "mist"]; blinded++; }
      }
    }
    said([before > sim.fields.length && "the fire is out", blinded && `${blinded} blinded`].filter(Boolean).join(", ") || "a cloud of mist");
  } else if (a.act === "edge") {
    if (!p.blade || p.blade.saber !== a.saber) return a.saber ? "A collimator is for a lightweapon" : "A calibrator is for a vibroweapon";
    p.blade.damage += a.damage;
    said(`+${a.damage} damage on the ${p.blade.name.toLowerCase()}`);
  } else if (a.act === "bind") {
    // Only one beaten down will hold still for it (the book's hostile save, with advantage): at a quarter of its hit points, stunned,
    // blinded or running
    const foe = inReach(sim, p, (u) => u.side === "foe" && alive(u) && !!u.droid === a.droid && (a.droid || u.small !== false));
    if (!foe) return a.droid ? "Stand by a hostile droid" : "Stand by a foe small enough to bind";
    if (!(foe.hp <= foe.maxHp * 0.25 || foe.stagger > 0.3 || foe.blind > 0 || foe.mode === "flee")) return `${foe.name} is still too strong: beat it down first`;
    foe.bound = true;
    foe.mode = "gone";
    foe.aiming = 0;
    events.push({ type: "down", id: foe.id, by: p.id });
    said(a.droid ? `${foe.name} powers down under the bolt` : `${foe.name} is bound`);
  } else if (a.act === "jam") {
    if (sim.jammed) return "The jammer is on";
    sim.jammed = true;
    said(sim.backupAt !== undefined ? "on (the call already went out)" : "on: no call for help gets out");
    return KEPT;
  } else if (a.act === "rocket") {
    if (!aim) return "Look where to fire it";
    const from = front();
    const g = { damage: a.damage, type: "kinetic", long: 80, burst: a.blast };
    launch(sim, p, g, from, aim, Math.max(SHOOT.spread.base, sim.spread), events);
  }
  busy();
  return "";
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

  p.powerCd = Math.max(0, (p.powerCd ?? 0) - dt);
  // Something pushed or pulled flies until its time is up, or a wall stops it (and hurts it, if the power said so)
  for (const u of sim.units) {
    if (!u.knock || !alive(u)) continue;
    const k = u.knock;
    const h = Math.min(dt, k.t);
    if (!walk(u, k.vx * h, k.vy * h, env)) {
      if (k.strike > 0) hurt(sim, u, k.strike, k.type, p, events, { x: u.x, y: u.y, h: u.h + SHOOT.height * 0.6 });
      u.knock = undefined;
    } else {
      k.t -= h;
      if (k.t <= 1e-6) u.knock = undefined;
    }
  }
  // (every half second each unit is made sure it is not standing in a wall)
  for (const u of sim.units) {
    if (u.side === "player" || !alive(u) || u.mode === "gone") continue;
    u.stuckT -= dt;
    if (u.stuckT <= 0) {
      u.stuckT = 0.5;
      unstick(u, env);
    }
  }
  stepStates(sim, dt, events);
  for (const u of sim.units) if (u.side !== "player" && alive(u)) think(sim, u, dt, env, events);
  stepBolts(sim, dt, env, events);
  stepGrenades(sim, dt, env, events);
  stepMines(sim, dt, env, events);
  stepBackup(sim, env, events);
  // The ones who ran are gone when their time is up
  for (const u of sim.units) if (u.mode === "flee" && (u.flee -= dt) <= 0 && !u.dead) { u.mode = "gone"; u.fled = true; }
  return events;
}
// Damage that comes a little every frame (fire, gas) is added up and dealt in whole points (a blow is at least 1, which a frame's share is not)
function seep(sim: Sim, u: Unit, amount: number, type: string, by: Unit | undefined, events: Event[]) {
  const dot = (u.dot ??= {});
  dot[type] = (dot[type] ?? 0) + amount;
  if (dot[type] < 1) return;
  const whole = Math.floor(dot[type]);
  dot[type] -= whole;
  hurt(sim, u, whole, type, by, events, { x: u.x, y: u.y, h: u.h + 0.8 });
}
// What wears off or keeps hurting: poison, fire (and the ground that burns), a substance's high, a stat block's regeneration
function stepStates(sim: Sim, dt: number, events: Event[]) {
  for (const f of sim.fields) f.t -= dt;
  sim.fields = sim.fields.filter((f) => f.t > 0);
  for (const u of sim.units) {
    if (!alive(u)) continue;
    u.poisoned = Math.max(0, u.poisoned - dt);
    if (u.using !== undefined) u.using = Math.max(0, u.using - dt);
    for (const b of u.kit?.blasts ?? []) b.cd = Math.max(0, b.cd - dt);
    // Standing in fire or gas: it hurts every second, a fire keeps burning a moment after, a gas poisons
    for (const f of sim.fields) {
      if (Math.hypot(u.x - f.x, u.y - f.y) > f.radius || u.h > f.h + 1.2) continue;
      if (f.type === "fire") { u.burning = Math.max(u.burning, SHOOT.burnAfter); u.burnDps = Math.max(u.burnDps ?? 0, f.dps); }
      else seep(sim, u, f.dps * dt, f.type, sim.units.find((o) => o.id === f.owner), events);
      if (f.poison && !u.condImmune?.some((c) => /poison/i.test(c))) u.poisoned = Math.max(u.poisoned, 1);
    }
    if (u.burning > 0) {
      u.burning = Math.max(0, u.burning - dt);
      seep(sim, u, (u.burnDps ?? SHOOT.burnDps) * dt, "fire", undefined, events);
      if (u.burning === 0) u.burnDps = 0;
    }
    if (u.high) {
      u.high.t -= dt;
      u.high.every -= dt;
      if (u.high.t <= 0) u.high = undefined;
      else if (u.high.every <= 0) { u.high.every = 6; u.temp = Math.max(u.temp, u.high.temp); }
    }
    if (u.regen && u.hp > 0 && u.hp < u.maxHp && u.burning === 0) {
      u.regenT = (u.regenT ?? 6) - dt;
      if (u.regenT <= 0) { u.regenT = 6; u.hp = Math.min(u.maxHp, u.hp + u.regen); }
    }
  }
}
// Mines and charges: arming, then a body of the other side comes near, or a charge's timer runs out
function stepMines(sim: Sim, dt: number, env: Env, events: Event[]) {
  const keep: Mine[] = [];
  for (const m of sim.mines) {
    m.arm = Math.max(0, m.arm - dt);
    let off = false;
    if (m.timer !== undefined && !m.paired) off = (m.timer -= dt) <= 0;
    else if (!m.paired && m.arm === 0 && m.timer === undefined)
      off = sim.units.some((u) => alive(u) && u.side !== m.side && !(m.side === "player" && u.side === "ally") && !(m.side === "ally" && u.side === "player") && Math.hypot(u.x - m.x, u.y - m.y) <= Math.max(SHOOT.mine.trigger + SHOOT.radius, Math.min(3, m.kind.radius)) && Math.abs(u.h - m.h) < 1.5);
    if (off) blow(sim, { x: m.x, y: m.y, h: m.h + 0.2 }, m.kind, m.owner, env, events, m.facing);
    else keep.push(m);
  }
  sim.mines = keep;
}
// The help a foe called for comes in from out of sight, some way off
function stepBackup(sim: Sim, env: Env, events: Event[]) {
  if (sim.backupAt === undefined || sim.time < sim.backupAt) return;
  sim.backupAt = undefined;
  const p = playerOf(sim);
  for (const u of sim.units) {
    if (!u.reserve || u.dead) continue;
    u.reserve = false;
    let spot: { x: number; y: number } | null = null;
    for (let r = 12; r <= 20 && !spot; r += 1) {
      for (let k = 0; k < 16 && !spot; k++) {
        const a = (k / 16) * Math.PI * 2 + r * 0.7 + rand(sim);
        const [x, y] = [Math.floor(p.x + Math.sin(a) * r) + 0.5, Math.floor(p.y + Math.cos(a) * r) + 0.5];
        if (fitsAt(env, x, y) && route(env, { x, y }, p, 600)) spot = { x, y };
      }
    }
    if (!spot) continue;
    Object.assign(u, spot, { h: env.floorAt(spot.x, spot.y), mode: "engage", wait: between(sim, SHOOT.react) });
    events.push({ type: "arrive", id: u.id });
  }
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
    // The dose of poison on the blade goes in with the first blow that lands
    if (p.venom) {
      hurt(sim, u, p.venom, "poison", p, events, { x: u.x, y: u.y, h: u.h + SHOOT.height * 0.6 });
      afflict(sim, u, { blinds: false, poison: secondsOf(1) }, events);
      p.venom = undefined;
    }
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
// Goes for a target: straight at it where the way is clear, else along the way round the wall (looked for again every so often)
function chase(u: Unit, target: { x: number; y: number }, speed: number, dt: number, env: Env, plain: boolean): boolean {
  u.pathT -= dt;
  if (plain && lineWalkable(env, u, target)) {
    u.path = undefined;
    return steer(u, target, speed, dt, env);
  }
  if (!u.path || !u.path.length || u.pathT <= 0) {
    u.path = route(env, u, target) ?? undefined;
    u.pathT = SHOOT.path.every;
  }
  while (u.path && u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 0.3) u.path.shift();
  const next = u.path?.[0];
  return steer(u, next ?? target, speed, dt, env);
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
  if (u.stagger > 0) {
    // (a hard enough blow breaks off a throw, a spray or a call)
    if (u.act && u.stagger >= SHOOT.act.breaks) {
      u.act = undefined;
      events.push({ type: "broken", id: u.id });
    }
    return;
  }
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
  // A throw, a spray or a call under way: it stands, and when the moment is up it is done (at the one it began on, if still there)
  if (u.act) {
    u.aiming = 0;
    const a = u.act;
    const at = sim.units.find((o) => o.id === a.target && alive(o)) ?? target;
    u.facing = Math.atan2(at.x - u.x, at.y - u.y);
    if ((a.t -= dt) > 0) return;
    u.act = undefined;
    if (a.kind === "call") {
      events.push({ type: "call", id: u.id, jammed: !!sim.jammed });
      if (!sim.jammed) sim.backupAt = sim.time + SHOOT.backup.delay;
    } else if (a.blast && a.kind === "throw") lob(sim, u, a.blast.kind, at, events, a.blast.natural);
    else if (a.blast) spray(sim, u, a.blast, at, events);
    return;
  }
  // An item in its hands: it stands and uses it
  if (u.using && u.using > 0) {
    u.aiming = 0;
    return;
  }
  if (u.using === 0 && u.kit && u.kit.medpacs > 0 && u.hp < u.maxHp * 0.4) {
    u.using = undefined;
    u.kit.medpacs--;
    const was = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + u.kit.heal);
    events.push({ type: "use", id: u.id, name: "Medpac", text: `+${u.hp - was}` });
  } else if (u.using === 0) u.using = undefined;
  if (useKit(sim, u, target, d, seen, events)) return;
  if (!u.brave && !u.leader && u.hp <= u.maxHp * SHOOT.fleeAt && u.side === "foe") return void startFleeing(u, events);
  if (u.caller && u.side === "foe" && !sim.called) callForHelp(sim, u, events);
  const blind = u.blind > 0;
  const ranged = !!u.gun && u.gun.range > 1.6;
  if (ranged) {
    const want = clamp(u.gun!.range * 0.55, 4, 10);
    if (!seen || d > want + 2.5) chase(u, target, u.speed, dt, env, seen);
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
        // A crowd takes turns: when enough of its side are aiming or firing, this one waits a moment
        const busy = sim.units.filter((o) => o !== u && o.side === u.side && alive(o) && (o.aiming > 0 || o.volleyLeft > 0)).length;
        if (busy >= SHOOT.maxShooters && !u.leader) u.fire = between(sim, [0.3, 0.7]);
        else {
          u.aiming = SHOOT.telegraph;
          u.fire = between(sim, SHOOT.volley);
        }
      }
      if (u.volleyLeft > 0 && u.burst <= 0 && u.aiming <= 0) {
        // One shot of the volley: the aim is off by more for a high Armor Class, a low bonus, a long way, or a blinding flash
        const err = (SHOOT.aimError - u.bonus * SHOOT.aimPerBonus + Math.max(0, target.ac - 12) * SHOOT.aimPerArmor * 0.1) * (d > u.gun!.range ? 1.5 : 1) * (blind ? 4 : 1) * (u.poisoned > 0 ? SHOOT.poisoned : 1);
        const spread = clamp(err, 0.012, 0.3);
        const from = { x: u.x, y: u.y, h: u.h + SHOOT.eye * 0.85 };
        const to = { x: target.x, y: target.y, h: target.h + heightOf(target) * 0.55 };
        launch(sim, u, u.gun!, from, to, spread, events);
        u.volleyLeft--;
        u.burst = SHOOT.burstGap;
      }
    }
    return;
  }
  // In close: run at it, wind up, strike (one blow every SHOOT.melee.round seconds shared between the stat block's attacks a round)
  const reach = u.reach + SHOOT.radius;
  if (d > reach * 0.9) chase(u, target, u.speed, dt, env, seen);
  if (u.swing > 0) {
    if (u.swing - dt <= 0) {
      if (d <= reach + 0.4) meleeBlow(sim, u, target, events);
      else events.push({ type: "miss", id: u.id, target: target.id });
    }
  } else if (d <= reach + 0.2 && u.fire <= 0 && !blind) {
    // (poisoned, it is slower to swing)
    u.swing = SHOOT.melee.windup * (u.poisoned > 0 ? 1.5 : 1);
    u.fire = Math.max(SHOOT.melee.fastest, SHOOT.melee.round / Math.max(1, u.volley));
    events.push({ type: "swing", id: u.id });
  }
}
// A foe's gear (FoeKit): its own poison and fire seen to, a medpac begun when it is hurt, an area action of its stat block when the party is
// in reach (a thrown grenade lobbed to land at the target's feet, a cone or line sprayed from where it stands). True when it spent its moment.
function useKit(sim: Sim, u: Unit, target: Unit, d: number, seen: boolean, events: Event[]): boolean {
  const k = u.kit;
  if (!k) return false;
  if (u.poisoned > 0 && k.antidote) {
    u.poisoned = 0;
    k.antidote = false;
    events.push({ type: "use", id: u.id, name: "Antitoxkit", text: "" });
  }
  if (u.burning > 0 && k.extinguisher) {
    u.burning = 0;
    sim.fields = sim.fields.filter((f) => Math.hypot(f.x - u.x, f.y - u.y) > f.radius + 1);
    events.push({ type: "use", id: u.id, name: "Fire extinguisher", text: "" });
  }
  if (k.medpacs > 0 && u.hp < u.maxHp * 0.4 && u.using === undefined) {
    u.using = SHOOT.medpac;
    events.push({ type: "act", id: u.id, act: "heal", seconds: SHOOT.medpac });
    return true;
  }
  if (!seen || u.blind > 0 || u.stagger > 0) return false;
  for (const b of k.blasts) {
    if (b.left <= 0 || b.cd > 0) continue;
    if (b.thrown ? d < b.kind.radius + 1.5 || d > b.range : d > b.range) continue;
    // (it does not throw where its own would be caught)
    if (b.thrown && sim.units.some((o) => o !== u && o.side === u.side && alive(o) && Math.hypot(o.x - target.x, o.y - target.y) < b.kind.radius)) continue;
    b.left--;
    b.cd = b.every;
    // (the wind-up first: the arm drawn back, the chest filled for a breath; SHOOT.act)
    const kind = b.thrown ? "throw" : "spray";
    u.act = { kind, t: SHOOT.act[kind], blast: b, target: target.id };
    events.push({ type: "act", id: u.id, act: kind, seconds: SHOOT.act[kind] });
    return true;
  }
  return false;
}
// A thing thrown in an arc to land at the target's feet (as near as the thrower's skill takes it), bursting a moment after; a monster's spit
// or flung glob (`natural`) flies flatter and bursts where it strikes
function lob(sim: Sim, u: Unit, kind: GrenadeKind, target: Unit, events: Event[], natural = false) {
  if (natural) {
    const from = { x: u.x, y: u.y, h: u.h + 1.0 };
    const [tx, ty, th] = [target.x, target.y, target.h + 0.6];
    const flat = Math.hypot(tx - from.x, ty - from.y) || 1;
    const speed = 14;
    const t = flat / speed;
    sim.grenades.push({ id: sim.seq++, owner: u.id, side: u.side, ...from, vx: ((tx - from.x) / flat) * speed, vy: ((ty - from.y) / flat) * speed, vh: (th - from.h + 0.5 * SHOOT.grenade.gravity * t * t) / t, fuse: t + 1.5, kind, bounces: 0, impact: true, natural: true });
    events.push({ type: "lob", id: u.id, natural: true });
    return;
  }
  const G = SHOOT.grenade;
  const miss = Math.max(0.3, 1.6 - u.bonus * 0.12);
  const [tx, ty] = [target.x + (rand(sim) * 2 - 1) * miss, target.y + (rand(sim) * 2 - 1) * miss];
  const from = { x: u.x, y: u.y, h: u.h + 1.2 };
  const flat = Math.hypot(tx - from.x, ty - from.y) || 1;
  const speed = clamp(flat / 0.9, SHOOT.lob.min, SHOOT.lob.max);
  const t = flat / speed;
  const vh = (target.h - from.h + 0.5 * G.gravity * t * t) / t;
  sim.grenades.push({ id: sim.seq++, owner: u.id, side: u.side, ...from, vx: ((tx - from.x) / flat) * speed, vy: ((ty - from.y) / flat) * speed, vh, fuse: t + 0.7, kind, bounces: 0 });
  events.push({ type: "lob", id: u.id });
}
// A cone (or line) from where the foe stands, at once: a flamethrower, a breath, a sonic blast. Fire leaves the body burning a moment.
function spray(sim: Sim, u: Unit, b: FoeBlast, target: Unit, events: Event[]) {
  const [fx, fy] = dirOf(Math.atan2(target.x - u.x, target.y - u.y));
  const half = b.around ? Math.PI : b.line ? 0.14 : 0.46;
  for (const o of opponents(sim, u)) {
    const d = dist(u, o);
    if (d > b.range + SHOOT.radius) continue;
    if (d > 0.4 && Math.acos(clamp(((o.x - u.x) * fx + (o.y - u.y) * fy) / d, -1, 1)) > half) continue;
    afflict(sim, o, b.kind, events);
    if (b.kind.damage > 0) hurt(sim, o, b.kind.damage * (o.evade ? 0.5 : 1), b.kind.type, u, events, { x: o.x, y: o.y, h: o.h + 0.8 });
    if (b.kind.type === "fire") { o.burning = Math.max(o.burning, 3); o.burnDps = Math.max(o.burnDps ?? 0, SHOOT.burnDps); }
  }
  events.push({ type: "spray", id: u.id, name: b.kind.name, dmgType: b.kind.type, x: u.x, y: u.y, h: u.h + 1.1, tx: u.x + fx * b.range, ty: u.y + fy * b.range, th: u.h + 0.9 });
  noise(sim, u.x, u.y, 14, events);
}
// One with a comlink calls for help once the fight has gone on a while or half its side is down; the party's comm jammer, if it is on, stops
// the call. The help is the reserves (house rule: SHOOT.backup).
function callForHelp(sim: Sim, u: Unit, events: Event[]) {
  if (!sim.units.some((o) => o.reserve && !o.dead)) return;
  const side = sim.units.filter((o) => o.side === "foe" && !o.reserve);
  const down = side.filter((o) => !alive(o)).length;
  if (sim.time < SHOOT.backup.after && down * 2 < side.length) return;
  // (the comlink to the mouth for a moment: the call goes out when it is done, and a hard blow stops it; see think)
  sim.called = true;
  u.act = { kind: "call", t: SHOOT.act.call };
  events.push({ type: "act", id: u.id, act: "call", seconds: SHOOT.act.call });
}
function meleeBlow(sim: Sim, u: Unit, target: Unit, events: Event[]) {
  // (the stat block's attack roll, as a chance: SHOOT.melee)
  if (rand(sim) >= hitChance(u.bonus, target.ac)) return void events.push({ type: "miss", id: u.id, target: target.id });
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
  if (u.rider) afflict(sim, target, u.rider, events);
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
      if ((!home && env.blocks(b.x, b.y, b.h)) || b.h < env.floorAt(b.x, b.y) - 0.05) {
        b.life = 0;
        events.push({ type: "impact", x: b.x, y: b.y, h: Math.max(b.h, env.floorAt(b.x, b.y)) });
        // (a rocket or missile bursts where it stops, a little back from the wall)
        if (b.burst) blow(sim, { x: ox, y: oy, h: Math.max(oh, env.floorAt(ox, oy)) }, b.burst, b.owner, env, events);
        break;
      }
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
        if (dist(b, u) > SHOOT.radius || b.h < u.h || b.h > u.h + heightOf(u)) continue;
        // A saber in an enemy's hands turns the odd bolt aside
        if (u.side === "foe" && u.blade?.saber && b.side !== "foe" && rand(sim) < 0.35 && !b.reflected) { events.push({ type: "blocked", id: u.id }); b.life = 0; hit = true; break; }
        const head = b.h > u.h + SHOOT.head;
        const owner = sim.units.find((x) => x.id === b.owner);
        hurt(sim, u, b.damage * (head && b.side !== "foe" ? SHOOT.headshot : 1), b.type, owner, events, { x: b.x, y: b.y, h: b.h }, head && b.side !== "foe");
        if (owner?.rider && !b.reflected) afflict(sim, u, owner.rider, events);
        b.life = 0;
        hit = true;
        if (b.burst) blow(sim, { x: b.x, y: b.y, h: b.h }, b.burst, b.owner, env, events);
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
    // (one that bursts on impact: once it strikes the ground or a wall, or comes to a body of the other side)
    const struck = g.impact && (g.bounces > 0 || sim.units.some((u) => alive(u) && u.side !== g.side && u.id !== g.owner && Math.hypot(u.x - nx, u.y - ny) < SHOOT.radius + 0.15 && nh >= u.h && nh <= u.h + heightOf(u)));
    g.x = nx; g.y = ny; g.h = nh;
    if (g.fuse <= 0 || struck) {
      blow(sim, g, g.kind, g.owner, env, events);
      continue;
    }
    keep.push(g);
  }
  sim.grenades = keep;
}
// A burst at a point: a grenade's, a mine's or charge's (a charge's in a cone the way it was set facing), a rocket's
function blow(sim: Sim, at: { x: number; y: number; h: number }, kind: GrenadeKind, ownerId: string, env: Env, events: Event[], facing?: number) {
  events.push({ type: "explode", x: at.x, y: at.y, h: at.h, radius: kind.radius });
  noise(sim, at.x, at.y, 24, events);
  const owner = sim.units.find((u) => u.id === ownerId);
  for (const u of sim.units) {
    if (!alive(u)) continue;
    const d = Math.hypot(u.x - at.x, u.y - at.y, (u.h + 0.6) - at.h);
    if (d > kind.radius + SHOOT.radius) continue;
    if (kind.cone && facing !== undefined) {
      const [fx, fy] = dirOf(facing);
      const flat = Math.hypot(u.x - at.x, u.y - at.y);
      if (flat > 0.5 && Math.acos(clamp(((u.x - at.x) * fx + (u.y - at.y) * fy) / flat, -1, 1)) > 0.5) continue;
    }
    // A wall between the burst and the body shelters it
    if (!sees(env, { x: at.x, y: at.y, h: at.h }, { x: u.x, y: u.y, h: u.h }, 0.3)) continue;
    const reach = d / (kind.radius + SHOOT.radius);
    const fall = reach <= SHOOT.grenade.near ? 1 : 1 - (1 - SHOOT.grenade.edge) * ((reach - SHOOT.grenade.near) / (1 - SHOOT.grenade.near));
    afflict(sim, u, kind, events);
    if (kind.damage > 0) hurt(sim, u, kind.damage * fall * (u.evade ? 0.5 : 1), kind.type, owner, events, { x: u.x, y: u.y, h: u.h + 0.7 });
  }
  if (kind.lingers) sim.fields.push({ id: sim.seq++, owner: ownerId, x: at.x, y: at.y, h: env.floorAt(at.x, at.y), radius: kind.lingerRadius ?? kind.radius, t: kind.lingers, dps: kind.dps ?? 1, type: kind.lingerRadius ? "fire" : kind.type, ...(kind.poison ? { poison: kind.poison } : {}) });
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
