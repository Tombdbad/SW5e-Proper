import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, planBuilding, childrenOf, formOf, trailOf, canopyOf, CANOPY_ALOFT, livenWorld, LIFE, auditBuildings, type Area, type World } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";
import { standing, radiiOf } from "../../shared/logic/footprint";

// Round and oval rooms (shared/logic/footprint.ts) are planned into some new worlds: nothing may be
// placed on a square outside the curve, and every way in must stand
const catalog = await getWorldCatalog();
const worlds: World[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => generateWorld({ seed, partyLevel: 5 }, catalog));
const shaped = worlds.flatMap((w) => Object.values(w.areas).filter((a): a is Area => a.kind === "room" && !!a.layout?.shape));

test("some new rooms are round or oval", () => {
  assert.ok(shaped.length > 0, "no shaped room in six worlds");
});

test("nothing stands outside a round or oval room's curve, and every way in stands", () => {
  for (const room of shaped) {
    const l = room.layout!;
    const grid = standing(l.width, l.height, radiiOf(l.shape!, l.width, l.height));
    for (const a of l.assets) {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) {
        if (a.blocks || a.kind === "door" || a.kind === "exit" || a.kind === "secret") {
          assert.ok(grid[x]?.[y], `${room.name}: ${a.kind} "${a.name}" on a cut square ${x},${y}`);
        }
      }
    }
  }
});

test("a round room is joined to its neighbours only through corridors", () => {
  for (const world of worlds) for (const room of Object.values(world.areas)) {
    // (only a room that is drawn round: one tagged round but planned square may be joined directly)
    if (room.kind !== "room" || !room.tags.includes("round") || !room.layout?.shape) continue;
    for (const p of world.paths) {
      const other = p.from === room.id ? world.areas[p.to] : p.to === room.id ? world.areas[p.from] : undefined;
      // (a stairway, lift, pit or the like may be joined directly: those are ways, not rooms set against the curve)
      if (!other || other.kind !== "room" || other.parentId !== room.parentId || other.tags.some((t) => t.startsWith("form:"))) continue;
      assert.fail(`${room.name} joined directly to ${other.name}`);
    }
  }
});

// The overhaul (2026-11-06, the user: round buildings "to REPLACE the VAST majority of old square buildings (square buildings should be RARE)", and
// the tree villages to "REPLACE the standard square rooms on relevant planets"; asked: square stays for hangars and warehouses, slums and shanties;
// trees on forest and jungle worlds, stilts in a swamp; saved games re-planned)
const buildingsOf = (w: World) => Object.values(w.areas).filter((a) => a.kind === "building");
const planEvery = (w: World) => { for (const b of buildingsOf(w)) if (!childrenOf(w, b.id).some((a) => a.layout)) planBuilding(w, b.id); };

test("round is the rule: most rooms of the round kinds come out round, and the warehouses, hangars, tenements and junkyards keep their squares", () => {
  const w = worlds[0];
  planEvery(w);
  let tagged = 0, round = 0;
  for (const b of buildingsOf(w)) for (const room of childrenOf(w, b.id)) {
    if (room.kind !== "room" || !room.layout || formOf(room)) continue;
    if (/^(warehouse|cargo hangar|public hangar|private hangar|royal hangar|shipyard|refuelling depot|tenements|junkyard)$/.test(b.type)) assert.ok(!room.tags.includes("round"), `${b.type}: ${room.name} is square`);
    if (!room.tags.includes("round")) continue;
    tagged++;
    if (room.layout.shape) round++;
  }
  assert.ok(tagged > 40 && round / tagged > 0.7, `${round} of ${tagged} round`);
});

