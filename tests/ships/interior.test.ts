// The inside of a starship (shared/logic/starshipInterior.ts): every size, role and maker of ship that has more than a cockpit has an inside that can be walked
// from the boarding ramp to every room, deck to deck by stairwells with no door on the way, with its stations where the crew rules look for them.
import test from "node:test";
import assert from "node:assert/strict";
import {
  boardShip, deckIdOf, shipBuildingIdOf, seatsOfShip, aboardShipId, hasInterior, FACTIONS, FRAMES, childrenOf, floorFaults, floorsOf, formOf, standsAt, tagId,
  hullOf, hullNameOf, insideHull, rectDistance, shipInteriorOf, planInterior, planFromHull,
  type World, type Area, type RoomLayout, type RoomAsset, type HullPlan, type HullMark,
} from "@shared/logic";

const ROLES: Record<string, string[]> = {
  Small: ["Shuttle"],
  Medium: ["Freighter", "Yacht", "Gunship", "Courier", "Missile Boat", "Navigator"],
  Large: ["Corvette", "Cruiser", "Ambassador", "Explorer", "Picket Ship", "Ship's Tender"],
  Huge: ["Battleship", "Carrier", "Colonizer", "Command Ship", "Interdictor", "Juggernaut"],
  Gargantuan: ["Flag Ship", "Industrial Center", "Mobile Metropolis", "Researcher", "Warship", "Blockade Ship"],
};
const OWNERS: Record<string, string> = { imperial: "Galactic Empire", rebel: "Rebel Alliance", republic: "Galactic Republic", separatist: "Separatist Alliance", mandalorian: "Mandalorian clan", criminal: "Hutt cartel", civilian: "Kessa Dray" };

function worldWithBerth(): World {
  const berth = { id: "berth", kind: "settlement", name: "Port", parentId: null, type: "spaceport", description: "", tags: [], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [] } as unknown as Area;
  return { version: 1, seed: 7, name: "t", partyLevel: 1, partySize: 1, antagonist: "Galactic Empire", rootId: "berth", startId: "berth", areas: { berth }, paths: [], counter: 100 } as unknown as World;
}
const shipOf = (size: string, role: string, owner: string, n = 1) => ({ id: `s${n}`, name: `The ${role} ${n}`, size, role, owner });

const onSquare = (a: RoomAsset, x: number, y: number) => a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h;

