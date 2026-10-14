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
    const picked = [];
    for (const id of ["background-tools", "background-languages"]) {
      const box = page.getByTestId(id);
      if (!(await box.count())) continue;
      // The heading says how many to pick: "(0/2)"
      const want = Number((await box.locator("h4").innerText()).match(/\(0\/(\d+)\)/)[1]);
      for (let i = 0; i < want; i++) {
        const option = box.getByRole("button").nth(i);
        picked.push((await option.innerText()).trim());
        await option.click();
      }
      await box.getByText(`(${want}/${want})`).waitFor();
    }
    opts.picked = picked;
    return `picked ${picked.join(", ") || "nothing (none offered)"}`;
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
    for (const name of opts.picked ?? []) {
      if (![...(body.toolProficiencies || []), ...(body.languages || [])].includes(name)) throw new Error(`${name} was picked but not saved: tools ${body.toolProficiencies}, languages ${body.languages}`);
    }
    return `id ${body.id}: ${body.species} ${body.class}, hp ${body.maxHp}, ac ${body.armorClass}, power points ${body.maxForcePoints}, str ${a.strength} dex ${a.dexterity} con ${a.constitution} int ${a.intelligence}, saves ${body.savingThrowProficiencies}, skills ${body.skillProficiencies}, feats ${body.feats}, tools ${body.toolProficiencies}, languages ${body.languages}, equipment ${body.equipment}, credits ${body.credits}, powers ${(body.forcePowers || []).length}`;
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
  // Two class skills, two background skills, and Piloting from the Ace Pilot feat
  if (c.skillProficiencies.length !== 5 || !c.skillProficiencies.includes("Piloting")) throw new Error("skills " + c.skillProficiencies);
  if ((c.feats || []).length !== 1) throw new Error("feats " + c.feats);
  // Standard array puts 12 in Intelligence; Ace Pilot, the first Soldier feat, raises it by 1
  if (String(c.feats) !== "Ace Pilot" || a.intelligence !== 13) throw new Error(`feat ${c.feats}, intelligence ${a.intelligence}`);
  return "species choice applied, d10 + Con, armor counted, 8d4 x 100 starting wealth spent, 2 + 2 skills, background feat with its +1 Intelligence and Piloting";
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
let questTitles = [];
await step(ctx, "campaign: saved with a generated world and quests in it", async () => {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/campaigns") && r.request().method() === "POST", { timeout: 20000 }),
    page.getByRole("button", { name: "Create Campaign" }).click(),
  ]);
  const body = await resp.json().catch(() => ({}));
  if (resp.status() !== 201) throw new Error(`POST /api/campaigns -> ${resp.status()} ${JSON.stringify(body).slice(0, 200)}`);
  campId = body.id;
  world = body.galaxyMap;
  if (!world || body.currentLocation !== world.startId) throw new Error("no world, or the party is not at its start");
  const targets = (body.quests || []).flatMap((q) => q.objectives).filter((o) => o.target && world.areas[o.target.areaId]);
  if (!targets.length) throw new Error("the campaign's quests do not point into its world: " + JSON.stringify(body.quests).slice(0, 200));
  questTitles = body.quests.map((q) => q.title);
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

await step(ctx, "play: the quests tab shows the world's quests with their objectives", async () => {
  await page.getByRole("tab", { name: "Quests" }).click();
  const panel = (await page.getByTestId("play-quests").innerText()).replace(/\n/g, " | ");
  if (!questTitles.some((title) => panel.includes(title))) throw new Error("none of the campaign's quests is shown: " + panel.slice(0, 300));
  if (!/[\u25cb\u2713]/.test(panel)) throw new Error("no objectives are listed: " + panel.slice(0, 300));
  return panel.slice(0, 300);
});

