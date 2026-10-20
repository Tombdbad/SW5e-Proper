// The stairs taken by tapping them on the 3D map (2026-10-20), as a player does: up the flight to a mezzanine and down again, and
// through a stair block (host -> switchback up -> the room over the host and back; host -> switchback down -> the basement and back;
// host -> hall and back).
// Each tap is on the thing itself, where the map draws it (window.__map3d), and the HUD must then say the party is in the next room.
// Self-contained (makes and deletes its own character and campaigns). Not the play-through: one building of each, a few minutes.
// Usage: BASE=http://127.0.0.1:5002 node e2e/stairs.mjs
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
  await page.screenshot({ path: `${OUT}/stairs-fail.png` });
  throw new Error(`tapped ${asset.name}: the party is in "${await here()}", not ${expect}`);
};
const doorTo = (room, to) => room.layout.assets.find((a) => (a.kind === "door" || a.kind === "stairs") && a.to === to.id);
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
  for (let seed = 1; seed <= 40 && !(gallery && block); seed++) {
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
  if (!gallery || !block) throw new Error(`no ${!gallery ? "gallery" : "stair block"} in 40 worlds`);

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
  console.log("PASS: every flight and door taken by tapping it");
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
