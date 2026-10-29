// Companions in a co-op game (2026-10-30; the user: a beast follower and a stranger were seen on one player's screen only, the stranger on both, each
// walking behind its own player). Two browsers in one room; the guest stands well away from the host; the companions must be in the SAME place on both
// screens, behind the host (who leads where they are). Usage: BASE=http://127.0.0.1:5099 node e2e/coop-followers.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { browser, page: host, events } = await open();
const made = { chars: [], camps: [] };
let guestContext;
try {
  const comp = (o) => ({ hp: 20, maxHp: 20, ac: 12, speed: 30, saves: {}, equipment: [], wage: 0, ...o });
  const person = async (name, extra = {}) => {
    const r = await api("POST", "/api/characters", {
      name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"], ...extra,
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.chars.push(r.json.id);
    return r.json;
  };
  const tag = Date.now().toString(36).slice(-4);
  const ann = await person("Ann" + tag, { companionData: { party: [comp({ id: "c-bb", name: "BB Unit", kind: "droid", role: "droid", size: "Small", creature: "droid" })] } });
  const bo = await person("Bo" + tag);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const room = Object.values(world.areas).find((a) => a.kind === "room" && a.layout && a.layout.width >= 10 && a.layout.height >= 8);
  for (const a of Object.values(world.areas)) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
  const camp = await api("POST", "/api/campaigns", { characterId: ann.id, name: "Co-op followers " + tag, description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world, specialRules: { mode: "tabletop" } });
  made.camps.push(camp.json.id);
  await host.setViewportSize({ width: 1100, height: 700 });
  await host.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  await host.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await host.getByRole("heading", { name: ann.name }).waitFor({ timeout: 120000 });
  await sleep(5000);
  await host.getByTestId("coop-toggle").click();
  await host.getByTestId("coop-host").click();
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('[data-testid="coop-code"]')?.textContent?.trim() ?? ""), null, { timeout: 15000 });
  const code = (await host.getByTestId("coop-code").innerText()).trim();
  await host.getByTestId("coop-close").click();
  guestContext = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await guestContext.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  const guest = await guestContext.newPage();
  guest.setDefaultTimeout(30000);
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 120000 });
  await sleep(8000);
  const spots = (page) => page.evaluate(() => ({ me: window.__street?.().party, followers: Object.fromEntries(Object.entries(window.__followers ?? {}).map(([k, v]) => [k, { x: +v.x.toFixed(1), y: +v.y.toFixed(1) }])) }));
  // the guest steps well away from the host
  const hostSpot = (await spots(host)).me;
  await guest.evaluate(async ([x, y]) => {
    const m = await import("/src/components/Map/LocalMap.tsx");
    const s = m.usePartySpot.getState();
    s.stand(s.areaId, x, y);
  }, [Math.round(hostSpot.x) + 6, Math.round(hostSpot.y)]);
  await sleep(6000);
  const h = await spots(host);
  const g = await spots(guest);
  say("host:", JSON.stringify(h));
  say("guest:", JSON.stringify(g));
  const bb = (o) => o.followers["c-bb"] ?? Object.entries(o.followers).find(([k]) => k.endsWith("-c-bb"))?.[1];
  if (!bb(h) || !bb(g)) throw new Error("a screen does not show the companion");
  const apart = Math.hypot(bb(h).x - bb(g).x, bb(h).y - bb(g).y);
  const nearHost = Math.hypot(bb(g).x - h.me.x, bb(g).y - h.me.y);
  say("the companion is", apart.toFixed(1), "squares apart between the two screens; on the guest's it is", nearHost.toFixed(1), "from the host");
  await guest.screenshot({ path: `${OUT}/coop-followers-guest.png`, timeout: 120000 });
  // (a follower stands behind or beside its owner: either screen has it within a few squares of the host, not by the guest who is six squares off)
  if (Math.hypot(bb(h).x - h.me.x, bb(h).y - h.me.y) > 3.5 || nearHost > 3.5) throw new Error("the companion is not with its owner on both screens");
  say("OK");
} catch (e) {
  say("FAILED:", e.message);
  await host.screenshot({ path: `${OUT}/coop-followers-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
