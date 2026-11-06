// The law in person, cells, shops and the days of the people (2026-10-30): officers are dispatched from the garrison (or the nearest patrol)
// and run to the scene a room at a time; a witness without a commlink walks to the garrison to report; the held are in locked cells; a shop's
// stock is on its shelves and can be stolen (by day the keeper watches, by night the alarm is armed); some people are called to the palace
// or go on a round of the shops; troopers see what is done in front of them
import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY, RUN_STEP, START_TIME, WALK_STEP, advanceDiscoveries, advanceSearch, cellOf, cellOpen, childrenOf, disarmShop, errandAt, generateWorld, hasCommlink, isCellAsset, isCivilian, isLawman,
  lawAt, lawBase, nextOpening, noteTheft, openCells, pullPatrols, reachable, reportCrime, responseFor, settlementOf, shelfStock, shopArmed, stockPieces, stockOf, townPath, whereAt, withPresence,
  type Area, type Occupant, type World,
} from "../../shared/logic";

let cached: Promise<World> | undefined;
const worldOf = () =>
  (cached ??= (async () => {
    const { getWorldCatalog } = await import("../../server/sw5eData");
    return generateWorld({ seed: 11, partyLevel: 5, detail: "all" as const }, await getWorldCatalog());
  })());

const noon = START_TIME + 4 * 60; // 12:00 on the first day
const night = START_TIME + 18 * 60; // 02:00 on the second day
const rooms = (world: World, settlementId: string) => Object.values(world.areas).filter((a) => a.kind === "room" && settlementOf(world, a.id) === settlementId);

// A settlement with a garrison of its own and a scene some way from it
function scenario(world: World, minHops = 3) {
  for (const s of Object.values(world.areas).filter((a) => a.kind === "settlement")) {
    const base = lawBase(world, s.id);
    if (!base || lawAt(world, base.room.id) < 1) continue;
    for (const room of rooms(world, s.id)) {
      const way = townPath(world, s.id, base.room.id, room.id);
      // (a scene no patrol in the street is nearer to than the garrison: then all the squads come from it; since the stairwells of 2026-11-06 a
      // patrol was nearer the first scene found)
      const patrolled = () => (reportCrime(world, room.id, "theft", noon, "alarm").pursuit?.squads ?? []).some((q) => q.id.endsWith("-patrol"));
      if (way && way.length - 1 >= minHops && way.length - 1 <= 12 && !patrolled()) return { settlement: s, base, scene: room, hops: way.length - 1 };
    }
  }
  throw new Error("no settlement with a garrison and a far room");
}

test("a crime sends the duty squad out of the garrison: it musters, runs to the scene a room at a time, and is seen on its way", async () => {
  const world = await worldOf();
  const { settlement, base, scene, hops } = scenario(world);
  const resp = responseFor(lawAt(world, scene.id), "theft", false)!;
  const sent = reportCrime(world, scene.id, "theft", noon, "alarm");
  const p = sent.pursuit!;
  assert.equal(p.via, "alarm");
  assert.equal(p.from, base.building.name, "they come from the garrison");
  assert.ok(p.squads!.every((s) => s.at === base.room.id && s.to === scene.id), "all of them start at the barracks, bound for the scene (no patrol is out)");
  const depart = noon + resp.turnout;
  assert.ok(p.squads!.every((s) => s.next === depart), "an alarm is told at once, then they turn out");
  assert.equal(p.arrivesAt, depart + hops * RUN_STEP, "and run: a minute a room");
  // Halfway there they are halfway there
  const mid = advanceSearch(sent, depart + Math.floor(hops / 2) * RUN_STEP, { area: "nowhere", jammed: false }).world.pursuit!;
  const on = mid.squads![0];
  const left = townPath(sent, settlement.id, on.at, scene.id)!.length - 1;
  assert.ok(left > 0 && left < hops, `on the way: ${left} rooms to go of ${hops}`);
  // At the scene they are there, and then they search the district
  const there = advanceSearch(sent, p.arrivesAt, { area: "nowhere", jammed: false }).world.pursuit!;
  assert.ok(there.squads!.every((s) => !s.to), "no longer running");
  assert.ok(there.squads!.some((s) => s.at === scene.id), "at the scene");
  // The party in a room on the way is walked in on
  const route = townPath(sent, settlement.id, base.room.id, scene.id)!;
  const step = advanceSearch(sent, p.arrivesAt, { area: route[Math.min(2, route.length - 2)], jammed: false });
  assert.ok(step.sighted, "squads running past the party's room find it");
});

