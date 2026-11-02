// Surgeons' and technicians' shops and the loot that was missing (2026-10-21): prostheses and augmentations on a surgeon's list by the wealth
// of the place, modifications by trade, the technician's fee, the rules for what fits in an item, blueprints for modifications and chassis,
// and instruments and cybernetics in caches.
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, surgeonStock, modStock, modFee, modFitProblem, shopTier, tradeTop, gearRarity, stockOf, systemCarries, blueprintPool, itemFactsOf, LOOT, type World, type Occupant } from "../../shared/logic/index";
import { getWorldCatalog } from "../../server/sw5eData";
import enhanced from "../../shared/data/sw5e/enhancedItems.json";
import equipment from "../../shared/data/sw5e/equipment.json";

const catalog = await getWorldCatalog();
const rows = enhanced as any[];
const eq = equipment as any[];
const rank = (r: string) => ["standard", "premium", "prototype", "advanced", "legendary", "artifact"].indexOf(r.toLowerCase());
const worlds = new Map<number, World>();
const world = (seed: number) => {
  if (!worlds.has(seed)) worlds.set(seed, generateWorld({ seed, partyLevel: 5 }, catalog));
  return worlds.get(seed)!;
};
const settlementOfStart = (w: World) => {
  let s = w.areas[w.startId];
  while (s && s.kind !== "settlement") s = w.areas[s.parentId!];
  return s;
};
const person = (role: string, trade?: string): Occupant => ({ id: `t-${role}-${trade}`, name: "Someone", role, trade, disposition: "friendly", count: 1 } as any);

test("a surgeon lists every prosthesis the place can afford and three to five augmentations a day, none above the place's rarity", () => {
  const w = world(14);
  const s = settlementOfStart(w);
  const tier = shopTier(w, s.id);
  assert.ok(tier >= 0 && tier <= 3);
  const medic = person("medic");
  const prostheses = eq.filter((e) => e.equipmentCategory === "Medical" && /prosthesis$/i.test(e.name));
  assert.equal(prostheses.length, 10);
  for (let day = 1; day < 8; day++) {
    const lines = surgeonStock(w, medic, s.id, day, rows, eq);
    const aug = lines.filter((l) => l.kind === "augment");
    assert.ok(aug.length >= 3 && aug.length <= 5, `${aug.length} augmentations`);
    assert.ok(aug.every((l) => rank(l.rarity) <= tier), aug.map((l) => l.rarity).join());
    assert.ok(lines.some((l) => l.kind === "prosthesis"), "at least one prosthesis the place affords");
    assert.ok(lines.every((l) => l.price > 0));
    // Prostheses first, each by its parts
    assert.ok(lines.filter((l) => l.kind === "prosthesis").every((l) => l.parts.length === 1));
  }
  // Only a medic is a surgeon; a hostile one sells nothing; what was bought today is gone
  assert.deepEqual(surgeonStock(w, person("merchant", "medical"), s.id, 1, rows, eq), []);
  assert.deepEqual(surgeonStock(w, { ...medic, disposition: "hostile" } as any, s.id, 1, rows, eq), []);
  const first = surgeonStock(w, medic, s.id, 3, rows, eq)[0];
  assert.ok(!surgeonStock(w, medic, s.id, 3, rows, eq, { [first.name]: 1 }).some((l) => l.name === first.name));
  // The same day, the same list
  assert.deepEqual(surgeonStock(w, medic, s.id, 3, rows, eq), surgeonStock(w, medic, s.id, 3, rows, eq));
});

test("a richer place has better stock: the tiers by settlement and region", () => {
  const tiers = new Set<number>();
  for (const seed of [14, 3, 7, 21]) {
    const w = world(seed);
    for (const a of Object.values(w.areas)) if (a.kind === "settlement") tiers.add(shopTier(w, a.id));
  }
  assert.ok(tiers.size >= 2, `tiers seen: ${[...tiers].join()}`);
});

