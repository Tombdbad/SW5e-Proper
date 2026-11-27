// A podrace in a co-op game (2026-11-27; shared/logic "Pod racing"): two browsers in one game on a desert world; the host enters the podrace
// and invites the party, the guest joins in a Stinger, the host starts; both race pages show the same race, the guest's pod is driven by what
// the guest's page sends (here: the brake, then the autopilot), and each pays their own entry and hire when they leave. Needs a test copy
// (VITE_TEST_MENU=1, for the Downtime tab). Usage: BASE=http://127.0.0.1:5002 node e2e/coop-podrace.mjs
import { open, api, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { browser, page: host } = await open();
let failed = false;
const check = (ok, what) => {
  say(ok ? "ok  " : "FAIL", what);
  if (!ok) failed = true;
};
let guestContext;
const made = { chars: [], camps: [] };
try {
  const person = async (name) => {
    const r = await api("POST", "/api/characters", {
      name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
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
  for (const a of Object.values(world.areas)) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
  // (a room of a settlement, its planet made a desert one: podraces are held on desert, rocky and volcanic worlds)
  const street = Object.values(world.areas).find((a) => a.kind === "room");
  let up = street;
  while (up && up.kind !== "planet") up = world.areas[up.parentId];
  if (!up) throw new Error("no planet over the start");
  up.type = "desert";
  const camp = await api("POST", "/api/campaigns", { characterId: ann.id, name: "Co-op podrace " + tag, description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: street.id, galaxyMap: world, specialRules: { mode: "tabletop" } });
  made.camps.push(camp.json.id);
  await host.setViewportSize({ width: 1100, height: 700 });
  await host.addInitScript(() => { try { localStorage.setItem("sw5e.noEncounters", "1"); localStorage.setItem("sw5e.autopilot", "1"); } catch {} });
  await host.goto(`${BASE}/game/${camp.json.id}`, { waitUntil: "domcontentloaded" });
  await host.getByRole("heading", { name: ann.name }).waitFor({ timeout: 180000 });
  await sleep(5000);
  await host.getByTestId("coop-toggle").click();
  await host.getByTestId("coop-host").click();
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('[data-testid="coop-code"]')?.textContent?.trim() ?? ""), null, { timeout: 120000, polling: 500 });
  const code = (await host.getByTestId("coop-code").innerText()).trim();
  await host.getByTestId("coop-close").click();
  guestContext = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await guestContext.addInitScript(() => { try { localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  const guest = await guestContext.newPage();
  guest.setDefaultTimeout(120000);
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  await guest.getByTestId("coop-mode-join").click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 180000 });
  await sleep(6000);
  // The host enters and invites; the guest joins in a Stinger; the host sees them and starts
  await host.getByRole("tab", { name: "Downtime" }).or(host.getByRole("button", { name: "Downtime", exact: true })).first().click();
  await host.getByTestId("downtime-podrace").click();
  await host.getByTestId("pod-invite").click();
  await guest.getByTestId("pod-invite-banner").waitFor({ timeout: 180000 });
  check(true, "the guest is asked to race too");
  await guest.getByTestId("pod-join-make-sting").click();
  await guest.getByTestId("pod-join").click();
  await guest.getByTestId("pod-joined").waitFor();
  await host.waitForFunction((n) => (document.querySelector('[data-testid="pod-coop"]')?.textContent ?? "").includes(n), bo.name, { timeout: 120000, polling: 500 });
  check(true, "the host sees the guest joined, in a Stinger");
  await host.getByTestId("flight-start-podrace").click();
  await host.getByTestId("minigame-pod").waitFor({ timeout: 180000 });
  await guest.getByTestId("minigame-pod").waitFor({ timeout: 180000 });
  check(true, "both race pages are open");
  await host.getByTestId("countdown").waitFor({ state: "detached", timeout: 180000 });
  await guest.getByTestId("countdown").waitFor({ state: "detached", timeout: 180000 });
  // The guest brakes (their own pod held back on the host's race), then hands over to the autopilot
  await guest.evaluate(() => { window.__raceInput.throttle = -1; });
  // (the headless pages draw slowly: up to a minute for the brake to tell on the host's race)
  for (let n = 0; n < 30; n++) {
    await sleep(2000);
    if (await host.evaluate(() => (window.__race.racers.find((x) => x.pilot)?.craft.speed ?? 999) < 30)) break;
  }
  const held = await host.evaluate(() => {
    const r = window.__race;
    const mate = r.racers.find((x) => x.pilot);
    const me = r.racers.find((x) => x.party);
    return { mate: mate && { name: mate.name, make: mate.make, speed: Math.round(mate.craft.speed) }, me: Math.round(me.craft.speed), t: r.t };
  });
  say("host's race:", JSON.stringify(held));
  say("host's inputs from members:", JSON.stringify(await host.evaluate(async () => { const m = await import("/src/lib/roadBus.ts"); return Object.fromEntries(Object.entries(m.podBus.inputs).map(([k, v]) => [k, { age: Math.round(performance.now() - v.at), throttle: v.input.throttle, auto: v.input.auto }])); })));
  say("guest's input:", JSON.stringify(await guest.evaluate(() => ({ throttle: window.__raceInput?.throttle, auto: window.__raceInput?.auto }))));
  check(!!held.mate && held.mate.make === "sting" && held.mate.speed < 30 && held.me > 80, "on the host's race the guest's pod is held back by the guest's brake");
  await guest.evaluate(() => { window.__raceInput.throttle = 0; window.__raceInput.auto = true; });
  // (the headless pages draw slowly: up to a minute and a half for the pod to get going again)
  let seen = null;
  for (let n = 0; n < 45; n++) {
    await sleep(2000);
    seen = await guest.evaluate(() => { const r = window.__race; const mine = r.racers.find((x) => x.pilot); return { t: r.t, mine: mine && Math.round(mine.craft.speed), hud: document.querySelector('[data-testid="pod-hud"]')?.textContent ?? "" }; });
    if ((seen.mine ?? 0) > 60) break;
  }
  say("guest's view:", JSON.stringify(seen));
  check(seen.t > held.t && (seen.mine ?? 0) > 60, "the guest's page follows the race as it runs, their own pod now under way");
  await guest.screenshot({ path: `${OUT}/coop-podrace-guest.png`, timeout: 120000 });
  await host.screenshot({ path: `${OUT}/coop-podrace-host.png`, timeout: 120000 });
  // Both leave: each is charged their own entry and hire
  await guest.getByTestId("minigame-exit").click();
  await host.getByTestId("minigame-exit").click();
  await sleep(4000);
  const credits = async (id) => (await api("GET", `/api/characters/${id}`)).json.credits;
  const [a, b] = [await credits(ann.id), await credits(bo.id)];
  say("credits after leaving:", a, b);
  check(a <= 5000 - 1250 && a >= 5000 - 1250 - 100 && b <= 5000 - 1250 && b >= 5000 - 1250 - 100, "each paid their own entry and hire (and a day's lifestyle)");
} catch (e) {
  failed = true;
  say("FAIL", e.message.split("\n")[0]);
  await host.screenshot({ path: `${OUT}/coop-podrace-fail.png` }).catch(() => {});
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await guestContext?.close().catch(() => {});
  await browser.close();
}
process.exit(failed ? 1 : 0);
