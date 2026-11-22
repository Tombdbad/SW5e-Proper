// Reload probe: opens the hangar scene (a ship model) and reports where the time goes while it loads.
// Usage: BASE=http://127.0.0.1:5001 [W=1280 H=900] [WAIT=40000] node e2e/probe.mjs
// Prints: when domcontentloaded / the heading / a trivial evaluate come back, the CPU of each Chromium
// process type once a second, and the main thread's busiest functions from a V8 CPU profile.
import { open, api, BASE } from "./lib.mjs";
import { execSync } from "child_process";

const W = Number(process.env.W || 1280), H = Number(process.env.H || 900), WAIT = Number(process.env.WAIT || 40000);
const ctx = await open();
const { page } = ctx;
await page.setViewportSize({ width: W, height: H });
const NAME = "Probe " + Date.now().toString(36);
const made = [];
const c = (await api("POST", "/api/characters", {
  name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
  abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
  maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
  startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
})).json;
made.push(c.id);
const world = (await api("POST", "/api/world/generate", { options: { seed: Number(process.env.SEED || 3), partyLevel: 3 } })).json.world;
const room = Object.values(world.areas).find((a) => a.kind === "room" && a.ships.length && a.layout?.assets.some((x) => x.kind === "ship"));
for (const r of Object.values(world.areas).filter((a) => a.parentId === room.parentId)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
const camp = (await api("POST", "/api/campaigns", { characterId: c.id, name: NAME, description: "probe", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: world.startId, galaxyMap: world, timeElapsed: { total: 480 } })).json;
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const procs = () => {
  const out = {};
  for (const l of execSync("ps -eo pcpu,args | grep -E 'headless_shell|chrom' | grep -v grep").toString().split("\n").filter(Boolean)) {
    const [cpu, ...rest] = l.trim().split(/\s+/);
    const type = (rest.join(" ").match(/--type=([\w-]+)/) || [, "browser"])[1];
    out[type] = (out[type] || 0) + Number(cpu);
  }
  return out;
};
try {
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log(`${since()} start room loaded; moving the party into the hangar (${room.ships[0].name})`);
  await api("PATCH", `/api/campaigns/${camp.id}`, { currentLocation: room.id });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 2000 });
  await cdp.send("Profiler.start");
  const mark = {};
  const watch = setInterval(() => console.log(`${since()} cpu by process ${JSON.stringify(procs())}`), 2000);
  const nav = page.reload({ waitUntil: "domcontentloaded", timeout: WAIT }).then(() => (mark.dcl = since())).catch((e) => (mark.dcl = "TIMEOUT " + since()));
  await Promise.race([nav, page.waitForTimeout(WAIT)]);
  console.log(`${since()} reload: domcontentloaded ${mark.dcl}`);
  const t1 = Date.now();
  const heading = await page.getByRole("heading", { name: NAME }).waitFor({ timeout: WAIT }).then(() => true).catch(() => false);
  console.log(`${since()} heading ${heading ? "appeared" : "NOT seen"}`);
  const ans = await Promise.race([page.evaluate(() => 1).then(() => "answered"), new Promise((r) => setTimeout(() => r("BLOCKED 5s"), 5000))]);
  console.log(`${since()} evaluate ${ans}`);
  clearInterval(watch);
  const { profile } = await Promise.race([cdp.send("Profiler.stop"), new Promise((_, j) => setTimeout(() => j(new Error("Profiler.stop blocked")), 10000))]).catch((e) => ({ profile: null, err: e }));
  if (profile) {
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const n = byId.get(id);
      const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
      self.set(k, (self.get(k) || 0) + (dt[i] || 0));
    });
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    console.log(`main thread profile, ${(total / 1e6).toFixed(1)}s sampled; busiest by self time:`);
    for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${(v / 1000).toFixed(0).padStart(7)}ms  ${k}`);
  } else console.log("no profile (the main thread did not answer)");
  const perf = await page.evaluate(() => window.__perf && { frames: window.__perf.frames, maxGapMs: Math.round(window.__perf.maxGap), longTasks: window.__perf.long.length, worst: window.__perf.long.reduce((m, l) => Math.max(m, l[1]), 0) }).catch(() => null);
  console.log("page perf:", JSON.stringify(perf));
} finally {
  await ctx.browser.close().catch(() => {});
  for (const id of made) await api("DELETE", `/api/characters/${id}`);
}
