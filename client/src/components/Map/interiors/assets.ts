// Loading the converted models (client/public/assets, made by tools/convert-assets.mjs): one geometry each, in
// floats (the files are quantised), with vertex colours and normals, set on its anchor. A file is fetched once
// and kept; one that cannot be had gives null and the caller draws what it builds in code.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { retone, type Tone } from "./tones";

// What a vertex of an item model (tools/build-item-assets.mjs) says in its `_MARK` attribute: [finish, part]. The finish is how that
// part is drawn (metal shines, an emissive material glows); the part says which named piece of the model it belongs to (a saber's blade,
// a bow's limb), whose pivots the catalogue (itemModels.json) keeps
export const FINISH_OF_MARK = ["sheen", "matte", "glow", "cloth"] as const;
export type MarkFinish = (typeof FINISH_OF_MARK)[number];

// Where the model's origin goes: its middle (a weapon on a peg), the middle of its underside (a crate on a floor)
export type Anchor = "centre" | "base";

// Quantised attributes are small integers that the file's node scale turns back to units. Read them out as floats
function floats(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(a.count * a.itemSize);
  const read = [a.getX, a.getY, a.getZ, a.getW];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = read[c].call(a, i);
  return new THREE.BufferAttribute(out, a.itemSize);
}

export function geometryOf(scene: THREE.Object3D, anchor: Anchor): THREE.BufferGeometry | null {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", floats(src.attributes.position));
    if (src.attributes.normal) geo.setAttribute("normal", floats(src.attributes.normal));
    geo.setAttribute("color", src.attributes.color ? floats(src.attributes.color) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 3).fill(0.6), 3));
    // Colours come as RGB or RGBA
    if (geo.attributes.color.itemSize === 4) {
      const rgba = geo.attributes.color;
      const rgb = new Float32Array(rgba.count * 3);
      for (let i = 0; i < rgba.count; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = rgba.array[i * 4 + c];
      geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    }
    // Item models say per vertex how they are drawn and which part they belong to; kept as `mark` (finish, part)
    if (src.attributes._mark) geo.setAttribute("mark", floats(src.attributes._mark));
    if (src.index) geo.setIndex(Array.from(src.index.array));
    geo.applyMatrix4(mesh.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    parts.push(flat);
  });
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const c = box.getCenter(new THREE.Vector3());
  merged.translate(-c.x, anchor === "base" ? -box.min.y : -c.y, -c.z);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const FILES = new Map<string, Promise<THREE.BufferGeometry | null>>();
// With a tone the model comes in that palette (see tones.ts): made once per tone from the file as it was converted
export function loadModel(url: string, anchor: Anchor = "centre", tone?: Tone): Promise<THREE.BufferGeometry | null> {
  const key = `${anchor}:${url}`;
  let found = FILES.get(key);
  if (!found) {
    found = new GLTFLoader().loadAsync(url).then((gltf) => geometryOf(gltf.scene, anchor)).catch(() => null);
    FILES.set(key, found);
  }
  if (!tone) return found;
  const toneKey = `${tone.id}|${key}`;
  let colored = FILES.get(toneKey);
  if (!colored) {
    colored = found.then((g) => (g ? retone(g, tone) : null));
    FILES.set(toneKey, colored);
  }
  return colored;
}

// Several models at once: null for a name until it is in, and for good if it could not be had
export function useModels(urls: string[], anchor: Anchor = "centre", tone?: Tone): Record<string, THREE.BufferGeometry | null> {
  const [got, setGot] = useState<Record<string, THREE.BufferGeometry | null>>({});
  const wanted = urls.join("|");
  useEffect(() => {
    let live = true;
    for (const url of urls) loadModel(url, anchor, tone).then((g) => live && setGot((was) => (was[url] === g ? was : { ...was, [url]: g })));
    return () => { live = false; };
  }, [wanted, anchor, tone?.id]);
  return got;
}

// A model split by how it is drawn: the triangles of each finish as a geometry of their own (position, normal, colour), for the Kit
// to draw as matte, sheen, glow or cloth. A model with no marks is one group in `fallback`. Works on the non-indexed geometry that
// geometryOf makes (three vertices to a triangle; a triangle takes the finish of its first vertex).
export function splitByFinish(source: THREE.BufferGeometry, fallback: MarkFinish = "sheen"): { finish: MarkFinish; geo: THREE.BufferGeometry }[] {
  const mark = source.getAttribute("mark");
  if (!mark) return [{ finish: fallback, geo: source }];
  const count = source.getAttribute("position").count;
  const by = new Map<number, number[]>();
  for (let t = 0; t + 2 < count; t += 3) {
    const f = Math.round(mark.getX(t));
    if (!by.has(f)) by.set(f, []);
    by.get(f)!.push(t);
  }
  const names = ["position", "normal", "color"].filter((n) => source.getAttribute(n));
  const out: { finish: MarkFinish; geo: THREE.BufferGeometry }[] = [];
  for (const [f, triangles] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const geo = new THREE.BufferGeometry();
    for (const name of names) {
      const a = source.getAttribute(name);
      const arr = new Float32Array(triangles.length * 3 * a.itemSize);
      triangles.forEach((t, i) => {
        for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(i * 3 + v) * a.itemSize + c] = [a.getX, a.getY, a.getZ, a.getW][c].call(a, t + v);
      });
      geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    out.push({ finish: FINISH_OF_MARK[f] ?? fallback, geo });
  }
  return out;
}

// The part (0 up) of every vertex of an item model: for dropping or moving one named part (the blade of a saber hilt)
export const partOf = (geometry: THREE.BufferGeometry, vertex: number): number => Math.round(geometry.getAttribute("mark")?.getY(vertex) ?? 0);
