import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { armourWeight, coverageOf, type Item } from "../../client/src/components/Map/interiors/gear";

const items: Item[] = JSON.parse(fs.readFileSync("shared/data/sw5e/equipment.json", "utf8"));
const named = (name: string) => items.find((i) => i.name === name)!;

test("every armour and shield has a model of its own, and its weight is the rules data's own class", () => {
  assert.equal(coverageOf(named("Combat suit")).model, "sw5e-armour/combat-suit");
  assert.equal(coverageOf(named("Composite armor")).model, "sw5e-armour/composite-armor");
  assert.equal(coverageOf(named("Battle armor")).model, "sw5e-armour/battle-armor");
  assert.equal(coverageOf(named("Heavy shield generator")).model, "sw5e-armour/heavy-shield-generator");
  assert.equal(coverageOf(named("Heavy physical shield")).model, "sw5e-armour/heavy-physical-shield");
  assert.equal(coverageOf(named("Combat suit")).bucket, "dedicated");
  assert.equal(armourWeight(named("Battle armor")), "heavy");
  assert.equal(armourWeight(named("Blaster rifle")), undefined);
});
test("weapons, kits, tools and prostheses are covered as they are modelled", () => {
  assert.equal(coverageOf(named("Blaster rifle")).bucket, "shared");
  assert.equal(coverageOf(named("Vibroblade")).model, "kenney-kitbash/vibro-blade");
  assert.deepEqual([coverageOf(named("Lightsaber")).bucket, coverageOf(named("Lightsaber")).model], ["dedicated", "sw5e-sabers/saber-straight"]);
  assert.equal(coverageOf(named("Mechanic's kit")).bucket, "shared");
  assert.equal(coverageOf(named("Tinker's implements")).model, "kenney-kitbash/tool-roll");
  assert.deepEqual([coverageOf(named("Medpac")).bucket, coverageOf(named("Arm prosthesis")).bucket, coverageOf(named("Torso prosthesis")).bucket], ["dedicated", "dedicated", "dedicated"]);
  assert.equal(coverageOf(named("Datapad")).model, "sw5e-hybrids/datapad");
  assert.equal(coverageOf(named("Torso prosthesis")).model, "sw5e-ordnance/torso-prosthesis");
});
test("every model a coverage names exists", () => {
  for (const it of items) {
    const c = coverageOf(it);
    if (c.model) assert.ok(fs.existsSync(`client/public/assets/${c.model}.glb`), `${it.name}: ${c.model}`);
  }
});

import { handOf, wantsOf, suitStyleOf, suitWorn, glovesOf, bootsOf, hasBandolier, type Gear } from "../../client/src/components/Map/interiors/gear";
import { headFit, torsoFit, HEAD_PLACE, TORSO_PLACE } from "../../client/src/components/Map/interiors/anchors";
import { ITEM_MODELS } from "../../client/src/components/Map/interiors/items";
test("a character's weapon sets their pose and their model; a saber has its own", () => {
  assert.equal(handOf(named("Blaster pistol")), "pistol");
  assert.equal(handOf(named("Blaster rifle")), "rifle");
  assert.equal(handOf(named("Vibroaxe")), "axe");
  assert.equal(handOf(named("Lightsaber")), "saber");
  assert.equal(handOf(named("Medpac")), undefined);
  const gear: Gear = { weapons: [named("Blaster rifle")], carried: [] };
  const w = wantsOf("rifle", gear)[0];
  assert.equal(w.slot, "weapon");
  assert.match(w.model, /^kenney-blaster\/blaster-/);
  assert.ok(w.scale > 0.3 && w.scale < 1.2);
  const saber = wantsOf("saber", { weapons: [named("Lightsaber")], carried: [] });
  assert.deepEqual(saber.map((x) => [x.slot, x.model, x.look, x.blade]), [["weapon", "sw5e-sabers/saber-straight", "weapon", undefined]]);
  // A saber whose name wants another blade is a hilt and a blade shape, joined when they are loaded
  const axe = wantsOf("saber", { weapons: [named("Lightaxe")], carried: [] })[0];
  assert.equal(axe.model, "sw5e-sabers/saber-straight");
  assert.deepEqual(axe.blade, { model: "sw5e-blades/blade-axe", name: "blade-axe", scale: 1 });
  assert.equal(wantsOf("saber", { weapons: [named("Great-saber")], carried: [] })[0].blade?.scale, 1.4);
});
test("shields, kits, medicine and prostheses go where they are worn, each place once", () => {
  const gear: Gear = {
    weapons: [named("Vibroblade")], shield: named("Medium physical shield"),
    carried: [named("Mechanic's kit"), named("Medpac"), named("Tinker's implements"), named("Arm prosthesis"), named("Leg prosthesis"), named("Datapad")],
  };
  const wants = wantsOf("vibro", gear);
  const slots = wants.map((w) => w.slot);
  assert.equal(new Set(slots).size, slots.length, `a slot twice: ${slots}`);
  for (const slot of ["weapon", "shield", "armR", "legL", "hipR", "hipL"]) assert.ok(slots.includes(slot as never), slot);
  assert.ok(slots.length <= 7);
  assert.equal(wants.find((w) => w.slot === "armR")!.model, "kenney-kitbash/prosthesis-arm");
  assert.equal(wants.find((w) => w.slot === "shield")!.model, "sw5e-armour/medium-physical-shield");
  for (const w of wants) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});
