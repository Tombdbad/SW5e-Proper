// Acceptance play-through: create characters by the real rules -> create a campaign with a
// generated world -> edit the world -> play: fight, loot, travel -> reload.
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
const getCamp = async () => (await api("GET", `/api/campaigns/${campId}`)).json;

await step(ctx, "rules data: imported and served", async () => {
  const manifest = (await api("GET", "/api/sw5e")).json;
  const counts = Object.fromEntries(Object.entries(manifest.datasets).map(([k, v]) => [k, v.count]));
  if (!(counts.species > 100 && counts.classes === 10 && counts.powers > 400 && counts.monsters > 250)) throw new Error(JSON.stringify(counts));
  const troopers = (await api("GET", "/api/sw5e/monsters?search=trooper&fields=name&limit=3")).json;
  if (troopers.length !== 3) throw new Error("search returned " + troopers.length);
  return `data version ${manifest.dataVersion}: ${counts.species} species, ${counts.classes} classes, ${counts.archetypes} archetypes, ${counts.powers} powers, ${counts.equipment} items, ${counts.enhancedItems} enhanced items, ${counts.monsters} stat blocks`;
});

await step(ctx, "world generator: 25 seeds, all sound against the rules data", async () => {
  let areas = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const r = await api("POST", "/api/world/generate", { options: { seed, partyLevel: 1 + (seed % 20), partySize: 1 + (seed % 4), systemsPerRegion: 1 + (seed % 3) } });
    if (r.status !== 200) throw new Error(`seed ${seed}: HTTP ${r.status}`);
    if (r.json.problems.length) throw new Error(`seed ${seed}: ${r.json.problems.slice(0, 2).join(" ")}`);
    areas += Object.keys(r.json.world.areas).length;
  }
  const again = await Promise.all([1, 2].map(() => api("POST", "/api/world/generate", { options: { seed: 7 } })));
  if (again[0].text !== again[1].text) throw new Error("the same seed gave two different worlds");
  return `${areas} areas in all; the same seed gives the same world`;
});

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
    await page.getByText("Character Creation").waitFor({ timeout: 60000 });
    await page.getByPlaceholder("Enter character name").fill(name);
    await page.getByPlaceholder("Enter character name").press("Enter");
    await sleep(300);
    if (!page.url().includes("/characters/create")) throw new Error("Enter in the name field left the page");
  });
  await step(ctx, p + "species and its ability score choices", async () => {
    await next();
    await pick(page, "Select species", species);
    // opts.increases: [[text that identifies the increase, abilities to pick]]
    for (const [label, abilities] of opts.increases ?? []) {
      const row = page.locator("li", { hasText: label });
      for (const ability of abilities) await row.getByRole("button", { name: ability, exact: true }).click();
    }
    const shown = await page.locator("li", { hasText: "of your choice" }).allInnerTexts();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Select class").waitFor({ timeout: 3000 });
    return `picked ${species}; ${shown.map((s) => s.split("\n")[0]).join("; ")}`;
  });
  await step(ctx, p + "class", async () => {
    await pick(page, "Select class", cls);
    await page.getByText(/Hit Die: d\d+/).waitFor();
    const t = await text(page);
    return `${t.match(/Hit Die: d\d+/)[0]}; ${t.match(/Saving Throws: [^\n]+/)[0]}`;
  });
  await step(ctx, p + "abilities", async () => {
    await next();
    await page.getByRole("button", { name: "Standard Array" }).click();
    await sleep(200);
  });
  await step(ctx, p + "background", async () => {
    await next();
    await pick(page, "Select background", "Soldier");
    await page.getByText(/choose 2 in the Skills step/).waitFor();
  });
  await step(ctx, p + "skills from class and background", async () => {
    await next();
    await sleep(300);
    const want = Number(((await text(page)).match(/Choose\s+(\d+)\s+skills/) || [0, 0])[1]);
    if (!want) throw new Error("no skill choices offered");
    const items = page.locator("li.cursor-pointer");
    for (let i = 0; i < want; i++) await items.nth(i).click();
    for (let i = 0; i < 2; i++) await page.locator("button[data-background-skill]:not([disabled]):not(.bg-blue-600)").first().click();
    const t = await text(page);
    const shown = (t.match(/Skills Selected:\s*(\S+)/) || [])[1];
    if (shown !== `${want}/${want}`) throw new Error(`Skills Selected shows ${shown}`);
    if (!/\(\s*2\/2\)/.test(t)) throw new Error("background skills not 2/2");
    return `class ${shown}, background 2/2`;
  });
  await step(ctx, p + "powers", async () => {
    await next();
    await sleep(400);
    const line = ((await text(page)).match(/Force powers: \d+\/\d+ selected/) || ["?"])[0];
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
  await step(ctx, p + "background feat", async () => {
    await next();
    await sleep(300);
    await page.getByRole("checkbox").first().click();
    const shown = ((await text(page)).match(/Feats \([^)]*\)/) || ["?"])[0];
    if (shown !== "Feats (1/1)") throw new Error(shown);
    return shown;
  });
  await step(ctx, p + "equipment bought with class starting wealth", async () => {
    await next();
    await page.getByText("Equipment Selection").waitFor();
    const before = ((await text(page)).match(/Credits: \d+/) || ["?"])[0];
    for (const item of opts.buy ?? []) {
      await page.getByPlaceholder("Search equipment...").fill(item);
      const card = page.locator("div.flex-col", { has: page.getByRole("heading", { name: item, exact: true }) }).last();
      await card.getByRole("button", { name: "Add", exact: true }).click();
    }
    await sleep(300);
    if (!page.url().includes("/characters/create")) throw new Error("Add submitted the form");
    return `${before} -> ${((await text(page)).match(/Credits: \d+/) || ["?"])[0]} after ${(opts.buy ?? []).join(", ") || "nothing"}`;
  });
  await step(ctx, p + "preview", async () => {
    await next();
    await page.getByText(/Hit Points: \d+/).waitFor();
    await sleep(400);
    return (await text(page)).split("\n").filter((l) => /Hit Points|Armor Class|Power Points|Saving Throws|Skills:|Feats:|Equipment:/.test(l)).join(" / ");
  });
  await step(ctx, p + "submit saves the character", async () => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/characters") && r.request().method() === "POST", { timeout: 40000 }),
      page.getByRole("button", { name: "Create Character", exact: true }).click({ timeout: 40000 }),
    ]);
    const body = await resp.json().catch(() => ({}));
    if (resp.status() !== 201) throw new Error(`POST /api/characters -> ${resp.status()} ${JSON.stringify(body).slice(0, 300)}`);
    saved = body;
    made.push(body.id);
    await page.waitForURL(/\/campaigns\/create\?characterId=/);
    const a = body.abilityScores;
    return `id ${body.id}: ${body.species} ${body.class}, hp ${body.maxHp}, ac ${body.armorClass}, power points ${body.maxForcePoints}, str ${a.strength} dex ${a.dexterity} con ${a.constitution}, saves ${body.savingThrowProficiencies}, skills ${body.skillProficiencies}, feats ${body.feats}, equipment ${body.equipment}, credits ${body.credits}, powers ${(body.forcePowers || []).length}`;
  });
  return saved;
}

