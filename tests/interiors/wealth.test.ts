import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { skinOf, wealthOf, shiftWealth, lookOf, LOOKS, WEALTH } from "../../client/src/components/Map/interiors/wealth";

test("a palace is graded from throne room to servants' hall", () => {
  assert.equal(wealthOf("palace", "Audience chamber"), "palatial");
  assert.equal(wealthOf("palace", "Guest rooms"), "rich");
  assert.equal(wealthOf("palace", "Servants' quarters"), "modest");
  assert.equal(wealthOf("palace", "Vault"), "modest");
});
test("the poor end of town and the wild", () => {
  for (const type of ["tenements", "junkyard", "scrap dealer"]) assert.equal(wealthOf(type, "Apartments"), "poor");
  for (const type of ["cave", "ruin", "wreck"]) assert.equal(wealthOf(type, "Deep chamber"), "squalid");
  assert.equal(wealthOf("hideout", "Boss's den"), "modest");
  assert.equal(wealthOf("hideout", "Common room"), "poor");
});
test("shops, cantinas and unknown places have a sensible default", () => {
  assert.equal(wealthOf("armsmith", "Sales floor"), "comfortable");
  assert.equal(wealthOf("cantina", "Cellar"), "poor");
  assert.equal(wealthOf("cantina", "Main bar"), "modest");
  assert.equal(wealthOf("gambling hall", "High-stakes room"), "rich");
  assert.equal(wealthOf("somewhere new", "Room"), "modest");
});
test("the looks run from worn and cluttered to fine and bare", () => {
  for (let i = 1; i < WEALTH.length; i++) {
    assert.ok(LOOKS[WEALTH[i]].clutter <= LOOKS[WEALTH[i - 1]].clutter, `${WEALTH[i]} is no more cluttered than ${WEALTH[i - 1]}`);
    assert.ok(LOOKS[WEALTH[i]].wear <= LOOKS[WEALTH[i - 1]].wear);
  }
  for (const w of WEALTH) for (const c of [LOOKS[w].wood, LOOKS[w].cloth, LOOKS[w].metal, LOOKS[w].trim, LOOKS[w].light]) assert.match(c, /^#[0-9a-f]{6}$/i);
});
test("shifting stays on the scale", () => {
  assert.equal(shiftWealth("palatial", 3), "palatial");
  assert.equal(shiftWealth("squalid", -2), "squalid");
  assert.equal(shiftWealth("modest", 1), "comfortable");
});
test("the land dyes the cloth of the poor, never the palace's", () => {
  assert.notEqual(lookOf("poor", "desert").cloth, LOOKS.poor.cloth);
  assert.equal(lookOf("palatial", "desert").cloth, LOOKS.palatial.cloth);
  assert.equal(lookOf("poor", "temperate").cloth, LOOKS.poor.cloth);
});

const hslOf = (hex: string, skin = (c: THREE.Color, _f: string) => c, finish = "matte") => skin(new THREE.Color(hex), finish).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
test("a skin turns the browns of the furniture into the room's woods, and leaves lights and shadow alone", () => {
  const poor = skinOf(LOOKS.squalid);
  const rich = skinOf(LOOKS.palatial);
  const [wood, dark] = ["#8b5e3c", "#5f3f28"];
  // The same wood is lighter in a hovel than in a palace's dark joinery, and a darker brown stays darker than a lighter one
  assert.ok(hslOf(wood, poor).l > hslOf(wood, rich).l, "a palace is dark-wooded");
  assert.ok(hslOf(wood, poor).l > hslOf(dark, poor).l, "dark stays darker");
  assert.equal(new THREE.Color("#15191e").getHexString(), skinOf(LOOKS.rich)(new THREE.Color("#15191e"), "sheen").getHexString(), "black is left alone");
  assert.equal(new THREE.Color("#5ad1ff").getHexString(), rich(new THREE.Color("#5ad1ff"), "glow").getHexString(), "lights are left alone");
});
test("steel becomes the metal of the room, and gold its trim", () => {
  const rusty = skinOf(LOOKS.squalid);
  const bright = skinOf(LOOKS.palatial);
  assert.ok(hslOf("#aeb6bd", bright).l > hslOf("#aeb6bd", rusty).l, "palace metal is brighter than a hovel's");
  assert.ok(hslOf("#7b8794", rusty).h < 0.15, "a hovel's metal is rust-coloured");
  assert.ok(hslOf("#7b8794", bright).h > 0.4, "a palace's is bright steel");
  assert.ok(hslOf("#d8b45a", bright).h > 0.1 && hslOf("#d8b45a", bright).h < 0.17, "gold stays gold in a palace");
  assert.ok(hslOf("#d8b45a", rusty).s < hslOf("#d8b45a", bright).s, "and is dull in a hovel");
});
test("soft colours take the room's cloth, whatever they were dyed", () => {
  const skin = skinOf(LOOKS.rich);
  const cloth = hslOf(LOOKS.rich.cloth, (c) => c);
  for (const dye of ["#5b6b8a", "#7a3b3b", "#4f5d8a", "#56624f"]) {
    const out = hslOf(dye, skin);
    assert.ok(Math.abs(out.h - cloth.h) < 0.03, `${dye} became hue ${out.h.toFixed(2)}, the cloth is ${cloth.h.toFixed(2)}`);
  }
});
