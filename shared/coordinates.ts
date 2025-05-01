export type CoordinateLevel = 'galactic' | 'system' | 'planet' | 'region' | 'local';

export interface Coordinates {
  galactic?: string;
  system?: string;
  planet?: string;
  region?: string;
  local?: string;
  grid?: string;
}

export function parseCoordinateString(coordString: string): Coordinates {
  const parts = coordString.split(' - ');
  const coords: Coordinates = {};
  
  if (parts.length > 0) coords.galactic = parts[0];
  if (parts.length > 1) coords.system = parts[1];
  if (parts.length > 2) coords.planet = parts[2];
  if (parts.length > 3) coords.region = parts[3];
  
  // Handle grid coordinates if present in the last part
  if (parts.length > 4) {
    const lastPart = parts[4];
    const gridMatch = lastPart.match(/\(Grid: ([A-Z0-9]+)\)/);
    
    if (gridMatch) {
      coords.local = lastPart.split(' (Grid')[0];
      coords.grid = gridMatch[1];
    } else {
      coords.local = lastPart;
    }
  }
  
  return coords;
}

// ASCII map coordinate pattern like (x:10,y:5,z:-3)
const asciiCoordPattern = /\(x:(-?\d+),y:(-?\d+),z:(-?\d+)\)/;

/**
 * Parse coordinates from ASCII map notation that LLMs might generate
 * Example: "(x:10,y:5,z:-3)"
 */
export function parseAsciiMapCoordinates(coordString: string): { x: number, y: number, z: number } | null {
  const match = coordString.match(asciiCoordPattern);
  if (!match) return null;
  
  return {
    x: parseInt(match[1], 10),
    y: parseInt(match[2], 10),
    z: parseInt(match[3], 10)
  };
}

/**
 * Extract coordinates from a block of text containing ASCII map data
 * Returns an array of coordinates with their associated entity types
 */
export function extractCoordinatesFromAsciiMap(text: string): Array<{ 
  type: string, 
  coords: { x: number, y: number, z: number },
  name?: string,
  description?: string
}> {
  const results = [];
  // Match patterns like: [NPC:Stormtrooper](x:10,y:0,z:5)
  // or [LOCATION:Command Center](x:-5,y:0,z:12)
  const entityPattern = /\[([A-Z_]+)(?::([^\]]+))?\]\(x:(-?\d+),y:(-?\d+),z:(-?\d+)\)/g;
  
  let match;
  while ((match = entityPattern.exec(text)) !== null) {
    const [fullMatch, type, name, x, y, z] = match;
    
    results.push({
      type: type.toLowerCase(),
      name: name || undefined,
      coords: {
        x: parseInt(x, 10),
        y: parseInt(y, 10),
        z: parseInt(z, 10)
      }
    });
  }
  
  return results;
}

export function formatCoordinateString(coords: Coordinates): string {
  let result = coords.galactic || '';
  
  if (coords.system) result += ` - ${coords.system}`;
  if (coords.planet) result += ` - ${coords.planet}`;
  if (coords.region) result += ` - ${coords.region}`;
  
  if (coords.local) {
    result += ` - ${coords.local}`;
    if (coords.grid) result += ` (Grid: ${coords.grid})`;
  }
  
  return result;
}