await step(ctx, "creation: empty form explains what is missing", async () => {
  await page.goto(BASE + "/characters/create", { waitUntil: "domcontentloaded" });
  await page.getByText("Character Creation").waitFor({ timeout: 60000 });
  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Create Character", exact: true }).click();
  await page.getByText(/Choose a species/).waitFor({ timeout: 4000 });
  return (await page.getByText(/Choose a species/).first().innerText()).slice(0, 200);
});

const fighter = await create(NAME, "Fighter", "Human", {
  increases: [["+2 to one", ["str"]], ["+1 to 2", ["dex", "con"]]],
  buy: ["Blaster pistol", "Vibroblade", "Combat suit"],
});
charId = fighter?.id ?? null;

await step(ctx, "fighter matches the Player's Handbook", async () => {
  const c = fighter;
  const a = c.abilityScores;
  // Standard array 15/14/13 with Human +2 Str, +1 Dex, +1 Con; d10 hit die; combat suit 11 + Dex
  const want = { str: 17, dex: 15, con: 14, hp: 12, ac: 13, credits: 2000 - 175 - 200 - 100, force: 0 };
  const got = { str: a.strength, dex: a.dexterity, con: a.constitution, hp: c.maxHp, ac: c.armorClass, credits: c.credits, force: c.maxForcePoints };
  if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  if (String(c.savingThrowProficiencies) !== "strength,constitution") throw new Error("saves " + c.savingThrowProficiencies);
  if (c.skillProficiencies.length !== 4) throw new Error("skills " + c.skillProficiencies);
  if ((c.feats || []).length !== 1) throw new Error("feats " + c.feats);
  return "species choice applied, d10 + Con, armor counted, 8d4 x 100 starting wealth spent, 2 + 2 skills, background feat";
});

