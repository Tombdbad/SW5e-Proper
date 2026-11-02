import test from "node:test";
import assert from "node:assert/strict";
import { deckSquares, domeOf, generateWorld, groundAt, groundRides, planBuilding, raceCourse, swimPace, waterOf, waterwayOf, childrenOf, type Area, type RaceScenery, type World } from "@shared/logic";
import { planTrip } from "@shared/logic/roadtrip";
import { getWorldCatalog } from "../../server/sw5eData";

// Water worlds and caves under the ground (2026-10-30; shared/logic "Water worlds", levelsOf, linkLevels)
const catalog = await getWorldCatalog();

test("the decking of a place on the sea joins every building's gantry and the ways out, and leaves open water", () => {
  const boxes = { a: { x: 0, y: 0, width: 7, height: 7 }, b: { x: 20, y: 3, width: 6, height: 6 }, c: { x: 4, y: 18, width: 8, height: 8 }, d: { x: 30, y: 25, width: 5, height: 5 } };
  const deck = deckSquares({ boxes }, [{ x: 40, y: 12 }]);
  // every gantry square round each box
  for (const b of Object.values(boxes)) for (let y = b.y - 2; y < b.y + b.height + 2; y++) for (let x = b.x - 2; x < b.x + b.width + 2; x++) assert.ok(deck.has(`${x},${y}`), `${x},${y} round a building`);
  // one piece, reached from the way out
  const seen = new Set(["40,12"]);
  const stack = [[40, 12]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (deck.has(`${nx},${ny}`) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
  }
  assert.equal(seen.size, deck.size, "all the decking is joined");
  // and most of the ground is water
  assert.ok(deck.size < 45 * 35 * 0.6, `${deck.size} squares of decking`);
});

test("a swimmer goes at half pace, or at its own swimming speed", () => {
  assert.equal(swimPace("30 ft."), 0.5);
  assert.equal(swimPace("30 ft., swim 30 ft."), 1);
  assert.equal(swimPace("walk 30 ft., swim 20 ft."), 20 / 30);
});

test("an ocean world's places stand on the sea or under it; a cave goes down under the ground", () => {
  let sea = 0;
  let under = 0;
  let caves = 0;
  for (const seed of [1, 2, 34]) {
    const world = generateWorld({ seed, partyLevel: 5, detail: "all" as const }, catalog);
    for (const s of Object.values(world.areas).filter((a): a is Area => a.kind === "settlement")) {
      const planet = world.areas[s.parentId ?? ""];
      const w = waterOf(world, s.id);
      if (planet?.type !== "ocean" || !["city", "town", "outpost"].includes(s.type)) assert.equal(w, null, `${s.name} is not on the water`);
      else if (w === "sea") sea++;
      else under++;
      if (s.gateway && planet?.type === "ocean" && ["city", "town", "outpost"].includes(s.type)) assert.equal(w, "sea", "a world's way in is on the sea");
    }
    for (const b of Object.values(world.areas).filter((a) => a.kind === "building" && a.type === "cave")) {
      planBuilding(world, b.id);
      const rooms = childrenOf(world, b.id).filter((a) => a.kind === "room" && a.layout);
      if (!rooms.length) continue;
      caves++;
      for (const r of rooms) {
        const l = r.layout!;
        if (r.gateway) assert.equal(l.level ?? 0, 0, `${b.name}: the mouth is on the surface`);
        else if (!l.form) assert.ok((l.level ?? 0) < 0, `${b.name} / ${r.name}: under the ground`);
        // (between floors, a long sloping passage, not a stair)
        if (l.form === "stairs") {
          assert.match(r.name, /^Sloping passage/);
          assert.ok(l.height >= 11 || l.width >= 11, `${r.name}: ${l.width} by ${l.height}`);
        }
      }
    }
  }
  assert.ok(caves > 0, "some caves were planned");
  console.log(`places on the sea ${sea}, under it ${under}, caves ${caves}`);
});

// Over the water (2026-10-30; shared/logic "Over the water", house rules): the rides over open sea, a water craft's trip, its course
const transport = { pace: [{ pace: "Normal", milesPerHour: 3 }], vehicles: [{ name: "Landspeeder", mph: 220 }] } as unknown as Parameters<typeof groundRides>[0]["transport"];
const craft = (id: string, look: string) => ({ id, name: id, model: "Landspeeder", mph: 220, value: 1, status: "parked" as const, owner: "party", seats: 4, look, areaId: "s" });

test("over open sea only a water craft or a water taxi goes; a water craft goes on no road", () => {
  const vehicles = [craft("bongo", "bongo"), craft("x34", "x34")];
  const sea = groundRides({ km: 30, vehicles, companions: [], riders: 1, transport, hire: true, waterway: "sea" });
  assert.ok(sea.find((r) => r.id === "foot")?.blocked, "nobody walks over the sea");
  assert.equal(sea.find((r) => r.vehicleId === "bongo")?.blocked, undefined);
  assert.match(sea.find((r) => r.vehicleId === "x34")?.blocked ?? "", /open sea/);
  assert.equal(sea.find((r) => r.id === "hired")?.label, "Water taxi");
  const road = groundRides({ km: 30, vehicles, companions: [], riders: 1, transport });
  assert.match(road.find((r) => r.vehicleId === "bongo")?.blocked ?? "", /no water/);
  assert.equal(road.find((r) => r.vehicleId === "x34")?.blocked, undefined);
  const marsh = groundRides({ km: 30, vehicles, companions: [], riders: 1, transport, waterway: "marsh" });
  assert.ok(marsh.every((r) => !r.blocked), "a swamp's channels: both go");
});

test("between two places of an ocean world the way is open sea, and a water craft's trip is legs of open water with no roadblock", () => {
  // (a world of an ocean planet, its way in and another town on the water and a ruin on an island, a swamp world and a desert world, two places each)
  const area = (id: string, kind: string, type: string, parentId?: string, extra: Record<string, unknown> = {}) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0, z: 0 }, danger: 0, ...extra });
  const world = {
    era: "galactic-civil-war", antagonist: "Black Sun", paths: [],
    areas: Object.fromEntries([
      area("g", "galaxy", "galaxy"), area("r", "region", "Wild Space", "g", { name: "Wild Space" }), area("y", "system", "star", "r"),
      area("p", "planet", "ocean", "y", { faction: "Hutt Cartel" }), area("s1", "settlement", "town", "p", { gateway: true }), area("s2", "settlement", "town", "p"), area("ru", "settlement", "ruins", "p"),
      area("w", "planet", "swamp", "y"), area("w1", "settlement", "town", "w"), area("w2", "settlement", "outpost", "w"),
      area("d", "planet", "desert", "y"), area("d1", "settlement", "town", "d"), area("d2", "settlement", "outpost", "d"),
    ].map((a) => [a.id, a])),
  } as unknown as World;
  assert.equal(waterOf(world, "s1"), "sea", "the way in is on the sea");
  assert.ok(waterOf(world, "s2"));
  assert.equal(waterwayOf(world, "s1", "s2"), "sea");
  assert.equal(waterwayOf(world, "s1", "ru"), "sea", "an island's ruin is over the sea too");
  assert.equal(waterwayOf(world, "w1", "w2"), "marsh");
  assert.equal(waterwayOf(world, "d1", "d2"), undefined);
  assert.equal(waterwayOf(world, "s1", "d1"), undefined, "another planet is no way over the water");
  const legs = planTrip(world, "s2", { km: 30, biome: "ocean", level: 5, seed: 9, always: "both", water: true });
  assert.ok(legs.every((l) => l.biome === "ocean" && !l.block), "open water, no roadblock");
  assert.ok(legs.some((l) => l.ambush), "the ambush still comes");
});

