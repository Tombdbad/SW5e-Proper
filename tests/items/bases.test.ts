// Bases (2026-10-26; shared/logic bases.ts, all house rules): a camp made by setting something down, a cleared hostile site claimed, pieces
// that take squares of their own, storage that holds what it can and keeps it, taking a piece down; and what companions and beasts carry
import test from "node:test";
import assert from "node:assert/strict";
import { pieceTypeOf, setDown, takeDown, store, unstore, claimBase, baseAt, piecesIn, piecesWith, squaresOf, storedPounds, renameBase, claimableSite, carryingCapacity, containerOf, weightOf, type World, type Area } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const facts = (name: string) => (equipment as any[]).find((e) => e.name === name);
const typeOf = (name: string) => pieceTypeOf({ name, lb: containerOf(facts(name) ?? { name })?.lb })!;
const pounds = (name: string) => weightOf(facts(name)?.weight);

// A world with a hideout (a building of a hostile kind) whose room has a holder still standing, and a cantina
function world(): World {
  const area = (id: string, kind: Area["kind"], parentId: string | null, type: string, occupants: Area["occupants"] = []): Area =>
    ({ id, kind, name: id, parentId, type, description: "", tags: [], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants, ships: [], loot: [] }) as Area;
  const thug = { id: "o1", name: "Thug", role: "thug", disposition: "hostile" as const, count: 2, hitPoints: 11 };
  const areas: Record<string, Area> = {
    g: area("g", "galaxy", null, ""),
    s: area("s", "settlement", "g", "town"),
    hide: area("hide", "building", "s", "hideout"),
    den: area("den", "room", "hide", "Common room", [thug]),
    bar: area("bar", "building", "s", "cantina"),
  };
  return { version: 1, seed: 1, name: "t", partyLevel: 1, partySize: 1, antagonist: "", rootId: "g", startId: "s", areas, paths: [], counter: 10 } as World;
}

test("the items that can be set down: a tent and a shelter to sleep in, a chest and a crate to keep things in", () => {
  const tent = typeOf("Tent, two-person");
  assert.deepEqual([tent.role, tent.shelter, tent.w, tent.h, tent.places], ["shelter", true, 2, 2, ["outdoors"]]);
  assert.ok(typeOf("Emergency shelter").places.includes("indoors"), "an emergency shelter goes up anywhere");
  const chest = typeOf("Chest");
  assert.deepEqual([chest.role, chest.lb], ["storage", 300], "the book's 300 lb");
  assert.equal(typeOf("Crate").role, "storage");
  assert.equal(pieceTypeOf({ name: "Blaster pistol" }), undefined);
});

test("setting a piece down makes a camp; pieces keep to their own squares; a camp goes with its last piece", () => {
  let w = world();
  const placed = setDown(w, { buildingId: "bar", type: typeOf("Tent, two-person"), item: "Tent, two-person", areaId: "bar", x: 4, y: 6, place: "outdoors", minute: 100 });
  assert.ok(!placed.error && placed.made);
  w = placed.world;
  const camp = baseAt(w, "bar")!;
  assert.equal(camp.kind, "camp");
  assert.deepEqual(squaresOf(camp.pieces[0]).map((q) => `${q.x},${q.y}`), ["4,6", "5,6", "4,7", "5,7"]);
  // A tent cannot go indoors, and nothing goes on top of the tent
  assert.ok(setDown(w, { buildingId: "bar", type: typeOf("Tent, two-person"), areaId: "bar", x: 0, y: 0, place: "indoors", minute: 101 }).error);
  assert.ok(setDown(w, { buildingId: "bar", type: typeOf("Chest"), item: "Chest", areaId: "bar", x: 5, y: 7, place: "outdoors", minute: 101 }).error);
  const chest = setDown(w, { buildingId: "bar", type: typeOf("Chest"), item: "Chest", areaId: "bar", x: 7, y: 6, place: "outdoors", minute: 101 });
  w = chest.world;
  assert.equal(baseAt(w, "bar")!.pieces.length, 2, "the same camp");
  assert.equal(piecesWith(baseAt(w, "bar"), "shelter").length, 1);
  assert.equal(piecesIn(w, new Set(["bar"])).length, 2);
  // Taken down: the tent comes back; with the chest gone too, the camp is struck
  const down = takeDown(w, placed.made!.id);
  assert.equal(down.made!.item, "Tent, two-person");
  w = takeDown(down.world, chest.made!.id).world;
  assert.equal(baseAt(w, "bar"), undefined);
  // The world handed in is never changed
  assert.equal(world().bases, undefined);
});

