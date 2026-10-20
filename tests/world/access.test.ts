import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, auditBuildings, walkBuilding, validateWorld, stairBlock, climbAt, canStep, floorLevelAt, formOf, exitsOf, paneFor, climbable, setPane, arrivalSquares, createRandom, BLOCK_LENGTH, BALCONY_CLIMB_DC, type Area, type RoomLayout, type Side, type World } from "@shared/logic";
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
      const b = stairBlock(host, side, 1, mirror, 1, 1);
      assert.deepEqual(b.lanes, mirror ? ["downReturn", "downStart", "hall", "upStart", "upReturn"] : ["upReturn", "upStart", "hall", "downStart", "downReturn"]);
      const rooms = [b.hall, ...b.ups, ...b.downs];
      // One square wide hall, two-lane switchbacks, all BLOCK_LENGTH long away from the host's wall and against it
      const along = (l: Pick<RoomLayout, "width" | "height">) => (side === "e" || side === "w" ? l.width : l.height);
      const across = (l: Pick<RoomLayout, "width" | "height">) => (side === "e" || side === "w" ? l.height : l.width);
      assert.equal(across(b.hall), 1);
      assert.ok(rooms.every((l) => along(l) === BLOCK_LENGTH));
      assert.equal(across(b.ups[0]) + across(b.downs[0]) + across(b.hall), 5);
      const touches = (l: RoomLayout) => (side === "e" ? l.x === host.x + host.width : side === "w" ? l.x + l.width === host.x : side === "s" ? l.y === host.y + host.height : l.y + l.height === host.y);
      assert.ok(rooms.every(touches), `${side}: against the host's wall`);
      // The rooms do not overlap
      const cells = new Set<string>();
      for (const l of rooms) for (let x = l.x; x < l.x + l.width; x++) for (let y = l.y; y < l.y + l.height; y++) {
        assert.ok(!cells.has(`${x},${y}`), `${side}${mirror ? " mirrored" : ""}: two rooms on ${x},${y}`);
        cells.add(`${x},${y}`);
      }
      // Each door is two squares across one wall, and the floors either side of it are within a step of each other
      const n = (key: string) => Number(key.replace(/^\D+-(up|down)/, ""));
      const floorOfHost = (key: string) => (key === "host-hall" ? 0 : key.startsWith("head-down") ? -n(key) : key.startsWith("foot-down") ? -n(key) - 1 : key.startsWith("head-up") ? n(key) + 1 : n(key));
      const layoutOf = (room: string, key: string): RoomLayout => room === "host" ? { ...host, assets: [], level: floorOfHost(key) } : room === "hall" ? b.hall : room.startsWith("down") ? b.downs[Number(room.slice(4))] : b.ups[Number(room.slice(2))];
      const keys = [...new Set(b.doors.map((d) => d.key))];
      assert.deepEqual(keys.sort(), ["foot-down0", "foot-up0", "head-down0", "head-up0", "host-hall"]);
      // The host's wall holds the doorways to the flight up, the hall and the flight down, side by side (three squares, one each)
      const onHost = b.doors.filter((d) => d.room === "host" && ["foot-up0", "host-hall", "head-down0"].includes(d.key)).map((d) => `${d.x},${d.y}`);
      assert.equal(new Set(onHost).size, 3, `${side}: three doorways in the host's wall`);
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
  // A tower and a sub-basement: a switchback over the first for each floor more, its foot from the room on the floor below; one
  // under the first down for each floor deeper. Every door meets its floor within a step.
  const tower = stairBlock(host, "e", 0, false, 3, 2);
  assert.deepEqual(tower.ups.map((l) => l.level), [0, 1, 2]);
  assert.deepEqual(tower.downs.map((l) => l.level), [-1, -2]);
  assert.ok(tower.ups.every((l) => l.x === tower.ups[0].x && l.y === tower.ups[0].y), "the switchbacks up stand one over another");
  assert.ok(tower.downs.every((l) => l.x === tower.downs[0].x && l.y === tower.downs[0].y), "the switchbacks down stand one under another");
  const n = (key: string) => Number(key.replace(/^\D+-(up|down)/, ""));
  const floorOf = (key: string) => (key === "host-hall" ? 0 : key.startsWith("head-down") ? -n(key) : key.startsWith("foot-down") ? -n(key) - 1 : key.startsWith("head-up") ? n(key) + 1 : n(key));
  const layoutIn = (room: string, key: string): RoomLayout => room === "host" ? { ...host, assets: [], level: floorOf(key) } : room === "hall" ? tower.hall : room.startsWith("down") ? tower.downs[Number(room.slice(4))] : tower.ups[Number(room.slice(2))];
  const keys = [...new Set(tower.doors.map((d) => d.key))];
  assert.deepEqual(keys.sort(), ["foot-down0", "foot-down1", "foot-up0", "foot-up1", "foot-up2", "head-down0", "head-down1", "head-up0", "head-up1", "head-up2", "host-hall"]);
  for (const key of keys) {
    const [p, q] = tower.doors.filter((d) => d.key === key).map((d) => ({ d, l: layoutIn(d.room, key) }));
    const gap = Math.abs(floorLevelAt(p.l, p.d.x, p.d.y) - floorLevelAt(q.l, q.d.x, q.d.y));
    assert.ok(gap <= STEP / 2 + 1e-9, `tower ${key}: the floors either side are ${gap} of a floor apart`);
  }
  // (on any one floor of the host's footprint, its doorways to the block are on different squares)
  for (const floor of [-2, -1, 0, 1, 2, 3]) {
    const here = tower.doors.filter((d) => d.room === "host" && floorOf(d.key) === floor).map((d) => `${d.x},${d.y}`);
    assert.equal(new Set(here).size, here.length, `floor ${floor}: two doorways on one square`);
  }
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

