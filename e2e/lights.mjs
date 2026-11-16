// Light and signs, looked at in a real browser (batch F, 2026-11-16): a night street, a cantina, a hangar, a saber duel and a blaster fight,
// each on the full and the lite tier, with a screenshot and what the frames cost (the frame interval, the renderer's own sync and draw
// times, draw calls, and how many shaders have been compiled since the page opened: a new one in a scene already drawn is a stall).
// Unlike the other scripts it draws on the PC's own graphics card (ANGLE on Direct3D 11), not in software: software rendering is always
// the lite tier and says nothing of the time a frame takes.
// Needs a server on BASE with the test database. Usage: BASE=http://127.0.0.1:5101 OUT=e2e/out/lights-after [SCENES=street,cantina] [TIERS=full,lite] [SEED=12] node e2e/lights.mjs
import { chromium } from "playwright";
import fs from "fs";
import { api, BASE } from "./lib.mjs";

const OUT = process.env.OUT || "e2e/out/lights";
const SEED = Number(process.env.SEED || 12);
const SCENES = (process.env.SCENES || "street,cantina,hangar,saber,blaster").split(",");
const TIERS = (process.env.TIERS || "full,lite").split(",");
const PHONE = process.env.VIEW === "phone";
const NIGHT = 22 * 60; // ten at night on the first day
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const world = (await api("POST", "/api/world/generate", { options: { seed: SEED, partyLevel: 5 } })).json.world;
const areas = Object.values(world.areas);
const kids = (id) => areas.filter((a) => a.parentId === id);
const building = (re) => areas.find((a) => a.kind === "building" && re.test(a.type) && kids(a.id).some((r) => r.layout));
const roomOf = (b, re) => b && (kids(b.id).find((r) => re.test(r.name)) ?? kids(b.id)[0]);
const hostile = (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && o.count >= 1);
const cantina = building(/^cantina$/);
const hangarRoom = areas.find((a) => a.kind === "room" && a.layout && /hangar|docking bay|landing/i.test(a.name));
const fightRoom = areas.find(hostile);
const where = {
  street: cantina,
  cantina: roomOf(cantina, /main bar/i),
  hangar: hangarRoom,
  saber: fightRoom,
  blaster: fightRoom,
};
say("seed", SEED, Object.fromEntries(Object.entries(where).map(([k, a]) => [k, a ? `${a.id} ${a.name} (${a.type})` : "none"])));

const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"] });
const made = { chars: [], camps: [] };
const rows = [];
try {
  for (const scene of SCENES) {
    const at = where[scene];
    if (!at) { say(scene, ": no such place in seed", SEED); continue; }
    const saber = scene === "saber";
    const ch = (await api("POST", "/api/characters", {
      name: saber ? "Lumen Saber" : "Lumen Shot", species: "human", class: saber ? "guardian" : "fighter", background: "soldier", alignment: "Neutral", level: 5,
      abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      maxHp: 80, currentHp: 80, maxForcePoints: 10, currentForcePoints: 10, armorClass: 16, speed: 30,
      equipment: [saber ? "Lightsaber" : "Blaster rifle", "Power cell", "Power cell", "Combat suit", "Glowrod"],
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
    })).json;
    made.chars.push(ch.id);
    const fight = scene === "saber" || scene === "blaster";
    const res = (await api("POST", "/api/campaigns", {
      characterId: ch.id, name: `Lights ${scene} ${Date.now()}`, description: "lights", npcs: [], locations: [], quests: [], startingLocation: "start",
      currentLocation: at.id, galaxyMap: world, timeElapsed: { total: NIGHT }, specialRules: { mode: fight ? "shooter" : "tabletop" },
    }));
    if (res.status !== 201) { say(scene, "campaign not made:", res.status, res.text.slice(0, 200)); continue; }
    const camp = res.json;
    made.camps.push(camp.id);
    for (const tier of TIERS) {
      const context = await browser.newContext(PHONE ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("sw5e.detail", t);
          localStorage.setItem("sw5e.noEncounters", "1");
          localStorage.setItem("sw5e.autoChecks", "1");
          localStorage.setItem("sw5e.mute", "1");
        } catch {}
      }, tier);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 300)));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
      page.setDefaultTimeout(120000);
      await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
      await page.addLocatorHandler(page.getByTestId("mode-dialog"), async () => { await page.getByTestId(fight ? "mode-shooter" : "mode-tabletop").click(); });
      const up = await page.waitForFunction(() => !!window.__babylon, null, { timeout: 120000 }).then(() => true, () => false);
      if (!up) {
        await page.screenshot({ path: `${OUT}/${scene}-${tier}-stuck.png` });
        say(scene, tier, "no 3D map:", errors.slice(0, 3).join(" | "), (await page.locator("body").innerText()).slice(0, 300).replace(/\n/g, " / "));
        await context.close();
        continue;
      }
      // (a fight in shooter mode starts on the Fight button)
      if (fight) {
        await sleep(6000);
        const button = page.getByRole("button", { name: "Fight", exact: true });
        if (await button.count()) await button.click().catch(() => {});
      }
      // Let it settle: shaders compiled, maps loaded
      await page.waitForFunction(() => window.__babylon?.prepared?.(), null, { timeout: 120000 }).catch(() => {});
      // (and no shader compiled for six seconds, up to two minutes)
      for (let i = 0, last = -1, still = 0; i < 120 && still < 6; i++) {
        const n = await page.evaluate(() => Object.keys(window.__babylon.engine._compiledEffects ?? {}).length);
        still = n === last ? still + 1 : 0;
        last = n;
        await sleep(1000);
      }
      const sample = await page.evaluate(async () => {
        const b = window.__babylon;
        const shaders = () => Object.keys(b.engine._compiledEffects ?? {}).length;
        const s0 = shaders();
        const gaps = [];
        let last = performance.now();
        await new Promise((done) => {
          const end = last + 4000;
          const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); };
          requestAnimationFrame(tick);
        });
        gaps.sort((a, c) => a - c);
        const mean = gaps.reduce((a, c) => a + c, 0) / gaps.length;
        return {
          frameMs: Math.round(mean * 10) / 10, p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10,
          sync: Math.round(b.timing.sync * 10) / 10, draw: Math.round(b.timing.draw * 10) / 10, calls: b.info.render.calls,
          shaders: shaders(), newShaders: shaders() - s0, software: b.software, gpu: b.engine.getGlInfo().renderer,
          lights: (() => { const m = [...b.mirrors?.values?.() ?? []][0]; return m ? m.scene.lights.length : null; })(),
        };
      });
      const file = `${OUT}/${scene}-${tier}${PHONE ? "-phone" : ""}.png`;
      await page.screenshot({ path: file });
      const row = { scene, tier, ...sample, errors: errors.length };
      rows.push(row);
      say(JSON.stringify(row));
      for (const e of errors.slice(0, 3)) say("   ", e);
      await context.close();
    }
  }
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await browser.close();
  fs.writeFileSync(`${OUT}/numbers.json`, JSON.stringify(rows, null, 2));
}
