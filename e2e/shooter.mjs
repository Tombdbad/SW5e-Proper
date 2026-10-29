// The shooter mode in a real browser (2026-10-29): mode saved and honoured, no overhead view, a real-time fight on the walkable map (fire, reload from the pack, grenade, saber, guard), and the end settled by the game (xp, ammunition and grenades used up). Needs a dev server on BASE with the test database (VITE_TEST_MENU=1 npx tsx server/index.ts with PORT and DATABASE_URL set to sw5e_test). Usage: BASE=http://127.0.0.1:5099 node e2e/shooter.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const ch = (await api("POST", "/api/characters", {
    name: "Shooter Smoke", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
    maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30,
    equipment: ["Blaster rifle", "Power cell", "Power cell", "Power cell", "Grenade, corrosive", "Grenade, corrosive", "Lightsaber", "Combat suit"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const hostile = (ranged) => (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && o.count >= 1 && !/droid/i.test(o.creature || "") && (!ranged || o.attack?.ranged));
  const room = Object.values(world.areas).find(hostile(true)) ?? Object.values(world.areas).find(hostile(false));
  if (!room) throw new Error("no hostile room");
  say("room:", room.name, "hostiles:", room.occupants.filter((o) => o.disposition === "hostile").map((o) => `${o.name} x${o.count}`).join(", "));
  const camp = await api("POST", "/api/campaigns", {
    characterId: ch.id, name: "Shooter Smoke " + Date.now(), description: "smoke", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
  });
  if (camp.status !== 201) throw new Error(camp.text.slice(0, 300));
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Shooter Smoke" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);

  const state = () => page.evaluate(async () => {
    const c = await import("/src/lib/stores/useCombat.ts"); const s = await import("/src/components/Map/interiors/shoot.ts");
    const k = c.useCombat.getState(); const sh = s.useShoot.getState(); const sim = window.__shooter;
    return { inCombat: k.inCombat, realtime: k.realtime, outcome: k.outcome, session: !!sh.session, hud: sh.hud, time: sim ? +sim.time.toFixed(1) : null };
  });
  const hud = async () => { const h = (await state()).hud; return { hp: h.hp, left: h.left, mag: h.mag, reserve: h.reserve, reloading: h.reloading, grenades: h.grenades, weapon: h.weapon, foes: h.foes, focus: h.focus, blocking: h.blocking }; };
  const held = (k, on) => page.evaluate(async ([key, v]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); v ? s.down(key) : s.up(key); }, [k, on]);
  const press = async (k, ms = 120) => { await held(k, true); await page.waitForTimeout(ms); await held(k, false); };
  const foeHp = () => page.evaluate(() => Math.round(window.__shooter.units.filter((u) => u.side === "foe").reduce((n, u) => n + Math.max(0, u.hp), 0)));
  const lookAtFoe = () => page.evaluate(() => {
    const s = window.__shooter; const me = s.units.find((u) => u.side === "player"); const foe = s.units.find((u) => u.side === "foe" && !u.dead);
    if (!foe) return null; const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    window.__look(Math.atan2(foe.x - me.x, foe.y - me.y), -0.05); return +d.toFixed(2);
  });

  say("mode dialog shown:", await page.getByTestId("mode-dialog").count(), "| mode button:", (await page.getByTestId("mode-toggle").textContent())?.trim());
  const view = () => page.evaluate(async () => { const s = (await import("/src/components/Map/interiors/aim.ts")).useView.getState(); return `${s.mode}${s.shooter ? " (shooter: no overhead)" : ""}`; });
  say("view with an 'overhead' preference stored:", await view());
  for (let i = 0; i < 3; i++) await page.keyboard.press("KeyV");
  say("after three V presses:", await view());

  await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click();
  await page.waitForTimeout(3000);
  say("fight started:", JSON.stringify({ ...(await state()), hud: await hud() }));
  // a long fight: the party cannot die, the foe is tanky and still
  await page.evaluate(() => { for (const u of window.__shooter.units) { if (u.side === "player") u.hp = u.maxHp = 9999; else if (u.side === "foe") { u.hp = u.maxHp = 600; u.speed = 0.01; u.volley = 1; } } });
  say("distance to the foe:", await lookAtFoe());
  const hp0 = await foeHp();
  await held("fire", true);
  const seen = [];
  for (let i = 0; i < 36; i++) { await lookAtFoe(); await page.waitForTimeout(300); const h = await hud(); seen.push(h.reloading ? "R" : h.left); }
  await held("fire", false);
  say("magazine over time (R = reloading):", seen.join(" "));
  say("foe hp", hp0, "->", await foeHp(), "|", JSON.stringify(await hud()));
  await page.screenshot({ path: `${OUT}/shooter-2-firing.png`, timeout: 120000 });
  await press("grenade"); await page.waitForTimeout(2600);
  say("after a grenade:", JSON.stringify(await hud()), "foe hp", await foeHp());
  await press("swap"); await page.waitForTimeout(400);
  say("after a swap:", JSON.stringify(await hud()));
  const before = await foeHp();
  await held("fire", true);
  for (let i = 0; i < 12; i++) { await lookAtFoe(); await page.waitForTimeout(250); }
  await held("fire", false);
  say("saber swings: foe hp", before, "->", await foeHp());
  await held("block", true); await page.waitForTimeout(500);
  say("guarding:", JSON.stringify(await hud()));
  await page.screenshot({ path: `${OUT}/shooter-3-guard.png`, timeout: 120000 });
  await held("block", false);
  // over the shoulder: the figure, and a swing
  await page.keyboard.press("KeyV");
  say("view now:", await view());
  await page.waitForTimeout(800);
  await held("fire", true);
  for (let i = 0; i < 3; i++) { await lookAtFoe(); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/shooter-3b-shoulder-${i}.png`, timeout: 120000 }).catch(() => {}); }
  await held("fire", false);
  await press("swap"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/shooter-3c-shoulder-gun.png`, timeout: 120000 });

  // the end: every foe down
  await page.evaluate(() => { for (const u of window.__shooter.units) if (u.side === "foe") { u.hp = 0; u.dead = true; } });
  await page.waitForTimeout(7000);
  const end = await state();
  say("after the foes fell:", JSON.stringify({ inCombat: end.inCombat, realtime: end.realtime, outcome: end.outcome, session: end.session }));
  await page.waitForTimeout(3500);
  const saved = (await api("GET", `/api/characters/${ch.id}`)).json;
  say("saved: xp", saved.experience, "| equipment", JSON.stringify(saved.equipment), "| loads", JSON.stringify(saved.playState?.loads));
  await page.screenshot({ path: `${OUT}/shooter-4-won.png`, timeout: 120000 });
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/shooter-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
