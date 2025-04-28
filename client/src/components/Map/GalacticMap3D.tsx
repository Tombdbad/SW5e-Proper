import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Coordinates } from '../../../shared/coordinates';
import TranslucentPane from '../ui/TranslucentPane';

// Define star system type
interface StarSystem {
  id: number;
  name: string;
  position: [number, number, number];
  type: 'main' | 'neutron' | 'dwarf' | 'giant';
  size: number;
  color: string;
  planets?: Planet[];
  selected?: boolean;
}

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
const GalacticMap3D: React.FC = () => {
  const [zoomLevel, setZoomLevel] = useState<'galaxy' | 'system' | 'planet'>('galaxy');
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [selectedPlanetId, setSelectedPlanetId] = useState<number | null>(null);
  const [systems, setSystems] = useState<StarSystem[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates>({});
  const [loading, setLoading] = useState(true);

  // Generate mock data for visualization
  useEffect(() => {
    // This would normally come from an API
    const mockSystems: StarSystem[] = [
      {
        id: 1,
        name: 'Coruscant System',
        position: [0, 0, 0],
        type: 'main',
        size: 2,
        color: '#ffff80',
        planets: [
          { id: 1, name: 'Coruscant', position: [5, 0, 0], size: 1, color: '#80b280', type: 'terrestrial' },
          { id: 2, name: 'Hesperidium', position: [8, 0, 5], size: 0.7, color: '#a04040', type: 'terrestrial' },
        ]
      },
      {
        id: 2,
        name: 'Tatooine System',
        position: [15, 0, 20],
        type: 'dwarf',
        size: 1.5,
        color: '#ffb060',
        planets: [
          { id: 3, name: 'Tatooine', position: [3, 0, 0], size: 0.8, color: '#d0b060', type: 'desert' }
        ]
      },
      {
        id: 3,
        name: 'Hoth System',
        position: [-20, 5, -15],
        type: 'giant',
        size: 2.5,
        color: '#80c0ff',
        planets: [
          { id: 4, name: 'Hoth', position: [6, 0, 0], size: 0.9, color: '#ffffff', type: 'ice' }
        ]
      },
      {
        id: 4,
        name: 'Naboo System',
        position: [25, -2, -22],
        type: 'main',
        size: 1.8,
        color: '#ffffa0',
        planets: [
          { id: 5, name: 'Naboo', position: [4, 0, 0], size: 1.1, color: '#60a0c0', type: 'terrestrial' }
        ]
      },
      {
        id: 5,
        name: 'Kashyyyk System',
        position: [-15, 3, 28],
        type: 'main',
        size: 2.1,
        color: '#ffa040',
        planets: [
          { id: 6, name: 'Kashyyyk', position: [5, 0, 0], size: 1.2, color: '#408060', type: 'terrestrial' }
        ]
      }
    ];
    
    setSystems(mockSystems);
    setLoading(false);
  }, []);

  // Handle system selection
  const handleSelectSystem = (id: number) => {
    const system = systems.find(s => s.id === id);
    if (system) {
      setSelectedSystemId(id);
      setZoomLevel('system');
      setCoordinates({ ...coordinates, system: system.name });
      
      // Update systems with selection state
      setSystems(systems.map(s => ({
        ...s,
        selected: s.id === id
      })));
    }
  };

  // Handle planet selection
  const handleSelectPlanet = (id: number) => {
    const selectedSystem = systems.find(s => s.id === selectedSystemId);
    const planet = selectedSystem?.planets?.find(p => p.id === id);
    
    if (planet) {
      setSelectedPlanetId(id);
      setZoomLevel('planet');
      setCoordinates({ ...coordinates, planet: planet.name });
      
      // Update systems with selection state for planets
      setSystems(systems.map(s => {
        if (s.id === selectedSystemId) {
          return {
            ...s,
            planets: s.planets?.map(p => ({
              ...p,
              selected: p.id === id
            }))
          };
        }
        return s;
      }));
    }
  };

  // Handle zoom out
  const handleZoomOut = () => {
    if (zoomLevel === 'planet') {
      setZoomLevel('system');
      setSelectedPlanetId(null);
      setCoordinates({ ...coordinates, planet: undefined });
    } else if (zoomLevel === 'system') {
      setZoomLevel('galaxy');
      setSelectedSystemId(null);
      setCoordinates({ ...coordinates, system: undefined });
      
      // Clear selections
      setSystems(systems.map(s => ({
        ...s,
        selected: false,
        planets: s.planets?.map(p => ({ ...p, selected: false }))
      })));
    }
  };

  return (
    <div className="w-full h-full">
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
          {zoomLevel === 'galaxy' && systems.map(system => (
            <Star key={system.id} system={system} onSelect={handleSelectSystem} />
          ))}
          
          {/* Selected system view */}
          {zoomLevel === 'system' && selectedSystemId && (
            <group>
              {/* Show the selected star system */}
              {systems
                .filter(s => s.id === selectedSystemId)
                .map(system => (
                  <group key={system.id}>
                    <Star system={{ ...system, position: [0, 0, 0] }} onSelect={() => {}} />
                    
                    {/* Planets */}
                    {system.planets?.map(planet => (
                      <group key={planet.id}>
                        <mesh 
                          position={planet.position}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPlanet(planet.id);
                          }}
                        >
                          <sphereGeometry args={[planet.size, 32, 32]} />
                          <meshStandardMaterial color={planet.color} />
                        </mesh>
                        
                        {/* Planet orbit */}
                        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                          <ringGeometry args={[
                            Math.sqrt(planet.position[0]**2 + planet.position[2]**2) - 0.05,
                            Math.sqrt(planet.position[0]**2 + planet.position[2]**2) + 0.05,
                            64
                          ]} />
                          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.2} />
                        </mesh>
                        
                        {/* Planet name */}
                        <Text
                          position={[planet.position[0], planet.position[1] + planet.size * 1.5, planet.position[2]]}
                          fontSize={0.5}
                          color="#ffffff"
                          anchorX="center"
                          anchorY="middle"
                        >
                          {planet.name}
                        </Text>
                        
                        {/* Selection indicator */}
                        {planet.selected && (
                          <mesh position={planet.position}>
                            <ringGeometry args={[planet.size * 1.3, planet.size * 1.4, 32]} />
                            <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.8} />
                          </mesh>
                        )}
                      </group>
                    ))}
                  </group>
                ))}
            </group>
          )}
          
          {/* Planet detail view */}
          {zoomLevel === 'planet' && selectedSystemId && selectedPlanetId && (
            <group>
              {systems
                .filter(s => s.id === selectedSystemId)
                .map(system => {
                  const planet = system.planets?.find(p => p.id === selectedPlanetId);
                  if (!planet) return null;
                  
                  return (
                    <group key={planet.id}>
                      <mesh position={[0, 0, 0]}>
                        <sphereGeometry args={[planet.size * 3, 64, 64]} />
                        <meshStandardMaterial color={planet.color} />
                      </mesh>
                      
                      {/* Planet name */}
                      <Text
                        position={[0, planet.size * 4, 0]}
                        fontSize={1}
                        color="#ffffff"
                        anchorX="center"
                        anchorY="middle"
                      >
                        {planet.name}
                      </Text>
                      
                      {/* Planet type */}
                      <Text
                        position={[0, planet.size * 3, 0]}
                        fontSize={0.7}
                        color="#cccccc"
                        anchorX="center"
                        anchorY="middle"
                      >
                        {planet.type.charAt(0).toUpperCase() + planet.type.slice(1)} Planet
                      </Text>
                    </group>
                  );
                })}
            </group>
          )}
          
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        </Canvas>
        
        {/* UI Controls */}
        <div className="absolute top-4 left-4">
          <TranslucentPane className="p-4">
            <h2 className="text-xl font-bold mb-2">Galactic Navigator</h2>
            <div className="text-sm mb-4">
              Current View: <span className="font-medium">{zoomLevel.charAt(0).toUpperCase() + zoomLevel.slice(1)}</span>
            </div>
            
            {(zoomLevel === 'system' || zoomLevel === 'planet') && (
              <button 
                onClick={handleZoomOut}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Zoom Out
              </button>
            )}
          </TranslucentPane>
        </div>
        
        {/* Current Location */}
        <div className="absolute bottom-4 right-4">
          <TranslucentPane className="p-4" opacity="medium">
            <h3 className="font-medium mb-1">Coordinates</h3>
            <div className="text-sm">
              {coordinates.system ? (
                <>
                  <div>System: {coordinates.system}</div>
                  {coordinates.planet && <div>Planet: {coordinates.planet}</div>}
                </>
              ) : (
                <div>Galaxy Overview</div>
              )}
            </div>
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default GalacticMap3D;