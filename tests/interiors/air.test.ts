// Jumping, hooks and jetpacks in real time (interiors/air.ts) and the hooks read from the items' texts (shared/logic gearUse, climbGearOf).
import test from "node:test";
import assert from "node:assert/strict";
import { climbGearOf, gearUse } from "../../shared/logic";
import { AIR, FEET, flightOf, hookStats, jumpOf, reelTo } from "../../client/src/components/Map/interiors/air";
import enhanced from "../../shared/data/sw5e/enhancedItems.json";
import equipment from "../../shared/data/sw5e/equipment.json";

const text = (name: string) => ((enhanced as { name: string; text: string }[]).find((e) => e.name === name)?.text ?? (equipment as { name: string; description?: string }[]).find((e) => e.name === name)?.description ?? "");

test("the Wrist-Mounted Grappling Hook is a hook that is fired: 30/60 ft., a 60 ft. cable; the plain hook is thrown on its 50 ft. line", () => {
  const wrist = gearUse({ name: "Wrist-Mounted Grappling Hook", description: text("Wrist-Mounted Grappling Hook") });
  assert.deepEqual(wrist, { kind: "grapple", feet: 60, shot: { range: 30, long: 60, damage: "1d4" } });
  const plain = gearUse({ name: "Grappling hook", equipmentCategory: "Utility", description: text("Grappling hook") });
  assert.equal(plain?.kind, "grapple");
  assert.equal((plain as { feet: number }).feet, 50);
  // (the item with no text still reads as a hook, with its usual cable)
  assert.equal((gearUse({ name: "Wrist-Mounted Grappling Hook" }) as { feet: number }).feet, 60);
});

test("what a character carries: the wrist hook's cable counts for a climb, and the longest-reaching hook is the one fired", () => {
  const gear = climbGearOf([{ name: "Grappling hook", equipmentCategory: "Utility", description: text("Grappling hook") }, { name: "Wrist-Mounted Grappling Hook", description: text("Wrist-Mounted Grappling Hook") }], [], () => false);
  assert.equal(gear.hookFeet, 60);
  assert.equal(gear.shot?.name, "Wrist-Mounted Grappling Hook");
  assert.equal(gear.shot?.long, 60);
  const only = climbGearOf([{ name: "Wrist-Mounted Grappling Hook", description: text("Wrist-Mounted Grappling Hook") }], [], () => false);
  const stats = hookStats(only.shot!);
  assert.equal(stats.range, 6);
  assert.equal(stats.long, 12);
  assert.equal(stats.cable, 12);
});

test("a jump is the Handbook's: the high jump's height in 0.7 s, carried by the long jump's distance when moving, nowhere from a standstill", () => {
  const run = jumpOf(14, 1, "Medium", true);
  // 3 + 2 = 5 ft. of high jump, 14 ft. of long jump after a run
  assert.ok(Math.abs(run.apex - 1) < 1e-9);
  assert.ok(Math.abs(run.carry * run.time - 14 / FEET) < 1e-9, `${run.carry} squares a second for ${run.time} s`);
  // the physics agrees with its own apex: v0 = g t / 2, and the top is v0^2 / 2g
  assert.ok(Math.abs((run.rise * run.rise) / (2 * run.gravity) - run.apex) < 1e-9);
  const stand = jumpOf(14, 1, "Medium", false);
  assert.equal(stand.carry, 0);
  assert.ok(Math.abs(stand.apex - 0.5) < 0.2 && stand.apex < run.apex, "half the height from a standstill");
  // the weak cannot clear a counter, the strong can; a heavy world cuts a jump, a light one lengthens it
  assert.ok(jumpOf(8, 1, "Medium", true).apex < AIR.hop);
  assert.ok(jumpOf(16, 1, "Medium", true).apex >= AIR.hop);
  assert.ok(jumpOf(14, 1.5, "Medium", true).apex < run.apex);
  assert.ok(jumpOf(14, 0.7, "Medium", true).apex > run.apex);
});

test("a pack's flight: its pace by its flying speed, climbing faster than it sinks, a ceiling above the roofs, a burst", () => {
  const jet = flightOf(30);
  const boots = flightOf(25);
  const champion = flightOf(80);
  assert.equal(jet.pace, 1);
  assert.ok(boots.pace < jet.pace && champion.pace > jet.pace);
  assert.ok(jet.climb > jet.sink);
  assert.ok(jet.ceiling > 2.8 * 2, "above a two-storey roof");
  assert.ok(champion.burst.speed > jet.burst.speed);
});

test("the hook reels the party along its line to the last open square before a wall; low furniture is passed over; a bite too near pulls nowhere", () => {
  // a corridor of open squares from x 0 to 9 on row 0; a wall at x = 6; a bench at x = 3 (low)
  const open = (x: number, y: number) => y === 0 && x >= 0 && x <= 9 && x !== 6 && x !== 3;
  const low = (x: number, y: number) => y === 0 && x === 3;
  assert.deepEqual(reelTo({ x: 0, y: 0 }, { x: 8.5, y: 0 }, open, low), { x: 5, y: 0 }, "stops before the wall");
  assert.deepEqual(reelTo({ x: 0, y: 0 }, { x: 4.4, y: 0 }, open, low), { x: 4, y: 0 }, "over the bench");
  assert.equal(reelTo({ x: 0, y: 0 }, { x: 1, y: 0 }, open, low), null, "under two squares");
  const walled = (x: number, y: number) => open(x, y) && x !== 1;
  assert.equal(reelTo({ x: 0, y: 0 }, { x: 8, y: 0 }, walled, () => false), null, "a wall at once");
});