test("modifications are sold by trade: arms blasters, vibroweapons and armor; tech wristpads, focus generators and augments; outfitters clothes and armor", () => {
  const w = world(14);
  const s = settlementOfStart(w);
  const tier = tradeTop(w, s.id);
  for (const [trade, kinds] of [["arms", ["blaster", "vibroweapon", "armor"]], ["tech", ["wristpad", "focus generator", "augment"]], ["outfit", ["clothing", "armor"]]] as const) {
    for (let day = 1; day < 6; day++) {
      const lines = modStock(w, person("merchant", trade), s.id, day, rows);
      assert.ok(lines.length >= 4 && lines.length <= 7, `${trade}: ${lines.length}`);
      assert.ok(lines.every((l) => kinds.includes(l.kind as any) && rank(l.rarity) <= tier), `${trade}: ${lines.map((l) => `${l.kind}/${l.rarity}`).join()}`);
    }
  }
  // A mechanic is a tech shop; a bartender sells none; a scrapyard sells used ones (premium at best) cheaper; the black market anything, dearer
  assert.ok(modStock(w, person("mechanic"), s.id, 1, rows).length > 0);
  assert.deepEqual(modStock(w, person("bartender"), s.id, 1, rows), []);
  const used = modStock(w, person("merchant", "salvage"), s.id, 1, rows);
  assert.ok(used.every((l) => rank(l.rarity) <= 1));
  const black = modStock(w, person("fence", "black"), s.id, 2, rows);
  assert.ok(black.length > 0 && black.every((l) => rank(l.rarity) <= tradeTop(w, s.id, true)));
  const same = modStock(w, person("merchant", "arms"), s.id, 2, rows);
  const row = (n: string) => rows.find((r) => r.name === n);
  assert.ok(row(black[0].name) && same.length > 0);
  // Bought today: gone
  const first = same[0];
  assert.ok(!modStock(w, person("merchant", "arms"), s.id, 2, rows, { [first.name]: 1 }).some((l) => l.name === first.name));
});

test("the technician's fee is a hundred credits a rarity step, from a hundred", () => {
  assert.deepEqual(["Standard", "Premium", "Prototype", "Advanced", "Legendary", "Artifact"].map(modFee), [100, 200, 300, 400, 500, 600]);
});

test("what fits an item: its kind, the chassis's rarity, free slots, and never two of one augment", () => {
  const known: Record<string, { name: string; modKind?: string }> = {
    a: { name: "a", modKind: "blaster" }, b: { name: "b", modKind: "blaster" }, c: { name: "c", modKind: "blaster" }, d: { name: "d", modKind: "blaster" },
    aug1: { name: "aug1", modKind: "augment" },
  };
  const look = (n: string) => known[n];
  const mod = (extra: object = {}) => ({ name: "m", rarity: "Standard", modKind: "blaster", ...extra });
  assert.equal(modFitProblem(mod(), "blaster", { rarity: "Standard", mods: [] }, look), undefined);
  assert.match(modFitProblem(mod({ modKind: "armor" }), "blaster", { rarity: "Standard", mods: [] }, look)!, /armor modification/);
  assert.match(modFitProblem(mod({ modKind: undefined }), "blaster", { rarity: "Standard", mods: [] }, look)!, /not a modification/);
  assert.match(modFitProblem(mod(), undefined, { rarity: "Standard", mods: [] }, look)!, /not a modification/);
  assert.match(modFitProblem(mod({ rarity: "Prototype" }), "blaster", { rarity: "Premium", mods: [] }, look)!, /cannot hold prototype/);
  assert.match(modFitProblem(mod(), "blaster", { rarity: "Standard", mods: ["a", "b", "c", "d"] }, look)!, /All four slots/);
  // Augments: no slot on a standard chassis, one on a prototype, never two the same
  assert.match(modFitProblem(mod({ modKind: "augment" }), "blaster", { rarity: "Standard", mods: [] }, look)!, /No augment slot/);
  assert.equal(modFitProblem(mod({ modKind: "augment", rarity: "Standard", name: "aug2" }), "blaster", { rarity: "Prototype", mods: ["a"] }, look), undefined);
  assert.match(modFitProblem(mod({ modKind: "augment", name: "aug1" }), "blaster", { rarity: "Legendary", mods: ["aug1"] }, look)!, /two of the same augment/);
});