test("the walk finds what cannot be reached: a doorway taken away", () => {
  const world = structuredClone(worldOf(5));
  const building = Object.values(world.areas).find((b) => b.kind === "building" && Object.values(world.areas).some((h) => h.parentId === b.id && h.tags.includes("lane:hall")))!;
  assert.ok(building, "a building with a stair block");
  assert.deepEqual(walkBuilding(world, building.id).problems, []);
  // Take away the doorway from the host to the stairs down: the switchback down and the basements under it cannot be walked to
  // (the floors over the host could still be: from the roof, down its stairs)
  const hall = Object.values(world.areas).find((a) => a.parentId === building.id && a.tags.includes("lane:hall"))!;
  const host = world.areas[hall.tags.find((t) => t.startsWith("block:"))!.slice(6)];
  const down = Object.values(world.areas).find((a) => a.parentId === building.id && a.tags.includes(`block:${host.id}`) && a.tags.includes("storey:-1"))!;
  host.layout!.assets = host.layout!.assets.filter((a) => a.to !== down.id);
  const lost = walkBuilding(world, building.id).problems;
  assert.ok(lost.some((p) => p.includes(down.name) && /cannot be walked to/.test(p)), lost.join("\n"));
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
  let columns = 0, towers = 0, mirrored = 0, plain = 0, onward = 0, deadEnd = 0, lifts = 0, highest = 0, deepest = 0, roofWays = 0;
  for (const seed of SEEDS) {
    const world = worldOf(seed);
    const areas = Object.values(world.areas);
    for (const room of areas.filter((a) => a.kind === "room" && a.layout && !formOf(a))) {
      const level = room.layout!.level ?? 0;
      highest = Math.max(highest, level);
      deepest = Math.min(deepest, level);
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
      // (the host's door at its near end, and one at its far end where it goes on to the next room)
      if (hall.layout!.assets.filter((a) => a.kind === "door").length > 1) onward++;
      else deadEnd++;
    }
    lifts += areas.filter((a) => a.kind === "room" && a.name === "Lift" && formOf(a) === "lift").length;
    // A roof whose stairs lead down into the building: the ladder from the street, the roof door, the stairs to the top floor
    for (const roof of areas.filter((a) => formOf(a) === "roof" && a.layout)) {
      const stairs = roof.layout!.assets.find((a) => a.kind === "door" && world.areas[a.to ?? ""]?.name === "Stairs up to the roof");
      if (!stairs) continue;
      roofWays++;
      assert.ok(roof.layout!.assets.some((a) => a.kind === "exit"), `${roof.name}: no ladder from the street`);
      const flight = world.areas[stairs.to!];
      assert.ok(flight.layout!.switchback && flight.layout!.assets.some((a) => a.kind === "door" && a.to !== roof.id), "the roof stairs lead down to the top floor");
    }
  }
  assert.ok(columns >= 20, `${columns} columns`);
  assert.ok(towers > 0, "no tower of more than two floors over the ground");
  assert.ok(mirrored > 0 && plain > 0, `lanes one way ${plain}, the other ${mirrored}`);
  assert.ok(onward > 0 && deadEnd > 0, `halls that go on ${onward}, dead ends ${deadEnd}`);
  assert.equal(lifts, 0, "a column whose block found no place (a lift instead)");
  // City towers rise past the third floor, and some columns go down to a sub-basement
  assert.ok(highest >= 4, `the highest floor is ${highest}`);
  assert.ok(deepest <= -2, `the deepest floor is ${deepest}`);
  assert.ok(roofWays > 0, "no roof with stairs down into its building");
});

