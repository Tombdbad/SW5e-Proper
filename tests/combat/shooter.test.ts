// The real-time shooter (2026-10-29): bolts that fly and hit, enemies that see, aim and run, grenades, the saber, and no dice anywhere
import test from "node:test";
import assert from "node:assert/strict";
import {
  SHOOT, avgDice, blankUnit, bladeOf, castPower, firePlayer, fitsAt, foesLeft, heightOf, route, unstick, grenadeOf, gunOf, modeOf, newSim, playerOf, reloadPlayer, resultOf, setBlock, step, swingPlayer, throwGrenade,
  type Env, type Event, type Gun, type RtPower, type Sim, type Unit,
} from "../../shared/logic/shooter";

// An open field, with a wall across x = 10 if asked
const field = (wall = false): Env => ({
  blocks: (x, y, h) => wall && Math.floor(x) === 10 && h < 3 && y > -50 && y < 50,
  walkable: (x, y) => !(wall && Math.floor(x) === 10) && x > -40 && x < 80 && y > -40 && y < 40,
  floorAt: () => 0,
});
const rifle: Gun = { name: "Blaster rifle", damage: 10, type: "energy", interval: 0.2, auto: false, range: 20, long: 80, mag: 4, left: 4, reserve: 8, reload: 1, spent: 0 };
const player = (extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 50, maxHp: 50, ac: 10, gun: { ...rifle }, ...extra });
const trooper = (id: string, x: number, y: number, extra: Partial<Unit> = {}) => blankUnit({ id, name: id, side: "foe", x, y, hp: 20, maxHp: 20, ac: 12, speed: 4, bonus: 4, gun: { ...rifle, damage: 6, range: 12, long: 40 }, ...extra });
const me = (sim: Sim) => ({ x: playerOf(sim).x, y: playerOf(sim).y, h: 0, facing: Math.PI / 2 });
const run = (sim: Sim, env: Env, seconds: number, events: Event[] = [], dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) events.push(...step(sim, dt, env, me(sim)));
  return events;
};
const aimAt = (u: Unit, h = 0.6) => ({ x: u.x, y: u.y, h: u.h + h });
const muzzle = (p: Unit) => ({ x: p.x, y: p.y, h: 1 });

test("dice are read as their average, and a mode is the tabletop unless the campaign says shooter", () => {
  assert.equal(avgDice("1d8+2"), 6.5);
  assert.equal(avgDice("2d6"), 7);
  assert.equal(avgDice("1d6", 3), 6.5);
  assert.equal(avgDice("1"), 1);
  assert.equal(avgDice(undefined, 2), 2);
  assert.equal(modeOf(undefined), "tabletop");
  assert.equal(modeOf({ mode: "shooter" }), "shooter");
  assert.equal(modeOf({ mode: "nonsense" }), "tabletop");
});

test("the party's gun comes from the kit: a pistol is semi-automatic, an Auto weapon holds the trigger for less per shot", () => {
  const pistol = gunOf({ rangedWeapon: "Blaster pistol", rangedDice: "1d6", rangedDamage: 2, rangedType: "Energy", rangedProps: ["Power cell (range 50/200)", "reload 16"], ammo: { left: 10, max: 16, family: "cell", plain: "Power cell", reserves: { "Power cell": 2, "Power cell, ion": 5 } } })!;
  assert.equal(pistol.damage, 5.5);
  assert.equal(pistol.auto, false);
  assert.equal(pistol.range, 10);
  assert.equal(pistol.long, 40);
  assert.equal(pistol.mag, 16);
  assert.equal(pistol.left, 10);
  assert.equal(pistol.reserve, 2, "the loaded kind of round, not the others");
  assert.equal(pistol.cells, true);
  const repeater = gunOf({ rangedWeapon: "Repeating blaster", rangedDice: "1d10", rangedProps: ["Auto", "burst 4", "rapid 4", "reload 8", "power cell (range 75/300)"] })!;
  assert.equal(repeater.auto, true);
  assert.ok(repeater.damage < 5.5 && repeater.interval < pistol.interval);
  assert.equal(gunOf({}), undefined);
  assert.equal(bladeOf({ meleeWeapon: "Lightsaber", meleeDice: "1d8", meleeDamage: 3, meleeType: "Energy" })!.saber, true);
  assert.equal(bladeOf({ meleeWeapon: "Vibroblade", meleeDice: "1d8" })!.saber, false);
});