test("a water craft's course is open water: level, buoyed, no jumps or trails", () => {
  const scenery: RaceScenery = { trees: [], shrubs: [], boulders: ["sea_stack"], crossings: [], sea: true, hits: { buoy: { r: 0.36, h: 1.5 }, sea_stack: { r: 0.85, h: 2.6 }, crate_stack: { box: [0.55, 0.45], h: 1, breaks: true, mass: 0.15 }, gate: { r: 0.4, h: 8 } } };
  for (const seed of [4, 17]) {
    const track = raceCourse(seed, scenery, 1, {});
    assert.ok(track.sea);
    assert.equal(track.ramps.length + track.dips.length + track.trails.length, 0);
    for (const [x, z] of [[0, 0], [120, -80], [-300, 210]]) assert.equal(groundAt(track, x, z), 0);
    assert.ok(track.props.filter((pr) => pr.key === "buoy").length > 20, "buoys mark the way");
    assert.ok(track.road && track.road.finish > 500);
  }
});

// Set down in a dome, and a species' own swimming speed (2026-10-30, house rules: shared/logic domeOf, swimPace)
test("a party come under the sea by anything but a submersible is set down in the way in of the first dome; a swimming speed is read from a trait", () => {
  const area = (id: string, kind: string, type: string, parentId?: string, extra: Record<string, unknown> = {}) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0, z: 0 }, danger: 0, ...extra });
  const world = {
    era: "galactic-civil-war", antagonist: "Black Sun", paths: [],
    areas: Object.fromEntries([
      area("g", "galaxy", "galaxy"), area("r", "region", "Wild Space", "g"), area("y", "system", "star", "r"), area("p", "planet", "ocean", "y"),
      area("s", "settlement", "town", "p"), area("b1", "building", "market", "s"), area("r1", "room", "hall", "b1"), area("r2", "room", "gate", "b1", { gateway: true }), area("b2", "building", "cantina", "s"), area("r3", "room", "bar", "b2", { gateway: true }),
    ].map((a) => [a.id, a])),
  } as unknown as World;
  assert.equal(domeOf(world, "s"), "r2", "the first building's way in");
  assert.equal(domeOf(world, "b2"), "r2", "from anywhere in the place");
  assert.equal(swimPace("You have a swimming speed of 30 feet."), 1);
  assert.equal(swimPace("You have a swimming speed of 20 feet.", 30), 20 / 30);
});

