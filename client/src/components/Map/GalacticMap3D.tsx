import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Coordinates } from '@/lib/coordinates';
import TranslucentPane from '../ui/TranslucentPane';

// Define star system type for 3D visualization
// This is a simplified version for rendering, different from the data structure
interface GalaxyStarSystem {
  id: number;
  name: string;
  position: [number, number, number];
  type: 'main' | 'neutron' | 'dwarf' | 'giant';
  size: number;
  color: string;
  planets?: Planet[];
  selected?: boolean;
}

// Use GalaxyStarSystem for local rendering, different from the imported starSystems
type StarSystem = GalaxyStarSystem;

// Define planet type
interface Planet {
  id: number;
  name: string;
  position: [number, number, number];
  size: number;
  color: string;
  type: string;
  selected?: boolean;
}

// Star component
const Star: React.FC<{
  system: StarSystem;
  onSelect: (id: number) => void;
}> = ({ system, onSelect }) => {
  const ref = useRef<THREE.Mesh>(null);
  
  // Pulsate effect for stars
  useFrame(({ clock }) => {
    if (ref.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 0.5) * 0.05;
      ref.current.scale.set(scale, scale, scale);
    }
  });
  
  return (
    <group position={system.position}>
      <mesh 
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(system.id);
        }}
      >
        <sphereGeometry args={[system.size, 32, 32]} />
        <meshStandardMaterial color={system.color} emissive={system.color} emissiveIntensity={1} />
      </mesh>
      
      {/* Star glow */}
      <mesh>
        <sphereGeometry args={[system.size * 1.2, 32, 32]} />
        <meshBasicMaterial 
          color={system.color} 
          transparent 
          opacity={0.2} 
          side={THREE.BackSide} 
        />
      </mesh>
      
      {/* Star name */}
      <Text
        position={[0, system.size * 1.5, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {system.name}
      </Text>
      
      {/* Selection indicator */}
      {system.selected && (
        <mesh>
          <ringGeometry args={[system.size * 1.5, system.size * 1.6, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

// GalaxyDust component
const GalaxyDust: React.FC = () => {
  const { scene } = useThree();
  const dustRef = useRef<THREE.Points>(null);

  useEffect(() => {
    // Create galaxy dust
    const particleCount = 10000;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const colorOptions = [
      new THREE.Color('#8080ff'), // Blue
      new THREE.Color('#80ffff'), // Cyan
      new THREE.Color('#ff80ff'), // Magenta
      new THREE.Color('#ffffff'), // White
    ];
    
    for (let i = 0; i < particleCount; i++) {
      // Galaxy is a flat disc with spiral arms
      const radius = Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      
      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);
      const y = (Math.random() - 0.5) * 5; // Thin disc
      
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      
      // Random color from options
      const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });
    
    const points = new THREE.Points(particles, material);
    scene.add(points);
    
    return () => {
      scene.remove(points);
      particles.dispose();
      material.dispose();
    };
  }, [scene]);
  
  // Slow rotation
  useFrame(({ clock }) => {
    if (dustRef.current) {
      dustRef.current.rotation.y = clock.getElapsedTime() * 0.02;
    }
  });
  
  return <group ref={dustRef} />;
};

// Main GalacticMap3D component
interface GalacticMap3DProps {
  onSelectSystem?: (systemId: number, systemName: string) => void;
}

const GalacticMap3D: React.FC<GalacticMap3DProps> = ({ onSelectSystem }) => {
  const [systems, setSystems] = useState<StarSystem[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates>({});
  const [loading, setLoading] = useState(true);

  // Use data from the SW5E locations library with proper coordinates
  useEffect(() => {
    // Star Wars canonical systems data with hierarchical coordinates
    const SW5ESystems: StarSystem[] = [
      {
        id: 1,
        name: 'Coruscant System',
        position: [0, 0, 0], // Core Worlds - Galactic Center
        type: 'main',
        size: 2,
        color: '#ffff80',
        planets: [
          { 
            id: 1, 
            name: 'Coruscant', 
            position: [5, 0, 0], 
            size: 1, 
            color: '#80b280', 
            type: 'ecumenopolis' // City-covered world
          },
          { 
            id: 2, 
            name: 'Hesperidium', 
            position: [8, 0, 5], 
            size: 0.7, 
            color: '#a04040', 
            type: 'terrestrial' 
          },
        ]
      },
      {
        id: 2,
        name: 'Tatoo System',
        position: [15, 0, 20], // Outer Rim - Arkanis Sector
        type: 'dwarf',
        size: 1.5,
        color: '#ffb060',
        planets: [
          { 
            id: 3, 
            name: 'Tatooine', 
            position: [3, 0, 0], 
            size: 0.8, 
            color: '#d0b060', 
            type: 'desert' 
          }
        ]
      },
      {
        id: 3,
        name: 'Hoth System',
        position: [-20, 5, -15], // Outer Rim - Anoat Sector
        type: 'giant',
        size: 2.5,
        color: '#80c0ff',
        planets: [
          { 
            id: 4, 
            name: 'Hoth', 
            position: [6, 0, 0], 
            size: 0.9, 
            color: '#ffffff', 
            type: 'ice' 
          }
        ]
      },
      {
        id: 4,
        name: 'Naboo System',
        position: [25, -2, -22], // Mid Rim - Chommell Sector
        type: 'main',
        size: 1.8,
        color: '#ffffa0',
        planets: [
          { 
            id: 5, 
            name: 'Naboo', 
            position: [4, 0, 0], 
            size: 1.1, 
            color: '#60a0c0', 
            type: 'terrestrial' 
          }
        ]
      },
      {
        id: 5,
        name: 'Kashyyyk System',
        position: [-15, 3, 28], // Mid Rim - Mytaranor Sector
        type: 'main',
        size: 2.1,
        color: '#ffa040',
        planets: [
          { 
            id: 6, 
            name: 'Kashyyyk', 
            position: [5, 0, 0], 
            size: 1.2, 
            color: '#408060', 
            type: 'terrestrial' 
          }
        ]
      },
      {
        id: 6,
        name: 'Yavin System',
        position: [-28, 4, 15], // Outer Rim - Gordian Reach
        type: 'giant',
        size: 2.2,
        color: '#ff8040',
        planets: [
          { 
            id: 7, 
            name: 'Yavin IV', 
            position: [7, 0, 0], 
            size: 0.9, 
            color: '#40a040', 
            type: 'terrestrial' 
          }
        ]
      },
      {
        id: 7,
        name: 'Dagobah System',
        position: [30, -5, 25], // Outer Rim - Sluis Sector
        type: 'dwarf',
        size: 1.3,
        color: '#80f080',
        planets: [
          { 
            id: 8, 
            name: 'Dagobah', 
            position: [3, 0, 0], 
            size: 0.85, 
            color: '#306030', 
            type: 'swamp' 
          }
        ]
      },
      {
        id: 8,
        name: 'Bespin System',
        position: [-18, 0, -22], // Outer Rim - Anoat Sector
        type: 'giant',
        size: 2.3,
        color: '#ffb080',
        planets: [
          { 
            id: 9, 
            name: 'Bespin', 
            position: [4, 0, 0], 
            size: 1.3, 
            color: '#ffa080', 
            type: 'gas giant' 
          }
        ]
      },
      {
        id: 9,
        name: 'Endor System',
        position: [33, 2, -18], // Outer Rim - Moddell Sector
        type: 'main',
        size: 1.9,
        color: '#ffffff',
        planets: [
          { 
            id: 10, 
            name: 'Endor', 
            position: [8, 0, 0], 
            size: 1.1, 
            color: '#40a040', 
            type: 'forest moon' 
          }
        ]
      },
      {
        id: 10,
        name: 'Kamino System',
        position: [40, 1, 12], // Wild Space - Extragalactic Region
        type: 'main',
        size: 1.7,
        color: '#80a0ff',
        planets: [
          { 
            id: 11, 
            name: 'Kamino', 
            position: [5, 0, 0], 
            size: 0.95, 
            color: '#4080c0', 
            type: 'ocean' 
          }
        ]
      }
    ];
    
    setSystems(SW5ESystems);
    
    // Set initial galactic coordinates
    setCoordinates({ galactic: "Star Wars Galaxy" });
    setLoading(false);
  }, []);

  // Handle system selection
  const handleSelectSystem = (id: number) => {
    const system = systems.find(s => s.id === id);
    if (system && onSelectSystem) {
      // Highlight the selected system
      setSystems(systems.map(s => ({
        ...s,
        selected: s.id === id
      })));
      
      // Notify parent component
      onSelectSystem(id, system.name);
    }
  };

  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showTradeRoutes, setShowTradeRoutes] = useState(false);
  const [showFactionTerritories, setShowFactionTerritories] = useState(false);

  return (
    <div className="w-full h-full">
      <div className="absolute top-4 right-4 z-10 space-y-2">
        <TranslucentPane className="p-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-yellow-400">Map Controls</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showTradeRoutes}
                  onChange={(e) => setShowTradeRoutes(e.target.checked)}
                  className="mr-2"
                />
                Show Trade Routes
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showFactionTerritories}
                  onChange={(e) => setShowFactionTerritories(e.target.checked)}
                  className="mr-2"
                />
                Show Faction Territories
              </label>
            </div>
          </div>
        </TranslucentPane>
      </div>

      {/* 3D Galaxy Map */}
      <div className="relative w-full h-[600px]">
        <Canvas camera={{ position: [0, 30, 50], fov: 60 }}>
          <ambientLight intensity={0.2} />
          <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
          
          {/* Background stars */}
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade />
          
          {/* Galaxy dust */}
          <GalaxyDust />
          
          {/* Star systems */}
          {systems.map(system => (
            <Star key={system.id} system={system} onSelect={handleSelectSystem} />
          ))}
          
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        </Canvas>
        
        {/* Current Location */}
        <div className="absolute bottom-4 right-4">
          <TranslucentPane className="p-4" opacity="medium">
            <h3 className="font-medium mb-1">Coordinates</h3>
            <div className="text-sm">
              <div>Galaxy Overview</div>
              <div className="text-xs mt-1 text-gray-400">
                Click on any star system to view its planets
              </div>
            </div>
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default GalacticMap3D;