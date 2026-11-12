import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, createRandom } from "@shared/logic";
import { solveGraph, cornerCase, looksFor, neighbours, CROWNS, type LookNode } from "@shared/logic/stalberg";
import { getWorldCatalog } from "../../server/sw5eData";

const dice = (seed: number) => { let k = 0; return () => createRandom(seed * 1000 + k++); };

test("solveGraph colours a ring with edge rules and is deterministic", () => {
  const n = 9;
  const problem = {
    nodes: Array.from({ length: n }, () => ({ labels: [0, 1, 2].map((label) => ({ label, weight: 1 })) })),
    edges: Array.from({ length: n }, (_, i): [number, number] => [i, (i + 1) % n]),
    allowed: (a: number, b: number) => a !== b,
  };
  const a = solveGraph(problem, dice(1))!;
  assert.ok(a);
  for (let i = 0; i < n; i++) assert.notEqual(a[i], a[(i + 1) % n]);
  assert.deepEqual(solveGraph(problem, dice(1)), a);
});

test("solveGraph reports a problem with no answer", () => {
  const problem = { nodes: [0, 1, 2].map(() => ({ labels: [{ label: 0, weight: 1 }] })), edges: [[0, 1], [1, 2]] as [number, number][], allowed: (a: number, b: number) => a !== b };
  assert.equal(solveGraph(problem, dice(2), 3), null);
});

test("cornerCase maps the sixteen corner states onto six pieces and a turn", () => {
  const seen = new Map<string, number>();
  for (let m = 0; m < 16; m++) {
    const mask = [0, 1, 2, 3].map((i) => !!(m & (1 << i))) as [boolean, boolean, boolean, boolean];
    const { piece, turn } = cornerCase(mask);
    seen.set(piece, (seen.get(piece) ?? 0) + 1);
    assert.ok(turn >= 0 && turn < 4);
  }
  assert.deepEqual(Object.fromEntries(seen), { empty: 1, outside: 4, wall: 4, pinch: 2, inside: 4, solid: 1 });
  assert.equal(cornerCase([true, false, false, false]).turn, 0);
  assert.equal(cornerCase([false, true, false, false]).turn, 1);
});

test("looksFor: facing buildings differ in crown, trims drift by a step, an alley shares its band", () => {
  const nodes: LookNode[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) nodes.push({ id: `b${i}${j}`, box: { x: i * 11, y: j * 14, width: 8, height: 8 }, grand: i === 1 && j === 1 });
  const { edges, alley } = neighbours(nodes);
  assert.ok(edges.length >= 10);
  const looks = looksFor(nodes, dice(3));
  edges.forEach(([a, b], k) => {
    const p = looks[nodes[a].id], q = looks[nodes[b].id];
    assert.notEqual(p.crown, q.crown);
    assert.ok(Math.abs(p.trim - q.trim) <= 1);
    if (alley[k]) assert.equal(p.band, q.band);
  });
  assert.deepEqual(looksFor(nodes, dice(3)), looks);
});

const catalog = await getWorldCatalog();
test("generated districts carry looks that satisfy the rules", () => {
  let checked = 0;
  for (const seed of [3, 5, 9]) {
    const world = generateWorld({ seed, partyLevel: 5 }, catalog);
    for (const plan of Object.values(world.districtPlans ?? {})) {
      assert.ok(plan.looks, plan.id);
      const ids = Object.keys(plan.boxes);
      const nodes: LookNode[] = ids.map((id) => ({ id, box: plan.boxes[id] }));
      const { edges } = neighbours(nodes);
      for (const [a, b] of edges) {
        const p = plan.looks![ids[a]], q = plan.looks![ids[b]];
        assert.ok(p && q);
        assert.ok(Math.abs(p.trim - q.trim) <= 1, `${plan.id} trims`);
        assert.ok(p.crown < CROWNS);
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
});
