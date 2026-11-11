// The trees and hedges built from Megascans parts (2026-11-11, the user: "our EXISTING trees (BOTH deciduous and coniferous) NEED to be REPLACED with lightweight trees from the
// megascans library", then "also our hedges and palatial broadleafs"): public/megascans/trees.glb, made by tools/blender/build-megascans-trees.py (a scanned trunk and limbs,
// the spruce and laurel atlases cut into cards). The file is NOT in the repository (the Fab Standard License, a public repo): where it is missing the loader fails quietly and
// the library's own trees (siteAssets.tsx `LIBRARY`) are what is drawn, as before.
// A piece is a few parts, each a mesh with one material, named <piece>__<A|B|C>__<bark|limb|needle|leaf>; the model is 1 unit a metre, standing on its foot.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ECOLOGY } from "@shared/logic";
import type { MegaPack } from "./packs";

export interface TreePart { geometry: THREE.BufferGeometry; material: THREE.Material }
export type TreePack = Map<string, TreePart[]>;
const LOADED: { p?: Promise<TreePack | null> } = {};
function loadTreePack(): Promise<TreePack | null> {
  LOADED.p ??= new Promise((done) => {
    new GLTFLoader().load(
      "/megascans/trees.glb",
      (g) => {
        const pack: TreePack = new Map();
        const lifted = new Set<THREE.Material>();
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.name) return;
          const mat = m.material as THREE.MeshStandardMaterial;
          // (a scan's albedo is a real leaf's or bark, dark: lifted as the other Megascans packs are, terrain.tsx `loadPack`; a card is lifted more than bark)
          if (!lifted.has(mat)) {
            lifted.add(mat);
            // (the laurel's leaves are darker than the spruce's needles: 0.08 against 0.15)
            mat.color.multiplyScalar(/laurel/.test(mat.name) ? 11 : mat.alphaTest > 0 ? 3.4 : 2.2);
            mat.roughness = 1; mat.metalness = 0;
          }
          const [piece, variant] = m.name.split("__");
          const key = piece + "__" + variant;
          (pack.get(key) ?? pack.set(key, []).get(key)!).push({ geometry: m.geometry, material: mat });
        });
        done(pack);
      },
      undefined,
      () => done(null),
    );
  });
  return LOADED.p;
}
// undefined while the file loads, null when there is none, else the pack
export function useTreePack(): TreePack | null | undefined {
  const [pack, setPack] = useState<TreePack | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    // (`?oldtrees=1` on a developer page: the library's own trees, to compare)
    if (typeof location !== "undefined" && /[?&]oldtrees\b/.test(location.search)) { setPack(null); return; }
    loadTreePack().then((p) => live && setPack(p));
    return () => { live = false; };
  }, []);
  return pack;
}

// Which library piece each model stands in for, and how tall that piece is (metres), the model being `HEIGHT` tall; `variant` forces one (the birch)
const HEIGHT = { conifer: 6.14, broadleaf: 5.6, hedge: 0.85, stump: 0.6, palm: 1.8, fern: 0.6, shrub: 0.95, topiary: 1.85, drytree: 2.5 };
export const TREE_SWAP: Record<string, { piece: keyof typeof HEIGHT; h: number; variant?: string }> = {
  stump: { piece: "stump", h: 0.45 },
  tree_palm: { piece: "palm", h: 1.8 }, fern: { piece: "fern", h: 0.6 }, shrub: { piece: "shrub", h: 0.85 }, topiary: { piece: "topiary", h: 1.85 }, tree_dry: { piece: "drytree", h: 1.9 },
  tree_conifer: { piece: "conifer", h: 3.1 }, tree_conifer_m: { piece: "conifer", h: 4.65 }, tree_conifer_l: { piece: "conifer", h: 6.5 }, tree_conifer_xl: { piece: "conifer", h: 9.8 },
  tree_pine: { piece: "conifer", h: 4.1 }, tree_pine_m: { piece: "conifer", h: 6.2 }, tree_pine_l: { piece: "conifer", h: 8.6 }, tree_pine_xl: { piece: "conifer", h: 12.5 },
  tree_broad: { piece: "broadleaf", h: 3.1 }, tree_broad_m: { piece: "broadleaf", h: 4.7 }, tree_broad_l: { piece: "broadleaf", h: 6.5 },
  tree_tall: { piece: "broadleaf", h: 5.2 }, tree_tall_m: { piece: "broadleaf", h: 7.3 }, tree_tall_l: { piece: "broadleaf", h: 9.9 },
  tree_birch: { piece: "broadleaf", h: 3.4, variant: "B" },
  hedge: { piece: "hedge", h: 0.85 },
};

