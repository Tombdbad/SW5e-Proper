// The shooter's later work in a real browser (2026-10-29): powers on keys 1-4 (damage, push, heal) spending points, crouching (the stance and a smaller mark), a foe
// put in a wall is brought out and fights, a foe behind a wall finds the door, and the fight can be begun again after a defeat. Usage: BASE=http://127.0.0.1:5099 node e2e/shooter-extras.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
import fs from "fs";

const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const powers = JSON.parse(fs.readFileSync("shared/data/sw5e/powers.json", "utf8"));
  const pick = (name) => powers.find((p) => p.name === name && p.powerType === "Force");
  const known = ["Burst", "Force Push/Pull", "Heal"].map(pick).filter(Boolean);
  say("powers:", known.map((p) => `${p.name} (L${p.level})`).join(", "));
  const ch = (await api("POST", "/api/characters", {
    name: "Extras Check", species: "human", class: "consular", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 12, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 16, charisma: 10 },
    maxHp: 40, currentHp: 20, maxForcePoints: 12, currentForcePoints: 12, armorClass: 15, speed: 30, forcePowers: known,
    equipment: ["Blaster pistol", "Power cell", "Power cell", "Lightsaber", "Combat suit"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["wisdom"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const hostile = (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && !/droid/i.test(o.creature || ""));
  const room = Object.values(world.areas).find(hostile);
  const camp = await api("POST", "/api/campaigns", {
    characterId: ch.id, name: "Extras Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
  });
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "shoulder"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Extras Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);
  const press = (k, ms = 150) => page.evaluate(async ([key, t]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); s.down(key); await new Promise((r) => setTimeout(r, t)); s.up(key); }, [k, ms]);
  const hud = () => page.evaluate(async () => { const h = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().hud; return { hp: h.hp, points: h.points, powers: h.powers, crouching: h.crouching, note: h.note }; });
  const stance = () => page.evaluate(async () => +(await import("/src/components/Map/interiors/aim.ts")).stance.k.toFixed(2));
  const foes = () => page.evaluate(() => window.__shooter.units.filter((u) => u.side === "foe").map((u) => ({ hp: Math.round(u.hp), x: +u.x.toFixed(1), y: +u.y.toFixed(1), mode: u.mode })));
  const face = () => page.evaluate(() => { const s = window.__shooter; const me = s.units.find((u) => u.side === "player"); const f = s.units.find((u) => u.side === "foe" && !u.dead); window.__look(Math.atan2(f.x - me.x, f.y - me.y), -0.05); return +Math.hypot(f.x - me.x, f.y - me.y).toFixed(1); });

  // (in the shooter mode a hostile with its weapons out starts the fight by itself: the button is only there when it has not)
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(3000);
  // a long fight: the foe is tanky and still, the party cannot die
  await page.evaluate(() => { for (const u of window.__shooter.units) { if (u.side === "player") u.maxHp = 9999, u.hp = 5000; else if (u.side === "foe") { u.hp = u.maxHp = 600; u.speed = 0.01; u.volley = 1; } } });
  say("hud:", JSON.stringify(await hud()));
  say("distance:", await face());
  await page.waitForTimeout(500);
  await face();
  await page.waitForTimeout(500);
  const hp0 = (await foes())[0].hp;
  say("before Burst:", JSON.stringify(await page.evaluate(() => { const p = window.__shooter.units.find((u) => u.side === "player"); return { facing: p.facing, cd: p.powerCd, pts: p.points, n: p.powers?.length, x: p.x, y: p.y, p0: p.powers?.[0] }; })));
  await press("power0");
  await page.waitForTimeout(400);
  say("after Burst:", JSON.stringify(await page.evaluate(() => { const p = window.__shooter.units.find((u) => u.side === "player"); return { cd: p.powerCd, pts: p.points }; })));
  say("Burst:", hp0, "->", (await foes())[0].hp, JSON.stringify(await hud()));
  await page.screenshot({ path: `${OUT}/extras-1-power.png`, timeout: 120000 });
  // the heal: after being hurt
  await page.evaluate(() => { const me = window.__shooter.units.find((u) => u.side === "player"); me.hp = 4000; me.powerCd = 0; });
  await page.waitForTimeout(1200);
  await press("power2");
  await page.waitForTimeout(300);
  say("Heal:", JSON.stringify(await page.evaluate(() => window.__shooter.units.find((u) => u.side === "player").hp)), JSON.stringify(await hud()));
  // the push
  await page.evaluate(() => { window.__shooter.units.find((u) => u.side === "player").powerCd = 0; });
  await face();
  const before = (await foes())[0];
  await press("power1");
  await page.waitForTimeout(900);
  say("Push:", JSON.stringify(before), "->", JSON.stringify((await foes())[0]));
  // crouching
  await press("crouch");
  await page.waitForTimeout(700);
  say("crouch:", await stance(), JSON.stringify((await hud()).crouching));
  await page.screenshot({ path: `${OUT}/extras-2-crouch.png`, timeout: 120000 });
  await press("crouch");
  await page.waitForTimeout(700);
  say("up again:", await stance());
  // a foe put in a wall (far outside the room) is brought out
  await page.evaluate(() => { const f = window.__shooter.units.find((u) => u.side === "foe"); f.x -= 3; f.y -= 3; f.speed = 4; });
  const stuck = (await foes())[0];
  await page.waitForTimeout(2500);
  const freed = (await foes())[0];
  say("in the wall:", JSON.stringify(stuck), "->", JSON.stringify(freed));
  await page.screenshot({ path: `${OUT}/extras-3-after.png`, timeout: 120000 });
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/extras-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
