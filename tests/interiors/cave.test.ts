import test from "node:test";
import assert from "node:assert/strict";
import { rockRun, stalagmite, column, crystals, pool, caveFeatures, rockPaletteOf, ROCK_PALETTES } from "../../client/src/components/Map/interiors/cave";
import { baked, boxOf, trianglesOfBaked } from "../helpers";

const p = rockPaletteOf("temperate");

test("a wall run stays out of the room, stands as high as asked and stays cheap", () => {
  for (const [length, height] of [[3, 1.4], [8, 1.8], [14, 2.4]]) {
    const b = baked((k) => rockRun(k, length, height, 5, p));
    const box = boxOf(b);
    assert.ok(box.max.z <= 0.15, `reaches ${box.max.z.toFixed(2)} into the room`);
    assert.ok(box.min.z >= -1.4, `${box.min.z.toFixed(2)} out the back: a wall is a belt of rock, not a hill, or it spills into the next room`);
    assert.ok(box.min.x > -1 && box.max.x < length + 1, "along its length");
    assert.ok(box.max.y > height * 0.6 && box.max.y < height * 2, `${box.max.y.toFixed(2)} high for ${height}`);
    const tris = trianglesOfBaked(b);
    assert.ok(tris < 450 * length + 400, `${tris} triangles for ${length} squares`);
  }
});
test("a cave of four runs round a 12 by 9 room costs a phone little", () => {
  let tris = 0;
  for (const len of [12, 12, 9, 9]) tris += trianglesOfBaked(baked((k) => rockRun(k, len, 2, len, p)));
  assert.ok(tris < 9000, `${tris} triangles for the walls of a large cave room`);
  let lite = 0;
  for (const len of [12, 12, 9, 9]) lite += trianglesOfBaked(baked((k) => rockRun(k, len, 2, len, p, 0.5, 0)));
  assert.ok(lite < tris * 0.45, `lite ${lite} against ${tris}`);
});
test("every wall is its own, and the same each time", () => {
  const a = baked((k) => rockRun(k, 6, 2, 1, p)).matte!;
  const b = baked((k) => rockRun(k, 6, 2, 1, p)).matte!;
  const c = baked((k) => rockRun(k, 6, 2, 2, p)).matte!;
  assert.deepEqual(Array.from(a.attributes.position.array), Array.from(b.attributes.position.array));
  assert.notDeepEqual(Array.from(a.attributes.position.array).slice(0, 60), Array.from(c.attributes.position.array).slice(0, 60));
});
test("formations are the right shape and size", () => {
  const g = boxOf(baked((k) => stalagmite(k, 0.3, 1.2, 1, p)));
  assert.ok(g.max.y > 1 && g.max.y < 1.3 && g.min.y >= -0.01);
  const hanging = boxOf(baked((k) => stalagmite(k, 0.3, 1.2, 1, p, true)));
  assert.ok(hanging.min.y < -1 && hanging.max.y <= 0.01, "a stalactite hangs");
  const col = boxOf(baked((k) => column(k, 0.3, 2.4, 1, p)));
  assert.ok(col.max.y > 2.3 && col.max.y < 2.5);
  assert.ok(baked((k) => crystals(k, 5, 0.6, 1, p)).glow, "crystals glow");
  assert.ok(baked((k) => pool(k, 0.8, 1, p)).glass, "a pool has water");
  for (const f of [(k: import("../../client/src/components/Map/models").Kit) => stalagmite(k, 0.3, 1, 1, p), (k: import("../../client/src/components/Map/models").Kit) => crystals(k, 6, 0.6, 1, p), (k: import("../../client/src/components/Map/models").Kit) => pool(k, 1, 1, p)])
    assert.ok(trianglesOfBaked(baked(f)) < 400);
});
test("features keep to the edge of the room and off what is taken", () => {
  const taken = (x: number, y: number) => !(x === 4 && y === 0);
  const all = caveFeatures(12, 9, 3);
  assert.ok(all.length >= 5 && all.length <= 40, `${all.length} features`);
  for (const f of all.filter((f) => f.kind !== "pool")) {
    const [x, y] = [Math.floor(f.x), Math.floor(f.y)];
    assert.ok(x === 0 || y === 0 || x === 11 || y === 8, `${f.kind} at ${f.x.toFixed(1)},${f.y.toFixed(1)} is in the walked middle`);
  }
  const some = caveFeatures(12, 9, 3, taken);
  assert.ok(!some.some((f) => f.kind !== "pool" && Math.floor(f.x) === 4 && Math.floor(f.y) === 0), "a doorway stays clear");
  assert.deepEqual(caveFeatures(12, 9, 3), all);
});
test("a small cave has no pool, and some large ones do", () => {
  assert.ok(!caveFeatures(5, 5, 1).some((f) => f.kind === "pool"));
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8].some((s) => caveFeatures(10, 8, s).some((f) => f.kind === "pool")));
});
test("every world has a palette of seven colours", () => {
  for (const biome of [...Object.keys(ROCK_PALETTES), "unknown"]) for (const c of Object.values(rockPaletteOf(biome))) assert.match(c, /^#[0-9a-f]{6}$/i);
});
