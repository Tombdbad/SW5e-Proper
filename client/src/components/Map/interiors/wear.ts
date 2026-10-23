// How worn a ship or a speeder looks (2026-10-21): an age and a damage, each in three steps (clean, worn, battered), read from what the
// world knows of it. The hull material (models.tsx `hullMaterials`) lays the wear textures (public/textures/hull) over the paint by them.
// Age is no record of the vehicle's life, only a look: the same name always looks the same.
// (`grain` multiplies the density of the texture on the model: a speeder is a third of a ship)
export type Wear = { age: 0 | 1 | 2; damage: 0 | 1 | 2; grain?: number };

const hash = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
const pick = <T,>(list: T[], text: string): T => list[hash(text) % list.length];

// A ship: a wreck is as old and as hurt as can be; the armed forces keep theirs clean; freighters and the like are old hands; a ship that
// carries a hull score (the party's, hurt in a fight; `hull` is left off a whole one) or was beaten and left disabled shows scorching
export function hullWear(ship: { status: string; disabled?: boolean; hull?: number; name?: string; role?: string; size?: string }, military: boolean): Wear {
  const wrecked = ship.status === "wrecked";
  const key = `${ship.name ?? ""}|${ship.role ?? ""}|${ship.size ?? ""}`;
  const role = `${ship.role ?? ""} ${ship.size ?? ""}`.toLowerCase();
  const age = wrecked ? 2 : military ? pick<0 | 1 | 2>([0, 0, 1], key) : /freighter|hauler|smuggl|medium/.test(role) ? pick<0 | 1 | 2>([1, 2, 2], key) : /fighter|interceptor|skiff|tiny|bomber/.test(role) ? pick<0 | 1 | 2>([0, 1, 1], key) : pick<0 | 1 | 2>([0, 1, 2], key);
  const damage = wrecked || ship.disabled || ship.hull === 0 ? 2 : ship.hull !== undefined ? 1 : 0;
  return { age, damage };
}

const SPEEDER_GRAIN = 2.2;

// A speeder, by its model and name (a wreck is as battered as can be)
export function speederWear(model: string, wrecked?: boolean): Wear {
  return wrecked ? { age: 2, damage: 2, grain: SPEEDER_GRAIN } : { age: pick<0 | 1 | 2>([0, 1, 1, 2], model), damage: 0, grain: SPEEDER_GRAIN };
}
