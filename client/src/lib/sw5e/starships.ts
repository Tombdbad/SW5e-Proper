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
}

export const starshipSizes: StarshipSize[] = travel.starshipSizes;
