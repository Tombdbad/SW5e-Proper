import { useRef, useState, useEffect, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { useMap } from "@/lib/stores/useMap";
import { childrenOf, trailOf, type Area, type World } from "@shared/logic";

interface LocalMapProps {
  // The campaign's generated world and the area to centre on: its layer is drawn as a schematic
  world?: World | null;
  hereId?: string | null;
  // A place on the map was tapped
  onSelect?: (areaId: string) => void;
}

// ---------------------------------------------------------------------------------------------
// Models. Places are built from a few plain solids in the look of the setting: sand-coloured
// domes and vaporator masts in the desert, grey towers in the cities, bunkers with turrets,
// landing pads ringed with lights, tents, rock and broken columns in the wild.
// ---------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const Solid = ({ at, color, glow, children }: { at: V3; color: string; glow?: number; children: ReactNode }) => (
  <mesh position={at} castShadow>
    {children}
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow ?? 0.08} roughness={0.9} />
  </mesh>
);
const Box = ({ at, size, color, glow }: { at: V3; size: V3; color: string; glow?: number }) => <Solid at={at} color={color} glow={glow}><boxGeometry args={size} /></Solid>;
const Cyl = ({ at, r, h, color, glow, top = r }: { at: V3; r: number; h: number; color: string; glow?: number; top?: number }) => <Solid at={at} color={color} glow={glow}><cylinderGeometry args={[top, r, h, 18]} /></Solid>;
const Dome = ({ at, r, color }: { at: V3; r: number; color: string }) => <Solid at={at} color={color}><sphereGeometry args={[r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></Solid>;
const Mast = ({ at, h = 2.2 }: { at: V3; h?: number }) => (
  <>
    <Cyl at={[at[0], at[1] + h / 2, at[2]]} r={0.06} h={h} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.75, at[2]]} size={[0.5, 0.06, 0.06]} color="#d7d2c4" />
    <Box at={[at[0], at[1] + h * 0.5, at[2]]} size={[0.36, 0.06, 0.06]} color="#d7d2c4" />
  </>
);
const Tower = ({ at, r, h, color }: { at: V3; r: number; h: number; color: string }) => (
  <>
    <Cyl at={[at[0], h / 2, at[2]]} r={r} h={h} color={color} />
    <Cyl at={[at[0], h + 0.25, at[2]]} r={r * 0.6} h={0.5} color={color} top={0.05} />
    <Box at={[at[0], h * 0.6, at[2] + r]} size={[r * 0.5, 0.12, 0.04]} color="#ffd98a" glow={1} />
  </>
);
const Tent = ({ at, color }: { at: V3; color: string }) => <Solid at={[at[0], 0.6, at[2]]} color={color}><coneGeometry args={[0.8, 1.2, 6]} /></Solid>;
const Rock = ({ at, r, color = "#6d6a66" }: { at: V3; r: number; color?: string }) => <Solid at={[at[0], r * 0.6, at[2]]} color={color}><dodecahedronGeometry args={[r, 0]} /></Solid>;
const Hull = ({ color = "#8b9299" }: { color?: string }) => (
  <group rotation={[0, 0.5, 0.25]}>
    <Solid at={[0, 0.5, 0]} color={color}><capsuleGeometry args={[0.7, 2.2, 6, 12]} /></Solid>
    <Box at={[0.2, 1.1, 0.9]} size={[0.1, 1.2, 1]} color="#59636d" />
    <Box at={[0, 0.2, -0.6]} size={[0.5, 0.3, 0.5]} color="#2b2b2b" />
  </group>
);

