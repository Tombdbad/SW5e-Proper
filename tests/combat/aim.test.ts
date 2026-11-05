import test from "node:test";
import assert from "node:assert/strict";
import { SCOPES, SCOPE_SIZES, SHOOT, blankUnit, firePlayer, gunOf, newSim, opticOf, playerOf, scopeSizeOf, step, type Env, type Event, type Gun, type Optic, type Sim, type Unit } from "../../shared/logic/shooter";

// Aiming down the sights and scopes (2026-11-05; the user: "an aim button and scopes of various zoom levels as attachments for relevant weapons")
const field: Env = { blocks: () => false, walkable: (x, y) => x > -80 && x < 120 && y > -40 && y < 40, floorAt: () => 0 };
const rifle: Gun = { name: "Blaster rifle", damage: 10, type: "energy", interval: 0.2, auto: false, range: 20, long: 80, mag: 999, left: 999, reserve: 8, reload: 1, spent: 0 };
const player = (gun: Partial<Gun> = {}, extra: Partial<Unit> = {}) => blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 50, maxHp: 50, ac: 10, gun: { ...rifle, ...gun }, ...extra });
const me = (sim: Sim) => ({ x: playerOf(sim).x, y: playerOf(sim).y, h: 0, facing: Math.PI / 2 });
const run = (sim: Sim, seconds: number, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(sim, dt, field, me(sim)); };

// The mean angle the shots miss the line by, over many shots at a mark `distance` squares along +x
function error(gun: Partial<Gun>, ads: number, distance = 8, shots = 400): number {
  const sim = newSim([player(gun)], { seed: 11 });
  const p = playerOf(sim);
  p.ads = ads;
  let sum = 0;
  const events: Event[] = [];
  for (let i = 0; i < shots; i++) {
    sim.bolts.length = 0;
    p.fire = 0;
    sim.spread = SHOOT.spread.base;
    assert.ok(firePlayer(sim, { x: p.x, y: p.y, h: 1 }, { x: p.x + distance, y: p.y, h: 1 }, events, false, false));
    const b = sim.bolts[0];
    sum += Math.abs(Math.atan2(b.vx, b.vy) - Math.PI / 2);
  }
  return sum / shots;
}

test("a scope magnifies by its grade: standard 2x, premium 3x, advanced 4x, artifact 6x; the best of those fitted is the one looked through", () => {
  const z = (names: string[], gun?: { name?: string; range?: number }) => opticOf(names, gun)?.zoom;
  assert.equal(z(["Focusing Scope"]), 2);
  assert.equal(z(["Brutal Scope"]), 3);
  assert.equal(z(["Dire Fighting Scope"]), 3);
  assert.equal(z(["Brutal Scope (Deadly)"]), 4);
  assert.equal(z(["Dire Mastery Scope"]), 4);
  assert.equal(z(["Brutal Scope (Devastating)"]), 6);
  assert.equal(z(["Dire Ascendancy Scope"]), 6);
  assert.equal(z(["Multispectral Optics (Champion)"]), 6);
  assert.equal(z(["Focusing Scope", "Dire Mastery Scope"]), 4, "the best of two");
  assert.equal(z(["Targeting Rangefinder (Fighting)", "Bipod"]), undefined, "a focus's rangefinder is not a scope");
  assert.equal(z([]), undefined);
  assert.ok(SCOPES.every((s) => (SCOPE_SIZES as readonly number[]).includes(s.zoom)), "every zoom has a model");
});

test("a sniper-class weapon carries a 4x scope of its own; a rifle, a carbine and a pistol have only their sights, and a scope can be fitted to any of them", () => {
  assert.equal(opticOf([], { name: "Sniper rifle", range: 30 })?.zoom, 4);
  assert.equal(opticOf([], { name: "Disruptor sniper", range: 24 })?.zoom, 4);
  assert.equal(opticOf([], { name: "Blaster rifle", range: 21 }), undefined);
  assert.equal(opticOf([], { name: "Blaster carbine", range: 14 }), undefined);
  assert.equal(opticOf([], { name: "Blaster pistol", range: 10 }), undefined);
  assert.equal(opticOf(["Focusing Scope"], { name: "Blaster pistol", range: 10 })?.zoom, 2);
  assert.equal(opticOf(["Brutal Scope"], { name: "Sniper rifle", range: 30 })?.zoom, 4, "the built-in 4x beats a 3x");
  const sniper = gunOf({ rangedWeapon: "Sniper rifle", rangedDice: "2d8", rangedProps: ["Power cell (range 150/600)", "reload 2"] })!;
  assert.equal(sniper.optic?.zoom, 4);
  assert.equal(gunOf({ rangedWeapon: "Blaster pistol", rangedDice: "1d6", rangedProps: ["Power cell (range 50/200)"] })!.optic, undefined);
  assert.deepEqual([2, 3, 4, 5, 6, 8, 1].map(scopeSizeOf), [2, 3, 4, 4, 6, 6, 2], "the model of the nearest size");
});