// Everything that can be wrong with an inside, as sentences
function audit(world: World, shipId: string): string[] {
  const problems: string[] = [];
  const building = world.areas[shipBuildingIdOf(shipId)];
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room");
  const at = (a: Area) => `${a.name} (${a.id}, deck ${(a.layout?.level ?? 0) + 1})`;
  if (!rooms.length) return ["no rooms"];
  for (const a of rooms) if (!a.layout) problems.push(`${at(a)}: no layout`);
  // no two rooms on the same square of the same floor
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const [p, q] = [rooms[i].layout!, rooms[j].layout!];
      const [fp, fq] = [floorsOf(p), floorsOf(q)];
      // (the flights of one stairwell are stacked on one another: each is one level of the climb, sharing a floor with the next)
      const stack = tagId(rooms[i], "block") !== undefined && tagId(rooms[i], "block") === tagId(rooms[j], "block");
      if (!stack && p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height && fp[0] <= fq[1] && fq[0] <= fp[1]) problems.push(`${at(rooms[i])} and ${at(rooms[j])} overlap`);
    }
  }
  // doors: each passage has its door in both rooms, on a wall square that stands, and no two things on a square
  const mine = world.paths.filter((p) => p.id.startsWith(`${building.id}-p`));
  for (const p of mine) {
    const [a, b] = [world.areas[p.from], world.areas[p.to]];
    if (!a || !b) { problems.push(`${p.id}: a room is missing`); continue; }
    for (const [room, other] of [[a, b], [b, a]] as const) {
      const d = room.layout!.assets.find((x) => x.ref === p.id);
      if (!d) problems.push(`${at(room)}: no door for ${p.id} to ${other.name}`);
      else if (d.to !== other.id || !standsAt(room.layout!, d.x, d.y)) problems.push(`${at(room)}: door ${p.id} is wrong`);
    }
  }
  for (const a of rooms) {
    const l = a.layout!;
    for (const x of l.assets) {
      if (x.x < 0 || x.y < 0 || x.x + x.w > l.width || x.y + x.h > l.height) problems.push(`${at(a)}: ${x.name} is outside the room`);
      const clash = l.assets.find((y) => y !== x && y.kind !== "window" && x.kind !== "window" && onSquare(y, x.x, x.y) && (y.blocks || x.blocks || y.kind === "door" || x.kind === "door"));
      if (clash) problems.push(`${at(a)}: ${x.name} and ${clash.name} on one square`);
    }
    if (!formOf(a) && floorFaults(l)) problems.push(`${at(a)}: the floor is cut up (${floorFaults(l)})`);
  }
  // reach: every room from the boarding room by the passages (stair flights too)
  const seen = new Set<string>([deckIdOf(shipId)]);
  const queue = [deckIdOf(shipId)];
  while (queue.length) {
    const id = queue.pop()!;
    for (const p of mine) {
      const o = p.from === id ? p.to : p.to === id ? p.from : undefined;
      if (o && !seen.has(o)) { seen.add(o); queue.push(o); }
    }
  }
  for (const a of rooms) if (!seen.has(a.id)) problems.push(`${at(a)}: no way leads to it`);
  // a stairwell: a landing on every deck it climbs to (every deck of a box-shaped frame; in a hull, from the bottom deck as high as its column is inside), a flight between each two
  const decks = new Set(rooms.map((a) => a.layout!.level ?? 0)).size;
  const hulled = building.tags.some((t) => t.startsWith("hull:"));
  for (const hall of rooms.filter((a) => tagId(a, "lane") === "hall")) {
    const parts = rooms.filter((a) => tagId(a, "block") === tagId(hall, "block"));
    const floors = parts.filter((a) => formOf(a) === "corridor").map((a) => a.layout!.level ?? 0).sort((p, q) => p - q);
    const flights = parts.filter((a) => formOf(a) === "stairs").length;
    const climbs = hulled ? floors.length : decks;
    if (floors.length !== climbs || flights !== climbs - 1 || floors.some((f, i) => f !== i) || floors.length < 2) problems.push(`${at(hall)}: a stairwell of ${floors.length} landings and ${flights} flights on ${decks} decks`);
  }
  // the boarding room has the ramp, and it can be reached
  const entry = world.areas[deckIdOf(shipId)];
  if (entry.layout!.assets.filter((a) => a.ref === "station:ramp").length !== 1) problems.push("the boarding room has not one ramp");
  if ((entry.layout!.level ?? 0) !== 0) problems.push("the boarding room is not on the bottom deck");
  return problems;
}

test("a Tiny ship and a Small fighter keep their one cockpit deck", () => {
  assert.equal(hasInterior({ size: "Tiny", role: "Probe" }), false);
  for (const role of ["Attack Fighter", "Bomber", "Scout", "Scrambler", "Superiority Fighter"]) assert.equal(hasInterior({ size: "Small", role }), false, role);
  assert.equal(hasInterior({ size: "Small", role: "Shuttle" }), true);
  const w = boardShip(worldWithBerth(), shipOf("Small", "Bomber", OWNERS.imperial), "berth").world;
  assert.equal(childrenOf(w, shipBuildingIdOf("s1")).length, 1);
  assert.equal(w.areas[deckIdOf("s1")].type, "deck");
  assert.equal(seatsOfShip(w, "s1").some((s) => s.station === "helm"), true);
});

test("the inside of every size, role and maker of ship can be walked", () => {
  const found: string[] = [];
  let n = 0;
  for (const [size, roles] of Object.entries(ROLES)) {
    for (const [i, role] of roles.entries()) {
      for (const [f, faction] of FACTIONS.entries()) {
        if ((i + f) % (size === "Gargantuan" || size === "Huge" ? 2 : 1)) continue;
        const ship = shipOf(size, role, OWNERS[faction], ++n);
        const { world } = boardShip(worldWithBerth(), ship, "berth");
        for (const p of audit(world, ship.id)) found.push(`${faction} ${size} ${role}: ${p}`);
        // the stations the crew rules look for
        const seats = seatsOfShip(world, ship.id);
        const count = (s: string) => seats.filter((x) => x.station === s).length;
        if (count("helm") !== 1) found.push(`${faction} ${size} ${role}: ${count("helm")} helm seats`);
        if (count("engines") !== 1) found.push(`${faction} ${size} ${role}: ${count("engines")} engine stations`);
        if (size !== "Small" && count("nav") !== 1) found.push(`${faction} ${size} ${role}: ${count("nav")} navigation consoles`);
        if (size !== "Small" && count("copilot") !== 1) found.push(`${faction} ${size} ${role}: ${count("copilot")} co-pilot seats`);
        if (size !== "Small" && count("guns") < 1) found.push(`${faction} ${size} ${role}: no gunnery seat`);
        if (aboardShipId(world.areas[deckIdOf(ship.id)]) !== ship.id) found.push("the boarding room does not say which ship it is aboard");
      }
    }
  }
  assert.deepEqual(found.slice(0, 40), []);
});