// Wall colour by the world the place stands on
const WALLS: Record<string, string> = { desert: "#c9a56e", ice: "#cfd8dc", urban: "#8a94a3", volcanic: "#6b5a55", forest: "#a69f80", jungle: "#9aa080", swamp: "#8f9278", ocean: "#b8c4c8", barren: "#a59c8f", temperate: "#b9ad96", "gas giant": "#8f98a8" };
const GROUND: Record<string, string> = { desert: "#4a3a22", ice: "#39505c", urban: "#1c222b", volcanic: "#2a1a18", forest: "#1f3324", jungle: "#1a3a22", swamp: "#252f22", ocean: "#12303d", barren: "#33302c", temperate: "#26361f", "gas giant": "#1d2233" };
const STEEL = "#7b8794";

// A building of a settlement, by what kind of place it is
function BuildingModel({ type, wall }: { type: string; wall: string }) {
  if (/cantina/.test(type)) return <><Dome at={[0, 0, 0]} r={1.5} color={wall} /><Dome at={[1.3, 0, 0.7]} r={0.8} color={wall} /><Box at={[0, 0.4, 1.45]} size={[0.6, 0.8, 0.3]} color="#3a2c20" /><Box at={[0, 0.9, 1.5]} size={[0.5, 0.12, 0.05]} color="#5ad1ff" glow={1.2} /><Mast at={[-1.3, 0, -0.8]} /></>;
  if (/spaceport|landing|docking/.test(type)) {
    return (
      <>
        <Cyl at={[0, 0.1, 0]} r={2.3} h={0.2} color="#2c333b" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0]}><ringGeometry args={[1.7, 1.9, 32]} /><meshBasicMaterial color="#f0a03c" /></mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => <Box key={i} at={[Math.cos(i * 1.047) * 2.15, 0.28, Math.sin(i * 1.047) * 2.15]} size={[0.14, 0.14, 0.14]} color="#ff5a5a" glow={1.5} />)}
        {/spaceport|docking/.test(type) && <Tower at={[2.2, 0, -2]} r={0.4} h={2.6} color={/docking/.test(type) ? STEEL : wall} />}
        <group position={[0, 0.5, 0]} scale={0.5}><Hull color="#aeb6bd" /></group>
      </>
    );
  }
  if (/market|promenade/.test(type)) return <>{[[-0.9, -0.8, "#c8663a"], [0.9, -0.7, "#e8dcc0"], [-0.8, 0.9, "#4f8a8b"], [0.9, 0.9, "#c8663a"]].map(([x, z, c], i) => <group key={i}><Box at={[x as number, 0.4, z as number]} size={[1.1, 0.8, 1.1]} color={wall} /><Solid at={[x as number, 1.05, z as number]} color={c as string}><coneGeometry args={[1, 0.5, 4]} /></Solid></group>)}</>;
  if (/garrison|command post|operations|gate/.test(type)) {
    const gate = /gate/.test(type);
    return gate ? <><Box at={[-1.2, 1, 0]} size={[0.8, 2, 1]} color={wall} /><Box at={[1.2, 1, 0]} size={[0.8, 2, 1]} color={wall} /><Box at={[0, 1.9, 0]} size={[3.2, 0.4, 0.8]} color={wall} /><Box at={[0, 0.9, 0]} size={[1.5, 1.6, 0.1]} color="#f0a03c" glow={0.4} /></> : (
      <>
        <Cyl at={[0, 0.6, 0]} r={2} h={1.2} color="#59636d" top={1.6} />
        <Box at={[0, 1.5, 0]} size={[1.6, 0.7, 1.6]} color="#4a545f" />
        <Cyl at={[-1.3, 1.5, 1.1]} r={0.3} h={0.5} color="#2f363d" /><Box at={[-1.3, 1.6, 1.6]} size={[0.1, 0.1, 0.9]} color="#2f363d" />
        <Cyl at={[1.3, 1.5, -1.1]} r={0.3} h={0.5} color="#2f363d" /><Box at={[1.3, 1.6, -1.6]} size={[0.1, 0.1, 0.9]} color="#2f363d" />
        <Mast at={[0.4, 1.8, 0.3]} h={1.8} />
        <Box at={[0, 0.5, 1.95]} size={[0.8, 1, 0.1]} color="#e5484d" glow={0.6} />
      </>
    );
  }
  if (/medcenter/.test(type)) return <><Box at={[0, 0.8, 0]} size={[2.8, 1.6, 2]} color="#e9edf0" /><Dome at={[0, 1.6, 0]} r={0.9} color="#e9edf0" /><Box at={[0, 0.9, 1.02]} size={[2.8, 0.25, 0.05]} color="#5ad1ff" glow={1} /></>;
  if (/workshop|engineering/.test(type)) return <><Box at={[0, 0.7, 0]} size={[2.6, 1.4, 2]} color={/engineering/.test(type) ? STEEL : wall} /><Cyl at={[1.7, 0.7, 0.5]} r={0.5} h={1.4} color="#59636d" /><Cyl at={[-0.8, 1.9, -0.5]} r={0.2} h={1} color="#3b3f45" /><Box at={[0, 0.5, 1.02]} size={[1.2, 1, 0.05]} color="#f0a03c" glow={0.7} /></>;
  if (/residences|habitat/.test(type)) return <><Box at={[-0.6, 0.6, 0]} size={[1.6, 1.2, 1.8]} color={wall} /><Box at={[0.8, 1, -0.3]} size={[1.4, 2, 1.4]} color={wall} /><Dome at={[0.8, 2, -0.3]} r={0.6} color={wall} /><Box at={[-0.4, 1.5, 0.3]} size={[1, 0.6, 1]} color={wall} />{[0, 1, 2].map((i) => <Box key={i} at={[0.8, 0.5 + i * 0.55, 0.42]} size={[0.3, 0.2, 0.05]} color="#ffd98a" glow={1} />)}</>;
  if (/palace/.test(type)) return <><Cyl at={[0, 0.5, 0]} r={2.2} h={1} color={wall} /><Dome at={[0, 1, 0]} r={1.6} color={wall} />{[[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]].map(([x, z], i) => <Tower key={i} at={[x, 0, z]} r={0.35} h={2.4} color={wall} />)}</>;
  if (/warehouse|cargo/.test(type)) return <><Box at={[0, 0.6, 0]} size={[3.2, 1.2, 2]} color={STEEL} /><mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[1, 1, 3.2, 16, 1, false, 0, Math.PI]} /><meshStandardMaterial color="#59636d" /></mesh><Box at={[0, 0.5, 1.02]} size={[1.6, 1, 0.05]} color="#2f363d" /><Box at={[2, 0.3, 0.6]} size={[0.6, 0.6, 0.6]} color="#6f7448" /></>;
  if (/archive/.test(type)) return <><Tower at={[0, 0, 0]} r={1.1} h={3} color={wall} /><Cyl at={[0, 0.25, 0]} r={1.9} h={0.5} color={wall} /></>;
  if (/hideout/.test(type)) return <><Box at={[0, 0.35, 0]} size={[2.8, 0.7, 2.2]} color="#3b3f45" /><Box at={[0.6, 0.8, 0]} size={[1, 0.3, 1]} color="#2b2f34" /><Box at={[0, 0.3, 1.12]} size={[0.7, 0.6, 0.05]} color="#e5484d" glow={0.5} /><Rock at={[-1.8, 0, 0.8]} r={0.5} /></>;
  if (/camp/.test(type)) return <><Tent at={[-1, 0, -0.5]} color="#8a6f4a" /><Tent at={[1, 0, -0.3]} color="#7a6040" /><Tent at={[0, 0, 1.1]} color="#96794f" /><Box at={[0, 0.15, 0]} size={[0.3, 0.3, 0.3]} color="#ffb347" glow={2} /></>;
  if (/cave/.test(type)) return <><Rock at={[0, 0, 0]} r={1.9} /><Rock at={[1.6, 0, 0.8]} r={0.9} color="#5a5753" /><Solid at={[0, 0.6, 1.5]} color="#0a0a0a"><sphereGeometry args={[0.75, 12, 12]} /></Solid></>;
  if (/ruin/.test(type)) return <><Box at={[0, 0.1, 0]} size={[3.4, 0.2, 2.6]} color="#6d6a66" />{[[-1.3, -0.9, 2], [1.3, -0.9, 1.1], [-1.3, 0.9, 0.7], [1.3, 0.9, 1.7], [0, -0.9, 1.4]].map(([x, z, h], i) => <Cyl key={i} at={[x, h / 2 + 0.2, z]} r={0.24} h={h} color="#8a8680" />)}<Rock at={[0.3, 0, 0.5]} r={0.5} /></>;
  if (/wreck/.test(type)) return <><Hull /><Rock at={[1.6, 0, 1]} r={0.4} color="#3a3835" /></>;
  if (/trailhead/.test(type)) return <><Cyl at={[0, 0.8, 0]} r={0.08} h={1.6} color="#8a6f4a" /><Box at={[0.3, 1.3, 0]} size={[0.9, 0.35, 0.06]} color="#c9a56e" /><Rock at={[-0.8, 0, 0.5]} r={0.45} /></>;
  return <><Box at={[0, 0.7, 0]} size={[2.4, 1.4, 2.2]} color={wall} /><Dome at={[0, 1.4, 0]} r={0.8} color={wall} /></>;
}

