
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GalaxyBackgroundProps {
  size?: number;
  density?: number;
  color?: string;
  rotation?: boolean;
}

export const GalaxyBackground: React.FC<GalaxyBackgroundProps> = ({
  size = 1000,
  density = 5000,
  color = '#4060ff',
  rotation = true
}) => {
  const particlesRef = useRef<THREE.Points>(null);
  const spiralDustRef = useRef<THREE.Points>(null);

  // Create background stars
  const starsGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(density * 3);
    const colors = new Float32Array(density * 3);
    const sizes = new Float32Array(density);

    // Star color variations
    const starTypes = [
      { color: new THREE.Color('#ffffff'), probability: 0.5 }, // White
      { color: new THREE.Color('#b0c0ff'), probability: 0.3 }, // Blue-white
      { color: new THREE.Color('#ffcc99'), probability: 0.15 }, // Yellow
      { color: new THREE.Color('#ff9966'), probability: 0.05 }  // Red
    ];

    for (let i = 0; i < density; i++) {
      const radius = size * (0.5 + Math.random() * 0.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      let starColor;
      const rand = Math.random();
      let probSum = 0;
      
      for (const type of starTypes) {
        probSum += type.probability;
        if (rand <= probSum) {
          starColor = type.color;
          break;
        }
      }
      
      starColor = starColor || starTypes[0].color;
      
      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;
      
      sizes[i] = 0.5 + Math.pow(Math.random(), 3) * 2.5;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    return geometry;
  }, [size, density]);
  
  const spiralDustGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const spiralCount = 5;
    const particlesPerSpiral = 2000;
    const totalParticles = spiralCount * particlesPerSpiral;
    
    const positions = new Float32Array(totalParticles * 3);
    const colors = new Float32Array(totalParticles * 3);
    const sizes = new Float32Array(totalParticles);
    
    const dustColor = new THREE.Color(color);
    const dustColorVariation1 = new THREE.Color(color).offsetHSL(0.1, 0, 0);
    const dustColorVariation2 = new THREE.Color(color).offsetHSL(-0.1, 0, 0);
    
    const galaxyRadius = size * 0.4;
    const spiralTightness = 4;
    
    for (let s = 0; s < spiralCount; s++) {
      const spiralOffset = (s / spiralCount) * Math.PI * 2;
      
      for (let i = 0; i < particlesPerSpiral; i++) {
        const idx = s * particlesPerSpiral + i;
        const posIdx = idx * 3;
        const colorIdx = idx * 3;
        
        const distanceRatio = 0.1 + 0.9 * Math.pow(i / particlesPerSpiral, 0.7);
        const distance = galaxyRadius * distanceRatio;
        const angle = spiralOffset + distanceRatio * spiralTightness * Math.PI * 2;
        
        const randomAngle = angle + (Math.random() - 0.5) * 0.3;
        const randomDistance = distance * (0.9 + Math.random() * 0.2);
        
        positions[posIdx] = Math.cos(randomAngle) * randomDistance;
        positions[posIdx + 1] = (Math.random() - 0.5) * galaxyRadius * 0.1;
        positions[posIdx + 2] = Math.sin(randomAngle) * randomDistance;
        
        let particleColor;
        const colorRand = Math.random();
        
        if (colorRand < 0.5) {
          particleColor = dustColor;
        } else if (colorRand < 0.75) {
          particleColor = dustColorVariation1;
        } else {
          particleColor = dustColorVariation2;
        }
        
        const fade = 0.5 + 0.5 * distanceRatio;
        colors[colorIdx] = particleColor.r * fade;
        colors[colorIdx + 1] = particleColor.g * fade;
        colors[colorIdx + 2] = particleColor.b * fade;
        
        sizes[idx] = 2 + (1 - distanceRatio) * 3;
      }
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    return geometry;
  }, [size, color]);
  
  const starsMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        
        void main() {
          vColor = color;
          float twinkle = sin(time * 0.5 + gl_VertexID * 0.1) * 0.5 + 0.5;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z) * (0.8 + 0.2 * twinkle);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
          if (distanceFromCenter > 0.5) {
            discard;
          }
          float strength = 1.0 - (distanceFromCenter * 2.0);
          strength = pow(strength, 1.5);
          gl_FragColor = vec4(vColor, strength);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }, []);
  
  const dustMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        
        void main() {
          vColor = color;
          vec3 pos = position;
          float movement = sin(time * 0.05 + position.x * 0.01 + position.z * 0.01) * 0.5;
          pos.y += movement;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
          if (distanceFromCenter > 0.5) {
            discard;
          }
          float strength = 1.0 - (distanceFromCenter * 2.0);
          strength = pow(strength, 2.0);
          gl_FragColor = vec4(vColor, strength * 0.6);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }, []);
  
  useFrame(({ clock }) => {
    if (particlesRef.current) {
      const material = particlesRef.current.material as THREE.ShaderMaterial;
      material.uniforms.time.value = clock.getElapsedTime();
    }
    
    if (spiralDustRef.current && rotation) {
      spiralDustRef.current.rotation.y += 0.0001;
      const material = spiralDustRef.current.material as THREE.ShaderMaterial;
      material.uniforms.time.value = clock.getElapsedTime();
    }
  });
  
  return (
    <group>
      <points ref={particlesRef} geometry={starsGeometry}>
        <primitive object={starsMaterial} attach="material" />
      </points>
      <points ref={spiralDustRef} geometry={spiralDustGeometry}>
        <primitive object={dustMaterial} attach="material" />
      </points>
    </group>
  );
};
