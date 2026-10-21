// Data and comms gear (2026-10-21; shared/logic comms.ts, house rules): notes on a datapad or stylus, a recording kept per place, a
// translator's languages against a people that speaks only its own, traced calls, and calls overheard in a search unless scrambled.
import test from "node:test";
import assert from "node:assert/strict";
import { notesAllowed, addNote, addRecording, languageBarrier, setLanguages, translatorSlots, tracedCalls, callOverheard, gearUse, kitAlias, toolFor, toolTrained, harvestKit, FAMILIES } from "../../shared/logic/index";
import equipment from "../../shared/data/sw5e/equipment.json";
import tools from "../../shared/data/sw5e/tools.json";
import species from "../../shared/data/sw5e/species.json";

const row = (name: string) => {
  const r = (equipment as any[]).find((e) => e.name === name);
  assert.ok(r, `no ${name}`);
  return r;
};

test("notes: a datapad or wristpad holds fifty, a stylus pen alone five, nothing without them", () => {
  assert.equal(notesAllowed(["Backpack"]), 0);
  assert.equal(notesAllowed(["Stylus pen"]), 5);
  assert.equal(notesAllowed(["Stylus pen", "Datapad"]), 50);
  assert.equal(notesAllowed(["Wristpad"]), 50);
  assert.match(addNote([], "x", 1, undefined, 0).error!, /datapad/);
  assert.match(addNote([], "   ", 1, undefined, 5).error!, /Nothing/);
  let notes = addNote([], "The vault code is in the cantina", 3, "Cantina", 2).notes;
  notes = addNote(notes, "Second", 3, undefined, 2).notes;
  assert.equal(notes.length, 2);
  assert.match(addNote(notes, "Third", 3, undefined, 2).error!, /Full/);
});

test("a recording is kept for each place once, the newest five", () => {
  let list: any[] = [];
  for (let i = 0; i < 7; i++) list = addRecording(list, { id: `r${i}`, areaId: `a${i % 6}`, where: `Room ${i % 6}`, day: 1, people: [] });
  assert.equal(list.length, 5);
  assert.equal(new Set(list.map((r) => r.areaId)).size, 5);
  assert.equal(list.at(-1).id, "r6");
});

test("languages: a people that speaks only its own is not understood without the language, a translator set to it, or a vocoder", () => {
  assert.equal(languageBarrier("Shyriiwook", ["Galactic Basic"], []), true);
  assert.equal(languageBarrier("Shyriiwook", ["Galactic Basic", "Shyriiwook"], []), false);
  assert.equal(languageBarrier("Shyriiwook", ["Galactic Basic"], ["Shyriiwook"]), false);
  assert.equal(languageBarrier("Twi'leki", ["Galactic Basic"], []), false, "most peoples speak Basic");
  assert.equal(languageBarrier(undefined, [], []), false);
  assert.equal(translatorSlots("Personal translator"), 5);
  assert.equal(translatorSlots("Vocoder mask"), 15);
  assert.equal(translatorSlots("Backpack"), 0);
  assert.equal(setLanguages("Personal translator", ["A", "B", "C", "D", "E", "F", "A"]).length, 5);
  assert.deepEqual(gearUse(row("Personal translator")), { kind: "translate", languages: 5 });
  assert.deepEqual(gearUse(row("Vocoder mask")), { kind: "translate", languages: 15 });
  // The own-tongue-only list names languages the species data really has
  const known = new Set((species as any[]).map((s) => s.language));
  for (const l of ["Shyriiwook", "Jawaese", "Ewokese", "Tusken", "Binary"]) assert.ok(known.has(l), `${l} is a language of the data`);
});

test("a holotrace device finds every call to security, from wherever, soonest first", () => {
  const traced = tracedCalls([{ area: "r1", at: 20, who: "Clerk" }, { area: "r2", at: 12, who: "Barkeep" }, { area: "r3", at: 5, who: "Done" }], (id) => `Room ${id}`, 10);
  assert.deepEqual(traced, [{ who: "Barkeep", area: "r2", where: "Room r2", minutes: 2 }, { who: "Clerk", area: "r1", where: "Room r1", minutes: 10 }]);
  assert.deepEqual(tracedCalls(undefined, () => "", 0), []);
});

test("a call over a commlink in a search is overheard unless a pocket scrambler is carried", () => {
  assert.equal(callOverheard(true, ["Commlink"]), true);
  assert.equal(callOverheard(true, ["Commlink", "Pocket scrambler"]), false);
  assert.equal(callOverheard(false, ["Commlink"]), false);
});

test("a hydrospanner is a mechanic's kit, a mess kit a chef's kit, with that kit's proficiency", () => {
  assert.equal(kitAlias("Hydrospanner"), "Mechanic's kit");
  assert.equal(kitAlias("Mess kit"), "Chef's kit");
  assert.equal(kitAlias("Backpack"), "Backpack");
  assert.equal(toolFor("Hydrospanner", "Utility", tools as any)?.name, "Mechanic's kit");
  assert.equal(toolFor("Mess kit", "Utility", tools as any)?.name, "Chef's kit");
  assert.equal(toolTrained({ toolProficiencies: ["Mechanic's kit"] }, "Hydrospanner"), true);
  assert.equal(toolTrained({ toolProficiencies: [] }, "Hydrospanner"), false);
  assert.deepEqual(gearUse(row("Hydrospanner")), { kind: "tool" });
  assert.deepEqual(gearUse(row("Mess kit")), { kind: "tool" });
});

test("a shovel digs ore and plants of the first two tiers, and nothing else", () => {
  assert.equal(harvestKit("ore", 1, ["Shovel"]), "Shovel");
  assert.equal(harvestKit("plant", 0, ["Shovel"]), "Shovel");
  assert.equal(harvestKit("ore", 2, ["Shovel"]), undefined);
  assert.equal(harvestKit("crystal", 0, ["Shovel"]), undefined);
  assert.equal(harvestKit("ore", 3, ["Shovel", "Scavenging kit"]), "Scavenging kit");
  assert.equal(harvestKit("salvage", 2, ["Hydrospanner"]), "Hydrospanner", "a hydrospanner is a mechanic's kit, which works salvage");
  assert.ok(FAMILIES.ore.kitNames.includes("shovel"));
});
