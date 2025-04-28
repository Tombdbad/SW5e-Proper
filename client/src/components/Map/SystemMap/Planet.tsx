
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

interface PlanetProps {
  name: string;
  type: string;
  size: number;
  position: [number, number, number];
  orbitRadius: number;
  orbitSpeed?: number;
  rotationSpeed?: number;
  onSelect?: () => void;
  selected?: boolean;
}

const Planet: React.FC<PlanetProps> = ({
  name,
  type,
  size,
  position,
  orbitRadius,
  orbitSpeed = 1,
  rotationSpeed = 1,
  onSelect,
  selected
}) => {
  const planetRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  // Define planet textures based on type
  const getTextureByType = (type: string) => {
    switch (type.toLowerCase()) {
      case 'desert':
        return '/textures/sand.jpg';
      case 'terrestrial':
        return '/textures/grass.png';
      case 'ice':
        return '/textures/sky.png';
      default:
        return '/textures/asphalt.png';
    }
  };

  // Load texture
  const texture = useTexture(getTextureByType(type));

  // Planet material properties
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.2,
    });
  }, [texture]);

  // Animate planet rotation and orbit
  useFrame(({ clock }) => {
    if (planetRef.current && meshRef.current) {
      // Orbit animation
      const orbitAngle = clock.getElapsedTime() * orbitSpeed * 0.5;
      planetRef.current.position.x = Math.cos(orbitAngle) * orbitRadius;
      planetRef.current.position.z = Math.sin(orbitAngle) * orbitRadius;
      
      // Self rotation
      meshRef.current.rotation.y += rotationSpeed * 0.01;
    }
  });

  return (
    <group ref={planetRef} position={position}>
      <mesh 
        ref={meshRef}
        onClick={onSelect}
        receiveShadow
        castShadow
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial {...material} />
      </mesh>

      {/* Selection indicator */}
      {selected && (
        <mesh>
          <ringGeometry args={[size * 1.2, size * 1.3, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
};

export default Planet;