test("a grenade is read from its text: how far it bursts, what it does, or that it only blinds", () => {
  const frag = grenadeOf({ name: "Grenade, corrosive", description: "Each creature within 10 feet must make a DC 14 Constitution saving throw. A creature takes 2d8 acid damage on a failed save, or half as much as on a successful one." })!;
  assert.equal(frag.radius, 2);
  assert.equal(frag.damage, 9);
  assert.equal(frag.type, "acid");
  const flash = grenadeOf({ name: "Grenade, flash", description: "Each creature within 20 feet must make a DC 14 Constitution saving throw. On a failed save, a creature is blinded for 1 minute." })!;
  assert.equal(flash.blinds, true);
  assert.equal(flash.damage, 0);
  assert.equal(grenadeOf({ name: "Grenade launcher" }), undefined);
  assert.equal(grenadeOf({ name: "Medpac" }), undefined);
});

test("a shot is a bolt that flies and hits what it passes through: damage is the printed average, a head is worth half again, a wall stops it", () => {
  const sim = newSim([player(), trooper("a", 8.5, 0.5, { mode: "idle" })]);
  const a = sim.units[1];
  const ev: Event[] = [];
  assert.equal(firePlayer(sim, muzzle(sim.units[0]), aimAt(a, 0.6), ev, false, false), true);
  sim.spread = 0;
  run(sim, field(), 1, ev);
  const hit = ev.find((e) => e.type === "hit");
  assert.ok(hit && hit.type === "hit");
  assert.equal(a.hp, 10, "a body shot: 10 of 20");
  // a head shot
  const sim2 = newSim([player(), trooper("b", 8.5, 0.5, { mode: "idle", hp: 40, maxHp: 40 })]);
  const b = sim2.units[1];
  const ev2: Event[] = [];
  firePlayer(sim2, { x: 0.5, y: 0.5, h: 1.15 }, { x: b.x, y: b.y, h: 1.15 }, ev2, false, false);
  run(sim2, field(), 1, ev2);
  assert.equal(b.hp, 40 - 15, "a head shot: 1.5 x 10");
  assert.ok(ev2.some((e) => e.type === "hit" && e.head));
  // behind a wall
  const sim3 = newSim([player(), trooper("c", 14.5, 0.5, { mode: "idle" })]);
  const ev3: Event[] = [];
  firePlayer(sim3, muzzle(sim3.units[0]), aimAt(sim3.units[1]), ev3, false, false);
  run(sim3, field(true), 1.5, ev3);
  assert.equal(sim3.units[1].hp, 20);
  assert.equal(sim3.bolts.length, 0, "the bolt is spent on the wall");
});

test("a miss is the shooter's spread: a long shot at a moving, airborne shooter strays; one at rest on a near target does not", () => {
  const trials = (moving: boolean, airborne: boolean, far: number) => {
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = newSim([player({ gun: { ...rifle, left: 99, mag: 99 } }), trooper("t", far + 0.5, 0.5, { mode: "idle", hp: 999, maxHp: 999 })], { seed });
      firePlayer(sim, muzzle(sim.units[0]), aimAt(sim.units[1]), [], moving, airborne);
      run(sim, field(), 2);
      if (sim.units[1].hp < 999) hits++;
    }
    return hits;
  };
  const steady = trials(false, false, 8);
  const wild = trials(true, true, 30);
  assert.ok(steady >= 58, `a steady shot at 8 squares nearly always lands (${steady}/60)`);
  assert.ok(wild < steady - 15, `a running, flying shot at 30 squares misses a lot (${wild}/60)`);
});

