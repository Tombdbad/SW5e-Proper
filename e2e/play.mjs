// Acceptance play-through: create character -> create campaign -> play -> move -> combat -> reload.
// Usage: npm run e2e   (env: BASE, OUT, VIEW=phone, FORCE=0 to skip the second character,
// KEEP=1 to leave the created rows in the database). Screenshots of every step go to OUT.
import { open, step, summary, text, api, pick, BASE } from "./lib.mjs";

const ctx = await open();
const { page, browser } = ctx;
const TAG = Date.now().toString(36);
const NAME = "E2E " + TAG;
let charId = null;
let campId = null;
const made = [];
const sleep = (ms) => page.waitForTimeout(ms);
const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
const getChar = async (id) => (await api("GET", `/api/characters/${id}`)).json;

await step(ctx, "home loads", async () => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Your Characters").waitFor({ timeout: 120000 });
});

// Walks the ten creation tabs. Returns the saved character.
async function create(name, cls, species, opts = {}) {
  let saved = null;
  const p = `create ${cls}: `;
  await step(ctx, p + "details", async () => {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Create New Character" }).click({ timeout: 30000 });
    await page.getByText("Character Creation").waitFor();
    await page.getByPlaceholder("Enter character name").fill(name);
    await page.getByPlaceholder("Enter character name").press("Enter");
    await sleep(300);
    if (!page.url().includes("/characters/create")) throw new Error("Enter in the name field left the page");
  });
  await step(ctx, p + "species", async () => {
    await next();
    await pick(page, "Select species", species);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Select class").waitFor({ timeout: 3000 });
    return `picked ${species}; Continue moved to the class step`;
  });
  await step(ctx, p + "class", async () => {
    await pick(page, "Select class", cls);
    await page.getByText(/Hit Die: d\d+/).waitFor();
    return (await text(page)).match(/Hit Die: d\d+/)[0];
  });
  await step(ctx, p + "abilities", async () => {
    await next();
    await page.getByRole("button", { name: "Standard Array" }).click();
    await sleep(200);
  });
  await step(ctx, p + "background", async () => {
    await next();
    await pick(page, "Select background", "Soldier");
  });
  await step(ctx, p + "skills", async () => {
    await next();
    await sleep(300);
    const want = Number(((await text(page)).match(/Choose\s+(\d+)\s+skills/) || [0, 0])[1]);
    if (!want) throw new Error("no skill choices offered");
    const items = page.locator("li.cursor-pointer");
    const n = Math.min(want, await items.count());
    for (let i = 0; i < n; i++) await items.nth(i).click();
    const shown = ((await text(page)).match(/Skills Selected:\s*(\S+)/) || [])[1];
    if (shown !== `${want}/${want}`) throw new Error(`Skills Selected shows ${shown}`);
    return `picked ${shown}`;
  });
  await step(ctx, p + "powers", async () => {
    await next();
    await sleep(400);
    const t = await text(page);
    const line = (t.match(/Force powers: \d+\/\d+ selected/) || ["?"])[0];
    if (opts.forcePowers) {
      const cards = page.locator("div.cursor-pointer.border.rounded-md");
      const n = Math.min(opts.forcePowers, await cards.count());
      if (!n) throw new Error("no force powers offered: " + line);
      for (let i = 0; i < n; i++) await cards.nth(i).click();
      await sleep(200);
      return `${line} -> ${((await text(page)).match(/Force powers: \d+\/\d+ selected/) || ["?"])[0]}`;
    }
    return line;
  });
  await step(ctx, p + "feats", async () => {
    await next();
    await sleep(300);
    return ((await text(page)).match(/Feats \([^)]*\)/) || ["?"])[0];
  });
  await step(ctx, p + "equipment", async () => {
    await next();
    await page.getByText("Equipment Selection").waitFor();
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await sleep(300);
    if (!page.url().includes("/characters/create")) throw new Error("Add submitted the form");
    return ((await text(page)).match(/Credits: \d+/) || ["?"])[0] + " after adding the first item";
  });
  await step(ctx, p + "preview", async () => {
    await next();
    await page.getByText(/Hit Points: \d+/).waitFor();
    return (await text(page)).split("\n").filter((l) => /Hit Points|Armor Class|Skills:|Equipment:/.test(l)).join(" / ");
  });
  await step(ctx, p + "submit saves the character", async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/characters") && r.request().method() === "POST", { timeout: 10000 }),
      page.getByRole("button", { name: "Create Character", exact: true }).click(),
    ]);
    const body = await resp.json().catch(() => ({}));
    if (resp.status() !== 201) throw new Error(`POST /api/characters -> ${resp.status()} ${JSON.stringify(body).slice(0, 300)}`);
    saved = body;
    made.push(body.id);
    await page.waitForURL(/\/campaigns\/create\?characterId=/);
    const a = body.abilityScores;
    return `id ${body.id}: ${body.species} ${body.class}, hp ${body.currentHp}/${body.maxHp}, ac ${body.armorClass}, force ${body.maxForcePoints}, str ${a.strength} dex ${a.dexterity} con ${a.constitution} wis ${a.wisdom}, saves ${body.savingThrowProficiencies}, skills ${body.skillProficiencies}, equipment ${body.equipment}, powers ${(body.forcePowers || []).length}`;
  });
  return saved;
}

