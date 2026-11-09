// The starship kit (2026-11-09, tools/blender/build-ships.py -> figures/ships.glb and shared/art/shipKit.json): a ship of every faction for every
// size, each within the book's size band; at the people's scale (models.tsx UNITS_PER_M) each Tiny to Large ship fits the berth of its size
// (SHIP_FOOTPRINT) and clears the roof of a hangar built for it (SHIP_STOREYS); Huge and Gargantuan ships put down nowhere (the user: they stay in orbit).
import test from "node:test";
import assert from "node:assert/strict";
import kit from "../../shared/art/shipKit.json";
import { SHIP_FOOTPRINT, SHIP_STOREYS, shipLands, hangarStoreys, helmExits, generateWorld, holdsShips, visitorBerthSizes, withPartyShips, type World, type Area, type PartyShip } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// (models.tsx UNITS_PER_M: a person of 1.702 m stands 1.21 squares; the storey is LocalMap's LEVEL_H)
const UNITS_PER_M = 1.21 / 1.702;
const LEVEL_H = 3.4;
const ships = (kit as { ships: Record<string, { faction: string; size: string; role: string; length: number; beam: number; height: number; tris: number }> }).ships;
const FACTIONS = ["imperial", "rebel", "republic", "separatist", "mandalorian", "criminal", "civilian"];
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
// The book's size bands (rulesStarships, "Size Categories"), in metres: Tiny up to 25 ft., Small 25 to 50, Medium 50 to 250, Large 250 to 2,500,
// Huge 2,500 to 10,000, Gargantuan 10,000 and more; a ship's "space" is what it controls, so the smallest of a band may be a little under it
const FT = 0.3048;
const BAND: Record<string, [number, number]> = { Tiny: [0, 25 * FT], Small: [5, 50 * FT], Medium: [15, 250 * FT], Large: [76, 2500 * FT], Huge: [760, 10000 * FT], Gargantuan: [3000, 1e6] };

test("every faction has a kit ship of every size, each within its size's band", () => {
  for (const f of FACTIONS) {
    for (const size of SIZES) {
      const s = ships[`ship_${f}_${size.toLowerCase()}`];
      assert.ok(s, `ship_${f}_${size.toLowerCase()}`);
      assert.equal(s.faction, f);
      assert.equal(s.size, size);
      const [lo, hi] = BAND[size];
      assert.ok(s.length >= lo && s.length <= hi, `${f} ${size} is ${s.length} m long, outside ${lo}..${hi}`);
      // (the big ships carry their dressing of ports, plating, guns and masts: more triangles, still within a budget)
      const most = ["Large", "Huge", "Gargantuan"].includes(size) ? 12000 : 4000;
      assert.ok(s.tris > 0 && s.tris < most, `${f} ${size}: ${s.tris} triangles`);
    }
  }
});

test("at the people's scale every ship that berths fits its berth and clears its hangar's roof", () => {
  for (const [name, s] of Object.entries(ships)) {
    if (!shipLands(s.size)) continue;
    const [w, h] = SHIP_FOOTPRINT[s.size];
    assert.ok(s.length * UNITS_PER_M <= w, `${name}: ${(s.length * UNITS_PER_M).toFixed(1)} squares long in a berth of ${w}`);
    assert.ok(s.beam * UNITS_PER_M <= h, `${name}: ${(s.beam * UNITS_PER_M).toFixed(1)} squares across in a berth of ${h}`);
    assert.ok(s.height * UNITS_PER_M <= SHIP_STOREYS[s.size] * LEVEL_H - 0.3, `${name}: ${(s.height * UNITS_PER_M).toFixed(1)} squares high under ${SHIP_STOREYS[s.size]} storeys`);
  }
  // (a hangar with a berth kept for visitors stands for a Medium ship)
  assert.equal(hangarStoreys({ ships: [], tags: ["code:berths:1"] }), SHIP_STOREYS.Medium);
  assert.equal(hangarStoreys({ ships: [] }), 1);
  // (and one kept for a Large ship, for a Large one)
  assert.equal(hangarStoreys({ ships: [], tags: ["code:berths:1:Large"] }), SHIP_STOREYS.Large);
  assert.deepEqual(visitorBerthSizes({ tags: ["code:berths:2"] }), ["Medium", "Medium"]);
  assert.deepEqual(visitorBerthSizes({ tags: ["code:berths:1:Large"] }), ["Large"]);
  assert.deepEqual(visitorBerthSizes({ tags: ["code:berths:1:Enormous"] }), ["Medium"]);
});

