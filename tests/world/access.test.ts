import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, auditBuildings, walkBuilding, validateWorld, stairBlock, climbAt, canStep, floorLevelAt, formOf, BLOCK_LENGTH, type Area, type RoomLayout, type Side, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Access to every floor of the buildings the generator makes (2026-10-20): the stair blocks (shared/logic "Stair blocks": rooms
// over and under a ground room on its footprint, a five-lane block beside it with a hall, a switchback up and one down), and
// every building walked the way the map lets a player walk it (walkBuilding): every room reached, every door and flight usable.
const catalog = await getWorldCatalog();
// (worlds with their starting planet built, and the test copy's showcase world)
const SEEDS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 34];
const worlds = new Map<number, World>();
const worldOf = (seed: number) => {
  if (!worlds.has(seed)) worlds.set(seed, generateWorld({ seed, partyLevel: 5 }, catalog));
  return worlds.get(seed)!;
};
const host: Pick<RoomLayout, "x" | "y" | "width" | "height"> = { x: 10, y: 20, width: 8, height: 7 };
const STEP = 1 / 6;

test("a stair block is five lanes beside its host: the flights up, the hall in the middle, the flights down", () => {
  for (const side of ["e", "w", "n", "s"] as Side[]) {
    for (const mirror of [false, true]) {
      const b = stairBlock(host, side, 1, mirror, 1, true);
      assert.deepEqual(b.lanes, mirror ? ["downReturn", "downStart", "hall", "upStart", "upReturn"] : ["upReturn", "upStart", "hall", "downStart", "downReturn"]);
      const rooms = [b.hall, ...b.ups, b.down!];
      // One square wide hall, two-lane switchbacks, all BLOCK_LENGTH long away from the host's wall and against it
      const along = (l: Pick<RoomLayout, "width" | "height">) => (side === "e" || side === "w" ? l.width : l.height);
      const across = (l: Pick<RoomLayout, "width" | "height">) => (side === "e" || side === "w" ? l.height : l.width);
      assert.equal(across(b.hall), 1);
      assert.ok(rooms.every((l) => along(l) === BLOCK_LENGTH));
      assert.equal(across(b.ups[0]) + across(b.down!) + across(b.hall), 5);
      const touches = (l: RoomLayout) => (side === "e" ? l.x === host.x + host.width : side === "w" ? l.x + l.width === host.x : side === "s" ? l.y === host.y + host.height : l.y + l.height === host.y);
      assert.ok(rooms.every(touches), `${side}: against the host's wall`);
      // The rooms do not overlap
      const cells = new Set<string>();
      for (const l of rooms) for (let x = l.x; x < l.x + l.width; x++) for (let y = l.y; y < l.y + l.height; y++) {
        assert.ok(!cells.has(`${x},${y}`), `${side}${mirror ? " mirrored" : ""}: two rooms on ${x},${y}`);
        cells.add(`${x},${y}`);
      }
      // Each door is two squares across one wall, and the floors either side of it are within a step of each other
      const floorOfHost = (key: string) => (key === "host-hall" ? 0 : key === "foot-down" ? -1 : key.startsWith("head-up") ? Number(key.slice(7)) + 1 : Number(key.slice(7)));
      const layoutOf = (room: string, key: string): RoomLayout => room === "host" ? { ...host, assets: [], level: floorOfHost(key) } : room === "hall" ? b.hall : room === "down" ? b.down! : b.ups[Number(room.slice(2))];
      const keys = [...new Set(b.doors.map((d) => d.key))];
      assert.deepEqual(keys.sort(), ["foot-down", "foot-up0", "head-down", "head-up0", "host-hall"]);
      for (const key of keys) {
        const pair = b.doors.filter((d) => d.key === key);
        assert.equal(pair.length, 2, key);
        const [p, q] = pair.map((d) => ({ d, l: layoutOf(d.room, key) }));
        const DELTA = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
        const [dx, dy] = DELTA[p.d.side];
        assert.equal(q.d.side, ({ n: "s", s: "n", e: "w", w: "e" } as const)[p.d.side], `${key}: on two faces of one wall`);
        assert.deepEqual({ x: q.l.x + q.d.x, y: q.l.y + q.d.y }, { x: p.l.x + p.d.x + dx, y: p.l.y + p.d.y + dy }, `${side}${mirror ? " mirrored" : ""} ${key}: across the wall`);
        const gap = Math.abs(floorLevelAt(p.l, p.d.x, p.d.y) - floorLevelAt(q.l, q.d.x, q.d.y));
        assert.ok(gap <= STEP / 2 + 1e-9, `${key}: the floors either side are ${gap} of a floor apart`);
      }
    }
  }
  // A tower: a switchback over the first for each floor more, its foot from the room on the floor below
  const tower = stairBlock(host, "e", 0, false, 3, true);
  assert.equal(tower.ups.length, 3);
  assert.deepEqual(tower.ups.map((l) => l.level), [0, 1, 2]);
  assert.ok(tower.ups.every((l) => l.x === tower.ups[0].x && l.y === tower.ups[0].y), "the switchbacks stand one over another");
  assert.ok(["foot-up1", "head-up1", "foot-up2", "head-up2"].every((k) => tower.doors.filter((d) => d.key === k).length === 2));
});

