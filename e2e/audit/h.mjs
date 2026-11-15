// Phase 5 audit harness (2026-11-07). One flow = one script; each flow is played twice, on a 1280x720 desktop and on a 390x844 touch phone.
// Only talks to a test server (default http://127.0.0.1:5099, started on the sw5e_test database). Refuses port 5000 (the real game).
// Writes screenshots and a JSON result per flow and view into AUDIT/05_artifacts/. Creates only rows named "AUDIT5 ..."; 99_cleanup.mjs removes them.
import { chromium } from "playwright";
import fs from "node:fs";

export const BASE = process.env.BASE || "http://127.0.0.1:5099";
if (/:5000(\/|$)/.test(BASE)) throw new Error("Refusing to run against port 5000: that is the real game and its real database.");
export const ART = "AUDIT/05_artifacts";
fs.mkdirSync(ART, { recursive: true });

const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export const TAG = "AUDIT5 " + Date.now().toString(36);

export async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* not json */ }
  return { status: r.status, json: j, text: t };
}
export const made = (kind, id) => fs.appendFileSync(`${ART}/created.ndjson`, JSON.stringify({ kind, id, at: new Date().toISOString() }) + "\n");

// Run `fn` once per view. fn gets { page, context, view, shot, note, state, mark, events, newPage }.
export async function flow(id, title, fn, { views = ["desktop", "phone"], mode = "tabletop", slow = false } = {}) {
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
  const summary = [];
  for (const view of views) {
    const dir = `${ART}/${id}`;
    fs.mkdirSync(dir, { recursive: true });
    const context = await browser.newContext(VIEWS[view]);
    await context.addInitScript(() => { try { localStorage.setItem("sw5e.autoChecks", "1"); localStorage.setItem("sw5e.sharpness", "0.75"); if (localStorage.getItem("sw5e.noEncounters") == null) localStorage.setItem("sw5e.noEncounters", "1"); } catch { /* storage blocked */ } });
    const events = [], notes = {}, states = [], timings = {}, screens = [];
    const t0 = Date.now();
    const wire = (page, label) => {
      page.setDefaultTimeout(Number(process.env.TIMEOUT || 20000));
      page.setDefaultNavigationTimeout(120000);
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") events.push({ kind: "console." + m.type(), page: label, text: m.text().slice(0, 300) }); });
      page.on("pageerror", (e) => events.push({ kind: "pageerror", page: label, text: String(e.message || e).slice(0, 300) }));
      page.on("requestfailed", (r) => events.push({ kind: "requestfailed", page: label, text: `${r.method()} ${r.url().replace(BASE, "").slice(0, 100)} ${r.failure()?.errorText}` }));
      page.on("response", (r) => { if (r.status() >= 400) events.push({ kind: "http" + r.status(), page: label, text: `${r.request().method()} ${r.url().replace(BASE, "").slice(0, 110)}` }); });
      page.on("dialog", async (d) => { events.push({ kind: "dialog", page: label, text: d.message().slice(0, 120) }); await (d.type() === "confirm" ? d.accept() : d.dismiss()).catch(() => {}); });
    };
    const makePage = async (label) => {
      const p = await context.newPage();
      wire(p, label);
      await p.addLocatorHandler(p.getByTestId("mode-dialog"), async () => { await p.getByTestId(mode === "shooter" ? "mode-shooter" : "mode-tabletop").click(); });
      return p;
    };
    const page = await makePage("main");
    let n = 0;
    const shot = async (name, p = page) => {
      n += 1;
      const f = `${dir}/${view}_${String(n).padStart(2, "0")}_${name.replace(/[^a-z0-9]+/gi, "_").slice(0, 36)}.png`;
      await p.screenshot({ path: f, timeout: 90000 }).then(() => screens.push(f), (e) => events.push({ kind: "screenshot-failed", text: String(e.message).slice(0, 100) }));
      return f;
    };
    const note = (k, v) => { notes[k] = v; console.log(`  [${id}/${view}] ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`.slice(0, 400)); };
    const mark = (label) => { timings[label] = Date.now() - t0; };
    const state = (label, obj) => { states.push({ label, ...obj }); };
    let ok = true, error = "";
    try { await fn({ page, context, view, shot, note, state, mark, events, makePage, dir }); }
    catch (e) { ok = false; error = String(e.message || e).split("\n").slice(0, 3).join(" | ").slice(0, 500); await shot("FAILED").catch(() => {}); }
    const perf = await page.evaluate(() => ({ frames: window.__perf?.frames, maxGap: window.__perf?.maxGap, long: window.__perf?.long?.length })).catch(() => ({}));
    const res = { id, title, view, ok, error, seconds: Math.round((Date.now() - t0) / 1000), timings, notes, states, screens, perf, events: events.slice(0, 80), eventCount: events.length };
    fs.writeFileSync(`${dir}/${view}.json`, JSON.stringify(res, null, 1));
    console.log(`${ok ? "PASS" : "FAIL"} ${id} ${view} (${res.seconds}s) events=${events.length}${error ? " :: " + error : ""}`);
    summary.push(res);
    await context.close();
  }
  await browser.close();
  return summary;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pick an option in a Radix Select whose trigger shows `triggerText` (as e2e/lib.mjs does).
export async function pick(page, triggerText, optionText) {
  await page.getByRole("combobox").filter({ hasText: triggerText }).first().click();
  await page.getByRole("option", { name: optionText, exact: true }).first().click();
}

// The ten creation tabs, driven like a person. Returns the saved character (the POST /api/characters response).
export async function createViaUI(page, base, shot, name, cls, species, opts = {}) {
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create New Character" }).click({ timeout: 60000 });
  await page.getByText("Character Creation").waitFor({ timeout: 60000 });
  await page.getByPlaceholder("Enter character name").fill(name);
  await shot(`${cls}_1_details`);
  await next();
  await pick(page, "Select species", species);
  for (const [label, abilities] of opts.increases ?? []) {
    const row = page.locator("li", { hasText: label });
    for (const ability of abilities) await row.getByRole("button", { name: ability, exact: true }).click();
  }
  await shot(`${cls}_2_species`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Select class").waitFor({ timeout: 5000 });
  await pick(page, "Select class", cls);
  await page.getByText(/Hit Die: d\d+/).waitFor();
  await shot(`${cls}_3_class`);
  await next();
  await page.getByRole("button", { name: "Standard Array" }).click();
  await next();
  await pick(page, "Select background", "Soldier");
  await page.getByText(/choose 2 in the Skills step/).waitFor();
  for (const id of ["background-tools", "background-languages"]) {
    const box = page.getByTestId(id);
    if (!(await box.count())) continue;
    const want = Number((await box.locator("h4").innerText()).match(/\(0\/(\d+)\)/)[1]);
    for (let i = 0; i < want; i++) await box.getByRole("button").nth(i).click();
  }
  await next();
  await page.waitForTimeout(300);
  const want = Number(((await page.locator("body").innerText()).match(/Choose\s+(\d+)\s+skills/) || [0, 0])[1]);
  const items = page.locator("li.cursor-pointer");
  for (let i = 0; i < want; i++) await items.nth(i).click();
  for (let i = 0; i < 2; i++) await page.locator("button[data-background-skill]:not([disabled]):not(.bg-blue-600)").first().click();
  await shot(`${cls}_4_skills`);
  await next();
  await page.waitForTimeout(400);
  if (opts.forcePowers) {
    const cards = page.locator("div.cursor-pointer.border.rounded-md");
    for (let i = 0; i < Math.min(opts.forcePowers, await cards.count()); i++) await cards.nth(i).click();
    await shot(`${cls}_5_powers`);
  }
  await next();
  await page.waitForTimeout(300);
  await page.getByRole("checkbox").first().click();
  await next();
  await page.getByText("Equipment Selection").waitFor();
  for (const item of opts.buy ?? []) {
    await page.getByPlaceholder("Search equipment...").fill(item);
    const card = page.locator("div.flex-col", { has: page.getByRole("heading", { name: item, exact: true }) }).last();
    await card.getByRole("button", { name: "Add", exact: true }).click();
  }
  await next();
  await page.getByText(/Hit Points: \d+/).waitFor();
  await shot(`${cls}_6_preview`);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/characters") && r.request().method() === "POST", { timeout: 60000 }),
    page.getByRole("button", { name: "Create Character", exact: true }).click(),
  ]);
  const body = await resp.json().catch(() => ({}));
  if (resp.status() !== 201) throw new Error(`POST /api/characters -> ${resp.status()} ${JSON.stringify(body).slice(0, 200)}`);
  made("character", body.id);
  return body;
}

