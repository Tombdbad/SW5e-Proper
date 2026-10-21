// Hazards of a place and what answers them (2026-10-21; index.ts `hazardsAt`, gear.ts `exposure`)
import test from "node:test";
import assert from "node:assert/strict";
import { hazardsAt, exposure, suitOf, type World, type Protections } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";

const area = (id: string, kind: string, type: string, parentId?: string, extra: Record<string, unknown> = {}) => ({ id, kind, type, name: id, parentId, tags: [], occupants: [], ships: [], loot: [], position: { x: 0, y: 0 }, danger: 0, ...extra });
const worldOf = (land: string, settlementType = "city", buildingType = "cantina", roomName = "Main bar") => ({
  areas: {
    p: area("p", "planet", land), s: area("s", "settlement", settlementType, "p"), b: area("b", "building", buildingType, "s"), r: area("r", "room", "room", "b", { name: roomName }),
  },
  paths: [],
} as unknown as World);
const kinds = (w: World, id: string, minute = 12 * 60) => hazardsAt(w, id, minute).map((h) => h.hazard).sort();
const none: Protections = { wearing: [], carried: [], resist: [], darkvision: false, light: false, generators: [], water: false, air: 0 };
const item = (name: string) => (equipment as any[]).find((e) => e.name === name);

test("each land brings its hazards, out of doors", () => {
  assert.deepEqual(kinds(worldOf("ice"), "s"), ["cold"]);
  assert.deepEqual(kinds(worldOf("ice"), "r"), [], "indoors is warm");
  assert.deepEqual(kinds(worldOf("desert"), "s", 12 * 60), ["heat"]);
  assert.deepEqual(kinds(worldOf("desert"), "s", 22 * 60), [], "a desert night is not hot");
  assert.deepEqual(kinds(worldOf("barren", "crash site", "wreck", "Hull breach"), "s"), ["vacuum"]);
  assert.deepEqual(kinds(worldOf("urban", "sewer system", "sewer", "Main channel"), "r"), ["dark", "toxic"]);
  assert.deepEqual(kinds(worldOf("volcanic", "cave system", "cave", "Winding tunnel"), "r"), ["dark", "toxic"]);
  assert.deepEqual(kinds(worldOf("temperate", "city", "engineering", "Reactor room"), "r"), ["radiation"]);
  assert.deepEqual(kinds(worldOf("ocean", "crash site", "wreck", "Cargo hold"), "r"), ["dark", "underwater"].filter((k) => k !== "dark"));
  assert.deepEqual(kinds(worldOf("temperate", "raider camp", "camp", "Perimeter"), "s", 23 * 60), ["dark"]);
});

test("what answers each hazard", () => {
  const space = suitOf(item("Space suit"))!;
  const suits = { "Space suit": space.protects, "Hazard suit": suitOf(item("Hazard suit"))!.protects, "Water suit": suitOf(item("Water suit"))!.protects };
  assert.equal(exposure("vacuum", none).deadly, true);
  assert.deepEqual(exposure("vacuum", { ...none, wearing: ["Space suit"], suits, air: 480 }), { hazard: "vacuum", safe: true, by: "Space suit", breathing: true });
  assert.equal(exposure("vacuum", { ...none, wearing: ["Space suit"], suits, air: 0 }).deadly, true, "out of air");
  assert.equal(exposure("toxic", { ...none, wearing: ["Hazard suit"], suits }).safe, true);
  assert.equal(exposure("toxic", { ...none, wearing: ["Respirator"], air: 60 }).breathing, true);
  assert.equal(exposure("underwater", { ...none, wearing: ["Water suit"], suits }).safe, true);
  assert.equal(exposure("underwater", none).deadly, true);
  assert.equal(exposure("cold", { ...none, generators: ["cold"] }).by, "a heat generator");
  assert.equal(exposure("heat", { ...none, water: true }).by, "water to hand");
  assert.equal(exposure("dark", { ...none, light: true }).safe, true);
  assert.equal(exposure("dark", { ...none, darkvision: true }).by, "darkvision");
  assert.equal(exposure("gravity", none).safe, false);
});