test("a settlement on a forest or jungle world stands in the trees, one in a swamp on stilts, and elsewhere on the ground", () => {
  let trees = 0, stilts = 0, ground = 0;
  for (const w of worlds.slice(0, 4)) {
    for (const b of buildingsOf(w)) {
      const biome = trailOf(w, b.id).find((a) => a.kind === "planet")?.type;
      const kind = canopyOf(w, b.id);
      if (!kind && b.type !== "cantina") continue;
      if (!childrenOf(w, b.id).some((a) => a.layout)) planBuilding(w, b.id);
      const rooms = childrenOf(w, b.id).filter((a) => a.kind === "room" && a.layout && (a.layout.level ?? 0) >= 0);
      if (!kind) { assert.ok(rooms.every((a) => !a.layout!.aloft), `${b.type} on ${biome} on the ground`); ground++; continue; }
      assert.equal(kind, biome === "swamp" ? "stilts" : "tree", `${b.type} on ${biome}`);
      assert.ok(rooms.every((a) => a.layout!.aloft === CANOPY_ALOFT[kind]), `${b.type}: every room aloft`);
      if (kind === "tree") trees++; else stilts++;
    }
  }
  assert.ok(trees > 0 && ground > 0, `${trees} in trees, ${stilts} on stilts, ${ground} on the ground`);
  assert.equal(canopyOf(worlds[0], buildingsOf(worlds[0]).find((b) => b.type === "warehouse")?.id ?? ""), undefined, "a warehouse is never up a tree");
});

test("a saved world is re-planned once: its planned buildings come out round, aloft where they should be, and their people stay", () => {
  const w = generateWorld({ seed: 5, partyLevel: 5 }, catalog);
  const b = buildingsOf(w).find((x) => x.type === "cantina" || x.type === "general store")!;
  planBuilding(w, b.id);
  const people = childrenOf(w, b.id).flatMap((a) => a.occupants.map((o) => o.id)).sort();
  // (as a world of before: its rooms square, the building marked done)
  for (const room of childrenOf(w, b.id)) if (room.layout) { delete room.layout.shape; delete room.layout.aloft; room.tags = room.tags.filter((t) => t !== "round"); }
  w.life = 18;
  const next = livenWorld(w, catalog);
  assert.equal(next.life, LIFE);
  const rooms = childrenOf(next, b.id).filter((a) => a.kind === "room" && a.layout);
  assert.ok(rooms.some((a) => a.layout!.shape), "round rooms after");
  const after = new Set(childrenOf(next, b.id).flatMap((a) => a.occupants.map((o) => o.id)));
  assert.ok(people.every((id) => after.has(id)), "everyone who was in it is still in it");
  if (canopyOf(next, b.id)) assert.ok(rooms.every((a) => (a.layout!.level ?? 0) < 0 || a.layout!.aloft), "aloft");
  assert.deepEqual(auditBuildings(next).filter((p) => p.includes(b.id)), []);
});

test("a round room's wall pieces stand round its curve, and a round shop has aisles of its shelves down the middle", () => {
  const w = worlds[0];
  planEvery(w);
  let rim = 0, wallPieces = 0, aisleShops = 0, shops = 0;
  for (const room of Object.values(w.areas)) {
    const l = room.layout;
    if (room.kind !== "room" || !l?.shape) continue;
    const grid = standing(l.width, l.height, radiiOf(l.shape, l.width, l.height));
    const edge = (x: number, y: number) => !grid[x]?.[y];
    const touches = (a: { x: number; y: number; w: number; h: number }) => {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (edge(x - 1, y) || edge(x + 1, y) || edge(x, y - 1) || edge(x, y + 1)) return true;
      return false;
    };
    for (const a of l.assets.filter((x) => x.kind === "furniture" && /shelf|rack|cabinet|booth|bookcase|locker|bunk/i.test(x.name))) { wallPieces++; if (touches(a)) rim++; }
    if (/sales floor/i.test(room.name)) {
      const shelves = l.assets.filter((a) => a.kind === "furniture" && /shelf|rack|cabinet/i.test(a.name));
      if (!shelves.length) continue;
      shops++;
      if (shelves.some((a) => !touches(a)) && shelves.some(touches)) aisleShops++;
    }
  }
  assert.ok(wallPieces > 20 && rim / wallPieces > 0.6, `${rim} of ${wallPieces} wall pieces on the curve`);
  assert.ok(shops > 0 && aisleShops / shops > 0.5, `${aisleShops} of ${shops} round shops with aisles`);
});
