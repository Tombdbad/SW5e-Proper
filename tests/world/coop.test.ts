// Co-op (2026-10-29): patches between versions of the campaign, and the rules of the travel room
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyChanges, applyOps, changesBetween, crewIssues, defaultSeat, diffJson, isGroupExit, makeCode, unitsOf, withoutMember,
  type Craft, type TravelRoom,
} from "../../shared/logic/coop";

const world = () => ({
  areas: {
    a: { id: "a", name: "Cantina", occupants: [{ id: "o1", hp: 10 }, { id: "o2", hp: 7 }], loot: [{ id: "l1", looted: false }] },
    b: { id: "b", name: "Hangar", occupants: [], loot: [] },
  },
  paths: [{ id: "p1", locked: 12 }],
});

test("a patch carries only what changed, and applying it gives the new version without touching the rest", () => {
  const base = world();
  const next = world();
  next.areas.a.occupants[1].hp = 0;
  next.areas.b.loot.push({ id: "l2", looted: false } as never);
  delete (next.paths[0] as any).locked;
  const ops = diffJson(base, next);
  assert.equal(ops.length, 3);
  const out = applyOps(base, ops);
  assert.deepEqual(out, next);
  // what did not change is the same object (the page does not redraw it)
  assert.equal(out.areas.a.occupants[0], base.areas.a.occupants[0]);
  assert.equal(out.areas.a.loot, base.areas.a.loot);
  // and the base itself was not changed
  assert.deepEqual(base, world());
});

test("two players' patches made from the same version both land when they touch different things", () => {
  const base = world();
  const one = world();
  one.areas.a.loot[0].looted = true;
  const two = world();
  two.areas.b.name = "Dock 7";
  const a = changesBetween({ galaxyMap: base }, { galaxyMap: one });
  const b = changesBetween({ galaxyMap: base }, { galaxyMap: two });
  const merged = applyChanges(applyChanges({ galaxyMap: base }, a), b);
  assert.equal(merged.galaxyMap.areas.a.loot[0].looted, true);
  assert.equal(merged.galaxyMap.areas.b.name, "Dock 7");
});

test("an operation on something another player removed is skipped, not a crash", () => {
  const base = world();
  const gone: any = world();
  delete gone.areas.b;
  const ops = diffJson(base, { ...base, areas: { ...base.areas, b: { ...base.areas.b, name: "X" } } });
  const out = applyOps(gone, ops);
  assert.deepEqual(out, gone);
});

test("the place of a member is not a campaign change, and the clock never runs back", () => {
  const changes = changesBetween({ currentLocation: "a", timeElapsed: { total: 100 } }, { currentLocation: "b", timeElapsed: { total: 160 } });
  assert.deepEqual(Object.keys(changes), ["timeElapsed"]);
  const later = applyChanges({ timeElapsed: { total: 500, days: 0 } }, changes);
  assert.equal(later.timeElapsed.total, 500);
  const earlier = applyChanges({ timeElapsed: { total: 50 } }, changes);
  assert.equal(earlier.timeElapsed.total, 160);
});

test("a whole field can be replaced (a save over the campaign page)", () => {
  const out = applyChanges({ quests: [1, 2, 3], name: "x" }, { quests: [{ p: [], v: [9] }] });
  assert.deepEqual(out, { quests: [9], name: "x" });
});

test("codes are four letters and never repeat one in use", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const code = makeCode(Math.random, (c) => seen.has(c));
    assert.match(code, /^[A-Z]{4}$/);
    assert.ok(!/[IO]/.test(code));
    seen.add(code);
  }
});

test("only a way off the settlement is a group move; a street, a door and a stair are each member's own", () => {
  assert.equal(isGroupExit({ needsShip: true, travel: "" }), true);
  assert.equal(isGroupExit({ travel: "12 km" }), true);
  assert.equal(isGroupExit({ travel: "0.4 km" }), true);
  assert.equal(isGroupExit({ travel: "80 m" }), false);
  assert.equal(isGroupExit({ travel: "" }), false);
});

