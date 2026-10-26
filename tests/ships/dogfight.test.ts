// The dogfight (shared/logic/dogfight.ts, dogfightSim.ts, tunnel.ts): ships of every size from the sheet, capital ships shielded by their
// generators, ordnance counted from the sheet, hangars that launch, a station that is destroyed from inside, and a bot that plays it through.
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom, headingOf, SHIP_SIZE_ORDER, bookRole, roleShip, shipRoleNames, shipSheet } from "../../shared/logic/index";
import {
  ARENA, CLASSES, SCENARIOS, STATION, classIndex, dogfightStart, foeSheet, frameOf, gunsOf, isCapital, toWorld, vadd, vdist, vmul, vnorm,
  type Dogfight,
} from "../../shared/logic/dogfight";
import { damageVessel, dogfightPayout, hostiles, hullPoint, hullRay, isDown, partWorld, partyOf, shielded, stepDogfight, weaponSlots, partVisible, rolled, savesAgainst, subTargets } from "../../shared/logic/dogfightSim";
import { TUNNEL, clearanceAt, doorHole, doorOpen, makeTunnel } from "../../shared/logic/tunnel";
import { botInput, partyShip, play, rows, start } from "./dogfightBot";

const idle = { steer: { x: 0, y: 0 }, throttle: 0 as const };
const roll = (seed = 1) => createRandom(seed).next;
const foe = (s: Dogfight, cls: string) => s.vessels.find((v) => v.side === "foe" && v.cls === cls)!;
const step = (s: Dogfight, seconds: number, input: Parameters<typeof stepDogfight>[1] = idle, seed = 3) => {
  const r = roll(seed);
  for (let t = 0; t < seconds && !s.over; t += 1 / 30) stepDogfight(s, input, 1 / 30, r);
};

