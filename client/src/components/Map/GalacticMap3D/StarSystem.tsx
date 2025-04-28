
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';

interface StarSystemProps {
  system: {
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    z: number;
  };
  selected: boolean;
  onSelect: (id: string) => void;
}

const starColors = {
  'main-sequence': 0xffffff,
  'red-giant': 0xff4500,
  'white-dwarf': 0xf0f8ff,
  'neutron-star': 0x00ffff,
  'black-hole': 0x000000,
  'binary': 0xffff00,
  'default': 0xffffff
};

export const PulsatingStarSystem: React.FC<StarSystemProps> = ({ system, selected, onSelect }) => {
  const starRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  const baseColor = starColors[system.type as keyof typeof starColors] || starColors.default;
  const starColor = new THREE.Color(baseColor);
  
  const { scale } = useSpring({
    scale: selected ? 1.5 : 1,
    config: { tension: 300, friction: 10 }
  });
  
  useFrame((state) => {
    if (starRef.current && glowRef.current) {
      const hash = system.id.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      
      const frequency = 0.5 + (Math.abs(hash) % 10) / 20;
      const phase = (Math.abs(hash) % 100) / 100;
      
      const pulse = Math.sin(state.clock.elapsedTime * frequency + phase) * 0.1 + 0.9;
      
      starRef.current.scale.setScalar(pulse);
      glowRef.current.scale.setScalar(pulse * 1.3);
      
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = pulse * 0.7;
    }
  });
  
  return (
    <group position={[system.x, system.y, system.z]} onClick={() => onSelect(system.id)}>
      <animated.mesh ref={starRef} scale={scale}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={starColor} />
      </animated.mesh>
      
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial 
          color={starColor} 
          transparent={true} 
          opacity={0.5}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {selected && (
        <mesh>
          <ringGeometry args={[0.6, 0.7, 32]} />
          <meshBasicMaterial color={0xffffff} transparent={true} opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};
