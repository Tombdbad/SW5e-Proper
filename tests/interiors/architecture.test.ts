import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { familyOf, crownOf, portalOf, MIN_CROWN_SIDE, rampPlan, treeCorner, gantryPlan, storeyPlan, parapetPlan, bayAt, baysFor, bayFit, BAY, ARC, RAMP_SEG, HEADROOM, ARCH_STOREY, type Family } from "../../client/src/components/Map/interiors/architecture";
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
    assert.ok(Number(region) >= 0 && Number(region) <= 6, `${name} region ${region}`);
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

// Round rooms in bays, gantries, gates and ramps (2026-11-05): an opening, a gate or a ramp's way onto a floor is cut through, never blocked
const deg = (a: number) => Math.round((a * 180) / Math.PI * 100) / 100;
test("a storey of bays has a door bay and its frame wherever a way in is, and windows between", () => {
  const s = storeyPlan([Math.PI / 2, 0]);
  assert.equal(s.filter((p) => /_bay/.test(p.piece)).length, 16);
  assert.deepEqual(s.filter((p) => p.piece === "drum_bay_door_r4").map((p) => deg(p.angle)).sort((a, b) => a - b), [0, 90]);
  assert.equal(s.filter((p) => p.piece === "portal_curved_r4").length, 2, "each doorway framed");
  assert.ok(storeyPlan([0], 0, "adobe").some((p) => p.piece === "adobe_bay_door_r4") && storeyPlan([0], 0, "adobe").some((p) => p.piece === "portal_adobe_curved_r4"));
});

