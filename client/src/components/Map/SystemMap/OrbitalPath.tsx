
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OrbitalPathProps {
  radius: number;
  color?: string;
  planetType?: string;
  animated?: boolean;
}

const OrbitalPath: React.FC<OrbitalPathProps> = ({ 
  radius, 
  color = '#ffffff', 
  planetType = 'terrestrial',
  animated = true 
}) => {
  const ref = useRef<THREE.Mesh>(null);
  
  // Create orbit path geometry
  const geometry = useMemo(() => {
    const curve = new THREE.EllipseCurve(
      0, 0,            // Center x, y
      radius, radius,  // xRadius, yRadius
      0, 2 * Math.PI,  // Start angle, end angle
      false,           // Clockwise
      0               // Rotation
    );
    
    const points = curve.getPoints(128);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [radius]);
  
  // Animate orbit path if enabled
  useFrame(({ clock }) => {
    if (animated && ref.current) {
      ref.current.rotation.z = clock.getElapsedTime() * 0.1;
    }
  });
  
  return (
    <line ref={ref}>
      <bufferGeometry attach="geometry" {...geometry} />
      <lineBasicMaterial 
        attach="material" 
        color={color} 
        transparent 
        opacity={0.4} 
        linewidth={1} 
      />
    </line>
  );
};

export default OrbitalPath;