await step(ctx, "play: off-world travel is by shuttle and paid passage without a ship", async () => {
  const camp = await getCamp();
  const trail = [];
  for (let a = camp.galaxyMap.areas[world.startId]; a; a = camp.galaxyMap.areas[a.parentId]) trail.push(a);
  const settlement = trail.find((a) => a.kind === "settlement");
  const system = trail.find((a) => a.kind === "system");
  await api("PATCH", `/api/campaigns/${campId}`, { currentLocation: system.id });
  await api("PATCH", `/api/characters/${charId}`, { credits: 1000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  const lane = page.getByTestId("play-exits").getByRole("button").filter({ hasText: /passage \d+ cr/ }).first();
  const label = (await lane.innerText()).replace(/\s+/g, " ");
  const fare = Number(label.match(/passage (\d+) cr/)[1]);
  await lane.click();
  await sleep(2000);
  const after = await getChar(charId);
  if (after.credits !== 1000 - fare) throw new Error(`fare ${fare}, credits 1000 -> ${after.credits}`);
  const there = (await getCamp()).currentLocation;
  if (there === system.id) throw new Error("the party did not leave the system");
  // Back to where the play-through continues
  await api("PATCH", `/api/campaigns/${campId}`, { currentLocation: settlement.id });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  const shuttle = await page.getByTestId("play-exits").getByRole("button").filter({ hasText: /Take off/ }).first().innerText();
  if (!/by shuttle/.test(shuttle)) throw new Error("take-off is not by shuttle: " + shuttle);
  return `"${label}" charged ${fare} credits; "${shuttle.replace(/\s+/g, " ")}"`;
});

await step(ctx, "character page: enough experience offers a level, and taking it applies the class table", async () => {
  const before = await getChar(charId);
  await api("PATCH", `/api/characters/${charId}`, { experience: 300 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await page.getByTestId("play-level-up").click();
  await page.waitForURL(new RegExp(`/characters/${charId}$`));
  const panel = page.getByTestId("advancement");
  await panel.getByRole("button", { name: "Level up to 2" }).click({ timeout: 60000 });
  await sleep(1200);
  const c = await getChar(charId);
  // A Fighter's d10: 6 + 2 Constitution
  if (c.level !== 2 || c.maxHp !== before.maxHp + 8) throw new Error(`level ${c.level}, hp ${before.maxHp} -> ${c.maxHp}`);
  await page.getByRole("tab", { name: "Features" }).click();
  const features = await page.getByTestId("features").locator("summary").allInnerTexts();
  if (!features.some((f) => /Action Surge/.test(f)) || !features.some((f) => /Ace Pilot/.test(f))) throw new Error("features: " + features.join(" | ").slice(0, 300));
  await page.goto(`${BASE}/game/${campId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await page.getByTestId("play-hit-dice").getByText(/Level 2 · Hit Dice 2\/2/).waitFor();
  return `level 2, hp ${before.maxHp} -> ${c.maxHp}; ${features.length} features listed (${features.slice(-3).map((f) => f.replace(/\s+/g, " ")).join("; ")})`;
});

await step(ctx, "play: the HUD tabs do not crash", async () => {
  for (const t of ["Inventory", "GM Interface", "Quests"]) {
    await page.getByRole("tab", { name: t }).click();
    await sleep(300);
  }
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 3000 });
});

// The 3D map, in a campaign of its own (seed 7: the party starts in a cantina's entrance with
// nobody hostile about). Things on the map are found through window.__map3d, which the map
// keeps for this purpose, and tapped where they are on the screen.
{
  const PHONE = process.env.VIEW === "phone";
  const poke = (x, y) => (PHONE ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const at = async (key) => {
    for (let i = 0; i < 40; i++) {
      const p = await page.evaluate((k) => window.__map3d?.at(k) ?? null, key);
      if (p) return p;
      await sleep(250);
    }
    throw new Error("nothing on the map for " + key);
  };
  // Zoom out until something is on the part of the map that can be tapped
  const inView = async (key) => {
    const box = await page.locator("canvas").boundingBox();
    for (let i = 0; i < 15; i++) {
      const p = await at(key);
      if (p.x > box.x + 10 && p.x < box.x + box.width - 10 && p.y > box.y + 50 && p.y < box.y + box.height - 10) return p;
      await page.mouse.move(box.x + 100, box.y + box.height / 2);
      for (let n = 0; n < 6; n++) {
        await page.mouse.wheel(0, 400);
        await sleep(60);
      }
      await sleep(500);
    }
    throw new Error(key + " cannot be brought into view");
  };
  const tap = async (key) => {
    const p = await inView(key);
    await poke(p.x, p.y);
  };
  const doubleTap = async (key) => {
    const p = await inView(key);
    await poke(p.x, p.y);
    await sleep(150);
    await poke(p.x, p.y);
  };
  const trail = async () => (await page.getByTestId("map-trail").getByRole("button").allInnerTexts()).filter((t) => !/party/.test(t));
  const world = (await api("POST", "/api/world/generate", { options: { seed: 7 } })).json.world;
  const areas = Object.values(world.areas);
  const start = world.areas[world.startId];
  const building = world.areas[start.parentId];
  let mapCamp = null;
  const where = async () => (await api("GET", `/api/campaigns/${mapCamp}`)).json;
  const arrive = async (areaId) => {
    for (let i = 0; i < 40 && (await where()).currentLocation !== areaId; i++) await sleep(400);
    const now = (await where()).currentLocation;
    if (now !== areaId) throw new Error(`the party is at ${world.areas[now]?.name ?? now}, not at ${world.areas[areaId].name}`);
    await sleep(2000);
  };
  const openGame = async () => {
    await page.goto(`${BASE}/game/${mapCamp}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
    await sleep(2500);
  };

  await step(ctx, "3D map: no 2D plan; a tap on the floor walks the character there", async () => {
    const made = await api("POST", "/api/campaigns", {
      characterId: charId, name: "E2E map " + TAG, description: "the 3D map", npcs: [], locations: [], quests: [],
      startingLocation: "start", currentLocation: world.startId, galaxyMap: world,
    });
    if (made.status !== 201) throw new Error(made.text.slice(0, 200));
    mapCamp = made.json.id;
    await openGame();
    if (await page.locator("[data-testid=room-plan], [data-testid=floor-plan], [data-testid=room-grid]").count()) throw new Error("the 2D room plan is still shown");
    const l = start.layout;
    const blocked = (x, y) => l.assets.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
    let goal;
    for (let y = l.height - 1; y >= 0 && !goal; y--) for (let x = l.width - 1; x >= 0 && !goal; x--) if (!blocked(x, y)) goal = { x, y };
    const square = `sq:${l.x + goal.x},${l.y + goal.y}`;
    const before = await at("me");
    await tap(square);
    await sleep(3500);
    const [after, want] = [await at("me"), await at(square)];
    if (Math.hypot(after.x - want.x, after.y - want.y) > 40) throw new Error(`the character is at ${JSON.stringify(after)}, not at ${JSON.stringify(want)} (was at ${JSON.stringify(before)})`);
    return `${start.name}, ${l.width} x ${l.height} squares: walked to square ${goal.x},${goal.y}`;
  });

  await step(ctx, "3D map: a tap on the way out walks to it and goes outside; a signpost leads on", async () => {
    await tap(`exit:${building.id}`);
    await arrive(building.id);
    // Out of doors the camera follows the character, so the ground slides past as they walk
    const mark = `sq:${start.layout.x},${start.layout.y}`;
    const [me, fixed] = [await at("me"), await at(mark)];
    await poke(me.x - 70, me.y + 50);
    await sleep(3000);
    const slid = await at(mark);
    if (Math.hypot(slid.x - fixed.x, slid.y - fixed.y) < 15) throw new Error("the character did not walk on the ground outside");
    const street = world.paths.find((p) => p.from === building.id || p.to === building.id);
    const next = street.from === building.id ? street.to : street.from;
    await tap(`sign:${next}`);
    await arrive(next);
    return `outside ${building.name}, then by signpost to ${world.areas[next].name}`;
  });

  await step(ctx, "3D map: a secret way is found from outside and used from outside", async () => {
    const room = areas.find((a) => a.secretEntry && a.occupants.every((o) => o.disposition !== "hostile")) ?? areas.find((a) => a.secretEntry);
    await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: room.parentId });
    await openGame();
    for (let i = 0; i < 60 && !(await where()).galaxyMap.areas[room.id].secretEntry.found; i++) {
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await sleep(500);
    }
    if (!(await where()).galaxyMap.areas[room.id].secretEntry.found) throw new Error("60 searches never found it");
    await sleep(1500);
    await tap(`secret:${room.id}`);
    await arrive(room.id);
    return `${room.secretEntry.name} into ${room.name} of ${world.areas[room.parentId].name}`;
  });

  await step(ctx, "3D map: double taps open galaxy > system > planet > settlement > building", async () => {
    const here = (await where()).currentLocation;
    const chain = [];
    for (let a = world.areas[here]; a; a = world.areas[a.parentId]) chain.unshift(a);
    const [system, planet, settlement] = ["system", "planet", "settlement"].map((kind) => chain.find((a) => a.kind === kind));
    await page.getByTestId("map-trail").getByRole("button", { name: "Galaxy" }).click();
    await sleep(2000);
    const seen = [];
    // A building the party is not at, and that no street leads to from where it is
    const linked = world.paths.filter((p) => p.from === world.areas[here].parentId || p.to === world.areas[here].parentId).flatMap((p) => [p.from, p.to]);
    const other = areas.find((a) => a.kind === "building" && a.parentId === settlement.id && !linked.includes(a.id));
    for (const place of [system, planet, settlement, other]) {
      // Headless Chromium can take longer over a frame than a double tap lasts: try again if so
      const name = place.name.replace(/ System$/, "");
      for (let attempt = 0; attempt < 3 && (await trail()).pop() !== name; attempt++) {
        await doubleTap(`area:${place.id}`);
        await sleep(2200);
      }
      const now = await trail();
      if (now[now.length - 1] !== place.name.replace(/ System$/, "")) throw new Error(`a double tap on ${place.name} left the view at ${now.join(" > ")}`);
      seen.push(now[now.length - 1]);
    }
    if ((await where()).currentLocation !== here) throw new Error("looking at another place moved the party");
    await page.getByTestId("map-party").click();
    await sleep(1500);
    return `Galaxy > ${seen.join(" > ")}, then back to the party`;
  });

  await step(ctx, "3D map: a fight is fought on the map; a tap on a lit square moves the character", async () => {
    const lair = areas.find((a) => a.kind === "room" && a.layout && a.occupants.some((o) => o.disposition === "hostile" && o.hitPoints));
    const hp = (await getChar(charId)).currentHp;
    await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: lair.id });
    await openGame();
    await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click();
    await page.getByText(/Combat - Round/).waitFor();
    if (await page.getByTestId("combat-grid").count()) throw new Error("the 2D fight grid is still shown");
    await sleep(2500);
    let moved = "";
    for (let i = 0; i < 60 && !moved && (await page.getByText(/Combat - Round/).count()); i++) {
      const end = page.getByRole("button", { name: "End turn" });
      const save = page.getByRole("button", { name: "Death saving throw" });
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if (await end.isEnabled().catch(() => false)) {
        const me = await at("me");
        // One square over, whichever way is free
        for (const [dx, dy] of [[34, -4], [-34, 4], [0, 30], [0, -30]]) {
          await poke(me.x + dx, me.y + dy);
          await sleep(1000);
          moved = (await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts()).find((line) => /moves \d+ ft/.test(line) && line.startsWith(NAME)) ?? "";
          if (moved) break;
        }
        if (!moved) await end.click().catch(() => {});
      }
      await sleep(600);
    }
    if (await page.getByText(/Combat - Round/).count()) await page.getByRole("button", { name: "Leave" }).click();
    await sleep(800);
    // Leave the character as the play-through had them
    await api("PATCH", `/api/characters/${charId}`, { currentHp: hp, conditions: [] });
    if (!moved) throw new Error("a tap on the map never moved the character in the fight");
    return `${lair.name}: ${moved}`;
  });

  await step(ctx, "3D map: people go about the cantina; a double tap on the bar calls the bartender over", async () => {
    const bar = areas.find((a) => a.name === "Main bar" && a.parentId === start.parentId);
    if (!bar) throw new Error("the starting cantina has no main bar");
    const roles = bar.occupants.map((o) => o.role);
    if (roles.includes("civilians")) throw new Error("people are still a crowd");
    if (roles.filter((r) => r === "musician").length < 3 || !bar.layout.assets.some((a) => a.name === "Bandstand")) throw new Error("no band on a stage: " + roles.join(", "));
    await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: bar.id });
    await openGame();
    const people = bar.layout.assets.filter((a) => a.kind === "npc");
    const before = await Promise.all(people.map((a) => at(`asset:${a.id}`)));
    await sleep(20000);
    const after = await Promise.all(people.map((a) => at(`asset:${a.id}`)));
    const moved = people.filter((_, i) => Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y) > 8).length;
    if (!moved) throw new Error("nobody moved in 20 seconds");
    const counter = bar.layout.assets.find((a) => a.name === "Bar counter");
    const tender = bar.occupants.find((o) => o.role === "bartender");
    await doubleTap(`asset:${counter.id}`);
    await page.getByTestId("map-card").getByText(tender.name, { exact: true }).waitFor({ timeout: 30000 });
    return `${roles.length} people, ${moved} moved in 20 s; ${tender.name} came over to the bar`;
  });
}

