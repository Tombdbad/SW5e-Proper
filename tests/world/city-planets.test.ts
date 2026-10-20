import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld, childrenOf, ancestor, kindLabel, type Area } from "@shared/logic";
import { getWorldCatalog } from "../../server/sw5eData";

// A city planet (2026-10-20): covered in city, so the places under it are sewers and never caves; its districts meet at speeder platforms on
// the roofs and not at gates in a wall; its buildings are towers of stacked rooms more than other worlds'; and what the game calls a
// settlement is, there, a district.
const catalog = await getWorldCatalog();
const worlds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => generateWorld({ seed, partyLevel: 5, detail: "all" }, catalog));
const onUrban = (w: (typeof worlds)[number], a: Area) => ancestor(w, a.id, "planet")?.type === "urban";

test("a city planet has sewers where other worlds have caves, and no caves", () => {
  let sewers = 0;
  for (const w of worlds) for (const a of Object.values(w.areas)) {
    if (a.kind !== "settlement" || !onUrban(w, a)) continue;
    assert.notEqual(a.type, "cave system", `${a.name}: caves on a city planet`);
    if (a.type === "sewer system") sewers++;
  }
  assert.ok(sewers > 0, "no sewer system on any city planet");
});

test("the sewers are built: narrow channels, a few larger chambers, straight walls", () => {
  let channels = 0;
  let chambers = 0;
  for (const w of worlds) for (const b of Object.values(w.areas)) {
    if (b.kind !== "building" || b.type !== "sewer") continue;
    for (const r of childrenOf(w, b.id)) {
      if (!r.layout || r.tags.some((t) => t.startsWith("form:"))) continue;
      assert.equal(r.layout.mask, undefined, `${r.name}: a sewer room is not organic`);
      const narrow = Math.min(r.layout.width, r.layout.height);
      if (/channel|outfall/i.test(r.name)) { channels++; assert.ok(narrow >= 2 && narrow <= 6, `${r.name} is ${narrow} squares wide`); }
      if (/junction|pump|cistern/i.test(r.name)) { chambers++; assert.ok(narrow >= 5, `${r.name} is only ${narrow} wide`); }
    }
  }
  assert.ok(channels > 0 && chambers > 0, `${channels} channels, ${chambers} chambers`);
});

test("the districts of a city planet meet at speeder platforms, not gates", () => {
  let platforms = 0;
  for (const w of worlds) for (const s of Object.values(w.areas)) {
    if (s.kind !== "settlement" || !onUrban(w, s) || !["city", "town"].includes(s.type)) continue;
    const buildings = childrenOf(w, s.id).filter((b) => b.kind === "building" && !b.tags.some((t) => t.startsWith("site:")));
    assert.ok(!buildings.some((b) => /^(city|town) gate$/.test(b.type)), `${s.name}: a gate on a city planet`);
    const mine = buildings.filter((b) => b.type === "speeder platform");
    assert.ok(mine.some((b) => b.gateway), `${s.name}: no platform is its way in`);
    platforms += mine.length;
  }
  assert.ok(platforms >= 2);
});

test("buildings of a city planet are towers of stacked rooms more than other worlds'", () => {
  const share = (urban: boolean) => {
    let stacked = 0;
    let rooms = 0;
    for (const w of worlds) for (const r of Object.values(w.areas)) {
      if (r.kind !== "room" || !r.layout || r.tags.some((t) => t.startsWith("form:")) || onUrban(w, r) !== urban) continue;
      const b = w.areas[r.parentId!];
      if (!b || ["cave", "ruin", "wreck", "camp", "trailhead", "sewer", "sewer access"].includes(b.type)) continue;
      rooms++;
      // (every column has a floor over its ground room since the stair blocks, 2026-10-20: a tower is two floors or more over it)
      if (r.tags.some((t) => t.startsWith("stack:")) && (r.layout.level ?? 0) >= 2) stacked++;
    }
    return stacked / Math.max(1, rooms);
  };
  assert.ok(share(true) > share(false) * 1.1, `${share(true).toFixed(3)} of rooms two floors up or more on city planets, ${share(false).toFixed(3)} elsewhere`);
});

test("a settlement on a city planet is called a district", () => {
  const w = worlds[0];
  const urban = Object.values(w.areas).find((a) => a.kind === "settlement" && onUrban(w, a))!;
  const other = Object.values(w.areas).find((a) => a.kind === "settlement" && !onUrban(w, a))!;
  assert.equal(kindLabel(w, urban), "district");
  assert.equal(kindLabel(w, other), "settlement");
  assert.equal(kindLabel(w, w.areas[urban.parentId!]), "planet");
});
