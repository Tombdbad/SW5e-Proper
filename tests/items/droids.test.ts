// The droid shop (2026-10-21): prices from the Expanded Content's droid table (and a curve through it), the customizations a dealer or a
// scrapyard sells by the wealth of the place, the droids of the day on the plinths, a droid dealer in every city, and old worlds refitted.
import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, livenWorld, droidPrice, droidCurve, fitDroidPrices, droidListed, droidPartsStock, droidDisplay, droidStock, childrenOf, type World, type Occupant } from "../../shared/logic/index";
import { getWorldCatalog } from "../../server/sw5eData";
import monsters from "../../shared/data/sw5e/monsters.json";
import enhanced from "../../shared/data/sw5e/enhancedItems.json";

const catalog = await getWorldCatalog();
const droids = (monsters as any[]).filter((m) => /droid/i.test(String(m.types)) && !/swarm/i.test(String(m.types))).map((m) => ({ id: m.id, name: m.name, experiencePoints: Number(m.experiencePoints) || 0, challengeRating: m.challengeRating, hitPoints: m.hitPoints, size: m.size }));
fitDroidPrices(droids);
const parts = (enhanced as any[]).filter((e) => e.type === "DroidCustomization");
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

test("droids the book prices cost the book's price; the rest lie on a curve through them", () => {
  const named = (n: string) => droids.find((d) => d.name === n)!;
  assert.equal(droidPrice(named("R2 Series Astromech Droid").experiencePoints, "R2 Series Astromech Droid"), 2800);
  assert.equal(droidPrice(25, "B1 Series, B1-A"), 1300);
  assert.equal(droidPrice(100, "B1 Series, B1-X"), 2600);
  assert.equal(droidPrice(3900, "HK Series, HK-47"), 212000);
  assert.equal(droidPrice(10, "ID9 Seeker Droid"), 150);
  assert.equal(droidPrice(10, "DUM-Series PIT Droid"), 650);
  assert.ok(droidListed("Destroyer Droid") && !droidListed("BB Series Astromech Droid"));
  const curve = droidCurve([{ xp: 10, cost: 400 }, { xp: 100, cost: 4000 }]);
  assert.ok(Math.abs(curve.b - 1) < 1e-9 && Math.abs(curve.a - 40) < 1e-6);
  // Unlisted droids: more experience, a dearer droid
  assert.ok(droidPrice(50) < droidPrice(500) && droidPrice(500) < droidPrice(5000));
  assert.ok(droidPrice(0) >= 150);
});

test("a dealer sells customizations up to a rarity set by the place; a scrapyard salvaged ones, cheaper", () => {
  const w = world(14);
  const s = settlementOfStart(w);
  const room = Object.values(w.areas).find((a) => a.kind === "room" && w.areas[a.parentId!]?.type === "droid dealer" && w.areas[a.parentId!].parentId === s.id && a.occupants.some((o) => o.trade === "droids"))!;
  assert.ok(room, "a droid dealer with a trader in the start city");
  const dealer = room.occupants.find((o) => o.trade === "droids")!;
  const rank = (r: string) => ["standard", "premium", "prototype", "advanced", "legendary", "artifact"].indexOf(r.toLowerCase());
  for (let day = 1; day < 8; day++) {
    const lines = droidPartsStock(w, dealer, room.id, day, parts);
    assert.ok(lines.length >= 6 && lines.length <= 9, `${lines.length} lines`);
    // An Outer Rim city: prototype at best
    assert.ok(lines.every((l) => rank(l.rarity) <= 2), lines.map((l) => l.rarity).join());
    const scrap: Occupant = { ...dealer, id: `${dealer.id}-scrap`, trade: "salvage" };
    const salvaged = droidPartsStock(w, scrap, room.id, day, parts);
    assert.ok(salvaged.every((l) => rank(l.rarity) <= 1));
  }
  assert.deepEqual(droidPartsStock(w, { ...dealer, trade: "general" }, room.id, 1, parts), []);
  // Bought today: gone from the floor
  const first = droidPartsStock(w, dealer, room.id, 3, parts)[0];
  assert.ok(!droidPartsStock(w, dealer, room.id, 3, parts, { [first.name]: 1 }).some((l) => l.name === first.name));
});

test("every city has a droid dealer, a shop with plinths, parts shelves and a counter, and its droids stand on the plinths", () => {
  for (const seed of [1, 14, 30]) {
    const w = world(seed);
    const s = settlementOfStart(w);
    if (s.type !== "city") continue;
    const dealer = childrenOf(w, s.id).find((b) => b.type === "droid dealer");
    assert.ok(dealer, `seed ${seed}: no droid dealer in ${s.name}`);
    const showroom = childrenOf(w, dealer!.id).find((r) => /showroom/i.test(r.name))!;
    const names = showroom.layout!.assets.map((a) => a.name);
    assert.ok(names.filter((n) => n === "Droid plinth").length >= 3, names.join());
    assert.ok(names.includes("Droid parts shelf") && names.includes("Sales counter"), names.join());
    const shown = droidDisplay(w, showroom.id, 2, droids);
    const stock = droidStock(w, showroom.occupants.find((o) => o.trade === "droids")!, showroom.id, 2, droids);
    assert.ok(shown.length > 0 && shown.length <= stock.length);
    assert.deepEqual(shown.map((x) => x.line.name), stock.slice(0, shown.length).map((l) => l.name));
    assert.ok(shown.every((x) => showroom.layout!.assets.some((a) => a.id === x.plinth && a.name === "Droid plinth")));
  }
});

test("an old world gets its droid shops fitted out and its scrapyards' dealers selling salvage", () => {
  const w: World = JSON.parse(JSON.stringify(world(14)));
  const s = settlementOfStart(w);
  const dealer = childrenOf(w, s.id).find((b) => b.type === "droid dealer")!;
  const showroom = childrenOf(w, dealer.id).find((r) => /showroom/i.test(r.name))!;
  // As a world of life 12 had it: crates and a bench, the scrapyard's dealers selling tools
  showroom.layout!.assets = showroom.layout!.assets.filter((a) => a.kind !== "furniture").concat([{ id: `${showroom.id}-old`, kind: "furniture", name: "Crate", x: 0, y: 0, w: 1, h: 1, blocks: true }]);
  for (const r of Object.values(w.areas)) if (r.kind === "room" && ["junkyard", "scrap dealer"].includes(w.areas[r.parentId!]?.type)) for (const o of r.occupants) if (o.trade === "salvage") o.trade = "tech";
  w.life = 12;
  const next = livenWorld(w, catalog);
  const after = next.areas[showroom.id];
  assert.ok(after.layout!.assets.some((a) => a.name === "Droid plinth"));
  assert.ok(!after.layout!.assets.some((a) => a.id === `${showroom.id}-old`));
  const scrap = Object.values(next.areas).filter((r) => r.kind === "room" && ["junkyard", "scrap dealer"].includes(next.areas[r.parentId!]?.type)).flatMap((r) => r.occupants.filter((o) => o.role === "merchant"));
  assert.ok(scrap.length && scrap.every((o) => o.trade === "salvage"));
});