await step(ctx, "creation: empty form explains what is missing", async () => {
  await page.goto(BASE + "/characters/create", { waitUntil: "domcontentloaded" });
  await page.getByText("Character Creation").waitFor();
  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Create Character", exact: true }).click();
  await page.getByText(/Choose a species/).waitFor({ timeout: 4000 });
  return (await page.getByText(/Choose a species/).first().innerText()).slice(0, 200);
});

const fighter = await create(NAME, "Fighter", "Human");
charId = fighter?.id ?? null;

await step(ctx, "fighter stats follow the rules", async () => {
  const c = fighter;
  const a = c.abilityScores;
  const want = { str: 16, dex: 15, con: 13, hp: 11, ac: 12 };
  const got = { str: a.strength, dex: a.dexterity, con: a.constitution, hp: c.maxHp, ac: c.armorClass };
  if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  if (String(c.savingThrowProficiencies) !== "strength,constitution") throw new Error("saves " + c.savingThrowProficiencies);
  if (c.skillProficiencies.length !== 2) throw new Error("skills " + c.skillProficiencies);
  return "human +1 str/dex applied, d10 hit die + con, AC 10 + dex";
});

if (!charId) {
  await step(ctx, "FALLBACK create character through the API", async () => {
    const r = await api("POST", "/api/characters", {
      name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 1,
      abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
      maxHp: 12, currentHp: 12, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30,
      equipment: ["Blaster pistol"], startingLocation: "Unknown", skillProficiencies: [], savingThrowProficiencies: [],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    charId = r.json.id;
    made.push(charId);
    return `character ${charId}`;
  });
}

await step(ctx, "campaign: generate (arrived from creation)", async () => {
  if (!page.url().includes("/campaigns/create")) {
    await page.goto(`${BASE}/campaigns/create?characterId=${charId}`, { waitUntil: "domcontentloaded" });
  }
  await page.getByRole("button", { name: "Generate Campaign" }).click();
  await page.getByText("Primary Objective").waitFor();
  return (await text(page)).split("\n").filter((l) => l.trim()).slice(4, 8).join(" / ").slice(0, 200);
});

await step(ctx, "campaign: save creates it and shows it", async () => {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/campaigns") && r.request().method() !== "GET", { timeout: 10000 }),
    page.getByRole("button", { name: "Create Campaign" }).click(),
  ]);
  const body = await resp.json().catch(() => ({}));
  if (resp.status() !== 201) throw new Error(`${resp.request().method()} ${resp.url().replace(BASE, "")} -> ${resp.status()} ${JSON.stringify(body).slice(0, 200)}`);
  campId = body.id;
  await page.waitForURL(new RegExp(`/campaigns/${campId}$`));
  await page.getByText("Locations").first().waitFor();
  if (await page.getByText("Campaign Generator").count()) throw new Error("still showing the generator after saving");
  if (body.characterId !== charId) throw new Error(`campaign belongs to character ${body.characterId}, expected ${charId}`);
  return `campaign ${campId} "${body.name}", ${body.locations.length} locations, ${body.quests.length} quests`;
});

