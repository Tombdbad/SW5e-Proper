import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { piecesOf, setGunParts, type CreatureParts } from "../../client/src/components/Map/interiors/body";
import { GUN_DESIGNS, KIT, LENGTH, gunGeometry, kitGunOf } from "../../client/src/components/Map/interiors/weapons";
import { wantsOf, type Gear } from "../../client/src/components/Map/interiors/gear";
import { holdAt } from "../../client/src/components/Map/interiors/anchors";

// The blasters built as whole guns (2026-11-05; the user: weapon components assembled without floating parts, characters that hold them correctly, scopes of several zooms)
const dir = path.resolve(import.meta.dirname, "../../client/public/figures");
const piecesFrom = (name: string): Promise<CreatureParts> => {
  const buf = fs.readFileSync(path.join(dir, name));
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(piecesOf(g.scene)), reject));
};
const trianglesOf = (p: Record<number, THREE.BufferGeometry>) => Object.values(p).reduce((n, g) => n + g.index!.count / 3, 0);
const boxOf = (p: Record<number, THREE.BufferGeometry>) => { const b = new THREE.Box3(); for (const g of Object.values(p)) { g.computeBoundingBox(); b.union(g.boundingBox!); } return b; };
const GUNS = ["gun_pistol_a", "gun_pistol_b", "gun_carbine_a", "gun_carbine_b", "gun_rifle_a", "gun_rifle_b", "gun_sniper", "gun_heavy"];
const SCOPES = ["scope_2x", "scope_3x", "scope_4x", "scope_6x"];

// The pieces of a model (joined by shared vertices) and whether each touches the rest by its box: a kit's pieces sink into one another rather than share vertices
function floating(part: Record<number, THREE.BufferGeometry>): number[][] {
  const key = (v: number[]) => v.map((x) => Math.round(x * 1e4)).join(",");
  const ids = new Map<string, number>();
  const parent: number[] = [];
  const id = (v: number[]) => { const k = key(v); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k)!; };
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const points: number[][] = [];
  for (const g of Object.values(part)) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const index = g.index!;
    const of = Array.from({ length: pos.count }, (_, i) => { const v = [pos.getX(i), pos.getY(i), pos.getZ(i)]; points.push(v); return id(v); });
    for (let i = 0; i < index.count; i += 3) {
      const r = find(of[index.getX(i)]);
      parent[find(of[index.getX(i + 1)])] = r;
      parent[find(of[index.getX(i + 2)])] = r;
    }
  }
  const groups = new Map<number, number[][]>();
  for (const v of points) { const r = find(ids.get(key(v))!); (groups.get(r) ?? groups.set(r, []).get(r)!).push(v); }
  const boxes = [...groups.values()].map((vs) => ({ min: [0, 1, 2].map((c) => Math.min(...vs.map((v) => v[c]))), max: [0, 1, 2].map((c) => Math.max(...vs.map((v) => v[c]))), n: vs.length }));
  boxes.sort((a, b) => b.n - a.n);
  const gap = (a: (typeof boxes)[0], b: (typeof boxes)[0]) => Math.hypot(...[0, 1, 2].map((c) => (a.max[c] < b.min[c] ? b.min[c] - a.max[c] : b.max[c] < a.min[c] ? a.min[c] - b.max[c] : 0)));
  const joined = [boxes[0]];
  const left = new Set(boxes.slice(1));
  for (let again = true; again;) {
    again = false;
    for (const p of [...left]) if (joined.some((q) => gap(p, q) < 0.0005)) { joined.push(p); left.delete(p); again = true; }
  }
  return [...left].map((b) => [...b.min, ...b.max]);
}

