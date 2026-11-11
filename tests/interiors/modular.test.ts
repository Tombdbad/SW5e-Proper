import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MOD_REGIONS, MOD_TEXTURED, TIMBER_REGIONS, awningOf, corniceOf, extPackOf, propScale, roofPropOf, runOf, type ExtPack } from "../../client/src/components/Map/interiors/modular";
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
