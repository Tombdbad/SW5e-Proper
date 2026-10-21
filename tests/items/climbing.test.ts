// Up the outside of a building (2026-10-21; the user: a balcony is not climbed to as standard, a grappling hook reaches it): a balcony
// or a window above the ground floor is reached from the street only with gear (a hook and its line, friction grips, flight), and
// left for the street the same way or by a repulsor pack's slow fall. The world itself keeps no way up (tests/world/access.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, climbWay, climbGearOf, outsideClimbs, exitsOf, formOf, GRAPPLE_DC, type World } from "../../shared/logic/index";
import { getWorldCatalog } from "../../server/sw5eData";
import equipment from "../../shared/data/sw5e/equipment.json";

const catalog = await getWorldCatalog();
const row = (name: string) => {
  const r = (equipment as any[]).find((e) => e.name === name);
  assert.ok(r, `no ${name}`);
  return { name: r.name, description: r.description, equipmentCategory: r.equipmentCategory };
};

test("the way up: none bare-handed; a hook's line within reach (a check); grips and flight without one; down by a slow fall", () => {
  assert.equal(climbWay(1, {}).how, "none");
  assert.deepEqual(climbWay(1, { hookFeet: 50 }), { how: "hook", by: "Grappling hook", dc: GRAPPLE_DC });
  // Fifty feet of line reach five floors up; a cable carried more
  assert.equal(climbWay(5, { hookFeet: 50 }).how, "hook");
  assert.equal(climbWay(6, { hookFeet: 50 }).how, "none");
  assert.equal(climbWay(6, { hookFeet: 50, lineFeet: 50 }).how, "hook");
  assert.deepEqual(climbWay(3, { grips: "Friction-grip gear" }), { how: "grips", by: "Friction-grip gear" });
  assert.deepEqual(climbWay(3, { flying: "Jetpack", hookFeet: 50 }), { how: "fly", by: "Jetpack" });
  assert.equal(climbWay(2, { descent: "Repulsor pack" }).how, "none");
  assert.equal(climbWay(2, { descent: "Repulsor pack" }, true).how, "descent");
});

test("the gear read from the items: the hook's length, a cable's, flight only while running, grips only while worn", () => {
  const items = [row("Grappling hook"), row("Fibercord cable, 50 ft (rolled)"), row("Jetpack"), row("Friction-grip gear"), row("Repulsor pack")];
  assert.deepEqual(climbGearOf(items, [], () => false), { hookFeet: 50, lineFeet: 50 });
  assert.deepEqual(climbGearOf(items, ["Friction-grip gear"], (n) => n === "Jetpack" || n === "Repulsor pack"), { hookFeet: 50, lineFeet: 50, flying: "Jetpack", grips: "Friction-grip gear", descent: "Repulsor pack" });
});

test("a balcony: no way up from the street without gear; with a hook a climb up and from it a climb down", () => {
  let checked = 0;
  for (const seed of [34, 9, 10, 11, 12, 3, 4, 5, 6, 7, 8]) {
    const world: World = generateWorld({ seed, partyLevel: 5 }, catalog);
    for (const balcony of Object.values(world.areas).filter((a) => formOf(a) === "balcony")) {
      const street = balcony.parentId!;
      assert.ok(!exitsOf(world, street).some((e) => e.to === balcony.id), "the world has no way up");
      assert.ok(!outsideClimbs(world, street, {}).some((e) => e.to === balcony.id), "bare-handed: no way up");
      const up = outsideClimbs(world, street, { hookFeet: 50 }).find((e) => e.to === balcony.id);
      assert.ok(up && up.via === "enter" && up.scale?.how === "hook" && up.scale.dc === GRAPPLE_DC && up.secret, JSON.stringify(up));
      const down = outsideClimbs(world, balcony.id, { hookFeet: 50 });
      assert.deepEqual(down.map((e) => [e.to, e.via, e.scale?.how]), [[street, "leave", "hook"]]);
      assert.deepEqual(outsideClimbs(world, balcony.id, {}), []);
      assert.equal(outsideClimbs(world, balcony.id, { descent: "Repulsor pack" })[0]?.scale?.how, "descent");
      checked++;
    }
    if (checked >= 3) break;
  }
  assert.ok(checked > 0, "no balcony in the worlds");
});