test("an inside is made once, kept, and the same for the same ship", () => {
  const ship = shipOf("Large", "Corvette", OWNERS.rebel);
  const once = boardShip(worldWithBerth(), ship, "berth", "somewhere");
  const again = boardShip(once.world, ship, "berth", "elsewhere");
  assert.deepEqual(Object.keys(again.world.areas).sort(), Object.keys(once.world.areas).sort());
  assert.equal(again.world.paths.length, once.world.paths.length);
  assert.ok(again.world.areas[deckIdOf(ship.id)].tags.includes("from:elsewhere"));
  const other = boardShip(worldWithBerth(), ship, "berth");
  assert.deepEqual(JSON.stringify(other.world.areas), JSON.stringify(boardShip(worldWithBerth(), ship, "berth").world.areas));
});

test("the size of a ship sets its decks and its rooms", () => {
  const counts: Record<string, { rooms: number; decks: number; bytes: number }> = {};
  for (const size of Object.keys(FRAMES)) {
    const ship = shipOf(size, ROLES[size][0], OWNERS.imperial);
    const { world } = boardShip(worldWithBerth(), ship, "berth");
    const rooms = childrenOf(world, shipBuildingIdOf(ship.id));
    counts[size] = { rooms: rooms.length, decks: new Set(rooms.map((r) => (r.layout as RoomLayout).level ?? 0)).size, bytes: JSON.stringify(rooms).length + JSON.stringify(world.paths).length };
    // (a ship laid out in its hull has the hull's decks; one whose hull has no outline, the frame's)
    const hull = world.areas[shipBuildingIdOf(ship.id)].tags.some((t) => t.startsWith("hull:")) ? hullOf(ship) : undefined;
    assert.equal(counts[size].decks, hull ? hull.decks.length : FRAMES[size].D, size);
  }
  // (a bigger ship has more rooms; the biggest stays a size the world can keep: a megabyte or less)
  assert.ok(counts.Medium.rooms < counts.Large.rooms && counts.Large.rooms < counts.Huge.rooms && counts.Huge.rooms < counts.Gargantuan.rooms, JSON.stringify(counts));
  assert.ok(counts.Gargantuan.bytes < 1_000_000, JSON.stringify(counts));
});

// ---- The inside follows the hull (2026-11-15): the plan is laid out in the outline the kit measured (shared/art/shipHulls.json) ----------------------

