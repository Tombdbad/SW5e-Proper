// Contracts (2026-10-27): the jobs the people of a place offer, what accepting one puts in the world, and how the world says it is done
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, trailOf, type Area, type Occupant, type World } from "../../shared/logic/index";
import { accept, askAround, askDC, findOccupant, kindsOf, makeOffers, payout, progress, tierFor, whereabouts, type Contract, type ContractKind } from "../../shared/logic/contracts";
import { getWorldCatalog } from "../../server/sw5eData";

const catalog = await getWorldCatalog();
const world: World = generateWorld({ seed: 34, partyLevel: 3 }, catalog);
const bartender = (): { o: Occupant; area: Area } => {
  for (const a of Object.values(world.areas)) {
    if (a.kind !== "room") continue;
    const o = a.occupants.find((x) => /bartender/i.test(x.role));
    if (o) return { o, area: a };
  }
  throw new Error("no bartender");
};
const giver = (role: string, extra: Partial<Occupant> = {}): Occupant => ({ id: `g-${role}`, name: "Giver", role, disposition: "neutral", count: 1, loadout: [], ...extra });

test("who offers what: a bar's notice board and an officer have bounties, the shady have robberies and data jobs, hostile or bound people have nothing", () => {
  assert.ok(kindsOf(giver("bartender"), "cantina").includes("bounty"));
  assert.ok(kindsOf(giver("bartender"), "cantina").includes("burglary"));
  assert.deepEqual(kindsOf(giver("bounty hunter"), "cantina"), ["bounty"]);
  assert.ok(kindsOf(giver("officer"), "garrison").includes("assault"));
  assert.ok(kindsOf(giver("smuggler"), "hideout").includes("espionage"));
  assert.deepEqual(kindsOf(giver("farmer"), "residences"), []);
  assert.deepEqual(kindsOf(giver("officer", { disposition: "hostile" }), "garrison"), []);
});

test("trust opens tiers: none done, a local job; one, regional; three, far; six, notorious", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 20].map(tierFor), [0, 1, 1, 2, 2, 3, 3]);
  const { o, area } = bartender();
  const tiersOf = (done: number) => makeOffers(world, o, area.id, done, 1).filter((x) => x.kind === "bounty").map((x) => x.tier).sort();
  assert.deepEqual(tiersOf(0), [0]);
  assert.deepEqual(tiersOf(1), [0, 1]);
  assert.deepEqual(tiersOf(6), [2, 3]);
  // the day's offers are the same each time they are asked for, and change with the day
  assert.deepEqual(makeOffers(world, o, area.id, 3, 4).map((x) => x.id), makeOffers(world, o, area.id, 3, 4).map((x) => x.id));
  assert.notDeepEqual(makeOffers(world, o, area.id, 3, 4).map((x) => x.id), makeOffers(world, o, area.id, 3, 5).map((x) => x.id));
  // the higher tiers pay more
  const pay = (tier: number) => makeOffers(world, o, area.id, 6, 1).find((x) => x.kind === "bounty" && x.tier === tier)?.reward ?? 0;
  assert.ok(pay(3) > pay(2));
});

test("a bounty puts its target, with the people round them, in a room as far away as the tier says; the harder the price, the harder the target", () => {
  const { o, area } = bartender();
  const offers = makeOffers(world, o, area.id, 6, 1).filter((x) => x.kind === "bounty");
  const placed = new Map<number, { w: World; c: Contract }>();
  for (const offer of offers) {
    const r = accept(world, offer, 3, catalog.monsters, catalog.equipment, 100);
    assert.ok(!("error" in r), "error" in r ? r.error : "");
    if ("error" in r) continue;
    const t = findOccupant(r.world, r.contract.targetId!)!;
    assert.equal(t.occupant.role, "bounty target");
    assert.equal(t.occupant.contract, offer.id);
    assert.equal(t.area.id, r.contract.room);
    assert.ok(r.contract.guardIds.length >= 0);
    // the original world is untouched
    assert.equal(findOccupant(world, r.contract.targetId!), undefined);
    placed.set(offer.tier, { w: r.world, c: r.contract });
  }
  const [low, high] = [placed.get(2)!, placed.get(3)!];
  assert.ok(low && high);
  assert.ok(findOccupant(high.w, high.c.targetId!)!.occupant.hitPoints! > findOccupant(low.w, low.c.targetId!)!.occupant.hitPoints! * 0.9);
  assert.ok(high.c.guardIds.length > low.c.guardIds.length);
  assert.ok(high.c.surrender! > low.c.surrender!);
  // far jobs start knowing less: the far one only the system; the near one the world
  assert.ok(high.c.reveal < low.c.reveal);
  // the far target's building is on another settlement than the one the job was taken in
  assert.notEqual(trailOf(high.w, high.c.site).find((a) => a.kind === "settlement")?.id, area.parentId && trailOf(world, area.id).find((a) => a.kind === "settlement")?.id);
});

