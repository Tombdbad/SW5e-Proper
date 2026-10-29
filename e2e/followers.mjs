// Followers through a door (2026-10-29; the user: followers appeared outside the room and clipped through the wall into it when the party moved).
// A companion follows the party out of one room into the next: it must be beside the party within moments, never far off and never gliding in from where
// it stood in the last room. Usage: BASE=http://127.0.0.1:5099 node e2e/followers.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const comp = (o) => ({ hp: 20, maxHp: 20, ac: 12, speed: 30, saves: {}, equipment: [], wage: 0, ...o });
  const ch = (await api("POST", "/api/characters", {
    name: "Follow Check", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
    maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30, equipment: ["Blaster pistol"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
    companionData: { party: [comp({ id: "c-bb", name: "BB Unit", kind: "droid", role: "droid", size: "Small", creature: "droid" }), comp({ id: "c-hire", name: "Senn", kind: "hireling", role: "mercenary", species: "Bothan", size: "Medium", creature: "humanoid" })] },
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && world.paths.some((p) => (p.from === a.id || p.to === a.id) && !p.hidden && !p.locked && world.areas[p.from === a.id ? p.to : p.from]?.kind === "room"));
  for (const a of Object.values(world.areas)) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
  const camp = await api("POST", "/api/campaigns", { characterId: ch.id, name: "Follow Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world, specialRules: { mode: "tabletop" } });
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Follow Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(9000);
  const snap = () => page.evaluate(() => { const f = window.__followers ?? {}; const p = window.__street?.().party; return { party: p, followers: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { x: +v.x.toFixed(1), y: +v.y.toFixed(1), d: p ? +Math.hypot(v.x - p.x, v.y - p.y).toFixed(1) : null }])) }; });
  say("in the first room:", JSON.stringify(await snap()));
  const way = world.paths.find((p) => (p.from === room.id || p.to === room.id) && !p.hidden && !p.locked && world.areas[p.from === room.id ? p.to : p.from]?.kind === "room");
  const toName = world.areas[way.from === room.id ? way.to : way.from].name;
  const door = page.getByRole("button").filter({ hasText: toName }).filter({ hasText: way.label }).first();
  say("exit:", (await door.textContent())?.trim());
  await door.click();
  const seen = [];
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(400); const s = await snap(); seen.push(Math.max(...Object.values(s.followers).map((f) => f.d ?? 99))); }
  say("farthest follower from the party, each 0.4 s after the door:", seen.join(" "));
  say("then:", JSON.stringify(await snap()));
  await page.screenshot({ path: `${OUT}/followers-1.png`, timeout: 120000 });
  if (Math.max(...seen) > 6) throw new Error("a follower was far from the party after the door");
  say("OK");
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/followers-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