test("six book sizes and a station: the larger the slower, and the largest barely move", () => {
  const top = (size: string, role: string, cls = size) => {
    const sheet = foeSheet(rows, "fighter", 1, createRandom(1));
    void sheet;
    return partyShip(size, role, 1).speed * ARENA.speed * CLASSES[cls as keyof typeof CLASSES].pace;
  };
  const small = top("Small", "Attack Fighter");
  const huge = top("Huge", "Battleship");
  const garg = top("Gargantuan", "Blockade Ship");
  assert.ok(small >= 60 && small <= 95, `a fighter flies at ${small} m/s`);
  assert.ok(huge < small / 4, `a battleship crawls: ${huge} m/s`);
  assert.ok(garg < huge, `a Gargantuan ship is slower: ${garg} m/s`);
  assert.equal(CLASSES.Station.pace, 0);
  // Classes are ordered, and capital ships begin at Huge
  assert.deepEqual(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Station"].map((c) => classIndex(c as never)), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(!isCapital("Large") && isCapital("Huge") && isCapital("Station"));
  // Length grows with the class
  const lengths = Object.values(CLASSES).map((c) => c.length);
  assert.deepEqual([...lengths].sort((a, b) => a - b), lengths);
});

test("ordnance is what the sheet counts: a few on small mounts, more on large ones", () => {
  const ammo = (size: string, role: string) => {
    const sheet = partyShip(size, role, 1);
    const guns = gunsOf(sheet, size as never);
    return { missiles: guns.filter((g) => g.kind === "missile" || g.kind === "torpedo" || g.kind === "rocket").reduce((n, g) => n + g.ammo, 0), bombs: guns.filter((g) => g.kind === "bomb").reduce((n, g) => n + g.ammo, 0) };
  };
  const small = ammo("Small", "Attack Fighter");
  const huge = ammo("Huge", "Battleship");
  assert.equal(small.missiles, 4);
  assert.equal(small.bombs, 4);
  assert.ok(huge.missiles >= 8 && huge.bombs >= 8, `a Huge ship carries more: ${JSON.stringify(huge)}`);
  // The party's vessel starts with exactly the sheet's ammunition
  const s = start("skirmish", 1);
  const me = partyOf(s);
  assert.equal(me.guns.filter((g) => g.kind === "missile")[0].ammo, 4);
  // A bomb is the heavy one the book lists, not the sheet's bomblets
  assert.equal(me.guns.find((g) => g.kind === "bomb")!.dice, "4d10");
});

test("a ship with no weapon fitted is lent a cannon, and the raid lends two breaching torpedoes", () => {
  const sheet = partyShip("Small", "Attack Fighter", 1);
  const bare = { ...sheet, weapons: [] };
  const s = dogfightStart({ seed: 1, scenario: "station", rows, ship: { sheet: bare } });
  const me = partyOf(s);
  assert.ok(me.guns.some((g) => g.kind === "laser"), "a cannon was lent");
  const torp = me.guns.find((g) => g.name === "Breaching torpedo");
  assert.equal(torp?.ammo, 2);
  assert.ok(s.briefing.some((l) => /lent/.test(l)));
  assert.ok(s.loaned.includes("Breaching torpedo"));
});

test("a ship with no shield is lent a deflector, and the party's shield comes back slowly after a wait", () => {
  const bare = { ...partyShip("Small", "Attack Fighter", 1), hasShield: false, shieldMax: 0, shieldRegen: 0, shieldDice: 0 };
  const s = dogfightStart({ seed: 1, scenario: "skirmish", rows, ship: { sheet: bare, owner: "the party" } });
  const me = partyOf(s);
  assert.ok(me.c.sheet.hasShield && me.c.shield === me.c.sheet.shieldMax && me.c.shield > 0, "a shield, full");
  assert.ok(s.loaned.includes("Deflector shield") && s.briefing.some((l) => /Deflector shield/.test(l)), "said before the fight");
  // A ship that has a shield keeps its own
  const fitted = dogfightStart({ seed: 1, scenario: "skirmish", rows, ship: { sheet: partyShip("Small", "Attack Fighter", 1), owner: "the party" } });
  assert.ok(!fitted.loaned.includes("Deflector shield"));
  // The foes are far away; the shield is shot down and then left alone
  for (const v of s.vessels) if (v.side === "foe") v.p = [9000, 0, 0];
  me.c = { ...me.c, shield: 0 };
  me.calm = 0;
  step(s, ARENA.partyWait - 0.5);
  assert.equal(me.c.shield, 0, "nothing comes back during the wait");
  step(s, 0.5 + 20);
  const rate = (me.c.sheet.shieldRegen / ARENA.round) * ARENA.partyRegen;
  assert.ok(me.c.shield > 0, "it recharges");
  assert.ok(Math.abs(me.c.shield - rate * 20) < rate * 1.5, `${me.c.shield.toFixed(1)} after 20 s at ${rate.toFixed(2)} a second`);
  // Slower than a foe's shield of the same sheet would be: half a minute and more from empty to full
  assert.ok(ARENA.partyRegen < 1 && ARENA.partyWait > ARENA.shieldWait);
  assert.ok(me.c.sheet.shieldMax / rate >= 30, `${Math.round(me.c.sheet.shieldMax / rate)} s from empty to full`);
});

test("the active weapon: the trigger fires it, and the cycle moves on through the guns, the launchers and the bombs", () => {
  const s = start("skirmish", 1);
  const me = partyOf(s);
  for (const v of s.vessels) if (v.side === "foe") v.p = [9000, 0, 0];
  assert.deepEqual(weaponSlots(me).map((w) => w.kind), ["guns", "ordnance", "bomb"]);
  const missiles = () => me.guns.find((g) => g.kind === "missile")!.ammo;
  const bombs = () => me.guns.find((g) => g.kind === "bomb")!.ammo;
  // The guns are active at first: the trigger fires them and nothing else
  step(s, 1, { ...idle, trigger: true });
  assert.ok(s.fired > 0 && missiles() === 4 && bombs() === 4);
  const fired = s.fired;
  // One press of the cycle: the launcher; the trigger sends a missile and no gun fires
  step(s, 0.5, { ...idle, trigger: true, cycle: 1 });
  assert.equal(s.slot, 1);
  assert.ok(missiles() < 4 && bombs() === 4 && s.fired === fired, "a missile, not the guns");
  // A second press: the bombs
  step(s, 0.5, { ...idle, trigger: true, cycle: 2 });
  assert.equal(s.slot, 2);
  assert.equal(bombs(), 3);
  // A third: back to the guns
  step(s, 0.1, { ...idle, cycle: 3 });
  assert.equal(s.slot, 0);
  // The pick key (next launcher) keeps the active weapon on the launcher it chose; an empty launcher is skipped by the cycle
  me.guns.find((g) => g.kind === "missile")!.ammo = 0;
  step(s, 0.1, { ...idle, cycle: 4 });
  assert.equal(weaponSlots(me)[s.slot].kind, "bomb", "the empty launcher is passed over");
});

test("a capital ship's hull takes no damage while a shield generator stands; its turrets need not be shot out", () => {
  const s = start("battleship", 2);
  const ship = foe(s, "Huge");
  const me = partyOf(s);
  assert.ok(shielded(ship));
  const before = ship.c.hull;
  assert.equal(damageVessel(s, ship, 80, "energy", ship.p, me.id), "absorbed");
  assert.equal(ship.c.hull, before, "the shield generators hold the hull");
  assert.ok(s.fx.some((f) => f.kind === "shield"));
  // The generators go: the hull can be hurt
  for (const p of ship.parts) if (p.kind === "generator") p.alive = false;
  assert.ok(!shielded(ship));
  const turretsBefore = ship.parts.filter((p) => p.kind === "battery" && p.alive).length;
  assert.ok(turretsBefore > 0);
  damageVessel(s, ship, 40, "energy", ship.p, me.id);
  assert.ok(ship.c.hull < before, "the hull takes damage with the generators gone");
  // Kill it with the turrets still standing
  damageVessel(s, ship, 5000, "energy", ship.p, me.id);
  assert.ok(isDown(ship), "the ship is destroyed though its turrets were never shot out");
  assert.equal(ship.parts.filter((p) => p.kind === "battery" && p.alive).length, turretsBefore);
});

test("armor turns aside shots but not warheads", () => {
  const s = start("cruiser", 1);
  const ship = foe(s, "Large");
  ship.c = { ...ship.c, shield: 0 };
  const me = partyOf(s);
  const shot = ship.c.hull;
  damageVessel(s, ship, 2, "energy", ship.p, me.id, "party");
  const afterShot = ship.c.hull;
  damageVessel(s, ship, 2, "energy", ship.p, me.id, "missile");
  const afterWarhead = afterShot - ship.c.hull;
  assert.ok(shot - afterShot <= afterWarhead, `a warhead does at least what a shot does: ${shot - afterShot} then ${afterWarhead}`);
  assert.equal(afterWarhead, 2, "the full 2 points of the warhead");
});

test("a station's armor holds from outside: it is destroyed only by the reactor", () => {
  const s = start("station", 1);
  const station = foe(s, "Station");
  const me = partyOf(s);
  for (const p of station.parts) if (p.kind === "generator") p.alive = false;
  damageVessel(s, station, 100000, "energy", station.p, me.id);
  const floor = Math.ceil(station.c.sheet.hullMax * STATION.floor);
  assert.equal(station.c.hull, floor, "the hull stops at its floor");
  assert.ok(!isDown(station) && !station.c.destroyed);
});

test("a carrier launches fighters while its bays stand, and stops when they are destroyed", () => {
  const s = start("carrier", 3);
  const ship = foe(s, "Huge");
  const me = partyOf(s);
  me.p = [ship.p[0] - 300, ship.p[1], ship.p[2]];
  me.speed = 0;
  step(s, 30);
  const launched = s.vessels.filter((v) => v.home === ship.id);
  assert.ok(launched.length >= 1, "fighters were launched");
  assert.ok(launched.length <= 2, "no more than the carrier's cap fly at once");
  assert.ok(launched.every((v) => v.c.sheet.shieldMax === 0), "launched fighters are shieldless drones");
  // Destroy every bay: no more are launched
  for (const p of ship.parts) if (p.kind === "hangar") p.alive = false;
  for (const v of launched) v.c = { ...v.c, hull: 0, destroyed: true };
  s.vessels = s.vessels.filter((v) => v.home !== ship.id);
  const count = s.nextId;
  step(s, 40);
  assert.equal(s.vessels.filter((v) => v.home === ship.id).length, 0, "nothing is launched from a dead bay");
  assert.ok(s.nextId >= count);
});

test("the port opens when the generators are gone, and not before", () => {
  const s = start("station", 1);
  const station = foe(s, "Station");
  const port = station.parts.find((p) => p.kind === "port")!;
  step(s, 4);
  assert.equal(port.open, 0);
  for (const p of station.parts) if (p.kind === "generator") p.alive = false;
  step(s, 5);
  assert.equal(port.open, 1);
  assert.ok(s.log.some((l) => /port is open/.test(l)));
});

test("hull volumes: a wedge narrows to the bow, a ray meets it where the model is, and a point inside is pushed out to the surface", () => {
  const s = start("battleship", 1);
  const ship = foe(s, "Huge");
  ship.p = [0, 0, 0];
  ship.yaw = 0;
  ship.pitch = 0;
  const [hx, , hz] = ship.half;
  assert.equal(ship.volume.kind, "convex");
  // Along the hull at 50 m to starboard, from ahead: the wedge is wide enough there only back from x = hx - 2 hx z / hz
  const entry = hx - (2 * hx * 50) / hz;
  const t = hullRay(ship, [hx + 230, 0, 50], [-1, 0, 0]);
  assert.ok(t !== null && Math.abs(t - (hx + 230 - entry)) < 0.5, `entered at ${t}`);
  // The stern corner is on the hull; a ray from beside the bow misses
  assert.ok(hullRay(ship, [-hx - 50, 0, hz - 1], [1, 0, 0]) !== null);
  assert.equal(hullRay(ship, [hx - 5, 0, hz], [0, 0, 1]), null, "a ray going away from it misses");
  // Beside the bow, the wedge is a thin tip: a ray across it at the bow's width meets it only close in
  const tip = hullRay(ship, [hx - 5, 0, hz], [0, 0, -1]);
  assert.ok(tip !== null && tip > hz - 3, `the bow is thin: met at ${tip}`);
  // Inside: pushed out along the nearest face to the surface
  const inside = hullPoint(ship, [10, 5, 3]);
  assert.ok(inside.inside && inside.depth > 0);
  const out = hullPoint(ship, vadd(inside.surface, vmul(inside.normal, 0.4)));
  assert.ok(!out.inside, "just off the surface is outside");
  // Ellipsoids for small craft and the station
  assert.equal(partyOf(s).volume.kind, "ellipsoid");
  assert.equal(foe(start("station", 1), "Station").volume.kind, "ellipsoid");
  // Every part stands over the hull's footprint, on its deck or its keel (not floating beside it): straight down to the deck it is in the hull
  for (const p of ship.parts) {
    if (p.kind === "hangar") continue;
    const onHull = toWorld(ship, [p.at[0], Math.max(-ship.half[1] + 1, Math.min(p.at[1], ship.half[1] - 1)), p.at[2]]);
    assert.ok(hullPoint(ship, onHull, 2).inside, `${p.kind} ${p.id} at ${p.at.map(Math.round)} stands on the hull`);
    assert.ok(Math.abs(p.at[1]) <= ship.half[1] + 60, `${p.kind} ${p.id} is no more than a tower's height off the deck`);
  }
});

test("the tunnel is wide enough to fly, the free space is connected and its parts are where the arrays say", () => {
  const t = makeTunnel(5, 6);
  assert.ok(t.length >= 2000, `the tunnel is ${t.length} m`);
  for (let i = 0; i < t.points.length; i += 5) assert.ok(clearanceAt(t, t.points[i]).depth >= 14, `point ${i} is in free space`);
  assert.ok(t.gates.length === TUNNEL.gates && t.mines.length === TUNNEL.mines && t.doors.length === TUNNEL.doors);
  // The chamber holds the core and joins the tunnel's end; the shaft starts at the chamber's top
  assert.ok(clearanceAt(t, t.core.p).depth > 100);
  assert.ok(clearanceAt(t, t.points[t.points.length - 1]).depth > 0);
  assert.ok(clearanceAt(t, t.shaft.to).depth > 0);
  // A big craft gets a bigger tunnel; a point in rock is not free space
  assert.ok(makeTunnel(5, 16).radii[40] > t.radii[40]);
  assert.ok(clearanceAt(t, [t.points[100][0], t.points[100][1] + 500, t.points[100][2]]).depth < 0);
  // Doors shut and open
  const d = t.doors[0];
  const opens = Array.from({ length: 40 }, (_, i) => doorOpen(d, i * 0.4));
  assert.ok(Math.min(...opens) < 0.2 && Math.max(...opens) > 0.9);
  assert.ok(doorHole(d, 0) < doorHole(d, 1));
});

test("the run: the bot flies into the open port, through the tunnel, torpedoes the core and gets out; the station is destroyed", () => {
  const s = start("station", 2);
  const station = foe(s, "Station");
  const me = partyOf(s);
  for (const p of station.parts) if (p.kind === "generator") p.alive = false;
  s.vessels = s.vessels.filter((v) => v.cls === "Station" || v.id === me.id);
  const port = station.parts.find((p) => p.kind === "port")!;
  const pw = partWorld(station, port);
  const out = [pw[0] - station.p[0], pw[1] - station.p[1], pw[2] - station.p[2]];
  const len = Math.hypot(...out);
  me.p = [pw[0] + (out[0] / len) * 500, pw[1] + (out[1] / len) * 500, pw[2] + (out[2] / len) * 500];
  me.yaw = Math.atan2(-out[2], -out[0]);
  me.pitch = Math.asin(-out[1] / len);
  me.speed = me.top;
  const r = roll(9);
  let inside = false;
  for (let t = 0; t < 300 && !s.over; t += 1 / 30) {
    stepDogfight(s, botInput(s), 1 / 30, r);
    if (s.interior) inside = true;
  }
  assert.ok(inside, "it flew in");
  assert.equal(s.outcome, "station", s.log.slice(-4).join(" / "));
  assert.ok(s.stationDown);
  assert.ok(s.interior!.gates >= 5, `gates passed in order: ${s.interior!.gates}`);
  assert.ok(s.interior!.core.hp <= 0);
  assert.ok(dogfightPayout(s).credits >= CLASSES.Station.bounty, "a station pays its bounty");
});

test("lost in the station: the reactor takes the craft that does not get out in time", () => {
  const s = start("station", 2);
  const station = foe(s, "Station");
  const me = partyOf(s);
  for (const p of station.parts) if (p.kind === "generator") p.alive = false;
  s.vessels = s.vessels.filter((v) => v.cls === "Station" || v.id === me.id);
  const port = station.parts.find((p) => p.kind === "port")!;
  port.open = 1;
  // At the open port, moving: one step takes the craft in
  me.p = partWorld(station, port);
  me.speed = me.top;
  const r = roll(4);
  stepDogfight(s, idle, 1 / 30, r);
  assert.ok(s.interior, "inside the station");
  const I = s.interior!;
  assert.equal(I.phase, "run");
  // The core goes; the craft sits still until the reactor does
  I.core.hp = 0;
  I.craft.speed = 0;
  for (let t = 0; t < 80 && !s.over; t += 1 / 30) stepDogfight(s, { steer: { x: 0, y: 0 }, throttle: -1 }, 1 / 30, r);
  assert.equal(s.outcome, "lost-in-station");
  assert.ok(I.escape > 0 || I.phase === "lost");
});

test("a ship too big for the port sends a strike craft down the tunnel", () => {
  const s = dogfightStart({ seed: 1, scenario: "station", rows, ship: { sheet: partyShip("Large", "Corvette", 1) } });
  assert.equal(partyOf(s).cls, "Small");
  assert.ok(s.briefing.some((l) => /too big/.test(l)));
  const small = dogfightStart({ seed: 1, scenario: "station", rows, ship: { sheet: partyShip("Medium", "Gunship", 1) } });
  assert.equal(partyOf(small).cls, "Medium");
});

test("turret arcs: a battery on the deck cannot fire at a craft under the hull, one under the keel can", () => {
  const fired = (where: "above" | "below") => {
    const s = start("battleship", 1);
    const ship = foe(s, "Huge");
    const me = partyOf(s);
    s.vessels = s.vessels.filter((v) => v.id === ship.id || v.id === me.id);
    for (const p of ship.parts) if (p.kind === "generator") p.alive = false;
    me.p = toWorld(ship, [0, (where === "above" ? 1 : -1) * (ship.half[1] + 70), 0]);
    me.speed = 0;
    me.c = { ...me.c, shield: 9999, hull: 9999 };
    let n = 0;
    const r = roll(2);
    for (let t = 0; t < 14; t += 1 / 30) {
      stepDogfight(s, idle, 1 / 30, r);
      n += s.fx.filter((f) => f.kind === "launch" && f.size === 0.6 && f.by === ship.id).length;
    }
    return n;
  };
  const above = fired("above");
  const below = fired("below");
  assert.ok(above >= 6, `the deck's batteries fire on a craft over the hull: ${above}`);
  assert.ok(below < above, `fewer reach a craft under it: ${below} against ${above}`);
});

test("the same seed plays the same fight", () => {
  const a = play(start("skirmish", 5), 5, 140);
  const b = play(start("skirmish", 5), 5, 140);
  assert.equal(a.s.outcome, b.s.outcome);
  assert.equal(Math.round(a.s.t * 100), Math.round(b.s.t * 100));
  assert.equal(a.hull, b.hull);
});

test("a skirmish is won by the bot, paid, and reported as foes down", () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const run = play(start("skirmish", seed), seed, 140);
    if (run.s.outcome === "clear") wins++;
    const pay = dogfightPayout(run.s);
    assert.match(pay.note, /\d+ of \d+ foes down/);
  }
  assert.ok(wins >= 5, `the bot clears ${wins} of 6 skirmishes`);
});

