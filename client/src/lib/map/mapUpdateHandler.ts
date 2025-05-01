
import { Location } from '@/lib/stores/useMap';
import { useMap } from '@/lib/stores/useMap';

// Spatial bucket size for indexing map features
const SPATIAL_BUCKET_SIZE = 10;

interface MapFeature {
  id?: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  scale?: number;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  properties?: Record<string, any>;
}

interface MapEntityReference {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  name?: string;
}

interface MapData {
  terrain?: string;
  features?: MapFeature[];
  entities?: MapEntityReference[];
  atmosphere?: string;
  weather?: string;
  lighting?: string;
  cubemapRefs?: string[];
  lastUpdated?: number;
}

interface SpatialBucket {
  key: string;
  features: MapFeature[];
}

/**
 * Generates a spatial bucket key from coordinates
 */
function getBucketKey(x: number, y: number, z: number): string {
  const bucketX = Math.floor(x / SPATIAL_BUCKET_SIZE);
  const bucketY = Math.floor(y / SPATIAL_BUCKET_SIZE);
  const bucketZ = Math.floor(z / SPATIAL_BUCKET_SIZE);
  return `${bucketX}:${bucketY}:${bucketZ}`;
}

/**
 * Creates a unique ID for a feature based on type and position
 */
function generateFeatureId(feature: MapFeature): string {
  const { type, position } = feature;
  return `${type}-${position.x.toFixed(2)}-${position.y.toFixed(2)}-${position.z.toFixed(2)}-${Date.now().toString(36)}`;
}

/**
 * Organizes features into spatial buckets for efficient lookup
 */
function spatiallyIndexFeatures(features: MapFeature[]): Record<string, SpatialBucket> {
  const buckets: Record<string, SpatialBucket> = {};

  features.forEach(feature => {
    const { x, y, z } = feature.position;
    const key = getBucketKey(x, y, z);

    if (!buckets[key]) {
      buckets[key] = { key, features: [] };
    }

    // Ensure feature has an ID
    if (!feature.id) {
      feature.id = generateFeatureId(feature);
    }

    buckets[key].features.push(feature);
  });

  return buckets;
}

/**
 * Find nearby features within a certain radius
 */
export function findNearbyFeatures(position: { x: number, y: number, z: number }, radius: number = SPATIAL_BUCKET_SIZE): MapFeature[] {
  const { currentLocation } = useMap.getState();
  if (!currentLocation || !currentLocation.mapData || !currentLocation.mapData.features) {
    return [];
  }

  // Get all potentially relevant buckets
  const bucketX = Math.floor(position.x / SPATIAL_BUCKET_SIZE);
  const bucketY = Math.floor(position.y / SPATIAL_BUCKET_SIZE);
  const bucketZ = Math.floor(position.z / SPATIAL_BUCKET_SIZE);

  const bucketRadius = Math.ceil(radius / SPATIAL_BUCKET_SIZE);
  const features: MapFeature[] = [];

  const allFeatures = currentLocation.mapData.features;

  // Simple distance check for now
  allFeatures.forEach(feature => {
    const dx = feature.position.x - position.x;
    const dy = feature.position.y - position.y;
    const dz = feature.position.z - position.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

    if (distance <= radius) {
      features.push(feature);
    }
  });

  return features;
}

/**
 * Merge new map data with existing map data, intelligently updating only what has changed
 */