test("weapons.glb has eight guns and four scopes, each with its regions, its occlusion and a budget; the file for a phone has fewer triangles", async () => {
  const hi = await piecesFrom("weapons.glb");
  const lo = await piecesFrom("weapons.lo.glb");
  for (const n of GUNS) {
    assert.ok(hi[n] && lo[n], `${n} is in both files`);
    for (const g of Object.values(hi[n].part)) assert.ok((g.attributes.ao.array as Float32Array).every((v) => v > 0 && v <= 1.0001), `${n} occlusion`);
    assert.ok(trianglesOf(hi[n].part) < 3300, `${n}: ${trianglesOf(hi[n].part)} triangles`);
    assert.ok(trianglesOf(lo[n].part) < trianglesOf(hi[n].part) * 0.45 && trianglesOf(lo[n].part) < 700, `${n} for a phone: ${trianglesOf(lo[n].part)}`);
    assert.ok(Object.keys(hi[n].part).length >= 3, `${n} has frame, polymer and steel`);
  }
  for (const n of SCOPES) {
    assert.ok(hi[n] && lo[n], `${n}`);
    assert.ok(trianglesOf(hi[n].part) < 800 && Object.keys(hi[n].part).length >= 4, `${n}: body, rings, turrets and lenses`);
  }
  // (a bigger scope is longer)
  const len = (n: string) => { const b = boxOf(hi[n].part); return b.max.z - b.min.z; };
  assert.ok(len("scope_2x") < len("scope_3x") && len("scope_3x") < len("scope_4x") && len("scope_4x") < len("scope_6x"), "longer for more zoom");
});

test("every gun is one assembled thing: no piece floats clear of the rest (they sink into one another), and the same for the scopes", async () => {
  const hi = await piecesFrom("weapons.glb");
  const lo = await piecesFrom("weapons.lo.glb");
  for (const file of [hi, lo]) for (const n of [...GUNS, ...SCOPES]) assert.deepEqual(floating(file[n].part), [], `${n} has a piece in the air`);
});

test("the sockets of each gun lie where a hand and a scope need them: the grip under the receiver, the muzzle at the front, the rail on top, the foregrip ahead of the grip", () => {
  for (const n of GUNS) {
    const k = KIT[n];
    assert.ok(k, n);
    const { grip, muzzle, rail, off_hand: off, eye } = k.sockets;
    const [x0, y0, z0, x1, y1, z1] = k.box;
    for (const [name, p] of Object.entries(k.sockets)) assert.ok(p[0] >= x0 - 1e-3 && p[0] <= x1 + 1e-3 && p[1] >= y0 - 0.12 && p[1] <= y1 + 0.12 && p[2] >= z0 - 0.12 && p[2] <= z1 + 0.12, `${n} ${name} ${p} in or by the box`);
    assert.ok(Math.abs(muzzle[2] - z1) < 0.03, `${n}: the muzzle is at the front (${muzzle[2]} of ${z1})`);
    assert.ok(grip[1] < rail[1] - 0.05, `${n}: the grip is under the rail`);
    assert.ok(grip[2] < muzzle[2] - 0.08, `${n}: the grip is behind the muzzle`);
    assert.ok(eye[2] < rail[2] && eye[1] > rail[1], `${n}: the eye is behind and above the rail`);
    assert.equal(grip[0], 0);
    // (a two-handed gun's foregrip is ahead of its grip, under the barrel; a pistol's is the grip's own)
    if (!/pistol/.test(n)) assert.ok(off[2] > grip[2] + 0.08 && off[1] < rail[1], `${n}: the foregrip ahead of the grip`);
    else assert.deepEqual(off, grip);
  }
  for (const n of SCOPES) {
    const k = KIT[n];
    assert.ok(k.zoom && k.sockets.mount && k.sockets.eye, n);
    // the mount is the underside and the eye behind the tube
    assert.ok(Math.abs(k.sockets.mount[1] - k.box[1]) < 0.002, `${n}: the mount is on the underside`);
    assert.ok(k.sockets.eye[2] < k.box[2] + 0.04, `${n}: the eye is at the back`);
  }
  assert.deepEqual(SCOPES.map((n) => KIT[n].zoom), [2, 3, 4, 6]);
});

test("a blaster takes the design its name picks, the same each time, at the length of its kind; a sniper rifle and a repeater have their own, a launcher keeps the kit's", () => {
  const pick = (name: string) => kitGunOf(name);
  assert.ok(GUN_DESIGNS.pistol!.includes(pick("Blaster pistol")!.design));
  assert.ok(GUN_DESIGNS.carbine!.includes(pick("Blaster carbine")!.design));
  assert.ok(GUN_DESIGNS.rifle!.includes(pick("Blaster rifle")!.design));
  assert.equal(pick("Sniper rifle")!.design, "gun_sniper");
  assert.equal(pick("Disruptor sniper")!.design, "gun_sniper");
  assert.equal(pick("Heavy repeater")!.design, "gun_heavy");
  assert.equal(pick("Grenade launcher"), undefined);
  assert.equal(pick("Vibroblade"), undefined);
  assert.equal(pick("Blaster rifle")!.design, pick("Blaster rifle")!.design);
  // (the length it is held at: the box times the scale is the length of its kind)
  for (const [name, kind] of [["Blaster pistol", "pistol"], ["Blaster carbine", "carbine"], ["Blaster rifle", "rifle"], ["Heavy repeater", "heavy"]] as const) {
    const g = pick(name)!;
    const box = KIT[g.design].box;
    assert.ok(Math.abs((box[5] - box[2]) * g.scale - LENGTH[kind]) < 1e-6, `${name} is ${LENGTH[kind]} long`);
  }
  assert.ok(Math.abs((KIT.gun_sniper.box[5] - KIT.gun_sniper.box[2]) * pick("Sniper rifle")!.scale - 0.7) < 1e-6);
});

