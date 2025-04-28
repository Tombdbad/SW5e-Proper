import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Coordinates } from '@/lib/coordinates';
import TranslucentPane from '../ui/TranslucentPane';

// Define planet type
interface Planet {
  id: number;
  name: string;
  position: [number, number, number];
  size: number;
  color: string;
  type: string;
  regions?: Region[];
  selected?: boolean;
}

// Define region type
interface Region {
  id: number;
  name: string;
  position: [number, number, number];
  size: number;
  type: string;
  selected?: boolean;
}

// Star component
const Star: React.FC<{
  position: [number, number, number];
  size: number;
  color: string;
}> = ({ position, size, color }) => {
  const ref = useRef<THREE.Mesh>(null);
  
  // Pulsate effect for star
  useFrame(({ clock }) => {
    if (ref.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 0.5) * 0.05;
      ref.current.scale.set(scale, scale, scale);
    }
  });
  
  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
      </mesh>
      
      {/* Star glow */}
      <mesh>
        <sphereGeometry args={[size * 1.2, 32, 32]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.2} 
          side={THREE.BackSide} 
        />
      </mesh>
    </group>
  );
};

// Planet component
const Planet: React.FC<{
  planet: Planet;
  onSelect: (id: number) => void;
}> = ({ planet, onSelect }) => {
  // Rotate the planet slowly
  const ref = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.1;
    }
  });
  
  return (
    <group position={planet.position}>
      <group ref={ref}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onSelect(planet.id);
          }}
        >
          <sphereGeometry args={[planet.size, 32, 32]} />
          <meshStandardMaterial color={planet.color} />
        </mesh>
      </group>
      
      {/* Planet name */}
      <Text
        position={[0, planet.size * 1.5, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {planet.name}
      </Text>
      
      {/* Selection indicator */}
      {planet.selected && (
        <mesh>
          <ringGeometry args={[planet.size * 1.3, planet.size * 1.4, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

// SystemMap component
interface SystemMapProps {
  systemName: string;
  onSelectPlanet: (planetId: number, planetName: string) => void;
  onBack: () => void;
}

const SystemMap: React.FC<SystemMapProps> = ({ systemName, onSelectPlanet, onBack }) => {
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [selectedPlanetId, setSelectedPlanetId] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates>({ system: systemName });
  const [loading, setLoading] = useState(true);

  // Load system data
  useEffect(() => {
    // Fetch planet data for this system (would normally come from API)
    const planetData: Planet[] = [];
    
    // Initialize with different data depending on the system
    if (systemName === 'Coruscant System') {
      planetData.push(
        { 
          id: 1, 
          name: 'Coruscant', 
          position: [12, 0, 0], 
          size: 1, 
          color: '#80b280', 
          type: 'ecumenopolis',
          regions: [
            { id: 1, name: 'Imperial Palace', position: [0, 0.5, 0], size: 0.2, type: 'government' },
            { id: 2, name: 'Senate District', position: [0.5, 0, 0.5], size: 0.15, type: 'government' },
            { id: 3, name: 'The Works', position: [-0.5, 0, -0.5], size: 0.18, type: 'industrial' }
          ]
        },
        {
          id: 2,
          name: 'Hesperidium',
          position: [20, 0, 5],
          size: 0.7,
          color: '#a04040',
          type: 'terrestrial'
        }
      );
    } else if (systemName === 'Tatoo System') {
      planetData.push(
        {
          id: 3,
          name: 'Tatooine',
          position: [10, 0, 0],
          size: 0.8,
          color: '#d0b060',
          type: 'desert',
          regions: [
            { id: 4, name: 'Mos Eisley', position: [0.4, 0, 0.4], size: 0.15, type: 'settlement' },
            { id: 5, name: 'Jundland Wastes', position: [-0.4, 0, 0.4], size: 0.2, type: 'wilderness' },
            { id: 6, name: 'Dune Sea', position: [0, 0, -0.5], size: 0.25, type: 'wilderness' }
          ]
        }
      );
    } else if (systemName === 'Naboo System') {
      planetData.push(
        {
          id: 5,
          name: 'Naboo',
          position: [15, 0, 0],
          size: 1.1,
          color: '#60a0c0',
          type: 'terrestrial',
          regions: [
            { id: 7, name: 'Theed', position: [0, 0.5, 0], size: 0.15, type: 'settlement' },
            { id: 8, name: 'Lake Country', position: [0.5, 0, 0], size: 0.2, type: 'wilderness' },
            { id: 9, name: 'Gungan City', position: [0, -0.3, 0.3], size: 0.18, type: 'settlement' }
          ]
        }
      );
    } else {
      // Default system with one planet
      planetData.push(
        {
          id: 10,
          name: 'Unknown Planet',
          position: [15, 0, 0],
          size: 1.0,
          color: '#808080',
          type: 'unknown'
        }
      );
    }
    
    setPlanets(planetData);
    setLoading(false);
  }, [systemName]);

  // Handle planet selection
  const handleSelectPlanet = (id: number) => {
    const planet = planets.find(p => p.id === id);
    if (planet) {
      setSelectedPlanetId(id);
      setCoordinates({ ...coordinates, planet: planet.name });
      
      // Update selection state
      setPlanets(planets.map(p => ({
        ...p,
        selected: p.id === id
      })));
      
      // Notify parent
      onSelectPlanet(id, planet.name);
    }
  };
  
  if (loading) {
    return <div>Loading system data...</div>;
  }

  // Determine star color and size based on system name
  let starColor = '#ffff80'; // Default yellow star
  let starSize = 2;
  
  if (systemName === 'Tatoo System') {
    starColor = '#ffb060'; // Orange-ish for Tatooine's twin suns
    starSize = 1.5;
  } else if (systemName === 'Hoth System') {
    starColor = '#80c0ff'; // Bluish for cold system
    starSize = 2.5;
  } else if (systemName === 'Dagobah System') {
    starColor = '#80f080'; // Greenish
    starSize = 1.3;
  }

  return (
    <div className="w-full h-full">
      {/* 3D System Map */}
      <div className="relative w-full h-[600px]">
        <Canvas camera={{ position: [0, 30, 40], fov: 60 }}>
          <ambientLight intensity={0.3} />
          
          {/* Central star */}
          <Star position={[0, 0, 0]} size={starSize} color={starColor} />
          <pointLight position={[0, 0, 0]} intensity={1.5} color={starColor} />
          
          {/* Background stars */}
          <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade />
          
          {/* Planets */}
          {planets.map(planet => (
            <Planet key={planet.id} planet={planet} onSelect={handleSelectPlanet} />
          ))}
          
          {/* Planet orbits */}
          {planets.map(planet => (
            <mesh key={`orbit-${planet.id}`} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[
                Math.sqrt(planet.position[0]**2 + planet.position[2]**2) - 0.05,
                Math.sqrt(planet.position[0]**2 + planet.position[2]**2) + 0.05,
                64
              ]} />
              <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.2} />
            </mesh>
          ))}
          
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        </Canvas>
        
        {/* UI Controls */}
        <div className="absolute top-4 left-4">
          <TranslucentPane className="p-4">
            <h2 className="text-xl font-bold mb-2">{systemName}</h2>
            <div className="text-sm mb-4">
              Planets: <span className="font-medium">{planets.length}</span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Return to Galaxy Map
            </button>
          </TranslucentPane>
        </div>
        
        {/* Current Location */}
        <div className="absolute bottom-4 right-4">
          <TranslucentPane className="p-4" opacity="medium">
            <h3 className="font-medium mb-1">Coordinates</h3>
            <div className="text-sm">
              <div>System: {coordinates.system}</div>
              {coordinates.planet && <div>Planet: {coordinates.planet}</div>}
            </div>
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default SystemMap;