export function mergeMapData(existingMapData: MapData | undefined, newMapData: MapData): MapData {
  if (!existingMapData) {
    // If no existing data, just add IDs to features and return new data
    if (newMapData.features) {
      newMapData.features = newMapData.features.map(feature => ({
        ...feature,
        id: feature.id || generateFeatureId(feature)
      }));
    }

    return {
      ...newMapData,
      lastUpdated: Date.now()
    };
  }

  // Start with a copy of existing data
  const mergedMapData: MapData = {
    ...existingMapData,
    lastUpdated: Date.now()
  };

  // Update terrain if specified in new data
  if (newMapData.terrain) {
    mergedMapData.terrain = newMapData.terrain;
  }

  // Update atmospheric conditions if specified
  if (newMapData.atmosphere) {
    mergedMapData.atmosphere = newMapData.atmosphere;
  }

  if (newMapData.weather) {
    mergedMapData.weather = newMapData.weather;
  }

  if (newMapData.lighting) {
    mergedMapData.lighting = newMapData.lighting;
  }

  // Update cubemap references if specified
  if (newMapData.cubemapRefs) {
    mergedMapData.cubemapRefs = newMapData.cubemapRefs;
  }

  // Process features
  if (newMapData.features && newMapData.features.length > 0) {
    // Initialize features array if it doesn't exist
    if (!mergedMapData.features) {
      mergedMapData.features = [];
    }

    // Create a map of existing features by ID for quick lookup
    const existingFeaturesById = new Map<string, MapFeature>();
    const existingFeaturesByPosition = new Map<string, MapFeature>();

    mergedMapData.features.forEach(feature => {
      if (feature.id) {
        existingFeaturesById.set(feature.id, feature);
      }

      // Also create a position-based key for fuzzy matching
      const posKey = `${feature.type}-${Math.round(feature.position.x)}-${Math.round(feature.position.y)}-${Math.round(feature.position.z)}`;
      existingFeaturesByPosition.set(posKey, feature);
    });

    // Process each new feature
    newMapData.features.forEach(newFeature => {
      if (newFeature.id && existingFeaturesById.has(newFeature.id)) {
        // Update existing feature by ID
        const existingFeature = existingFeaturesById.get(newFeature.id)!;
        Object.assign(existingFeature, newFeature);
      } else {
        // Try position-based fuzzy matching
        const posKey = `${newFeature.type}-${Math.round(newFeature.position.x)}-${Math.round(newFeature.position.y)}-${Math.round(newFeature.position.z)}`;

        if (existingFeaturesByPosition.has(posKey)) {
          // Update existing feature by position
          const existingFeature = existingFeaturesByPosition.get(posKey)!;
          Object.assign(existingFeature, newFeature);
        } else {
          // Add as new feature with generated ID
          mergedMapData.features.push({
            ...newFeature,
            id: newFeature.id || generateFeatureId(newFeature)
          });
        }
      }
    });
  }

  // Process entity references (NPCs, etc.)
  if (newMapData.entities && newMapData.entities.length > 0) {
    // Initialize entities array if it doesn't exist
    if (!mergedMapData.entities) {
      mergedMapData.entities = [];
    }

    // Create a map of existing entities by ID
    const existingEntitiesById = new Map<string, MapEntityReference>();

    mergedMapData.entities.forEach(entity => {
      if (entity.id) {
        existingEntitiesById.set(entity.id, entity);
      }
    });

    // Process each new entity
    newMapData.entities.forEach(newEntity => {
      if (newEntity.id && existingEntitiesById.has(newEntity.id)) {
        // Update existing entity
        const existingEntity = existingEntitiesById.get(newEntity.id)!;
        Object.assign(existingEntity, newEntity);
      } else {
        // Add as new entity
        mergedMapData.entities.push(newEntity);
      }
    });
  }

  return mergedMapData;
}

/**
 * Update a location's map data with new data from an LLM response
 */
export async function updateLocationMapData(locationId: string, newMapData: MapData): Promise<void> {
  const { locations, addLocation, currentLocation } = useMap.getState();

  // Find the location
  const location = locations.find(loc => loc.id === locationId);

  if (location) {
    // Merge the new map data with existing data
    const mergedMapData = mergeMapData(location.mapData, newMapData);

    // Create updated location with new map data
    const updatedLocation: Location = {
      ...location,
      mapData: mergedMapData
    };

    // Update the location in the store
    await addLocation(updatedLocation);

    // Update current location if this is the current location
    if (currentLocation && currentLocation.id === locationId) {
      useMap.getState().setCurrentLocation(updatedLocation);
    }
  }
}

/**
 * Process incoming LLM report data to extract and update map information
 */
export function processMapDataFromLLM(reportData: any): void {
  // Extract locations data from report
  const locations = reportData.locations || [];

  // Process each location
  locations.forEach(async (location: any) => {
    if (!location.id) return;

    // Extract map features and data
    const mapData: MapData = {
      terrain: location.terrain,
      features: location.features || [],
      atmosphere: location.atmosphere,
      weather: location.weather,
      lighting: location.lighting,
      cubemapRefs: location.cubemapRefs,
    };

    // Update the location's map data
    await updateLocationMapData(location.id, mapData);
  });
}

export default {
  mergeMapData,
  updateLocationMapData,
  processMapDataFromLLM,
  findNearbyFeatures
};
