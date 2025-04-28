import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useKeyboardControls } from "@react-three/drei";
import { useMap } from "@/lib/stores/useMap";

// Local map terrain and objects
export default function LocalMap() {
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
