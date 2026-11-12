import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MOD_REGIONS, MOD_TEXTURED, TIMBER_REGIONS, awningOf, corniceOf, extPackOf, propScale, roofEdgeRuns, roofPropOf, roofSpot, runOf, type ExtPack } from "../../client/src/components/Map/interiors/modular";
import { familyOf } from "../../client/src/components/Map/interiors/architecture";

const kit = JSON.parse(fs.readFileSync("shared/art/modularKit.json", "utf8")) as Record<string, { file: string; box: number[]; tris: number; regions: number[] }>;
const PACKS: ExtPack[] = ["desert", "classical", "deco", "industrial", "hull", "frontier"];

test("a building takes the pack of its world, and the trades and depots shift it", () => {
  const pack = (biome: string, type: string) => extPackOf(familyOf(biome, type), biome, type);
  assert.equal(pack("desert", "cantina"), "desert", "Mos Eisley's cantina is adobe");
  assert.equal(pack("desert", "palace"), "classical", "a desert palace is a domed hall (Jabba's)");
  assert.equal(pack("desert", "junkyard"), "frontier", "a scrapper's yard is tin and planks");
  assert.equal(pack("temperate", "market"), "classical", "Theed's markets are not a shanty town");
  assert.equal(pack("temperate", "palace"), "classical");
  assert.equal(pack("urban", "tenements"), "deco");
  assert.equal(pack("urban", "warehouse"), "industrial", "a depot is steel on any world");
  assert.equal(pack("ocean", "market"), "hull");
  assert.equal(pack("station", "starship"), "hull");
  assert.equal(pack("volcanic", "garrison"), "industrial");
  assert.equal(pack("forest", "cantina"), null, "the timber villages keep their own kit");
  assert.equal(pack("ice", "garrison"), null, "so do the polar hatches");
});

test("every piece a pack names is in the kit, and has what it is drawn from", () => {
  for (const pack of PACKS) {
    const names = new Set<string>();
    for (let n = 0; n < 4; n++) {
      const prop = roofPropOf(pack, n, 8);
      assert.ok(prop, `${pack}: roof prop ${n}`);
      names.add(prop!.piece);
    }
    for (const extra of [awningOf(pack), corniceOf(pack)]) if (extra) names.add(extra);
    for (const name of names) {
      assert.ok(name.startsWith(`ext_${pack}_`), `${name} is not ${pack}'s`);
      assert.ok(kit[name], `${name} is not in modularKit.json`);
      assert.equal(kit[name].file, "ext");
    }
  }
  assert.ok(fs.existsSync("client/public/figures/modular_ext.glb"));
  // (the pieces were unwrapped and shaded in Mixar: all have coordinates, occlusion and regions; the catalogue lists the regions of each)
  for (const [name, p] of Object.entries(kit)) if (name.startsWith("ext_")) assert.ok(p.regions.length > 0 && p.tris > 0, name);
});

test("a pack's regions are drawn in textures that are in the game", () => {
  for (const pack of PACKS) {
    for (const [region, look] of Object.entries(MOD_REGIONS[pack])) {
      assert.ok(Number(region) >= 0 && Number(region) <= 6, `${pack} region ${region}`);
      if (MOD_TEXTURED.has(look.finish)) assert.ok(look.finish.length > 0);
    }
  }
  for (const set of ["wall/adobe_plaster", "wall/copper_patina", "wall/painted_plaster_wall", "wall/sandstone_blocks_05", "wall/concrete_wall_003", "wall/corrugated_iron_02", "wall/rusty_metal_02", "wood/brown_planks_03"]) {
    for (const map of ["diffuse", "normal", "height"]) assert.ok(fs.existsSync(`client/public/textures/${set}/${map}.jpg`), `${set}/${map}.jpg`);
  }
});

test("a roof prop is sized to its roof, and a small roof has none", () => {
  assert.equal(roofPropOf("desert", 0, 2), null, "too small: it would fill the roof");
  const dome = roofPropOf("desert", 0, 6)!;
  assert.equal(propScale(dome, 6), 6 * 0.4);
  const fixed = roofPropOf("desert", 1, 6)!;
  assert.ok(fixed.fixed && fixed.corner);
  assert.equal(propScale(fixed, 3), 0.9, "a vaporator keeps its size on a small roof");
  assert.equal(propScale(fixed, 30), 1.5, "and does not become a tower on a big one");
  assert.notEqual(roofPropOf("industrial", 2, 4)!.piece, "ext_industrial_guard_tower", "the guard tower is for a bigger roof");
  assert.deepEqual(runOf(7), { count: 4, stretch: 7 / 8 });
  assert.equal(runOf(0.5).count, 1);
});

