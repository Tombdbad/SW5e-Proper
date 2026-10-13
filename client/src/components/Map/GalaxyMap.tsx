import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { starSystems } from "@/lib/sw5e/starSystems";
import { useMap } from "@/lib/stores/useMap";
import { trailOf, type Exit, type World } from "@shared/logic";

// What a tap on the 3D map asks for. Places: a tap picks one out, a second tap straight after
// opens it (the view of what is inside). In a building, on foot: a door, way out or secret way
// that was walked to, a signpost to another place, a cache, someone, a ship, a look through a
// window; and coming to a stop beside a secret way nobody has found yet (areaId is its room).
export type MapAction =
  | { type: "select" | "open" | "near"; areaId: string }
  | { type: "go"; areaId: string; secret?: boolean }
  | { type: "exit"; exit: Exit }
  | { type: "loot" | "occupant" | "ship"; id: string }
  | { type: "look"; areaId: string }
  | { type: "note"; text: string };

// Tap and double tap on a place. A drag that turns the map is not a tap; a mouse double click
// and two quick taps of a finger both count as a double tap.
export function useTaps(onAct?: (action: MapAction) => void) {
  const last = useRef({ id: "", at: 0 });
  return (event: { stopPropagation: () => void; delta: number; nativeEvent?: { timeStamp: number } }, areaId: string) => {
    event.stopPropagation();
    if (event.delta > 8) return;
    // When the finger came down, not when a busy page got round to it
    const now = event.nativeEvent?.timeStamp ?? performance.now();
    const again = last.current.id === areaId && now - last.current.at < 500;
    last.current = { id: areaId, at: again ? 0 : now };
    onAct?.({ type: again ? "open" : "select", areaId });
  };
}

// Where things on the map are on the screen, for the browser play-through (e2e), which has to
// tap them: window.__map3d.at("area:a12") gives page coordinates.
export function Probe({ locate }: { locate: (key: string) => [number, number, number] | undefined }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    (window as any).__map3d = {
      at: (key: string) => {
        const point = locate(key);
        if (!point) return null;
        const v = new THREE.Vector3(...point).project(camera);
        const box = gl.domElement.getBoundingClientRect();
        return { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
      },
    };
    return () => {
      delete (window as any).__map3d;
    };
  });
  return null;
}

// The camera: it flies in to each new view, then the map can be turned, moved and zoomed by
// hand. A view that follows someone (the party on foot) keeps them in the middle as they walk.
type V3 = [number, number, number];
export function Rig({ target, offset, min, max, fov = 75, follow }: { target: V3; offset: V3; min: number; max: number; fov?: number; follow?: { current: V3 | null } }) {
  const controls = useRef<any>(null);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const fly = useRef(0);
  // A new view is a new place or a new size; a step the party takes is not
  const view = [...(follow ? [] : target), ...offset].join();
  const place = (k: number) => {
    const at = follow?.current ?? target;
    camera.position.set(at[0] + offset[0] * k, at[1] + offset[1] * k, at[2] + offset[2] * k);
    controls.current?.target.set(...at);
    controls.current?.update();
  };
  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    fly.current = 1;
    place(2.2);
  }, [view, fov]);
  useEffect(() => () => {
    camera.fov = 75;
    camera.updateProjectionMatrix();
  }, []);
  useFrame((_, delta) => {
    if (fly.current > 0) {
      fly.current = Math.max(0, fly.current - delta * 1.8);
      place(1 + 1.2 * fly.current * fly.current);
    } else if (follow?.current && controls.current) {
      const [dx, dy, dz] = [follow.current[0] - controls.current.target.x, follow.current[1] - controls.current.target.y, follow.current[2] - controls.current.target.z];
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 0.0005) return;
      camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
      controls.current.target.set(...follow.current);
      controls.current.update();
    }
  });
  return <OrbitControls ref={controls} enableZoom enablePan enableRotate minDistance={min} maxDistance={max} maxPolarAngle={Math.PI / 2.15} />;
}