if (!campId) {
  await step(ctx, "FALLBACK create campaign through the API", async () => {
    const r = await api("POST", "/api/campaigns", {
      characterId: charId, name: NAME + " campaign", description: "fallback", npcs: [],
      locations: [
        { id: "l1", name: "Docks", type: "port", description: "Busy docks" },
        { id: "l2", name: "Market", type: "city", description: "Crowded market" },
      ],
      quests: [{ id: "q1", title: "Find the droid", description: "x", status: "active", objectives: [{ description: "look", completed: false }] }],
      startingLocation: "Docks",
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    campId = r.json.id;
    return `campaign ${campId}`;
  });
}

await step(ctx, "character page: reload, edit HP on the sheet, save", async () => {
  await page.goto(`${BASE}/characters/${charId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).first().waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).first().waitFor();
  const before = await getChar(charId);
  const hp = page.locator('input[type="number"]').first();
  await hp.fill(String(before.maxHp - 3));
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/characters/${charId}`) && r.request().method() !== "GET", { timeout: 8000 }),
    page.getByRole("button", { name: "Save Changes" }).click(),
  ]);
  if (resp.status() !== 200) throw new Error(`save -> ${resp.status()} ${(await resp.text()).slice(0, 200)}`);
  const after = await getChar(charId);
  if (after.currentHp !== before.maxHp - 3) throw new Error(`server hp ${after.currentHp}`);
  return `hp ${before.currentHp} -> ${after.currentHp} saved from the sheet`;
});

await step(ctx, "character page: roll buttons give numbers", async () => {
  const roll = page.getByRole("button", { name: /roll|check/i }).first();
  if (!(await roll.count())) return "no roll button on the first tab (skipped)";
  await roll.click();
  await sleep(500);
  const t = await text(page);
  const m = t.match(/1d20 \(([^)]*)\)/);
  if (m && !/^\d+(, \d+)?/.test(m[1])) throw new Error("roll text: " + m[0]);
  return m ? m[0] : "clicked, no roll text found";
});

await step(ctx, "home: campaign listed, Play opens the game", async () => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByText("Your Campaigns").waitFor({ timeout: 20000 });
  await page.locator(`a[href="/game/${campId}"]`).click();
  await page.waitForURL(new RegExp(`/game/${campId}$`));
});

let locs = [];
await step(ctx, "play: HUD shows the character", async () => {
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 30000 });
  const c = await getChar(charId);
  await page.getByText(`${c.currentHp}/${c.maxHp}`).first().waitFor();
  locs = (await api("GET", `/api/campaigns/${campId}`)).json.locations.map((l) => l.name);
  if (!(await page.locator("canvas").count())) throw new Error("no map canvas");
  await sleep(1500);
  return `HP ${c.currentHp}/${c.maxHp}; locations: ${locs.join(", ")}`;
});

await step(ctx, "play: move to another location, kept after reload", async () => {
  const target = locs[locs.length - 1];
  await page.getByRole("button", { name: target, exact: true }).click();
  await sleep(600);
  const saved = (await api("GET", `/api/campaigns/${campId}`)).json.currentLocation;
  if (saved !== target) throw new Error(`server has "${saved}", wanted "${target}"`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 30000 });
  await page.locator("p", { hasText: target }).first().waitFor();
  return `now at ${target}`;
});

await step(ctx, "play: rest restores HP", async () => {
  await page.getByRole("button", { name: /Rest/ }).click();
  await sleep(800);
  const c = await getChar(charId);
  if (c.currentHp !== c.maxHp) throw new Error(`hp ${c.currentHp}/${c.maxHp}`);
  await page.getByText(`${c.maxHp}/${c.maxHp}`).first().waitFor();
  return `HP ${c.currentHp}/${c.maxHp}`;
});

// Fights until the combat panel closes. Returns what the panel last showed for the player.
async function fight() {
  await page.getByRole("button", { name: "Test Combat" }).click();
  await page.getByText(/Combat - Round/).waitFor();
  const seen = [];
  let turns = 0;
  let lastHp = null;
  for (let i = 0; i < 200; i++) {
    if (!(await page.getByText(/Combat - Round/).count())) break;
    const row = await page.locator("li", { hasText: "(you)" }).first().innerText().catch(() => "");
    const m = row.match(/(\d+)\/(\d+)\s*$/);
    if (m) lastHp = Number(m[1]);
    const log = await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => []);
    for (const l of log) if (!seen.includes(l)) seen.push(l);
    const melee = page.getByRole("button", { name: "Melee", exact: true });
    if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) {
      turns += 1;
      await melee.click().catch(() => {});
    }
    await sleep(300);
  }
  if (await page.getByText(/Combat - Round/).count()) throw new Error("combat did not end; log: " + seen.slice(-4).join(" | "));
  return { seen, turns, lastHp };
}

