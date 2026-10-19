// Shared by the module tests: what to load and how to measure a model without a browser
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, type Baked } from "../client/src/components/Map/models";

export const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "..");
export const ASSETS = path.join(ROOT, "client/public/assets");

// The weapons of the rules data
export const weaponsOf = (): { name: string; weaponClassification: string }[] =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "shared/data/sw5e/equipment.json"), "utf8")).filter((e: { equipmentCategory: string }) => e.equipmentCategory === "Weapon");

// A model file as the geometry of all its meshes, in the file's units (positions turned to floats, as the loader does)
export function loadGlb(file: string): Promise<THREE.BufferGeometry> {
  const data = fs.readFileSync(file);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Promise((resolve, reject) =>
    new GLTFLoader().parse(buffer as ArrayBuffer, "", (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry.clone();
        for (const name of Object.keys(geo.attributes)) {
          const a = geo.attributes[name] as THREE.BufferAttribute;
          const f = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = [a.getX, a.getY, a.getZ, a.getW][c].call(a, i);
          geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
        }
        geo.applyMatrix4(mesh.matrixWorld);
        parts.push(geo);
      });
      if (!parts.length) return reject(new Error("no meshes"));
      resolve(parts.length === 1 ? parts[0] : mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false));
    }, reject),
  );
}

export const trianglesOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
export const baked = (draw: (k: Kit) => void): Baked => {
  const k = new Kit();
  draw(k);
  return k.bake();
};
export const trianglesOfBaked = (b: Baked) => Object.values(b).reduce((n, g) => n + (g ? trianglesOf(g) : 0), 0);
export const boxOf = (b: Baked) => {
  const box = new THREE.Box3();
  for (const g of Object.values(b)) if (g) box.union(g.boundingBox ?? new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute));
  return box;
};
export const sizeOf = (b: Baked) => boxOf(b).getSize(new THREE.Vector3());