test("the gun has a rate, a magazine and a reload from the pack", () => {
  const sim = newSim([player(), trooper("t", 30.5, 0.5, { mode: "idle" })]);
  const p = playerOf(sim);
  assert.equal(firePlayer(sim, muzzle(p), aimAt(sim.units[1]), [], false, false), true);
  assert.equal(firePlayer(sim, muzzle(p), aimAt(sim.units[1]), [], false, false), false, "not again at once");
  run(sim, field(), 0.3);
  for (let i = 0; i < 3; i++) {
    assert.equal(firePlayer(sim, muzzle(p), aimAt(sim.units[1]), [], false, false), true);
    run(sim, field(), 0.3);
  }
  assert.equal(p.gun!.left, 0);
  assert.equal(firePlayer(sim, muzzle(p), aimAt(sim.units[1]), [], false, false), false, "empty");
  assert.equal(reloadPlayer(sim, []), true);
  assert.equal(firePlayer(sim, muzzle(p), aimAt(sim.units[1]), [], false, false), false, "reloading");
  run(sim, field(), 1.2);
  assert.equal(p.gun!.left, 4);
  assert.equal(p.gun!.reserve, 4);
  assert.equal(p.gun!.spent, 4, "rounds went in one for one");
  // a power cell fills the magazine whole
  const cellGun = player({ gun: { ...rifle, cells: true, left: 0, reserve: 2, mag: 10 } });
  const sim2 = newSim([cellGun]);
  reloadPlayer(sim2, []);
  run(sim2, field(), 1.2);
  assert.equal(cellGun.gun!.left, 10);
  assert.equal(cellGun.gun!.reserve, 1);
  assert.equal(cellGun.gun!.spent, 1, "one cell used for ten shots");
  p.gun!.reserve = 0;
  p.gun!.left = 0;
  assert.equal(reloadPlayer(sim, []), false, "nothing to reload with");
});

test("enemies stay idle until they see the party or hear a shot, then react, take aim (a telegraph) and fire", () => {
  const sim = newSim([player(), trooper("far", 17.5, 0.5), trooper("near", 8.5, 0.5)]);
  const ev: Event[] = [];
  run(sim, field(), 0.1, ev);
  assert.equal(sim.units[2].mode, "engage", "the near one sees the party");
  assert.equal(sim.units[1].mode, "idle", "the far one does not (out of sight range, but not of hearing)");
  // a shot wakes the far one too
  firePlayer(sim, muzzle(playerOf(sim)), aimAt(sim.units[2]), ev, false, false);
  run(sim, field(), 0.1, ev);
  assert.equal(sim.units[1].mode, "engage");
  assert.ok(ev.filter((e) => e.type === "alert").length === 2);
  // and they shoot back, after a pause to aim
  const near = sim.units[2];
  let aimed = false;
  const shots: number[] = [];
  for (let t = 0; t < 6; t += 1 / 30) {
    const e = step(sim, 1 / 30, field(), me(sim));
    if (near.aiming > 0) aimed = true;
    if (e.some((x) => x.type === "shot" && x.from === "near")) shots.push(t);
  }
  assert.ok(aimed, "the volley is telegraphed");
  assert.ok(shots.length >= 1, "it fires");
});

test("surprise: the unaware see less far, so a sneaking party gets close", () => {
  const sim = newSim([player(), trooper("t", 12.5, 0.5)], { surprise: true });
  run(sim, field(), 0.1);
  assert.equal(sim.units[1].mode, "idle", "12 squares is past the unaware's sight");
  const aware = newSim([player(), trooper("t", 12.5, 0.5)]);
  run(aware, field(), 0.1);
  assert.equal(aware.units[1].mode, "engage");
});

test("a better armour class gets less damage and fewer hits", () => {
  const dmg = (ac: number) => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = newSim([player({ ac, hp: 9999, maxHp: 9999 }), trooper("t", 7.5, 0.5, { bonus: 4 })], { seed });
      run(sim, field(), 12);
      total += 9999 - playerOf(sim).hp;
    }
    return total;
  };
  assert.ok(dmg(22) < dmg(10), "armour 22 takes less than armour 10");
  assert.ok(dmg(10) > 0, "and enemies do hit");
});

