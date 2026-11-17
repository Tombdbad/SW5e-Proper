// Loose pieces in the real-time fight (2026-11-16, batch G; the user: Force push and pull move furniture "that has weight, but is NOT attached to
// the floor", by the character's Force level, and "destructible furniture"): what a power moves is read from its text at the character's level
// (realtimePowers' `objects`, from rules.ts powerMotion), a piece's size and weight and whether it breaks from the shared house rules (bulkOf, breakOf)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { breakOf, bulkOf } from "../../shared/logic/index";
import { blankUnit, blastOf, castPower, firePlayer, newSim, playerOf, step, type Env, type Event, type Prop, type RtPower, type Sim } from "../../shared/logic/shooter";
import { realtimePowers } from "../../client/src/lib/sw5e/realtimePowers";

const require = createRequire(import.meta.url);
const powers: any[] = require("../../shared/data/sw5e/powers.json");
const read = (name: string, level: number) => realtimePowers([powers.find((p) => p.name === name)], level, { wisdom: 16, charisma: 16, intelligence: 12 }, 40)[0];
const asset = (name: string, w = 1, h = 1) => ({ name, w, h, kind: "furniture" as const });

// An open floor with a wall along x = 12; a shove goes a square at a time and stops before the wall or a body
const room = (props: Prop[]): Env => ({
  blocks: (x, _y, h) => Math.floor(x) >= 12 && h < 3,
  walkable: (x, y) => x >= 0 && x < 12 && y >= 0 && y < 12 && !props.some((o) => !o.gone && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.d),
  floorAt: () => 0,
  shove: (id, dir, squares, who) => {
    const o = props.find((p) => p.id === id)!;
    const most = Math.max(Math.abs(dir.x), Math.abs(dir.y));
    let [x, y, n] = [o.x, o.y, 0];
    for (let i = 1; i <= squares; i++) {
      const [nx, ny] = [Math.round(o.x + (dir.x / most) * i), Math.round(o.y + (dir.y / most) * i)];
      if (nx < 0 || ny < 0 || nx + o.w > 12 || ny + o.d > 12) return { x, y, squares: n, struck: { x: nx, y: ny } };
      if (who(nx, ny)) return { x, y, squares: n, struck: { x: nx, y: ny } };
      [x, y, n] = [nx, ny, i];
    }
    return { x, y, squares: n };
  },
});
const run = (sim: Sim, env: Env, seconds: number, dt = 1 / 30) => {
  const out: Event[] = [];
  for (let t = 0; t < seconds; t += dt) { const p = playerOf(sim); out.push(...step(sim, dt, env, { x: p.x, y: p.y, h: 0, facing: 0 })); }
  return out;
};
const piece = (id: string, name: string, x: number, y: number, w = 1, d = 1): Prop => {
  const a = asset(name, w, d);
  const b = bulkOf(a);
  const br = breakOf(a);
  return { id, name, x, y, w, d, size: b.size, pounds: b.pounds, ...(br ? { hp: br.hp } : {}), ...(br?.burst ? { burst: blastOf(name, { radius: br.burst.radius, damage: [{ dice: br.burst.dice, type: br.burst.type }] }) } : {}) };
};

test("what a power moves is read from its text at the character's level; what breaks, and how hard, from the house rule", () => {
  const low = read("Force Push/Pull", 1);
  assert.equal(low.objects?.size, "Medium");
  assert.equal(low.objects?.squares.Tiny, 4);
  assert.equal(low.objects?.squares.Medium, 1);
  assert.equal(read("Force Push/Pull", 5).objects?.squares.Medium, 2, "a higher level moves it farther");
  const tk = read("Telekinesis", 9);
  assert.equal(tk.objects?.maxPounds, 2500);
  assert.equal(breakOf(asset("Crate"))?.hp, 18, "a resilient Medium object");
  assert.equal(breakOf(asset("Water jar"))?.hp, 4, "a fragile one");
  assert.equal(breakOf(asset("Boulder")), undefined, "stone does not break");
  assert.equal(breakOf(asset("Console")), undefined, "built in");
  assert.ok(breakOf(asset("Fuel drum"))?.burst, "a fuel drum bursts");
  assert.ok(bulkOf(asset("Boulder")).pounds > bulkOf(asset("Crate")).pounds);
});

