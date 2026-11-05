import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { familyOf, crownOf, portalOf, MIN_CROWN_SIDE, type Family } from "../../client/src/components/Map/interiors/architecture";
import { piecesOf } from "../../client/src/components/Map/interiors/body";
import { ROOT } from "../helpers";

// The architecture kit of the local map (2026-11-05; tools/blender/build-architecture.py, figures/architecture.glb)
const FAMILIES: Family[] = ["adobe", "domed", "deco", "polar", "timber", "hull", "bunker"];
const file = fs.readFileSync(path.join(ROOT, "client/public/figures/architecture.glb"));
const parts = await new Promise<ReturnType<typeof piecesOf>>((resolve, reject) =>
  new GLTFLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));

test("each world builds its own family, and a building of rank in the desert is a domed hall", () => {
  assert.equal(familyOf("desert", "cantina"), "adobe");
  assert.equal(familyOf("desert", "palace"), "domed");
  assert.equal(familyOf("temperate", "market"), "domed");
  assert.equal(familyOf("urban", "tenements"), "deco");
  assert.equal(familyOf("ice", "workshop"), "polar");
  for (const b of ["forest", "jungle", "swamp"]) assert.equal(familyOf(b, "residences"), "timber");
  for (const b of ["ocean", "gas giant", "station"]) assert.equal(familyOf(b, "residences"), "hull");
  assert.equal(familyOf("anywhere", "starship"), "hull");
  for (const b of ["volcanic", "barren"]) assert.equal(familyOf(b, "garrison"), "bunker");
  assert.equal(new Set(["desert", "temperate", "urban", "ice", "forest", "ocean", "volcanic"].map((b) => familyOf(b, "market"))).size, 7, "seven worlds, seven looks");
});

test("every piece the tables name is in the file, a way in has an opening a door fits, and every vertex has a region and occlusion", () => {
  for (const f of FAMILIES) {
    assert.ok(parts[portalOf(f)], `portal of ${f}`);
    for (let n = 0; n < 3; n++) { const c = crownOf(f, n, 4); if (c) assert.ok(parts[c.piece], `crown ${c.piece}`); }
  }
  for (const name of ["portal_adobe", "portal_domed", "portal_deco", "portal_polar", "portal_hull"]) {
    const box = new THREE.Box3();
    for (const g of Object.values(parts[name].part)) { g.computeBoundingBox(); box.union(g.boundingBox!); }
    // the way in (1.0 x 1.42, the door's) stands clear: the frame is wider and taller than it is, and its sill is on the ground
    assert.ok(box.max.x - box.min.x > 1.3 && box.max.y > 1.6, `${name} is a frame round the door`);
    assert.ok(Math.abs(box.min.y) < 0.06, `${name} stands on the ground`);
    // (nothing of it in the opening: the straight part of the way in, between the sill and the springing of its arch, is clear)
    for (const g of Object.values(parts[name].part)) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) assert.ok(!(Math.abs(p.getX(i)) < 0.45 && p.getY(i) > 0.12 && p.getY(i) < 0.9 && p.getZ(i) > -0.28 && p.getZ(i) < 0.01), `${name} blocks the way at vertex ${i}`);
    }
  }
  for (const [name, piece] of Object.entries(parts)) for (const [region, g] of Object.entries(piece.part)) {
    assert.ok(Number(region) >= 0 && Number(region) <= 4, `${name} region ${region}`);
    assert.ok(g.attributes.ao, `${name} has occlusion`);
  }
});

test("a room too small keeps the old roof, and a family's crowns are told apart by the room's number", () => {
  assert.equal(crownOf("domed", 0, MIN_CROWN_SIDE - 1), null);
  assert.ok(crownOf("domed", 0, 5));
  const names = new Set([0, 1, 2].map((n) => crownOf("domed", n, 5)?.piece));
  assert.ok(names.size >= 2, "a domed roof has a dome and a minaret");
  assert.ok(crownOf("domed", -7, 5), "a negative number is a room too");
});