// What is wrong with an inside against its hull's outline and marks, as sentences
// (`empty`: the decks the plan dropped, nothing joining them to the bottom deck; `mark`: where the plan put the helm, the cockpit mark or the square under it)
const deckSquares = (hull: HullPlan, d: number) => hull.decks[d].rows.reduce((a, runs) => { for (let i = 0; i + 1 < runs.length; i += 2) a += runs[i + 1] - runs[i]; return a; }, 0);
function hullProblems(world: World, shipId: string, hull: HullPlan, empty = new Set<number>(), mark: HullMark = hull.cockpit): string[] {
  const problems: string[] = [];
  const rooms = childrenOf(world, shipBuildingIdOf(shipId)).filter((a) => a.kind === "room");
  const at = (a: Area) => `${a.name} (${a.id}, deck ${(a.layout?.level ?? 0) + 1})`;
  const rect = (l: RoomLayout) => ({ x: l.x, y: l.y, w: l.width, h: l.height });
  // every square of every room inside its deck's outline (a stair flight or a lift inside every deck it joins)
  for (const a of rooms) {
    const l = a.layout!;
    const [lo, hi] = floorsOf(l);
    for (let d = lo; d <= hi; d++) {
      const deck = hull.decks[d];
      if (!deck) { problems.push(`${at(a)}: on deck ${d + 1}, which the hull has not`); continue; }
      let out = 0;
      for (let y = l.y; y < l.y + l.height; y++) for (let x = l.x; x < l.x + l.width; x++) if (!insideHull(deck, x, y)) out++;
      if (out) problems.push(`${at(a)}: ${out} squares outside deck ${d + 1}'s outline`);
    }
  }
  const decks = new Set(rooms.map((a) => a.layout!.level ?? 0)).size;
  if (decks !== hull.decks.length - empty.size) problems.push(`${decks} decks, the hull has ${hull.decks.length}${empty.size ? ` (${empty.size} dropped)` : ""}`);
  // the ramp on the ramp mark, in the boarding room
  const entry = world.areas[deckIdOf(shipId)];
  const ramp = entry.layout!.assets.find((x) => x.ref === "station:ramp");
  if (!ramp) problems.push("no ramp");
  else if (Math.max(Math.abs(entry.layout!.x + ramp.x - hull.ramp.x), Math.abs(entry.layout!.y + ramp.y - hull.ramp.y)) > 1) problems.push(`the ramp is at ${entry.layout!.x + ramp.x},${entry.layout!.y + ramp.y}, the mark at ${hull.ramp.x},${hull.ramp.y}`);
  // the helm at the cockpit mark
  const helm = rooms.filter((a) => /^(bridge|cockpit)$/i.test(a.name) && (a.layout!.level ?? 0) === mark.deck);
  if (!helm.some((a) => rectDistance(rect(a.layout!), mark.x, mark.y) <= 2)) problems.push(`no bridge or cockpit within 2 squares of the cockpit mark (${mark.x},${mark.y}, deck ${mark.deck + 1})`);
  // an engine room at the engines
  // (where the engines' deck has room for an engine room: a cramped hull has an engine nook if one fits)
  if (hull.engines.some((m) => !empty.has(m.deck) && deckSquares(hull, m.deck) >= 40)) {
    const engines = rooms.filter((a) => /^engine (room|bay)$/i.test(a.name));
    if (!hull.engines.some((m) => engines.some((a) => (a.layout!.level ?? 0) === m.deck && rectDistance(rect(a.layout!), m.x, m.y) <= 4))) problems.push("no engine room within 4 squares of an engine mark");
  }
  // every window at a window mark, on the wall it looks out of
  const marks = (m: HullMark) => `${m.deck}:${m.x},${m.y}:${m.side}`;
  const glass = new Set(hull.windows.map(marks));
  for (const a of rooms) for (const w of a.layout!.assets.filter((x) => x.kind === "window")) {
    if (!glass.has(marks({ deck: a.layout!.level ?? 0, x: a.layout!.x + w.x, y: a.layout!.y + w.y, side: w.side }))) problems.push(`${at(a)}: a window at ${a.layout!.x + w.x},${a.layout!.y + w.y} ${w.side} where the hull has no glass`);
  }
  return problems;
}

// A hull from a test of the squares inside each deck
function hullFrom(L: number, B: number, decks: ((x: number, y: number) => boolean)[], marks: Pick<HullPlan, "cockpit" | "ramp" | "engines" | "windows">, folded = false): HullPlan {
  return {
    cell: [1.4066, 1.4066], origin: [0, 0], L, B, folded,
    decks: decks.map((inside, level) => ({
      level, floor: level * 3, head: 2.6,
      rows: Array.from({ length: B }, (_, y) => {
        const runs: number[] = [];
        for (let x = 0; x < L; x++) if (inside(x, y) && !inside(x - 1, y)) { let e = x; while (e < L && inside(e, y)) e++; runs.push(x, e); }
        return runs;
      }),
    })),
    hatches: [], ...marks,
  };
}
// The glass of a hull: the outline's squares of a deck, every `step`-th, where a test says
function glassOf(h: HullPlan, deck: number, where: (x: number, y: number) => boolean, step = 3): HullMark[] {
  const out: HullMark[] = [];
  const dk = h.decks[deck];
  for (let y = 0; y < h.B; y++) for (let x = 0; x < h.L; x++) {
    if (!insideHull(dk, x, y) || !where(x, y) || (x + y) % step) continue;
    for (const [side, dx, dy] of [["n", 0, -1], ["s", 0, 1], ["e", 1, 0], ["w", -1, 0]] as const) if (!insideHull(dk, x + dx, y + dy)) { out.push({ deck, x, y, side }); break; }
  }
  return out;
}
const withGlass = (h: HullPlan, deck: number, where: (x: number, y: number) => boolean, step = 3): HullPlan => ({ ...h, windows: [...h.windows, ...glassOf(h, deck, where, step)] });

