import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The colour maps made from the photograph scans (tools/face-scans.mjs; 2026-11-05, the user: "borrow HEAVILY from this image ... duplicated eyebrows, weird expressions"): they need the
// reference sheet (tools/refs/snips, not in the repository), so they are skipped where it is not
const root = path.resolve(import.meta.dirname, "../../tools/face-scans.mjs");
const scans = (await import(pathToFileURL(root).href)) as { available: boolean; facePlane: (id: string) => Promise<{ at: (x: number, y: number) => number[] | null }> };
const lum = (r: number[]) => r[0] * 0.3 + r[1] * 0.59 + r[2] * 0.11;

test("a face's colour map has the lips redder than the skin, no eyes and no brows of the photograph, and fades out into plain skin at the hair", { skip: !scans.available }, async () => {
  for (const id of ["m", "m2", "f", "f2"]) {
    const p = await scans.facePlane(id);
    const lips = p.at(0, -0.0525)!;
    const cheek = p.at(0.045, -0.02)!;
    assert.ok(lips && cheek, `${id}: lips and cheek`);
    assert.ok(lips[0] > lips[1] * 1.08, `${id}: the lips are redder than they are green (${lips.map((v) => v.toFixed(2))})`);
    assert.ok(lips[0] / lips[1] > cheek[0] / cheek[1], `${id}: and redder than the cheek is`);
    // the eye and the brow of the photograph are cut out: a plain lid's colour, no iris blue, no dark brow
    for (const [x, y] of [[0.0405, 0.017], [-0.0405, 0.017], [0.035, 0.040], [-0.035, 0.040], [0.05, 0.046]]) {
      const r = p.at(x, y);
      if (!r) continue;   // (plain skin: where the photograph is not used at all, as over the second feminine face's hair-covered forehead)
      assert.ok(lum(r) > 0.8 && lum(r) < 1.08, `${id}: no dark eye or brow at ${x},${y} (${lum(r).toFixed(2)})`);
      assert.ok(Math.abs(r[2] - r[0]) < 0.2, `${id}: no iris colour at ${x},${y}`);
    }
    // plain skin at the hair and past the cheeks
    for (const [x, y] of [[0, 0.115], [0.095, 0.0], [0.09, 0.06]]) {
      const r = p.at(x, y);
      assert.ok(!r || r.every((v) => Math.abs(v - 1) < 0.01), `${id}: plain at ${x},${y}`);
    }
    // everything within what a skin can be
    for (let x = -0.08; x <= 0.08; x += 0.01) for (let y = -0.12; y <= 0.09; y += 0.01) {
      const r = p.at(x, y);
      if (r) assert.ok(r.every((v) => v > 0.25 && v < 1.5), `${id}: ${x},${y} ${r}`);
    }
  }
});

test("the second masculine face is the first turned about: the same lips, the other way round", { skip: !scans.available }, async () => {
  const [a, b] = [await scans.facePlane("m"), await scans.facePlane("m2")];
  for (const [x, y] of [[0.02, -0.0525], [0.045, -0.02], [0.03, -0.09]]) {
    const [ra, rb] = [a.at(x, y)!, b.at(-x, y)!];
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(ra[k] - rb[k]) < 1e-6, `at ${x},${y}`);
  }
});
