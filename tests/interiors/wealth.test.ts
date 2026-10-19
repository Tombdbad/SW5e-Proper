import test from "node:test";
import assert from "node:assert/strict";
import { wealthOf, shiftWealth, lookOf, LOOKS, WEALTH } from "../../client/src/components/Map/interiors/wealth";

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