interface GalaxyMapProps {
  // The campaign's generated world: its systems and hyperlanes are drawn instead of the stock galaxy
  world?: World | null;
  hereId?: string | null;
  // The system picked out, and what a tap or double tap on one does
  selectedId?: string | null;
  onAct?: (action: MapAction) => void;
}

// Generated systems sit on rings up to about 115 units out; the map is about 70 across
const WORLD_SCALE = 0.6;

export default function GalaxyMap({ world, hereId, selectedId, onAct }: GalaxyMapProps = {}) {
  const tap = useTaps(onAct);
  const { selectStarSystem, selectedStarSystem } = useMap();
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null);
  const galaxyRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // Set initial camera position
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    // A campaign's galaxy is flown in to (see Rig below)
    if (!world) {
      camera.position.set(0, 100, 100);
      camera.lookAt(0, 0, 0);
    }

    // Fetch star systems data
    async function loadStarSystems() {
      try {
        setSystems(starSystems as any);
      } catch (error) {
        console.error("Failed to load star systems:", error);
      }
    }

    loadStarSystems();
  }, [camera]);

  // Galaxy rotation
  useFrame((_, delta) => {
    // A campaign's galaxy holds still, so that its systems can be tapped
    if (galaxyRef.current && !world) {
      galaxyRef.current.rotation.y += delta * 0.05;
    }
  });

  // Handle system selection: in a generated world a tap picks the system out and a double tap
  // opens it; the stock galaxy keeps its own selection
  const handleSystemClick = (event: any, systemId: string) => {
    if (world) tap(event, systemId);
    else selectStarSystem(systemId);
  };
  const picked = world ? selectedId : selectedStarSystem;

  // What to draw: the campaign's own galaxy when it has one
  const shown = world
    ? Object.values(world.areas)
        .filter((a) => a.kind === "system")
        .map((a) => ({ id: a.id, name: a.name, type: a.type, x: a.position.x * WORLD_SCALE, y: a.position.y * WORLD_SCALE, z: a.position.z * WORLD_SCALE }))
    : starSystems;
  const lanes = world
    ? world.paths
        .filter((p) => p.kind === "hyperlane")
        .map((p) => ({ id: p.id, ends: [p.from, p.to].map((id) => shown.find((s) => s.id === id)) }))
        .filter((lane) => lane.ends[0] && lane.ends[1])
    : [];
  const hereSystem = world && hereId ? trailOf(world, hereId).find((a) => a.kind === "system")?.id : undefined;

  return (
    <>
      {/* Galaxy background */}
      {world ? (
        <color attach="background" args={["#00000c"]} />
      ) : (
        <mesh position={[0, 0, -100]}>
          <planeGeometry args={[500, 500]} />
          <meshBasicMaterial color="#000020" />
        </mesh>
      )}

      {/* Galaxy dust */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2000}
            array={generateGalaxyDust()}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.5} color="#8080ff" sizeAttenuation />
      </points>

      {/* Galaxy arms */}
      <group ref={galaxyRef}>
        {generateGalaxyArms(4, 100).map((arm, index) => (
          <line key={`arm-${index}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={arm.length / 3}
                array={new Float32Array(arm)}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#404080" opacity={0.5} transparent />
          </line>
        ))}

        {/* Hyperlanes between the systems of a generated world */}
        {lanes.map((lane) => (
          <line key={lane.id}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array(lane.ends.flatMap((s) => [s!.x, s!.y, s!.z]))}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#60a0ff" opacity={0.6} transparent />
          </line>
        ))}

        {/* Star systems */}
        {shown.map((system) => (
          <group key={system.id} position={[system.x, system.y, system.z]}>
            {/* A wider target than the star itself, for a finger */}
            <mesh onClick={(e) => handleSystemClick(e, system.id)}>
              <sphereGeometry args={[3, 8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh
              onClick={(e) => handleSystemClick(e, system.id)}
              onPointerOver={() => setHoveredSystem(system.id)}
              onPointerOut={() => setHoveredSystem(null)}
            >
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial
                color={
                  picked === system.id || hereSystem === system.id
                    ? "#ffff00"
                    : hoveredSystem === system.id
                      ? "#ffaa00"
                      : getStarColor(system.type)
                }
                emissive={
                  picked === system.id
                    ? "#ffff00"
                    : hoveredSystem === system.id
                      ? "#ffaa00"
                      : getStarColor(system.type)
                }
                emissiveIntensity={
                  picked === system.id
                    ? 2
                    : hoveredSystem === system.id
                      ? 1.5
                      : 1
                }
              />
            </mesh>

            {/* System label: in a campaign's galaxy it faces whoever is looking */}
            {world ? (
              <Billboard position={[0, 3.2, 0]}>
                <Text fontSize={2.6} color={hereSystem === system.id ? "#ffcc00" : "white"} anchorX="center" anchorY="middle" outlineWidth={0.2} outlineColor="#000000">
                  {system.name.replace(/ System$/, "")}
                </Text>
              </Billboard>
            ) : (
              <Text
                position={[0, 2, 0]}
                fontSize={2}
                color="white"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.1}
                outlineColor="#000000"
              >
                {system.name}
              </Text>
            )}
            {world && (picked === system.id || hereSystem === system.id) && (
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.2, 2.7, 32]} />
                <meshBasicMaterial color={hereSystem === system.id ? "#ffcc00" : "#7dd3fc"} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        ))}
      </group>

      {world && (
        <Probe
          locate={(key) => {
            const system = shown.find((x) => `area:${x.id}` === key);
            return system && galaxyRef.current ? (galaxyRef.current.localToWorld(new THREE.Vector3(system.x, system.y, system.z)).toArray() as [number, number, number]) : undefined;
          }}
        />
      )}

      {/* Controls */}
      {world ? (
        <Rig target={[0, 0, 0]} offset={[0, 78, 58]} min={15} max={220} />
      ) : (
        <OrbitControls
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
          minDistance={20}
          maxDistance={200}
        />
      )}

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
    </>
  );
}

// Generate galaxy dust particles
function generateGalaxyDust() {
  const positions = new Float32Array(2000 * 3);

  for (let i = 0; i < positions.length; i += 3) {
    const r = 70 * Math.random();
    const theta = 2 * Math.PI * Math.random();

    positions[i] = r * Math.cos(theta);
    positions[i + 1] = (Math.random() - 0.5) * 10;
    positions[i + 2] = r * Math.sin(theta);
  }

  return positions;
}

// Generate galaxy spiral arms
function generateGalaxyArms(arms: number, pointsPerArm: number) {
  const armPoints: number[][] = [];

  for (let a = 0; a < arms; a++) {
    const arm: number[] = [];
    const armAngle = (a / arms) * 2 * Math.PI;

    for (let i = 0; i < pointsPerArm; i++) {
      const r = 5 + i * 0.5;
      const theta = armAngle + i / 30;

      arm.push(
        r * Math.cos(theta),
        (Math.random() - 0.5) * 2,
        r * Math.sin(theta),
      );
    }

    armPoints.push(arm);
  }

  return armPoints;
}

// Get color based on star type
function getStarColor(type: string) {
  switch (type) {
    case "O":
      return "#9bb0ff"; // Blue
    case "B":
      return "#aabfff"; // Blue-white
    case "A":
      return "#cad7ff"; // White
    case "F":
      return "#f8f7ff"; // Yellow-white
    case "G":
      return "#fff4ea"; // Yellow
    case "K":
      return "#ffd2a1"; // Orange
    case "M":
      return "#ffcc6f"; // Red
    default:
      return "#ffffff"; // White
  }
}
