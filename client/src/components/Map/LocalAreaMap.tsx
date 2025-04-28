import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Coordinates } from '@/lib/coordinates';
import TranslucentPane from '../ui/TranslucentPane';

// Define location types
interface Location {
  id: number;
  name: string;
  position: [number, number, number];
  type: 'city' | 'settlement' | 'outpost' | 'landmark' | 'wilderness' | 'unknown';
  description: string;
  size: number;
  gridCoordinate?: string;
  selected?: boolean;
}

// Location marker component
const LocationMarker: React.FC<{
  location: Location;
  onSelect: (id: number) => void;
}> = ({ location, onSelect }) => {
  const getMarkerColor = () => {
    switch (location.type) {
      case 'city': return '#f0f0a0'; // Yellow for cities
      case 'settlement': return '#a0a0f0'; // Blue for settlements
      case 'outpost': return '#f0a0a0'; // Red for outposts
      case 'landmark': return '#a0f0a0'; // Green for landmarks
      case 'wilderness': return '#a0c0a0'; // Muted green for wilderness
      default: return '#c0c0c0'; // Gray for unknown
    }
  };
  
  const getMarkerShape = () => {
    switch (location.type) {
      case 'city': 
        return (
          <cylinderGeometry args={[location.size, location.size * 0.8, location.size * 0.5, 6]} />
        );
      case 'settlement':
        return (
          <boxGeometry args={[location.size, location.size * 0.3, location.size]} />
        );
      case 'outpost':
        return (
          <cylinderGeometry args={[location.size * 0.5, location.size * 0.5, location.size, 3]} />
        );
      case 'landmark':
        return (
          <sphereGeometry args={[location.size * 0.7, 8, 8]} />
        );
      case 'wilderness':
        return (
          <coneGeometry args={[location.size * 0.6, location.size, 8]} />
        );
      default:
        return (
          <boxGeometry args={[location.size * 0.5, location.size * 0.5, location.size * 0.5]} />
        );
    }
  };
  
  return (
    <group position={location.position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(location.id);
        }}
      >
        {getMarkerShape()}
        <meshStandardMaterial color={getMarkerColor()} />
      </mesh>
      
      {/* Location name */}
      <Text
        position={[0, location.size * 1.5, 0]}
        fontSize={0.4}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {location.name}
      </Text>
      
      {/* Grid coordinate if available */}
      {location.gridCoordinate && (
        <Text
          position={[0, location.size * 1.1, 0]}
          fontSize={0.3}
          color="#a0a0a0"
          anchorX="center"
          anchorY="middle"
        >
          Grid: {location.gridCoordinate}
        </Text>
      )}
      
      {/* Selection indicator */}
      {location.selected && (
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[location.size * 1.2, location.size * 1.3, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

// Ground/terrain component
const Terrain: React.FC<{
  planetType: string;
}> = ({ planetType }) => {
  // Set terrain appearance based on planet type
  const getTerrainColor = () => {
    switch (planetType) {
      case 'desert': return '#d0b060';
      case 'ice': return '#e0e0ff';
      case 'forest': return '#408040';
      case 'swamp': return '#506030';
      case 'ocean': return '#4080c0';
      case 'volcanic': return '#804030';
      case 'ecumenopolis': return '#606060';
      case 'terrestrial': return '#60a060';
      default: return '#a0a0a0';
    }
  };
  
  const getTerrainTexture = () => {
    // This would normally load a texture based on the planet type
    return null;
  };
  
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[100, 100, 32, 32]} />
      <meshStandardMaterial 
        color={getTerrainColor()} 
        wireframe={false} 
        roughness={0.8} 
        metalness={0.1}
      />
    </mesh>
  );
};

// Main LocalAreaMap component
interface LocalAreaMapProps {
  planetName: string;
  planetType: string;
  regionName?: string;
  onBack: () => void;
  onSelectLocation?: (locationId: number) => void;
}

const LocalAreaMap: React.FC<LocalAreaMapProps> = ({ 
  planetName, 
  planetType, 
  regionName, 
  onBack, 
  onSelectLocation 
}) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates>({
    planet: planetName,
    region: regionName
  });
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  // Load location data for the planet/region
  useEffect(() => {
    // This would normally come from an API
    const locationData: Location[] = [];
    
    // Generate locations based on the planet
    if (planetName === 'Coruscant') {
      locationData.push(
        {
          id: 1,
          name: 'Imperial Palace',
          position: [2, 0, 3],
          type: 'landmark',
          description: 'The massive palace that serves as the Emperor\'s residence.',
          size: 1.2,
          gridCoordinate: 'C-5'
        },
        {
          id: 2,
          name: 'Senate District',
          position: [-3, 0, 4],
          type: 'city',
          description: 'The governmental center of the galaxy.',
          size: 1.0,
          gridCoordinate: 'B-6'
        },
        {
          id: 3,
          name: 'The Works',
          position: [5, 0, -2],
          type: 'wilderness',
          description: 'An industrial zone, now largely abandoned.',
          size: 0.8,
          gridCoordinate: 'D-2'
        },
        {
          id: 4,
          name: 'Jedi Temple',
          position: [0, 0, -5],
          type: 'landmark',
          description: 'The former headquarters of the Jedi Order.',
          size: 1.0,
          gridCoordinate: 'A-1'
        }
      );
    } else if (planetName === 'Tatooine') {
      locationData.push(
        {
          id: 5,
          name: 'Mos Eisley',
          position: [3, 0, 2],
          type: 'settlement',
          description: 'A spaceport town, known as a hive of scum and villainy.',
          size: 0.9,
          gridCoordinate: 'F-2'
        },
        {
          id: 6,
          name: 'Jundland Wastes',
          position: [-4, 0, -3],
          type: 'wilderness',
          description: 'Rocky desert region inhabited by Tusken Raiders.',
          size: 0.7,
          gridCoordinate: 'H-7'
        },
        {
          id: 7,
          name: 'Dune Sea',
          position: [5, 0, -4],
          type: 'wilderness',
          description: 'A vast desert area with large sand dunes.',
          size: 0.8,
          gridCoordinate: 'G-3'
        },
        {
          id: 8,
          name: 'Lars Homestead',
          position: [0, 0, 5],
          type: 'outpost',
          description: 'The moisture farm where Luke Skywalker grew up.',
          size: 0.6,
          gridCoordinate: 'D-4'
        }
      );
    } else if (planetName === 'Naboo') {
      locationData.push(
        {
          id: 9,
          name: 'Theed',
          position: [0, 0, 3],
          type: 'city',
          description: 'The capital city of Naboo.',
          size: 1.0,
          gridCoordinate: 'A-3'
        },
        {
          id: 10,
          name: 'Lake Country',
          position: [4, 0, 1],
          type: 'wilderness',
          description: 'A beautiful lake region with rolling hills.',
          size: 0.8,
          gridCoordinate: 'C-2'
        },
        {
          id: 11,
          name: 'Gungan City',
          position: [-3, 0, -2],
          type: 'city',
          description: 'An underwater city of the Gungans.',
          size: 0.9,
          gridCoordinate: 'B-4'
        },
        {
          id: 12,
          name: 'Plasma Mines',
          position: [3, 0, -4],
          type: 'outpost',
          description: 'Facilities that mine and process plasma energy.',
          size: 0.7,
          gridCoordinate: 'E-1'
        }
      );
    } else if (planetName === 'Hoth') {
      locationData.push(
        {
          id: 13,
          name: 'Echo Base',
          position: [0, 0, 2],
          type: 'outpost',
          description: 'Former Rebel Alliance base.',
          size: 0.8,
          gridCoordinate: 'B-3'
        },
        {
          id: 14,
          name: 'Ice Fields',
          position: [-3, 0, -2],
          type: 'wilderness',
          description: 'Vast fields of ice and snow.',
          size: 0.7,
          gridCoordinate: 'A-5'
        },
        {
          id: 15,
          name: 'Wampa Caves',
          position: [4, 0, -1],
          type: 'wilderness',
          description: 'Ice caverns inhabited by wampa creatures.',
          size: 0.6,
          gridCoordinate: 'C-1'
        }
      );
    } else {
      // Default locations for other planets
      locationData.push(
        {
          id: 16,
          name: 'Primary Settlement',
          position: [0, 0, 0],
          type: 'settlement',
          description: 'The main inhabited area on this planet.',
          size: 0.8,
          gridCoordinate: 'A-1'
        },
        {
          id: 17,
          name: 'Unknown Region',
          position: [3, 0, 3],
          type: 'wilderness',
          description: 'An unexplored area of the planet.',
          size: 0.7,
          gridCoordinate: 'B-2'
        }
      );
    }
    
    setLocations(locationData);
    setLoading(false);
    
    // Set full coordinates
    setCoordinates({
      galactic: "Star Wars Galaxy",
      system: `${planetName} System`,
      planet: planetName,
      region: regionName || "Surface Map",
    });
  }, [planetName, planetType, regionName]);

  // Handle location selection
  const handleSelectLocation = (id: number) => {
    const location = locations.find(loc => loc.id === id);
    if (location) {
      setSelectedLocationId(id);
      setSelectedLocation(location);
      
      // Update locations with selection state
      setLocations(locations.map(loc => ({
        ...loc,
        selected: loc.id === id
      })));
      
      // Update coordinates with grid if available
      if (location.gridCoordinate) {
        setCoordinates({
          ...coordinates,
          local: location.name,
          grid: location.gridCoordinate
        });
      } else {
        setCoordinates({
          ...coordinates,
          local: location.name
        });
      }
      
      // Notify parent if callback provided
      if (onSelectLocation) {
        onSelectLocation(id);
      }
    }
  };
  
  if (loading) {
    return <div>Loading planet surface data...</div>;
  }

  return (
    <div className="w-full h-full">
      {/* 3D Local Area Map */}
      <div className="relative w-full h-[600px]">
        <Canvas camera={{ position: [0, 10, 10], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          
          {/* Terrain */}
          <Terrain planetType={planetType} />
          
          {/* Locations */}
          {locations.map(location => (
            <LocationMarker 
              key={location.id} 
              location={location} 
              onSelect={handleSelectLocation} 
            />
          ))}
          
          {/* Coordinate grid */}
          <gridHelper args={[100, 20, '#606060', '#404040']} />
          
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            maxPolarAngle={Math.PI / 2 - 0.1} // Prevent camera from going below ground
          />
        </Canvas>
        
        {/* UI Controls */}
        <div className="absolute top-4 left-4">
          <TranslucentPane className="p-4">
            <h2 className="text-xl font-bold mb-2">{planetName}</h2>
            <div className="text-sm mb-2">
              {regionName ? `Region: ${regionName}` : 'Surface Map'}
            </div>
            <div className="text-sm mb-4">
              Locations: <span className="font-medium">{locations.length}</span>
            </div>
            
            <button 
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Return to System Map
            </button>
          </TranslucentPane>
        </div>
        
        {/* Selected Location Info */}
        {selectedLocation && (
          <div className="absolute top-4 right-4">
            <TranslucentPane className="p-4" opacity="medium">
              <h3 className="font-medium mb-1">{selectedLocation.name}</h3>
              <div className="text-sm mb-2">
                Type: {selectedLocation.type.charAt(0).toUpperCase() + selectedLocation.type.slice(1)}
              </div>
              <div className="text-sm mb-2">
                {selectedLocation.description}
              </div>
              {selectedLocation.gridCoordinate && (
                <div className="text-sm font-mono">
                  Grid: {selectedLocation.gridCoordinate}
                </div>
              )}
            </TranslucentPane>
          </div>
        )}
        
        {/* Current Location */}
        <div className="absolute bottom-4 right-4">
          <TranslucentPane className="p-4" opacity="medium">
            <h3 className="font-medium mb-1">Coordinates</h3>
            <div className="text-sm">
              <div>System: {coordinates.system}</div>
              <div>Planet: {coordinates.planet}</div>
              {coordinates.region && <div>Region: {coordinates.region}</div>}
              {coordinates.local && <div>Location: {coordinates.local}</div>}
              {coordinates.grid && <div>Grid: {coordinates.grid}</div>}
            </div>
          </TranslucentPane>
        </div>
      </div>
    </div>
  );
};

export default LocalAreaMap;