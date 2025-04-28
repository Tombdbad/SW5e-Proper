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