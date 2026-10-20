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
import { useModels, splitByFinish } from "./assets";
import { modelUrl } from "./items";
import { lookOfModel } from "./gear";
import { DEFAULT_TONE, KIT_MODELS, kitUrl, toneNameOf, type KitLook } from "./kitbash";
import { TONES, type Tone } from "./tones";

const NEAR = 11;
// Which kinds of model are drawn matte
const DULL = new Set<KitLook | undefined>(["kit", "medical", "prosthetic"]);

// The meshes of everything on a piece of furniture at one level of detail. `files` holds the models that have loaded
export function stockGeometry(items: Item[], files: Record<string, THREE.BufferGeometry | null>, detail: "hero" | "low"): Baked {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  // The loaded models by how they are drawn: metal (the Blaster Kit's and the kits' steel), matte (cases, bags, prostheses), and, for the
  // item catalogue's models, which say it per vertex, glow and cloth as well
  const by: Record<"sheen" | "matte" | "glow" | "cloth", THREE.BufferGeometry[]> = { sheen: [], matte: [], glow: [], cloth: [] };
  const kit = new Kit();
  for (const it of items) {
    const hung = it.weapon ? hungWeapon(it.weapon) : undefined;
    const lod = detail === "low" ? ".lod" : "";
    const url = it.item ? modelUrl(it.item, detail) : it.model ? kitUrl(it.model, detail) : it.prop ? `${KENNEY_BLASTER}/${it.prop}${lod}.glb` : hung?.file ? `${hung.dir ?? KENNEY_BLASTER}/${hung.file}${lod}.glb` : undefined;
    const model = url ? files[url] : null;
    if (url && model) {
      const g = model.clone();
      // The files lie along z with the barrel to +z; turned about the upright axis, then tipped
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(it.tilt ?? 0, it.turn, 0, "YXZ")), new THREE.Vector3().setScalar(it.scale));
      g.applyMatrix4(m);
      if (it.item) for (const part of splitByFinish(g)) by[part.finish].push(part.geo);
      else (it.model && DULL.has(KIT_MODELS[it.model]) ? by.matte : by.sheen).push(g);
    } else if (hung) {
      // Built in code (blades, pikes, and blasters while their model is on its way)
      kit.group([it.x, it.y, it.z], [it.tilt ?? 0, it.turn, 0], undefined, () => buildWeapon(kit, hung.kind, LENGTH[hung.kind], detail));
    }
  }
  const built = kit.bake();
  const out: Baked = { ...built };
  // The models are one mesh per finish with what the code built (both without an index, so that they join)
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  for (const finish of ["sheen", "matte", "glow", "cloth"] as const) {
    if (!by[finish].length) continue;
    out[finish] = mergeGeometries([...by[finish], ...(built[finish] ? [flat(built[finish]!)] : [])], false) ?? built[finish];
  }
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
  const [weaponUrls, propUrls, kitUrls, itemUrls] = useMemo(() => {
    const [weapons, props] = [new Set<string>(), new Set<string>()];
    // The catalogue's models, by the look that says whether the room's palette applies
    const catalogue: Record<KitLook, Set<string>> = { armour: new Set(), kit: new Set(), medical: new Set(), prosthetic: new Set(), weapon: new Set(), worn: new Set(), plain: new Set() };
    const kits: Record<KitLook, { centre: Set<string>; base: Set<string> }> = Object.fromEntries((Object.keys(DEFAULT_TONE) as KitLook[]).map((l) => [l, { centre: new Set<string>(), base: new Set<string>() }])) as never;
    for (const it of items) {
      if (it.item) {
        for (const detail of ["hero", "low"] as const) catalogue[lookOfModel(it.item)].add(modelUrl(it.item, detail)!);
        continue;
      }
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
    return [[...weapons], [...props], kits, catalogue] as [string[], string[], typeof kits, typeof catalogue];
  }, [items]);
  const weaponFiles = useModels(weaponUrls, "centre");
  const propFiles = useModels(propUrls, "base");
  // The room's palette where there is one; a plain model (its colours mean something) is never recoloured
  const toneOf = (look: KitLook) => { if (look === "plain") return undefined; const n = toneNameOf(look); return tone ?? (n ? TONES[n] : undefined); };
  const [armour, kit, medical, prosthetic] = (["armour", "kit", "medical", "prosthetic"] as const).map((look) => useModels([...kitUrls[look].base], "base", toneOf(look)));
  const meleeFiles = useModels([...kitUrls.weapon.centre], "centre", toneOf("weapon"));
  const cat = (["armour", "kit", "medical", "prosthetic", "weapon", "worn", "plain"] as const).map((look) => useModels([...itemUrls[look]], "base", toneOf(look)));
  const files = useMemo(() => ({ ...weaponFiles, ...propFiles, ...armour, ...kit, ...medical, ...prosthetic, ...meleeFiles, ...Object.assign({}, ...cat) }), [weaponFiles, propFiles, armour, kit, medical, prosthetic, meleeFiles, ...cat]);
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
      {baked.cloth && <mesh geometry={baked.cloth} material={MATERIALS.cloth} castShadow raycast={() => null} />}
    </group>
  );
}