test("a ramp under a gantry meets its deck at an arc's edge, and every arc a figure on the ramp would not clear is cut away, the drop closed by a rail", () => {
  const ramp = { top: (337.5 * Math.PI) / 180, dir: 1 as const };
  const run = rampPlan(ramp);
  assert.equal(run.length, 6);
  assert.ok(Math.abs(run[5].y + ARCH_STOREY / 6 - ARCH_STOREY) < 1e-9, "the top reaches the deck");
  const g = gantryPlan([0, Math.PI], [ramp]);
  const arcs = g.filter((p) => /gantry_arc/.test(p.piece));
  // no deck over a segment that does not clear it (the deck's underside is 0.32 below its top)
  for (const seg of run) {
    const over = arcs.some((a) => Math.abs(((seg.angle - a.angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < ARC / 2);
    if (over) assert.ok(ARCH_STOREY - 0.32 - (seg.y + ARCH_STOREY / 6) >= HEADROOM, `deck over a segment at ${deg(seg.angle)}`);
  }
  // the arc beyond the ramp's top stands (the ramp comes onto it with nothing across), the gates are gate arcs, and the other end of the gap has a rail
  assert.ok(arcs.some((a) => deg(a.angle) === 0 && a.piece === "gantry_arc_gate_r4"));
  assert.ok(arcs.some((a) => deg(a.angle) === 180 && a.piece === "gantry_arc_gate_r4"));
  assert.equal(g.filter((p) => p.piece === "gantry_end_r4").length, 1);
  assert.ok(!g.some((p) => p.piece === "gantry_end_r4" && Math.abs(deg(p.angle) - 22.5 - 337.5) < 1), "no rail across the ramp's top");
  // the same ramp the other way round is the piece mirrored
  assert.ok(rampPlan({ top: 1, dir: -1 }).every((p) => p.mirror));
  // a gantry a storey above the ramp's top loses nothing
  assert.equal(gantryPlan([], [ramp], 2 * ARCH_STOREY).filter((p) => /gantry_arc/.test(p.piece)).length, 8);
});

test("a stone ramp round an adobe drum lies along whole bays and cuts the parapet of the one bay it comes up through", () => {
  const ramp = { top: (100 * Math.PI) / 180, dir: 1 as const, piece: "ramp_stone_arc_r4" };
  const run = rampPlan(ramp);
  for (const seg of run) assert.ok(Math.abs(seg.angle / BAY - Math.round(seg.angle / BAY)) < 1e-9, "a segment on a bay");
  assert.ok(Math.abs(RAMP_SEG - BAY) < 1e-12);
  const lips = parapetPlan([ramp]);
  assert.equal(lips.length, 15);
  assert.ok(!lips.some((l) => bayAt(l.angle) === bayAt(run[5].angle)), "the lip over the ramp's top is gone");
});

// In the game (2026-11-05): a round room about the kit's size is built of its bays (models.tsx KitRoomBlock, drumPlan), ways in cut through the first storey
test("a round room's bays: a door bay and frame at each way in on the ground storey only, a window bay where the plan has a window, every piece in the file", async () => {
  const { drumPlan } = await import("../../client/src/components/Map/models");
  const plan = drumPlan({ doors: [Math.PI / 2], windows: [0], adobe: false, storeys: 2 });
  assert.equal(plan.filter((p) => /_bay/.test(p.piece)).length, 32, "sixteen bays a storey");
  assert.deepEqual(plan.filter((p) => p.piece === "drum_bay_door_r4").map((p) => [deg(p.angle), p.y]), [[90, 0]], "the door on the ground storey");
  assert.ok(plan.filter((p) => bayAt(p.angle) === 0 && /_bay/.test(p.piece)).every((p) => p.piece === "drum_bay_r4"), "a bay with a window where the plan's window is");
  const adobe = drumPlan({ doors: [0], windows: [], adobe: true, storeys: 1 });
  assert.ok(adobe.some((p) => p.piece === "adobe_bay_door_r4") && adobe.some((p) => p.piece === "portal_adobe_curved_r4"));
  for (const p of [...plan, ...adobe]) assert.ok(parts[p.piece], `${p.piece} is in architecture.glb`);
});

test("drums of any radius (2026-11-06): as many bays as keep each about the kit's width, a multiple of four, the wall and the doors not thickened", () => {
  assert.equal(baysFor(4), 16, "the kit's own radius, its sixteen bays");
  assert.equal(bayFit(4).across, 1);
  assert.equal(bayFit(4).out, 0);
  for (const r of [2.5, 3, 3.5, 4.5, 5, 6, 8, 12]) {
    const n = baysFor(r);
    assert.equal(n % 4, 0, `${r}: ${n} bays`);
    const width = (2 * Math.PI * r) / n;
    assert.ok(width >= 1.35 && width <= 2, `${r}: bays ${width.toFixed(2)} wide`);
    const f = bayFit(r, n);
    assert.equal(f.out, r - 4, "moved out to the radius, not scaled");
    assert.ok(r < 3 ? f.across < 1.3 : Math.abs(f.across - 1) < 0.125, `${r}: a door ${f.across.toFixed(2)} of the kit's width`);
    // a door at each of the four sides, in its own bay
    const s = storeyPlan([0, Math.PI / 2, Math.PI, -Math.PI / 2], 0, "drum", "alternate", n);
    assert.equal(s.filter((p) => p.piece === "drum_bay_door_r4").length, 4);
    assert.equal(s.filter((p) => /^drum_bay/.test(p.piece)).length, n);
  }
});

// The great tree of a hut keeps clear of the stairwell and the bridges beside it (2026-11-06, the user: "the tree with the foliage drawn INSIDE")
test("a hut's great tree takes the corner farthest from what stands round the hut, the seed's own when nothing does", () => {
  // nothing round it: the seed's corner, however many seeds
  for (let seed = 0; seed < 8; seed++) assert.equal(treeCorner(10, 8, seed).corner, seed % 4);
  // a stairwell against the north side at the east end: the tree is not at either north corner of that end
  const clear = [{ x0: 7, y0: -6, x1: 9, y1: 0 }];
  for (let seed = 0; seed < 8; seed++) {
    const { corner, room } = treeCorner(10, 8, seed, clear);
    assert.ok(corner >= 2, `seed ${seed}: corner ${corner}`);
    assert.ok(room >= 6, `seed ${seed}: room ${room}`);
  }
  // neighbours on three sides leave the one corner free; it is taken whatever the seed, and its room is how far the nearest is
  const walled = [{ x0: -9, y0: 4, x1: 0, y1: 8 }, { x0: 0, y0: -3, x1: 10, y1: 0 }, { x0: 10, y0: 1, x1: 12, y1: 5 }];
  for (let seed = 0; seed < 4; seed++) assert.equal(treeCorner(10, 8, seed, walled).corner, 3);
});