test("worn gear with a model goes where the model says, on a free place, and the datapad in the hand is not worn", () => {
  const gear: Gear = { weapons: [], carried: [named("Holster"), named("Ammo Pouch"), named("Backpack"), named("Power belt"), named("Wristpad"), named("Datapad")].filter(Boolean) };
  const wants = wantsOf("", gear);
  const bySlot = Object.fromEntries(wants.map((w) => [w.slot, w.model]));
  assert.equal(bySlot.hipR, "sw5e-worn/holster");
  assert.equal(bySlot.hipL, "sw5e-worn/ammo-pouch");
  assert.equal(bySlot.back, "sw5e-worn/backpack");
  assert.equal(bySlot.belt, "sw5e-worn/power-belt");
  assert.ok(!wants.some((w) => w.model.endsWith("datapad")));
  // Two things for one hip: the second takes the other hip, a third has no place
  const crowded = wantsOf("", { weapons: [], carried: [named("Holster"), named("Holster"), named("Holster")] });
  assert.deepEqual(crowded.map((w) => w.slot).sort(), ["hipL", "hipR"]);
  for (const w of wants) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});
test("an NPC holds what their outfit's pose says and carries what their work suggests", () => {
  assert.equal(wantsOf("pistol", undefined)[0].model.startsWith("kenney-blaster/"), true);
  assert.equal(wantsOf("vibro", undefined)[0].model, "kenney-kitbash/vibro-blade");
  assert.deepEqual(wantsOf("", undefined, "medic").map((w) => w.model), ["kenney-kitbash/medpac"]);
  assert.deepEqual(wantsOf("tool", undefined, "mechanic").map((w) => w.slot), ["hipR"]);
  // Force users hold the saber model; the blade's colour is the figure's (models.tsx tints it by its wielder)
  assert.deepEqual(wantsOf("saber", undefined, "patron").map((w) => w.model), ["sw5e-sabers/saber-straight"]);
  assert.deepEqual(wantsOf("saber2", undefined, "inquisitor").map((w) => w.model), ["sw5e-sabers/saber-double"]);
  assert.deepEqual(wantsOf("", undefined, "patron"), []);
});

import { gearOf } from "../../client/src/lib/sw5e/characterCalculation";
test("a character's gear is read from what they wield and wear, by the rules data's class", () => {
  const character = { equipment: ["Vibroblade", "Combat suit", "Medium physical shield", "Medpac", "Arm prosthesis", "Mechanic's kit", "Blaster pistol"], armor: { weapons: ["Vibroblade"], body: "Combat suit", shield: "Medium physical shield" }, abilityScores: {} };
  const gear = gearOf(character);
  assert.deepEqual(gear.weapons.map((w) => w.name), ["Vibroblade"]);
  assert.equal(gear.bodyClass, "light");
  assert.equal(gear.shield?.name, "Medium physical shield");
  assert.deepEqual(gear.carried.map((c) => c.name).sort(), ["Arm prosthesis", "Blaster pistol", "Mechanic's kit", "Medpac"].sort());
  assert.equal(gearOf({ equipment: ["Battle armor"], abilityScores: {} }).bodyClass, "heavy");
  assert.deepEqual(gearOf({ equipment: [] }), { weapons: [], bodyClass: undefined, shield: undefined, carried: [], worn: [] });
  // What is put on, of what is carried
  assert.deepEqual(gearOf({ equipment: ["Respirator", "Backpack"], playState: { wearing: ["Respirator", "Boots"] } }).worn, ["Respirator"]);
});

