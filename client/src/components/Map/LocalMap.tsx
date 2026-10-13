import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { useMap } from "@/lib/stores/useMap";
import { childrenOf, type Area, type World } from "@shared/logic";

interface LocalMapProps {
  // The campaign's generated world and the area to centre on: its layer is drawn as a schematic
  world?: World | null;
  hereId?: string | null;
  // A place on the map was tapped
  onSelect?: (areaId: string) => void;
}

const LAYER_NAME: Record<string, string> = { room: "Rooms of", building: "Streets of", settlement: "Surface of", planet: "Orbits of", system: "Systems of", region: "Regions of" };

// One layer of the world: the place the party is in and the places beside it (the rooms of a
// building, the buildings of a settlement, the sites on a planet, the planets of a system), with
// the paths that join them. The same places and paths as the Location panel lists.
function WorldLayer({ world, hereId, onSelect }: { world: World; hereId: string; onSelect?: (areaId: string) => void }) {
  const { camera } = useThree();
  const here = world.areas[hereId];
  const places: Area[] = here.parentId ? childrenOf(world, here.parentId).filter((a) => a.kind === here.kind) : [here];
  const ids = new Set(places.map((a) => a.id));
  const paths = world.paths.filter((p) => ids.has(p.from) && ids.has(p.to) && !p.hidden);

  // Fit the layer into about 50 units, whatever scale it was generated at
  const xs = places.map((a) => a.position.x);
  const zs = places.map((a) => a.position.z);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const scale = Math.min(6, 50 / extent);
  const at = (a: Area): [number, number, number] => [(a.position.x - centre.x) * scale, 0, (a.position.z - centre.z) * scale];

  useEffect(() => {
    camera.position.set(0, 42, 30);
    camera.lookAt(0, 0, 0);
  }, [camera, hereId]);

  const round = here.kind === "planet" || here.kind === "system" || here.kind === "settlement";
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshBasicMaterial color="#0b1220" />
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
            <mesh>
              {round ? <sphereGeometry args={[1.6, 20, 20]} /> : <boxGeometry args={[3.2, 1.2, 3.2]} />}
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={current ? 0.6 : 0.25} />
            </mesh>
            {current && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
                <ringGeometry args={[2.8, 3.3, 32]} />
                <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
              </mesh>
            )}
            {/* Names face the viewer however the map is turned */}
            <Billboard position={[0, 3.4, 0]}>
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