test("the gun comes to the shoulder in a fifth of a second and goes down faster; not while reloading, hurt, blocking or put down, nor with no gun", () => {
  const sim = newSim([player()], { seed: 3 });
  const p = playerOf(sim);
  p.aimHeld = true;
  run(sim, 0.1);
  assert.ok(p.ads! > 0.3 && p.ads! < 0.7, `half way: ${p.ads}`);
  run(sim, 0.25);
  assert.equal(p.ads, 1);
  p.aimHeld = false;
  run(sim, 0.12);
  assert.equal(p.ads, 0, "lowered at twice the speed");
  p.aimHeld = true;
  p.reloading = 1;
  run(sim, 0.4);
  assert.equal(p.ads, 0, "not while it reloads");
  p.reloading = 0;
  run(sim, 0.4);
  assert.equal(p.ads, 1);
  p.stagger = 0.5;
  run(sim, 0.3);
  assert.equal(p.ads, 0, "knocked off it by a stagger");
  const bare = newSim([player({}, { gun: undefined })], { seed: 3 });
  playerOf(bare).aimHeld = true;
  run(bare, 0.5);
  assert.equal(playerOf(bare).ads, 0, "no gun, nothing to aim");
});

test("aimed, the shots group tighter: the iron sights take the cone to about half, a scope narrows it again", () => {
  const hip = error({}, 0);
  const iron = error({}, 1);
  const scoped = error({ optic: { name: "Focusing Scope", zoom: 2 } }, 1);
  assert.ok(iron < hip * 0.65, `iron sights ${iron.toFixed(4)} against the hip ${hip.toFixed(4)}`);
  assert.ok(scoped < iron * 0.9, `a scope ${scoped.toFixed(4)} against the iron sights ${iron.toFixed(4)}`);
  const half = error({}, 0.5);
  assert.ok(half < hip && half > iron, "half way up is half way between");
});

test("past the normal range a shot is worse by half; an aimed Focusing Scope takes that away (the books' take aim), another scope aimed takes a quarter of it", () => {
  const near = (gun: Partial<Gun>, ads: number) => error(gun, ads, 10);
  const far = (gun: Partial<Gun>, ads: number) => error(gun, ads, 30);
  const bare = far({}, 0) / near({}, 0);
  assert.ok(bare > 1.35 && bare < 1.65, `the long range's penalty: ${bare.toFixed(2)}`);
  const focus = { scope: true, optic: { name: "Focusing Scope", zoom: 2 } as Optic };
  const taken = far(focus, 1) / near(focus, 1);
  assert.ok(taken > 0.85 && taken < 1.15, `a scope, taken aim: ${taken.toFixed(2)}`);
  const unaimed = far(focus, 0) / near(focus, 0);
  assert.ok(unaimed > 1.35, `the same scope not aimed through: ${unaimed.toFixed(2)}`);
  const other = { optic: { name: "Brutal Scope", zoom: 3 } as Optic };
  const some = far(other, 1) / near(other, 1);
  assert.ok(some > 1.1 && some < 1.4, `another scope aimed: ${some.toFixed(2)}`);
});

test("a gun aimed kicks less: the cone a shot opens is smaller at the shoulder", () => {
  const after = (ads: number) => {
    const sim = newSim([player()], { seed: 5 });
    const p = playerOf(sim);
    p.ads = ads;
    sim.spread = SHOOT.spread.base;
    firePlayer(sim, { x: p.x, y: p.y, h: 1 }, { x: p.x + 8, y: p.y, h: 1 }, [], false, false);
    return sim.spread - SHOOT.spread.base;
  };
  assert.ok(after(1) < after(0) * 0.9, `${after(1)} against ${after(0)}`);
});