const SYNTHETIC: { name: string; size: string; role: string; hull: HullPlan; dropped?: number }[] = (() => {
  // a wedge tapering to the bow, two decks, the upper shorter
  const wedgeIn = (x: number, y: number) => x >= 0 && x < 34 && Math.abs(y + 0.5 - 9) < 9 * (1 - x / 40);
  let wedge = hullFrom(34, 18, [wedgeIn, (x, y) => wedgeIn(x, y) && x >= 3 && x < 28], { cockpit: { deck: 1, x: 26, y: 9 }, ramp: { deck: 0, x: 8, y: 15, side: "s" }, engines: [{ deck: 0, x: 0, y: 8 }, { deck: 0, x: 0, y: 10 }], windows: [] });
  wedge = withGlass(withGlass(wedge, 1, (x) => x >= 22), 0, () => true, 5);
  // a saucer with the cockpit in a tube off its side, one deck
  const discIn = (x: number, y: number) => Math.hypot(x + 0.5 - 11, y + 0.5 - 11.5) < 10.6 || (x >= 15 && x < 26 && y >= 1 && y < 5);
  let disc = hullFrom(26, 23, [discIn], { cockpit: { deck: 0, x: 24, y: 3 }, ramp: { deck: 0, x: 6, y: 12, side: "down" }, engines: [{ deck: 0, x: 1, y: 11 }], windows: [] });
  disc = withGlass(disc, 0, (x) => x >= 22, 1);
  // a narrow hull, nine squares across, three decks (no stairwell fits: a lift or a ladder)
  const narrowIn = (x: number, y: number) => x >= 0 && x < 46 && y >= 0 && y < 9 && !(x > 40 && (y === 0 || y === 8));
  const narrow = withGlass(hullFrom(46, 9, [narrowIn, narrowIn, (x, y) => narrowIn(x, y) && x >= 6 && x < 44], { cockpit: { deck: 2, x: 42, y: 4 }, ramp: { deck: 0, x: 14, y: 8, side: "s" }, engines: [{ deck: 0, x: 0, y: 4 }, { deck: 1, x: 0, y: 4 }], windows: [] }), 2, (x) => x >= 39);
  // two prongs forward of the body, the cockpit at the tip of one
  const prongIn = (x: number, y: number) => x >= 0 && x < 44 && y >= 1 && y < 25 && (x < 22 || y < 9 || y >= 17);
  const prong = withGlass(hullFrom(44, 26, [prongIn, (x, y) => x >= 2 && x < 20 && y >= 3 && y < 23], { cockpit: { deck: 0, x: 42, y: 5 }, ramp: { deck: 0, x: 10, y: 24, side: "s" }, engines: [{ deck: 0, x: 0, y: 12 }], windows: [] }), 0, (x) => x >= 38, 1);
  // a folded section: a long hull fitted into the Huge frame's box
  const foldIn = (x: number, y: number) => x >= 0 && x < 84 && Math.abs(y + 0.5 - 9.5) < 9.5 * (1 - x / 120);
  const fold = hullFrom(84, 19, [foldIn, foldIn, foldIn, foldIn, (x, y) => foldIn(x, y) && x > 50 && x < 80], { cockpit: { deck: 4, x: 72, y: 9 }, ramp: { deck: 0, x: 30, y: 17, side: "s" }, engines: [{ deck: 0, x: 0, y: 9 }, { deck: 1, x: 0, y: 9 }], windows: [] }, true);
  // a small shuttle's hull
  const shuttleIn = (x: number, y: number) => x >= 0 && x < 11 && y >= 0 && y < 8 && !(x >= 8 && (y === 0 || y === 7));
  const shuttle = withGlass(hullFrom(11, 8, [shuttleIn], { cockpit: { deck: 0, x: 10, y: 4 }, ramp: { deck: 0, x: 5, y: 7, side: "s" }, engines: [{ deck: 0, x: 0, y: 4 }], windows: [] }), 0, (x) => x >= 9, 1);
  // a bridge tower standing clear of the deck under it (no square of it over the deck below): the tower's deck is dropped, the bridge comes down
  const towerIn = (x: number, y: number) => x >= 0 && x < 30 && y >= 2 && y < 16;
  const tower = hullFrom(40, 18, [towerIn, towerIn, (x, y) => x >= 32 && x < 38 && y >= 6 && y < 12], { cockpit: { deck: 2, x: 36, y: 9 }, ramp: { deck: 0, x: 10, y: 15, side: "s" }, engines: [{ deck: 0, x: 0, y: 9 }], windows: [] });
  return [
    { name: "tower", size: "Large", role: "Cruiser", hull: tower, dropped: 1 },
    { name: "wedge", size: "Medium", role: "Freighter", hull: wedge },
    { name: "disc", size: "Medium", role: "Yacht", hull: disc },
    { name: "narrow", size: "Large", role: "Corvette", hull: narrow },
    { name: "prong", size: "Medium", role: "Gunship", hull: prong },
    { name: "fold", size: "Huge", role: "Carrier", hull: fold },
    { name: "shuttle", size: "Small", role: "Shuttle", hull: shuttle },
  ];
})();

