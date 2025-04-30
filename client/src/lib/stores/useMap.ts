import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";
import axios from "axios";
import { starSystems } from "@/lib/sw5e/starSystems";

async function fetchStarSystems() {
  const response = await axios.get("/api/star-systems");
  return response.data;
}

async function fetchSystemLocations(systemId: string) {
  const response = await axios.get(`/api/star-systems/${systemId}/locations`);
  return response.data;
}

interface Coordinates {
  x: number;
  y: number;
  z: number;
}

interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  coordinates: Coordinates;
  mapData?: any;
}

interface MapState {
  selectedStarSystem: string | null;
  currentLocation: Location | null;
  locations: Location[];
  galaxyViewMode: "galaxy" | "system" | "planet";
  loading: boolean;
  error: string | null;

  // Actions
  selectStarSystem: (systemId: string) => void;
  setCurrentLocation: (locationId: string | Location) => void;
  addLocation: (location: Location) => void;
  loadLocations: (campaignId: string) => Promise<void>;
  generateLocationFromDescription: (description: string) => Promise<{
    coordinates: Coordinates;
    mapData: any;
  }>;
  setGalaxyViewMode: (mode: "galaxy" | "system" | "planet") => void;
}

export const useMap = create<MapState>((set, get) => ({
  selectedStarSystem: null,
  currentLocation: null,
  locations: [],
  galaxyViewMode: "galaxy",
  loading: false,
  error: null,

  selectStarSystem: (systemId) => {
    // Get the system details
    const system = starSystems.find((s) => s.id === systemId);

    if (system) {
      // Create a location object for the system
      const systemLocation: Location = {
        id: system.id,
        name: system.name,
        type: "Star System",
        description: system.description || `The ${system.name} system.`,
        coordinates: {
          x: system.x,
          y: system.y,
          z: system.z,
        },
      };

      set({
        selectedStarSystem: systemId,
        currentLocation: systemLocation,
        galaxyViewMode: "system",
      });
    } else {
      set({ selectedStarSystem: systemId });
    }
  },

  setCurrentLocation: (locationIdOrObject) => {
    if (typeof locationIdOrObject === "string") {
      // Find location by ID
      const location = get().locations.find(
        (loc) => loc.id === locationIdOrObject,
      );
      if (location) {
        set({ currentLocation: location });
      } else {
        // Try to find a system that matches
        const system = starSystems.find((s) => s.id === locationIdOrObject);

        if (system) {
          const systemLocation: Location = {
            id: system.id,
            name: system.name,
            type: "Star System",
            description: system.description || `The ${system.name} system.`,
            coordinates: {
              x: system.x,
              y: system.y,
              z: system.z,
            },
          };

          set({
            currentLocation: systemLocation,
            selectedStarSystem: system.id,
          });
        }
      }
    } else {
      // Direct location object
      set({ currentLocation: locationIdOrObject });
    }
  },

  addLocation: (location) =>
    set((state) => ({
      locations: [...state.locations, location],
    })),

  loadLocations: async (campaignId) => {
    set({ loading: true, error: null });

    try {
      const response = await apiRequest(
        "GET",
        `/api/campaigns/${campaignId}/locations`,
      );
      const locations = await response.json();

      set({ locations, loading: false });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load locations",
      });
    }
  },

  generateLocationFromDescription: async (description) => {
    set({ loading: true, error: null });

    try {
      // In a real application, this would use NLP to analyze the description
      // and generate appropriate map data. For the demonstration, we'll
      // generate a simple random map.

      // Random coordinates within a reasonable range
      const coordinates = {
        x: Math.floor(Math.random() * 100) - 50,
        y: Math.floor(Math.random() * 20) - 10,
        z: Math.floor(Math.random() * 100) - 50,
      };

      // Example map data structure
      const mapData = {
        terrain: "plains", // or forest, desert, urban, etc.
        obstacles: Array(Math.floor(Math.random() * 10) + 5)
          .fill(0)
          .map(() => ({
            type: ["rock", "tree", "building", "water"][
              Math.floor(Math.random() * 4)
            ],
            position: {
              x: Math.floor(Math.random() * 100) - 50,
              y: 0,
              z: Math.floor(Math.random() * 100) - 50,
            },
            scale: Math.random() * 2 + 0.5,
          })),
        npcs: Array(Math.floor(Math.random() * 5))
          .fill(0)
          .map(() => ({
            type: ["civilian", "enemy", "vendor"][
              Math.floor(Math.random() * 3)
            ],
            position: {
              x: Math.floor(Math.random() * 80) - 40,
              y: 0,
              z: Math.floor(Math.random() * 80) - 40,
            },
          })),
      };

      set({ loading: false });

      return {
        coordinates,
        mapData,
      };
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate location",
      });

      // Return minimal data
      return {
        coordinates: { x: 0, y: 0, z: 0 },
        mapData: { terrain: "plains", obstacles: [], npcs: [] },
      };
    }
  },

  setGalaxyViewMode: (mode) => set({ galaxyViewMode: mode }),
}));