test("every scenario starts with its target ahead, its foes counted, and a limit", () => {
  for (const sc of SCENARIOS.filter((x) => !x.air)) {
    const s = start(sc.id, 1);
    assert.equal(s.limit, sc.limit);
    assert.ok(s.foesTotal >= 2, `${sc.id} has foes`);
    assert.ok(hostiles(s, partyOf(s)).length === s.foesTotal);
    if (sc.id !== "skirmish") {
      const target = s.vessels.filter((v) => v.side === "foe").sort((a, b) => classIndex(b.cls) - classIndex(a.cls))[0];
      assert.ok(vdist(target.p, partyOf(s).p) > 400, `${sc.id}: the target lies ahead`);
      assert.ok(isCapital(target.cls) || target.cls === "Large");
    }
  }
});

// ---- Upgrades, flight, the throttle, the test build's unlimited hull, and turrets as targets (2026-10-25)
const far = (s: Dogfight) => { for (const v of s.vessels) if (v.side === "foe") v.p = [9000, 0, 0]; };

test("what the shipyard has done to a ship is in the arena: speed, armor, weapon bonuses, range, rerolled dice, flares, feedback", () => {
  const plain = partyShip("Small", "Attack Fighter", 1);
  const gun = plain.weapons.find((w) => w.category === "Primary")!.name;
  const up = partyShip("Small", "Attack Fighter", 1, [], {
    mods: [{ name: "Sublight Drive, Mk I" }, { name: "Pinpointing Addition, Mk I", weapon: gun }, { name: "Gauss Rounds", weapon: gun }, { name: "Flare Pods" }, { name: "Feedback Shield" }, { name: "Ablative Plating Layer" }],
    enhanced: { armor: { name: "Ship Armor (Fine)", bonus: 1 }, weapons: { [gun]: { name: "Ship Weapon (Fine)", bonus: 2 } } },
  });
  const sa = dogfightStart({ seed: 1, scenario: "skirmish", rows, ship: { sheet: plain } });
  const sb = dogfightStart({ seed: 1, scenario: "skirmish", rows, ship: { sheet: up } });
  const [a, b] = [partyOf(sa), partyOf(sb)];
  assert.ok(b.top > a.top + 5, `faster: ${a.top} to ${b.top}`);
  assert.ok(b.ac > a.ac, "armor class");
  const [ga, gb] = [a.guns.find((g) => g.kind === "laser")!, b.guns.find((g) => g.kind === "laser")!];
  assert.equal(gb.bonus, 2, "to hit");
  assert.equal(gb.plus, 2, "to damage");
  assert.ok(gb.reroll && !ga.reroll, "damage dice of 1 and 2 are rolled again");
  assert.ok(gb.range >= ga.range, "range");
  assert.ok(b.c.sheet.flares && b.c.sheet.feedback && sb.flares >= 1);
  // The rerolled dice: a die that comes up 1 is rolled again
  const seq = [0, 0.99];
  let n = 0;
  assert.equal(rolled("1d6", () => seq[n++ % 2], true), 6);
  n = 0;
  assert.equal(rolled("1d6", () => seq[n++ % 2], false), 1);
  // Flares: a failed Dexterity save is rolled again, once a tier; a ship without them gets one roll
  const proj = { dc: 22, by: -1 } as unknown as Parameters<typeof savesAgainst>[2];
  const rolls = (list: number[]) => { let i = 0; return () => list[i++ % list.length]; };
  assert.equal(savesAgainst(sb, b, proj, rolls([0, 0.999])), true, "the flare");
  assert.equal(sb.flares, 0, "one used");
  assert.equal(savesAgainst(sb, b, proj, rolls([0, 0.999])), false, "none left");
  assert.equal(savesAgainst(sa, a, proj, rolls([0, 0.999])), false, "no flares fitted");
  // Feedback: a foe that hits the craft is hit back (the foe's every shot hits, and the craft does nothing)
  const alwaysHit = () => 0;
  const run = (ship: ReturnType<typeof partyShip>) => {
    const s = dogfightStart({ seed: 2, scenario: "skirmish", rows, ship: { sheet: ship } });
    far(s);
    const me = partyOf(s);
    const foeShip = s.vessels.find((v) => v.side === "foe")!;
    foeShip.p = toWorld(me, [100, 0, 0]);
    foeShip.yaw = Math.PI;
    foeShip.ai.fire = 0;
    const before = foeShip.c.hull + foeShip.c.shield;
    for (let t = 0; t < 1; t += 1 / 30) stepDogfight(s, idle, 1 / 30, alwaysHit);
    return before - (foeShip.c.hull + foeShip.c.shield);
  };
  const withFeedback = run(up);
  const without = run(plain);
  assert.ok(withFeedback > without, `the foe took ${withFeedback} with a feedback shield and ${without} without`);
});

