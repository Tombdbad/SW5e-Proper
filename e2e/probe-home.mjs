// Is the home page slow after a 3D scene was visited in the same tab? Opens a game page, goes home,
// and deletes a character while sampling the CPU of each Chromium process type.
// Usage: BASE=http://127.0.0.1:5001 [VISIT=0 to skip the game page] node e2e/probe-home.mjs
import { open, api, BASE } from "./lib.mjs";
import { execSync } from "child_process";

const ctx = await open();
const { page } = ctx;
const NAME = "ProbeHome " + Date.now().toString(36);
const mk = async (n) => (await api("POST", "/api/characters", {
  name: n, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
  abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
  maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
  startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
})).json;
const procs = () => {
  const out = {};
  for (const l of execSync("ps -eo pcpu,args | grep -E 'headless_shell|chrom' | grep -v grep").toString().split("\n").filter(Boolean)) {
    const [cpu, ...rest] = l.trim().split(/\s+/);
    const t = (rest.join(" ").match(/--type=([\w-]+)/) || [, "browser"])[1];
    out[t] = Math.round(((out[t] || 0) + Number(cpu)) * 10) / 10;
  }
  return out;
};
const a = await mk(NAME + " a"), b = await mk(NAME + " b");
try {
  if (process.env.VISIT !== "0") {
    const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
    const camp = (await api("POST", "/api/campaigns", { characterId: a.id, name: NAME, description: "p", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: world.startId, galaxyMap: world })).json;
    await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: a.name }).waitFor({ timeout: 90000 });
    await page.waitForTimeout(3000);
  }
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByText("Your Campaigns").waitFor({ timeout: 30000 });
  for (let i = 0; i < 4; i++) { console.log(`home +${i}s cpu`, JSON.stringify(procs())); await page.waitForTimeout(1000); }
  for (const c of [a, b]) {
    const t = Date.now();
    const card = page.locator("div", { has: page.locator(`a[href="/characters/${c.id}"]`) }).filter({ has: page.getByRole("button", { name: "Delete" }) }).last();
    await card.getByRole("button", { name: "Delete" }).click();
    const gone = await page.locator(`a[href="/characters/${c.id}"]`).waitFor({ state: "detached", timeout: 30000 }).then(() => true).catch(() => false);
    console.log(`delete ${c.id}: card ${gone ? "gone" : "STILL THERE"} after ${Date.now() - t}ms; cpu`, JSON.stringify(procs()));
  }
} finally {
  await ctx.browser.close().catch(() => {});
  for (const c of [a, b]) await api("DELETE", `/api/characters/${c.id}`);
}