if (process.env.FORCE !== "0") {
  const consular = await create("E2E force " + TAG, "Consular", "Zabrak", { increases: [["+1 to one", ["dex"]]], forcePowers: 2 });
  await step(ctx, "consular matches the Player's Handbook", async () => {
    if (!consular) throw new Error("not created");
    const a = consular.abilityScores;
    // Zabrak +2 Con and +1 Dex; d6 hit die and 1 more for Toughness; force points 4 x level + the better of Wisdom and Charisma
    const want = { con: 15, dex: 15, hp: 9, force: 4, powers: 2, credits: 1200 };
    const got = { con: a.constitution, dex: a.dexterity, hp: consular.maxHp, force: consular.maxForcePoints, powers: (consular.forcePowers || []).length, credits: consular.credits };
    if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    if (String(consular.savingThrowProficiencies) !== "wisdom,charisma") throw new Error("saves " + consular.savingThrowProficiencies);
    const natural = (consular.weapons || []).find((w) => w.natural);
    if (natural?.damage !== "1d4") throw new Error("Zabrak unarmed strike not saved: " + JSON.stringify(consular.weapons));
    return `force points ${consular.maxForcePoints}, powers ${consular.forcePowers.map((x) => x.name).join(", ")}; ${natural.name} ${natural.damage}; Toughness +1 hp`;
  });

  let forceCamp = null;
  await step(ctx, "consular in play: the powers chosen in creation are cast in a fight", async () => {
    const generated = (await api("POST", "/api/world/generate", { options: { seed: 3 } })).json;
    const foe = (await api("POST", "/api/world/occupant", { statBlock: "flesh-raider" })).json;
    generated.world.areas[generated.world.startId].occupants.push({ ...foe, disposition: "hostile", count: 1 });
    const made = await api("POST", "/api/campaigns", {
      characterId: consular.id, name: "E2E force " + TAG, description: "cast powers", npcs: [], locations: [], quests: generated.quests,
      startingLocation: "start", currentLocation: generated.world.startId, galaxyMap: generated.world,
    });
    if (made.status !== 201) throw new Error(made.text.slice(0, 200));
    forceCamp = made.json.id;
    await page.goto(`${BASE}/game/${forceCamp}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "E2E force " + TAG }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Fight", exact: true }).click();
    await page.getByText(/Combat - Round/).waitFor();
    const listed = (await page.getByTestId("combat-powers").innerText()).replace(/\n/g, " ");
    for (const power of consular.forcePowers) if (!listed.includes(power.name)) throw new Error(`${power.name} is not offered in the fight: ${listed}`);
    const seen = [];
    for (let i = 0; i < 240; i++) {
      if (!(await page.getByText(/Combat - Round/).count())) break;
      for (const l of await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])) if (!seen.includes(l)) seen.push(l);
      const save = page.getByRole("button", { name: "Death saving throw" });
      const power = page.getByTestId("combat-powers").getByRole("button").first();
      const melee = page.getByRole("button", { name: "Melee", exact: true });
      const cast = seen.some((l) => /casts/.test(l));
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if (!cast && (await power.count()) && (await power.isEnabled().catch(() => false))) await power.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
      await sleep(300);
    }
    const casts = seen.filter((l) => /casts/.test(l));
    if (!casts.length) throw new Error("no power was cast; log: " + seen.slice(-5).join(" | "));
    return `offered: ${listed.slice(0, 200)}; ${casts[0]}; unarmed line: ${seen.find((l) => /Unarmed strike|unarmed/i.test(l)) ?? "(melee log does not name the weapon)"}`;
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
