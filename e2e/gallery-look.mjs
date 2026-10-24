// The mezzanine's balustrade as a player sees it (2026-10-24): up the stairs to a gallery over a main bar, then a shot from the
// overhead view and one in first person, standing on the gallery. The balustrade should stand waist high to a figure, with the room
// below open to the ceiling; not a wall that rises to the roof. Self-contained (makes and deletes its own character and campaign).
// Usage: BASE=http://127.0.0.1:5002 node e2e/gallery-look.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, browser } = ctx;
await page.setViewportSize({ width: Number(process.env.W || 900), height: Number(process.env.H || 600) });
const NAME = "Gallery " + Date.now().toString(36);
const made = [];
const camps = [];
const here = () => page.evaluate(() => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent ?? "");
const doorTo = (room, to) => room.layout.assets.find((a) => (a.kind === "door" || a.kind === "stairs") && a.to === to.id);

try {
  const c = (await api("POST", "/api/characters", {
    name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
  })).json;
  made.push(c.id);
  let gallery;
  for (let seed = 1; seed <= 40 && !gallery; seed++) {
    const world = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
    const areas = Object.values(world.areas);
    const g = areas.find((a) => a.kind === "room" && a.layout && a.tags.includes("form:gallery"));
    const host = g && world.areas[g.tags.find((t) => t.startsWith("host:")).slice(5)];
    if (host && doorTo(host, g) && doorTo(g, host)) {
      for (const r of areas.filter((a) => a.parentId === host.parentId)) r.occupants = (r.occupants || []).filter((o) => o.disposition !== "hostile");
      gallery = { world, host, g, seed };
    }
  }
  if (!gallery) throw new Error("no gallery in 40 worlds");
  const camp = (await api("POST", "/api/campaigns", { characterId: c.id, name: NAME, description: "gallery", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: gallery.host.id, galaxyMap: gallery.world, timeElapsed: { total: 0 } })).json;
  camps.push(camp.id);
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(Number(process.env.SETTLE || 45000));
  console.log(`gallery of seed ${gallery.seed}: ${gallery.g.name} over ${gallery.host.name} (party in "${await here()}")`);
  // Tap the stairs (or door) up to the gallery where the map draws it
  const asset = doorTo(gallery.host, gallery.g);
  for (let tries = 0; tries < 3; tries++) {
    const at = await page.evaluate((id) => window.__map3d?.at(`asset:${id}`) ?? null, asset.id);
    if (!at) throw new Error(`${asset.name}: not on the map`);
    await page.mouse.click(at.x, at.y);
    const ok = await page.waitForFunction((name) => document.querySelector('[data-testid="play-here"] .font-semibold')?.textContent === name, gallery.g.name, { timeout: 60000 }).then(() => true).catch(() => false);
    if (ok) break;
  }
  await page.waitForTimeout(8000);
  console.log(`party now in "${await here()}"`);
  await page.screenshot({ path: `${OUT}/gallery-overhead.png` });
  // The view button cycles overhead, shoulder and first person
  const view = page.locator("button", { hasText: /View:/ });
  for (let i = 0; i < 3 && !(await view.textContent())?.includes("First person"); i++) await view.click();
  await page.waitForTimeout(6000);
  console.log(`view: ${await view.textContent()}`);
  await page.screenshot({ path: `${OUT}/gallery-first.png` });
} finally {
  for (const id of camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await browser.close();
}
