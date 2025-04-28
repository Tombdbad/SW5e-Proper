import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function GalaxyBackground() {
  const starsRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);

  // Generate star particles
  const starGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(10000 * 3);
    const colors = new Float32Array(10000 * 3);

    for (let i = 0; i < 10000; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 2000;
      positions[i3 + 1] = (Math.random() - 0.5) * 2000;
      positions[i3 + 2] = (Math.random() - 0.5) * 2000;

      // Vary star colors
      const color = new THREE.Color();
      color.setHSL(Math.random(), 0.2, 0.8);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, []);

  // Generate dust particles
  const dustGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(5000 * 3);
    const colors = new Float32Array(5000 * 3);

    for (let i = 0; i < 5000; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 300;
      const i3 = i * 3;

      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = (Math.random() - 0.5) * 50;
      positions[i3 + 2] = Math.sin(angle) * radius;

      const color = new THREE.Color();
      color.setHSL(0.6, 0.2, 0.5);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, []);

  useFrame(({ clock }) => {
    if (starsRef.current) {
      starsRef.current.rotation.y = clock.getElapsedTime() * 0.02;
    }
    if (dustRef.current) {
      dustRef.current.rotation.y = clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <>
      <points ref={starsRef} geometry={starGeometry}>
        <pointsMaterial
          size={1.5}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>
      <points ref={dustRef} geometry={dustGeometry}>
        <pointsMaterial
          size={2}
          vertexColors
          transparent
          opacity={0.4}
          sizeAttenuation
        />
      </points>
    </>
  );
}