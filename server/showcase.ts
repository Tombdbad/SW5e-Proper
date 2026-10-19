// A showcase world for the test copy (2026-10-19): one planet, the settlements that show the interiors overhaul (a city, and the cave systems
// and ruins beside it) and quick ways between them. It is used only where the process was started with SW5E_SHOWCASE=1 (the test
// copy's unit sets it; the service does not), and nothing here is stored in a campaign unless the campaign was made by a server that
// had it. Pure over a world: tests/server/showcase.test.ts.
import { childrenOf, trailOf, type Area, type Path, type World } from "@shared/logic";

// The buildings the overhaul shows off: each gets a fast way from every other
export const SHOWCASE_BUILDINGS = ["palace", "estates", "armsmith", "garrison", "cantina", "medcenter", "tenements", "hideout", "workshop", "gambling hall", "archive", "market"];
// The wild settlements worth keeping: caves and ruins
export const SHOWCASE_SITES = ["cave system", "ruins"];

export const showcaseOn = (): boolean => process.env.SW5E_SHOWCASE === "1";

const descendants = (world: World, id: string): Area[] => childrenOf(world, id).flatMap((a) => [a, ...descendants(world, a.id)]);

// How well a world shows the work: the showcase buildings of the home settlement (a palace is worth three, only a city has one) and
// of the wild sites beside it (a cave system is a must: without one, nothing)
export function showcaseScore(world: World): number {
  const trail = trailOf(world, world.startId);
  const planet = trail.find((a) => a.kind === "planet");
  const home = trail.find((a) => a.kind === "settlement");
  if (!planet || !home) return 0;
  const wild = childrenOf(world, planet.id).filter((s) => SHOWCASE_SITES.includes(s.type));
  if (!wild.some((s) => s.type === "cave system")) return 0;
  const here = new Set(childrenOf(world, home.id).map((b) => b.type));
  const there = new Set(wild.flatMap((s) => childrenOf(world, s.id).map((b) => b.type)));
  return SHOWCASE_BUILDINGS.filter((t) => here.has(t)).length + (here.has("palace") ? 3 : 0) + (there.has("cave") ? 3 : 0) + (there.has("ruin") ? 1 : 0);
}

// The world cut down to its starting planet's city and wild sites, with quick ways between them
export function trimToShowcase(world: World): World {
  const next: World = JSON.parse(JSON.stringify(world));
  const trail = trailOf(next, next.startId);
  const planet = trail.find((a) => a.kind === "planet");
  if (!planet) return next;
  const home = trail.find((a) => a.kind === "settlement");
  const kept = childrenOf(next, planet.id).filter((s) => s.id === home?.id || SHOWCASE_SITES.includes(s.type));
  const keep = new Set<string>([...trail.filter((a) => a.kind !== "room" && a.kind !== "building" && a.kind !== "settlement").map((a) => a.id)]);
  for (const s of kept) {
    keep.add(s.id);
    for (const d of descendants(next, s.id)) keep.add(d.id);
  }
  for (const id of Object.keys(next.areas)) if (!keep.has(id)) delete next.areas[id];
  // Only the planet's own chain of regions and systems is left: the lanes that led elsewhere go with the rest
  next.paths = next.paths.filter((p) => next.areas[p.from] && next.areas[p.to]);
  for (const key of ["districtPlans", "heat", "incidentClock", "audiences"] as const) {
    const table = next[key] as Record<string, unknown> | undefined;
    if (table) for (const id of Object.keys(table)) if (!next.areas[id]) delete table[id];
  }
  const path = (from: Area, to: Area, kind: Path["kind"], label: string, travel: string) => {
    const existing = next.paths.find((p) => (p.from === from.id && p.to === to.id) || (p.from === to.id && p.to === from.id));
    if (existing) {
      existing.label = label;
      existing.travel = travel;
      existing.locked = undefined;
      existing.hidden = undefined;
      return;
    }
    next.paths.push({ id: `p-fast${next.counter++}`, from: from.id, to: to.id, kind, label, travel });
  };
  // Settlements: a kilometre apart, a few minutes by speeder
  const main = kept.find((s) => s.id === home?.id) ?? kept[0];
  for (const s of kept) if (s.id !== main.id) path(main, s, "route", "Showcase road", "1 km (1 h by speeder)");
  // Buildings of the city: a short way from each of the showcase ones to every other
  const show = childrenOf(next, main.id).filter((b) => SHOWCASE_BUILDINGS.includes(b.type));
  for (let i = 0; i < show.length; i++) for (let j = i + 1; j < show.length; j++) path(show[i], show[j], "street", "Fast route", "10 m");
  return next;
}

// The seed found for each starting seed (a search takes seconds, a world a tenth of one)
const FOUND = new Map<number, number>();

// Tries seeds until a world shows the work (or the tries run out: the best one seen), then trims it
export function showcaseWorld(make: (seed: number) => World, seed: number, tries = 120): World {
  const known = FOUND.get(seed);
  if (known !== undefined) return trimToShowcase(make(known));
  let best: { world: World; score: number; seed: number } | undefined;
  for (let i = 0; i < tries; i++) {
    const world = make(seed + i);
    const score = showcaseScore(world);
    if (!best || score > best.score) best = { world, score, seed: seed + i };
    if (score >= 13) break;
  }
  FOUND.set(seed, best!.seed);
  return trimToShowcase(best!.world);
}