test("A and D roll the craft; the mouse and pad never do (a yaw does not lean it); a rolled craft turns its heading by both yaw and pitch", () => {
  const rollTest = start("skirmish", 1);
  far(rollTest);
  step(rollTest, 1, { ...idle, roll: 1 });
  assert.ok(partyOf(rollTest).roll > 0.8, `rolled to the right: ${partyOf(rollTest).roll}`);
  const rolledRight = partyOf(rollTest).roll;
  step(rollTest, 1, { ...idle, roll: -1 });
  assert.ok(partyOf(rollTest).roll < rolledRight - 1.5, `and back with the other key: ${rolledRight.toFixed(2)} to ${partyOf(rollTest).roll.toFixed(2)}`);
  // A yaw is a yaw and a pitch a pitch: no lean into a turn, which the mouse and pad (yaw and pitch only) must never put on the craft
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const turning = start("skirmish", 1);
    far(turning);
    step(turning, 0.5, { steer: { x, y }, throttle: 0 });
    assert.ok(Math.abs(partyOf(turning).yaw) + Math.abs(partyOf(turning).pitch) > 0.3, `turned for (${x}, ${y})`);
    assert.ok(Math.abs(partyOf(turning).roll) < 1e-9, `no roll was put on it by (${x}, ${y}): ${partyOf(turning).roll}`);
  }
  // Rolled a quarter turn to the right, the craft's up is the world's right: pitch up turns the heading to the right, and a yaw to the right
  // (the craft's right is the world's down) points the nose down
  const up = start("skirmish", 1);
  far(up);
  partyOf(up).roll = Math.PI / 2;
  const y0 = partyOf(up).yaw;
  step(up, 0.5, { steer: { x: 0, y: -1 }, throttle: 0 });
  assert.ok(partyOf(up).yaw > y0 + 0.2 && Math.abs(partyOf(up).pitch) < 0.05, `pitch up turned it to the right: yaw ${partyOf(up).yaw.toFixed(2)} pitch ${partyOf(up).pitch.toFixed(2)}`);
  const down = start("skirmish", 1);
  far(down);
  partyOf(down).roll = Math.PI / 2;
  step(down, 0.5, { steer: { x: 1, y: 0 }, throttle: 0 });
  assert.ok(partyOf(down).pitch < -0.2 && Math.abs(partyOf(down).yaw) < 0.05, `yaw to its right pointed it down: pitch ${partyOf(down).pitch.toFixed(2)}`);
  // Level, nothing changes: yaw is yaw and pitch is pitch
  const level = start("skirmish", 1);
  far(level);
  step(level, 0.5, { steer: { x: 0, y: -1 }, throttle: 0 });
  assert.ok(partyOf(level).pitch > 0.2 && Math.abs(partyOf(level).yaw) < 0.01);
});