test("a weapon with a model says where the hand closes on it, and an enhanced weapon takes its base weapon's design", () => {
  const saber = wantsOf("saber", { weapons: [named("Lightsaber")], carried: [] })[0];
  assert.ok(saber.grip && Math.abs(saber.grip[2]) < 0.1, `grip ${saber.grip}`);
  // A Force user with no saber of their own item still holds one in their pose
  assert.equal(wantsOf("saber", { weapons: [], carried: [] })[0].model, "sw5e-sabers/saber-straight");
  assert.deepEqual(wantsOf("", { weapons: [], carried: [] }), []);
  // The index sends "Charric Rifle" to a sniper rifle, "Flashy" to a heavy pistol: the Blaster Kit's designs
  for (const [name, kind] of [["Charric Rifle", "rifle"], ["Flashy", "pistol"], ["Sparkles", "pistol"], ["Hewey", "sword"]] as const) {
    const w = wantsOf("rifle", { weapons: [{ name, equipmentCategory: "Enhanced" }], carried: [] })[0];
    assert.ok(w && /^kenney-/.test(w.model), `${name}: ${w?.model}`);
    void kind;
  }
  // A bo-rifle has its own model
  assert.equal(wantsOf("staff", { weapons: [{ name: "AB-75 Bo-Rifle", equipmentCategory: "Enhanced" }], carried: [] })[0].model, "sw5e-gear/bo-rifle");
});

test("a musician plays an instrument of the catalogue, the same one each time, and a band is not all one instrument", () => {
  const played = new Set<string>();
  for (const name of ["Figrin", "Doikk", "Tech", "Nalan", "Ickabel", "Tedn", "Lirin"]) {
    const w = wantsOf("play", undefined, "musician", name);
    assert.equal(w.length, 1);
    assert.equal(w[0].slot, "weapon");
    assert.ok(w[0].grip, "it has a grip socket");
    assert.deepEqual(w, wantsOf("play", undefined, "musician", name));
    assert.ok(fs.existsSync(`client/public/assets/${w[0].model}.glb`), w[0].model);
    played.add(w[0].model);
  }
  assert.ok(played.size >= 4, `${played.size} instruments among seven musicians`);
  assert.deepEqual(wantsOf("play", { weapons: [], carried: [] }, "musician", "x"), [], "the player is not a musician");
});

const named2 = (n: string) => ({ name: n, equipmentCategory: "Enhanced" });
test("what is put on the head, neck, trunk and fingers: goggles and masks only when worn, one of each place, rings two at most", () => {
  const base: Gear = { weapons: [], carried: [named2("Darkvision Goggles"), named("Respirator"), named2("Ring of Novice Force Storing"), named2("Ring of Adept Force Storing"), named2("Ring of Master Force Storing"), named2("Tracker utility vest"), named2("Taozin Amulet"), named2("Throat prosthesis")] as any };
  const none = wantsOf("", base, "", "x").map((w) => w.name);
  assert.ok(!none.includes("goggles") && !none.includes("respirator"), "not worn, not drawn");
  const on = wantsOf("", { ...base, worn: ["Darkvision Goggles", "Respirator"] }, "", "x");
  const names = on.map((w) => w.name);
  assert.ok(names.includes("goggles") && names.includes("respirator") && names.includes("tracker-utility-vest") && names.includes("amulet") && names.includes("throat-prosthesis"));
  assert.equal(on.filter((w) => w.slot === "finger").length, 2, "two rings on the fingers");
  assert.equal(on.filter((w) => w.slot === "torso").length, 1);
  // Two things for the same place: the first is drawn
  const two = wantsOf("", { weapons: [], carried: [named2("Darkvision Goggles"), named2("Sunshades")] as any, worn: ["Darkvision Goggles", "Sunshades"] }, "", "x").filter((w) => w.slot === "head");
  assert.equal(two.length, 1);
  for (const w of on) assert.ok(fs.existsSync(`client/public/assets/${w.model}.glb`), w.model);
});

