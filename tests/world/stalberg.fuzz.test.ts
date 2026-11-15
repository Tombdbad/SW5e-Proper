// The Stalberg solver against random packed districts (2026-11-15; from the design note's fuzz, which ran 200 a size: here fewer, so that `npm test` stays quick)
import test from "node:test";
import assert from "node:assert/strict";
import { solveGraph, solveGraphSoft, neighbours, looksWithReport, looksFor, cornerCase, cornerPieces, cornerMask, type LookNode, type Dice, type Mask, type GraphProblem } from "@shared/logic/stalberg";

function rng(seed: number): Dice {
  let a = seed >>> 0;
  return { next() { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } };
}
const factory = (seed: number) => { let k = 0; return () => rng(seed * 1000 + k++); };

function district(seed: number, count: number): LookNode[] {
  const r = rng(seed);
  const boxes: LookNode["box"][] = [];
  let guard = 0;
  while (boxes.length < count && guard++ < 5000) {
    const w = 6 + Math.floor(r.next() * 10), h = 6 + Math.floor(r.next() * 10);
    const x = Math.floor(r.next() * 60), y = Math.floor(r.next() * 60);
    const clash = boxes.some((b) => x < b.x + b.width + 2 && b.x < x + w + 2 && y < b.y + b.height + 2 && b.y < y + h + 2);
    if (!clash) boxes.push({ x, y, width: w, height: h });
  }
  return boxes.map((box, i) => ({ id: `b${i}`, box, grand: i % 11 === 0 }));
}

test("dense districts always get varied looks: hard rules hold, none flat, seams only where crowns had to repeat", () => {
  for (const count of [8, 14, 22, 30]) {
    let flat = 0;
    for (let s = 1; s <= 40; s++) {
      const nodes = district(s, count);
      const { looks, seams } = looksWithReport(nodes, factory(s));
      const { edges, alley } = neighbours(nodes);
      const alike = new Set<string>();
      edges.forEach(([i, j], k) => {
        const a = looks[nodes[i].id], b = looks[nodes[j].id];
        assert.ok(Math.abs(a.trim - b.trim) <= 1, "the trim rule is hard");
        if (alley[k]) assert.equal(a.band, b.band, "the band rule is hard across an alley");
        if (a.crown === b.crown) alike.add(`${nodes[i].id}|${nodes[j].id}`);
      });
      assert.deepEqual(new Set(seams.map(([a, b]) => `${a}|${b}`)), alike, "a seam for every pair of neighbours with the same crown, and no other");
      if (nodes.length > 4 && new Set(Object.values(looks).map((l) => `${l.crown}${l.trim}${l.band}`)).size === 1) flat++;
    }
    assert.equal(flat, 0, `${count} buildings: none flat`);
  }
});

test("neighbours seldom share a crown, across an alley or an avenue (a repeat is given up only where three crowns cannot colour the street)", () => {
  let [alleyAlike, alleyAll, aveAlike, aveAll] = [0, 0, 0, 0];
  for (let s = 1; s <= 60; s++) {
    const nodes = district(s, 30);
    const { looks } = looksWithReport(nodes, factory(s));
    const { edges, alley } = neighbours(nodes);
    edges.forEach(([i, j], k) => {
      const same = looks[nodes[i].id].crown === looks[nodes[j].id].crown;
      if (alley[k]) { alleyAll++; if (same) alleyAlike++; } else { aveAll++; if (same) aveAlike++; }
    });
  }
  assert.ok(alleyAll > 100 && aveAll > 100, "both kinds of neighbour are met");
  assert.ok(alleyAlike / alleyAll < 0.01 && aveAlike / aveAll < 0.01, `alley ${alleyAlike}/${alleyAll}, avenue ${aveAlike}/${aveAll}`);
});

test("the same seed gives the same looks, another seed others", () => {
  const nodes = district(7, 22);
  const a = JSON.stringify(looksFor(nodes, factory(7)));
  assert.equal(JSON.stringify(looksFor(nodes, factory(7))), a);
  assert.notEqual(JSON.stringify(looksFor(nodes, factory(8))), a);
});

test("a grand building takes the first crown and the plain trim wherever its neighbours leave them", () => {
  let [kept, grand] = [0, 0];
  for (let s = 1; s <= 60; s++) {
    const nodes = district(s, 14);
    const looks = looksFor(nodes, factory(s));
    for (const n of nodes.filter((x) => x.grand)) { grand++; if (looks[n.id].crown === 0 && looks[n.id].trim === 0) kept++; }
  }
  assert.ok(kept / grand > 0.8, `${kept}/${grand}`);
});

test("a tree never meets a contradiction (arc consistency is complete on trees)", () => {
  let worst = 0;
  for (let s = 1; s <= 120; s++) {
    const r = rng(s), n = 12 + Math.floor(r.next() * 20), L = 4;
    const edges: [number, number][] = [];
    for (let i = 1; i < n; i++) edges.push([Math.floor(r.next() * i), i]);
    const tables = edges.map(() => Array.from({ length: L * L }, () => r.next() < 0.45));
    const problem: GraphProblem<number> = {
      nodes: Array.from({ length: n }, () => ({ labels: Array.from({ length: L }, (_, l) => ({ label: l, weight: 1 })) })),
      edges, allowed: (a, b, _e, id) => tables[id][a * L + b],
    };
    const res = solveGraphSoft(problem, factory(s));
    if (res) worst = Math.max(worst, res.attempts);
  }
  assert.equal(worst, 1);
});

test("a problem with no answer before any choice is reported at once", () => {
  let calls = 0;
  const p: GraphProblem<number> = { nodes: [{ labels: [{ label: 0, weight: 1 }] }, { labels: [{ label: 0, weight: 1 }] }], edges: [[0, 1]], allowed: () => false };
  assert.equal(solveGraph(p, () => { calls++; return rng(1); }), null);
  assert.equal(calls, 0);
});

test("the sixteen corners are six pieces; a pinch splits into two outside corners", () => {
  const counts: Record<string, number> = {};
  for (let m = 0; m < 16; m++) {
    const mask = [0, 1, 2, 3].map((i) => !!(m & (1 << i))) as Mask;
    const { piece } = cornerCase(mask);
    counts[piece] = (counts[piece] ?? 0) + 1;
    const pieces = cornerPieces(mask, "split");
    if (piece === "pinch") { assert.equal(pieces.length, 2); for (const p of pieces) assert.equal(p.piece, "outside"); }
    else assert.equal(pieces.length, 1);
  }
  assert.deepEqual(counts, { empty: 1, outside: 4, wall: 4, pinch: 2, inside: 4, solid: 1 });
  const grid = new Set(["1,1", "2,1", "1,2"]);
  assert.deepEqual(cornerMask((x, y) => grid.has(`${x},${y}`), 1, 1), [true, true, false, true]);
});