test("how the law is told sets how soon: a camera takes a minute, a call two, a witness without a commlink walks to the garrison", async () => {
  const world = await worldOf();
  const { settlement, base, scene } = scenario(world);
  const at = (via: "law" | "camera" | "call") => reportCrime(world, scene.id, "brawl", noon, via).pursuit!.squads![0].next;
  assert.equal(at("camera") - at("law"), 1);
  assert.equal(at("call") - at("law"), 2);
  // A civilian in the scene with no commlink: they set off for the garrison, and the officers are sent when they arrive
  const crowd: Area = { ...scene, occupants: [{ id: "w1", name: "Witness", role: "resident", disposition: "neutral", count: 1, loadout: [] } as Occupant] };
  const w2: World = { ...world, areas: { ...world.areas, [scene.id]: crowd } };
  const way = townPath(w2, settlement.id, scene.id, base.room.id)!;
  const sent = reportCrime(w2, scene.id, "brawl", noon, "witness");
  const run = sent.errands!.find((e) => e.who === "w1")!;
  assert.equal(run.kind, "report");
  assert.equal(run.to, base.room.id);
  assert.equal(run.arriveAt, noon + (way.length - 1) * WALK_STEP);
  assert.equal(sent.pursuit!.squads![0].next - at("law"), (way.length - 1) * WALK_STEP, "the officers go out when the report is made");
  // Seen leaving, at the garrison, and back
  const mid = errandAt(sent, "w1", noon + 1)!;
  assert.ok(mid.moving && mid.moving.to === base.room.id);
  assert.equal(errandAt(sent, "w1", run.arriveAt + 1)!.at, base.room.id);
  assert.equal(errandAt(sent, "w1", run.backAt), undefined, "home again");
  assert.ok(withPresence(sent, run.arriveAt + 1).areas[base.room.id].occupants.some((o) => o.id === "w1"), "the garrison sees them");
  // With a commlink they call; nobody about, nobody reports
  const linked: World = { ...w2, areas: { ...w2.areas, [scene.id]: { ...crowd, occupants: [{ ...crowd.occupants[0], loadout: ["Commlink"] }] } } };
  assert.equal(reportCrime(linked, scene.id, "brawl", noon, "witness").pursuit!.squads![0].next - at("law"), 2);
  const empty: World = { ...world, areas: { ...world.areas, [scene.id]: { ...scene, occupants: [] } } };
  assert.equal(reportCrime(empty, scene.id, "brawl", noon, "witness"), empty, "nobody saw it, nobody reports it");
});

