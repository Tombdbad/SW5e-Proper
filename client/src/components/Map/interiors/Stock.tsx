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
import { DEFAULT_TONE, KIT_MODELS, kitUrl, type KitLook } from "./kitbash";
import { TONES, type Tone } from "./tones";

const NEAR = 11;
// Which kinds of model are drawn matte
const DULL = new Set<KitLook | undefined>(["kit", "medical", "prosthetic"]);

// The meshes of everything on a piece of furniture at one level of detail. `files` holds the models that have loaded
export function stockGeometry(items: Item[], files: Record<string, THREE.BufferGeometry | null>, detail: "hero" | "low"): Baked {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const matte: THREE.BufferGeometry[] = [];  // the loaded models, drawn with the sheen of metal
  const dull: THREE.BufferGeometry[] = [];   // the loaded models of cloth, plastic and paint (cases, bags, prostheses)
  const kit = new Kit();
  for (const it of items) {
    const hung = it.weapon ? hungWeapon(it.weapon) : undefined;
    const lod = detail === "low" ? ".lod" : "";
    const url = it.model ? kitUrl(it.model, detail) : it.prop ? `${KENNEY_BLASTER}/${it.prop}${lod}.glb` : hung?.file ? `${hung.dir ?? KENNEY_BLASTER}/${hung.file}${lod}.glb` : undefined;
    const model = url ? files[url] : null;
    if (url && model) {
      const g = model.clone();
      // The files lie along z with the barrel to +z; turned about the upright axis, then tipped
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(it.tilt ?? 0, it.turn, 0, "YXZ")), new THREE.Vector3().setScalar(it.scale));
      g.applyMatrix4(m);
      (it.model && DULL.has(KIT_MODELS[it.model]) ? dull : matte).push(g);
    } else if (hung) {
      // Built in code (blades, pikes, and blasters while their model is on its way)
      kit.group([it.x, it.y, it.z], [it.tilt ?? 0, it.turn, 0], undefined, () => buildWeapon(kit, hung.kind, LENGTH[hung.kind], detail));
    }
  }
  const built = kit.bake();
  const out: Baked = { ...built };
  // The models are one mesh with the built sheen or matte (both without an index, so that they join)
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  if (matte.length) out.sheen = mergeGeometries([...matte, ...(built.sheen ? [flat(built.sheen)] : [])], false) ?? built.sheen;
  if (dull.length) out.matte = mergeGeometries([...dull, ...(built.matte ? [flat(built.matte)] : [])], false) ?? built.matte;
  return out;
}

// The stock of one piece of furniture, in the frame of the furniture's footprint (`w` by `h` squares, corner at the origin;
// the furniture is built lying along its longer side, turned a quarter if it stands the other way)
export function Stock({ name, w, h, seed, buildingType, roomName, tone }: { name: string; w: number; h: number; seed: number; buildingType: string; roomName: string; tone?: Tone }) {
  const holds = holdsOf(name, buildingType, roomName);
  const L = Math.max(w, h);
  const D = Math.min(w, h);
  const items = useMemo(() => stockLayout(holds, L, D, buildingType, roomName, seed, name), [holds, L, D, buildingType, roomName, seed, name]);
  // Weapons are set on their middles, props (crates, clips, grenades) and the kits' models on their undersides. The Blaster Kit's
  // pieces keep their steel; the kits' models take the room's palette, or their own where the room has none
  const [weaponUrls, propUrls, kitUrls] = useMemo(() => {
    const [weapons, props] = [new Set<string>(), new Set<string>()];
    const kits: Record<KitLook, { centre: Set<string>; base: Set<string> }> = Object.fromEntries((Object.keys(DEFAULT_TONE) as KitLook[]).map((l) => [l, { centre: new Set<string>(), base: new Set<string>() }])) as never;
    for (const it of items) {
      if (it.model) {
        const look = KIT_MODELS[it.model];
        for (const detail of ["hero", "low"] as const) kits[look].base.add(kitUrl(it.model, detail));
        continue;
      }
      const hung = it.weapon ? hungWeapon(it.weapon) : undefined;
      const file = it.prop ?? hung?.file;
      if (!file) continue;
      const dir = hung?.dir ?? KENNEY_BLASTER;
      for (const url of [`${dir}/${file}.glb`, `${dir}/${file}.lod.glb`]) {
        if (dir !== KENNEY_BLASTER) kits.weapon.centre.add(url);
        else (it.prop ? props : weapons).add(url);
      }
    }
    return [[...weapons], [...props], kits] as [string[], string[], typeof kits];
  }, [items]);
  const weaponFiles = useModels(weaponUrls, "centre");
  const propFiles = useModels(propUrls, "base");
  const toneOf = (look: KitLook) => tone ?? TONES[DEFAULT_TONE[look]];
  const [armour, kit, medical, prosthetic] = (["armour", "kit", "medical", "prosthetic"] as const).map((look) => useModels([...kitUrls[look].base], "base", toneOf(look)));
  const meleeFiles = useModels([...kitUrls.weapon.centre], "centre", toneOf("weapon"));
  const files = useMemo(() => ({ ...weaponFiles, ...propFiles, ...armour, ...kit, ...medical, ...prosthetic, ...meleeFiles }), [weaponFiles, propFiles, armour, kit, medical, prosthetic, meleeFiles]);
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