test("a facade skin fills the plain wall, stops at the corners' curves and leaves the ways in alone", async () => {
  const { facadePlan } = await import("../../client/src/components/Map/interiors/modular");
  const plan = facadePlan("desert", 8, 6, [0, 0, 0, 0], [{ side: "s", at: 4.5 }]);
  const south = plan.filter((s) => s.side === "s");
  assert.ok(south.every((s) => Math.abs(s.at - 4.5) >= 1), "no panel over the door");
  assert.equal(plan.filter((s) => s.side === "n").length, 4, "eight squares of plain wall are four panels");
  const round = facadePlan("desert", 8, 6, [2, 2, 2, 2], []);
  assert.ok(round.filter((s) => s.side === "n").every((s) => s.at > 2 && s.at < 6), "the north panels stand between the corners' curves");
  for (const s of plan) assert.ok(kit[s.piece], `${s.piece} is in the kit`);
  assert.ok(plan.every((s) => s.stretch > 0.7 && s.stretch < 1.4));
});

test("a round room's wall ring is bays of the interior kit, fewer where a way in takes its share, and a tight ring keeps the plain wall", async () => {
  const { bayRing, interiorStyleOf, INTERIOR_LOOK, INTERIOR_BAY_MIN_R } = await import("../../client/src/components/Map/interiors/modular");
  const whole = bayRing(4, Math.PI, Math.PI, Math.PI * 1.5);
  assert.equal(whole.length, 4, "a quarter of a 16-bay ring is four bays");
  assert.ok(Math.abs(whole[0].across - 1) < 0.02, "at the kit's own radius a bay is as it was built");
  assert.ok(whole.every((b, i) => i === 0 || Math.abs(b.angle - whole[i - 1].angle - Math.PI / 8) < 1e-9), "22.5 degrees apart");
  const cut = bayRing(4, Math.PI, Math.PI, Math.PI * 1.25);
  assert.ok(cut.length >= 2 && cut.length <= 3, "a door's share is left out");
  // a part of a quarter is filled exactly: its bays meet end to end at the part's own ends, so a window's gap is never covered by a bay that straddles it (2026-11-12)
  const from = Math.PI + 0.3, to = Math.PI + 1.2;
  const part = bayRing(5, Math.PI, from, to);
  const half = (b: { angle: number }) => ((to - from) / part.length) / 2;
  assert.ok(Math.abs(part[0].angle - half(part[0]) - from) < 1e-9 && Math.abs(part[part.length - 1].angle + half(part[0]) - to) < 1e-9, "from the one end to the other");
  assert.deepEqual(bayRing(5, Math.PI, from, from), []);
  assert.deepEqual(bayRing(INTERIOR_BAY_MIN_R - 0.1, 0), []);
  assert.ok(bayRing(8, 0).length > bayRing(3, 0).length, "a wider ring takes more bays");
  assert.equal(interiorStyleOf("medical", "desert"), "medical");
  assert.equal(interiorStyleOf(undefined, "desert"), "desert");
  assert.equal(interiorStyleOf(undefined, "urban"), "republic");
  for (const style of ["desert", "imperial", "palace", "republic", "workshop", "medical"] as const) {
    assert.ok(kit[`int_${style}_bay_blank`], `${style} has its blank bay`);
    assert.ok(INTERIOR_LOOK[style][0], `${style} has a look for its body`);
  }
  for (const f of ["imperial", "hull"]) for (const a of ["arc22", "arc45", "arc90", "arc45_spoke"]) assert.ok(kit[`int_corr_${f}_${a}`], `${f} ${a}`);
});

test("the timber villages' kit is drawn in planks on its body, trim and timbers, and its canopy and thatch keep their own finishes", () => {
  for (const region of [0, 1, 4]) {
    assert.equal(TIMBER_REGIONS[region]?.finish, "planks", `region ${region}`);
    assert.ok(MOD_TEXTURED.has(TIMBER_REGIONS[region].finish), "a finish that takes the piece's own coordinates");
  }
  for (const region of [2, 3, 5, 6]) assert.equal(TIMBER_REGIONS[region], undefined, `region ${region} keeps the kit's own look (glow, glass, leaf, thatch)`);
});

