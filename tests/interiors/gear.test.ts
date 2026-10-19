import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { armourWeight, coverageOf, type Item } from "../../client/src/components/Map/interiors/gear";

const items: Item[] = JSON.parse(fs.readFileSync("shared/data/sw5e/equipment.json", "utf8"));
const named = (name: string) => items.find((i) => i.name === name)!;

test("armour is covered by the rules data's own class, shields by what they are", () => {
  assert.equal(coverageOf(named("Combat suit")).model, "kenney-kitbash/armour-light");
  assert.equal(coverageOf(named("Composite armor")).model, "kenney-kitbash/armour-medium");
  assert.equal(coverageOf(named("Battle armor")).model, "kenney-kitbash/armour-heavy");
  assert.equal(coverageOf(named("Heavy shield generator")).model, "kenney-kitbash/shield-generator");
  assert.equal(coverageOf(named("Heavy physical shield")).model, "kenney-kitbash/shield-physical");
  assert.equal(armourWeight(named("Battle armor")), "heavy");
  assert.equal(armourWeight(named("Blaster rifle")), undefined);
});
test("weapons, kits, tools and prostheses are covered as they are modelled", () => {
  assert.equal(coverageOf(named("Blaster rifle")).bucket, "shared");
  assert.equal(coverageOf(named("Vibroblade")).model, "kenney-kitbash/vibro-blade");
  assert.equal(coverageOf(named("Lightsaber")).bucket, "code");
  assert.equal(coverageOf(named("Mechanic's kit")).bucket, "shared");
  assert.equal(coverageOf(named("Tinker's implements")).model, "kenney-kitbash/tool-roll");
  assert.deepEqual([coverageOf(named("Medpac")).bucket, coverageOf(named("Arm prosthesis")).bucket, coverageOf(named("Torso prosthesis")).bucket], ["dedicated", "dedicated", "none"]);
  assert.equal(coverageOf(named("Datapad")).bucket, "none");
});
test("every model a coverage names exists", () => {
  for (const it of items) {
    const c = coverageOf(it);
    if (c.model) assert.ok(fs.existsSync(`client/public/assets/${c.model}.glb`), `${it.name}: ${c.model}`);
  }
});
