// The starship kit (2026-11-09, tools/blender/build-ships.py -> figures/ships.glb and shared/art/shipKit.json): a ship of every faction for every
// size, each within the book's size band; at the people's scale (models.tsx UNITS_PER_M) each Tiny to Large ship fits the berth of its size
// (SHIP_FOOTPRINT) and clears the roof of a hangar built for it (SHIP_STOREYS); Huge and Gargantuan ships put down nowhere (the user: they stay in orbit).
import test from "node:test";
import assert from "node:assert/strict";
import kit from "../../shared/art/shipKit.json";
import { SHIP_FOOTPRINT, SHIP_STOREYS, shipLands, hangarStoreys, helmExits, generateWorld, holdsShips, type World } from "@shared/logic";
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
      assert.ok(s.tris > 0 && s.tris < 4000, `${f} ${size}: ${s.tris} triangles`);
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
  for (const room of Object.values(world.areas).filter((a) => a.kind === "room" && holdsShips(a) && a.layout)) {
    for (const a of room.layout!.assets.filter((x) => x.kind === "ship")) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= room.layout!.width && a.y + a.h <= room.layout!.height, `${room.name}: a berth off the floor`);
    }
  }
});