test("a push aimed at a loose piece moves it as far as its size allows; one too heavy or too big will not move", () => {
  const crate = piece("c", "Crate", 3, 0);
  const boulder = piece("b", "Boulder", 3, 5);
  const props = [crate, boulder];
  const env = room(props);
  const push: RtPower = read("Force Push/Pull", 5);
  const sim = newSim([blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 30, maxHp: 30, points: 10, powers: [push] })], { props });
  playerOf(sim).facing = Math.PI / 2;
  assert.equal(castPower(sim, 0, env, [], { x: 3.5, y: 0.5, h: 0.5 }), "");
  assert.deepEqual([crate.x, crate.y], [5, 0], "two squares away from the party (Medium at level 5)");
  // (a Telekinesis-like limit by weight: a boulder is stone, four times a crate's weight)
  const tk: RtPower = { ...push, objects: { size: "Gargantuan", maxPounds: 300, squares: { Medium: 6 } } };
  playerOf(sim).powerCd = 0;
  assert.match(castPower(sim, 0, env, [], { x: 3.5, y: 5.5, h: 0.5 }, undefined, tk), /too heavy/);
  const small: RtPower = { ...push, objects: { size: "Small", squares: { Small: 2 } } };
  assert.match(castPower(sim, 0, env, [], { x: 5.5, y: 0.5, h: 0.5 }, undefined, small), /too big/);
});

test("a piece pushed into a foe hurts it; bolts break a crate and a fuel drum bursts on those near it", () => {
  const crate = piece("c", "Crate", 2, 0);
  const props = [crate];
  const env = room(props);
  const foe = blankUnit({ id: "f", name: "Thug", side: "foe", x: 4.5, y: 0.5, hp: 30, maxHp: 30, mode: "engage", wait: 99 });
  const push: RtPower = read("Force Push/Pull", 5);
  const sim = newSim([blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 0.5, hp: 30, maxHp: 30, points: 10, powers: [push] }), foe], { props });
  playerOf(sim).facing = Math.PI / 2;
  const events: Event[] = [];
  assert.equal(castPower(sim, 0, env, events, { x: 2.5, y: 0.5, h: 0.5 }), "");
  assert.ok(foe.hp < 30, "struck by the crate");
  assert.ok(crate.hp! < 18, "the crate takes it too");
  // the crate under fire till it breaks
  const drum = piece("d", "Fuel drum", 8, 6);
  const crate2 = piece("c2", "Crate", 6, 6);
  const near = blankUnit({ id: "n", name: "Thug", side: "foe", x: 9.5, y: 7.5, hp: 40, maxHp: 40, mode: "engage", wait: 99 });
  const props2 = [crate2, drum];
  const env2 = room(props2);
  const gun = { name: "Rifle", damage: 10, type: "energy", interval: 0.01, auto: false, range: 20, long: 80, mag: 99, left: 99, reserve: 0, reload: 1, spent: 0 };
  const sim2 = newSim([blankUnit({ id: "me", name: "Me", side: "player", x: 0.5, y: 6.5, hp: 30, maxHp: 30, gun }), near], { props: props2 });
  const all: Event[] = [];
  for (let i = 0; i < 4; i++) {
    sim2.spread = 0;
    playerOf(sim2).fire = 0;
    firePlayer(sim2, { x: 0.5, y: 6.5, h: 0.5 }, { x: 6.5, y: 6.5, h: 0.5 }, all, false, false);
    all.push(...run(sim2, env2, 0.5));
  }
  assert.ok(crate2.gone, "the crate is broken");
  assert.ok(all.some((e) => e.type === "broke" && e.id === "c2"));
  for (let i = 0; i < 6 && !drum.gone; i++) {
    sim2.spread = 0;
    playerOf(sim2).fire = 0;
    firePlayer(sim2, { x: 0.5, y: 6.5, h: 0.5 }, { x: 8.5, y: 6.5, h: 0.5 }, all, false, false);
    all.push(...run(sim2, env2, 0.5));
  }
  assert.ok(drum.gone, "the drum is broken");
  assert.ok(all.some((e) => e.type === "explode"), "and bursts");
  assert.ok(near.hp < 40, "on the foe beside it");
});
