// Up the outside of a building (2026-10-21; the user: a balcony is not climbed to as standard, a grappling hook reaches it): a balcony
// or a window above the ground floor is reached from the street only with gear (a hook and its line, friction grips, flight), and
// left for the street the same way or by a repulsor pack's slow fall. The world itself keeps no way up (tests/world/access.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, climbWay, climbGearOf, outsideClimbs, exitsOf, formOf, verticalMove, jumpReach, GRAPPLE_DC, LEAP_DC, type World } from "../../shared/logic/index";
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
  // Down without gear, or past the end of the line: a jump
  assert.deepEqual(climbWay(2, {}, true), { how: "jump", by: "a jump", feet: 20 });
  assert.equal(climbWay(6, { hookFeet: 50 }, true).how, "jump");
});

test("the gear read from the items: the hook's length, a cable's, flight only while running, grips only while worn", () => {
  const items = [row("Grappling hook"), row("Fibercord cable, 50 ft (rolled)"), row("Jetpack"), row("Friction-grip gear"), row("Repulsor pack")];
  assert.deepEqual(climbGearOf(items, [], () => false), { hookFeet: 50, lineFeet: 50, shot: { name: "Grappling hook", range: 30, long: 50, cable: 50 } });
  assert.deepEqual(climbGearOf(items, ["Friction-grip gear"], (n) => n === "Jetpack" || n === "Repulsor pack"), { hookFeet: 50, lineFeet: 50, shot: { name: "Grappling hook", range: 30, long: 50, cable: 50 }, flying: "Jetpack", grips: "Friction-grip gear", descent: "Repulsor pack" });
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
      // Bare-handed, down is a jump: a fall (2026-10-26)
      assert.deepEqual(outsideClimbs(world, balcony.id, {}).map((e) => [e.to, e.scale?.how, e.label]), [[street, "jump", `Jump down (${(balcony.layout?.level ?? 1) * 10} ft.) to`]]);
      assert.equal(outsideClimbs(world, balcony.id, { descent: "Repulsor pack" })[0]?.scale?.how, "descent");
      checked++;
    }
    if (checked >= 3) break;
  }
  assert.ok(checked > 0, "no balcony in the worlds");
});

// Every roof, with or without a ladder, and a leap (2026-10-27; the user: jumping, hooks, jetpacks and climbing outside a fight too, and
// every roof reached by them, not only the roofs with a ladder or stairs)
test("a leap: when the jump's reach is as high as the edge, a Strength (Athletics) check; not above it, not down", () => {
  assert.deepEqual(climbWay(1, { reach: 15 }), { how: "leap", by: "a running leap", dc: LEAP_DC, feet: 10 });
  assert.equal(climbWay(2, { reach: 15 }).how, "none");
  // a hook takes over where the leap falls short; flight and grips come first
  assert.equal(climbWay(2, { reach: 15, hookFeet: 50 }).how, "hook");
  assert.equal(climbWay(1, { reach: 15, flying: "Jetpack" }).how, "fly");
  assert.equal(climbWay(1, { reach: 15 }, true).how, "jump");
  assert.equal(jumpReach(16, true).reach >= 10, true, "a Strength 16 character reaches a one-storey roof");
  assert.equal(jumpReach(8, false).reach >= 10, true, "even a weak standing jump reaches 10 ft. with 1½ times a medium height");
});

test("every roof: no way up bare-handed; a leap, a hook, grips or flight to it, and a way down from it", () => {
  let roofs = 0;
  for (const seed of [34, 9, 10, 11]) {
    const world: World = generateWorld({ seed, partyLevel: 5 }, catalog);
    for (const roof of Object.values(world.areas).filter((a) => formOf(a) === "roof")) {
      const street = roof.parentId!;
      const level = roof.layout?.level ?? 1;
      assert.ok(!outsideClimbs(world, street, {}).some((e) => e.to === roof.id), "bare-handed: no way up");
      const hook = outsideClimbs(world, street, { hookFeet: 50 }).find((e) => e.to === roof.id);
      assert.ok(hook && hook.via === "enter" && hook.scale?.how === "hook", JSON.stringify(hook));
      const jet = outsideClimbs(world, street, { flying: "Jetpack" }).find((e) => e.to === roof.id);
      assert.equal(jet?.scale?.how, "fly");
      const leap = outsideClimbs(world, street, { reach: 15 }).find((e) => e.to === roof.id);
      assert.equal(leap?.scale?.how ?? "none", level <= 1 ? "leap" : "none");
      // down from the roof: a jump (a fall), or the hook's line
      assert.deepEqual(outsideClimbs(world, roof.id, {}).map((e) => [e.to, e.via, e.scale?.how]), [[street, "leave", "jump"]]);
      assert.equal(outsideClimbs(world, roof.id, { hookFeet: 50 })[0]?.scale?.how, "hook");
      roofs++;
    }
  }
  assert.ok(roofs > 5, `only ${roofs} roofs`);
});

test("verticalMove: the ladder to a roof and back, a hook's line, a jump down; nothing for a door or a balcony's patio doors", () => {
  const world: World = generateWorld({ seed: 34, partyLevel: 5 }, catalog);
  const roof = Object.values(world.areas).find((a) => formOf(a) === "roof" && a.gateway)!;
  const street = roof.parentId!;
  const ladder = exitsOf(world, street).find((e) => e.to === roof.id)!;
  assert.deepEqual(verticalMove(world, street, ladder), { area: roof.id, up: true, levels: roof.layout!.level ?? 1, kind: "ladder" });
  const down = exitsOf(world, roof.id).find((e) => e.to === street)!;
  assert.deepEqual(verticalMove(world, roof.id, down), { area: roof.id, up: false, levels: roof.layout!.level ?? 1, kind: "ladder" });
  const line = outsideClimbs(world, street, { hookFeet: 50 }).find((e) => e.to === roof.id)!;
  assert.equal(verticalMove(world, street, line)?.kind, "hook");
  const jump = outsideClimbs(world, roof.id, {})[0];
  assert.deepEqual(verticalMove(world, roof.id, jump), { area: roof.id, up: false, levels: roof.layout!.level ?? 1, kind: "jump" });
  // an ordinary door between two rooms is not a climb
  const room = Object.values(world.areas).find((a) => a.kind === "room" && !formOf(a))!;
  assert.equal(verticalMove(world, room.parentId!, { to: room.id, via: "enter", label: "Enter", travel: "" }), null);
});

test("verticalMove (2026-11-06): into a tree village's hut up its ladder from the forest floor, and down it going out", () => {
  const world: World = generateWorld({ seed: 3, partyLevel: 5 }, catalog);
  const hut = Object.values(world.areas).find((a) => a.kind === "room" && a.gateway && !formOf(a) && !!a.layout?.aloft && (a.layout.level ?? 0) === 0)!;
  assert.ok(hut, "a hut aloft in seed 3");
  const building = hut.parentId!;
  const up = exitsOf(world, building).find((e) => e.to === hut.id)!;
  const move = verticalMove(world, building, up);
  assert.equal(move?.kind, "ladder");
  assert.equal(move?.up, true);
  assert.equal(move?.area, hut.id);
  assert.ok((move?.levels ?? 0) >= 1);
  const down = exitsOf(world, hut.id).find((e) => e.to === building)!;
  assert.deepEqual(verticalMove(world, hut.id, down), { ...move!, up: false });
});