let hpAfter = null;
await step(ctx, "play: combat runs to an end with sane numbers, HP written back", async () => {
  const before = await getChar(charId);
  let total = { seen: [], turns: 0 };
  let after = before;
  // Fight (resting in between) until a fight actually costs HP, so the write-back is exercised
  for (let n = 0; n < 4 && after.currentHp === before.currentHp; n++) {
    if (n) {
      await page.getByRole("button", { name: /Rest/ }).click();
      await sleep(600);
    }
    const f = await fight();
    total.seen.push(...f.seen);
    total.turns += f.turns;
    await sleep(900);
    after = await getChar(charId);
  }
  hpAfter = after.currentHp;
  const dmg = total.seen.map((l) => (l.match(/for (\S+) damage/) || [])[1]).filter(Boolean);
  const odd = dmg.filter((d) => !/^[1-9]\d*$/.test(d) || Number(d) > 22);
  if (odd.length) throw new Error(`implausible damage values: ${odd.join(", ")}`);
  if (!dmg.length) throw new Error("no hits logged");
  if (after.currentHp === before.currentHp) throw new Error("player never lost HP in 4 fights; write-back not exercised");
  await page.getByText(`${after.currentHp}/${after.maxHp}`).first().waitFor();
  return `player turns ${total.turns}; hp ${before.currentHp} -> ${after.currentHp}; damage rolls ${dmg.join(",")}; last lines: ${total.seen.slice(-2).join(" | ")}`;
});

await step(ctx, "play: HP change kept after reload", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 30000 });
  const c = await getChar(charId);
  if (c.currentHp !== hpAfter) throw new Error(`server hp ${c.currentHp}, expected ${hpAfter}`);
  await page.getByText(`${c.currentHp}/${c.maxHp}`).first().waitFor();
  const blocked = c.currentHp === 0 ? await page.getByRole("button", { name: "Test Combat" }).isDisabled() : null;
  if (blocked === false) throw new Error("Test Combat is enabled at 0 HP");
  return `HUD shows ${c.currentHp}/${c.maxHp}` + (blocked ? "; Test Combat disabled at 0 HP" : "");
});

await step(ctx, "play: tabs and local map do not crash", async () => {
  for (const t of ["Inventory", "GM Interface", "Quests"]) {
    await page.getByRole("tab", { name: t }).click();
    await sleep(300);
  }
  await page.getByRole("button", { name: "Local Map" }).click();
  await sleep(1200);
  await page.getByRole("button", { name: "Galaxy Map" }).click();
  await sleep(600);
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 3000 });
});

if (process.env.FORCE !== "0") {
  const consular = await create("E2E force " + TAG, "Consular", "Zabrak", { forcePowers: 2 });
  await step(ctx, "consular gets force points and powers", async () => {
    if (!consular) throw new Error("not created");
    if (!(consular.maxForcePoints > 0)) throw new Error(`maxForcePoints ${consular.maxForcePoints}`);
    if ((consular.forcePowers || []).length !== 2) throw new Error(`powers ${(consular.forcePowers || []).length}`);
    return `force points ${consular.maxForcePoints}, hp ${consular.maxHp}, powers ${consular.forcePowers.map((x) => x.name).join(", ")}`;
  });
}

if (!process.env.KEEP) {
  await step(ctx, "home: delete buttons remove the test data", async () => {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("Your Campaigns").waitFor({ timeout: 20000 });
    for (const id of made) {
      const card = page
        .locator("div", { has: page.locator(`a[href="/characters/${id}"]`) })
        .filter({ has: page.getByRole("button", { name: "Delete" }) })
        .last();
      await card.getByRole("button", { name: "Delete" }).click();
      await page.locator(`a[href="/characters/${id}"]`).waitFor({ state: "detached", timeout: 8000 });
    }
    const left = (await api("GET", "/api/characters")).json.filter((c) => made.includes(c.id)).length;
    const camps = (await api("GET", "/api/campaigns")).json.filter((c) => made.includes(c.characterId)).length;
    if (left || camps) throw new Error(`${left} characters and ${camps} campaigns left`);
    return `deleted ${made.length} characters and their campaigns`;
  });
}
const failed = summary();
await browser.close();
process.exit(failed ? 1 : 0);
