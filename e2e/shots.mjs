// Screenshots of the home page and of a fight in progress, on temporary data. VIEW=phone for the phone size.
import { open, api, BASE, OUT } from "./lib.mjs";

const { browser, page, events } = await open();
const ch = (await api("POST", "/api/characters", {
  name: "Shot Taker", species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 1,
  abilityScores: { strength: 16, dexterity: 15, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
  maxHp: 11, currentHp: 11, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30,
  equipment: ["Blaster Pistol"], startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"],
})).json;
const camp = (await api("POST", "/api/campaigns", {
  characterId: ch.id, name: "Shot Taker's Campaign", description: "Screenshots", npcs: [],
  locations: [
    { id: "l1", name: "Docks", type: "port", description: "Busy docks" },
    { id: "l2", name: "Market", type: "city", description: "Crowded market" },
  ],
  quests: [{ id: "q1", title: "Find the droid", description: "Somewhere in the market", status: "active", objectives: [{ description: "look", completed: false }] }],
  startingLocation: "Docks",
})).json;
try {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByText("Your Campaigns").waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Shot Taker" }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Test Combat" }).click();
  await page.getByText(/Combat - Round/).waitFor();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/combat.png` });
  console.log("saved", `${OUT}/home.png`, `${OUT}/combat.png`);
} finally {
  await api("DELETE", `/api/characters/${ch.id}`);
  for (const e of events) if (!/GL Driver|Future Flag/.test(e)) console.log(e);
  await browser.close();
}