// A settlement or wild site on a planet's surface
function SettlementModel({ type, wall }: { type: string; wall: string }) {
  if (/city/.test(type)) return <>{[[0, 0, 3.4, 0.5], [-1.1, 0.6, 2.2, 0.4], [1, -0.6, 2.6, 0.45], [0.9, 1, 1.5, 0.4], [-0.9, -1, 1.8, 0.35]].map(([x, z, h, r], i) => <Tower key={i} at={[x, 0, z]} r={r} h={h} color={i % 2 ? "#8a94a3" : "#a3adba"} />)}<Cyl at={[0, 0.1, 0]} r={2.3} h={0.2} color="#3b4654" /></>;
  if (/town/.test(type)) return <><Dome at={[0, 0, 0]} r={1.1} color={wall} /><Dome at={[1.4, 0, 0.5]} r={0.7} color={wall} /><Dome at={[-1.2, 0, 0.8]} r={0.8} color={wall} /><Box at={[0.3, 0.4, -1.3]} size={[1.2, 0.8, 0.9]} color={wall} /><Mast at={[-0.6, 0, -1.2]} /></>;
  if (/outpost/.test(type)) return <><Cyl at={[0, 0.5, 0]} r={1.6} h={1} color="#59636d" top={1.3} /><Mast at={[0, 1, 0]} h={2} /><Box at={[1.9, 0.3, 0]} size={[0.8, 0.6, 0.8]} color="#6f7448" /><Cyl at={[-2, 0.08, 0.6]} r={0.8} h={0.16} color="#2c333b" /></>;
  if (/station/.test(type)) return <><mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[1.8, 0.28, 10, 32]} /><meshStandardMaterial color={STEEL} emissive={STEEL} emissiveIntensity={0.15} /></mesh><Cyl at={[0, 1.4, 0]} r={0.5} h={2.4} color="#a3adba" /><Box at={[0, 2.7, 0]} size={[0.2, 0.2, 0.2]} color="#ff5a5a" glow={2} /></>;
  if (/cave/.test(type)) return <><Rock at={[0, 0, 0]} r={1.6} /><Rock at={[1.5, 0, 0.5]} r={1} color="#5a5753" /><Rock at={[-1.3, 0, 0.9]} r={0.8} /><Solid at={[0.2, 0.5, 1.3]} color="#0a0a0a"><sphereGeometry args={[0.6, 12, 12]} /></Solid></>;
  if (/ruin/.test(type)) return <BuildingModel type="ruin" wall={wall} />;
  if (/crash/.test(type)) return <><Hull /><Box at={[1.8, 0.1, 1.2]} size={[0.8, 0.2, 0.5]} color="#59636d" /><Box at={[-1.6, 0.25, -0.5]} size={[0.3, 0.5, 0.3]} color="#ffb347" glow={1.5} /></>;
  if (/camp/.test(type)) return <BuildingModel type="camp" wall={wall} />;
  return <Dome at={[0, 0, 0]} r={1.4} color={wall} />;
}

