// The lock dial and the timing bar in shooter mode, end to end, at desktop or phone size (2026-11-15): clear the room's foes, press the locked door's button, play the dial, then force the barricade on the bar.
// Usage: [VIEW=phone] BASE=http://127.0.0.1:5103 OUT=e2e/out/lock node e2e/sweep-lock.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const { browser, page, events } = await open();
const made = { chars: [], camps: [] };
try {
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const room = world.areas[process.env.ROOM || "a1442"];
  const ch = (await api("POST", "/api/characters", {
    name: "Lock Smoke", species: "human", class: "scout", background: "soldier", alignment: "Neutral", level: 3,
    abilityScores: { strength: 16, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
    maxHp: 40, currentHp: 40, maxForcePoints: 0, currentForcePoints: 0, armorClass: 15, speed: 30,
    equipment: ["Blaster pistol", "Power cell", "Security kit", "Combat suit"],
    startingLocation: "Unknown", skillProficiencies: ["Athletics", "Sleight of Hand"], savingThrowProficiencies: ["strength"], toolProficiencies: ["Security kit"],
  })).json;
  made.chars.push(ch.id);
  const camp = await api("POST", "/api/campaigns", { characterId: ch.id, name: "Lock Smoke " + Date.now(), description: "smoke", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world, specialRules: { mode: "shooter" } });
  made.camps.push(camp.json.id);
  await page.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Lock Smoke" }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.evaluate(() => { for (const u of window.__shooter?.units ?? []) if (u.side === "foe") { u.hp = 0; u.dead = true; } });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/lock-1-after-fight.png`, timeout: 120000 });
  const unlock = page.getByRole("button", { name: /Unlock \(/ }).first();
  say("unlock button:", await unlock.count() ? (await unlock.textContent()) : "none");
  await unlock.scrollIntoViewIfNeeded().catch(() => {});
  await unlock.click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  say("dial shown:", await page.getByTestId("hands-game").count(), await page.getByTestId("hands-game").getAttribute("data-kind").catch(() => null));
  await page.screenshot({ path: `${OUT}/lock-2-dial.png`, timeout: 120000 });
  const dial = page.getByTestId("hands-dial");
  if (await dial.count()) {
    const b = await dial.boundingBox();
    for (const f of [0.3, 0.7, 0.5]) { await page.mouse.move(b.x + b.width * f, b.y + b.height * 0.6); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up(); }
    await page.getByTestId("hands-turn").dispatchEvent("pointerdown").catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/lock-3-dial-turn.png`, timeout: 120000 });
    say("after turning:", (await page.getByTestId("hands-game").count()) ? "dial still open" : "dial closed");
    if (await page.getByTestId("hands-cancel").count()) await page.getByTestId("hands-cancel").first().click().catch(() => {});
  }
  await page.waitForTimeout(1500);
  const force = page.getByRole("button", { name: /Force it/ }).first();
  if (await force.count()) {
    await force.click({ timeout: 8000 }).catch((e) => say("force click failed", e.message.slice(0, 80)));
    await page.waitForTimeout(2500);
    say("bar shown:", await page.getByTestId("hands-now").count());
    await page.screenshot({ path: `${OUT}/lock-4-bar.png`, timeout: 120000 });
    if (await page.getByTestId("hands-now").count()) { await page.getByTestId("hands-now").dispatchEvent("pointerdown"); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/lock-5-bar-pressed.png`, timeout: 120000 }); }
  }
} catch (e) {
  say("FAILED:", e.message.slice(0, 300));
  await page.screenshot({ path: `${OUT}/lock-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|DevTools|\[vite\]|\[api \d+\]|AudioContext|requestfailed/i.test(e)) say("console:", e.slice(0, 250));
  await browser.close();
}
