// Batch G in a real browser (2026-11-16): Force Push/Pull aimed at a loose piece of the room moves it (by the power's own limits at the character's
// level), bolts break a crate, and over the shoulder a wall between the camera and the character is seen through.
// Usage: BASE=http://127.0.0.1:5113 OUT=e2e/out/g node e2e/shooter-pieces.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
import fs from "fs";

const say = (...a) => console.log(...a);
const { browser, page } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const powers = JSON.parse(fs.readFileSync("shared/data/sw5e/powers.json", "utf8"));
  const push = powers.find((p) => p.name === "Force Push/Pull");
  const ch = (await api("POST", "/api/characters", {
    name: "Pieces Check", species: "human", class: "consular", background: "soldier", alignment: "Neutral", level: 5,
    abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 16, charisma: 12 },
    maxHp: 40, currentHp: 40, maxForcePoints: 20, currentForcePoints: 20, armorClass: 14, speed: 30, forcePowers: [push],
    equipment: ["Blaster rifle", "Power cell", "Power cell"], startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["wisdom"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 5 } })).json.world;
  const loose = /^(Crate|Equipment crate|Footlocker|Parts bin)$/;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints) && (a.layout?.assets || []).filter((x) => loose.test(x.name)).length >= 2);
  say("room:", room?.name, (room?.layout?.assets || []).filter((x) => loose.test(x.name)).map((x) => `${x.name}@${x.x},${x.y}`).join(" "));
  const camp = await api("POST", "/api/campaigns", {
    characterId: ch.id, name: "Pieces Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
  });
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "shoulder"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Pieces Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/pieces-0-shoulder.png` });
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!window.__shooter?.props)); i++) await page.waitForTimeout(1000);
  await page.evaluate(() => { for (const u of window.__shooter.units) if (u.side === "player") { u.maxHp = 9999; u.hp = 5000; u.points = 99; } else if (u.side === "foe") { u.wait = 999; u.mode = "idle"; u.oblivious = 999; } });
  const props = await page.evaluate(() => window.__shooter.props.map((o) => `${o.id} ${o.name} ${o.size} ${o.pounds}lb hp ${o.hp ?? "-"} @${o.x},${o.y}`));
  say("props:", JSON.stringify(props));
  const press = (k, ms = 120) => page.evaluate(async ([key, t]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); s.down(key); await new Promise((r) => setTimeout(r, t)); s.up(key); }, [k, ms]);
  // look at the nearest crate, low enough to put the crosshair on it
  const lookAt = (id) => page.evaluate((pid) => {
    const s = window.__shooter; const me = s.units.find((u) => u.side === "player");
    const o = pid ? s.props.find((p) => p.id === pid) : s.props.filter((p) => !p.gone && /crate|footlocker|parts bin/i.test(p.name)).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    if (!o) return null;
    const [cx, cy] = [o.x + o.w / 2, o.y + o.d / 2];
    const d = Math.hypot(cx - me.x, cy - me.y);
    window.__look(Math.atan2(cx - me.x, cy - me.y), -Math.atan2(1.1, d));
    return { id: o.id, name: o.name, x: o.x, y: o.y, d: +d.toFixed(1), hp: o.hp };
  }, id);
  const before = await lookAt();
  say("aim at:", JSON.stringify(before));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/pieces-1-aimed.png` });
  await press("power0");
  await page.waitForTimeout(800);
  const after = await page.evaluate((pid) => { const o = window.__shooter.props.find((p) => p.id === pid); return { x: o.x, y: o.y, hp: o.hp }; }, before.id);
  const note = await page.evaluate(async () => (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().hud.note);
  say("after push:", JSON.stringify(after), "note:", note);
  await page.screenshot({ path: `${OUT}/pieces-2-pushed.png` });
  // shoot it till it breaks
  await lookAt(before.id);
  for (let i = 0; i < 16; i++) {
    if (await page.evaluate((pid) => !!window.__shooter.props.find((p) => p.id === pid).gone, before.id)) break;
    await lookAt(before.id);
    await press("fire", 200);
    await page.waitForTimeout(350);
  }
  const broke = await page.evaluate((pid) => window.__shooter.props.find((p) => p.id === pid), before.id);
  const pieces = await page.evaluate(async () => (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().pieces);
  say("after fire:", JSON.stringify({ gone: broke.gone, hp: broke.hp }), "gun:", await page.evaluate(() => { const g = window.__shooter.units.find((u) => u.side === "player").gun; return g ? `${g.left}/${g.mag}` : "none"; }), "pieces:", JSON.stringify(pieces));
  await page.screenshot({ path: `${OUT}/pieces-3-broken.png` });
  // a pull, while aiming (the text lets the caster choose: house rule, aiming pulls)
  const other = await page.evaluate((first) => { const s = window.__shooter; const me = s.units.find((u) => u.side === "player"); return s.props.filter((p) => !p.gone && p.size !== "Large" && p.id !== first).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]?.id; }, before.id);
  if (other) {
    const was = await lookAt(other);
    await press("aim");
    await page.waitForTimeout(400);
    await page.evaluate(() => { const p = window.__shooter.units.find((u) => u.side === "player"); p.powerCd = 0; });
    await press("power0");
    await page.waitForTimeout(900);
    const now = await page.evaluate((pid) => { const o = window.__shooter.props.find((p) => p.id === pid); return { x: o.x, y: o.y, hp: o.hp }; }, other);
    const note2 = await page.evaluate(async () => (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().hud.note);
    say("pull:", JSON.stringify(was), "->", JSON.stringify(now), "note:", note2);
    await page.screenshot({ path: `${OUT}/pieces-4-pulled.png` });
    await press("aim");
  }
  // over the shoulder, turned all round: how many meshes are seen through at each heading, and a picture at the most
  let most = { n: -1, yaw: 0 };
  for (let k = 0; k < 12; k++) {
    const yaw = (k / 12) * Math.PI * 2;
    await page.evaluate((y) => window.__look(y, -0.15), yaw);
    await page.waitForTimeout(700);
    const n = await page.evaluate(() => { let n = (window.__cut?.size ?? 0); for (const [, f] of window.__faded ?? []) if (f < 0.9) n++; return n; });
    if (n > most.n) most = { n, yaw };
  }
  say("seen through, most at one heading:", JSON.stringify(most));
  await page.evaluate((y) => window.__look(y, -0.15), most.yaw);
  await page.waitForTimeout(900);
  say("what is seen through:", JSON.stringify(await page.evaluate(() => [...(window.__faded ?? [])].map(([m, f]) => {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox; const s = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +(v * m.matrixWorld.getMaxScaleOnAxis()).toFixed(2));
    const chain = []; for (let p = m; p && chain.length < 6; p = p.parent) chain.push(p.name || p.type + (Object.keys(p.userData).length ? "{" + Object.keys(p.userData).join(",") + "}" : ""));
    const at = m.getWorldPosition(m.position.clone());
    return { f: +f.toFixed(2), geo: m.geometry.type, size: s, at: [at.x, at.y, at.z].map((v) => +v.toFixed(1)), color: m.material?.color?.getHexString?.(), chain: chain.join("<") };
  }))));
  await page.screenshot({ path: `${OUT}/pieces-5-seen-through.png` });
  say("cut:", JSON.stringify(await page.evaluate(() => [...(window.__cut ?? [])].map((m) => {
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; const at = m.getWorldPosition(m.position.clone());
    return { size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(1)), at: [at.x, at.y, at.z].map((v) => +v.toFixed(1)), plane: m.userData.cut?.map((v) => +v.toFixed(2)), color: m.material?.color?.getHexString?.() };
  }))));
  say("rig:", JSON.stringify(await page.evaluate(() => window.__rig)));
  // faded meshes now (over the shoulder)
  say("faded meshes:", await page.evaluate(() => { let n = 0; for (const [m, f] of window.__faded ?? []) if (f < 0.9) n++; return n; }));
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/pieces-failed.png` }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await browser.close();
}
