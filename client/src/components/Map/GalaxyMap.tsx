import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { starSystems } from "@/lib/sw5e/starSystems";
import { useMap } from "@/lib/stores/useMap";

export default function GalaxyMap() {
  const { selectStarSystem, selectedStarSystem } = useMap();
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null);
  const galaxyRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  
  // Galaxy rotation
  useFrame((_, delta) => {
    if (galaxyRef.current) {
      galaxyRef.current.rotation.y += delta * 0.05;
    }
  });
  
  // Handle system selection
  const handleSystemClick = (systemId: string) => {
    selectStarSystem(systemId);
  };

  return (
    <>
      {/* Galaxy background */}
      <mesh position={[0, 0, -100]}>
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial color="#000020" />
      </mesh>
      
      {/* Galaxy dust */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2000}
            array={generateGalaxyDust()}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.5} color="#8080ff" sizeAttenuation />
      </points>
      
      {/* Galaxy arms */}
      <group ref={galaxyRef}>
        {generateGalaxyArms(4, 100).map((arm, index) => (
          <line key={`arm-${index}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={arm.length / 3}
                array={new Float32Array(arm)}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#404080" opacity={0.5} transparent />
          </line>
        ))}
        
        {/* Star systems */}
        {starSystems.map((system) => (
          <group key={system.id} position={[system.x, system.y, system.z]}>
            <mesh
              onClick={() => handleSystemClick(system.id)}
              onPointerOver={() => setHoveredSystem(system.id)}
              onPointerOut={() => setHoveredSystem(null)}
            >
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial 
                color={selectedStarSystem === system.id ? "#ffff00" : hoveredSystem === system.id ? "#ffaa00" : getStarColor(system.type)} 
                emissive={selectedStarSystem === system.id ? "#ffff00" : hoveredSystem === system.id ? "#ffaa00" : getStarColor(system.type)}
                emissiveIntensity={selectedStarSystem === system.id ? 2 : hoveredSystem === system.id ? 1.5 : 1}
              />
            </mesh>
            
            {/* System label */}
            <Text
              position={[0, 2, 0]}
              fontSize={2}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.1}
              outlineColor="#000000"
            >
              {system.name}
            </Text>
          </group>
        ))}
      </group>
      
      {/* Controls */}
      <OrbitControls 
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        minDistance={20}
        maxDistance={200}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
    </>
  );
}

// Generate galaxy dust particles
function generateGalaxyDust() {
  const positions = new Float32Array(2000 * 3);
  
  for (let i = 0; i < positions.length; i += 3) {
    const r = 70 * Math.random();
    const theta = 2 * Math.PI * Math.random();
    
    positions[i] = r * Math.cos(theta);
    positions[i + 1] = (Math.random() - 0.5) * 10;
    positions[i + 2] = r * Math.sin(theta);
  }
  
  return positions;
}

// Generate galaxy spiral arms
function generateGalaxyArms(arms: number, pointsPerArm: number) {
  const armPoints: number[][] = [];
  
  for (let a = 0; a < arms; a++) {
    const arm: number[] = [];
    const armAngle = (a / arms) * 2 * Math.PI;
    
    for (let i = 0; i < pointsPerArm; i++) {
      const r = 5 + i * 0.5;
      const theta = armAngle + (i / 30);
      
      arm.push(
        r * Math.cos(theta),
        (Math.random() - 0.5) * 2,
        r * Math.sin(theta)
      );
    }
    
    armPoints.push(arm);
  }
  
  return armPoints;
}

// Get color based on star type
function getStarColor(type: string) {
  switch (type) {
    case "O": return "#9bb0ff"; // Blue
    case "B": return "#aabfff"; // Blue-white
    case "A": return "#cad7ff"; // White
    case "F": return "#f8f7ff"; // Yellow-white
    case "G": return "#fff4ea"; // Yellow
    case "K": return "#ffd2a1"; // Orange
    case "M": return "#ffcc6f"; // Red
    default: return "#ffffff"; // White
  }
}
