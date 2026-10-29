// The shooter mode after a defeat (2026-10-29; the user: "I died and respawned with an enemy in the room, the enemy is not attacking, nor taking damage
// from my blaster fire or lightsabre swings, and the doors are non responsive"). The party is brought down in a real-time fight, wakes, and must be able to
// leave by a door, and a fight must begin again where an enemy still stands. Usage: BASE=http://127.0.0.1:5099 node e2e/shooter-defeat.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const ch = (await api("POST", "/api/characters", {
    name: "Defeat Check", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
    maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30,
    equipment: ["Blaster rifle", "Power cell", "Power cell", "Power cell", "Lightsaber", "Combat suit"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const hostile = (a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && !/droid/i.test(o.creature || ""));
  const room = Object.values(world.areas).find((a) => hostile(a) && world.paths.some((p) => (p.from === a.id || p.to === a.id) && !p.hidden && !p.locked));
  if (!room) throw new Error("no hostile room with a door");
  // CROWD=1: every neighbour has a hostile too, so there is nowhere safe to wake in
  if (process.env.CROWD) {
    const foe = room.occupants.find((o) => o.disposition === "hostile" && o.hitPoints);
    for (const p of world.paths) {
      const other = p.from === room.id ? p.to : p.to === room.id ? p.from : null;
      if (other && world.areas[other].kind === "room" && !hostile(world.areas[other])) world.areas[other].occupants.push({ ...foe, id: foe.id + "-x" + other });
    }
  }
  say("room:", room.name, "hostiles:", room.occupants.filter((o) => o.disposition === "hostile").map((o) => `${o.name} x${o.count}`).join(", "));
  const camp = await api("POST", "/api/campaigns", {
    characterId: ch.id, name: "Defeat Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start",
    currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" },
  });
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "shoulder"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Defeat Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);

  const state = () => page.evaluate(async () => {
    const c = await import("/src/lib/stores/useCombat.ts"); const s = await import("/src/components/Map/interiors/shoot.ts");
    const k = c.useCombat.getState(); const sh = s.useShoot.getState(); const sim = window.__shooter;
    return { inCombat: k.inCombat, realtime: k.realtime, outcome: k.outcome, session: !!sh.session, hp: sh.hud.hp, foes: sim ? sim.units.filter((u) => u.side === "foe" && !u.dead).length : null };
  });
  const where = async () => {
    const c = (await api("GET", `/api/campaigns/${camp.json.id}`)).json;
    const w = c.galaxyMap; const a = w.areas[c.currentLocation];
    return { at: a?.name, id: c.currentLocation, hostile: (a?.occupants ?? []).filter((o) => o.disposition === "hostile" && o.hitPoints).map((o) => `${o.name}:${o.hitPoints}`), alert: a?.alert, hp: (await api("GET", `/api/characters/${ch.id}`)).json.currentHp };
  };
  say("start:", JSON.stringify(await where()));
  // (in the shooter mode a hostile with its weapons out starts the fight by itself: the button is only there when it has not)
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(3000);
  say("fight:", JSON.stringify(await state()));
  // the party is brought down
  await page.evaluate(() => { const s = window.__shooter; const me = s.units.find((u) => u.side === "player"); me.hp = 0; });
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(2500); say("  hp in the database after", (i + 1) * 2.5, "s:", (await api("GET", `/api/characters/${ch.id}`)).json.currentHp); }
  say("after the defeat:", JSON.stringify(await state()));
  say("where:", JSON.stringify(await where()));
  await page.screenshot({ path: `${OUT}/defeat-1.png`, timeout: 120000 });
  const toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent));
  say("toasts:", JSON.stringify(toasts));
  const exits = await page.getByRole("button").evaluateAll((bs) => bs.map((b) => b.textContent.trim()).filter((t) => /^(Go to|Unlock|Enter|Leave|Climb|Slip)/.test(t)));
  say("exit buttons:", JSON.stringify(exits.slice(0, 8)));
  say("fight buttons:", await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count());
  // try a door
  const door = page.getByRole("button", { name: /^(Go to|Path to|Door to|Leave) / }).first();
  if (await door.count()) {
    const before = (await where()).id;
    await door.click();
    await page.waitForTimeout(4000);
    const after = await where();
    say("door:", before === after.id ? "DID NOT MOVE" : "moved to " + after.at, JSON.stringify(await state()));
    const t2 = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent));
    say("toasts after the door:", JSON.stringify(t2));
  }
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/defeat-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