const BIOME_COLOR: Record<string, string> = { desert: "#d9a55b", ice: "#dfeef5", forest: "#3f8a4a", jungle: "#2f7a3d", swamp: "#5f7048", ocean: "#2f72c4", volcanic: "#b3402e", urban: "#9aa3b5", temperate: "#5fa56a", barren: "#8e867c", "gas giant": "#d8a36a" };
const STAR_COLOR: Record<string, string> = { O: "#9bb0ff", B: "#aabfff", A: "#cad7ff", F: "#f8f7ff", G: "#fff4a3", K: "#ffd2a1", M: "#ffa07a" };

const LAYER_NAME: Record<string, string> = { room: "Rooms of", building: "Streets of", settlement: "Surface of", planet: "Orbits of", system: "Systems of", region: "Regions of" };

// One layer of the world: the place the party is in and the places beside it (the rooms of a
// building, the buildings of a settlement, the sites on a planet, the planets of a system), with
// the paths that join them. The same places and paths as the Location panel lists.
function WorldLayer({ world, hereId, onSelect }: { world: World; hereId: string; onSelect?: (areaId: string) => void }) {
  const { camera } = useThree();
  const here = world.areas[hereId];
  const places: Area[] = here.parentId ? childrenOf(world, here.parentId).filter((a) => a.kind === here.kind) : [here];
  const ids = new Set(places.map((a) => a.id));
  // Rooms with a floor plan are drawn where the plan has them, wall to wall; then the doors are in the walls
  const planned = here.kind === "room" && places.every((a) => a.layout);
  const paths = planned ? [] : world.paths.filter((p) => ids.has(p.from) && ids.has(p.to) && !p.hidden);
  const spot = (a: Area) => (planned ? { x: a.layout!.x + a.layout!.width / 2, z: a.layout!.y + a.layout!.height / 2 } : a.position);
  const biome = trailOf(world, hereId).find((a) => a.kind === "planet")?.type ?? "";
  const wall = trailOf(world, hereId).some((a) => a.type === "station") ? STEEL : WALLS[biome] ?? "#b9ad96";

  // Fit the layer into about 50 units, whatever scale it was generated at
  const xs = places.flatMap((a) => (planned ? [a.layout!.x, a.layout!.x + a.layout!.width] : [a.position.x]));
  const zs = places.flatMap((a) => (planned ? [a.layout!.y, a.layout!.y + a.layout!.height] : [a.position.z]));
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const scale = planned ? Math.min(1.6, 46 / extent) : Math.min(6, 50 / extent);
  const at = (a: Area): [number, number, number] => [(spot(a).x - centre.x) * scale, 0, (spot(a).z - centre.z) * scale];

  useEffect(() => {
    camera.position.set(0, 42, 30);
    camera.lookAt(0, 0, 0);
  }, [camera, hereId]);

  const round = here.kind === "planet" || here.kind === "system" || here.kind === "settlement";
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshBasicMaterial color={here.kind === "building" || here.kind === "settlement" ? GROUND[biome] ?? "#0b1220" : "#0b1220"} />
      </mesh>
      <gridHelper args={[140, 28, "#1f2a44", "#162036"]} position={[0, -0.5, 0]} />

      {paths.map((path) => (
        <line key={path.id}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([...at(world.areas[path.from]), ...at(world.areas[path.to])])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={path.locked ? "#ff9040" : "#60a0ff"} />
        </line>
      ))}

      {places.map((area) => {
        const current = area.id === hereId;
        const hostile = area.occupants.some((o) => o.disposition === "hostile");
        const color = current ? "#ffcc00" : hostile ? "#cc4444" : area.gateway ? "#66ccaa" : "#8899bb";
        return (
          <group key={area.id} position={at(area)} onClick={() => onSelect?.(area.id)}>
            {area.kind === "building" ? (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
                  <circleGeometry args={[5, 32]} />
                  <meshBasicMaterial color={color} transparent opacity={0.35} />
                </mesh>
                <group position={[0, -0.4, 0]} scale={1.9}><BuildingModel type={area.type} wall={wall} /></group>
              </>
            ) : area.kind === "settlement" ? (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
                  <circleGeometry args={[5, 32]} />
                  <meshBasicMaterial color={color} transparent opacity={0.35} />
                </mesh>
                <group position={[0, -0.4, 0]} scale={1.9}><SettlementModel type={area.type} wall={wall} /></group>
              </>
            ) : planned ? (
              <>
                {/* The room's floor and its four walls, to the scale of its plan */}
                <mesh position={[0, -0.3, 0]}>
                  <boxGeometry args={[area.layout!.width * scale, 0.2, area.layout!.height * scale]} />
                  <meshStandardMaterial color={current ? "#6b5a1e" : hostile ? "#4a2326" : "#27303b"} emissive={color} emissiveIntensity={current ? 0.35 : 0.08} />
                </mesh>
                {([[0, -1, 1, 0], [0, 1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, 1]] as const).map(([dx, dz, alongX, alongZ], i) => (
                  <mesh key={i} position={[(dx * area.layout!.width * scale) / 2, 0.3, (dz * area.layout!.height * scale) / 2]}>
                    <boxGeometry args={[alongX ? area.layout!.width * scale : 0.25, 1.1, alongZ ? area.layout!.height * scale : 0.25]} />
                    <meshStandardMaterial color="#8b97a6" transparent opacity={0.8} />
                  </mesh>
                ))}
                {area.layout!.assets.filter((a) => a.kind === "furniture" && a.blocks).map((a) => (
                  <mesh key={a.id} position={[(a.x + a.w / 2 - area.layout!.width / 2) * scale, 0.05, (a.y + a.h / 2 - area.layout!.height / 2) * scale]}>
                    <boxGeometry args={[a.w * scale * 0.85, 0.5, a.h * scale * 0.85]} />
                    <meshStandardMaterial color={a.cover ? "#6f7448" : "#4b5563"} />
                  </mesh>
                ))}
              </>
            ) : (
              <mesh>
                {round ? <sphereGeometry args={[1.6, 20, 20]} /> : <boxGeometry args={[3.2, 1.2, 3.2]} />}
                <meshStandardMaterial
                  color={area.kind === "planet" ? BIOME_COLOR[area.type] ?? color : area.kind === "system" ? STAR_COLOR[area.type] ?? color : color}
                  emissive={area.kind === "planet" ? BIOME_COLOR[area.type] ?? color : area.kind === "system" ? STAR_COLOR[area.type] ?? color : color}
                  emissiveIntensity={current ? 0.6 : area.kind === "system" ? 0.8 : 0.25}
                />
              </mesh>
            )}
            {current && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
                <ringGeometry args={area.kind === "building" || area.kind === "settlement" ? [5.2, 5.8, 32] : [2.8, 3.3, 32]} />
                <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
              </mesh>
            )}
            {/* Names face the viewer however the map is turned */}
            <Billboard position={[0, area.kind === "building" || area.kind === "settlement" ? 7.6 : 3.4, 0]}>
              <Text fontSize={1.3} color="white" anchorX="center" anchorY="middle" outlineWidth={0.08} outlineColor="#000000">
                {area.name}
              </Text>
            </Billboard>
          </group>
        );
      })}

      {here.parentId && (
        <Billboard position={[0, 0.5, -34]}>
          <Text fontSize={2} color="#aabbdd" anchorX="center" anchorY="middle">
            {`${LAYER_NAME[here.kind] ?? ""} ${world.areas[here.parentId].name}`}
          </Text>
        </Billboard>
      )}

      <OrbitControls enableZoom enablePan enableRotate minDistance={10} maxDistance={110} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 30, 10]} intensity={0.8} />
    </>
  );
}

