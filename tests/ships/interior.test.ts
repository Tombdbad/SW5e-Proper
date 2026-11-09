// The inside of a starship (shared/logic/starshipInterior.ts): every size, role and maker of ship that has more than a cockpit has an inside that can be walked
// from the boarding ramp to every room, deck to deck by stairwells with no door on the way, with its stations where the crew rules look for them.
import test from "node:test";
import assert from "node:assert/strict";
import {
  boardShip, deckIdOf, shipBuildingIdOf, seatsOfShip, aboardShipId, hasInterior, FACTIONS, FRAMES, childrenOf, floorFaults, floorsOf, formOf, standsAt, tagId,
  type World, type Area, type RoomLayout, type RoomAsset,
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
  // a stairwell: a landing on every deck, a flight between each two
  const decks = new Set(rooms.map((a) => a.layout!.level ?? 0)).size;
  for (const hall of rooms.filter((a) => tagId(a, "lane") === "hall")) {
    const parts = rooms.filter((a) => tagId(a, "block") === tagId(hall, "block"));
    const landings = parts.filter((a) => formOf(a) === "corridor").length;
    const flights = parts.filter((a) => formOf(a) === "stairs").length;
    if (landings !== decks || flights !== decks - 1) problems.push(`${at(hall)}: a stairwell of ${landings} landings and ${flights} flights on ${decks} decks`);
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
    assert.equal(counts[size].decks, FRAMES[size].D, size);
  }
  // (a bigger ship has more rooms; the biggest stays a size the world can keep: a megabyte or less)
  assert.ok(counts.Medium.rooms < counts.Large.rooms && counts.Large.rooms < counts.Huge.rooms && counts.Huge.rooms < counts.Gargantuan.rooms, JSON.stringify(counts));
  assert.ok(counts.Gargantuan.bytes < 1_000_000, JSON.stringify(counts));
});