test("when a gang's leader falls the rest break and run, and the ones who ran are gone, with their hit points left", () => {
  const boss = trooper("boss", 6.5, 0.5, { leader: true, gang: "g", hp: 5, maxHp: 5 });
  const a = trooper("a", 7.5, 1.5, { gang: "g" });
  const b = trooper("b", 7.5, -0.5, { gang: "g" });
  const sim = newSim([player(), boss, a, b]);
  const ev: Event[] = [];
  firePlayer(sim, muzzle(playerOf(sim)), { x: boss.x, y: boss.y, h: 0.6 }, ev, false, false);
  run(sim, field(), 0.6, ev);
  assert.equal(boss.dead, true);
  assert.deepEqual(ev.filter((e) => e.type === "fled").map((e) => (e as any).id).sort(), ["a", "b"]);
  run(sim, field(), SHOOT.fleeTime + 0.5, ev);
  assert.equal(a.mode, "gone");
  assert.equal(a.fled, true);
  assert.ok(a.hp > 0, "its hit points are kept: the fight's end marks it fled");
  assert.equal(foesLeft(sim).length, 0);
  assert.equal(resultOf(sim), "victory");
});

test("a cowardly enemy runs at a fifth of its hit points; a brave one does not", () => {
  const sim = newSim([player(), trooper("c", 6.5, 0.5, { brave: false, hp: 4, maxHp: 20 }), trooper("b", 6.5, 1.5, { brave: true, hp: 4, maxHp: 20 })]);
  const ev = run(sim, field(), 2);
  assert.ok(ev.some((e) => e.type === "fled" && e.id === "c"));
  assert.ok(!ev.some((e) => e.type === "fled" && e.id === "b"));
});

test("a thrown grenade arcs, bounces, bursts after its fuse, and hurts by closeness; a wall shelters", () => {
  const kind = { name: "Grenade", radius: 3, damage: 20, type: "energy", blinds: false };
  const sim = newSim([player(), trooper("near", 8.5, 0.5, { mode: "idle", hp: 100, maxHp: 100 }), trooper("edge", 10.5, 2.5, { mode: "idle", hp: 100, maxHp: 100 }), trooper("out", 8.5, 9.5, { mode: "idle", hp: 100, maxHp: 100 })]);
  throwGrenade(sim, kind, { x: 0.5, y: 0.5, h: 1.2 }, [1, 0, 0.2]);
  assert.equal(sim.grenades.length, 1);
  const ev = run(sim, field(), 1);
  assert.equal(sim.grenades.length, 1, "the fuse is still running at one second");
  assert.equal(ev.filter((e) => e.type === "explode").length, 0);
  run(sim, field(), 1, ev);
  assert.equal(sim.grenades.length, 0);
  const boom = ev.find((e) => e.type === "explode");
  assert.ok(boom && boom.type === "explode");
  const lost = (id: string) => 100 - sim.units.find((u) => u.id === id)!.hp;
  assert.equal(lost("out"), 0, "out of the blast");
  assert.ok(sim.grenades.length === 0);
  // wall shelter: the same burst behind a wall does nothing
  const sim2 = newSim([player(), trooper("s", 11.5, 0.5, { mode: "idle", hp: 100, maxHp: 100 })]);
  sim2.grenades.push({ id: 1, owner: "me", side: "player", x: 9.5, y: 0.5, h: 0.2, vx: 0, vy: 0, vh: 0, fuse: 0.05, kind, bounces: 0 });
  run(sim2, field(true), 0.2);
  assert.equal(sim2.units[1].hp, 100);
  // closeness: the same burst hurts a body at its centre more than at its edge
  const at = (dx: number) => {
    const s = newSim([player(), trooper("t", 20.5 + dx, 0.5, { mode: "idle", hp: 100, maxHp: 100 })]);
    s.grenades.push({ id: 1, owner: "me", side: "player", x: 20.5, y: 0.5, h: 0.2, vx: 0, vy: 0, vh: 0, fuse: 0.01, kind, bounces: 0 });
    run(s, field(), 0.1);
    return 100 - s.units[1].hp;
  };
  assert.ok(at(0.2) > at(2.5) && at(2.5) > 0);
});