test("asking round: a check at the DC tells one more of where, until the building and the room; a miss tells nothing", () => {
  const { o, area } = bartender();
  const offer = makeOffers(world, o, area.id, 6, 1).find((x) => x.kind === "bounty" && x.tier === 3)!;
  const r = accept(world, offer, 3, catalog.monsters, catalog.equipment, 0);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  let c = r.contract;
  assert.equal(c.reveal, 0);
  const first = whereabouts(r.world, c, area.id);
  assert.match(first, /system/);
  assert.ok(!first.includes(r.world.areas[c.room].name));
  assert.equal(askAround(c, askDC(c) - 1).learned, false);
  const heard: string[] = [first];
  for (let i = 0; i < 3; i++) {
    const res = askAround(c, askDC(c));
    assert.equal(res.learned, true);
    c = res.contract;
    heard.push(whereabouts(r.world, c, area.id));
  }
  assert.equal(c.reveal, 3);
  assert.ok(heard[3].includes(r.world.areas[c.room].name));
  assert.equal(askAround(c, 99).learned, false, "there is nothing more to learn");
  assert.equal(new Set(heard).size, 4, "each answer says more");
});

test("the job is done when the world says so: the target gone, the cache emptied, the den cleared; the giver then pays", () => {
  const { o, area } = bartender();
  const kinds: ContractKind[] = ["bounty", "burglary", "espionage", "assault"];
  const sheet = giver("officer");
  for (const kind of kinds) {
    const offer = makeOffers(world, { ...sheet, id: "g-all" }, area.id, 3, 2).find((x) => x.kind === kind) ?? makeOffers(world, o, area.id, 3, 2).find((x) => x.kind === kind);
    if (!offer) { assert.ok(kind !== "bounty", `no ${kind} offer`); continue; }
    const r = accept(world, offer, 3, catalog.monsters, catalog.equipment, 0);
    assert.ok(!("error" in r), `${kind}: ${"error" in r ? r.error : ""}`);
    if ("error" in r) continue;
    assert.equal(progress(r.world, r.contract).status, "active", kind);
    const done: World = { ...r.world, areas: Object.fromEntries(Object.entries(r.world.areas).map(([id, a]) => [id, {
      ...a,
      occupants: a.occupants.filter((x) => x.contract !== offer.id),
      loot: a.loot.map((l) => (l.id === r.contract.cacheId ? { ...l, looted: true } : l)),
    }])) };
    assert.equal(progress(done, r.contract).status, "ready", kind);
    // a den is cleared only when all of it is: one left keeps it open
    if (kind === "assault" && r.contract.guardIds.length > 1) {
      const one = r.contract.guardIds[0];
      const rest: World = { ...done, areas: { ...done.areas, [r.contract.room]: { ...done.areas[r.contract.room], occupants: [...done.areas[r.contract.room].occupants, findOccupant(r.world, one)!.occupant] } } };
      assert.equal(progress(rest, r.contract).status, "active");
    }
    assert.ok(payout(r.contract) >= r.contract.reward);
    assert.ok(payout(r.contract, 0.25) > payout(r.contract));
  }
});

test("a robbery's cache is locked and kept, with more guards the higher the tier; a den has more of them and a boss from the second tier", () => {
  const { o, area } = bartender();
  const burg = (tier: number) => makeOffers(world, o, area.id, 6, 1).find((x) => x.kind === "burglary" && x.tier === tier);
  const a = burg(1) ?? burg(0);
  const b = burg(2) ?? burg(1);
  assert.ok(a && b);
  const pa = accept(world, a!, 3, catalog.monsters, catalog.equipment, 0);
  const pb = accept(world, b!, 3, catalog.monsters, catalog.equipment, 0);
  assert.ok(!("error" in pa) && !("error" in pb));
  if ("error" in pa || "error" in pb) return;
  const cache = Object.values(pb.world.areas).flatMap((x) => x.loot).find((l) => l.id === pb.contract.cacheId)!;
  assert.ok(cache.locked && cache.locked >= 13);
  assert.ok(pb.contract.guardIds.length >= pa.contract.guardIds.length);
});
