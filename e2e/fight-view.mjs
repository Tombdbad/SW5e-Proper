// A fight seen over the shoulder or from the character's eyes (2026-10-19): starts the test combat on temporary data in the given view
// and saves a shot and what the crosshair says. Usage: VIEWMODE=shoulder|first [KEYS="ArrowLeft,400"] BASE=http://127.0.0.1:5001 node e2e/fight-view.mjs
import { open, api, BASE, OUT } from "./lib.mjs";

const mode = process.env.VIEWMODE || "shoulder";
const { browser, page, events } = await open();
await page.setViewportSize({ width: Number(process.env.W || 900), height: Number(process.env.H || 600) });
await page.addInitScript((m) => localStorage.setItem("sw5e.view", m), mode);
const ch = (await api("POST", "/api/characters", {
  name: "Shot Taker", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 1,
  abilityScores: { strength: 16, dexterity: 15, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
  maxHp: 11, currentHp: 11, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30,
  equipment: ["Blaster pistol", "Combat suit"], startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
})).json;
const camp = (await api("POST", "/api/campaigns", {
  characterId: ch.id, name: "Shot Taker's Campaign", description: "Screenshots", npcs: [],
  locations: [{ id: "l1", name: "Docks", type: "port", description: "Busy docks" }],
  quests: [], startingLocation: "Docks",
})).json;
try {
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Shot Taker" }).waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Test Combat" }).click();
  await page.getByText(/Combat - Round/).waitFor({ timeout: 90000 });
  await page.waitForTimeout(Number(process.env.SETTLE || 20000));
  for (const step of (process.env.KEYS || "").split(";").filter(Boolean)) {
    const [key, ms] = step.split(",");
    await page.keyboard.down(key);
    await page.waitForTimeout(Number(ms));
    await page.keyboard.up(key);
    await page.waitForTimeout(1200);
  }
  console.log("reticle", await page.evaluate(() => { const r = document.querySelector('[data-testid="reticle"]'); return r ? `${r.getAttribute("data-kind")} blocked=${r.getAttribute("data-blocked")} "${r.textContent}"` : "none"; }));
  await page.screenshot({ path: `${OUT}/fight-${mode}.png`, timeout: 300000 });
  console.log("saved", `${OUT}/fight-${mode}.png`);
} finally {
  await api("DELETE", `/api/characters/${ch.id}`);
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL/i.test(e)) console.log(e);
  await browser.close();
}
