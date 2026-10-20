// The stairs taken by tapping them on the 3D map (2026-10-20), as a player does: up the flight to a mezzanine and down again, and
// through a stair block (host -> switchback up -> the room over the host and back; host -> switchback down -> the basement and back;
// host -> hall and back).
// Each tap is on the thing itself, where the map draws it (window.__map3d), and the HUD must then say the party is in the next room.
// Self-contained (makes and deletes its own character and campaigns). Not the play-through: one building of each, a few minutes.
// Then the ways in from outside (2026-10-20): down from a roof by its stairs; in through a window from the street; up to a balcony
// and in by its patio doors (a climb, rolled in the check dialog, tried again until it succeeds).
// Usage: BASE=http://127.0.0.1:5002 node e2e/stairs.mjs   (ONLY=outside for the second part alone)
import { open, api, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, events, browser } = ctx;
await page.setViewportSize({ width: Number(process.env.W || 900), height: Number(process.env.H || 600) });
const NAME = "Stairs " + Date.now().toString(36);
const made = [];
const camps = [];
let failed = false;
const here = () => page.evaluate(() => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent ?? "");
// Tap an asset of a room (by its id) where the map draws it, then wait for the HUD to name the room it leads to
const tap = async (asset, expect) => {
  const t0 = Date.now();
  for (let tries = 0; tries < 3; tries++) {
    const at = await page.evaluate((id) => window.__map3d?.at(`asset:${id}`) ?? null, asset.id);
    if (!at) throw new Error(`${asset.name}: not on the map`);
    await page.mouse.click(at.x, at.y);
    const ok = await page.waitForFunction((name) => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent === name, expect, { timeout: 60000 }).then(() => true).catch(() => false);
    if (ok) {
      console.log(`  ${asset.name} -> ${expect} (${((Date.now() - t0) / 1000).toFixed(0)} s${tries ? `, tap ${tries + 1}` : ""})`);
      // (the new room's scene: let its first frame be drawn before the next tap)
      await page.waitForTimeout(8000);
      return;
    }
  }
  await page.screenshot({ path: `${OUT}/stairs-fail.png`, timeout: 60000 }).catch(() => {});
  throw new Error(`tapped ${asset.name}: the party is in "${await here()}", not ${expect}`);
};
const doorTo = (room, to) => room.layout.assets.find((a) => (a.kind === "door" || a.kind === "stairs") && a.to === to.id);
// Tap a point of the map (a key the map probe knows), then wait for the HUD to name a room; a check dialog that comes up is rolled
const tapUntil = async (key, expect, what, tries = 6) => {
  const t0 = Date.now();
  for (let n = 0; n < tries; n++) {
    const at = await page.evaluate((k) => window.__map3d?.at(k) ?? null, key);
    if (!at) throw new Error(`${what}: not on the map`);
    await page.mouse.click(at.x, at.y);
    if (n === 0 && process.env.SHOT) await page.screenshot({ path: `${OUT}/tap-${what.replace(/\W+/g, "-")}.png`, timeout: 60000 }).catch(() => {});
    const roll = page.locator('[data-testid="check-roll"]');
    if (await roll.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) await roll.click();
    const ok = await page.waitForFunction((name) => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent === name, expect, { timeout: 30000 }).then(() => true).catch(() => false);
    if (ok) {
      console.log(`  ${what} -> ${expect} (${((Date.now() - t0) / 1000).toFixed(0)} s${n ? `, try ${n + 1}` : ""})`);
      await page.waitForTimeout(8000);
      return;
    }
  }
  await page.screenshot({ path: `${OUT}/stairs-fail.png`, timeout: 60000 }).catch(() => {});
  throw new Error(`${what}: the party is in "${await here()}", not ${expect}`);
};
const play = async (world, start) => {
  const camp = (await api("POST", "/api/campaigns", { characterId: made[0], name: NAME, description: "stairs", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: start.id, galaxyMap: world, timeElapsed: { total: 0 } })).json;
  camps.push(camp.id);
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(Number(process.env.SETTLE || 45000));
  if ((await here()) !== start.name) throw new Error(`the game started in "${await here()}", not ${start.name}`);
};
try {
  const c = (await api("POST", "/api/characters", {
    name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
  })).json;
  made.push(c.id);
  // A main bar with a gallery, and a stair block whose ways into the rooms over and under its host are neither locked nor hidden
  let gallery, block;
  for (let seed = 1; seed <= 40 && !(gallery && block) && !["outside", "balcony"].includes(process.env.ONLY); seed++) {
    const world = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
    const areas = Object.values(world.areas);
    const calm = (b) => { for (const r of areas.filter((a) => a.parentId === b)) r.occupants = (r.occupants || []).filter((o) => o.disposition !== "hostile"); };
    if (!gallery) {
      const g = areas.find((a) => a.kind === "room" && a.layout && a.tags.includes("form:gallery"));
      const host = g && world.areas[g.tags.find((t) => t.startsWith("host:")).slice(5)];
      if (host && doorTo(host, g) && doorTo(g, host)) { calm(host.parentId); gallery = { world, host, g }; }
    }
    if (!block) {
      for (const hall of areas.filter((a) => a.tags.includes("lane:hall"))) {
        const hostId = hall.tags.find((t) => t.startsWith("block:")).slice(6);
        const host = world.areas[hostId];
        const parts = areas.filter((a) => a.tags.includes(`block:${hostId}`));
        const up = parts.find((a) => a.tags.includes("storey:0"));
        const down = parts.find((a) => a.tags.includes("storey:-1"));
        const over = areas.find((a) => a.tags.includes(`stack:${hostId}`));
        const under = areas.find((a) => a.tags.includes(`under:${hostId}`));
        const plain = (a, b) => !world.paths.some((p) => ((p.from === a.id && p.to === b.id) || (p.from === b.id && p.to === a.id)) && (p.locked || p.hidden));
        if (up && down && over && under && plain(up, over) && plain(down, under)) { calm(host.parentId); block = { world, host, hall, up, down, over, under }; break; }
      }
    }
  }
  if (!["outside", "balcony"].includes(process.env.ONLY) && (!gallery || !block)) throw new Error(`no ${!gallery ? "gallery" : "stair block"} in 40 worlds`);
  if (!["outside", "balcony"].includes(process.env.ONLY)) {
  console.log(`mezzanine: ${gallery.host.name} and its ${gallery.g.name}`);
  await play(gallery.world, gallery.host);
  await tap(doorTo(gallery.host, gallery.g), gallery.g.name);
  await tap(doorTo(gallery.g, gallery.host), gallery.host.name);

  const { host, hall, up, down, over, under } = block;
  console.log(`stair block: ${host.name}, over it ${over.name}, under it ${under.name}`);
  await play(block.world, host);
  await tap(doorTo(host, up), up.name);
  await tap(doorTo(up, over), over.name);
  await tap(doorTo(over, up), up.name);
  await tap(doorTo(up, host), host.name);
  await tap(doorTo(host, down), down.name);
  await tap(doorTo(down, under), under.name);
  await tap(doorTo(under, down), down.name);
  await tap(doorTo(down, host), host.name);
  await tap(doorTo(host, hall), hall.name);
  await tap(doorTo(hall, host), host.name);
  }

  // The ways in from outside. (The ways are opened for the test: a lock or a sensor would want rolls of its own.)
  let roofWay, windowWay, balconyWay;
  for (let seed = 1; seed <= 40 && !(roofWay && windowWay && balconyWay); seed++) {
    const world = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
    const areas = Object.values(world.areas);
    const calm = (b) => { for (const r of areas.filter((a) => a.parentId === b || a.id === b)) r.occupants = (r.occupants || []).filter((o) => o.disposition !== "hostile"); };
    const unlock = (a, b) => { for (const p of world.paths) if ((p.from === a.id && p.to === b.id) || (p.from === b.id && p.to === a.id)) { delete p.locked; delete p.hidden; delete p.alarmed; } };
    if (!roofWay) {
      const stairs = areas.find((a) => a.name === "Stairs up to the roof");
      const roof = stairs && areas.find((a) => a.tags.includes("form:roof") && a.layout?.assets.some((d) => d.to === stairs.id));
      const top = stairs && areas.find((a) => a.id !== roof?.id && a.layout?.assets.some((d) => d.kind === "door" && d.to === stairs.id));
      if (roof && top) { unlock(stairs, roof); unlock(stairs, top); calm(roof.parentId); roofWay = { world, roof, stairs, top }; }
    }
    if (!windowWay) {
      // (the windows of one building that can be climbed through, opened; tried in turn, the ones facing the camera first)
      const rooms = areas.filter((a) => a.kind === "room" && a.layout && !a.tags.some((t) => t.startsWith("form:")) && (a.layout.level ?? 0) === 0 && world.districtPlans && Object.values(world.districtPlans).some((d) => d.boxes[a.parentId]));
      // (the overhead camera looks from the south-west: a window on a south or west wall is in its sight)
      const building = rooms.find((room) => room.layout.assets.some((w) => w.kind === "window" && (w.side === "s" || w.side === "w") && (w.pane?.size === "large" || w.pane?.size === "wide")))?.parentId;
      if (building) {
        const wins = rooms.filter((r) => r.parentId === building).flatMap((room) => room.layout.assets.filter((w) => w.kind === "window" && (w.pane?.size === "large" || w.pane?.size === "wide")).map((win) => ({ room, win })));
        for (const { win } of wins) win.pane = { ...win.pane, latch: "open", alarmed: false };
        calm(building);
        windowWay = { world, wins: wins.sort((p, q) => "swen".indexOf(p.win.side) - "swen".indexOf(q.win.side)).slice(0, 4), building: world.areas[building] };
      }
    }
    if (!balconyWay) {
      const balcony = areas.find((a) => a.tags.includes("form:balcony"));
      if (balcony) {
        const doors = balcony.layout.assets.find((d) => d.kind === "door");
        const room = world.areas[doors.to];
        unlock(balcony, room);
        calm(balcony.parentId);
        balconyWay = { world, balcony, room, climb: balcony.layout.assets.find((d) => d.kind === "exit"), building: world.areas[balcony.parentId] };
      }
    }
  }
  if (!roofWay || !windowWay || !balconyWay) throw new Error(`no ${!roofWay ? "roof with stairs" : !windowWay ? "window to climb through" : "balcony"} in 40 worlds`);

  if (process.env.ONLY !== "balcony") {
  console.log(`roof: ${roofWay.roof.name} of ${roofWay.world.areas[roofWay.roof.parentId].name}, down to ${roofWay.top.name}`);
  await play(roofWay.world, roofWay.roof);
  await tap(doorTo(roofWay.roof, roofWay.stairs), roofWay.stairs.name);
  await tap(doorTo(roofWay.stairs, roofWay.top), roofWay.top.name);

  console.log(`window: from the street in front of ${windowWay.building.name}`);
  await play(windowWay.world, windowWay.building);
  {
    let inside = null;
    for (const { room, win } of windowWay.wins) {
      // Walk to the street square outside it, then tap the window
      const l = room.layout;
      const out = { x: l.x + win.x + (win.side === "e" ? 1 : win.side === "w" ? -1 : 0), y: l.y + win.y + (win.side === "s" ? 1 : win.side === "n" ? -1 : 0) };
      const sq = await page.evaluate((k) => window.__map3d?.at(k) ?? null, `sq:${out.x},${out.y}`);
      if (sq) await page.mouse.click(sq.x, sq.y);
      await page.waitForTimeout(6000);
      const at = await page.evaluate((id) => window.__map3d?.at(`asset:${id}`) ?? null, win.id);
      if (!at) continue;
      await page.mouse.click(at.x, at.y);
      const climb = page.locator('[data-testid="window-climb"]');
      if (!(await climb.waitFor({ timeout: 25000 }).then(() => true).catch(() => false))) {
        console.log(`  (the ${win.name.toLowerCase()} of ${room.name} on its ${win.side} wall was not to be tapped from where the camera is)`);
        await page.keyboard.press("Escape").catch(() => {});
        continue;
      }
      await climb.click();
      await page.waitForFunction((name) => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent === name, room.name, { timeout: 60000 });
      console.log(`  ${win.name} (${win.side} wall), Climb in -> ${room.name}`);
      inside = room;
      await page.waitForTimeout(8000);
      break;
    }
    if (!inside) {
      await page.screenshot({ path: `${OUT}/stairs-fail.png`, timeout: 60000 }).catch(() => {});
      throw new Error(`no window of ${windowWay.building.name} could be climbed through by tapping it (the party is in "${await here()}")`);
    }
  }
  }

  console.log(`balcony: off ${balconyWay.room.name} of ${balconyWay.building.name}`);
  await play(balconyWay.world, balconyWay.building);
  {
    const l = balconyWay.balcony.layout;
    const c = balconyWay.climb;
    const foot = { x: l.x + c.x + (c.side === "e" ? 1 : c.side === "w" ? -1 : 0), y: l.y + c.y + (c.side === "s" ? 1 : c.side === "n" ? -1 : 0) };
    // The trellis's foot, tapped where it is in view; where it is not (the camera follows the party, and a palace is large) the
    // same climb from the list of ways on (the HUD), which runs the same rules (the climb is rolled in the check dialog)
    const at = await page.evaluate((k) => window.__map3d?.at(k) ?? null, `sq:${foot.x},${foot.y}`);
    const box = await page.locator("canvas").first().boundingBox();
    const inView = at && box && at.x > box.x + 10 && at.x < box.x + box.width - 10 && at.y > box.y + 10 && at.y < box.y + box.height - 10;
    if (inView) await tapUntil(`sq:${foot.x},${foot.y}`, balconyWay.balcony.name, "Climb to the balcony");
    else {
      const t0 = Date.now();
      let ok = false;
      for (let n = 0; n < 6 && !ok; n++) {
        await page.getByRole("button", { name: /^Climb up to Balcony/ }).first().click();
        const roll = page.locator('[data-testid="check-roll"]');
        if (await roll.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) await roll.click();
        ok = await page.waitForFunction((name) => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent === name, balconyWay.balcony.name, { timeout: 30000 }).then(() => true).catch(() => false);
      }
      if (!ok) throw new Error(`Climb up to Balcony (from the list of ways): the party is in "${await here()}"`);
      console.log(`  Climb up to Balcony (from the list of ways; the trellis is out of view) -> Balcony (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      // (the palace's district is a great deal to draw in software: the camera's move up to the balcony takes a while)
      await page.waitForTimeout(Number(process.env.SETTLE || 45000));
      if (process.env.SHOT) await page.screenshot({ path: `${OUT}/on-balcony.png`, timeout: 60000 }).catch(() => {});
    }
    await tap(doorTo(balconyWay.balcony, balconyWay.room), balconyWay.room.name);
  }
  console.log("PASS: every flight and door taken by tapping it, and the ways in from outside");
} catch (e) {
  failed = true;
  console.log(`FAIL: ${e.message}`);
} finally {
  for (const id of camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL/i.test(e)) console.log(e);
  await browser.close();
  process.exit(failed ? 1 : 0);
}