test("a patrol nearer than the garrison goes first and is gone from its beat; the rest come from the garrison", async () => {
  const world = await worldOf();
  let found: { who: Occupant; at: string; settlement: string } | undefined;
  for (const area of Object.values(world.areas)) {
    for (const o of area.occupants) {
      if (!o.routine?.patrol) continue;
      const w = whereAt(o, area.id, noon);
      // (where the garrison sends the rest: not an outpost's, which stands where its patrol walks, nor a town a cartel holds; 2026-11-02, the
      // arena's rooms moved the ids and the first patrol found was such a one)
      if (w.at && w.at !== area.id && reportCrime(world, w.at, "assault", noon, "law").pursuit?.from) found = { who: o, at: w.at, settlement: settlementOf(world, w.at) };
      if (found) break;
    }
    if (found) break;
  }
  assert.ok(found, "a generated world has patrols");
  const scene = found!.at;
  const sent = reportCrime(world, scene, "assault", noon, "law");
  const squads = sent.pursuit!.squads!;
  assert.ok(squads.some((s) => s.id.endsWith("-patrol") && s.at === scene), "the patrol is already there");
  const err = sent.errands!.find((e) => e.kind === "dispatched" && e.who === found!.who.id)!;
  assert.ok(err, "and is off its beat");
  assert.equal(withPresence(sent, noon + 5).areas[scene].occupants.some((o) => o.id === found!.who.id), false, "not standing at its post any more");
  assert.ok(squads.some((s) => s.from === sent.pursuit!.from), "the garrison sends the rest");
  // Pulled into the room, the patrol is there for the party to be seen by
  const pulled = pullPatrols(world, scene, noon);
  assert.ok(pulled.areas[scene].occupants.some((o) => o.id === found!.who.id && !o.routine));
});

test("troopers, constables and sentries are lawmen wherever they stand; a droid is not", () => {
  const o = (role: string, extra: Partial<Occupant> = {}): Occupant => ({ id: role, name: role, role, disposition: "neutral", count: 1, loadout: [], ...extra });
  assert.ok(isLawman(o("guard")) && isLawman(o("trooper")) && isLawman(o("constable")) && isLawman(o("security trooper")) && isLawman(o("sentry")));
  assert.ok(!isLawman(o("guard", { disposition: "hostile" })), "the enemy's are watchers, not the law");
  assert.ok(!isLawman(o("security droid", { creature: "droid" })));
  assert.ok(!isLawman(o("merchant")) && isCivilian(o("merchant")) && !hasCommlink(o("merchant")));
});

test("those held are in locked cells: the cell is opened before they can be reached, then they are free", async () => {
  const world = await worldOf();
  const room = Object.values(world.areas).find((a) => a.kind === "room" && a.occupants.some((o) => o.captive) && a.layout?.assets.some(isCellAsset));
  assert.ok(room, "a generated world has captives in cells");
  const held = room!.occupants.filter((o) => o.captive);
  for (const o of held) {
    const cell = cellOf(room!, o)!;
    assert.ok(cell, o.name);
    assert.ok(!cellOpen(cell) && !reachable(room!, o), "shut");
    const npc = room!.layout!.assets.find((a) => a.kind === "npc" && a.ref === o.id)!;
    assert.ok(npc.x >= cell.x && npc.x < cell.x + cell.w && npc.y >= cell.y && npc.y < cell.y + cell.h, `${o.name} stands inside the cell`);
  }
  const one = cellOf(room!, held[0])!;
  const opened = openCells(world, room!.id, one.id).areas[room!.id];
  assert.ok(reachable(opened, held[0]));
  assert.ok(openCells(world, room!.id).areas[room!.id].layout!.assets.filter(isCellAsset).every(cellOpen), "the console opens every cell");
  // (a room made before cells has none: its captives are reached as they were)
  assert.ok(reachable({ layout: undefined, occupants: room!.occupants }, held[0]));
});

