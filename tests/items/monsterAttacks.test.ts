// Stat blocks whose attacks were written a little off the book's form ("Hit 3" with no colon, "hit" in lower case, "Attack +9" with no
// colon, an attack header after its text, whole attacks written inside the Multiattack entry): the audit (2026-11-08, T-017) found five
// that the fight read as having no attack, so they stood and did nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { statProfile } from "../../shared/logic/index";
import monsters from "../../shared/data/sw5e/monsters.json";

const named = (name: string) => {
  const m = (monsters as any[]).find((x) => x.name === name);
  assert.ok(m, `${name} is in the data`);
  return statProfile(m);
};

test("the five stat blocks with oddly written attacks each have an attack the fight can use", () => {
  for (const name of ["Gundark, Alpha", "IG-227 Hailfire-Class Droid", "Jawa Scrapper", "Jawa Shaman", "Voxyn"]) {
    assert.ok(named(name).attacks.length > 0, `${name} has no attack`);
  }
});

test("their attacks carry the numbers the text gives", () => {
  const scrapper = named("Jawa Scrapper").attacks.find((a) => a.name === "Ion Blaster")!;
  assert.deepEqual([scrapper.bonus, scrapper.damage, scrapper.ranged], [4, "1d4 + 2", true]);
  const alpha = named("Gundark, Alpha").attacks.find((a) => a.name === "Bite")!;
  assert.deepEqual([alpha.bonus, alpha.damage], [9, "1d8 + 5"]);
  const laser = named("IG-227 Hailfire-Class Droid").attacks.find((a) => a.name === "Medium Laser Cannon")!;
  assert.deepEqual([laser.bonus, laser.damage], [9, "3d10 + 4"]);
  const staff = named("Jawa Shaman").attacks.find((a) => a.name === "Vibrostaff")!;
  assert.deepEqual([staff.bonus, staff.damage], [2, "2d4"]);
});

test("the Voxyn's bite and tail, written inside its Multiattack entry, are read, with the acid riding on the bite", () => {
  const p = named("Voxyn");
  const bite = p.attacks.find((a) => a.name === "Bite")!;
  const tail = p.attacks.find((a) => a.name === "Tail")!;
  assert.deepEqual([bite.bonus, bite.damage, bite.extra?.type], [9, "3d8 + 5", "acid"]);
  assert.deepEqual([tail.bonus, tail.damage, tail.extra?.type], [9, "4d6 + 5", "poison"]);
  // (its "two bite attacks and one tail attack" comes out as one of each: the multiattack reader takes the first count it finds, a limit it already had)
  assert.ok((p.multiattack ?? []).includes("Bite") && (p.multiattack ?? []).includes("Tail"));
});