test("a party's ship takes the smallest free berth it fits, and a too-small one only where none fits", () => {
  const berth = (id: string, w: number, h: number) => ({ id, kind: "ship", name: "Visitors' berth", x: 1, y: 1, w, h, blocks: true, cover: true, ref: `${id}-ref` });
  const room = (id: string, ...assets: ReturnType<typeof berth>[]) =>
    ({ id, kind: "room", name: id, parentId: "port", description: "", danger: 0, occupants: [], ships: [], loot: [], tags: [], position: { x: 0, y: 0, z: 0 }, layout: { width: 100, height: 40, assets } }) as unknown as Area;
  const port = { id: "port", kind: "settlement", name: "Port", description: "", danger: 0, occupants: [], ships: [], loot: [], tags: [], position: { x: 0, y: 0, z: 0 } } as unknown as Area;
  const world = { areas: { port, a: room("a", berth("m1", 28, 20), berth("m2", 28, 20)), b: room("b", berth("l1", 78, 32)) } } as unknown as World;
  const ship = (id: string, size: string) => ({ id, name: id, size, role: "corvette", status: "landed", owner: "Party", areaId: "port", fuel: 5 }) as unknown as PartyShip;
  const at = (w: World, id: string) => Object.values(w.areas).find((r) => r.ships.some((s) => s.id === id))?.layout?.assets.find((x) => x.ref === id)?.id;
  // A Large ship goes to the Large berth in the other hangar, a Medium one to a Medium berth
  assert.equal(at(withPartyShips(world, [ship("big", "Large")]), "big"), "l1");
  assert.match(at(withPartyShips(world, [ship("mid", "Medium")]), "mid") ?? "", /^m/);
  // With the Large berth taken, a second Large ship falls back to the largest free berth there is
  const two = withPartyShips(world, [ship("big", "Large"), ship("big2", "Large")]);
  assert.equal(at(two, "big"), "l1");
  assert.match(at(two, "big2") ?? "", /^m/);
});

test("a Huge or Gargantuan ship is offered no landing; the smaller ones are", async () => {
  assert.equal(shipLands("Large"), true);
  assert.equal(shipLands("Huge"), false);
  assert.equal(shipLands("Gargantuan"), false);
  const world: World = generateWorld({ seed: 3, partyLevel: 5 }, await getWorldCatalog());
  const planet = Object.values(world.areas).find((a) => a.kind === "planet" && helmExits(world, a.id).some((e) => world.areas[e.to]?.kind === "settlement"));
  assert.ok(planet, "a planet with a landing");
  const lands = (size?: string) => helmExits(world, planet!.id, size).filter((e) => world.areas[e.to]?.kind === "settlement").length;
  assert.ok(lands("Medium") > 0 && lands("Large") > 0);
  assert.equal(lands("Huge"), 0);
  assert.equal(lands("Gargantuan"), 0);
  // (and the way back up and out still is)
  assert.equal(helmExits(world, planet!.id, "Huge").length, helmExits(world, planet!.id).length - lands());
  // The generator's hangars hold their ships' berths at the new sizes
  let large = 0;
  for (const room of Object.values(world.areas).filter((a) => a.kind === "room" && holdsShips(a) && a.layout)) {
    for (const a of room.layout!.assets.filter((x) => x.kind === "ship")) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= room.layout!.width && a.y + a.h <= room.layout!.height, `${room.name}: a berth off the floor`);
    }
    // (a town's landing field keeps a berth for a Large ship, a whole one)
    if (visitorBerthSizes(room).includes("Large")) {
      const [fw, fh] = SHIP_FOOTPRINT.Large;
      assert.ok(room.layout!.assets.some((x) => x.kind === "ship" && /-berth/.test(x.ref ?? "") && x.w >= fw && x.h >= fh), `${room.name}: no whole Large berth`);
      large++;
    }
  }
  assert.ok(large > 0, "a port with a berth for a Large ship");
});