test("storage keeps what fits, gives back what does not, and its things come back when it is taken down", () => {
  let w = setDown(world(), { buildingId: "bar", type: typeOf("Chest"), item: "Chest", areaId: "bar", x: 1, y: 1, place: "indoors", minute: 0 }).world;
  const id = baseAt(w, "bar")!.pieces[0].id;
  const heavy = Array.from({ length: 20 }, () => "Anti-materiel rifle"); // 17 lb each
  const put = store(w, id, heavy, pounds);
  assert.equal(put.made!.stored.length, 17, "300 lb hold 17 of them");
  assert.equal(put.made!.left.length, 3);
  w = put.world;
  const piece = baseAt(w, "bar")!.pieces[0];
  assert.equal(storedPounds(piece, pounds), 289);
  assert.ok(store(w, id, ["Anti-materiel rifle"], pounds).error, "full");
  const out = unstore(w, id, ["Anti-materiel rifle", "Nothing such"]);
  assert.deepEqual(out.made!.taken, ["Anti-materiel rifle"]);
  w = out.world;
  const back = takeDown(w, id);
  assert.equal(back.made!.items.length, 16);
  assert.equal(back.made!.item, "Chest");
  // Nothing is kept in a shelter
  const tent = setDown(world(), { buildingId: "bar", type: typeOf("Tent, two-person"), item: "Tent, two-person", areaId: "bar", x: 1, y: 1, place: "outdoors", minute: 0 });
  assert.ok(store(tent.world, tent.made!.id, ["Arrow"], pounds).error);
});

test("a hostile site is claimed once its holders are down, and stays the party's", () => {
  let w = world();
  assert.equal(claimableSite(w, "bar").ok, false, "a cantina is no hostile site");
  const held = claimableSite(w, "hide");
  assert.ok(!held.ok && /2 of its holders/.test(held.why ?? ""), held.why);
  w = { ...w, areas: { ...w.areas, den: { ...w.areas.den, occupants: [] } } };
  assert.ok(claimableSite(w, "hide").ok);
  const claimed = claimBase(w, { areaId: "hide", name: "The hideout", minute: 5 });
  w = claimed.world;
  assert.equal(baseAt(w, "hide")!.kind, "site");
  assert.ok(claimBase(w, { areaId: "hide", name: "Again", minute: 6 }).error);
  // A site keeps standing with nothing in it
  const chest = setDown(w, { buildingId: "hide", type: typeOf("Chest"), item: "Chest", areaId: "den", x: 2, y: 2, place: "indoors", minute: 7 });
  w = takeDown(chest.world, chest.made!.id).world;
  assert.ok(baseAt(w, "hide"));
  assert.equal(renameBase(w, baseAt(w, "hide")!.id, "  Home  ").world.bases![0].name, "Home");
});

test("what a companion or a beast can carry", () => {
  // The mount table's capacity where the book gives one
  assert.equal(carryingCapacity({ name: "Tauntaun", kind: "beast", mount: true, size: "Large" }, [{ name: "Tauntaun", capacity: 480 }]), 480);
  // Else Strength (10 + twice its Strength save) x 15, doubled for each size over Medium, a mount as one size larger
  assert.equal(carryingCapacity({ name: "Hireling", kind: "hireling", size: "Medium", saves: { strength: 2 } }), 210);
  assert.equal(carryingCapacity({ name: "Bantha", kind: "beast", mount: true, size: "Huge", saves: { strength: 5 } }), 20 * 15 * 8);
  assert.equal(carryingCapacity({ name: "Womp rat", kind: "beast", size: "Tiny", saves: { strength: -2 } }), Math.round(6 * 15 * 0.5));
});