test("the nose turns at the stick's rate in any attitude and the pitch has no limit: steeply up a yaw still swings it, and a pull goes on over the top", () => {
  const angleOf = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  // A yaw swings the nose by the same angle level and pointing steeply up (turning the heading's angle instead moved it a third as far there,
  // and spun the view about the nose)
  const swing = (pitch: number) => {
    const s = start("skirmish", 1);
    far(s);
    const me = partyOf(s);
    me.pitch = pitch;
    const f0 = headingOf(me.yaw, me.pitch);
    const up0 = frameOf(me.yaw, me.pitch, me.roll).u;
    step(s, 0.3, { steer: { x: 1, y: 0 }, throttle: 0 });
    return { angle: angleOf(f0, headingOf(me.yaw, me.pitch)), twist: angleOf(up0, frameOf(me.yaw, me.pitch, me.roll).u) };
  };
  const level = swing(0);
  const steep = swing(1.3);
  assert.ok(level.angle > 0.2, `it turned: ${level.angle.toFixed(2)} rad`);
  assert.ok(Math.abs(steep.angle / level.angle - 1) < 0.02, `the same swing steeply up: ${steep.angle.toFixed(3)} against ${level.angle.toFixed(3)}`);
  // (the craft's own up is the axis of a yaw, so it does not move; the roll against the horizon, which the HUD shows, does change up there)
  assert.ok(steep.twist < 1e-6 && level.twist < 1e-6, `nothing is turned about the nose: ${steep.twist}`);
  // Held back, the stick takes it over the top: the nose is behind where it began, the craft upside down, and the pitch went past the old limit
  const s = start("skirmish", 1);
  far(s);
  const me = partyOf(s);
  const f0 = headingOf(me.yaw, me.pitch);
  const r = roll();
  let most = 0;
  for (let t = 0; t < Math.PI / Math.max(me.turn, 0.3); t += 1 / 60) {
    stepDogfight(s, { steer: { x: 0, y: -1 }, throttle: 0 }, 1 / 60, r);
    most = Math.max(most, me.pitch);
  }
  assert.ok(most > ARENA.pitchLimit + 0.2, `the pitch went on past ${ARENA.pitchLimit}: ${most.toFixed(2)}`);
  assert.ok(angleOf(f0, headingOf(me.yaw, me.pitch)) > 2.9, "the nose came round to the other way");
  assert.ok(Math.abs(Math.abs(me.roll) - Math.PI) < 0.1, `upside down: ${me.roll.toFixed(2)}`);
});