test("a cornice follows the roof's radii: the four straight runs of a square roof, a ring of pieces on a round drum's circle, facing out", () => {
  // A square roof: north and south runs full width, east and west stopping 0.3 short of each corner, as the straight runs always were
  const square = roofEdgeRuns(7, 5);
  assert.equal(square.length, 4 + 4 + 2 + 2, "two squares a piece: 4 across the top and bottom, 2 down each side (4.4 long)");
  const north = square.filter((r) => Math.abs(r.at[1]) < 1e-9);
  assert.deepEqual(north.map((r) => +r.at[0].toFixed(3)), [0.875, 2.625, 4.375, 6.125]);
  assert.ok(north.every((r) => Math.abs(Math.abs(r.turn) - Math.PI) < 1e-9), "north faces -z");
  assert.ok(square.filter((r) => Math.abs(r.at[1] - 5) < 1e-9).every((r) => Math.abs(r.turn) < 1e-9), "south faces +z");
  assert.ok(square.filter((r) => Math.abs(r.at[0] - 7) < 1e-9).every((r) => Math.abs(r.turn - Math.PI / 2) < 1e-9), "east faces +x");
  assert.ok(square.filter((r) => Math.abs(r.at[0]) < 1e-9).every((r) => Math.abs(r.turn + Math.PI / 2) < 1e-9), "west faces -x");
  const eastWest = square.filter((r) => Math.abs(r.at[0] - 7) < 1e-9).map((r) => r.at[1]);
  assert.ok(Math.min(...eastWest) > 0.3 && Math.max(...eastWest) < 5 - 0.3, "the east run stops short of the corners");
  // A round drum of radius 4: every piece stands on the circle (within the chord's sag), faces straight out from the middle, and they close the ring
  const drum = roofEdgeRuns(8, 8, [4, 4, 4, 4]);
  assert.ok(drum.length >= 12, `a ring of pieces: ${drum.length}`);
  for (const r of drum) {
    const [dx, dz] = [r.at[0] - 4, r.at[1] - 4];
    const radius = Math.hypot(dx, dz);
    assert.ok(radius > 3.8 && radius <= 4 + 1e-9, `on the circle: ${radius}`);
    const away = Math.atan2(dx, dz);
    assert.ok(Math.abs(Math.atan2(Math.sin(r.turn - away), Math.cos(r.turn - away))) < 1e-6, "faces out from the middle");
  }
  const around = drum.reduce((a, r) => a + r.stretch * 2, 0);
  assert.ok(Math.abs(around - 2 * 4 * Math.sin(Math.PI / drum.length * 1) * drum.length) < 0.8 && around > 24 && around < 2 * Math.PI * 4 + 1e-9, `the chords make up the circle: ${around.toFixed(2)} of ${(2 * Math.PI * 4).toFixed(2)}`);
  // Mixed radii: one rounded corner has an arc of pieces, the three square ones do not
  const mixed = roofEdgeRuns(9, 6, [2.5, 0, 0, 0]);
  const corner = mixed.filter((r) => r.at[0] < 2.5 && r.at[1] < 2.5);
  assert.ok(corner.length >= 2 && corner.every((r) => Math.hypot(r.at[0] - 2.5, r.at[1] - 2.5) > 1.9), "the north-west corner is an arc, not the square one");
  assert.ok(!mixed.some((r) => r.at[0] < 0.5 && r.at[1] < 0.5), "no piece at the square-cut corner");
});

test("a roof prop stands on the roof: a corner dome is drawn in off a rounded or round roof's edge, and a square roof keeps its spot", () => {
  const square: [number, number, number, number] = [0, 0, 0, 0];
  // A square 12 x 8 roof: the corner spot at 75% / 72% is already well inside
  assert.deepEqual(roofSpot(12, 8, square, [9, 5.76], 1.4), [9, 5.76]);
  assert.deepEqual(roofSpot(12, 8, square, [6, 4], 3), [6, 4], "the middle stays");
  // A round drum of radius 4: the same corner is outside the circle; it comes in until its whole width is on the roof
  const round: [number, number, number, number] = [4, 4, 4, 4];
  const at = roofSpot(8, 8, round, [6, 5.76], 1.5);
  assert.ok(Math.hypot(at[0] - 4, at[1] - 4) <= 4 - 1.5 + 0.2, `clear of the edge: ${Math.hypot(at[0] - 4, at[1] - 4).toFixed(2)} from the middle`);
  assert.ok(at[0] < 6 && at[1] < 5.76, "drawn in towards the middle");
  // A stadium (an oval room): the same, and the middle is always allowed
  const stadium: [number, number, number, number] = [4, 4, 4, 4];
  const s2 = roofSpot(12, 8, stadium, [9, 5.76], 1.5);
  assert.ok(s2[0] <= 9 && s2[1] <= 5.76);
  assert.deepEqual(roofSpot(12, 8, stadium, [6, 4], 1.5), [6, 4]);
  // A prop too big for the roof is kept at the middle rather than flung off it
  const tiny = roofSpot(3, 3, [1.5, 1.5, 1.5, 1.5], [2.25, 2.0], 9);
  assert.ok(Math.hypot(tiny[0] - 1.5, tiny[1] - 1.5) < 0.2, `near the middle: ${tiny}`);
});
