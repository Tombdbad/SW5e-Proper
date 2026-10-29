// Ammunition on the fallen (2026-10-29): NPCs leave spare rounds for the ranged weapons they carried, beside the weapons
import test from "node:test";
import assert from "node:assert/strict";
import { afterFight, unitOf, type Occupant } from "../../shared/logic/index";
import { ammoDrops, PLAIN_ROUND } from "../../shared/logic/gear";

const pistol = { name: "Blaster pistol", properties: ["Power cell (range 50/200)", "reload 16"] };
const bow = { name: "Longbow", properties: ["Ammunition (range 150/600)", "two-handed"] };
const vibro = { name: "Vibroblade", properties: ["finesse"] };
const trooper = (extra: Partial<Occupant> = {}): Occupant => ({ id: "t1", name: "Trooper", role: "soldier", disposition: "hostile", count: 3, hitPoints: 10, loadout: ["Blaster pistol", "Vibroblade"], ...extra });
const lookup = (n: string) => [pistol, bow, vibro].find((w) => w.name === n);

test("a ranged weapon leaves cells or cartridges, a melee weapon nothing, and the same creature always leaves the same", () => {
  const a = ammoDrops([pistol, vibro], unitOf, "x-0");
  assert.equal(a.length, 1);
  assert.equal(a[0].name, PLAIN_ROUND.cell);
  assert.ok(a[0].quantity >= 1 && a[0].quantity <= 2);
  assert.deepEqual(ammoDrops([pistol, vibro], unitOf, "x-0"), a);
  assert.deepEqual(ammoDrops([vibro], unitOf, "x-0"), []);
});

test("a bow leaves arrows, three to eight of them", () => {
  const a = ammoDrops([bow], unitOf, "y-0");
  assert.equal(a[0].name, "Arrow");
  assert.ok(a[0].quantity >= 3 && a[0].quantity <= 8);
});

test("after a fight each fallen creature leaves its weapons and spare power cells; survivors leave nothing; no lookup, no ammunition", () => {
  const area = { occupants: [trooper()] };
  const fell = [{ id: "t1-0", hp: 0 }, { id: "t1-1", hp: 0 }, { id: "t1-2", hp: 4 }];
  const { gear } = afterFight(area, fell, lookup);
  const cells = gear.filter((g) => g.name === PLAIN_ROUND.cell).reduce((s, g) => s + g.quantity, 0);
  assert.ok(cells >= 2 && cells <= 4, `two fell, so 2-4 cells, got ${cells}`);
  assert.equal(gear.find((g) => g.name === "Blaster pistol")?.quantity, 2);
  assert.equal(afterFight(area, fell).gear.some((g) => g.name === PLAIN_ROUND.cell), false);
});

test("a droid is powered down, not looted for ammunition", () => {
  const droid = trooper({ creature: "droid", species: "Droid" });
  const { gear } = afterFight({ occupants: [droid] }, [{ id: "t1-0", hp: 0 }, { id: "t1-1", hp: 0 }, { id: "t1-2", hp: 0 }], lookup);
  assert.equal(gear.some((g) => g.name === PLAIN_ROUND.cell), false);
});
