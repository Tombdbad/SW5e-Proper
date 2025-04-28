
import React, { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface LocationMarkerProps {
  id: string;
  name: string;
  type: 'settlement' | 'outpost' | 'landmark' | 'city' | 'wilderness' | 'poi';
  position: [number, number, number];
  size?: number;
  color?: string;
  description?: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const LocationMarker: React.FC<LocationMarkerProps> = ({
  id,
  name,
  type,
  position,
  size = 1,
  color,
  description,
  selected,
  onSelect
}) => {
  const [hovered, setHovered] = useState(false);
  const markerRef = useRef<THREE.Group>(null);

  // Get marker color based on type
  const getMarkerColor = () => {
    if (color) return color;
    switch (type) {
      case 'city': return '#ffaa00';
      case 'settlement': return '#00aaff';
      case 'outpost': return '#ff0000';
      case 'landmark': return '#00ff00';
      case 'wilderness': return '#885500';
      case 'poi': return '#ff00ff';
      default: return '#ffffff';
    }
  };

  // Hover animation
  useFrame(() => {
    if (markerRef.current && hovered) {
      markerRef.current.rotation.y += 0.01;
    }
  });

  // Get marker geometry based on type
  const getMarkerGeometry = () => {
    switch (type) {
      case 'city':
        return <cylinderGeometry args={[size * 0.5, size * 0.7, size * 1.2, 6]} />;
      case 'settlement':
        return <boxGeometry args={[size, size * 0.8, size]} />;
      case 'outpost':
        return <coneGeometry args={[size * 0.5, size * 1.2, 4]} />;
      case 'landmark':
        return <sphereGeometry args={[size * 0.6, 8, 8]} />;
      default:
        return <boxGeometry args={[size, size, size]} />;
    }
  };

  return (
    <group 
      ref={markerRef}
      position={position}
      onClick={() => onSelect?.(id)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Marker mesh */}
      <mesh castShadow receiveShadow>
        {getMarkerGeometry()}
        <meshStandardMaterial 
          color={getMarkerColor()}
          emissive={getMarkerColor()}
          emissiveIntensity={hovered ? 0.5 : 0.2}
        />
      </mesh>

      {/* Location name */}
      <Text
        position={[0, size * 1.5, 0]}
        fontSize={size * 0.8}
        color={hovered ? '#ffffff' : '#cccccc'}
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>

      {/* Selection indicator */}
      {selected && (
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[size * 1.2, size * 1.4, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
};

export default LocationMarker;