// A world with the inside of a ship planned in a given hull
function boardedIn(ship: ReturnType<typeof shipOf>, hull: HullPlan, name: string, seed = 11): { world: World; plan: ReturnType<typeof planInterior> } {
  const world = worldWithBerth();
  const buildingId = shipBuildingIdOf(ship.id);
  const built = shipInteriorOf(ship, buildingId, deckIdOf(ship.id), seed, { name, hull });
  assert.equal(built.plan.hullName, name, `${name} ${ship.owner}: the plan did not follow the hull`);
  world.areas[buildingId] = { id: buildingId, kind: "building", name: ship.name, parentId: "berth", type: "starship", description: "", tags: [`ship:${ship.id}`, `hull:${name}`], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [] } as unknown as Area;
  for (const room of built.rooms) world.areas[room.id] = room;
  world.paths = [...world.paths, ...built.paths];
  return { world, plan: built.plan };
}

test("an inside follows the outline of its hull: a wedge, a saucer with a side tube, a narrow hull, two prongs, a folded section, a shuttle", () => {
  const found: string[] = [];
  let n = 500;
  for (const c of SYNTHETIC) {
    for (const faction of FACTIONS) {
      const ship = shipOf(c.size, c.role, OWNERS[faction], ++n);
      const { world, plan } = boardedIn(ship, c.hull, c.name, n);
      for (const p of [...audit(world, ship.id), ...hullProblems(world, ship.id, c.hull, new Set(plan.dropped), plan.helmMark)]) found.push(`${c.name} ${faction}: ${p}`);
      if ((plan.dropped ?? []).length !== (c.dropped ?? 0)) found.push(`${c.name} ${faction}: ${plan.dropped?.length} decks dropped, ${c.dropped ?? 0} expected`);
      const seats = seatsOfShip(world, ship.id);
      if (seats.filter((x) => x.station === "helm").length !== 1) found.push(`${c.name} ${faction}: not one helm`);
      if (seats.filter((x) => x.station === "engines").length !== 1) found.push(`${c.name} ${faction}: not one engine station`);
      const rooms = childrenOf(world, shipBuildingIdOf(ship.id));
      if (["Large", "Huge", "Gargantuan"].includes(c.size) && !rooms.some((a) => a.name === "Turbolift" || a.name === "Ladder")) found.push(`${c.name} ${faction}: a Large ship with no turbolift`);
    }
  }
  assert.deepEqual(found.slice(0, 40), []);
});

test("a hull too small to hold the plan falls back to the frame of its size", () => {
  const tiny = hullFrom(3, 3, [() => true], { cockpit: { deck: 0, x: 2, y: 1 }, ramp: { deck: 0, x: 0, y: 1, side: "w" }, engines: [], windows: [] });
  const ship = shipOf("Medium", "Freighter", OWNERS.rebel);
  const plan = planInterior(ship, 3, { name: "tiny", hull: tiny });
  assert.equal(plan.hullName, undefined);
  assert.equal(plan.frame.D, FRAMES.Medium.D);
});