// ---- fixtures made through the API (the flow under test is still driven through the screens) ----
export async function quickChar(name, over = {}) {
  const r = await api("POST", "/api/characters", {
    name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 3000,
    equipment: ["Blaster pistol", "Vibroblade", "Combat suit", "Medpac"], startingLocation: "Unknown",
    skillProficiencies: ["Athletics", "Perception", "Insight", "Persuasion"], savingThrowProficiencies: ["strength", "constitution"], ...over,
  });
  if (r.status !== 201) throw new Error("quickChar: " + r.text.slice(0, 200));
  made("character", r.json.id);
  return r.json;
}
export async function genWorld(seed = 7, partyLevel = 3) {
  const r = await api("POST", "/api/world/generate", { options: { seed, partyLevel } });
  if (r.status !== 200) throw new Error("genWorld: " + r.text.slice(0, 200));
  return r.json.world;
}
export async function quickCamp(charId, world, { loc, mode, name } = {}) {
  const r = await api("POST", "/api/campaigns", {
    characterId: charId, name: name || TAG + " camp", description: "audit", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: loc || world.startId, galaxyMap: world, ...(mode ? { specialRules: { mode } } : {}),
  });
  if (r.status !== 201) throw new Error("quickCamp: " + r.text.slice(0, 200));
  made("campaign", r.json.id);
  return r.json;
}
export const hostileRoom = (world, ranged = false) => {
  const test = (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && o.count >= 1 && !/droid/i.test(o.creature || ""));
  return Object.values(world.areas).find(test);
};
export async function openGame(page, base, campId, charName, wait = 3000) {
  await page.goto(`${base}/game/${campId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: charName }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(wait);
}
// Taps on things in the 3D map through window.__map3d (as e2e/play.mjs does); a phone view sends touches.
export function mapTools(page, view) {
  const phone = view === "phone";
  const poke = (x, y) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const at = async (key) => { for (let i = 0; i < 40; i++) { const p = await page.evaluate((k) => window.__map3d?.at(k) ?? null, key); if (p) return p; await page.waitForTimeout(250); } throw new Error("nothing on the map for " + key); };
  const inView = async (key) => {
    const box = await page.locator("canvas").first().boundingBox();
    for (let i = 0; i < 15; i++) {
      const p = await at(key);
      if (p.x > box.x + 10 && p.x < box.x + box.width - 10 && p.y > box.y + 50 && p.y < box.y + box.height - 10) return p;
      if (i >= 4) { await page.evaluate((k) => { const m = window.__map3d; const w = m?.world(k); if (w) m.look([w[0], w[1] + 18, w[2] + 12], w); }, key); await page.waitForTimeout(800); continue; }
      await page.mouse.move(box.x + 100, box.y + box.height / 2);
      for (let n = 0; n < 6; n++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
      await page.waitForTimeout(500);
    }
    throw new Error(key + " cannot be brought into view");
  };
  const tap = async (key) => { const p = await inView(key); await poke(p.x, p.y); };
  const doubleTap = async (key) => {
    const p = await inView(key);
    if (!phone) { await poke(p.x, p.y); await page.waitForTimeout(150); await poke(p.x, p.y); return; }
    const cdp = await page.context().newCDPSession(page);
    const t0 = Date.now() / 1000;
    const touch = (type, t) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: p.x, y: p.y }], timestamp: t });
    await touch("touchStart", t0); await touch("touchEnd", t0 + 0.05); await touch("touchStart", t0 + 0.15); await touch("touchEnd", t0 + 0.2);
    await cdp.detach();
  };
  return { at, tap, doubleTap, poke };
}
