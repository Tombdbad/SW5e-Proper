import test from "node:test";
import assert from "node:assert/strict";
import { signOf, signStyleOf, signpostOf, streetNameOf, scriptOf, sigilOf, signWearOf, pictogramOf, type SignWealth } from "../../shared/logic/signs";

// Signs (shared/logic/signs.ts): what a sign says and how it looks, from the place it hangs on. Pure: the same place, the same sign.

const TYPES = [
  "spaceport", "refuelling depot", "cargo hangar", "public hangar", "private hangar", "landing field", "docking ring", "city gate", "cantina", "cookshop",
  "rooming house", "gambling hall", "pawnshop", "promenade", "market", "general store", "armsmith", "tech shop", "apothecary", "outfitter", "curio shop",
  "garrison", "command post", "operations center", "medcenter", "workshop", "residences", "tenements", "transit hub", "droid dealer", "vehicle dealer",
  "shipyard", "palace", "royal hangar", "guardhouse", "estates", "manor house", "junkyard", "warehouse", "archive", "arena", "speeder platform",
];

test("each kind of building takes the style of what it is", () => {
  const style = (type: string, faction = "") => signStyleOf(type, faction);
  assert.equal(style("cantina"), "neon");
  assert.equal(style("gambling hall"), "neon");
  assert.equal(style("garrison", "Galactic Empire"), "stencil");
  assert.equal(style("medcenter"), "medical");
  assert.equal(style("apothecary"), "medical");
  assert.equal(style("public hangar"), "bay");
  assert.equal(style("docking ring"), "bay");
  assert.equal(style("armsmith"), "shop");
  assert.equal(style("droid dealer"), "shop");
  assert.equal(style("palace"), "crest");
  assert.equal(style("residences"), "plate");
  // the hostile and the wild have none
  for (const t of ["hideout", "camp", "cave", "ruin", "wreck", "trailhead"]) assert.equal(style(t), null, t);
});

test("who holds a place changes its sign: a Hutt's cantina in Hutt script, a Mandalorian clan's mark, a faction's colours on its walls", () => {
  assert.equal(signStyleOf("cantina", "Hutt Cartel"), "hutt");
  assert.equal(signStyleOf("pawnshop", "Hutt Cartel"), "hutt");
  assert.equal(signStyleOf("armsmith", "Hutt Cartel"), "shop");
  assert.equal(signStyleOf("garrison", "Mandalorian clans"), "clan");
  const empire = signOf({ name: "Garrison", type: "garrison", faction: "Galactic Empire", seed: 1 })!;
  const republic = signOf({ name: "Garrison", type: "garrison", faction: "Galactic Republic", seed: 1 })!;
  assert.notEqual(empire.ground, republic.ground);
  assert.equal(empire.text, "GARRISON");
  const clan = signOf({ name: "Hold", type: "garrison", faction: "Mandalorian clans", seed: 3 })!;
  assert.ok(clan.sigil, "a clan's sign carries its mark");
  assert.ok(clan.script?.length, "and its name in the script");
});

test("a room takes its own sign: a hangar its bay number, a ward the medical board, a bar its neon", () => {
  const bay = signOf({ name: "Docking Bay 94", type: "public hangar", room: "Public hangar", seed: 5, number: 7 })!;
  assert.equal(bay.style, "bay");
  assert.equal(bay.text, "7");
  const ward = signOf({ name: "Medcenter", type: "medcenter", room: "Ward", seed: 5 })!;
  assert.equal(ward.style, "medical");
  assert.equal(ward.shape, "board");
  const bar = signOf({ name: "The Rusty Mynock", type: "cantina", room: "Main bar", seed: 5 })!;
  assert.equal(bar.style, "neon");
  assert.equal(bar.shape, "board", "a bar's sign inside hangs flat");
  assert.equal(signOf({ name: "X", type: "cantina", room: "Cellar", seed: 5 }), null, "a cellar has none");
});

test("signs are deterministic, never empty, sized to the wall, and every lit one throws a light", () => {
  for (const type of TYPES) {
    for (const seed of [1, 2, 3, 41]) {
      for (const biome of ["desert", "urban", "forest", "ice"]) {
        const place = { name: `The ${type} of ${seed}`, type, seed, biome, span: 6, faction: seed % 2 ? "Hutt Cartel" : "Galactic Empire" };
        const a = signOf(place), b = signOf(place);
        assert.deepEqual(a, b, `${type} ${seed}`);
        if (!a) continue;
        assert.ok(a.text.trim().length > 0, `${type}: words`);
        assert.ok(a.w > 0.5 && a.w <= 4 && a.h > 0.1 && a.h <= 2.5, `${type}: ${a.w} x ${a.h}`);
        assert.equal(!!a.light, a.lit, `${type}: a lit sign throws light`);
        assert.ok(/^#[0-9a-f]{6}$/i.test(a.ground) && /^#[0-9a-f]{6}$/i.test(a.glow));
        assert.ok(a.key.length > 0);
      }
    }
  }
});

test("the planet and the wealth of a place show: wood in a forest, a rich board unworn, a squalid neon sputtering", () => {
  assert.equal(signOf({ name: "Outfitter", type: "outfitter", biome: "forest", seed: 2 })!.material, "wood");
  assert.equal(signOf({ name: "Outfitter", type: "outfitter", biome: "desert", seed: 2 })!.material, "metal");
  const wealths: SignWealth[] = ["squalid", "poor", "modest", "comfortable", "rich", "palatial"];
  const wear = wealths.map((w) => signWearOf(w, "temperate"));
  for (let i = 1; i < wear.length; i++) assert.ok(wear[i] <= wear[i - 1], "richer is less worn");
  assert.ok(signWearOf("poor", "desert") > signWearOf("poor", "temperate"), "sand wears a board");
  const squalid = signOf({ name: "Dive", type: "cantina", wealth: "squalid", seed: 9 })!;
  const rich = signOf({ name: "Dive", type: "cantina", wealth: "rich", seed: 9 })!;
  assert.ok(squalid.flicker > 0 && rich.flicker === 0);
});

test("the script is an alphabet: one glyph to a letter, no two letters alike, gaps kept", () => {
  const a = scriptOf("MOS"), b = scriptOf("mos");
  assert.deepEqual(a, b);
  assert.deepEqual(scriptOf("A")[0], scriptOf("AA")[1]);
  const all = scriptOf("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").map((g) => JSON.stringify(g));
  assert.equal(new Set(all).size, all.length);
  for (const g of scriptOf("ABC")) assert.ok(g.length >= 2 && g.every(([p, q]) => p >= 0 && p <= 8 && q >= 0 && q <= 8));
  assert.deepEqual(scriptOf("A B")[1], []);
  assert.deepEqual(sigilOf("clan Rook"), sigilOf("clan Rook"));
});

test("street plates and signposts", () => {
  assert.equal(streetNameOf("Cantina Quarter", 4), streetNameOf("Cantina Quarter", 4));
  assert.match(streetNameOf("Cantina Quarter", 4), /^Cantina (Way|Row|Lane|Walk|Run|Street|Crossing)$/);
  const post = signpostOf("Mos Pelgo spaceport, the long road", true, "urban", 3);
  assert.equal(post.style, "street");
  assert.equal(post.pictogram, "arrow");
  assert.equal(post.text, "Mos Pelgo spaceport");
  assert.equal(pictogramOf("armsmith"), "blaster");
});