test("windows: slits in fortified places, portholes on stations, great windows locked and alarmed in palaces; only large ones are climbed through", () => {
  const r = createRandom(7);
  assert.equal(paneFor("garrison", "Barracks", false, r).size, "slit");
  assert.equal(paneFor("cantina", "Main bar", true, r).size, "small");
  for (let i = 0; i < 20; i++) {
    const p = paneFor("palace", "Guest rooms", false, r);
    assert.ok((p.size === "wide" || p.size === "large") && p.alarmed && p.latch !== "open", `a palace window: ${JSON.stringify(p)}`);
    const shop = paneFor("armsmith", "Sales floor", false, r);
    assert.ok(shop.size === "large" && shop.latch !== "open", "shop glass is shut");
  }
  assert.ok(climbable({ size: "large", latch: "open" }) && climbable({ size: "wide", latch: "locked" }));
  assert.ok(!climbable({ size: "slit", latch: "open" }) && !climbable({ size: "small", latch: "open" }));
  // Coming in through a window, the party stands at it (it leads to the building outside, as a way out does)
  const room: RoomLayout = { x: 0, y: 0, width: 8, height: 6, assets: [
    { id: "exit", kind: "exit", name: "Way out", x: 0, y: 3, w: 1, h: 1, side: "w", to: "b1" },
    { id: "win", kind: "window", name: "Window", x: 7, y: 2, w: 1, h: 1, side: "e", to: "b1", pane: { size: "large", latch: "open" } },
  ] };
  assert.deepEqual(arrivalSquares(room, "b1", { x: 8, y: 2 }), [{ x: 7, y: 2 }], "in through the window: at it");
  assert.deepEqual(arrivalSquares(room, "b1", { x: -1, y: 3 }), [{ x: 0, y: 3 }], "in through the door: at the door");
});

test("generated windows are of every kind, a window's state changes on its own, and the large ones on the ground floor can be climbed through", () => {
  const sizes = new Set<string>();
  let climb = 0, alarmed = 0;
  for (const seed of SEEDS) {
    for (const a of Object.values(worldOf(seed).areas)) {
      for (const w of a.layout?.assets ?? []) {
        if (w.kind !== "window") continue;
        assert.ok(w.pane, `${a.name}: a window with no pane`);
        assert.ok(w.to && worldOf(seed).areas[w.to]?.kind === "building", `${a.name}: a window that does not look out of its building`);
        sizes.add(w.pane!.size);
        if (climbable(w.pane) && (a.layout!.level ?? 0) === 0) climb++;
        if (w.pane!.alarmed) alarmed++;
      }
    }
  }
  assert.deepEqual([...sizes].sort(), ["large", "slit", "small", "wide"]);
  assert.ok(climb > 20 && alarmed > 5, `${climb} windows to climb through, ${alarmed} alarmed`);
  const world = worldOf(5);
  const room = Object.values(world.areas).find((a) => a.layout?.assets.some((w) => w.kind === "window" && w.pane?.latch === "latched"))!;
  const win = room.layout!.assets.find((w) => w.kind === "window" && w.pane?.latch === "latched")!;
  const next = setPane(world, room.id, win.id, { latch: "open" });
  assert.equal(next.areas[room.id].layout!.assets.find((w) => w.id === win.id)!.pane!.latch, "open");
  assert.equal(world.areas[room.id].layout!.assets.find((w) => w.id === win.id)!.pane!.latch, "latched", "the world it came from is left alone");
});

test("balconies: on the upper floors of the great houses, over the street, patio doors into their room, climbed up to and down from", () => {
  let balconies = 0;
  for (const seed of SEEDS) {
    const world = worldOf(seed);
    for (const b of Object.values(world.areas).filter((a) => formOf(a) === "balcony")) {
      balconies++;
      const building = world.areas[b.parentId!];
      assert.ok(/^(palace|estates|manor house)$/.test(building.type), `${building.type}: a balcony`);
      const l = b.layout!;
      assert.ok((l.level ?? 0) >= 1 && b.gateway, "a balcony is on an upper floor and reached from outside");
      const doors = l.assets.filter((a) => a.kind === "door");
      assert.equal(doors.length, 1);
      const room = world.areas[doors[0].to!];
      assert.equal(room.layout!.level, l.level, "the patio doors open into a room on the balcony's floor");
      assert.ok(room.layout!.assets.some((a) => a.kind === "door" && a.to === b.id && a.name === "Patio doors"));
      // From the street it is climbed up to, and down from the balcony
      const up = exitsOf(world, building.id).find((e) => e.to === b.id);
      assert.ok(up && up.climb === BALCONY_CLIMB_DC, "climbed up to from the street");
      const down = exitsOf(world, b.id).find((e) => e.to === building.id);
      assert.ok(down && down.climb === BALCONY_CLIMB_DC, "climbed down from");
    }
  }
  assert.ok(balconies > 0, "no balcony in the worlds");
});
