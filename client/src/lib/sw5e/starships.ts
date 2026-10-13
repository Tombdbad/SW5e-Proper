// Starships. The books have no ready-made ships: a ship is built from a size, a tier and equipment
// (Starships of the Galaxy). The size table is read here; the world generator in shared/logic
// assembles ships from the starship equipment data when it places them.
import travel from "@shared/data/sw5e/travel.json";
export type { Ship as Starship } from "@shared/logic";

export interface StarshipSize {
  name: string;
  space: string;
  stockCost?: number;
  modificationSlots?: number;
  fuelCapacity?: number;
  // Credits for one unit of fuel
  fuelCost?: number;
}

export const starshipSizes: StarshipSize[] = travel.starshipSizes.map((size) => ({
  ...size,
  fuelCost: Number(String((size.tables as Record<string, string>)["Starship Size Fuel Cost"] ?? "").replace(/\D/g, "")) || undefined,
}));

export const getStarshipSize = (name: string): StarshipSize | undefined => starshipSizes.find((size) => size.name === name);
