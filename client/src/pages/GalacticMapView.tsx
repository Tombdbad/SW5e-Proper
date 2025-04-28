import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import GalacticMap3D from '@/components/Map/GalacticMap3D';
import SystemMap from '@/components/Map/SystemMap';
import LocalAreaMap from '@/components/Map/LocalAreaMap';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { Button } from '@/components/ui/button';
import { formatCoordinateString } from '@/lib/coordinates';

// Map navigation levels
type MapLevel = 'galactic' | 'system' | 'planet';

export default function GalacticMapView() {
  // State for map navigation
  const [mapLevel, setMapLevel] = useState<MapLevel>('galactic');
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [selectedSystemName, setSelectedSystemName] = useState<string>('');
  const [selectedPlanetId, setSelectedPlanetId] = useState<number | null>(null);
  const [selectedPlanetName, setSelectedPlanetName] = useState<string>('');
  const [selectedPlanetType, setSelectedPlanetType] = useState<string>('');
  
  // Current map coordinates
  const [currentCoordinateString, setCurrentCoordinateString] = useState<string>('Star Wars Galaxy');
  
  // Handle system selection from galactic map
  const handleSelectSystem = (systemId: number, systemName: string) => {
    setSelectedSystemId(systemId);
    setSelectedSystemName(systemName);
    setMapLevel('system');
    setCurrentCoordinateString(formatCoordinateString({
      galactic: 'Star Wars Galaxy',
      system: systemName
    }));
  };
  
  // Handle planet selection from system map
  const handleSelectPlanet = (planetId: number, planetName: string, planetType: string = 'terrestrial') => {
    setSelectedPlanetId(planetId);
    setSelectedPlanetName(planetName);
    setSelectedPlanetType(planetType);
    setMapLevel('planet');
    setCurrentCoordinateString(formatCoordinateString({
      galactic: 'Star Wars Galaxy',
      system: selectedSystemName,
      planet: planetName
    }));
  };
  
  // Handle navigation back up the hierarchy
  const handleBackToGalaxy = () => {
    setMapLevel('galactic');
    setSelectedSystemId(null);
    setSelectedSystemName('');
    setCurrentCoordinateString(formatCoordinateString({
      galactic: 'Star Wars Galaxy'
    }));
  };
  
  const handleBackToSystem = () => {
    setMapLevel('system');
    setSelectedPlanetId(null);
    setSelectedPlanetName('');
    setCurrentCoordinateString(formatCoordinateString({
      galactic: 'Star Wars Galaxy',
      system: selectedSystemName
    }));
  };
  
  // Render the appropriate map based on the current level
  const renderMap = () => {
    switch (mapLevel) {
      case 'galactic':
        return (
          <GalacticMap3D 
            onSelectSystem={(id, name) => handleSelectSystem(id, name)} 
          />
        );
      case 'system':
        return (
          <SystemMap 
            systemName={selectedSystemName}
            onSelectPlanet={(id, name) => handleSelectPlanet(id, name)}
            onBack={handleBackToGalaxy}
          />
        );
      case 'planet':
        return (
          <LocalAreaMap 
            planetName={selectedPlanetName}
            planetType={selectedPlanetType}
            onBack={handleBackToSystem}
          />
        );
      default:
        return <div>Error: Unknown map level</div>;
    }
  };
  
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <TranslucentPane className="py-4 px-6">
            <h1 className="text-3xl font-bold text-yellow-400">
              {mapLevel === 'galactic' && 'Galactic Map'}
              {mapLevel === 'system' && `${selectedSystemName}`}
              {mapLevel === 'planet' && `${selectedPlanetName}`}
            </h1>
            <p className="text-gray-300">
              {mapLevel === 'galactic' && 'Navigate the galaxy to discover systems and planets'}
              {mapLevel === 'system' && 'Explore the planets in this star system'}
              {mapLevel === 'planet' && 'Discover locations on this planet'}
            </p>
            <div className="mt-2 text-sm text-gray-400">
              Location: {currentCoordinateString}
            </div>
          </TranslucentPane>
          
          <div className="flex gap-4">
            {mapLevel !== 'galactic' && (
              <Button 
                variant="outline" 
                className="border-blue-400 text-blue-400"
                onClick={mapLevel === 'planet' ? handleBackToSystem : handleBackToGalaxy}
              >
                {mapLevel === 'planet' ? 'Back to System' : 'Back to Galaxy'}
              </Button>
            )}
            
            <Link to="/">
              <Button variant="outline" className="border-yellow-400 text-yellow-400">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
        
        <TranslucentPane className="mb-6" opacity="low">
          <div className="p-4">
            <p className="mb-4">
              {mapLevel === 'galactic' && 
                'This interactive map allows you to explore the galaxy, discover star systems, and learn about planets.'}
              {mapLevel === 'system' && 
                `Viewing the ${selectedSystemName}. Click on planets to view their surface maps and details.`}
              {mapLevel === 'planet' && 
                `Exploring the surface of ${selectedPlanetName}. Discover landmarks, settlements, and other points of interest.`}
            </p>
            <ul className="list-disc list-inside text-sm mb-4">
              {mapLevel === 'galactic' && (
                <>
                  <li>Click on a star to zoom in and view its planetary system</li>
                  <li>Drag to rotate the galaxy view</li>
                  <li>Scroll to zoom in and out</li>
                </>
              )}
              {mapLevel === 'system' && (
                <>
                  <li>Click on a planet to view its surface</li>
                  <li>Hover over planets to see basic information</li>
                  <li>Use the back button to return to the galaxy view</li>
                </>
              )}
              {mapLevel === 'planet' && (
                <>
                  <li>Click on locations to view details</li>
                  <li>Different colors represent different types of locations</li>
                  <li>Grid coordinates help identify precise locations</li>
                </>
              )}
            </ul>
          </div>
        </TranslucentPane>
        
        <TranslucentPane className="p-4" opacity="medium">
          {renderMap()}
        </TranslucentPane>
        
        <div className="mt-8 flex justify-end">
          <Link to="/">
            <Button variant="outline" className="border-yellow-400 text-yellow-400">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}