test("a flash grenade blinds: no damage, and blinded shooters aim wildly", () => {
  const flash = { name: "Grenade, flash", radius: 3, damage: 0, type: "energy", blinds: true };
  const sim = newSim([player(), trooper("t", 6.5, 0.5, { mode: "engage" })]);
  sim.grenades.push({ id: 1, owner: "me", side: "player", x: 6.5, y: 0.5, h: 0.2, vx: 0, vy: 0, vh: 0, fuse: 0.01, kind: flash, bounces: 0 });
  run(sim, field(), 0.1);
  assert.equal(sim.units[1].hp, 20);
  assert.ok(sim.units[1].blind > 0);
});

test("the saber swings in an arc: it hits what is in front within reach, a chain hits harder, and the back and the far are safe", () => {
  const blade = { name: "Lightsaber", damage: 8, type: "energy", saber: true };
  const p = player({ blade, facing: 0 });
  const front = trooper("front", 0.5, 1.8, { mode: "idle", hp: 100, maxHp: 100 });
  const behind = trooper("behind", 0.5, -1.0, { mode: "idle", hp: 100, maxHp: 100 });
  const far = trooper("far", 0.5, 4.5, { mode: "idle", hp: 100, maxHp: 100 });
  const sim = newSim([p, front, behind, far]);
  const here = () => ({ x: 0.5, y: 0.5, h: 0, facing: 0 });
  const go = (secs: number) => { for (let t = 0; t < secs; t += 1 / 30) step(sim, 1 / 30, field(), here()); };
  assert.equal(swingPlayer(sim, []), true);
  assert.equal(swingPlayer(sim, []), false, "no second swing mid-swing");
  go(0.1);
  assert.equal(front.hp, 100, "the blow lands part-way through the swing");
  go(0.5);
  assert.equal(front.hp, 92);
  assert.equal(behind.hp, 100);
  assert.equal(far.hp, 100);
  // the chain
  assert.equal(swingPlayer(sim, []), true);
  go(0.6);
  assert.ok(100 - front.hp > 16, "the second blow of a chain is worth more than the first");
  assert.equal(front.struck.energy, 100 - front.hp);
});

test("held up, the saber turns bolts from the front back along the aim for focus, and breaks when the focus is gone", () => {
  const blade = { name: "Lightsaber", damage: 8, type: "energy", saber: true };
  const p = player({ blade, facing: Math.PI / 2 });
  const shooter = trooper("s", 8.5, 0.5, { mode: "engage", hp: 30, maxHp: 30, gun: { ...rifle, damage: 4, range: 20, long: 60 } });
  const sim = newSim([p, shooter]);
  sim.aim = { x: 8.5, y: 0.5, h: 0.7 };
  setBlock(sim, true);
  assert.equal(p.blocking, true);
  const ev: Event[] = [];
  const faceEast = () => ({ x: 0.5, y: 0.5, h: 0, facing: Math.PI / 2 });
  for (let t = 0; t < 8; t += 1 / 30) {
    sim.aim = { x: shooter.x, y: shooter.y, h: 0.7 };
    ev.push(...step(sim, 1 / 30, field(), faceEast()));
  }
  assert.ok(ev.some((e) => e.type === "deflect"), "bolts are turned aside");
  assert.ok(shooter.hp < 30, "and some come back to the one who fired them");
  // with no focus a bolt gets through
  const sim2 = newSim([player({ blade, facing: Math.PI / 2, focus: 0 }), trooper("s", 5.5, 0.5, { mode: "engage", gun: { ...rifle, damage: 4, range: 20, long: 60 } })]);
  setBlock(sim2, true);
  playerOf(sim2).focus = 0;
  const ev2: Event[] = [];
  for (let t = 0; t < 6; t += 1 / 30) ev2.push(...step(sim2, 1 / 30, field(), faceEast()));
  assert.ok(playerOf(sim2).hp < 50, "an unguarded party is hit");
  // a gun and no saber cannot block
  const sim3 = newSim([player()]);
  setBlock(sim3, true);
  assert.equal(playerOf(sim3).blocking, false);
});

