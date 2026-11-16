// Aiming down the sights and the scope, played in a real browser (2026-11-15): for each gun (pistol, rifle, sniper rifle, a rifle with a scope fitted) in first person and over the shoulder, a screenshot of the hip, the iron sights, 2x, 4x and 6x, with the view numbers read back (zoom, ads, scope picture, reticle, gun position on screen).
// Needs a server on BASE with the test database (VITE_TEST_MENU=1 npx tsx server/index.ts). Usage: BASE=http://127.0.0.1:5103 [VIEW=phone] [GUNS="Blaster pistol,Sniper rifle"] node e2e/ads.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const say = (...a) => console.log(...a);
const PHONE = process.env.VIEW === "phone";
const GUNS = (process.env.GUNS || "Blaster pistol,Blaster rifle,Sniper rifle,Blaster rifle+scope").split(",");
const { browser, page, events } = await open();
const made = { chars: [], camps: [] };
try {
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const hostile = (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && o.count >= 1 && !/droid/i.test(o.creature || ""));
  const room = (process.env.ROOM && world.areas[process.env.ROOM]) || Object.values(world.areas).find(hostile);
  if (!room) throw new Error("no hostile room");
  for (const gunSpec of GUNS) {
    const [gunName, extra] = gunSpec.split("+");
    const tag = gunSpec.replace(/\W+/g, "-").toLowerCase() + (PHONE ? "-phone" : "-desk");
    const ch = (await api("POST", "/api/characters", {
      name: "Ads Smoke", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
      abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30,
      equipment: [gunName, "Power cell", "Power cell", "Power cell", "Combat suit"],
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
    })).json;
    made.chars.push(ch.id);
    const camp = await api("POST", "/api/campaigns", {
      characterId: ch.id, name: "Ads Smoke " + Date.now(), description: "smoke", npcs: [], locations: [], quests: [], startingLocation: "start",
      currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
    });
    if (camp.status !== 201) throw new Error(camp.text.slice(0, 300));
    made.camps.push(camp.json.id);
    await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Ads Smoke" }).waitFor({ timeout: 120000 });
    await page.waitForTimeout(8000);
    if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const held = (k, on) => page.evaluate(async ([key, v]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); v ? s.down(key) : s.up(key); }, [k, on]);
    const hud = () => page.evaluate(async () => { const h = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().hud; return { gun: h.gun, ads: +h.ads.toFixed(2), zoom: +h.zoom.toFixed(2), scope: h.scope, optic: h.optic, left: h.left, hasGun: h.hasGun }; });
    const view = () => page.evaluate(async () => { const s = (await import("/src/components/Map/interiors/aim.ts")).useView.getState(); return s.mode; });
    const look = () => page.evaluate(() => {
      const s = window.__shooter; if (!s) return null; const me = s.units.find((u) => u.side === "player"); const foe = s.units.find((u) => u.side === "foe" && !u.dead);
      for (const u of s.units) { if (u.side === "player") u.hp = u.maxHp = 9999; else { u.hp = u.maxHp = 9999; u.speed = 0.01; u.volley = 1; u.cooldown = 99; } }
      if (!foe || !me) return null; window.__look(Math.atan2(foe.x - me.x, foe.y - me.y), -0.03); return +Math.hypot(foe.x - me.x, foe.y - me.y).toFixed(1);
    });
    if (extra) await page.evaluate((n) => { const me = window.__shooter.units.find((u) => u.side === "player"); me.gun.optic = { name: n, zoom: 3 }; }, "Brutal scope");
    say(`== ${gunSpec} (${PHONE ? "phone" : "desktop"}) view=${await view()} foe at`, await look(), "ft(sq)");
    for (const mode of ["first", "shoulder"]) {
      for (let i = 0; i < 4 && (await view()) !== (mode === "first" ? "first" : "shoulder"); i++) { await page.keyboard.press("KeyV"); await page.waitForTimeout(500); }
      say(" view:", await view());
      await look(); await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/ads-${tag}-${mode}-1hip.png`, timeout: 120000 });
      say("  hip:", JSON.stringify(await hud()));
      const zooms = extra ? [3] : [null];
      for (const z of zooms) {
        await held("sights", true); await look(); await page.waitForTimeout(1600); await look();
        await page.screenshot({ path: `${OUT}/ads-${tag}-${mode}-2aim.png`, timeout: 120000 });
        say("  aimed:", JSON.stringify(await hud()));
        // fire while aimed: the bolt goes where the crosshair is
        await held("fire", true); await page.waitForTimeout(500); await look(); await page.screenshot({ path: `${OUT}/ads-${tag}-${mode}-3fire.png`, timeout: 120000 }); await held("fire", false);
        await held("sights", false); await page.waitForTimeout(900);
        say("  released:", JSON.stringify(await hud()));
      }
      if (!extra && gunName !== "Blaster pistol") for (const zoom of [2, 4, 6]) {
        await page.evaluate((zz) => { const me = window.__shooter.units.find((u) => u.side === "player"); me.gun.optic = { name: "Test scope", zoom: zz }; }, zoom);
        await held("sights", true); await look(); await page.waitForTimeout(1600); await look();
        await page.screenshot({ path: `${OUT}/ads-${tag}-${mode}-4x${zoom}.png`, timeout: 120000 });
        say(`  scope x${zoom}:`, JSON.stringify(await hud()));
        await held("sights", false); await page.waitForTimeout(700);
      }
    }
    await api("DELETE", `/api/campaigns/${made.camps.pop()}`).catch(() => {});
    await api("DELETE", `/api/characters/${made.chars.pop()}`).catch(() => {});
  }
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/ads-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