test("a shop's stock is on its shelves, dealt out from the trader's stock; stolen, it is gone for the day", async () => {
  const world = await worldOf();
  const equipment = JSON.parse((await import("node:fs")).readFileSync(new URL("../../shared/data/sw5e/equipment.json", import.meta.url), "utf8")) as any[];
  const floor = Object.values(world.areas).find((a) => a.kind === "room" && /sales floor/i.test(a.name) && stockPieces(a).length >= 2 && a.occupants.some((o) => o.role === "merchant" && o.trade));
  assert.ok(floor, "a shop with a sales floor");
  const keeper = floor!.occupants.find((o) => o.role === "merchant" && o.trade)!;
  const customer = { standing: { renown: {}, dealings: {} } } as any;
  const lines = stockOf(world, keeper, floor!.id, equipment, 3, customer);
  assert.ok(lines.length > 0);
  const dealt = shelfStock(floor!, lines);
  assert.equal(Object.values(dealt).reduce((n, l) => n + l.length, 0), lines.length, "every line is on some piece");
  assert.deepEqual(shelfStock(floor!, lines), dealt, "the same every time");
  const first = lines[0];
  const ledger = { day: 3, traders: { [keeper.id]: { bought: {}, sold: {}, stolen: { [first.name]: first.quantity } } } };
  const after = stockOf(world, keeper, floor!.id, equipment, 3, customer, ledger as any);
  assert.ok(!after.some((l) => l.name === first.name), "taken, the item is gone from the stock");
});

test("by night a shop is shut and its alarm armed in a place of the law, until its sensors are disabled; unseen thefts are found at the count", async () => {
  const world = await worldOf();
  const floor = Object.values(world.areas).find((a) => a.kind === "room" && /sales floor/i.test(a.name) && lawAt(world, a.id) >= 1 && world.areas[a.parentId!] && ["general store", "armsmith", "tech shop", "apothecary", "outfitter", "curio shop"].includes(world.areas[a.parentId!].type) && a.occupants.some((o) => o.role === "merchant" && o.routine));
  assert.ok(floor, "a shop in a place with law");
  const shop = world.areas[floor!.parentId!];
  assert.ok(!shopArmed(world, shop.id, noon), "open by day");
  assert.ok(shopArmed(world, shop.id, night), "shut and armed by night");
  const open = nextOpening(shop.type, night);
  assert.ok(open > night && open - night < DAY);
  const off = disarmShop(world, shop.id, night);
  assert.ok(!shopArmed(off, shop.id, night), "disabled");
  assert.ok(!shopArmed(off, shop.id, open + 60), "and open again in the morning");
  // A theft by day nobody saw is found ten minutes before closing, and reported by the keeper
  const noted = noteTheft(world, shop.id, floor!.id, noon, 2);
  const d = noted.discoveries![0];
  assert.ok(d.due > noon && d.due < noon + DAY && d.items === 2);
  assert.equal(noteTheft(noted, shop.id, floor!.id, noon + 1, 1).discoveries!.length, 1, "the same shop counts once");
  assert.equal(advanceDiscoveries(noted, noon + 5), noted, "not yet");
  const counted = advanceDiscoveries(noted, d.due);
  assert.equal(counted.discoveries!.length, 0);
  assert.ok(counted.pursuit || counted.errands?.length, "the keeper reports it (a call, or a walk to the garrison)");
  // A theft at night is found when the keeper opens
  assert.ok(noteTheft(world, shop.id, floor!.id, night).discoveries![0].due >= open);
});

test("some of the people are called to the palace or go round the shops on their days", async () => {
  const world = await worldOf();
  const o = Object.values(world.areas).flatMap((a) => a.occupants).find((x) => x.routine?.visits?.some((v) => v.why === "palace"));
  assert.ok(o, "someone has a call to the palace");
  const v = o!.routine!.visits!.find((x) => x.why === "palace")!;
  const base = Object.values(world.areas).find((a) => a.occupants.includes(o!))!.id;
  const day = (d: number, h: number) => d * DAY + Math.round(h * 60);
  let d = 0;
  while ((d + v.phase) % v.every !== 0) d++;
  assert.equal(whereAt(o!, base, day(d, (v.from + v.to) / 2)).at, v.at, "at the palace on the day");
  const before = whereAt(o!, base, day(d, v.from - 0.1));
  assert.ok(before.moving && before.moving.to === v.at, "walking there");
  assert.notEqual(whereAt(o!, base, day(d + 1, (v.from + v.to) / 2)).at, v.at, "not the next day");
});