test("melee enemies run in and strike after a wind-up; a held saber takes the blow", () => {
  const brute = (id: string) => blankUnit({ id, name: id, side: "foe", x: 6.5, y: 0.5, hp: 30, maxHp: 30, gun: undefined, blade: { name: "Vibroaxe", damage: 8, type: "kinetic", saber: false }, reach: 1.2, speed: 4 });
  const sim = newSim([player(), brute("b")]);
  run(sim, field(), 4);
  assert.ok(playerOf(sim).hp < 50, "it reaches the party and hits");
  const guarded = newSim([player({ blade: { name: "Lightsaber", damage: 8, type: "energy", saber: true } }), brute("b")]);
  const faceEast = () => ({ x: 0.5, y: 0.5, h: 0, facing: Math.PI / 2 });
  setBlock(guarded, true);
  const ev: Event[] = [];
  for (let t = 0; t < 4; t += 1 / 30) ev.push(...step(guarded, 1 / 30, field(), faceEast()));
  assert.ok(ev.some((e) => e.type === "blocked"));
});

test("the fight ends in victory when no foe is left standing and in a loss when the party is down", () => {
  const sim = newSim([player(), trooper("t", 6.5, 0.5, { mode: "idle", hp: 5, maxHp: 5 })]);
  assert.equal(resultOf(sim), "ongoing");
  sim.units[1].dead = true;
  assert.equal(resultOf(sim), "victory");
  const lose = newSim([player({ hp: 1, maxHp: 50 }), trooper("t", 4.5, 0.5, { bonus: 10, gun: { ...rifle, damage: 30, range: 12, long: 40 } })]);
  run(lose, field(), 10);
  assert.equal(resultOf(lose), "down");
  assert.equal(lose.lastHitOnPlayer, "t");
});

test("no dice: the same fight replays the same, and a different seed differs", () => {
  const play = (seed: number) => {
    const sim = newSim([player(), trooper("a", 7.5, 0.5), trooper("b", 9.5, 2.5)], { seed });
    const ev: Event[] = [];
    for (let t = 0; t < 5; t += 1 / 30) {
      if (Math.floor(t * 4) !== Math.floor((t - 1 / 30) * 4)) firePlayer(sim, muzzle(playerOf(sim)), aimAt(sim.units[1]), ev, false, false);
      ev.push(...step(sim, 1 / 30, field(), me(sim)));
    }
    return JSON.stringify([sim.units.map((u) => [u.hp, u.x.toFixed(3)]), ev.length]);
  };
  assert.equal(play(5), play(5));
  assert.notEqual(play(5), play(6));
});

test("everyone starts on ground a body can stand on: the unplaced ahead of the party, a post inside a wall brought out, no two in one square", async () => {
  const { placeUnits } = await import("../../shared/logic/shooter");
  const env: Env = { blocks: () => false, walkable: (x, y) => !(Math.floor(x) >= 10 && Math.floor(x) <= 12) && x > 0 && x < 40 && y > 0 && y < 40, floorAt: () => 0 };
  const nowhere = trooper("lost", NaN, NaN);
  const inWall = trooper("wall", 11.5, 5.5);
  const twin = trooper("twin", 20.5, 5.5);
  const twin2 = trooper("twin2", 20.5, 5.5);
  const sim = newSim([player({ x: 5.5, y: 5.5 }), nowhere, inWall, twin, twin2]);
  placeUnits(sim, env, { x: 5.5, y: 5.5, facing: Math.PI / 2 });
  for (const u of sim.units.slice(1)) assert.ok(env.walkable(u.x, u.y), `${u.id} stands on open ground`);
  assert.ok(nowhere.x > 9 && Math.abs(nowhere.y - 5.5) < 4, "the unplaced one is ahead of the party");
  assert.ok(Math.hypot(inWall.x - 11.5, inWall.y - 5.5) < 3.5, "brought out of the wall to the nearest open square");
  assert.equal(twin.x, 20.5);
  assert.ok(Math.hypot(twin2.x - twin.x, twin2.y - twin.y) > 0.9, "not in the same square");
  // a field with no room at all still gives a fight that can be ended
  const shut: Env = { blocks: () => false, walkable: () => false, floorAt: () => 0 };
  const sim2 = newSim([player(), trooper("t", NaN, NaN)]);
  placeUnits(sim2, shut, { x: 1, y: 1, facing: 0 });
  assert.ok(Number.isFinite(sim2.units[1].x));
});

