// Every way in of every building of a district on rolling land, against the ground outside it (2026-11-15, the user: "some doors lie below the terrain,
// with massive drops down to them"). Run with: node --import tsx --test tests/world/doors.test.ts   (DOOR_SEEDS=8 for a shorter run, DOOR_REPORT=1 to list every fault)
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, districtGroundOf, districtWaysIn, trailOf, type World, type DistrictPlan } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// (a step from one square to the next that a street cannot make: half a square, 0.7 m)
const STEP = 0.5;
// (how far out from the sill the way is followed, and how far round it the land is looked at)
const OUT = 6;

export interface DoorFault { kind: "sill" | "under the land" | "pit" | "ledge" | "cut off"; where: string; by: number }

// The faults of one district's ways in: the ground before a way not at its floor (`sill`), the land round it standing over it (`under the land`), a climb
// up out of it (`pit`) or a drop below it (`ledge`) steeper than a street, and a way that cannot be walked to from the others (`cut off`)
export function doorFaults(world: World, id: string, plan: DistrictPlan): { ways: number; faults: DoorFault[] } {
  const district = { id, buildingIds: Object.keys(plan.boxes) };
  const g = districtGroundOf(world, district);
  if (!g) return { ways: 0, faults: [] };
  const biome = trailOf(world, district.buildingIds[0]).find((a) => a.kind === "planet")?.type ?? "";
  const boxes = Object.values(plan.boxes);
  const inBox = (x: number, y: number) => boxes.some((q) => x >= q.x && x < q.x + q.width && y >= q.y && y < q.y + q.height);
  const open = (x: number, y: number) => x >= -2 && y >= -2 && x < plan.width + 2 && y < plan.height + 2 && !inBox(x, y);
  const at = (x: number, y: number) => g.at(x + 0.5, y + 0.5);
  const ways = districtWaysIn(world, district, plan);
  const faults: DoorFault[] = [];
  // The street: the open squares, joined where the step between two is one a street can make; each square's component
  const part = new Map<string, number>();
  let parts = 0;
  for (const w of ways) {
    if (part.has(`${w.x},${w.y}`) || !open(w.x, w.y)) continue;
    const n = parts++;
    const stack: [number, number][] = [[w.x, w.y]];
    part.set(`${w.x},${w.y}`, n);
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (!open(nx, ny) || part.has(`${nx},${ny}`) || Math.abs(at(nx, ny) - at(x, y)) > STEP) continue;
        part.set(`${nx},${ny}`, n);
        stack.push([nx, ny]);
      }
    }
  }
  const count = new Map<number, number>();
  for (const w of ways) { const p = part.get(`${w.x},${w.y}`); if (p !== undefined) count.set(p, (count.get(p) ?? 0) + 1); }
  const main = [...count].sort((p, q) => q[1] - p[1])[0]?.[0];
  for (const w of ways) {
    const where = `${id} ${biome} ${w.name} (${w.x},${w.y}) floor ${w.floor.toFixed(2)}`;
    const sill = at(w.x, w.y);
    if (Math.abs(sill - w.floor) > 0.05) faults.push({ kind: "sill", where, by: sill - w.floor });
    // (the land a square or two round the sill, over the floor: the way is in a hole)
    let over = -Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (open(w.x + dx, w.y + dy)) over = Math.max(over, at(w.x + dx, w.y + dy) - w.floor);
    if (over > 1) faults.push({ kind: "under the land", where, by: over });
    // (straight out from the sill, square by square, as far as the street is open)
    let [steep, sign] = [0, 0];
    for (let k = 0; k < OUT && open(w.x + w.dx * (k + 1), w.y + w.dy * (k + 1)); k++) {
      const d = at(w.x + w.dx * (k + 1), w.y + w.dy * (k + 1)) - at(w.x + w.dx * k, w.y + w.dy * k);
      if (Math.abs(d) > steep) [steep, sign] = [Math.abs(d), Math.sign(d)];
    }
    if (steep > STEP) faults.push({ kind: sign > 0 ? "pit" : "ledge", where, by: steep });
    if (part.get(`${w.x},${w.y}`) !== main) faults.push({ kind: "cut off", where, by: 0 });
  }
  return { ways: ways.length, faults };
}

test("every way in of a district on rolling land can be walked to: its sill on the ground, no hole round it, no drop or climb before it steeper than a street, none cut off (2026-11-15)", async () => {
  const catalog = await getWorldCatalog();
  const seeds = Array.from({ length: Number(process.env.DOOR_SEEDS ?? 50) }, (_, i) => i + 1);
  const kinds: Record<string, number> = {};
  const biomes = new Map<string, number>();
  const all: DoorFault[] = [];
  let [ways, districts] = [0, 0];
  for (const seed of seeds) {
    const world = generateWorld({ seed, partyLevel: 5 }, catalog);
    for (const [id, plan] of Object.entries(world.districtPlans ?? {})) {
      if (!plan.levels) continue;
      const found = doorFaults(world, id, plan);
      if (!found.ways) continue;
      districts++;
      ways += found.ways;
      const biome = trailOf(world, Object.keys(plan.boxes)[0]).find((a) => a.kind === "planet")?.type ?? "";
      biomes.set(biome, (biomes.get(biome) ?? 0) + 1);
      for (const f of found.faults) { kinds[f.kind] = (kinds[f.kind] ?? 0) + 1; all.push({ ...f, where: `seed ${seed} ${f.where}` }); }
    }
  }
  const summary = `${seeds.length} seeds, ${districts} districts (${[...biomes].map(([b, n]) => `${b} ${n}`).join(", ")}), ${ways} ways in, faults ${JSON.stringify(kinds)}`;
  if (process.env.DOOR_REPORT) { console.log(summary); for (const f of all) console.log(`  ${f.kind} by ${f.by.toFixed(2)}: ${f.where}`); }
  assert.ok(seeds.length < 20 || biomes.size >= 4, `the seeds reach several kinds of land: ${summary}`);
  assert.ok(ways > seeds.length * 4, `ways in looked at: ${summary}`);
  assert.equal(all.length, 0, `${summary}\n${all.slice(0, 12).map((f) => `  ${f.kind} by ${f.by.toFixed(2)}: ${f.where}`).join("\n")}`);
});