// The local map: a schematic of the world around the party, or stock scenery for a campaign
// that has no generated world
export default function LocalMap({ world, hereId, onSelect }: LocalMapProps = {}) {
  if (world && hereId && world.areas[hereId]) return <WorldLayer world={world} hereId={hereId} onSelect={onSelect} />;
  return <Scenery />;
}

// Local map terrain and objects
function Scenery() {
  const { currentLocation } = useMap();
  const terrainRef = useRef<THREE.Mesh>(null);
  const playerRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [subscribe, getKeys] = useKeyboardControls();
  
  // Textures
  const terrainTexture = useTexture("/textures/grass.png");
  terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
  terrainTexture.repeat.set(20, 20);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  
  // Handle player movement
  useFrame((_, delta) => {
    if (!playerRef.current) return;
    
    const keys = getKeys();
    const speed = 5 * delta;
    
    if (keys.forward) {
      playerRef.current.position.z -= speed;
    }
    
    if (keys.backward) {
      playerRef.current.position.z += speed;
    }
    
    if (keys.leftward) {
      playerRef.current.position.x -= speed;
    }
    
    if (keys.rightward) {
      playerRef.current.position.x += speed;
    }
    
    // Limit player to terrain bounds
    const maxDistance = 45;
    playerRef.current.position.x = Math.max(-maxDistance, Math.min(maxDistance, playerRef.current.position.x));
    playerRef.current.position.z = Math.max(-maxDistance, Math.min(maxDistance, playerRef.current.position.z));
    
    // Camera follows player
    camera.position.x = playerRef.current.position.x;
    camera.position.z = playerRef.current.position.z + 10;
    camera.lookAt(
      playerRef.current.position.x,
      playerRef.current.position.y,
      playerRef.current.position.z
    );
  });
  
  // Generate objects based on location description
  const generateObjects = () => {
    if (!currentLocation) return null;
    
    const objects = [];
    const numObjects = Math.floor(Math.random() * 20) + 10;
    
    for (let i = 0; i < numObjects; i++) {
      const type = Math.random() > 0.7 ? "building" : "tree";
      const x = (Math.random() - 0.5) * 80;
      const z = (Math.random() - 0.5) * 80;
      const scale = Math.random() * 0.5 + 0.5;
      
      objects.push(
        <group key={`object-${i}`} position={[x, 0, z]} scale={[scale, scale, scale]}>
          {type === "building" ? (
            <mesh>
              <boxGeometry args={[3, 4, 3]} />
              <meshStandardMaterial color="#888888" />
            </mesh>
          ) : (
            <mesh>
              <cylinderGeometry args={[0, 1.5, 5, 8]} />
              <meshStandardMaterial color="#228822" />
            </mesh>
          )}
        </group>
      );
    }
    
    return objects;
  };

  return (
    <>
      {/* Terrain */}
      <mesh 
        ref={terrainRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
      >
        <planeGeometry args={[100, 100, 32, 32]} />
        <meshStandardMaterial 
          map={terrainTexture} 
          color={0x88bb88}
        />
      </mesh>
      
      {/* Player */}
      <mesh ref={playerRef} position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="#4444cc" />
      </mesh>
      
      {/* Environment objects */}
      {generateObjects()}
      
      {/* Location marker */}
      {currentLocation && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <ringGeometry args={[3, 3.5, 32]} />
            <meshBasicMaterial color="#ffcc00" transparent opacity={0.7} />
          </mesh>
          <Text
            position={[0, 3, 0]}
            fontSize={1.5}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {currentLocation.name}
          </Text>
        </group>
      )}
      
      {/* Controls */}
      <OrbitControls 
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={50}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1} 
        castShadow 
        shadow-mapSize-width={2048} 
        shadow-mapSize-height={2048}
      />
    </>
  );
}