const crafts: Craft[] = [
  { id: "v-sedan", kind: "vehicle", label: "V-35 Courier", seats: 4, rideId: "vehicle-v1" },
  { id: "v-bike", kind: "vehicle", label: "Speeder bike", seats: 2, rideId: "vehicle-v2" },
  { id: "foot", kind: "solo", label: "On foot", seats: 99, rideId: "foot" },
  { id: "s-1", kind: "ship", label: "Ebon Hawk", seats: 6, shipId: "s1" },
  { id: "v-wreck", kind: "vehicle", label: "Wreck", seats: 2, blocked: "wrecked" },
];
const room = (seats: TravelRoom["seats"], joined = Object.keys(seats)): Pick<TravelRoom, "crafts" | "seats" | "joined"> => ({ crafts, seats, joined });

test("all four in a four-seater: one pilot, the others gunners or passengers", () => {
  const r = room({ ann: { craft: "v-sedan", role: "pilot" }, bo: { craft: "v-sedan", role: "gunner" }, cy: { craft: "v-sedan", role: "passenger" }, di: { craft: "v-sedan", role: "passenger" } });
  assert.deepEqual(crewIssues(r), []);
  const units = unitsOf(r);
  assert.equal(units.length, 1);
  assert.equal(units[0].leader, "ann");
  assert.equal(units[0].crew.length, 4);
});

test("a craft without a pilot, with two, over its seats, or blocked is refused", () => {
  assert.ok(crewIssues(room({ ann: { craft: "v-bike", role: "gunner" }, bo: { craft: "v-bike", role: "passenger" } })).some((s) => /needs a pilot/.test(s)));
  assert.ok(crewIssues(room({ ann: { craft: "v-bike", role: "pilot" }, bo: { craft: "v-bike", role: "pilot" } })).some((s) => /2 pilots/.test(s)));
  assert.ok(crewIssues(room({ a: { craft: "v-bike", role: "pilot" }, b: { craft: "v-bike", role: "passenger" }, c: { craft: "v-bike", role: "passenger" } })).some((s) => /seats 2/.test(s)));
  assert.ok(crewIssues(room({ a: { craft: "v-wreck", role: "pilot" } })).some((s) => /wrecked/.test(s)));
  assert.ok(crewIssues(room({ a: { craft: "v-sedan", role: "engineer" } })).some((s) => /no engineer seat/.test(s)));
  assert.ok(crewIssues({ crafts, seats: {}, joined: ["a"] }).length > 0, "a member with no seat");
});

test("a two-seater bike and a four-seater and one on foot: three units, each led by its pilot", () => {
  const r = room({ a: { craft: "v-bike", role: "pilot" }, b: { craft: "v-bike", role: "gunner" }, c: { craft: "v-sedan", role: "pilot" }, d: { craft: "foot", role: "alone" } });
  assert.deepEqual(crewIssues(r), []);
  assert.deepEqual(unitsOf(r).map((u) => u.leader).sort(), ["a", "c", "d"]);
});

test("a ship takes a pilot, a co-pilot, a navigator, an engineer and gunners, one of each station but gunners up to three", () => {
  const ok = room({ a: { craft: "s-1", role: "pilot" }, b: { craft: "s-1", role: "gunner" }, c: { craft: "s-1", role: "engineer" }, d: { craft: "s-1", role: "navigator" } });
  assert.deepEqual(crewIssues(ok), []);
  const twoEngineers = room({ a: { craft: "s-1", role: "pilot" }, b: { craft: "s-1", role: "engineer" }, c: { craft: "s-1", role: "engineer" } });
  assert.ok(crewIssues(twoEngineers).some((s) => /2 engineers/.test(s)));
});

test("a member picks a seat on arriving in the crew phase: the first open craft, as its pilot if it has none", () => {
  const first = defaultSeat({ crafts, seats: {} }, "a");
  assert.deepEqual(first, { craft: "v-sedan", role: "pilot" });
  const second = defaultSeat({ crafts, seats: { a: first! } }, "b");
  assert.deepEqual(second, { craft: "v-sedan", role: "passenger" });
});

test("a member who leaves a journey takes their seat with them", () => {
  const r: TravelRoom = {
    id: 1, by: "a", from: "x", to: "y", title: "t", exit: {}, ship: false, aboard: false, boarded: [], crafts, phase: "underway", ready: [], joined: ["a", "b"],
    seats: { a: { craft: "v-bike", role: "pilot" }, b: { craft: "v-bike", role: "gunner" } }, pending: ["a"],
  };
  const out = withoutMember(r, "a");
  assert.deepEqual(out.joined, ["b"]);
  assert.deepEqual(out.pending, []);
  assert.equal(out.seats.a, undefined);
});