// ---- Walls, doors and crowds (2026-10-29, after the user's report: foes stuck in a wall, no way round it) ---------------------------------
// A wall across x = 10 with a doorway at y in [10, 11)
const door = (): Env => ({
  blocks: (x, y, h) => Math.floor(x) === 10 && !(y >= 10 && y < 11) && h < 3,
  walkable: (x, y) => !(Math.floor(x) === 10 && !(y >= 10 && y < 11)) && x > -40 && x < 80 && y > -40 && y < 40,
  floorAt: () => 0,
});

test("a foe on the far side of a wall finds the doorway and comes through it", () => {
  const env = door();
  const sim = newSim([player({ x: 14.5, y: 0.5 }), trooper("t", 5.5, 0.5, { mode: "engage", gun: undefined, blade: { name: "Claws", damage: 3, type: "kinetic", saber: false } })]);
  run(sim, env, 14, [], 1 / 30);
  const t = sim.units[1];
  assert.ok(t.x > 10, `got through the doorway: at ${t.x.toFixed(1)}, ${t.y.toFixed(1)}`);
});

test("route finds the way round, and says so when there is none", () => {
  const env = door();
  const path = route(env, { x: 5.5, y: 0.5 }, { x: 14.5, y: 0.5 })!;
  assert.ok(path.length > 9 && path.some((p) => p.x >= 10 && p.x < 11 && p.y >= 10 && p.y < 11), "through the doorway");
  const shut: Env = { ...env, walkable: (x, y) => Math.floor(x) !== 10 && x > -40 && x < 80 && y > -40 && y < 40 };
  assert.equal(route(shut, { x: 5.5, y: 0.5 }, { x: 14.5, y: 0.5 }), null);
});

test("a unit left inside a wall by a map that changed is brought out to open ground, and fights on", () => {
  const env = door();
  const sim = newSim([player({ x: 4.5, y: 0.5 }), trooper("t", 10.5, 3.5, { mode: "engage" })]);
  assert.equal(fitsAt(env, 10.5, 3.5), false);
  run(sim, env, 1);
  const t = sim.units[1];
  assert.equal(fitsAt(env, t.x, t.y), true, `now at ${t.x},${t.y}`);
  // a unit in the open is left where it is
  const free = trooper("f", 2.5, 2.5);
  assert.equal(unstick(free, env), false);
  assert.deepEqual([free.x, free.y], [2.5, 2.5]);
});

test("a crowd takes turns: no more than three aim or fire at once", () => {
  const env = field();
  const foes = Array.from({ length: 8 }, (_, i) => trooper(`t${i}`, 12 + (i % 4), -3 + i, { mode: "engage", wait: 0 }));
  const sim = newSim([player({ hp: 9999, maxHp: 9999 }), ...foes]);
  let most = 0;
  for (let t = 0; t < 12; t += 1 / 30) {
    step(sim, 1 / 30, env, me(sim));
    most = Math.max(most, sim.units.filter((u) => u.side === "foe" && (u.aiming > 0 || u.volleyLeft > 0)).length);
  }
  assert.ok(most >= 1 && most <= SHOOT.maxShooters, `at most ${most} at once`);
});

test("crouching makes a smaller mark and a steadier aim", () => {
  const env = field();
  const high = player({ x: 0.5, y: 0.5 });
  const low = player({ x: 0.5, y: 0.5, crouch: true });
  assert.ok(heightOf(low) < heightOf(high));
  // a bolt at head height passes over a crouching party
  const sim = newSim([low, trooper("t", 12.5, 0.5, { gun: undefined })]);
  sim.bolts.push({ id: 99, owner: "t", side: "foe", x: 3, y: 0.5, h: 1.0, vx: -24, vy: 0, vh: 0, damage: 5, type: "energy", life: 1, cell: [3, 0] } as never);
  run(sim, env, 0.5);
  assert.equal(playerOf(sim).hp, 50, "the bolt went over");
  const standing = newSim([high, trooper("t", 12.5, 0.5, { gun: undefined })]);
  standing.bolts.push({ id: 99, owner: "t", side: "foe", x: 3, y: 0.5, h: 1.0, vx: -24, vy: 0, vh: 0, damage: 5, type: "energy", life: 1, cell: [3, 0] } as never);
  run(standing, env, 0.5);
  assert.ok(playerOf(standing).hp < 50, "and hit a standing one");
});