test("the guns follow the cursor: a foe far off the nose is picked out, shot and fired along the cursor's ray; the reticule decides without it", () => {
  const s = start("skirmish", 1);
  far(s);
  const me = partyOf(s);
  const other = s.vessels.find((v) => v.side === "foe")!;
  me.p = [0, 0, 0];
  me.yaw = 0;
  me.pitch = 0;
  me.speed = 0;
  s.throttle = 0;
  me.c = { ...me.c, hull: 9999, shield: 9999 };
  // The camera is behind and above, and looks along the nose: the cursor's ray goes from it to the foe, 40 degrees off the nose
  const place = (angle: number) => {
    other.p = [300 * Math.cos(angle), 0, 300 * Math.sin(angle)];
    other.speed = 0;
  };
  const ray = (at: number[], off = 0) => {
    const o: [number, number, number] = [-30, 8, 0];
    const d = vnorm([at[0] - o[0], at[1] - o[1], at[2] - o[2] + off * 300]);
    return { o, d };
  };
  place(0.7);
  step(s, 0.05, idle);
  assert.equal(s.aim, null, "the reticule is nowhere near it");
  step(s, 0.05, { ...idle, aim: ray(other.p) });
  assert.equal(s.aim?.vessel, other.id, "the cursor is on it");
  assert.ok(Math.abs((s.aim?.dist ?? 0) - vdist(me.p, other.p)) < 3, `its distance is the craft's own: ${s.aim?.dist}`);
  // A cursor a little way off it (more than a pointer's slack, less than the reticule's) is on nothing
  step(s, 0.05, { ...idle, aim: ray(other.p, 0.2) });
  assert.equal(s.aim, null, "a cursor beside it is on nothing");
  // Fire along the ray: the shot is drawn from the muzzle to the foe, and hurts it
  other.c = { ...other.c, shield: 0 };
  const before = other.c.hull;
  const sure = () => 0;
  stepDogfight(s, { ...idle, fire: true, aim: ray(other.p) }, 1 / 30, sure);
  const shot = s.events.find((e) => e.by === "player");
  assert.ok(shot && shot.hit && vdist(shot.to, other.p) < 3, "a shot hit the foe where the cursor was");
  assert.ok(other.c.hull < before || other.c.shield < 0, "and hurt it");
  // Fired at the sky under the cursor, a shot goes where the cursor points (not along the nose)
  me.guns.forEach((g) => (g.wait = 0));
  const sky = { o: [-30, 8, 0] as [number, number, number], d: vnorm([0.5, 0.3, -0.8]) };
  stepDogfight(s, { ...idle, fire: true, aim: sky }, 1 / 30, sure);
  const miss = s.events.find((e) => e.by === "player");
  assert.ok(miss && !miss.hit, "nothing there");
  const along = vnorm([miss!.to[0] - miss!.from[0], miss!.to[1] - miss!.from[1], miss!.to[2] - miss!.from[2]]);
  assert.ok(along[0] * sky.d[0] + along[1] * sky.d[1] + along[2] * sky.d[2] > 0.98, `it went along the cursor's ray: ${along.map((x) => x.toFixed(2))}`);
});