test("a switchback climbs a floor: up one lane to the landing at half, back along the other, and nobody steps across the well", () => {
  const l = { width: BLOCK_LENGTH, height: 2, climb: { toward: "e" as Side, levels: 1 }, switchback: { low: 1 as const } };
  const at = (x: number, y: number) => climbAt(l, x + 0.5, y + 0.5);
  // The low lane (y 1) from the near end (x 0) to the landing (x 3), the other lane back
  assert.ok(Math.abs(at(0, 1) - 1 / 12) < 1e-9 && Math.abs(at(2, 1) - 5 / 12) < 1e-9);
  assert.equal(at(3, 0), 0.5);
  assert.equal(at(3, 1), 0.5);
  assert.ok(Math.abs(at(2, 0) - 7 / 12) < 1e-9 && Math.abs(at(0, 0) - 11 / 12) < 1e-9);
  // A step along a lane is a sixth of a floor; across the well (off the landing) is not a step
  for (let x = 0; x < 3; x++) assert.equal(canStep(l, { x, y: 0 }, { x, y: 1 }), false, `across the well at ${x}`);
  assert.ok(canStep(l, { x: 3, y: 0 }, { x: 3, y: 1 }), "across the landing");
  assert.ok(canStep(l, { x: 1, y: 1 }, { x: 2, y: 1 }) && canStep(l, { x: 2, y: 0 }, { x: 3, y: 0 }));
  // Going north the same, by x
  const n = { width: 2, height: BLOCK_LENGTH, climb: { toward: "n" as Side, levels: 1 }, switchback: { low: 0 as const } };
  assert.ok(Math.abs(climbAt(n, 0.5, BLOCK_LENGTH - 0.5) - 1 / 12) < 1e-9, "the foot of the low lane is at the south end");
  assert.equal(climbAt(n, 1.5, 0.5), 0.5, "the landing is the north row");
});

test("the walk finds what cannot be reached: a door taken away, a flight's foot blocked", () => {
  const world = structuredClone(worldOf(5));
  const building = Object.values(world.areas).find((b) => b.kind === "building" && Object.values(world.areas).some((h) => h.parentId === b.id && h.tags.includes("lane:hall")))!;
  assert.ok(building, "a building with a stair block");
  assert.deepEqual(walkBuilding(world, building.id).problems, []);
  // Take away the door from the hall to the stairs up: the switchback and the floors over it cannot be walked to
  const hall = Object.values(world.areas).find((a) => a.parentId === building.id && a.tags.includes("lane:hall"))!;
  const up = Object.values(world.areas).find((a) => a.parentId === building.id && a.tags.includes(`block:${hall.tags.find((t) => t.startsWith("block:"))!.slice(6)}`) && a.tags.includes("storey:0"))!;
  hall.layout!.assets = hall.layout!.assets.filter((a) => a.to !== up.id);
  const lost = walkBuilding(world, building.id).problems;
  assert.ok(lost.some((p) => p.includes(up.name) && /cannot be walked to/.test(p)), lost.join("\n"));
});

