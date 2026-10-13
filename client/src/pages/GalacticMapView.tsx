import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { useQuery } from '@tanstack/react-query';
import GalaxyMap from '@/components/Map/GalaxyMap';
import LocalMap from '@/components/Map/LocalMap';
import { childrenOf, exitsOf, trailOf, type World } from '@shared/logic';
import GalacticMap3D from '@/components/Map/GalacticMap3D';
import SystemMap from '@/components/Map/SystemMap';
import LocalAreaMap from '@/components/Map/LocalAreaMap';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { Button } from '@/components/ui/button';
import { formatCoordinateString } from '@/lib/coordinates';

// Map navigation levels
type MapLevel = 'galactic' | 'system' | 'planet';

// The atlas of a campaign's generated world: the same places and paths that Play runs in. The
// galaxy view shows its systems and hyperlanes; below a system, each layer is drawn as a schematic.
function WorldAtlas({ campaign, campaigns, onPick }: { campaign: any; campaigns: any[]; onPick: (id: string) => void }) {
  const world: World = campaign.galaxyMap;
  const party = world.areas[campaign.currentLocation] ? campaign.currentLocation : world.startId;
  const [focusId, setFocusId] = useState<string>(party);
  const focus = world.areas[focusId] ?? world.areas[party];
  const trail = trailOf(world, focus.id);
  const galactic = ['galaxy', 'region', 'system'].includes(focus.kind);
  const children = childrenOf(world, focus.id);

  return (
    <div className="min-h-screen p-4 md:p-6 text-white" data-testid="world-atlas">
      <div className="max-w-7xl mx-auto space-y-4">
        <TranslucentPane className="py-4 px-6">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h1 className="text-2xl font-bold text-yellow-400">Map of {campaign.name}</h1>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Campaign"
                className="bg-gray-900 border border-gray-600 rounded p-2 text-sm"
                value={String(campaign.id)}
                onChange={(e) => onPick(e.target.value)}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
                <option value="none">Stock galaxy (no campaign)</option>
              </select>
              <Link to="/">
                <Button variant="outline" className="border-yellow-400 text-yellow-400">Return to Dashboard</Button>
              </Link>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-sm" data-testid="atlas-trail">
            {trail.map((area, index) => (
              <React.Fragment key={area.id}>
                {index > 0 && <span className="text-gray-500">{'\u203a'}</span>}
                <Button size="sm" variant={area.id === focus.id ? 'default' : 'outline'} className="h-7 px-2" onClick={() => setFocusId(area.id)}>
                  {area.name}
                </Button>
              </React.Fragment>
            ))}
            {focus.id !== party && (
              <Button size="sm" variant="outline" className="h-7 px-2 border-yellow-400 text-yellow-400" onClick={() => setFocusId(party)}>
                Where the party is
              </Button>
            )}
          </div>
        </TranslucentPane>

        <TranslucentPane className="p-2" opacity="medium">
          <div className="h-[55vh]">
            <Canvas camera={{ position: [0, 42, 30], fov: 75, near: 0.1, far: 1000 }}>
              <color attach="background" args={['#000000']} />
              <ambientLight intensity={0.4} />
              {galactic ? <GalaxyMap world={world} hereId={focus.id} /> : <LocalMap world={world} hereId={focus.id} onSelect={setFocusId} />}
            </Canvas>
          </div>
        </TranslucentPane>

        <TranslucentPane className="p-4" opacity="low">
          <h2 className="text-lg font-semibold" data-testid="atlas-focus">
            {focus.name} <span className="text-sm text-gray-400">({focus.kind}{focus.type && focus.type !== focus.kind ? `, ${focus.type}` : ''}{focus.id === party ? ', the party is here' : ''})</span>
          </h2>
          {focus.description && <p className="text-sm text-gray-300">{focus.description}</p>}
          {focus.occupants.length + focus.ships.length + focus.loot.length > 0 && (
            <p className="text-sm text-gray-300 mt-1">
              Here: {[
                ...focus.occupants.map((o) => `${o.count > 1 ? `${o.count} x ` : ''}${o.name} (${o.disposition})`),
                ...focus.ships.map((ship) => `${ship.name} (${ship.size} ship)`),
                ...focus.loot.filter((cache) => !cache.hidden).map((cache) => cache.name),
              ].join(', ')}
            </p>
          )}
          {children.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="atlas-children">
              <span className="text-sm text-gray-400 mr-1">Inside:</span>
              {children.map((child) => (
                <Button key={child.id} size="sm" variant="outline" className="h-7 px-2" onClick={() => setFocusId(child.id)}>
                  {child.name}
                </Button>
              ))}
            </div>
          )}
          {exitsOf(world, focus.id).filter((exit) => exit.via === 'path' && !exit.hidden).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="atlas-paths">
              <span className="text-sm text-gray-400 mr-1">Paths:</span>
              {exitsOf(world, focus.id).filter((exit) => exit.via === 'path' && !exit.hidden).map((exit) => (
                <Button key={`${exit.pathId}-${exit.to}`} size="sm" variant="outline" className="h-auto min-h-7 px-2 whitespace-normal text-left" onClick={() => setFocusId(exit.to)}>
                  {exit.label} to {world.areas[exit.to].name}{exit.travel ? ` (${exit.travel})` : ''}
                </Button>
              ))}
            </div>
          )}
        </TranslucentPane>
      </div>
    </div>
  );
}

export default function GalacticMapView() {
  // A campaign with a generated world is shown as that world; ?campaign=<id> picks which one
  const [params, setParams] = useSearchParams();
  const { data: campaigns = [] } = useQuery<any[]>({ queryKey: ['/api/campaigns'] });
  const withWorld = campaigns.filter((c) => c.galaxyMap?.areas);
  const chosen = params.get('campaign') === 'none' ? null : withWorld.find((c) => String(c.id) === params.get('campaign')) ?? withWorld[0];

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
  
  if (chosen) {
    return <WorldAtlas key={chosen.id} campaign={chosen} campaigns={withWorld} onPick={(id) => setParams({ campaign: id })} />;
  }

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