// Co-op through two real browsers (2026-10-29): one hosts from Play, the other joins by the code on /coop; each walks alone; the host sets out
// on a speeder route, the other joins the room, they choose a speeder, a pilot and a gunner, the pilot drives the trip, and the gunner arrives with them.
// Needs a server on the TEST database (PORT=5099 DATABASE_URL=.../sw5e_test VITE_TEST_MENU=1 npx tsx server/index.ts).
// Usage: BASE=http://127.0.0.1:5099 node e2e/coop.mjs        (STOP=room stops after the room is shown; default plays the trip out)
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { browser, page: host, events } = await open();
const made = { chars: [], camps: [] };
let guestContext;
try {
  const person = async (name) => {
    const r = await api("POST", "/api/characters", {
      name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Athletics", "Perception"], savingThrowProficiencies: ["strength", "constitution"],
      equipment: ["Blaster pistol"],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.chars.push(r.json.id);
    return r.json;
  };
  const tag = Date.now().toString(36).slice(-4);
  const ann = await person("Ann" + tag);
  const bo = await person("Bo" + tag);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const route = world.paths.find((p) => p.kind === "route" && world.areas[p.from]?.kind === "settlement" && world.areas[p.to]?.kind === "settlement");
  if (!route) throw new Error("no speeder route between two settlements in the world");
  route.travel = "14 km (1 h by speeder)";
  const camp = await api("POST", "/api/campaigns", {
    characterId: ann.id, name: "Co-op check " + tag, description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: route.from,
    galaxyMap: world, specialRules: { mode: "tabletop" },
    vehicles: [{ id: "v-co", name: "Landspeeder", model: "Landspeeder", mph: 220, value: 10000, status: "parked", owner: "x", seats: 2, areaId: route.from }],
  });
  if (camp.status !== 201) throw new Error(camp.text.slice(0, 300));
  made.camps.push(camp.json.id);
  const cid = camp.json.id;
  await host.addInitScript(() => { try { localStorage.setItem("sw5e.autopilot", "1"); localStorage.setItem("sw5e.view", "overhead"); } catch {} });

  // ---- the host opens the game and hosts
  await host.goto(`${BASE}/game/${cid}`, { waitUntil: "domcontentloaded" });
  await host.getByRole("heading", { name: ann.name }).waitFor({ timeout: 120000 });
  await sleep(4000);
  await host.getByTestId("coop-toggle").click();
  await host.getByTestId("coop-lan-off").waitFor({ timeout: 15000 });
  say("lan notice shown (server on loopback): yes");
  await host.getByTestId("coop-host").click();
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('[data-testid="coop-code"]')?.textContent?.trim() ?? ""), null, { timeout: 15000 });
  const code = (await host.getByTestId("coop-code").innerText()).trim();
  say("code:", code);
  await host.screenshot({ path: `${OUT}/coop-1-host.png`, timeout: 120000 });
  await host.getByTestId("coop-close").click();

  // ---- the other player joins from the join page and picks their character
  guestContext = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await guestContext.addInitScript(() => { try { localStorage.setItem("sw5e.autoChecks", "1"); localStorage.setItem("sw5e.noEncounters", "1"); localStorage.setItem("sw5e.sharpness", "0.75"); localStorage.setItem("sw5e.view", "overhead"); } catch {} });
  const guest = await guestContext.newPage();
  guest.setDefaultTimeout(30000);
  guest.on("pageerror", (e) => events.push(`[guest pageerror] ${String(e.stack || e).slice(0, 500)}`));
  guest.on("console", (m) => { if (m.type() === "error") events.push(`[guest console.error] ${m.text().slice(0, 300)}`); });
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 120000 });
  await sleep(4000);
  say("guest is playing", bo.name, "at", guest.url());
  await host.getByTestId("coop-toggle").click();
  await host.waitForFunction((n) => document.querySelector('[data-testid="coop-members"]')?.innerText.includes(n), bo.name, { timeout: 15000 });
  say("host sees:", (await host.getByTestId("coop-members").innerText()).replace(/\s+/g, " "));
  await host.getByTestId("coop-close").click();
  await guest.screenshot({ path: `${OUT}/coop-2-guest.png`, timeout: 120000 });

  // ---- each walks alone: the guest is on the host's map as a figure, and in the room the host is not
  const place = async (page) => page.evaluate(async () => (await import("/src/lib/coop.ts")).useCoop.getState().members.map((m) => `${m.name}@${m.areaId}`));
  say("places:", JSON.stringify(await place(host)));

  // ---- the host sets out by speeder: a room opens on both screens
  await host.getByTestId("ride-vehicle-v-co").first().click();
  await host.getByTestId("travel-room").waitFor({ timeout: 15000 });
  await guest.getByTestId("travel-room").waitFor({ timeout: 15000 });
  say("room is up on both; guest sees Join:", await guest.getByTestId("room-join").count());
  await guest.screenshot({ path: `${OUT}/coop-3-room-guest.png`, timeout: 120000 });
  await guest.getByTestId("room-join").click();
  await host.getByTestId("room-crafts").waitFor({ timeout: 15000 });
  await guest.getByTestId("room-crafts").waitFor({ timeout: 15000 });
  say("crew phase on both");
  await host.getByTestId("seat-vehicle-v-co-pilot").click();
  await sleep(300);
  await guest.getByTestId("seat-vehicle-v-co-gunner").click();
  await sleep(500);
  await host.screenshot({ path: `${OUT}/coop-4-crew.png`, timeout: 120000 });
  say("issues:", await host.getByTestId("room-issues").count());
  if (process.env.STOP === "room") throw new Error("stopped at the room (STOP=room)");
  await host.getByTestId("room-ready").click();
  await guest.getByTestId("room-ready").click();

  // ---- the pilot drives; the gunner waits and then arrives
  say("guest covered while the pilot drives:", await guest.getByText(/On the way to/).count());
  for (let n = 0; n < 120; n++) {
    await sleep(2000);
    if (await host.getByTestId("minigame-page").count()) {
      await host.getByTestId("minigame-over").waitFor({ timeout: 300000 }).catch(() => {});
      if (await host.getByTestId("minigame-land").count()) await host.getByTestId("minigame-land").click();
    }
    const at = await place(guest);
    if (at.every((s) => s.endsWith(`@${route.to}`))) break;
  }
  const finalPlaces = await place(host);
  say("final places:", JSON.stringify(finalPlaces), "route.to", route.to);
  if (!finalPlaces.every((s) => s.endsWith(`@${route.to}`))) throw new Error("not everyone arrived");
  await sleep(2500);
  say("room gone on both:", (await host.getByTestId("travel-room").count()) + (await guest.getByTestId("travel-room").count()) === 0);
  await guest.screenshot({ path: `${OUT}/coop-5-arrived.png`, timeout: 120000 });
  say("OK");
} catch (e) {
  say("FAILED:", e.message);
  await host.screenshot({ path: `${OUT}/coop-fail-host.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