if (!charId) {
  await step(ctx, "FALLBACK create character through the API", async () => {
    const r = await api("POST", "/api/characters", {
      name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 1,
      abilityScores: { strength: 17, dexterity: 15, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      maxHp: 12, currentHp: 12, maxForcePoints: 0, currentForcePoints: 0, armorClass: 13, speed: 30,
      equipment: ["Blaster pistol", "Vibroblade", "Combat suit"], startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"],
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
  await page.getByRole("button", { name: "Generate Campaign" }).click({ timeout: 60000 });
  await page.getByText("Primary Objective").waitFor();
  return (await text(page)).split("\n").filter((l) => l.trim()).slice(4, 6).join(" / ").slice(0, 200);
});

let world = null;
await step(ctx, "campaign: saved with a generated world", async () => {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/campaigns") && r.request().method() === "POST", { timeout: 20000 }),
    page.getByRole("button", { name: "Create Campaign" }).click(),
  ]);
  const body = await resp.json().catch(() => ({}));
  if (resp.status() !== 201) throw new Error(`POST /api/campaigns -> ${resp.status()} ${JSON.stringify(body).slice(0, 200)}`);
  campId = body.id;
  world = body.galaxyMap;
  if (!world || body.currentLocation !== world.startId) throw new Error("no world, or the party is not at its start");
  await page.waitForURL(new RegExp(`/campaigns/${campId}$`));
  await page.getByTestId("world-status").waitFor();
  if (!(await page.getByTestId("world-status").innerText()).includes("Map is sound")) throw new Error(await page.getByTestId("world-status").innerText());
  const kinds = {};
  for (const a of Object.values(world.areas)) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  return `campaign ${campId}; hostile faction ${world.antagonist}; ${Object.entries(kinds).map(([k, n]) => `${n} ${k}s`).join(", ")}, ${world.paths.length} paths; start: ${await page.getByTestId("world-trail").innerText()}`.replace(/\s*›\s*/g, " > ").replace(/\n/g, "");
});

await step(ctx, "world editor: place a stat block and a loot cache where the party starts", async () => {
  await page.getByLabel("Search the rules data").fill("flesh raider");
  await page.getByRole("button", { name: /^\+ Flesh Raider \(CR 1\/8\)$/ }).click();
  await page.getByTestId("world-occupants").getByText("Flesh Raider").waitFor();
  await page.getByRole("button", { name: "Add Loot Cache" }).click();
  await page.getByLabel("Credits").last().fill("50");
  await page.getByLabel("Search in").selectOption("equipment");
  await page.getByLabel("Search the rules data").fill("medpac");
  await page.getByRole("button", { name: "+ Medpac", exact: true }).last().click();
  await page.getByTestId("world-occupants").getByText("Medpac").waitFor();
  return (await page.getByTestId("world-occupants").innerText()).split("\n").filter((l) => /Flesh Raider|Cache|Medpac/.test(l)).join(" | ").slice(0, 260);
});

await step(ctx, "world editor: add a room, join it, and refuse an edit that would cut the map", async () => {
  const trail = page.getByTestId("world-trail").getByRole("button");
  await trail.nth((await trail.count()) - 2).click(); // the building the party starts in
  await page.getByLabel("New room name").fill("Secret Vault");
  await page.getByRole("button", { name: "Add room" }).click();
  await page.getByTestId("world-children").getByRole("button", { name: "Secret Vault" }).click();
  const exits = await page.getByTestId("world-exits").innerText();
  if (!/Door/.test(exits)) throw new Error("the new room has no door: " + exits);
  const route = await page.getByTestId("world-route").innerText();
  // Its only door cannot be removed
  await page.getByTestId("world-exits").getByRole("button", { name: "Remove" }).first().click();
  await page.getByText(/would cut off part of the map/).first().waitFor({ timeout: 4000 });
  if (!(await page.getByTestId("world-status").innerText()).includes("Map is sound")) throw new Error("map no longer sound");
  return `${exits.split("\n")[0]}; ${route}`;
});

await step(ctx, "world editor: save, and the rules data check passes", async () => {
  await page.getByRole("button", { name: "Check Against Rules Data" }).click();
  await page.getByText(/Every stat block and item is in the rules data/).waitFor({ timeout: 10000 });
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/campaigns/${campId}`) && r.request().method() === "PUT", { timeout: 15000 }),
    page.getByRole("button", { name: "Save Campaign" }).click(),
  ]);
  if (resp.status() !== 200) throw new Error(`save -> ${resp.status()} ${(await resp.text()).slice(0, 200)}`);
  const saved = (await getCamp()).galaxyMap;
  const start = saved.areas[saved.startId];
  const vault = Object.values(saved.areas).find((a) => a.name === "Secret Vault");
  if (!vault || vault.parentId !== start.parentId) throw new Error("the new room was not saved");
  if (!start.occupants.some((o) => o.statBlock === "flesh-raider") || !start.loot.some((c) => c.items.some((i) => i.name === "Medpac"))) throw new Error("placed contents were not saved");
  const check = await api("POST", "/api/world/validate", { world: saved });
  if (check.json.problems.length) throw new Error(check.json.problems.join(" "));
  world = saved;
  return `saved ${Object.keys(saved.areas).length} areas; server finds no problems`;
});

await step(ctx, "world: an unvisited planet is built on demand", async () => {
  const startPlanet = (() => { let a = world.areas[world.startId]; while (a.kind !== "planet") a = world.areas[a.parentId]; return a.id; })();
  const other = Object.values(world.areas).find((a) => a.kind === "planet" && a.id !== startPlanet && !Object.values(world.areas).some((c) => c.parentId === a.id));
  const r = await api("POST", "/api/world/expand", { world, areaId: other.id });
  if (r.status !== 200 || r.json.problems.length) throw new Error(JSON.stringify(r.json).slice(0, 300));
  const added = Object.keys(r.json.world.areas).length - Object.keys(world.areas).length;
  const sites = Object.values(r.json.world.areas).filter((a) => a.parentId === other.id).map((a) => `${a.name} (${a.type})`);
  return `${other.name} (${other.type}): ${added} new areas; ${sites.join(", ")}`;
});

await step(ctx, "character page: reload, edit HP on the sheet, save", async () => {
  await page.goto(`${BASE}/characters/${charId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).first().waitFor({ timeout: 60000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).first().waitFor({ timeout: 60000 });
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

await step(ctx, "character page: inventory shows the equipment bought", async () => {
  await page.getByRole("tab", { name: "Inventory" }).click();
  await page.getByText("Blaster pistol").first().waitFor({ timeout: 5000 });
  await page.getByText("Combat suit").first().waitFor();
});

await step(ctx, "home: campaign listed, Play opens the game", async () => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByText("Your Campaigns").waitFor({ timeout: 20000 });
  await page.locator(`a[href="/game/${campId}"]`).click();
  await page.waitForURL(new RegExp(`/game/${campId}$`));
});

await step(ctx, "play: the party is at the world's start", async () => {
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  const c = await getChar(charId);
  await page.getByText(`${c.currentHp}/${c.maxHp}`).first().waitFor();
  const start = world.areas[world.startId];
  await page.getByTestId("play-here").getByText(start.name).waitFor();
  if (!(await page.locator("canvas").count())) throw new Error("no map canvas");
  await sleep(1200);
  return `${await page.getByTestId("play-trail").innerText()} › ${start.name}; ${(await page.getByTestId("play-occupants").innerText()).split("\n").join(", ")}`;
});

let hpAfter = null;
await step(ctx, "play: enemies bar the way; the fight uses their stat block and the character's weapons", async () => {
  const exits = page.getByTestId("play-exits").getByRole("button");
  if (!(await exits.first().isDisabled())) throw new Error("exits are open although an enemy is here");
  const seen = [];
  let weapons = "";
  let won = false;
  let revived = 0;
  for (let attempt = 0; attempt < 8 && !won; attempt++) {
    const now = await getChar(charId);
    if ((now.conditions ?? []).includes("Dead")) {
      await page.getByTestId("play-dead").getByRole("button", { name: /Revive/ }).click();
      await sleep(800);
      if (((await getChar(charId)).conditions ?? []).includes("Dead")) throw new Error("Revive did not clear Dead");
      revived += 1;
    }
    if (now.currentHp <= 1) {
      // Cannot rest with enemies about, so heal through the API
      await api("PATCH", `/api/characters/${charId}`, { currentHp: now.maxHp });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
    }
    await page.getByRole("button", { name: "Fight", exact: true }).click();
    await page.getByText(/Combat - Round/).waitFor();
    weapons = await page.getByText(/^Melee: /).innerText();
    for (let i = 0; i < 200; i++) {
      if (!(await page.getByText(/Combat - Round/).count())) break;
      for (const l of await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])) if (!seen.includes(l)) seen.push(l);
      const save = page.getByRole("button", { name: "Death saving throw" });
      const melee = page.getByRole("button", { name: "Melee", exact: true });
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
      await sleep(300);
    }
    await sleep(1200);
    won = !(await getCamp()).galaxyMap.areas[world.startId].occupants.some((o) => o.disposition === "hostile");
  }
  if (!won) throw new Error("the Flesh Raider was never beaten; log: " + seen.slice(-4).join(" | "));
  const dmg = seen.map((l) => (l.match(/for (\S+) damage/) || [])[1]).filter(Boolean);
  const odd = dmg.filter((d) => !/^[1-9]\d*$/.test(d) || Number(d) > 30);
  if (odd.length) throw new Error(`implausible damage values: ${odd.join(", ")}`);
  if (!/Vibroblade/.test(weapons) || !/Blaster pistol/.test(weapons)) throw new Error("weapons not taken from equipment: " + weapons);
  const c = await getChar(charId);
  hpAfter = c.currentHp;
  if (!(c.experience >= 25)) throw new Error(`experience ${c.experience}`);
  const saves = seen.filter((l) => /^Death save/.test(l)).length;
  return `${weapons}; damage rolls ${dmg.join(",")}; ${saves} death saves, revived ${revived} times; hp now ${c.currentHp}/${c.maxHp}; experience ${c.experience}`;
});

await step(ctx, "play: loot goes to the character, and both survive a reload", async () => {
  const before = await getChar(charId);
  await page.getByTestId("play-loot").filter({ hasText: /^Cache/ }).getByRole("button", { name: "Take" }).click();
  await sleep(1000);
  const after = await getChar(charId);
  if (after.credits !== before.credits + 50 || !after.equipment.includes("Medpac")) throw new Error(`credits ${before.credits} -> ${after.credits}, equipment ${after.equipment}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  if (after.currentHp !== hpAfter) throw new Error(`hp ${after.currentHp}, expected ${hpAfter}`);
  await page.getByText(`${after.currentHp}/${after.maxHp}`).first().waitFor();
  await page.getByTestId("play-loot").filter({ hasText: /^Cache/ }).getByText("(empty)").waitFor();
  return `credits ${before.credits} -> ${after.credits}; carrying ${after.equipment.join(", ")}; HUD ${after.currentHp}/${after.maxHp}`;
});

await step(ctx, "play: travel along a path, kept after reload", async () => {
  const exit = page.getByTestId("play-exits").getByRole("button").filter({ hasNotText: /Unlock/ }).first();
  const label = (await exit.innerText()).replace(/\s+/g, " ");
  await exit.click();
  await sleep(800);
  const here = (await getCamp()).currentLocation;
  if (here === world.startId) throw new Error("the party did not move");
  const area = (await getCamp()).galaxyMap.areas[here];
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await page.getByTestId("play-here").getByText(area.name).waitFor();
  return `took "${label}" to ${area.name} (${area.kind})`;
});

await step(ctx, "play: a short rest spends a Hit Die, a long rest restores everything", async () => {
  await api("PATCH", `/api/characters/${charId}`, { currentHp: 1, hitDiceUsed: 0 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  const short = page.getByRole("button", { name: "Short rest" });
  if (await short.isDisabled()) return "enemies here: resting is not allowed (skipped)";
  await short.click();
  await sleep(800);
  const rested = await getChar(charId);
  // A Fighter's d10 + 2 Constitution heals at least 3
  if (rested.hitDiceUsed !== 1 || rested.currentHp < 4) throw new Error(`short rest: hp ${rested.currentHp}, Hit Dice used ${rested.hitDiceUsed}`);
  await page.getByTestId("play-hit-dice").getByText("Hit Dice 0/1").waitFor();
  await page.getByRole("button", { name: "Long rest" }).click();
  await sleep(800);
  const c = await getChar(charId);
  if (c.currentHp !== c.maxHp || c.hitDiceUsed !== 0) throw new Error(`long rest: hp ${c.currentHp}/${c.maxHp}, Hit Dice used ${c.hitDiceUsed}`);
  await page.getByText(`${c.maxHp}/${c.maxHp}`).first().waitFor();
  return `short rest 1 -> ${rested.currentHp} HP for one Hit Die; long rest ${c.currentHp}/${c.maxHp} HP and the Hit Die back`;
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
  const consular = await create("E2E force " + TAG, "Consular", "Zabrak", { increases: [["+1 to one", ["dex"]]], forcePowers: 2 });
  await step(ctx, "consular matches the Player's Handbook", async () => {
    if (!consular) throw new Error("not created");
    const a = consular.abilityScores;
    // Zabrak +2 Con and +1 Dex; d6 hit die; force points 4 x level + the better of Wisdom and Charisma
    const want = { con: 15, dex: 15, hp: 8, force: 4, powers: 2, credits: 1200 };
    const got = { con: a.constitution, dex: a.dexterity, hp: consular.maxHp, force: consular.maxForcePoints, powers: (consular.forcePowers || []).length, credits: consular.credits };
    if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    if (String(consular.savingThrowProficiencies) !== "wisdom,charisma") throw new Error("saves " + consular.savingThrowProficiencies);
    return `force points ${consular.maxForcePoints}, powers ${consular.forcePowers.map((x) => x.name).join(", ")}`;
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