test("letting go of A or D stops the roll: it dies away in a moment, and the craft stays where it was turned", () => {
  const s = start("skirmish", 1);
  far(s);
  const me = partyOf(s);
  step(s, 0.5, { ...idle, roll: 1 });
  const rate = Math.abs(me.rollVel);
  assert.ok(rate > 1, `rolling at ${rate.toFixed(2)} rad/s while the key is held`);
  const atRelease = me.roll;
  step(s, 0.05, idle);
  assert.ok(Math.abs(me.rollVel) > 0 && Math.abs(me.rollVel) < rate, "it eases off rather than stopping dead");
  step(s, 0.6, idle);
  assert.equal(me.rollVel, 0, "and is at a full stop");
  const stopped = me.roll;
  assert.ok(stopped - atRelease > 0 && stopped - atRelease < rate * ARENA.rollEase * 1.5, `a little further after the release: ${(stopped - atRelease).toFixed(2)} rad`);
  step(s, 2, idle);
  assert.equal(me.roll, stopped, "no creep and no levelling out");
  // The same the other way, and a key held again takes it up again
  step(s, 0.3, { ...idle, roll: -1 });
  assert.ok(me.rollVel < 0);
  step(s, 0.7, idle);
  assert.equal(me.rollVel, 0);
});

test("the throttle is a setting that holds: W and S move it, the wheel moves it in notches, the speed follows it and stays", () => {
  const s = start("skirmish", 1);
  far(s);
  const me = partyOf(s);
  assert.equal(s.throttle, ARENA.cruise);
  step(s, 1, { ...idle, throttle: 1 });
  assert.ok(Math.abs(s.throttle - (ARENA.cruise + ARENA.throttleRate)) < 0.05, `W for a second: ${s.throttle}`);
  step(s, 5, idle);
  assert.ok(Math.abs(s.throttle - (ARENA.cruise + ARENA.throttleRate)) < 0.05, "it holds when the key is let go");
  assert.ok(Math.abs(me.speed - s.throttle * me.top) < 1, `the speed is the setting's: ${me.speed.toFixed(1)} of ${(s.throttle * me.top).toFixed(1)}`);
  step(s, 0.1, { ...idle, dial: 3 });
  assert.equal(s.throttle, 1, "three notches up, to the top");
  step(s, 0.1, { ...idle, dial: 1 });
  assert.ok(Math.abs(s.throttle - 0.8) < 1e-9, `two notches down: ${s.throttle}`);
  step(s, 0.1, { ...idle, dial: 1 });
  assert.ok(Math.abs(s.throttle - 0.8) < 1e-9, "a notch is counted once");
  step(s, 4, { ...idle, dial: 1, throttle: -1 });
  assert.equal(s.throttle, 0, "S to a stop");
  step(s, 8, { ...idle, dial: 1 });
  assert.ok(me.speed < 1, `stopped: ${me.speed}`);
});

test("the test build's unlimited hull and weapons give back what the fight took; without them the craft is shot down", () => {
  const plain = start("skirmish", 1);
  far(plain);
  damageVessel(plain, partyOf(plain), 5000, "energy", partyOf(plain).p, 99);
  step(plain, 0.1);
  assert.ok(plain.over && plain.outcome === "shot-down", "shot down");
  const god = start("skirmish", 1);
  far(god);
  const me = partyOf(god);
  me.guns.forEach((g) => (g.ammo = 0));
  damageVessel(god, me, 5000, "energy", me.p, 99);
  step(god, 0.1, { ...idle, god: true });
  assert.ok(!god.over, "still flying");
  assert.equal(me.c.hull, me.c.sheet.hullMax);
  assert.equal(me.c.shield, me.c.sheet.shieldMax);
  assert.ok(me.guns.every((g) => g.ammo === g.ammoMax), "and loaded");
  assert.ok(god.god);
});