// The crown of a tree village's great tree (siteAssets.tsx `GreatTree`: the kit's trunk and limbs stand there, tools/blender/build-architecture.py): in cards, in the kit's own
// units, the great tree's foot at the origin; `conifer` the needles of a great conifer, else the broadleaf's leaves. Null where the file lacks it (the kit's own crown is drawn then)
export function GreatCrown({ pack, conifer, variant }: { pack: TreePack; conifer: boolean; variant: string }) {
  return <GreatPiece pack={pack} name={conifer ? "greatneedles" : "greatcrown"} variant={variant} />;
}
export const hasGreatCrown = (pack: TreePack | null | undefined, conifer: boolean): pack is TreePack => hasGreat(pack, conifer ? "greatneedles" : "greatcrown");
// Any of the village pieces by name: `greatcrown`, `greatneedles`, `greattrunk` (the broadleaf great tree's trunk, limbs and roots), `greatconifer` (the conifer's trunk and roots)
// and `deckpost` (the post under a hut's deck, one unit high and wide, centred)
export function GreatPiece({ pack, name, variant, scale }: { pack: TreePack; name: string; variant: string; scale?: [number, number, number] }) {
  const parts = pack.get(`${name}__${variant}`);
  if (!parts) return null;
  return <>{parts.map((p, i) => <mesh key={i} geometry={p.geometry} material={p.material} scale={scale} castShadow receiveShadow />)}</>;
}
export const hasGreat = (pack: TreePack | null | undefined, name: string): pack is TreePack => !!pack?.has(`${name}__A`);

interface Spot { x: number; y: number; rot: number; scale: number; h?: number }
// The copies of one piece and variant, a mesh to each part drawn in one go (x, y are the district's squares as `Scatter` has them, h the ground's height)
export function TreeStand({ pack, name, variant, items }: { pack: TreePack; name: string; variant: string; items: Spot[] }) {
  const swap = TREE_SWAP[name];
  const parts = pack.get(`${swap.piece}__${swap.variant ?? variant}`);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const k = swap.h / HEIGHT[swap.piece];
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const mesh of refs.current) {
      if (!mesh) continue;
      items.forEach((it, i) => {
        m.compose(pos.set(it.x, it.h ?? 0, it.y), q.setFromEuler(e.set(0, it.rot, 0)), sc.setScalar(it.scale * k));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [items, k, parts]);
  const key = useMemo(() => Math.random().toString(36).slice(2), [items.length, parts]);
  if (!parts) return null;
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh key={`${key}-${i}`} ref={(mesh) => { refs.current[i] = mesh; }} args={[p.geometry, p.material, items.length]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />
      ))}
    </>
  );
}

// The library's rocks (siteAssets.tsx `rock`, `boulder`, `rock_small`, `sea_stack`) as the biome's own Megascans rocks (2026-11-11, the user: "remove the rocks and scree clusters that we
// had PRIOR, and replace with megascans assets"): the pack's rock pieces of the biome (`ECOLOGY` entries of the rock tier), sized to the library piece's own hit radius so that what a
// speeder strikes is what is drawn; a heap of small stones is three small rocks; a sea stack the tallest piece stood to its height
const ROCK_SWAP: Record<string, { r: number; tall?: number; copies?: number }> = { rock: { r: 0.55 }, boulder: { r: 0.9 }, rock_small: { r: 0.16, copies: 3 }, sea_stack: { r: 0.85, tall: 2.6 } };
export const isRockKey = (key: string): boolean => key in ROCK_SWAP;
export function RockStand({ pack, biome, name, v, items }: { pack: MegaPack; biome: string; name: string; v: number; items: Spot[] }) {
  const kinds = ECOLOGY[biome]?.entries.filter((e) => e.tier === "rock").map((e) => e.kind) ?? [];
  const spec = ROCK_SWAP[name];
  const piece = kinds.length ? pack.get(`${kinds[v % kinds.length]}__A`) : undefined;
  const mesh = useMemo(() => {
    if (!piece) return null;
    piece.geometry.computeBoundingBox();
    const size = piece.geometry.boundingBox!.getSize(new THREE.Vector3());
    const k = spec.tall ? spec.tall / Math.max(size.y, 1e-3) : (2 * spec.r) / Math.max(size.x, size.z, 1e-3);
    const copies = spec.copies ?? 1;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const out = new THREE.InstancedMesh(piece.geometry, piece.material, items.length * copies);
    items.forEach((it, i) => {
      for (let c = 0; c < copies; c++) {
        const a = it.rot + c * 2.1;
        const off = copies > 1 ? 0.3 * it.scale : 0;
        const s = k * it.scale * (copies > 1 ? 0.55 + 0.2 * c : 1);
        m.compose(pos.set(it.x + Math.cos(a) * off, (it.h ?? 0) - 0.2 * size.y * s, it.y + Math.sin(a) * off), q.setFromEuler(e.set(0, a * 1.7, 0)), sc.setScalar(s));
        out.setMatrixAt(i * copies + c, m);
      }
    });
    out.instanceMatrix.needsUpdate = true;
    out.frustumCulled = false;
    out.castShadow = true;
    out.receiveShadow = true;
    out.raycast = () => null;
    return out;
  }, [piece, items, spec]);
  return mesh ? <primitive object={mesh} /> : null;
}
