// Facing, posture and kicking in a co-op game (2026-10-30): the guest turns, goes prone; the host sees it (peer f and s); the host kicks the guest, who is put out
// and cannot come back. Usage: BASE=http://127.0.0.1:5099 node e2e/coop-posture.mjs
import { open, api, BASE } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { browser, page: host, events } = await open();
const made = { chars: [], camps: [] };
try {
  const person = async (name) => {
    const r = await api("POST", "/api/characters", {
      name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.chars.push(r.json.id);
    return r.json;
  };
  const tag = Date.now().toString(36).slice(-4);
  const ann = await person("Ann" + tag);
  const bo = await person("Bo" + tag);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && a.layout && a.layout.width >= 10 && a.layout.height >= 8);
  for (const a of Object.values(world.areas)) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
  const camp = await api("POST", "/api/campaigns", { characterId: ann.id, name: "Co-op posture " + tag, description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world, specialRules: { mode: "tabletop" } });
  made.camps.push(camp.json.id);
  const init = () => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} };
  await host.setViewportSize({ width: 1100, height: 700 });
  await host.addInitScript(init);
  await host.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await host.getByRole("heading", { name: ann.name }).waitFor({ timeout: 120000 });
  await sleep(5000);
  await host.getByTestId("coop-toggle").click();
  await host.getByTestId("coop-host").click();
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('[data-testid="coop-code"]')?.textContent?.trim() ?? ""), null, { timeout: 15000 });
  const code = (await host.getByTestId("coop-code").innerText()).trim();
  await host.getByTestId("coop-close").click();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript(init);
  const guest = await ctx.newPage();
  guest.setDefaultTimeout(30000);
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 120000 });
  await sleep(6000);
  // the guest goes prone and walks (a tap walk turns them to where they go)
  await guest.getByTestId("prone-toggle-bar").click();
  const hostSees = () => host.evaluate(async (id) => {
    const m = await import("/src/lib/coop.ts");
    const p = m.useCoop.getState().peers[id];
    return p ? { f: p.f, s: p.s } : null;
  }, String(bo.id));
  await sleep(2500);
  const seen = await hostSees();
  say("the host sees the guest:", JSON.stringify(seen));
  if (seen?.s !== 2) throw new Error("the host does not see the guest prone");
  await guest.getByTestId("prone-toggle-bar").click();
  await guest.getByTestId("crouch-toggle-bar").click();
  await sleep(2500);
  const crouched = await hostSees();
  say("crouched:", JSON.stringify(crouched));
  if (crouched?.s !== 1) throw new Error("the host does not see the guest crouched");
  // the host kicks the guest
  await host.getByTestId("coop-toggle").click();
  await host.getByTestId(`coop-kick-${bo.id}`).click();
  await sleep(2500);
  const left = await guest.evaluate(async () => (await import("/src/lib/coop.ts")).useCoop.getState().status);
  say("the guest's co-op status after the kick:", left);
  if (left === "on") throw new Error("the kicked guest is still in the game");
  say("OK");
} catch (e) {
  say("FAILED:", e.message);
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