test("every building of the worlds can be walked into every room, through every door and up and down every flight", () => {
  const found: string[] = [];
  let buildings = 0;
  for (const seed of SEEDS) {
    const world = worldOf(seed);
    for (const p of auditBuildings(world)) found.push(`seed ${seed}: ${p}`);
    for (const p of validateWorld(world, catalog)) found.push(`seed ${seed} (world): ${p}`);
    buildings += Object.values(world.areas).filter((a) => a.kind === "building" && Object.values(world.areas).some((r) => r.parentId === a.id && r.layout)).length;
  }
  assert.ok(buildings > 50, `${buildings} buildings laid out`);
  assert.equal(found.length, 0, `${found.length} problems:\n${found.slice(0, 15).join("\n")}`);
});

test("every room over or under the ground is in a column with a five-lane block; towers, both lane orders, halls that go on and dead ends", () => {
  let columns = 0, towers = 0, mirrored = 0, plain = 0, onward = 0, deadEnd = 0, lifts = 0;
  for (const seed of SEEDS) {
    const world = worldOf(seed);
    const areas = Object.values(world.areas);
    for (const room of areas.filter((a) => a.kind === "room" && a.layout && !formOf(a))) {
      const level = room.layout!.level ?? 0;
      if (level === 0) continue;
      const building = world.areas[room.parentId!];
      // (hangars on a top floor are reached by a lift; the wild has rising passages)
      if (room.layout!.roof || ["cave", "ruin", "wreck", "camp", "trailhead", "sewer", "sewer access"].includes(building.type)) continue;
      const lower = room.tags.find((t) => t.startsWith("stack:") || t.startsWith("under:"));
      assert.ok(lower, `${building.type} / ${room.name}: on floor ${level} but in no column`);
    }
    for (const hall of areas.filter((a) => a.tags.includes("lane:hall"))) {
      columns++;
      const hostId = hall.tags.find((t) => t.startsWith("block:"))!.slice(6);
      const parts = areas.filter((a) => a.tags.includes(`block:${hostId}`));
      if (parts.filter((a) => formOf(a) === "stairs" && !a.tags.includes("storey:-1")).length > 1) towers++;
      const host = world.areas[hostId].layout!;
      const up = parts.find((a) => a.tags.includes("storey:0"))!.layout!;
      const down = parts.find((a) => a.tags.includes("storey:-1"))!.layout!;
      // the lanes, by where they are: up first along the host's wall is the user's order, down first the other way about
      const first = (l: RoomLayout) => (hall.layout!.width === 1 ? l.x : l.y);
      if (first(up) < first(down)) plain++;
      else mirrored++;
      void host;
      if (hall.layout!.assets.filter((a) => a.kind === "door").length > 3) onward++;
      else deadEnd++;
    }
    lifts += areas.filter((a) => a.kind === "room" && a.name === "Lift" && formOf(a) === "lift").length;
  }
  assert.ok(columns >= 20, `${columns} columns`);
  assert.ok(towers > 0, "no tower of more than two floors over the ground");
  assert.ok(mirrored > 0 && plain > 0, `lanes one way ${plain}, the other ${mirrored}`);
  assert.ok(onward > 0 && deadEnd > 0, `halls that go on ${onward}, dead ends ${deadEnd}`);
  assert.equal(lifts, 0, "a column whose block found no place (a lift instead)");
});