// ---- Powers in real time -------------------------------------------------------------------------------------------------------------
const power = (extra: Partial<RtPower> = {}): RtPower => ({ id: "p", name: "Force Lightning", cost: 2, kind: "damage", damage: 9, type: "energy", range: 12, radius: 0, seconds: 0, distance: 0, strike: 0, ...extra });
const caster = (powers: RtPower[], extra: Partial<Unit> = {}) => player({ gun: undefined, powers, points: 6, facing: Math.PI / 2, ...extra });

test("a damage power strikes the foe in front of the party for its dice at their average, and costs its points", () => {
  const env = field();
  const sim = newSim([caster([power()]), trooper("t", 6.5, 0.5, { gun: undefined })]);
  const events: Event[] = [];
  assert.equal(castPower(sim, 0, env, events), "");
  assert.equal(sim.units[1].hp, 11);
  assert.equal(playerOf(sim).points, 4);
  assert.ok(events.some((e) => e.type === "power"));
  // not again at once, and not behind the party
  assert.equal(castPower(sim, 0, env, []), "");
  assert.equal(playerOf(sim).points, 4, "the pause");
  const behind = newSim([caster([power()]), trooper("t", -6.5, 0.5, { gun: undefined })]);
  assert.match(castPower(behind, 0, env, []), /nothing in its reach/);
  assert.equal(playerOf(behind).points, 6, "nothing is spent on nothing");
});

test("a power needs its points, and healing stops at full health", () => {
  const env = field();
  const poor = newSim([caster([power({ cost: 5 })], { points: 2 }), trooper("t", 6.5, 0.5)]);
  assert.match(castPower(poor, 0, env, []), /Not enough points/);
  const heal = newSim([caster([power({ kind: "heal", damage: 12, name: "Heal" })], { hp: 20, maxHp: 50 })]);
  assert.equal(castPower(heal, 0, env, []), "");
  assert.equal(playerOf(heal).hp, 32);
  const full = newSim([caster([power({ kind: "heal", damage: 12, name: "Heal" })])]);
  assert.match(castPower(full, 0, env, []), /unhurt/);
});

test("a push flings a foe away and hurts it if a wall stops it; a stun holds it, a scare sends the timid running", () => {
  const env = door();
  const sim = newSim([caster([power({ kind: "push", distance: 6, strike: 7, name: "Force Push" })], { x: 8.5, y: 0.5 }), trooper("t", 9.5, 0.5, { gun: undefined })]);
  assert.equal(castPower(sim, 0, env, []), "");
  const before = sim.units[1].hp;
  run(sim, env, 1);
  assert.ok(sim.units[1].x < 10 && sim.units[1].hp < before, `stopped by the wall and hurt: ${sim.units[1].x.toFixed(2)}, ${sim.units[1].hp}`);
  const stun = newSim([caster([power({ kind: "stun", seconds: 4 })]), trooper("t", 6.5, 0.5, { mode: "engage" })]);
  castPower(stun, 0, field(), []);
  assert.ok(stun.units[1].stagger > 3);
  const scare = newSim([caster([power({ kind: "fear", seconds: 5 })]), trooper("t", 6.5, 0.5, { brave: false, mode: "engage" })]);
  castPower(scare, 0, field(), []);
  assert.equal(scare.units[1].mode, "flee");
  const steady = newSim([caster([power({ kind: "fear", seconds: 5 })]), trooper("b", 6.5, 0.5, { brave: true, mode: "engage" })]);
  castPower(steady, 0, field(), []);
  assert.notEqual(steady.units[1].mode, "flee");
});
