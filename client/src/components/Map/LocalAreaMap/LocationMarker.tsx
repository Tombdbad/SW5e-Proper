import { useEffect, useRef } from 'react';
import { useSpring, animated } from '@react-spring/three';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface LocationMarkerProps {
  position: [number, number, number];
  name: string;
  type: string;
  onSelect?: () => void;
}

export default function LocationMarker({ position, name, type, onSelect }: LocationMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [spring, api] = useSpring(() => ({
    scale: 1,
    config: { mass: 1, tension: 280, friction: 60 }
  }));

  useEffect(() => {
    const handlePointerOver = () => api.start({ scale: 1.2 });
    const handlePointerOut = () => api.start({ scale: 1 });

    const mesh = meshRef.current;
    if (mesh) {
      mesh.addEventListener('pointerover', handlePointerOver);
      mesh.addEventListener('pointerout', handlePointerOut);
    }

    return () => {
      if (mesh) {
        mesh.removeEventListener('pointerover', handlePointerOver);
        mesh.removeEventListener('pointerout', handlePointerOut);
      }
    };
  }, []);

  return (
    <animated.mesh
      ref={meshRef}
      position={position}
      scale={spring.scale}
      onClick={onSelect}
      cursor="pointer"
    >
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial
        color={type === 'city' ? '#4CAF50' : type === 'poi' ? '#2196F3' : '#FFC107'}
        emissive={type === 'city' ? '#1B5E20' : type === 'poi' ? '#0D47A1' : '#FF6F00'}
        emissiveIntensity={0.5}
      />
      <Html distanceFactor={10}>
        <div className="px-2 py-1 bg-black/75 text-white rounded text-sm whitespace-nowrap">
          {name}
        </div>
      </Html>
    </animated.mesh>
  );
}