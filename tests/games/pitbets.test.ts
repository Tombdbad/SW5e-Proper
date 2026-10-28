// Betting on the pit (2026-10-27): bouts of near creatures, odds read from how often each wins, the house's cut, and a bout fought out
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { boutsFor, chanceOf, fight, fighterOf, paysFor, settle, HOUSE_CUT, type Fighter } from "../../shared/logic/pitbets";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();
const mk = (name: string, hp: number, ac: number, bonus: number, dice: number, sides: number, plus = 0, attacks = 1): Fighter => ({ id: name, name, cr: "1", hp, ac, bonus, dice, sides, plus, attacks });

test("a stronger fighter wins more often, a fight always ends, and a bout can be replayed the same from its dice", () => {
  const strong = mk("Strong", 60, 15, 7, 2, 8, 4);
  const weak = mk("Weak", 25, 11, 3, 1, 6, 1);
  const p = chanceOf(strong, weak, createRandom(3), 300);
  assert.ok(p > 0.8, `strong wins ${p}`);
  assert.ok(chanceOf(weak, strong, createRandom(3), 300) < 0.2);
  const log: string[] = [];
  const a = fight(strong, weak, createRandom(9), log);
  const b = fight(strong, weak, createRandom(9));
  assert.equal(a, b);
  assert.ok(log.length > 1 && log.length <= 80);
  // evenly matched: near even
  const even = chanceOf(mk("A", 40, 13, 5, 1, 8, 3), mk("B", 40, 13, 5, 1, 8, 3), createRandom(5), 400);
  assert.ok(even > 0.38 && even < 0.62, `even ${even}`);
});

test("the odds pay by how unlikely a win is, with the house's cut: a long shot pays well, a favourite little, and betting both ways loses a little", () => {
  assert.ok(paysFor(0.2) > paysFor(0.5) && paysFor(0.5) > paysFor(0.8));
  assert.ok(paysFor(0.99) >= 1.05);
  const p = 0.35;
  const back = (p * paysFor(p) + (1 - p) * paysFor(1 - p)) / 2; // a credit on each side, per credit staked
  assert.ok(back < 1 && back > 1 - HOUSE_CUT - 0.05, `both ways returns ${back}`);
});

test("the day's bouts: three creatures of the rules a side, of near rating and rising weight, odds that sum with the cut, a bet settled both ways", () => {
  const rng = createRandom(21);
  const bouts = boutsFor(catalog.monsters, 3, rng);
  assert.equal(bouts.length, 3);
  for (const b of bouts) {
    assert.ok(b.a.id !== b.b.id);
    assert.ok(Math.abs(b.chance[0] + b.chance[1] - 1) < 1e-9);
    assert.ok(b.pays[0] >= 1.05 && b.pays[1] >= 1.05);
    assert.ok(b.chance[0] > b.chance[1] === b.pays[0] < b.pays[1] || Math.abs(b.chance[0] - 0.5) < 0.02);
  }
  // settling: a winning bet returns stake times what it pays, a losing one nothing
  const bout = bouts[0];
  let won = 0, lost = 0;
  for (let i = 0; i < 40; i++) {
    const s = settle(bout, 0, 100, createRandom(i + 1));
    assert.ok(s.log.length >= 3);
    if (s.winner === 0) { won++; assert.equal(s.back, Math.floor(100 * bout.pays[0])); } else { lost++; assert.equal(s.back, 0); }
  }
  assert.ok(won + lost === 40);
  assert.ok(fighterOf(catalog.monsters.find((m) => m.id === bout.a.id)!)!.name === bout.a.name);
});
