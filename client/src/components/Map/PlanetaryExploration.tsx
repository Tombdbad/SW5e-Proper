
import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three/src/loaders/TextureLoader';

interface TerrainProps {
  heightMap: string;
  texture: string;
  scale?: number;
}

const Terrain: React.FC<TerrainProps> = ({ heightMap, texture, scale = 1 }) => {
  const heightMapTexture = useLoader(TextureLoader, heightMap);
  const surfaceTexture = useLoader(TextureLoader, texture);
  
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
  
  useEffect(() => {
    if (mesh.current) {
      const positions = geometry.attributes.position;
      
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const height = heightMapTexture.image.data[i] * scale;
        positions.setZ(i, height);
      }
      
      geometry.computeVertexNormals();
    }
  }, [heightMapTexture, scale]);

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[100, 100, 100, 100]} />
      <meshStandardMaterial
        map={surfaceTexture}
        displacementMap={heightMapTexture}
        displacementScale={scale}
      />
    </mesh>
  );
};

interface PlanetaryExplorationProps {
  planetData: {
    name: string;
    terrain: string[];
    climate: string;
    pointsOfInterest: { name: string; position: [number, number, number] }[];
  };
}

export default function PlanetaryExploration({ planetData }: PlanetaryExplorationProps) {
  return (
    <div className="w-full h-screen">
      <Canvas camera={{ position: [0, 50, 100], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[100, 100, 100]} intensity={1} />
        <Stars radius={300} depth={50} count={5000} factor={4} />
        
        <Terrain
          heightMap="/textures/height-map.png"
          texture={`/textures/${planetData.terrain[0]}.jpg`}
          scale={20}
        />
        
        {planetData.pointsOfInterest.map((poi, index) => (
          <group key={index} position={poi.position}>
            <mesh>
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial color="yellow" />
            </mesh>
            <Html position={[0, 2, 0]}>
              <div className="text-white bg-black bg-opacity-50 p-2 rounded">
                {poi.name}
              </div>
            </Html>
          </group>
        ))}
        
        <OrbitControls />
      </Canvas>
    </div>
  );
}
