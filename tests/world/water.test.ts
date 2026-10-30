import test from "node:test";
import assert from "node:assert/strict";
import { deckSquares, generateWorld, planBuilding, swimPace, waterOf, childrenOf, type Area } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// Water worlds and caves under the ground (2026-10-30; shared/logic "Water worlds", levelsOf, linkLevels)
const catalog = await getWorldCatalog();

test("the decking of a place on the sea joins every building's gantry and the ways out, and leaves open water", () => {
  const boxes = { a: { x: 0, y: 0, width: 7, height: 7 }, b: { x: 20, y: 3, width: 6, height: 6 }, c: { x: 4, y: 18, width: 8, height: 8 }, d: { x: 30, y: 25, width: 5, height: 5 } };
  const deck = deckSquares({ boxes }, [{ x: 40, y: 12 }]);
  // every gantry square round each box
  for (const b of Object.values(boxes)) for (let y = b.y - 2; y < b.y + b.height + 2; y++) for (let x = b.x - 2; x < b.x + b.width + 2; x++) assert.ok(deck.has(`${x},${y}`), `${x},${y} round a building`);
  // one piece, reached from the way out
  const seen = new Set(["40,12"]);
  const stack = [[40, 12]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (deck.has(`${nx},${ny}`) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
  }
  assert.equal(seen.size, deck.size, "all the decking is joined");
  // and most of the ground is water
  assert.ok(deck.size < 45 * 35 * 0.6, `${deck.size} squares of decking`);
});

test("a swimmer goes at half pace, or at its own swimming speed", () => {
  assert.equal(swimPace("30 ft."), 0.5);
  assert.equal(swimPace("30 ft., swim 30 ft."), 1);
  assert.equal(swimPace("walk 30 ft., swim 20 ft."), 20 / 30);
});

test("an ocean world's places stand on the sea or under it; a cave goes down under the ground", () => {
  let sea = 0;
  let under = 0;
  let caves = 0;
  for (const seed of [1, 2, 34]) {
    const world = generateWorld({ seed, partyLevel: 5, detail: "all" as const }, catalog);
    for (const s of Object.values(world.areas).filter((a): a is Area => a.kind === "settlement")) {
      const planet = world.areas[s.parentId ?? ""];
      const w = waterOf(world, s.id);
      if (planet?.type !== "ocean" || !["city", "town", "outpost"].includes(s.type)) assert.equal(w, null, `${s.name} is not on the water`);
      else if (w === "sea") sea++;
      else under++;
      if (s.gateway && planet?.type === "ocean" && ["city", "town", "outpost"].includes(s.type)) assert.equal(w, "sea", "a world's way in is on the sea");
    }
    for (const b of Object.values(world.areas).filter((a) => a.kind === "building" && a.type === "cave")) {
      planBuilding(world, b.id);
      const rooms = childrenOf(world, b.id).filter((a) => a.kind === "room" && a.layout);
      if (!rooms.length) continue;
      caves++;
      for (const r of rooms) {
        const l = r.layout!;
        if (r.gateway) assert.equal(l.level ?? 0, 0, `${b.name}: the mouth is on the surface`);
        else if (!l.form) assert.ok((l.level ?? 0) < 0, `${b.name} / ${r.name}: under the ground`);
        // (between floors, a long sloping passage, not a stair)
        if (l.form === "stairs") {
          assert.match(r.name, /^Sloping passage/);
          assert.ok(l.height >= 11 || l.width >= 11, `${r.name}: ${l.width} by ${l.height}`);
        }
      }
    }
  }
  assert.ok(caves > 0, "some caves were planned");
  console.log(`places on the sea ${sea}, under it ${under}, caves ${caves}`);
});