// The kit's hulls that have an inside: the Small shuttles and every faction's Medium to Gargantuan
const KIT_CASES = [
  ...FACTIONS.map((f) => ({ size: "Small", role: "Shuttle", owner: OWNERS[f] })),
  ...["Medium", "Large", "Huge", "Gargantuan"].flatMap((size) => FACTIONS.map((f) => ({ size, role: ROLES[size][0], owner: OWNERS[f] }))),
];
test("the inside of every kit hull follows its outline", () => {
  const found: string[] = [];
  const missing: string[] = [];
  const empty: string[] = [];
  const emptied: string[] = [];
  const counts: string[] = [];
  let n = 900;
  for (const c of KIT_CASES) {
    const ship = shipOf(c.size, c.role, c.owner, ++n);
    const hull = hullOf(ship);
    if (!hull) { missing.push(hullNameOf(ship)); continue; }
    const why: string[] = [];
    const plan = planFromHull(ship, 1, hull, hullNameOf(ship), why);
    // (a hull with less than a cockpit and a cabin, a Small fighter's that a faction's shuttle borrows, has no inside: the frame's shuttle stands in)
    const squares = hull.decks.reduce((a, _, d) => a + deckSquares(hull, d), 0);
    if (squares < 8) { empty.push(`${hullNameOf(ship)} (${squares} squares)`); continue; }
    const left = new Set(plan?.dropped ?? []);
    if (left.size) emptied.push(`${hullNameOf(ship)}: decks ${[...left].map((d) => d + 1).join(", ")} dropped`);
    const { world } = boardShip(worldWithBerth(), ship, "berth");
    const tag = world.areas[shipBuildingIdOf(ship.id)].tags.find((t) => t.startsWith("hull:"));
    if (tag !== `hull:${hullNameOf(ship)}`) { found.push(`${hullNameOf(ship)}: not laid out in its hull (fell back to the frame: ${why.join("; ")})`); continue; }
    for (const p of [...audit(world, ship.id), ...hullProblems(world, ship.id, hull, left, plan?.helmMark)]) found.push(`${hullNameOf(ship)}: ${p}`);
    const seats = seatsOfShip(world, ship.id);
    for (const st of c.size === "Small" ? ["helm", "engines"] : ["helm", "copilot", "nav", "engines"]) if (seats.filter((x) => x.station === st).length !== 1) found.push(`${hullNameOf(ship)}: ${seats.filter((x) => x.station === st).length} ${st} stations`);
    if (c.size !== "Small" && !seats.some((x) => x.station === "guns")) found.push(`${hullNameOf(ship)}: no gunnery seat`);
    counts.push(`${hullNameOf(ship)} ${childrenOf(world, shipBuildingIdOf(ship.id)).length}`);
    if (["Large", "Huge", "Gargantuan"].includes(c.size) && !childrenOf(world, shipBuildingIdOf(ship.id)).some((a) => a.name === "Turbolift" || a.name === "Ladder")) found.push(`${hullNameOf(ship)}: no turbolift`);
  }
  if (empty.length) console.log(`(no inside in ${empty.length} hulls: ${empty.join(", ")}; the frame's plan stands in)`);
  if (emptied.length) console.log(`(${emptied.join("; ")})`);
  console.log(`(rooms: ${counts.join(", ")})`);
  if (missing.length) console.log(`(no outline yet for ${missing.length} kit hulls: ${[...new Set(missing)].join(", ")})`);
  assert.deepEqual(found.slice(0, 40), []);
});

test("a ship whose maker changes (a captured ship) is laid out again in its new hull, and its ramp is no way in the wall", () => {
  let world = worldWithBerth();
  const ship = shipOf("Large", "Corvette", "Galactic Empire", 9);
  world = boardShip(world, ship, "berth").world;
  assert.ok(world.areas[shipBuildingIdOf(ship.id)].tags.includes("hull:ship_imperial_large"));
  world = boardShip(world, { ...ship, owner: "Kessa Dray" }, "berth").world;
  const tags = world.areas[shipBuildingIdOf(ship.id)].tags;
  assert.ok(tags.includes("hull:ship_civilian_large"), tags.join());
  assert.equal(tags.filter((t) => t.startsWith("hull:")).length, 1);
  // (the ramp's wall is `toward`: `side` would make the rest of the game take it for a doorway)
  const ramp = world.areas[deckIdOf(ship.id)].layout!.assets.find((a) => a.ref === "station:ramp")!;
  assert.equal(ramp.side, undefined);
});
