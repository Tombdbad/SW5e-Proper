import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";

// 3D dice model component
const DiceModel: React.FC<{
  size: number;
  sides: number;
  result?: number;
  rolling?: boolean;
}> = ({ size, sides, result, rolling = false }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [rotation, setRotation] = useState(() => new THREE.Euler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  ));

  // Rotate the dice when rolling
  useFrame(() => {
    if (!meshRef.current || !rolling) return;
    
    meshRef.current.rotation.x += 0.05;
    meshRef.current.rotation.y += 0.08;
    meshRef.current.rotation.z += 0.03;
  });

  // Update rotation when the result changes
  useEffect(() => {
    if (!rolling && result) {
      setRotation(new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ));
    }
  }, [result, rolling]);

  // Get appropriate geometry based on dice sides
  const getGeometry = () => {
    switch (sides) {
      case 4:
        return <tetrahedronGeometry args={[size * 0.8, 0]} />;
      case 6:
        return <boxGeometry args={[size, size, size]} />;
      case 8:
        return <octahedronGeometry args={[size * 0.7, 0]} />;
      case 10:
        // Approximation - in a real app would need a custom geometry
        return <dodecahedronGeometry args={[size * 0.6, 0]} />;
      case 12:
        return <dodecahedronGeometry args={[size * 0.6, 0]} />;
      case 20:
        return <icosahedronGeometry args={[size * 0.6, 0]} />;
      default:
        return <boxGeometry args={[size, size, size]} />;
    }
  };

  return (
    <mesh ref={meshRef} rotation={[rotation.x, rotation.y, rotation.z]}>
      {getGeometry()}
      <meshStandardMaterial 
        color={sides === 20 ? "#bb3333" : "#dddddd"} 
        roughness={0.3}
        metalness={0.2}
      />
      
      {result && !rolling && (
        <Text
          position={[0, 0, size * 0.6]}
          fontSize={size * 0.5}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {result}
        </Text>
      )}
    </mesh>
  );
};

// Main Dice component that renders the 3D dice
export const Dice: React.FC<{
  size?: number;
  sides?: number;
  result?: number;
  rolling?: boolean;
  onRoll?: (result: number) => void;
}> = ({ size = 30, sides = 20, result, rolling, onRoll }) => {
  return (
    <div style={{ width: size * 3, height: size * 3 }}>
      <Canvas camera={{ position: [0, 0, size * 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <DiceModel 
          size={size / 10} 
          sides={sides} 
          result={result} 
          rolling={rolling} 
        />
      </Canvas>
    </div>
  );
};