// A quest under the sea is offered to every species, with a warning that sub-aquatic gear is required unless the species is aquatic (2026-11-02, the user:
// such quests "SHOULD be available for non-aquatic species, BUT MUST contain a warning")
import { submergedAt, worldQuests } from "@shared/logic";
test("a quest that sends the party to the sea floor is offered to all, with a gear warning unless the species is aquatic", () => {
  const world = generateWorld({ seed: 11, partyLevel: 5, startPlanet: "Kamino" }, catalog);
  const objectiveAreas = (aquatic: boolean) => worldQuests(world, 1000, aquatic).flatMap((q) => q.objectives.map((o) => o.target?.areaId)).filter((id): id is string => !!id && !!world.areas[id]);
  for (const q of worldQuests(world, 1000, false)) assert.ok(!q.warning || q.objectives.some((o) => o.target && submergedAt(world, o.target.areaId)), "a warning only where the sea floor is");
  // sink the site the first quest sends the party to: a wreck on a crash site of an ocean world
  const target = world.areas[objectiveAreas(false).find((id) => world.areas[id].kind === "room")!];
  assert.ok(target, "a quest with a room to go to");
  const building = (() => { let a: Area | undefined = target; while (a && a.kind !== "building") a = a.parentId ? world.areas[a.parentId] : undefined; return a!; })();
  const settlement = world.areas[building.parentId!];
  const planet = world.areas[settlement.parentId!];
  const sunk = JSON.parse(JSON.stringify(world)) as World;
  sunk.areas[building.id].type = "wreck";
  sunk.areas[settlement.id].type = "crash site";
  sunk.areas[planet.id].type = "ocean";
  for (const room of childrenOf(sunk, building.id)) sunk.areas[room.id].name = "Cargo hold";
  const reached = (w: World, aquatic: boolean) => worldQuests(w, 1000, aquatic).flatMap((q) => q.objectives.map((o) => o.target?.areaId)).filter((id): id is string => !!id && !!w.areas[id]);
  assert.ok(submergedAt(sunk, target.id), "the site is under the sea now");
  const sentDown = (aquatic: boolean) => worldQuests(sunk, 1000, aquatic).filter((q) => q.objectives.some((o) => o.target && childrenOf(sunk, building.id).some((r) => r.id === o.target!.areaId)));
  assert.ok(sentDown(false).length > 0, "still offered to a species that cannot breathe water");
  for (const q of sentDown(false)) assert.match(q.warning ?? "", /sub-aquatic gear is required/i);
  assert.ok(sentDown(true).length > 0, "and to one that can");
  for (const q of sentDown(true)) assert.equal(q.warning, undefined, "no gear needed by a water-breather");
  assert.ok(reached(sunk, false).length > 0);
});