test("blueprints: modifications and chassis can be learned and made (only timed consumables cannot)", () => {
  const facts = rows.map((r) => itemFactsOf(r, eq)).filter(Boolean) as any[];
  const pool = blueprintPool(facts, "standard", []);
  assert.ok(pool.some((f) => f.modKind), "a modification");
  const chassisRarity = (facts.find((f) => f.chassis) as any).rarity.toLowerCase();
  assert.ok(blueprintPool(facts, chassisRarity, []).some((f) => f.chassis), "a chassis");
  assert.ok(!pool.some((f) => f.timed));
  // A blueprint item is not a blueprint of itself
  assert.ok(!pool.some((f) => /^Blueprint \(/.test(f.name)));
  assert.ok(!blueprintPool(facts, "standard", [pool[0].name]).some((f) => f.name === pool[0].name), "one already known is not offered");
});

test("caches: cybernetics in a medical cabinet as well as the vault, instruments in stashes and a stage's instrument case", () => {
  assert.ok(LOOT.medical.enhanced.includes("CyberneticAugmentation") && LOOT.vault.enhanced.includes("CyberneticAugmentation"));
  assert.ok(LOOT.stash.equipment.includes("MusicalInstrument"));
  assert.deepEqual(LOOT.stage.equipment, ["MusicalInstrument"]);
  // A cantina's dance floor holds the instrument case in a generated world
  const found = [14, 3, 7].some((seed) => {
    const w = world(seed);
    return Object.values(w.areas).some((a) => a.kind === "room" && a.name === "Dance floor" && a.loot.some((c) => LOOT.stage.names.includes(c.name)));
  });
  assert.ok(found, "an instrument case on a dance floor");
});

test("rarity (house rule for plain gear): standard under 1,000 cr, premium from 1,000, prototype from 3,000, a lightweapon a step rarer; enhanced items keep the books'", () => {
  assert.equal(gearRarity({ cost: 500 }), "Standard");
  assert.equal(gearRarity({ cost: 1500 }), "Premium");
  assert.equal(gearRarity({ cost: 15000 }), "Prototype");
  assert.equal(gearRarity({ cost: 500, weaponClassification: "MartialLightweapon" }), "Premium");
  assert.equal(gearRarity({ cost: 50, searchableRarity: "Legendary" }), "Legendary");
  assert.ok(eq.every((e) => ["Standard", "Premium", "Prototype"].includes(gearRarity(e))));
});

test("a vendor's stock is small and of its star system: 2 to 4 lines a stall, 4 to 7 a shop, nothing rarer than the place deals in", () => {
  const w = world(14);
  const s = settlementOfStart(w);
  const customer = { standing: { renown: {}, dealings: {} } } as any;
  const top = tradeTop(w, s.id);
  for (let day = 1; day < 8; day++) {
    for (const trade of ["general", "arms", "tech", "outfit"]) {
      const shop = stockOf(w, person("merchant", trade), s.id, eq, day, customer);
      assert.ok(shop.length >= 1 && shop.length <= 7, `${trade}: ${shop.length}`);
      assert.ok(shop.every((l) => rank(l.rarity!) <= top && systemCarries(w, s.id, eq.find((e) => e.name === l.name))), shop.map((l) => `${l.name}/${l.rarity}`).join());
      const stall = stockOf(w, { ...person("merchant", trade), stall: "a" } as Occupant, s.id, eq, day, customer);
      assert.ok(stall.length <= 4, `stall ${trade}: ${stall.length}`);
    }
  }
  // Two systems carry different goods
  const systems = Object.values(w.areas).filter((a) => a.kind === "system").slice(0, 2);
  const carried = (id: string) => eq.filter((e) => systemCarries(w, id, e)).map((e) => e.name).join();
  assert.notEqual(carried(systems[0].id), carried(systems[1].id));
  assert.ok(eq.filter((e) => systemCarries(w, s.id, e)).length < eq.length * 0.85);
});

test("master artificers: about one city in four, the same person every visit; prototype work for anyone, advanced at friendly regard, legendary at devoted", async () => {
  const { artificerIn, artificerStock, isArtificer } = await import("../../shared/logic/index");
  const cities: string[] = [];
  let found: { w: World; id: string; room: string } | undefined;
  for (const seed of [3, 7, 11, 14, 21, 34, 40, 55, 61, 77]) {
    const w = world(seed);
    for (const s of Object.values(w.areas).filter((a) => a.kind === "settlement" && a.type === "city" && a.id.length)) {
      cities.push(s.id);
      const id = artificerIn(w, s.id);
      if (id && !found) {
        const room = Object.values(w.areas).find((a) => a.kind === "room" && a.occupants.some((o) => o.id === id))!;
        found = { w, id, room: room.id };
      }
    }
  }
  assert.ok(found, `an artificer in one of ${cities.length} cities`);
  const { w, id, room } = found!;
  const o = w.areas[room].occupants.find((x) => x.id === id)!;
  assert.ok(isArtificer(w, o, room));
  const stranger = artificerStock(w, o, room, 3, rows, 0);
  assert.ok(stranger.some((l) => l.rarity === "Prototype" && !l.needs));
  assert.ok(stranger.filter((l) => l.rarity === "Advanced").every((l) => l.needs === 40));
  assert.ok(stranger.filter((l) => l.rarity === "Legendary").every((l) => l.needs === 80));
  assert.ok(artificerStock(w, o, room, 3, rows, 40).filter((l) => l.rarity === "Advanced").every((l) => !l.needs));
  assert.ok(artificerStock(w, o, room, 3, rows, 80).every((l) => !l.needs));
  assert.ok(stranger.every((l) => l.rarity !== "Artifact"));
  // anyone else sells none of it
  assert.deepEqual(artificerStock(w, { ...o, id: "someone-else" }, room, 3, rows, 100), []);
});
