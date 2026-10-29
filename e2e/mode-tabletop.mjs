// The same fight on the tabletop mode (2026-10-29): the mode dialog asks after the world is made, the choice is saved, the overhead view stays, and a fight is still turn by turn. Usage: BASE=http://127.0.0.1:5099 node e2e/mode-tabletop.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
const made = { chars: [], camps: [] };
try {
  const ch = (await api("POST", "/api/characters", {
    name: "Tabletop Check", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
    maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30,
    equipment: ["Blaster rifle", "Power cell", "Power cell", "Combat suit"], startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
  })).json;
  made.chars.push(ch.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && (a.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints && !/droid/i.test(o.creature || "")));
  // (no mode chosen yet: the dialog must ask, as after a freshly generated campaign)
  const camp = await api("POST", "/api/campaigns", { characterId: ch.id, name: "Tabletop Check " + Date.now(), description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world });
  made.camps.push(camp.json.id);
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Tabletop Check" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(6000);
  say("mode dialog asked after the world is made:", await page.getByTestId("mode-dialog").count());
  await page.screenshot({ path: `${OUT}/tabletop-0-dialog.png`, timeout: 120000 });
  await page.getByTestId("mode-tabletop").click();
  await page.waitForTimeout(1500);
  say("saved:", JSON.stringify((await api("GET", `/api/campaigns/${camp.json.id}`)).json.specialRules));
  const view = () => page.evaluate(async () => { const s = (await import("/src/components/Map/interiors/aim.ts")).useView.getState(); return `${s.mode} shooter=${s.shooter}`; });
  say("view:", await view());
  await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click();
  await page.waitForTimeout(4000);
  const s = await page.evaluate(async () => { const k = (await import("/src/lib/stores/useCombat.ts")).useCombat.getState(); const sh = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); return { inCombat: k.inCombat, realtime: k.realtime, shooter: !!sh.session, round: k.round, combatants: k.combatants.length }; });
  say("fight:", JSON.stringify(s), "| turn panel:", await page.getByText(/Combat - Round/).count());
  await page.screenshot({ path: `${OUT}/tabletop-1-fight.png`, timeout: 120000 });
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/tabletop-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
