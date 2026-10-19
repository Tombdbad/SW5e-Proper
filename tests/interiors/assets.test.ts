import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ASSETS, ROOT, loadGlb, trianglesOf } from "../helpers";
import { BLASTER_FILES, KENNEY_BLASTER, LAUNCHER_FILE, MELEE_FILES } from "../../client/src/components/Map/interiors/weapons";
import { KITBASH, KIT_MODELS } from "../../client/src/components/Map/interiors/kitbash";
import { MODELS, OUT } from "../../tools/kitbash-recipes.mjs";

const dirs = fs.readdirSync(ASSETS).filter((d) => fs.statSync(path.join(ASSETS, d)).isDirectory());
const size = (dir: string) => fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);

test("the downloaded assets stay inside the budget (10 MB for everything, 2 MB for a pack)", () => {
  const total = dirs.reduce((n, d) => n + size(path.join(ASSETS, d)), 0);
  assert.ok(total < 10 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB in all`);
  for (const d of dirs) assert.ok(size(path.join(ASSETS, d)) < 2 * 1024 * 1024, `${d} is ${(size(path.join(ASSETS, d)) / 1048576).toFixed(1)} MB`);
});
test("every pack has its licence beside it, and the credits name it", () => {
  const credits = fs.readFileSync(path.join(ROOT, "CREDITS.md"), "utf8");
  for (const d of dirs) {
    assert.ok(fs.existsSync(path.join(ASSETS, d, "License.txt")), `${d} has no License.txt`);
    assert.match(fs.readFileSync(path.join(ASSETS, d, "License.txt"), "utf8"), /CC0|Creative Commons Zero/);
    assert.ok(credits.includes(d), `CREDITS.md does not name ${d}`);
  }
});
test("every model of the catalogue exists in both detail levels, with the right length", async () => {
  for (const [kind, list] of Object.entries(BLASTER_FILES)) for (const d of list) {
    const hero = path.join(ROOT, "client/public", KENNEY_BLASTER, `${d.file}.glb`);
    const low = path.join(ROOT, "client/public", KENNEY_BLASTER, `${d.file}.lod.glb`);
    assert.ok(fs.existsSync(hero) && fs.existsSync(low), `${d.file}`);
    const g = await loadGlb(hero);
    g.computeBoundingBox();
    const z = g.boundingBox!.max.z - g.boundingBox!.min.z;
    assert.ok(Math.abs(z - d.length) / d.length < 0.1, `${kind} ${d.file}: the file is ${z.toFixed(2)} long, the catalogue says ${d.length}`);
    const [t1, t2] = [trianglesOf(g), trianglesOf(await loadGlb(low))];
    assert.ok(t1 <= 900, `${d.file} hero ${t1}`);
    assert.ok(t2 <= 200 && t2 < t1, `${d.file} low ${t2} of ${t1}`);
  }
});
test("models are vertex-coloured with no textures (they are drawn with the map's own materials)", async () => {
  for (const d of dirs) for (const f of fs.readdirSync(path.join(ASSETS, d)).filter((f) => f.endsWith(".glb")).slice(0, 6)) {
    const g = await loadGlb(path.join(ASSETS, d, f));
    assert.ok(g.attributes.color, `${d}/${f} has colours`);
    assert.ok(g.attributes.position, `${d}/${f} has positions`);
    // The low detail has no normals (the loader works them out); the hero has
    if (!f.endsWith(".lod.glb")) assert.ok(g.attributes.normal, `${d}/${f} has normals`);
    const json = JSON.parse(fs.readFileSync(path.join(ASSETS, d, f)).subarray(20, 20 + fs.readFileSync(path.join(ASSETS, d, f)).readUInt32LE(12)).toString("utf8"));
    assert.ok(!json.images && !json.textures, `${d}/${f} carries a texture`);
  }
});

test("every model built from pieces of the kits is listed, has both detail levels, and the melee weapons are the length the catalogue says", async () => {
  assert.equal(OUT, `client/public${KITBASH}`);
  assert.deepEqual(Object.keys(MODELS).sort(), Object.keys(KIT_MODELS).sort(), "the recipes and the catalogue list the same models");
  for (const name of Object.keys(KIT_MODELS)) {
    const [hero, low] = [path.join(ROOT, OUT, `${name}.glb`), path.join(ROOT, OUT, `${name}.lod.glb`)];
    assert.ok(fs.existsSync(hero) && fs.existsSync(low), name);
    const [t1, t2] = [trianglesOf(await loadGlb(hero)), trianglesOf(await loadGlb(low))];
    assert.ok(t1 > 0 && t1 <= 900, `${name} hero ${t1}`);
    assert.ok(t2 <= t1 && t2 <= 400, `${name} low ${t2} of ${t1}`);
  }
  for (const d of [...Object.values(MELEE_FILES), LAUNCHER_FILE]) {
    const g = await loadGlb(path.join(ROOT, OUT, `${d!.file}.glb`));
    g.computeBoundingBox();
    const z = g.boundingBox!.max.z - g.boundingBox!.min.z;
    assert.ok(Math.abs(z - d!.length) / d!.length < 0.1, `${d!.file}: the file is ${z.toFixed(2)} long, the catalogue says ${d!.length}`);
  }
});