test("a person holding a blaster closes the right hand exactly on the grip and the left under the handguard; a scope fitted shows on the rail, a sniper rifle has its own", () => {
  const gear = (weapon: string, extra: Partial<Gear> = {}): Gear => ({ weapons: [{ name: weapon, equipmentCategory: "Weapon", weaponClassification: "MartialBlaster" }], carried: [], ...extra });
  const want = (g: Gear) => wantsOf("rifle", g).find((w) => w.slot === "weapon")!;
  const rifle = want(gear("Blaster rifle"));
  assert.ok(rifle.model.startsWith("kit:gun_rifle"), rifle.model);
  const design = rifle.model.slice(4);
  assert.deepEqual(rifle.grip, KIT[design].sockets.grip);
  assert.deepEqual(rifle.offHand, KIT[design].sockets.off_hand);
  assert.equal(rifle.optic, undefined, "no scope fitted, none drawn");
  assert.equal(want(gear("Blaster rifle", { optic: 3 })).optic, 3);
  assert.equal(want(gear("Sniper rifle")).optic, 4, "a sniper rifle's own");
  assert.equal(want(gear("Sniper rifle", { optic: 6 })).optic, 6, "a better one fitted wins");
  // (the hand on the grip: where the grip socket ends up in the figure's frame is where the hand is)
  const hand: [number, number, number] = [-0.11, 0.27, 0.2];
  const placed = holdAt(hand, [0.1, -0.05, 1], KIT[design].box[5] - KIT[design].box[2], rifle.scale, 0.3, rifle.grip);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...placed.rot));
  const at = new THREE.Vector3(...(rifle.grip as [number, number, number])).multiplyScalar(rifle.scale).applyQuaternion(q).add(new THREE.Vector3(...placed.at));
  assert.ok(at.distanceTo(new THREE.Vector3(...hand)) < 1e-6, `the grip lands in the hand: ${at.toArray()}`);
});

test("a gun's geometry has colours, how each vertex is drawn, and its scope sitting on the rail", async () => {
  setGunParts(await piecesFrom("weapons.glb"));
  const parts = await piecesFrom("weapons.glb");
  const bare = gunGeometry(parts, "gun_rifle_a")!;
  assert.ok(bare.attributes.color && bare.attributes.mark && bare.attributes.normal, "colour, mark and normal");
  const marks = new Set(Array.from({ length: bare.attributes.mark.count }, (_, i) => (bare.attributes.mark as THREE.BufferAttribute).getX(i)));
  assert.ok(marks.has(0) && marks.has(1), "metal and polymer");
  assert.equal(gunGeometry(parts, "gun_nothing"), null);
  const rail = KIT.gun_rifle_a.sockets.rail;
  for (const zoom of [2, 3, 4, 6]) {
    const scoped = gunGeometry(parts, "gun_rifle_a", zoom)!;
    assert.ok(scoped.attributes.position.count > bare.attributes.position.count, `${zoom}x adds a scope`);
    const b = scoped.boundingBox!;
    assert.ok(b.max.y > bare.boundingBox!.max.y + 0.01, `the scope stands above the gun (${b.max.y})`);
    // (the scope's underside is on the rail: its lowest vertices are the rail's height)
    let low = 1e9;
    const pos = scoped.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > rail[1] - 0.004) low = Math.min(low, pos.getY(i));
    assert.ok(Math.abs(low - rail[1]) < 0.006, `the scope sits on the rail: ${low} against ${rail[1]}`);
  }
  assert.equal(gunGeometry(parts, "gun_rifle_a", 5)!.attributes.position.count, gunGeometry(parts, "gun_rifle_a", 4)!.attributes.position.count, "a zoom between takes the nearer model");
  setGunParts(null);
});
