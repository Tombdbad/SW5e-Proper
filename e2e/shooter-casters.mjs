// Batch G in a real browser (2026-11-16): a foe whose stat block casts (an Inquisitor, Knight, read from its Forcecasting trait) casts in the real-time
// fight, and the party's class features and maneuvers are on its item belt and used there. Usage: BASE=http://127.0.0.1:5113 OUT=e2e/out/g node e2e/shooter-casters.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const say = (...a) => console.log(...a);
const { browser, page } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const ch = (await api("POST", "/api/characters", {
    name: "Caster Check", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 5,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
    maxHp: 60, currentHp: 60, maxForcePoints: 0, currentForcePoints: 0, armorClass: 16, speed: 30, fighterManeuvers: { maneuvers: ["Trip Attack", "Rally", "Menacing Attack"], styles: [] },
    equipment: ["Blaster rifle", "Power cell", "Power cell", "Vibrosword", "Combat suit"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 5 } })).json.world;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints));
  // (the room's hostiles are an Inquisitor, Knight, from its stat block as the world generator would place it)
  const inq = (await api("POST", "/api/world/occupant", { statBlock: "inquisitor-knight" })).json;
  say("occupant casting:", JSON.stringify(inq.profile?.casting ? { level: inq.profile.casting.level, points: inq.profile.casting.points, powers: inq.profile.casting.powers.length } : null));
  room.occupants = room.occupants.filter((o) => o.disposition !== "hostile").concat([{ ...inq, disposition: "hostile", count: 1 }]);
  const camp = await api("POST", "/api/campaigns", {
    characterId: ch.id, name: "Caster Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
  });
  say("campaign:", camp.status ?? "", camp.json?.id ?? JSON.stringify(camp.json).slice(0, 300));
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "shoulder"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Caster Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!window.__shooter)); i++) await page.waitForTimeout(1000);
  // (the party cannot die, so the fight runs long enough to see the casts)
  await page.evaluate(() => { for (const u of window.__shooter.units) if (u.side === "player") { u.maxHp = 9999; u.hp = 5000; } });
  const foe = await page.evaluate(() => { const f = window.__shooter.units.find((u) => u.side === "foe"); return { name: f.name, powers: (f.powers || []).map((p) => `${p.name}:${p.kind}`), points: f.points }; });
  say("foe:", JSON.stringify(foe));
  const party = await page.evaluate(() => { const p = window.__shooter.units.find((u) => u.side === "player"); return { knack: p.knack, evade: p.evade, gun: p.gun?.damage, blade: p.blade?.damage }; });
  say("party:", JSON.stringify(party));
  // watch what the foe does for 20 s: its winds-up and casts (the sim's events go to the scene; the HUD's note shows a power's name)
  const seen = new Set();
  for (let t = 0; t < 40; t++) {
    const s = await page.evaluate(() => { const f = window.__shooter.units.find((u) => u.side === "foe"); const p = window.__shooter.units.find((u) => u.side === "player"); return { act: f.act?.kind === "cast" ? f.act.power?.name : null, pts: f.points, note: null, stagger: +p.stagger.toFixed(2), held: p.held ?? 0, slowed: +(p.slowed ?? 0).toFixed(1) }; });
    const note = await page.evaluate(async () => (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().hud.note);
    await page.evaluate(() => { const s = window.__shooter; const me = s.units.find((u) => u.side === "player"); const f = s.units.find((u) => u.side === "foe" && !u.dead); if (f) window.__look(Math.atan2(f.x - me.x, f.y - me.y), -0.05); });
    if (s.act && !seen.has(`act:${s.act}`)) { seen.add(`act:${s.act}`); say(`  ${t / 2}s winding up ${s.act} (points ${s.pts})`); await page.screenshot({ path: `${OUT}/caster-windup-${seen.size}.png` }); }
    if (note && !seen.has(`note:${note}`)) { seen.add(`note:${note}`); say(`  ${t / 2}s note: ${note}; party stagger ${s.stagger} held ${s.held} slowed ${s.slowed}`); }
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${OUT}/caster-fight.png` });
  // the belt: the features used (Z uses the one shown, T the next)
  const press = (k, ms = 120) => page.evaluate(async ([key, t]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); s.down(key); await new Promise((r) => setTimeout(r, t)); s.up(key); }, [k, ms]);
  const belt = await page.evaluate(async () => (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().session?.gear?.map((g) => `${g.name}[${g.count}] ${g.act.act}${g.pool ? " pool " + g.pool : ""}`));
  say("belt:", JSON.stringify(belt));
  const used = [];
  for (let i = 0; i < (belt?.length ?? 0); i++) {
    await page.evaluate(() => { const p = window.__shooter.units.find((u) => u.side === "player"); p.hp = 3000; p.stagger = 0; p.fire = 0; });
    await press("item");
    await page.waitForTimeout(400);
    used.push(await page.evaluate(async () => { const st = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); const p = window.__shooter.units.find((u) => u.side === "player"); return { note: st.hud.note, buffs: (p.buffs || []).map((b) => b.name), imbue: p.imbue?.name, temp: p.temp }; }));
    await press("next");
    await page.waitForTimeout(200);
  }
  say("used:", JSON.stringify(used));
  await page.screenshot({ path: `${OUT}/caster-belt.png` });
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/caster-failed.png` }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await browser.close();
}
