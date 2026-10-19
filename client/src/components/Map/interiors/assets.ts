// Loading the converted models (client/public/assets, made by tools/convert-assets.mjs): one geometry each, in
// floats (the files are quantised), with vertex colours and normals, set on its anchor. A file is fetched once
// and kept; one that cannot be had gives null and the caller draws what it builds in code.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
export function loadModel(url: string, anchor: Anchor = "centre"): Promise<THREE.BufferGeometry | null> {
  const key = `${anchor}:${url}`;
  let found = FILES.get(key);
  if (!found) {
    found = new GLTFLoader().loadAsync(url).then((gltf) => geometryOf(gltf.scene, anchor)).catch(() => null);
    FILES.set(key, found);
  }
  return found;
}

// Several models at once: null for a name until it is in, and for good if it could not be had
export function useModels(urls: string[], anchor: Anchor = "centre"): Record<string, THREE.BufferGeometry | null> {
  const [got, setGot] = useState<Record<string, THREE.BufferGeometry | null>>({});
  const wanted = urls.join("|");
  useEffect(() => {
    let live = true;
    for (const url of urls) loadModel(url, anchor).then((g) => live && setGot((was) => (was[url] === g ? was : { ...was, [url]: g })));
    return () => { live = false; };
  }, [wanted, anchor]);
  return got;
}
