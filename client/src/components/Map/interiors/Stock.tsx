// A rack, shelf or case with its stock (see stock.ts): the weapons are the Blaster Kit's where the camera is near and
// their low detail where it is far, or built in code for blades and the rest, all merged into one mesh per
// material, so that a full armory is one or two draw calls.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, MATERIALS, type Baked } from "../models";
import { holdsOf, stockLayout, type Item } from "./stock";
import { buildWeapon, hungWeapon, KENNEY_BLASTER, LENGTH } from "./weapons";
import { useModels } from "./assets";

const NEAR = 11;

// The meshes of everything on a piece of furniture at one level of detail. `files` holds the models that have loaded
export function stockGeometry(items: Item[], files: Record<string, THREE.BufferGeometry | null>, detail: "hero" | "low"): Baked {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const matte: THREE.BufferGeometry[] = [];  // the loaded models, drawn with the sheen of metal
  const kit = new Kit();
  for (const it of items) {
    const hung = it.weapon ? hungWeapon(it.weapon) : undefined;
    const url = it.prop ? `${KENNEY_BLASTER}/${it.prop}${detail === "low" ? ".lod" : ""}.glb` : hung?.file ? `${KENNEY_BLASTER}/${hung.file}${detail === "low" ? ".lod" : ""}.glb` : undefined;
    const model = url ? files[url] : null;
    if (url && model) {
      const g = model.clone();
      // The files lie along z with the barrel to +z; turned about the upright axis, then tipped
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(it.tilt ?? 0, it.turn, 0, "YXZ")), new THREE.Vector3().setScalar(it.scale));
      g.applyMatrix4(m);
      matte.push(g);
    } else if (hung) {
      // Built in code (blades, pikes, and blasters while their model is on its way)
      kit.group([it.x, it.y, it.z], [it.tilt ?? 0, it.turn, 0], undefined, () => buildWeapon(kit, hung.kind, LENGTH[hung.kind], detail));
    }
  }
  const built = kit.bake();
  const out: Baked = { ...built };
  if (matte.length) {
    // The models are one mesh with the built sheen (both without an index, so that they join)
    const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
    out.sheen = mergeGeometries([...matte, ...(built.sheen ? [flat(built.sheen)] : [])], false) ?? built.sheen;
  }
  return out;
}

// The stock of one piece of furniture, in the frame of the furniture's footprint (`w` by `h` squares, corner at the origin;
// the furniture is built lying along its longer side, turned a quarter if it stands the other way)
export function Stock({ name, w, h, seed, buildingType, roomName }: { name: string; w: number; h: number; seed: number; buildingType: string; roomName: string }) {
  const holds = holdsOf(name, buildingType, roomName);
  const L = Math.max(w, h);
  const D = Math.min(w, h);
  const items = useMemo(() => stockLayout(holds, L, D, buildingType, roomName, seed), [holds, L, D, buildingType, roomName, seed]);
  // Weapons are set on their middles, props (crates, clips, grenades) on their undersides
  const [weaponUrls, propUrls] = useMemo(() => {
    const [weapons, props] = [new Set<string>(), new Set<string>()];
    for (const it of items) {
      const file = it.prop ?? (it.weapon ? hungWeapon(it.weapon).file : undefined);
      if (file) for (const url of [`${KENNEY_BLASTER}/${file}.glb`, `${KENNEY_BLASTER}/${file}.lod.glb`]) (it.prop ? props : weapons).add(url);
    }
    return [[...weapons], [...props]];
  }, [items]);
  const weaponFiles = useModels(weaponUrls, "centre");
  const propFiles = useModels(propUrls, "base");
  const files = useMemo(() => ({ ...weaponFiles, ...propFiles }), [weaponFiles, propFiles]);
  const group = useRef<THREE.Group>(null);
  const [near, setNear] = useState(true);
  const clock = useRef(0);
  const world = useRef(new THREE.Vector3());
  useFrame(({ camera }, delta) => {
    clock.current += delta;
    if (clock.current < 0.5 || !group.current) return;
    clock.current = 0;
    group.current.getWorldPosition(world.current);
    const isNear = world.current.distanceTo(camera.position) < NEAR * Math.max(1, camera.position.y / 18);
    if (isNear !== near) setNear(isNear);
  });
  const baked = useMemo(() => (items.length ? stockGeometry(items, files, near ? "hero" : "low") : {}), [items, files, near]);
  useEffect(() => () => { for (const g of Object.values(baked)) g?.dispose(); }, [baked]);
  if (!items.length) return null;
  return (
    <group ref={group} position={[w / 2, 0, h / 2]} rotation={[0, w >= h ? 0 : Math.PI / 2, 0]}>
      {baked.matte && <mesh geometry={baked.matte} material={MATERIALS.matte} castShadow receiveShadow raycast={() => null} />}
      {baked.sheen && <mesh geometry={baked.sheen} material={MATERIALS.sheen} castShadow receiveShadow raycast={() => null} />}
      {baked.glow && <mesh geometry={baked.glow} material={MATERIALS.glow} raycast={() => null} />}
    </group>
  );
}
