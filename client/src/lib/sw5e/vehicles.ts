// Ground vehicles, walkers and emplacements: the constructs among monsters.ts
import { monsters, Monster } from "./monsters";

export type Vehicle = Monster;

export const groundVehicles: Vehicle[] = monsters.filter((m) => m.type === "construct");