test("turrets are targets: seen only from where the hull lets them be, chosen with the subtarget key, homed on, shot out, and silent after", () => {
  const s = start("battleship", 2);
  const ship = foe(s, "Huge");
  const me = partyOf(s);
  const keel = ship.parts.find((p) => p.kind === "battery" && p.at[1] < 0)!;
  const deck = ship.parts.find((p) => p.kind === "battery" && p.at[1] > 0)!;
  const above = toWorld(ship, [keel.at[0], 400, keel.at[2]]);
  const below = toWorld(ship, [keel.at[0], -400, keel.at[2]]);
  assert.ok(!partVisible(ship, keel, above) && partVisible(ship, keel, below), "a turret under the keel is not seen from above the deck");
  assert.ok(partVisible(ship, deck, above) && !partVisible(ship, deck, below), "nor one on the deck from under the keel");
  // Come up to it from the bow
  const bow = toWorld(ship, [ship.half[0] + 260, 25, 0]);
  me.p = bow;
  me.speed = 0;
  me.yaw = Math.atan2(ship.p[2] - bow[2], ship.p[0] - bow[0]);
  me.pitch = 0;
  s.throttle = 0;
  for (const v of s.vessels) if (v.side === "foe" && v.id !== ship.id) v.p = [9000, 0, 0];
  const keep = () => { me.c = { ...me.c, hull: 9999, shield: 9999 }; me.p = bow; me.speed = 0; };
  keep();
  step(s, 0.02, { ...idle, subtarget: 1 });
  keep();
  assert.equal(s.lock, ship.id, "the nearest ship with parts is locked first");
  assert.ok(s.lockPart >= 0, "and its nearest part chosen");
  const first = s.lockPart;
  const list = subTargets(ship, me.p, ARENA.subRange);
  assert.ok(list.slice(0, 2).some((p) => p.id === first), "nearest first (a pair of turrets either side of the craft are as near as each other)");
  assert.ok(list.every((p) => partVisible(ship, p, me.p)), "only what is in sight");
  step(s, 0.02, { ...idle, subtarget: 2 });
  assert.notEqual(s.lockPart, first, "the next part");
  for (let i = 3; i <= list.length + 1; i++) step(s, 0.02, { ...idle, subtarget: i });
  keep();
  assert.equal(s.lockPart, -1, "after the last, the ship itself");
  // Choose one and point the nose at it: it is what the reticule is on
  const mark = 500;
  step(s, 0.02, { ...idle, subtarget: mark });
  keep();
  const chosen = s.lockPart;
  assert.ok(chosen >= 0);
  const aimAt = (part: (typeof ship.parts)[number]) => {
    const w = partWorld(ship, part);
    const d = [w[0] - me.p[0], w[1] - me.p[1], w[2] - me.p[2]];
    me.yaw = Math.atan2(d[2], d[0]);
    me.pitch = Math.asin(d[1] / Math.hypot(d[0], d[1], d[2]));
  };
  aimAt(ship.parts[chosen]);
  step(s, 0.05, { ...idle, subtarget: mark });
  assert.equal(s.aim?.part, chosen, "the reticule is on the part");
  // A missile homes on it
  keep();
  s.sel = 0;
  step(s, 0.05, { ...idle, missile: true, subtarget: mark });
  const missile = s.shots.find((b) => b.kind === "missile" && b.side === "party");
  assert.ok(missile && missile.part === chosen && missile.target === ship.id, "the warhead is sent at the part");
  // Shoot it out, with the craft kept whole: the part is gone, the target let go, and nothing is fired from it again
  const alwaysHit = () => 0;
  let guard = 0;
  while (ship.parts[chosen].alive && guard++ < 3000) {
    keep();
    aimAt(ship.parts[chosen]);
    stepDogfight(s, { ...idle, fire: true, subtarget: mark }, 1 / 30, alwaysHit);
  }
  assert.ok(!ship.parts[chosen].alive, "the turret is destroyed");
  assert.equal(s.lockPart, -1, "and no longer the target");
  assert.ok(s.log.some((l) => /turret is silenced/.test(l)));
  const seen = new Set(s.shots.map((b) => b.id));
  let fromIt = 0;
  for (let t = 0; t < 20 && !s.over; t += 1 / 30) {
    keep();
    stepDogfight(s, { ...idle, subtarget: mark }, 1 / 30, alwaysHit);
    // (the ship moves, and the turret with it)
    const spot = partWorld(ship, ship.parts[chosen]);
    for (const b of s.shots) if (!seen.has(b.id)) {
      seen.add(b.id);
      if (b.kind === "bolt" && vdist(b.p, spot) < 6) fromIt++;
    }
  }
  assert.equal(fromIt, 0, "a destroyed turret fires nothing");
});

test("a ship of a size and role is fitted as the book's role table has it (the test menu's ships)", () => {
  for (const size of SHIP_SIZE_ORDER) {
    for (const role of shipRoleNames(size)) {
      const ship = roleShip(size, role, rows as never, "s-1", "Test", 1000, 1);
      const book = bookRole(size, role);
      const has = (n: string) => ship.equipment.some((e) => e.toLowerCase() === n.toLowerCase());
      assert.ok(has(`${book.armor} armor`) && has(`${book.reactor} reactor`) && has(`${book.coupling} power coupling`), `${size} ${role} has its role's armor, reactor and coupling`);
      assert.equal(has(`${book.shields} shield`), !!book.shields, `${size} ${role} has a shield only where the role has one`);
      assert.equal(ship.equipment.some((n) => /^Hyperdrive/.test(n)), size !== "Tiny", `${size} ${role} has a hyperdrive from Small up`);
      assert.ok(ship.equipment.every((n) => rows.some((r) => r.name === n)), `${size} ${role} carries only equipment of the data`);
      assert.ok(ship.equipment.some((n) => rows.find((r) => r.name === n)?.type === "Weapon"), `${size} ${role} is armed`);
      assert.ok(ship.value > 1000, "its value is the hull's and its fittings");
      const sheet = shipSheet(ship, rows, 2);
      assert.ok(sheet.hullMax > 0 && sheet.weapons.length > 0, `${size} ${role} makes a sheet`);
    }
  }
});
