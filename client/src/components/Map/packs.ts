// The Megascans packs of the biomes, loaded once and shared (public/megascans/<biome pack>.glb): moved out of terrain.tsx (2026-11-11) so that the site library (siteAssets.tsx)
// can stand a biome's rocks too without importing the ground.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ECOLOGY } from "@shared/logic";

// The Megascans pack of a biome (public/megascans/<pack>.glb, tools/blender/build-megascans-pack.py): pieces named <piece>__<variant>. The files are NOT in the
// repository (the Fab Standard License, a public repo): where they are missing the loader fails quietly and the kit and the cones are what is drawn. Loaded once
// a pack, shared; null while loading or when there is none.
// How much bigger than life the pack's pieces are stood (the user, 2026-11-11: they read too small beside the figures and buildings, "at least 100%"): a fern 2.8 m across, a boulder 2.5 m
export { PACK_SCALE } from "@shared/logic";
export interface PackPiece { geometry: THREE.BufferGeometry; material: THREE.Material }
export type MegaPack = Map<string, PackPiece>;
const PACKS = new Map<string, Promise<MegaPack | null>>();
function loadPack(name: string): Promise<MegaPack | null> {
  let p = PACKS.get(name);
  if (!p) {
    p = new Promise((done) => {
      new GLTFLoader().load(
        `/megascans/${name}.glb`,
        (g) => {
          const pack: MegaPack = new Map();
          const lifted = new Set<THREE.Material>();
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && m.name) {
              const mat = m.material as THREE.MeshStandardMaterial;
              // (a scan's albedo is a real leaf's or rock's, dark: the sun of the scan's own scenes is stronger than ours: lifted, as the leaf textures are, surfaces.tsx)
              if (!lifted.has(mat)) {
                lifted.add(mat);
                mat.color.multiplyScalar(mat.alphaTest > 0 ? 3 : 1.5);
              }
              pack.set(m.name, { geometry: m.geometry, material: mat });
            }
          });
          done(pack);
        },
        undefined,
        () => done(null),
      );
    });
    PACKS.set(name, p);
  }
  return p;
}
export function useMegascans(biome: string): MegaPack | null {
  const name = ECOLOGY[biome]?.pack;
  const [pack, setPack] = useState<MegaPack | null>(null);
  useEffect(() => {
    let live = true;
    setPack(null);
    if (name) loadPack(name).then((p) => live && setPack(p));
    return () => { live = false; };
  }, [name]);
  return pack;
}


// A pack by its file's name (doors.glb: tools/blender/build-megascans-doors.py); null while loading or where the file is not there. Its materials are as the scan has them.
export function usePackNamed(name: string): MegaPack | null {
  const [pack, setPack] = useState<MegaPack | null>(null);
  useEffect(() => {
    let live = true;
    loadPack(name).then((p) => live && setPack(p));
    return () => { live = false; };
  }, [name]);
  return pack;
}