test("a suit put on is drawn as a space suit, a diving suit or a hazard suit; gloves, boots and a bandolier carried show on the figure", () => {
  const names: [string, string][] = [["Space suit", "space"], ["Diving suit", "diving"], ["Water suit", "diving"], ["Hazard suit", "hazard"], ["Chemical suit", "hazard"], ["Flame-proof suit", "hazard"], ["Stabilizer suit", "hazard"], ["Dampening suit", "hazard"], ["Conductive suit", "hazard"], ["Mind-shielding suit", "hazard"]];
  for (const [n, style] of names) {
    assert.equal(suitStyleOf(n), style, n);
    assert.ok(ITEM_MODELS[n.toLowerCase().replace(/ /g, "-")], `${n} has a model`);
  }
  assert.equal(suitStyleOf("Combat suit"), undefined);
  assert.equal(suitStyleOf("Respirator"), undefined);
  const gear = (carried: string[], worn?: string[]): Gear => ({ weapons: [], carried: carried.map(named2) as any, worn });
  assert.equal(suitWorn(gear(["Space suit"], ["Space suit"])), "space");
  assert.equal(suitWorn(gear(["Space suit"], [])), undefined, "only what is put on");
  assert.equal(glovesOf(gear(["Shock gloves"])), "shock");
  assert.equal(glovesOf(gear(["Handwraps (Fine)"])), "plain");
  assert.equal(glovesOf(gear(["Backpack"])), undefined);
  assert.equal(bootsOf(gear(["Rocket boots"])), "rocket");
  assert.equal(bootsOf(gear(["Boots of Hiding"])), "plain");
  assert.equal(hasBandolier(gear(["Bandolier"])), true);
  assert.equal(hasBandolier(gear(["Pouch"])), false);
});

test("worn things are fitted to the skull and the build: every head model lands on the head, a mask in front of a snout, an ear piece at its ear", () => {
  const heads = Object.keys(HEAD_PLACE);
  assert.ok(heads.length >= 9);
  for (const model of heads) {
    assert.ok(ITEM_MODELS[model], `${model} is in the catalogue`);
    for (const t of [{ skull: 0.82 }, { skull: 1 }, { skull: 1.25, lift: 0.01 }, { skull: 1.08, snout: true }]) {
      const box = ITEM_MODELS[model].box;
      const fit = headFit(model, box, t)!;
      assert.ok(fit && fit.scale > 0.5 && fit.scale < 3.2, `${model}: scale ${fit?.scale}`);
      // What it covers lies within a head and a little more
      const reach = [(box[3] - box[0]) / 2, (box[4] - box[1]) / 2, (box[5] - box[2]) / 2].map((h) => h * fit.scale);
      assert.ok(Math.abs(fit.at[0]) + reach[0] < 0.26 * t.skull + 0.05, `${model} x`);
      assert.ok(Math.abs(fit.at[1]) + reach[1] < 0.27, `${model} y ${fit.at[1]} + ${reach[1]}`);
      assert.ok(fit.at[2] + reach[2] < 0.34 && fit.at[2] - reach[2] > -0.2, `${model} z ${fit.at[2]} + ${reach[2]}`);
    }
  }
  const [eyes, mouth, plain, snouted] = [headFit("goggles", ITEM_MODELS.goggles.box, { skull: 1 })!, headFit("respirator", ITEM_MODELS.respirator.box, { skull: 1 })!, headFit("respirator", ITEM_MODELS.respirator.box, { skull: 1 })!, headFit("respirator", ITEM_MODELS.respirator.box, { skull: 1, snout: true })!];
  assert.ok(mouth.at[1] < eyes.at[1], "a mask is below the eyes");
  assert.ok(snouted.at[2] > plain.at[2], "a snout carries the mask forward");
  assert.ok(headFit("commlink-hands-free", ITEM_MODELS["commlink-hands-free"].box, { skull: 1 })!.at[0] < 0, "an earpiece on the right ear");
  assert.ok(headFit("ear-prosthesis", ITEM_MODELS["ear-prosthesis"].box, { skull: 1 })!.at[0] > 0, "a prosthesis on the left");
  assert.equal(headFit("backpack", ITEM_MODELS.backpack.box, { skull: 1 }), undefined);
  // The trunk: a vest wide as the body, an amulet hanging in front of the chest, a collar at the throat
  for (const model of Object.keys(TORSO_PLACE)) for (const bulk of [0.7, 1, 1.5]) {
    const fit = torsoFit(model, ITEM_MODELS[model].box, bulk)!;
    assert.ok(fit.at[1] > 0.1 && fit.at[1] < 0.5 && fit.scale >= 1, `${model} at ${fit.at[1]}`);
    if (TORSO_PLACE[model] === "neck") assert.ok(fit.at[2] > 0.05, "in front of the chest");
  }
  const [wide, narrow] = [torsoFit("tracker-utility-vest", ITEM_MODELS["tracker-utility-vest"].box, 1.5)!, torsoFit("tracker-utility-vest", ITEM_MODELS["tracker-utility-vest"].box, 0.7)!];
  assert.ok(wide.scale > narrow.scale, "a bulkier body takes a bigger vest");
});
