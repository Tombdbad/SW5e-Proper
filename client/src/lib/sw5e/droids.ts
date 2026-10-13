// Droid stat blocks: the droids among monsters.ts
import { monsters, Monster } from "./monsters";

export type Droid = Monster;

export const droids: Droid[] = monsters.filter((m) => /droid/i.test(m.type) && !/swarm/i.test(m.type));

export function findDroidById(id: string): Droid | undefined {
  return droids.find(droid => droid.id === id);
}
