// The character's powers as the real-time fight plays them (2026-10-29): read from the power's text, none named in code
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realtimePowers } from "../../client/src/lib/sw5e/realtimePowers";

const require = createRequire(import.meta.url);
const powers: any[] = require("../../shared/data/sw5e/powers.json");
const force = powers.filter((p) => p.powerType === "Force");
const tech = powers.filter((p) => p.powerType === "Tech");
const scores = { strength: 10, dexterity: 12, constitution: 12, intelligence: 14, wisdom: 16, charisma: 12 };

test("the powers a character knows become the kinds a fight can play, with their costs, and the rest are left out", () => {
  const all = [...force, ...tech];
  const kinds = new Map<string, number>();
  let costs = 0;
  for (const p of all) {
    const out = realtimePowers([p], 5, scores);
    for (const w of out) {
      kinds.set(w.kind, (kinds.get(w.kind) ?? 0) + 1);
      assert.ok(w.range >= 1 && w.range <= 14, `${p.name} range ${w.range}`);
      if (w.kind === "damage" || w.kind === "heal") assert.ok(w.damage >= 1, `${p.name} damage`);
      if (w.kind === "push" || w.kind === "pull") assert.ok(w.distance >= 1);
      costs++;
    }
  }
  console.log("real-time kinds of", all.length, "powers:", [...kinds].map(([k, n]) => `${k} ${n}`).join(", "));
  for (const k of ["damage", "heal", "push", "stun"]) assert.ok((kinds.get(k) ?? 0) > 0, `some power is ${k}`);
  assert.ok(costs > 20);
});

// (2026-11-03: nine on the keys a page, two pages; it was four)
test("only the first eighteen are taken, and a power with an effect left to the table is not offered", () => {
  const some = force.slice(0, 80);
  assert.ok(realtimePowers(some, 5, scores).length <= 18);
  assert.ok(realtimePowers(some, 5, scores).length > 4);
  assert.deepEqual(realtimePowers([{ name: "Mood", level: 1, description: "You feel a calm mood." }], 5, scores), []);
});
