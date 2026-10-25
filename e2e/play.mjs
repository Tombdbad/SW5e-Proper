// Acceptance play-through: create characters by the real rules -> create a campaign with a
// generated world -> edit the world -> play: fight, loot, travel -> reload.
// Usage: npm run e2e   (env: BASE, OUT, VIEW=phone, FORCE=0 to skip the second character, ONLY=<regex> for steps by name,
// KEEP=1 to leave the created rows in the database). Screenshots of every step go to OUT.
import { open, step, summary, text, api, pick, BASE, OUT } from "./lib.mjs";

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

await step(ctx, "floors: cellars lie beneath, ships are on the top floor, ways between floors are bare", async () => {
  let rooms = 0, below = 0, above = 0, ways = 0, ships = 0, open = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    // (a world with every planet built is large: one more try if the first is dropped)
    let made = await api("POST", "/api/world/generate", { options: { seed, detail: "all" } }).catch(() => null);
    made ??= await api("POST", "/api/world/generate", { options: { seed, detail: "all" } });
    const { world } = made.json;
    const areas = Object.values(world.areas);
    for (const room of areas.filter((a) => a.kind === "room" && a.layout)) {
      rooms++;
      const l = room.layout;
      // (the floor itself, its doors and stairs and the stacked rooms are audited in tests/world/layouts.test.ts, which knows the curve of a round room)
      // (a gallery and a roof are furnished: cover to shoot over, a sentry's post; the rest are bare)
      if (l.form && l.form !== "gallery" && l.form !== "roof" && l.assets.some((a) => a.kind === "furniture" || a.kind === "loot" || a.kind === "ship")) throw new Error(`${room.name} is a way between floors and has something in it`);
      if ((l.level ?? 0) < 0) below++;
      if ((l.level ?? 0) >= 1) above++;
      if (l.form) ways++;
      if (l.roof) {
        const top = Math.max(...areas.filter((a) => a.parentId === room.parentId && a.layout && !a.layout.form).map((a) => a.layout.level ?? 0));
        const siblings = areas.filter((a) => a.parentId === room.parentId && a.layout && !a.layout.form).length;
        if (siblings > 1 && !["landing field", "landing pad"].includes(world.areas[room.parentId].type) && (l.level ?? 0) !== top) throw new Error(`${room.name} holds ships but is not on the top floor`);
        open++;
      }
      if (room.ships.length && !l.roof) throw new Error(`${room.name} holds a ship under a roof`);
      ships += room.ships.length;
    }
  }
  if (!below || !above || !ways || !open) throw new Error(`no cellars (${below}), upper floors (${above}), ways between floors (${ways}) or open hangars (${open})`);
  return `${rooms} rooms: ${below} below the ground, ${above} above it, ${ways} stairwells, lifts, corridors and the like, ${open} hangars open to the sky or with doors, ${ships} ships`;
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
await step(ctx, "play: enemies watch the party but do not bar the way; the fight uses their stat block and the character's weapons", async () => {
  // (House rule since 2026-10-16: watchers see only a few squares, and leaving is a Stealth check, never a bar)
  const exits = page.getByTestId("play-exits").getByRole("button");
  if (await exits.first().isDisabled()) throw new Error("exits are closed by an enemy: they should only be a check");
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
    // A character left for dead comes to in the nearest room with nobody hostile in it: back to the lair
    const wokeElsewhere = (await getCamp()).currentLocation !== world.startId;
    if (wokeElsewhere) await api("PATCH", `/api/campaigns/${campId}`, { currentLocation: world.startId });
    if (now.currentHp <= 1 || wokeElsewhere) {
      // Cannot rest with enemies about, so heal through the API
      await api("PATCH", `/api/characters/${charId}`, { currentHp: now.maxHp });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
    }
    // Enemies that are already attacking (after a lost fight and a revive) start the fight themselves
    if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: "Fight", exact: true }).click();
    await page.getByText(/Combat - Round/).waitFor();
    weapons = await page.getByText(/^Melee: /).innerText();
    for (let i = 0; i < 200; i++) {
      if (!(await page.getByText(/Combat - Round/).count())) break;
      for (const l of await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])) if (!seen.includes(l)) seen.push(l);
      const save = page.getByRole("button", { name: "Death saving throw" });
      const melee = page.getByRole("button", { name: "Melee", exact: true });
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
      else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
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
  const lane = page.getByTestId("play-exits").getByRole("button").filter({ hasText: /flies you: \d+ cr/ }).first();
  const label = (await lane.innerText()).replace(/\s+/g, " ");
  const fare = Number(label.match(/flies you: (\d+) cr/)[1]);
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

await step(ctx, "play: credits are shown; weapons and armor are wielded and worn from the inventory", async () => {
  const hud = page.getByTestId("play-credits");
  await hud.waitFor({ timeout: 5000 });
  const text = await hud.innerText();
  const credits = Number((text.match(/Credits:\s*([\d,]+)/) ?? [])[1]?.replace(/,/g, ""));
  const armorClass = () => page.getByTestId("play-credits").innerText().then((t) => Number((t.match(/AC (\d+)/) ?? [])[1]));
  if (!(credits > 0)) throw new Error("the HUD shows no credits: " + text);
  await page.getByRole("tab", { name: "Inventory" }).click();
  const tab = await page.getByTestId("inventory-credits").innerText();
  if (!tab.includes("Credits:")) throw new Error("the inventory shows no credits: " + tab);
  const ac0 = await armorClass();
  // A weapon put away is not in hand: Play uses what is wielded
  const weapon = page.getByTestId("equip-Vibroblade");
  if ((await weapon.innerText()) !== "Put away") throw new Error("the weapon should start in hand: " + (await weapon.innerText()));
  await weapon.click();
  await page.getByTestId("equip-Vibroblade").filter({ hasText: "Wield" }).waitFor({ timeout: 8000 });
  await page.getByTestId("equip-Vibroblade").click();
  await page.getByTestId("equip-Vibroblade").filter({ hasText: "Put away" }).waitFor({ timeout: 8000 });
  // Armor taken off lowers the armor class; put back on it is as it was
  const suit = page.getByTestId("equip-Combat suit");
  await suit.click();
  await page.getByTestId("equip-Combat suit").filter({ hasText: "Wear" }).waitFor({ timeout: 8000 });
  await sleep(500);
  const ac1 = await armorClass();
  if (!(ac1 < ac0)) throw new Error(`taking the armor off should lower the armor class (${ac0} -> ${ac1})`);
  await page.getByTestId("equip-Combat suit").click();
  await page.getByTestId("equip-Combat suit").filter({ hasText: "Take off" }).waitFor({ timeout: 8000 });
  await sleep(500);
  const ac2 = await armorClass();
  if (ac2 !== ac0) throw new Error(`putting the armor back on should restore the armor class (${ac0} -> ${ac2})`);
  await page.getByRole("tab", { name: "Quests" }).click();
  return `${credits} credits shown; Vibroblade put away and wielded; Combat suit off AC ${ac1}, on AC ${ac2}`;
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
  // Two taps 150 ms apart by the finger's clock. Playwright's own taps wait for a busy page to
  // handle the first before sending the second, which a phone's finger does not; the touches
  // are sent with their times instead.
  const doubleTap = async (key) => {
    const p = await inView(key);
    if (!PHONE) {
      await poke(p.x, p.y);
      await sleep(150);
      await poke(p.x, p.y);
      return;
    }
    const cdp = await page.context().newCDPSession(page);
    const t0 = Date.now() / 1000;
    const touch = (type, t) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: p.x, y: p.y }], timestamp: t });
    await touch("touchStart", t0);
    await touch("touchEnd", t0 + 0.05);
    await touch("touchStart", t0 + 0.15);
    await touch("touchEnd", t0 + 0.2);
    await cdp.detach();
  };
  const trail = async () => (await page.getByTestId("map-trail").getByRole("button").allInnerTexts()).filter((t) => !/party/.test(t));
  const world = (await api("POST", "/api/world/generate", { options: { seed: 7 } })).json.world;
  const areas = Object.values(world.areas);
  const start = world.areas[world.startId];
  const building = world.areas[start.parentId];
  let mapCamp = null;
  const where = async () => (await api("GET", `/api/campaigns/${mapCamp}`)).json;
  const arrive = async (areaId) => {
    for (let i = 0; i < 150 && (await where()).currentLocation !== areaId; i++) await sleep(400);
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
    // (The walk is as long as the room; a slow software renderer takes its time, so wait for the arrival)
    for (let waited = 0; waited < 20000; waited += 500) {
      await sleep(500);
      const [now, goal] = [await at("me"), await at(square)];
      if (Math.hypot(now.x - goal.x, now.y - goal.y) <= 40) break;
    }
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
    // The street is walked across to the way in of another building of the district (a signpost
    // is only for a way out of the district)
    const district = Object.values(world.districtPlans ?? {}).find((plan) => plan.boxes[building.id]);
    const mates = district ? Object.keys(district.boxes).filter((id) => id !== building.id) : [];
    const gate = mates.map((id) => areas.find((a) => a.kind === "room" && a.parentId === id && a.gateway && !a.tags.some((t) => t.startsWith("form:")))).find(Boolean);
    if (gate) {
      await tap(`exit:${gate.id}`);
      await arrive(gate.id);
      return `outside ${building.name}, then across the district into ${gate.name} of ${world.areas[gate.parentId].name}`;
    }
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
    const was = await getChar(charId);
    const hp = was.currentHp;
    let moved = "";
    // A fight is dice: if the character is knocked out before their turn, they are put back on
    // their feet and tried again (those who were hurt stay hurt)
    for (let attempt = 0; attempt < 4 && !moved; attempt++) {
      await api("PATCH", `/api/characters/${charId}`, { currentHp: was.maxHp, conditions: [] });
      await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: lair.id });
      await openGame();
      // (enemies that have already attacked start the fight themselves)
      await sleep(1500);
      if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click();
      await page.getByText(/Combat - Round/).waitFor();
      if (await page.getByTestId("combat-grid").count()) throw new Error("the 2D fight grid is still shown");
      await sleep(2500);
      for (let i = 0; i < 60 && !moved && (await page.getByText(/Combat - Round/).count()); i++) {
        const end = page.getByRole("button", { name: "End turn" });
        const save = page.getByRole("button", { name: "Death saving throw" });
        if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
        else if (await end.isEnabled().catch(() => false)) {
          // One square over, whichever way is free (then two over, then the diagonals): squares are found by the map, not by a guessed pixel size
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const square = await at(`me+${dx},${dy}`);
            await poke(square.x, square.y);
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
    }
    // Leave the character as the play-through had them
    await api("PATCH", `/api/characters/${charId}`, { currentHp: hp, conditions: [] });
    if (!moved) throw new Error("a tap on the map never moved the character in the fight");
    return `${lair.name}: ${moved}`;
  });

  await step(ctx, "time: the clock shows the era and the law; waiting moves it on", async () => {
    // Somewhere quiet: waiting is not allowed with enemies about
    await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: start.id });
    await openGame();
    const before = await page.getByTestId("play-clock").innerText();
    if (!/^Day \d+, \d\d:\d\d, \w+ · .+ · (lawless|frontier law|policed law|strict law)$/.test(before)) throw new Error("clock line: " + before);
    await page.getByRole("button", { name: "Until evening" }).click();
    await page.getByTestId("play-clock").getByText(/18:0\d, evening/).waitFor({ timeout: 10000 });
    const saved = (await api("GET", `/api/campaigns/${mapCamp}`)).json.timeElapsed;
    if (!saved || saved.hours < 18) throw new Error("the clock was not saved: " + JSON.stringify(saved));
    return `${before} -> ${await page.getByTestId("play-clock").innerText()}`;
  });

  await step(ctx, "3D map: people go about the cantina; a double tap on the bar calls the bartender over", async () => {
    const bar = areas.find((a) => a.name === "Main bar" && a.parentId === start.parentId);
    if (!bar) throw new Error("the starting cantina has no main bar");
    const roles = bar.occupants.map((o) => o.role);
    if (roles.includes("civilians")) throw new Error("people are still a crowd");
    if (roles.filter((r) => r === "musician").length < 3 || !bar.layout.assets.some((a) => a.name === "Bandstand")) throw new Error("no band on a stage: " + roles.join(", "));
    // At 21:00, when the bar is full (leave the game first: a page that is left saves its clock)
    await page.goto("about:blank");
    await sleep(1000);
    await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: bar.id, timeElapsed: { total: 21 * 60 } });
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

  await step(ctx, "trade: the bartender's menu, buying and selling a drink, haggling", async () => {
    const card = page.locator("[data-testid=map-card], [data-testid=hud-trade]");
    await card.getByTestId("trade").waitFor({ timeout: 10000 });
    const stock = card.getByTestId("trade-stock");
    const first = stock.locator("li").first();
    const line = (await first.innerText()).replace(/\s+/g, " ");
    const name = line.replace(/ x\d+.*$/, "");
    const before = await getChar(charId);
    await first.getByRole("button", { name: "Buy" }).click();
    await sleep(1500);
    const after = await getChar(charId);
    if (!after.equipment.includes(name) || after.credits >= before.credits) throw new Error(`bought ${name}? credits ${before.credits} -> ${after.credits}`);
    await card.getByRole("button", { name: "Sell" }).first().click();
    const offer = card.getByTestId("trade-offers").locator("li", { hasText: name }).first();
    await offer.waitFor({ timeout: 5000 });
    await offer.getByRole("button", { name: "Sell" }).click();
    await sleep(1500);
    const sold = await getChar(charId);
    if (sold.credits <= after.credits) throw new Error("selling paid nothing");
    await card.getByRole("button", { name: "Haggle" }).click();
    await card.getByRole("button", { name: /Haggled|Offended/ }).waitFor({ timeout: 5000 });
    const ledger = (await api("GET", `/api/campaigns/${mapCamp}`)).json.availableResources;
    if (!ledger?.traders || !Object.keys(ledger.traders).length) throw new Error("the day's dealings were not saved");
    return `${line}; paid ${before.credits - after.credits}, got back ${sold.credits - after.credits}; haggle tried`;
  });

  await step(ctx, "routines: the cantina is busy in the evening and quiet in the morning", async () => {
    const bar = areas.find((a) => a.name === "Main bar" && a.parentId === start.parentId);
    const at = async (total) => {
      // Leave the game first: a page that is left saves its own clock
      await page.goto("about:blank");
      await sleep(1000);
      await api("PATCH", `/api/campaigns/${mapCamp}`, { currentLocation: bar.id, timeElapsed: { total } });
      await openGame();
      return await page.getByTestId("play-occupants").locator("li").count();
    };
    const evening = await at(2 * 1440 + 21 * 60);
    const morning = await at(2 * 1440 + 9 * 60);
    if (evening <= morning) throw new Error(`21:00: ${evening}, 09:00: ${morning}`);
    return `Main bar at 21:00: ${evening} people; at 09:00: ${morning}`;
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
    // Enemies that are already attacking (after a lost fight and a revive) start the fight themselves
    // (the first frame of the 3D map blocks a page on this VM for a while: the button is waited for a minute, not fifteen seconds)
    if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: "Fight", exact: true }).click({ timeout: 60000 });
    await page.getByText(/Combat - Round/).waitFor({ timeout: 60000 });
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
      // A power that moves things asks what to move and which way
      const choose = page.getByTestId("motion-chooser").locator("button:not([disabled])").first();
      if ((await choose.count()) && !/Cancel|Drop/.test(await choose.innerText().catch(() => "Cancel"))) await choose.click().catch(() => {});
      else if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if (!cast && (await power.count()) && (await power.isEnabled().catch(() => false))) await power.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
      else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
      await sleep(300);
    }
    const casts = seen.filter((l) => /casts/.test(l));
    if (!casts.length) throw new Error("no power was cast; log: " + seen.slice(-5).join(" | "));
    return `offered: ${listed.slice(0, 200)}; ${casts[0]}; unarmed line: ${seen.find((l) => /Unarmed strike|unarmed/i.test(l)) ?? "(melee log does not name the weapon)"}`;
  });
}

// Moving things with the Force (2026-10-18): a crate is pushed with Force Push/Pull out of a
// fight and stays where it stops; in a fight a crate is picked out on the map and hurled at an
// enemy with Force Throw, strikes it, and stays where it landed once the fight is over.
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
  let campaign = null;
  let roomId = null;
  let crateId = null;
  const crateNow = async () => (await api("GET", `/api/campaigns/${campaign}`)).json.galaxyMap.areas[roomId].layout.assets.find((a) => a.id === crateId);
  await step(ctx, "force moves: a crate pushed with Force Push/Pull stays where it stops", async () => {
    const rows = (await api("GET", "/api/sw5e/powers?fields=name,level,description,forceAlignment&limit=1000")).json;
    const list = Array.isArray(rows) ? rows : rows.items;
    const known = ["Force Push/Pull", "Force Throw"].map((n) => list.find((p) => p.name === n));
    const r = await api("POST", "/api/characters", {
      name: "E2E mover " + TAG, species: "Togruta", class: "Consular", background: "Jedi", alignment: "Lawful Good", level: 5,
      abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 16, charisma: 12 },
      maxHp: 60, currentHp: 60, maxForcePoints: 20, currentForcePoints: 20, armorClass: 14, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Perception"], savingThrowProficiencies: ["wisdom", "charisma"],
      forcePowers: known, equipment: ["Lightsaber"],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 200));
    made.push(r.json.id);
    // A room with nothing in it but a crate two squares in from its way in, and nobody about
    const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
    const room = world.areas[world.startId];
    roomId = room.id;
    room.occupants = [];
    room.layout.assets = room.layout.assets.filter((a) => a.side);
    const exit = room.layout.assets.find((a) => a.kind === "exit");
    const inward = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }[exit.side];
    crateId = `${room.id}-e2e-crate`;
    room.layout.assets.push({ id: crateId, kind: "furniture", name: "Crate", x: exit.x + inward[0] * 3, y: exit.y + inward[1] * 3, w: 1, h: 1, blocks: true, cover: true });
    const madeCamp = await api("POST", "/api/campaigns", { characterId: r.json.id, name: "E2E force moves " + TAG, description: "force moves", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: world.startId, galaxyMap: world });
    if (madeCamp.status !== 201) throw new Error(madeCamp.text.slice(0, 200));
    campaign = madeCamp.json.id;
    await page.goto(`${BASE}/game/${campaign}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "E2E mover " + TAG }).waitFor({ timeout: 60000 });
    await sleep(4000);
    const before = await crateNow();
    const p = await at(`asset:${crateId}`);
    await poke(p.x, p.y);
    await page.getByTestId("force-moves").waitFor({ timeout: 10000 });
    const card = (await page.getByTestId("force-moves").innerText()).replace(/\n/g, " ");
    if (!/medium object/i.test(card) || !/Force Push\/Pull \(at will, 10 ft\)/.test(card)) throw new Error("card: " + card);
    await page.getByTestId("force-push").first().click();
    for (let i = 0; i < 20 && JSON.stringify(await crateNow()) === JSON.stringify(before); i++) await sleep(500);
    const after = await crateNow();
    const moved = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
    if (!moved) throw new Error(`the crate did not move: ${JSON.stringify(before)}`);
    return `crate (${before.x},${before.y}) -> (${after.x},${after.y}), ${moved * 5} ft; card: ${card.slice(0, 120)}`;
  });

  await step(ctx, "force moves: in a fight a crate is hurled at an enemy and stays where it lands", async () => {
    if (!campaign) throw new Error("no campaign from the step before");
    const foe = (await api("POST", "/api/world/occupant", { statBlock: "trooper" })).json;
    const world = (await api("GET", `/api/campaigns/${campaign}`)).json.galaxyMap;
    const room = world.areas[roomId];
    const crate = room.layout.assets.find((a) => a.id === crateId);
    const exit = room.layout.assets.find((a) => a.kind === "exit");
    const inward = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }[exit.side];
    const spot = { x: Math.min(room.layout.width - 1, Math.max(0, crate.x + inward[0] * 4)), y: Math.min(room.layout.height - 1, Math.max(0, crate.y + inward[1] * 4)) };
    room.occupants.push({ ...foe, id: "o-e2e-foe", hitPoints: 60, disposition: "hostile", count: 1 });
    room.layout.assets.push({ id: "t-e2e-foe", kind: "npc", name: foe.name, ...spot, w: 1, h: 1, ref: "o-e2e-foe" });
    await api("PATCH", `/api/campaigns/${campaign}`, { galaxyMap: world });
    await page.goto(`${BASE}/game/${campaign}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "E2E mover " + TAG }).waitFor({ timeout: 60000 });
    await sleep(3000);
    if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: "Fight", exact: true }).click();
    await page.getByText(/Combat - Round/).waitFor();
    for (let i = 0; i < 60 && !(await page.evaluate(() => { const s = window.__fight.getState(); return !!s.combatants[s.currentTurn]?.isPlayer; })); i++) await sleep(500);
    // A tap on the crate picks it out (again after a moment if the camera was still flying in)
    for (let tries = 0; tries < 6 && !(await page.evaluate(() => window.__fight.getState().objectId)); tries++) {
      await sleep(900);
      const p = await at(`asset:${crateId}`);
      await poke(p.x, p.y);
      for (let i = 0; i < 6 && !(await page.evaluate(() => window.__fight.getState().objectId)); i++) await sleep(250);
    }
    if (!(await page.evaluate(() => window.__fight.getState().objectId))) throw new Error("a tap on the crate did not pick it out");
    await page.getByTestId("combat-powers").getByRole("button", { name: /Force Throw/ }).click();
    await page.getByTestId("motion-chooser").waitFor();
    await page.getByTestId("motion-hurl").click();
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__fight.getState().combatLog.some((l) => /casts Force Throw/.test(l)))); i++) await sleep(250);
    const line = await page.evaluate(() => window.__fight.getState().combatLog.find((l) => /casts Force Throw/.test(l)));
    if (!line || !/flies \d+ feet at/.test(line)) throw new Error("log: " + line);
    const landed = await page.evaluate((id) => window.__fight.getState().arena.assets.find((a) => a.id === id), crateId);
    // Leave the fight: the crate stays where it landed
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    let saved = null;
    for (let i = 0; i < 30; i++) {
      saved = await crateNow();
      if (saved.x === landed.x && saved.y === landed.y) break;
      await sleep(500);
    }
    if (saved.x !== landed.x || saved.y !== landed.y) throw new Error(`landed at ${landed.x},${landed.y} but saved at ${saved.x},${saved.y}`);
    return `${line} | saved at ${saved.x},${saved.y}`;
  });
}

// Gear, companions and transport (2026-10-15): items used from the inventory, tools, a game, a
// disabled droid mended and bolted, a captive freed, a bounty hunter hired, allies and grenades in a
// fight, a beast gentled, speeders taken, mended, bought and driven, and a hangar's empty berth.
// Each part builds its own campaign through the API and drives the page.
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
  const inView = async (key) => {
    const box = await page.locator("canvas").boundingBox();
    for (let i = 0; i < 15; i++) {
      const p = await at(key);
      if (p.x > box.x + 10 && p.x < box.x + box.width - 10 && p.y > box.y + 50 && p.y < box.y + box.height - 10) return p;
      await page.mouse.move(box.x + 100, box.y + box.height / 2);
      for (let n = 0; n < 6; n++) { await page.mouse.wheel(0, 400); await sleep(60); }
      await sleep(500);
    }
    throw new Error(key + " cannot be brought into view");
  };
  const tap = async (key) => { const p = await inView(key); await poke(p.x, p.y); };
  // (a trader's wares and dealings are in the HUD's Trade tab, which opens by itself when one is picked; the rest is on the map card)
  const card = () => page.locator("[data-testid=map-card], [data-testid=hud-trade]");
  const stat = async (statBlock) => (await api("POST", "/api/world/occupant", { statBlock })).json;
  const named = async (search) => (await api("GET", `/api/sw5e/monsters?search=${encodeURIComponent(search)}&fields=id,name`)).json[0];
  const GEAR = "Gear " + TAG;
  const newChar = async (extra) => {
    const r = await api("POST", "/api/characters", {
      name: GEAR, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
      startingLocation: "Unknown", skillProficiencies: ["Athletics", "Perception", "Animal Handling", "Insight", "Deception", "Performance"], savingThrowProficiencies: ["strength", "constitution"],
      ...extra,
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.push(r.json.id);
    return r.json;
  };
  // A campaign on a generated world whose start room has been cleared for the test; `place` fills it
  const newCamp = async (character, seed, edit, extra = {}) => {
    const world = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
    const start = world.areas[world.startId];
    start.occupants = []; start.loot = []; start.ships = [];
    start.layout.assets = start.layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship");
    const put = (o, top = false) => {
      const l = start.layout;
      const blocked = (x, y) => l.assets.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
      const doors = l.assets.filter((a) => a.side).map((a) => `${a.x},${a.y}`);
      const ys = Array.from({ length: l.height }, (_, i) => (top ? i : l.height - 1 - i));
      const xs = Array.from({ length: l.width }, (_, i) => (top ? i : l.width - 1 - i));
      for (const y of ys) for (const x of xs) {
        if (blocked(x, y) || doors.includes(`${x},${y}`)) continue;
        l.assets.push({ id: `t-${o.id}`, kind: "npc", name: o.name, x, y, w: 1, h: 1, ref: o.id });
        start.occupants.push(o);
        return;
      }
    };
    await edit(world, start, put);
    const made2 = await api("POST", "/api/campaigns", { characterId: character.id, name: "E2E gear " + TAG, description: "gear", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: extra.currentLocation ?? world.startId, galaxyMap: world, ...extra });
    if (made2.status !== 201) throw new Error(made2.text.slice(0, 200));
    await page.goto(`${BASE}/game/${made2.json.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(2500);
    return { world, start, id: made2.json.id };
  };
  const campOf = async (id) => (await api("GET", `/api/campaigns/${id}`)).json;
  const toInventory = async () => { await page.getByRole("tab", { name: "Inventory" }).click(); await sleep(300); };
  let g = null;
  let gc = null;

  await step(ctx, "gear: carried items have uses; a medpac heals, a kit lists its activities, a substance gives a high", async () => {
    g = await newChar({
      equipment: ["Blaster pistol", "Vibroblade", "Combat suit", "Medpac", "Medpac", "Traumakit", "Repair kit", "Restraining bolt", "Emergency battery", "Security kit", "Slicer's kit", "Mechanic's kit", "Glitterstim", "Grenade, fragmentation", "Poison", "Sabacc deck", "Flute", "Antitoxkit"],
      toolProficiencies: ["Security kit", "Slicer's kit", "Mechanic's kit", "Sabacc deck", "Flute"], currentHp: 5,
    });
    gc = await newCamp(g, 3, async (world, start, put) => {
      const droid = await stat((await named("B1-A")).id);
      // top corner: at the bottom corner the droid sits under the player's own token on a phone, and the tap picks the player
      put({ ...droid, id: "ox-droid", disposition: "neutral", role: "disabled droid", disabled: true, wounds: [0], loadout: [], saves: { constitution: -10 } }, true);
      put({ ...(await stat((await named("Jawa Tinkerer")).id)), id: "ox-captive", name: "Wuzz", role: "captive", disposition: "friendly", species: "Human", loadout: [], captive: { restraint: "shackles", dc: 12 } });
      put({ ...(await stat((await named("Headhunter")).id)), id: "ox-hire", name: "Kess Varn", role: "bounty hunter", disposition: "neutral", species: "Human" });
      put({ id: "ox-gambler", name: "Dollo", role: "gambler", disposition: "neutral", count: 1, species: "Human", loadout: [] }, true);
    });
    await toInventory();
    for (const n of ["Medpac", "Traumakit", "Repair kit", "Glitterstim", "Grenade, fragmentation", "Poison", "Mechanic's kit", "Sabacc deck", "Flute", "Antitoxkit"]) {
      if (!(await page.getByTestId(`use-${n}`).count())) throw new Error("no Use button for " + n);
    }
    await page.getByTestId("use-Medpac").click();
    await page.getByTestId("use-on-self").click();
    await sleep(1200);
    let c = await getChar(g.id);
    if (!(c.currentHp > 5) || c.equipment.filter((n) => n === "Medpac").length !== 1) throw new Error(`hp ${c.currentHp}, medpacs ${c.equipment.filter((n) => n === "Medpac").length}`);
    await page.getByTestId("use-Mechanic's kit").click();
    const panel = page.getByTestId("tool-panel");
    await panel.waitFor();
    if (!/trained with it/i.test(await panel.innerText())) throw new Error("tool panel: " + (await panel.innerText()).slice(0, 200));
    await panel.getByRole("button", { name: "Try" }).first().click();
    await page.getByTestId("use-Glitterstim").click();
    await page.getByTestId("use-on-self").click();
    await sleep(800);
    c = await getChar(g.id);
    if (c.playState?.substance?.phase !== "high" || c.equipment.includes("Glitterstim")) throw new Error(JSON.stringify(c.playState));
    return `medpac healed to ${c.currentHp}; mechanic's kit panel; Glitterstim: ${c.playState.substance.phase}`;
  });

  await step(ctx, "droid: a disabled droid is stabilized, mended and bolted, and joins the party", async () => {
    await tap("npc:ox-droid");
    await card().getByTestId("disabled-droid").waitFor();
    await card().getByTestId("droid-stabilize").click();
    await sleep(1200);
    await tap("npc:ox-droid");
    await card().getByTestId("droid-mend").click();
    await sleep(1200);
    await tap("npc:ox-droid");
    await card().getByTestId("droid-bolt").click();
    await sleep(1500);
    const c = await getChar(g.id);
    const droid = (c.companionData?.party ?? []).find((p) => p.kind === "droid");
    if (!droid || c.equipment.includes("Restraining bolt")) throw new Error(JSON.stringify(c.companionData));
    return `${droid.name} joined at ${droid.hp}/${droid.maxHp} under a bolt`;
  });

  await step(ctx, "captive and hire: shackles opened with a kit, the freed come along; a bounty hunter is hired for a fee and a wage", async () => {
    let freed = false;
    for (let i = 0; i < 6 && !freed; i++) {
      await tap("npc:ox-captive");
      await card().getByTestId("captive").waitFor();
      await card().getByTestId("free-kit").click();
      await sleep(1200);
      freed = (await campOf(gc.id)).galaxyMap.areas[gc.world.startId].occupants.find((x) => x.id === "ox-captive")?.role === "freed";
    }
    if (!freed) throw new Error("six tries and the shackles held");
    await tap("npc:ox-captive");
    await card().getByTestId("freed-join").click();
    await sleep(1200);
    const before = await getChar(g.id);
    await tap("npc:ox-hire");
    await card().getByTestId("hire").waitFor();
    await card().getByTestId("hire-button").click();
    await sleep(1200);
    const after = await getChar(g.id);
    const hired = after.companionData.party.find((p) => p.kind === "hireling");
    if (!hired || !(after.credits < before.credits) || !(hired.wage > 0) || !after.companionData.party.some((p) => p.kind === "freed")) throw new Error(JSON.stringify(after.companionData));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByTestId("play-party").waitFor();
    if ((await page.getByTestId("party-member").count()) !== 3) throw new Error("party shown: " + (await page.getByTestId("party-member").count()));
    return `party of 3 kept after a reload; hire: credits ${before.credits} -> ${after.credits}, wage ${hired.wage}`;
  });

  await step(ctx, "gambling: five rounds at the table end in a result, and credits move", async () => {
    await sleep(1500);
    await tap("npc:ox-gambler");
    const panel = card().getByTestId("gamble");
    await panel.waitFor();
    await panel.getByTestId("gamble-start").click();
    for (let i = 0; i < 5; i++) {
      await panel.getByTestId("gamble-game").click();
      await sleep(150);
    }
    await panel.getByTestId("gamble-result").waitFor();
    return (await panel.getByTestId("gamble-result").innerText()).replace(/\s+/g, " ").slice(0, 120);
  });

  await step(ctx, "allies: companions fight at the character's side, items are offered, a grenade hits two", async () => {
    const hp = { id: "c-e2e-droid", name: "Bolted B1", kind: "droid", role: "guard", size: "Medium", creature: "droid", armorClass: 14, maxHp: 20, hp: 20, attack: { name: "Blaster rifle", bonus: 6, damage: "1d8+2", ranged: true, range: 80, long: 320 }, speed: 30, saves: {}, loadout: [], wage: 0, joined: 480, bolt: "Restraining bolt" };
    const f = await newChar({ abilityScores: { strength: 20, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 }, equipment: ["Blaster pistol", "Vibroblade", "Combat suit", "Medpac", "Grenade, fragmentation"], companionData: { party: [hp], paidThrough: 1 } });
    const fc = await newCamp(f, 5, async (world, start, put) => {
      const trooper = await stat("trooper");
      put({ ...trooper, id: "ox-foes", disposition: "hostile", role: "guard", count: 2 });
    });
    if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: "Fight", exact: true }).click();
    await page.getByText(/Combat - Round/).waitFor();
    const list = await page.locator("ul.space-y-1 li").allInnerTexts();
    if (!list.some((t) => /\(ally\)/.test(t))) throw new Error("no ally listed: " + JSON.stringify(list));
    const items = await page.getByTestId("combat-items").innerText();
    if (!/Medpac/.test(items) || !/Grenade/.test(items)) throw new Error(items);
    const melee = page.getByRole("button", { name: "Melee", exact: true });
    for (let i = 0; i < 60 && !(await melee.isEnabled().catch(() => false)); i++) await sleep(300);
    await page.getByTestId("combat-item-Grenade, fragmentation").click();
    await sleep(600);
    const log = (await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])).join(" | ");
    for (let i = 0; i < 200 && (await page.getByText(/Combat - Round/).count()); i++) {
      const save = page.getByRole("button", { name: "Death saving throw" });
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
      else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
      await sleep(300);
    }
    await sleep(1500);
    const c = await getChar(f.id);
    if (!(c.experience >= 100)) throw new Error("experience " + c.experience);
    if ((c.companionData?.party ?? []).length !== 1) throw new Error(JSON.stringify(c.companionData));
    return `${/throws Grenade/.test(log) ? "grenade thrown" : "grenade out of range"}; the droid kept its ${c.companionData.party[0].hp}/20; xp ${c.experience}`;
  });

  await step(ctx, "fight depth: a turn has an action, a bonus action and a reaction; Extra Attack; a maneuver; Second Wind; a stat block's multiattack", async () => {
    const d = await newChar({
      level: 5, class: "fighter", maxHp: 55, currentHp: 40, armorClass: 15,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
      equipment: ["Blaster pistol", "Vibrosword", "Combat suit"],
      fighterManeuvers: { styles: ["Dual Wield Style"], maneuvers: ["Precision Attack", "Parry", "Trip Attack", "Inner Strength"] },
    });
    const depthCamp = await newCamp(d, 6, async (world, start, put) => {
      put({ ...(await stat("navy-trooper")), id: "ox-navy", disposition: "hostile", role: "guard", count: 1 });
      put({ ...(await stat("dewback-adult")), id: "ox-dew", disposition: "hostile", role: "wildlife", count: 1 });
    });
    if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click();
    await page.getByText(/Combat - Round/).waitFor();
    const melee = page.getByRole("button", { name: "Melee", exact: true });
    // (a reaction may be offered before the character's turn: Parry against the first hit)
    for (let i = 0; i < 80 && !(await melee.isEnabled().catch(() => false)); i++) {
      const offered = page.getByTestId("combat-reaction-none");
      if (await offered.count()) await offered.click().catch(() => {});
      await sleep(300);
    }
    const economy = (await page.getByTestId("combat-economy").innerText()).replace(/\s+/g, " ");
    if (!/Action/.test(economy) || !/Bonus/.test(economy) || !/Reaction/.test(economy)) throw new Error("economy: " + economy);
    const standard = await page.getByTestId("combat-standard").innerText();
    for (const a of ["Dash", "Disengage", "Dodge", "Hide"]) if (!standard.includes(a)) throw new Error("no " + a + ": " + standard);
    const maneuvers = await page.getByTestId("combat-maneuver").innerText();
    if (!/Precision Attack/.test(maneuvers) || !/Trip Attack/.test(maneuvers)) throw new Error("maneuvers: " + maneuvers);
    const facts = await page.evaluate(() => {
      const s = window.__fight.getState();
      const me = s.combatants.find((c) => c.isPlayer);
      const navy = s.combatants.find((c) => /Navy/.test(c.name));
      return { attacks: Math.max(...me.features.map((f) => f.attacksPerAction ?? 1)), second: !!me.features.find((f) => /Second Wind/.test(f.name))?.heal, dice: me.uses ?? {}, multi: navy?.profile?.multiattack ?? null, offhandStyle: me.features.some((f) => f.offhandModifier) };
    });
    if (facts.attacks !== 2 || !facts.second || !facts.offhandStyle) throw new Error(JSON.stringify(facts));
    if (!facts.multi || facts.multi.length !== 2) throw new Error("the Navy Trooper's multiattack was not read: " + JSON.stringify(facts.multi));
    // Dodge uses the action; Second Wind the bonus action; then the turn passes by itself
    await page.getByTestId("combat-standard").getByRole("button", { name: "Dodge" }).click();
    await sleep(300);
    if (!(await page.evaluate(() => window.__fight.getState().combatants.find((c) => c.isPlayer).dodging))) throw new Error("not dodging");
    const hpBefore = await page.evaluate(() => window.__fight.getState().combatants.find((c) => c.isPlayer).hp);
    await page.getByTestId("combat-feature-Second Wind").click();
    await sleep(400);
    const hpAfter = await page.evaluate(() => window.__fight.getState().combatants.find((c) => c.isPlayer).hp);
    if (!(hpAfter > hpBefore)) throw new Error(`Second Wind: ${hpBefore} -> ${hpAfter}`);
    // The use is written to the character at once (the effect that saves hit points saves it)
    await sleep(1200);
    const usedAtOnce = (await getChar(d.id)).playState?.featureUses ?? {};
    if (!Object.keys(usedAtOnce).some((k) => /Second Wind/.test(k))) throw new Error("Second Wind's use was not saved at once: " + JSON.stringify(usedAtOnce));
    // Play the fight out, noting what the log shows
    const lines = new Set();
    let twice = 0;
    let usedManeuver = false;
    for (let i = 0; i < 200 && (await page.getByText(/Combat - Round/).count()); i++) {
      const log = await page.evaluate(() => window.__fight?.getState().combatLog ?? []).catch(() => []);
      for (const l of log) lines.add(l);
      const save = page.getByRole("button", { name: "Death saving throw" });
      const reaction = page.getByTestId("combat-reaction-none");
      const select = page.getByTestId("combat-maneuver").locator("select");
      if ((await reaction.count()) && (await reaction.isEnabled().catch(() => false))) await reaction.click().catch(() => {});
      else if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
      else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) {
        if (!usedManeuver && (await select.count())) {
          await select.selectOption({ label: "Trip Attack" }).catch(() => {});
          usedManeuver = true;
        }
        await melee.click().catch(() => {});
      } else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
      await sleep(300);
    }
    const ordered = Array.from(lines);
    let run = 0;
    for (const l of ordered) {
      if (/^Navy Trooper (hits|attacks)/.test(l)) { run += 1; if (run === 2) twice += 1; }
      else if (/turn$|^Round/.test(l)) run = 0;
    }
    await sleep(1500);
    const c = await getChar(d.id);
    const spent = c.playState?.featureUses ?? {};
    if (!Object.keys(spent).some((k) => /Second Wind/.test(k))) throw new Error("Second Wind's use was not kept: " + JSON.stringify(c.playState));
    // A short rest gives Second Wind and the superiority dice back (once nobody hostile is left: whoever
    // the fight did not finish is taken out of the room through the API)
    const campNow = await campOf(depthCamp.id);
    const wm = campNow.galaxyMap;
    for (const a of Object.values(wm.areas)) a.occupants = a.occupants.filter((o) => o.disposition !== "hostile");
    await api("PATCH", `/api/campaigns/${depthCamp.id}`, { galaxyMap: wm });
    await api("PATCH", `/api/characters/${d.id}`, { currentHp: Math.max(1, (await getChar(d.id)).currentHp), conditions: [] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(1500);
    await page.getByRole("button", { name: "Short rest" }).click();
    await sleep(1200);
    const rested = await getChar(d.id);
    if (Object.keys(rested.playState?.featureUses ?? {}).some((k) => /Second Wind|Maneuver/.test(k))) throw new Error("not restored by a short rest: " + JSON.stringify(rested.playState));
    return `economy ${economy}; ${facts.attacks} attacks an action; multiattack ${facts.multi.join("+")}${twice ? ` made twice in a turn ${twice} time(s)` : " (no double attack seen)"}; Second Wind ${hpBefore}->${hpAfter}, kept ${JSON.stringify(spent)}, restored by a short rest`;
  });

  await step(ctx, "downtime: a workweek of work, gambling and carousing by the book's tables; a training is begun and a workweek of it done", async () => {
    const dt = await newChar({ credits: 20000, equipment: ["Vibroblade", "Blaster pistol", "Combat suit"], toolProficiencies: ["Sabacc deck"] });
    const dc = await newCamp(dt, 7, async () => {});
    const timeOf = async () => (await campOf(dc.id)).timeElapsed?.total ?? 0;
    const t0 = await timeOf();
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime").waitFor();
    const menu = await page.getByTestId("downtime-menu").innerText();
    for (const n of ["Bounty Hunting", "Carousing", "Crafting", "Gambling", "Training", "Work", "Buying Enhanced Items"]) if (!menu.includes(n)) throw new Error("no " + n + " in the menu");
    // Work: one check, then the d100
    await page.getByTestId("downtime-work").click();
    await page.getByTestId("downtime-begin").click();
    await page.getByTestId("downtime-check-athletics").click();
    await page.getByTestId("downtime-resolve").click();
    await page.getByTestId("downtime-result").waitFor();
    const work = (await page.getByTestId("downtime-result").innerText()).replace(/\s+/g, " ");
    if (!/d100 \d+ \+ \d+ = \d+/.test(work)) throw new Error("work: " + work);
    await sleep(1200);
    const t1 = await timeOf();
    if (t1 - t0 < 7 * 1440) throw new Error(`a workweek should be 7 days: ${t0} -> ${t1}`);
    let c = await getChar(dt.id);
    if (!(c.credits >= 20000 + 10)) throw new Error("work paid nothing: " + c.credits);
    // Gambling: a stake, up to three checks, and the stake comes back by the table
    await page.getByRole("button", { name: /Activities/ }).click();
    await page.getByTestId("downtime-gambling").click();
    await page.getByTestId("downtime-begin").click();
    await page.getByRole("button", { name: /Charisma \(deception\)/i }).click();
    for (let i = 0; i < 2 && !(await page.getByTestId("downtime-resolve").isEnabled()); i++) {
      await page.getByRole("button", { name: /Wisdom \(insight\)/i }).click().catch(() => {});
      if (!(await page.getByTestId("downtime-resolve").isEnabled())) await page.getByRole("button", { name: /Intelligence \(gaming set\)/i }).click().catch(() => {});
    }
    await page.getByTestId("downtime-resolve").click();
    await page.getByTestId("downtime-result").waitFor();
    const gamble = (await page.getByTestId("downtime-result").innerText()).replace(/\s+/g, " ");
    // Carousing among the lower class: Persuasion, then the table
    await page.getByRole("button", { name: /Again/ }).count();
    await page.getByRole("button", { name: /Activities/ }).click();
    await page.getByTestId("downtime-carousing").click();
    await page.getByTestId("downtime-begin").click();
    await page.getByTestId("downtime-check-persuasion").click();
    await page.getByTestId("downtime-resolve").click();
    await page.getByTestId("downtime-result").waitFor();
    const carouse = (await page.getByTestId("downtime-result").innerText()).replace(/\s+/g, " ");
    // Training: a skill, begun and one workweek done
    await page.getByRole("button", { name: /Activities/ }).click();
    await page.getByTestId("downtime-training").click();
    await page.getByTestId("downtime-train-option").selectOption("skill-training");
    await page.getByTestId("downtime-train-topic").selectOption({ label: "Stealth" });
    await page.getByTestId("downtime-train-start").click();
    await sleep(800);
    await page.getByTestId("downtime-train-week").click();
    await sleep(1500);
    c = await getChar(dt.id);
    const state = c.playState?.downtime;
    if (!state || state.training.length !== 1 || !(state.training[0].done > 0)) throw new Error("training not kept: " + JSON.stringify(state?.training));
    if (!(state.log.length >= 4)) throw new Error("the log has " + state.log.length);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime-log").waitFor();
    return `work: ${work.slice(0, 90)}; gambling: ${gamble.slice(0, 80)}; carousing: ${carouse.slice(0, 80)}; ${state.training[0].label} ${state.training[0].done}/${state.training[0].weeks}; ${(await timeOf() - t0) / 1440} days passed`;
  });

  await step(ctx, "flying games: the downtime menu is in groups; a taxi run is flown on the 3D map with the drag pad and boost, and paid by the rings it takes", async () => {
    const fl = await newChar({ credits: 1000, equipment: ["Blaster pistol"] });
    const fc = await newCamp(fl, 7, async () => {});
    const before = (await getChar(fl.id)).credits;
    // A landspeeder of the party's, parked where the party stands (a taxi run needs one)
    const parkedAt = fc.world.areas[fc.start.parentId]?.parentId ?? fc.world.startId;
    await api("PATCH", `/api/campaigns/${fc.id}`, { vehicles: [{ id: "v-taxi", name: "Landspeeder", model: "Landspeeder", mph: 220, value: 10000, status: "parked", owner: GEAR, seats: 2, areaId: parkedAt }] });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime-menu").waitFor();
    const menu = await page.getByTestId("downtime-menu").textContent();
    for (const g of ["Side quests", "Fighting games", "Racing games", "Flying games", "Everyday downtime", "Speeder race", "Dogfight"]) if (!menu.includes(g)) throw new Error("no " + g + " in the menu");
    await page.getByTestId("downtime-taxi-run").click();
    await page.getByTestId("flight-start-taxi-run").click();
    await page.getByTestId("minigame-page").waitFor({ timeout: 30000 });
    await page.getByTestId("countdown").waitFor({ timeout: 20000 }); // software rendering can stall the page for 5 s as the 3D scene starts; the countdown lasts 5.7 s from the first frame
    await page.getByTestId("minigame-run").waitFor({ timeout: 15000 });
    await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 15000 });
    // Steer right with the pad, then boost for a few seconds
    const box = await page.getByTestId("flight-pad").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 4 });
    await sleep(600);
    await page.mouse.up();
    const boost = await page.getByTestId("flight-boost").boundingBox();
    await page.mouse.move(boost.x + boost.width / 2, boost.y + boost.height / 2);
    await page.mouse.down();
    await sleep(4000);
    await page.mouse.up();
    const hud = await page.getByTestId("flight-hud").innerText();
    if (!/Taxi run/.test(hud)) throw new Error("no flight hud: " + hud);
    const shown = await page.getByTestId("flight-hud").innerText();
    await page.getByTestId("minigame-over").waitFor({ timeout: 150000 }).catch((e) => { throw new Error("no end of the run; hud: " + shown.replace(/\s+/g, " ") + " " + e.message.split("\n")[0]); });
    await page.getByTestId("minigame-land").click();
    await page.getByTestId("downtime-log").waitFor();
    await sleep(1500);
    const log = await page.getByTestId("downtime-log").innerText();
    if (!/Taxi run:.*rings/.test(log)) throw new Error("no taxi run in the log: " + log.replace(/\s+/g, " "));
    const after = (await getChar(fl.id)).credits;
    if (!(after >= before)) throw new Error(`credits fell: ${before} -> ${after}`);
    return `${log.split("\n").find((l) => /Taxi run/.test(l))?.slice(0, 110)}; credits ${before} -> ${after}`;
  });

  await step(ctx, "flying games: a dogfight in the space of a planet: the pilot chooses one of two ships, which is lent a shield; the ship fires on the foes and flies to the end of the fight, which is paid", async () => {
    const dg = await newChar({ credits: 1000, equipment: ["Blaster pistol"] });
    const dgc = await newCamp(dg, 7, async () => {});
    await api("PATCH", `/api/campaigns/${dgc.id}`, { starships: [{ id: "s-dog", name: "Wing", size: "Small", role: "fighter", tier: 1, equipment: ["Laser cannon", "Missile launcher"], hyperdriveClass: "1", owner: GEAR, fuel: 6, areaId: dgc.world.areas[dgc.start.parentId]?.parentId ?? dgc.world.startId, value: 50000, hull: undefined, crew: {} },
      { id: "s-dog2", name: "Hauler", size: "Medium", role: "freighter", tier: 1, equipment: [], hyperdriveClass: "1", owner: GEAR, fuel: 6, areaId: dgc.world.areas[dgc.start.parentId]?.parentId ?? dgc.world.startId, value: 90000, hull: undefined, crew: {} }] });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime-dogfight").click();
    // Two ships: the pilot is asked which to fly, and the line below says which was chosen
    await page.getByTestId("dogfight-fleet").waitFor();
    await page.getByTestId("dogfight-pick-s-dog2").click();
    if (!/Hauler.*Medium/.test(await page.getByTestId("dogfight-ship").innerText())) throw new Error("the second ship was not chosen: " + (await page.getByTestId("dogfight-ship").innerText()));
    await page.getByTestId("dogfight-pick-s-dog").click();
    const flown = await page.getByTestId("dogfight-ship").innerText();
    if (!/Wing.*Small/.test(flown) || !/deflector is lent/.test(flown)) throw new Error("the first ship was not chosen, or its lent shield is not said: " + flown);
    await page.getByTestId("flight-start-dogfight").click();
    await page.getByTestId("minigame-dogfight").waitFor({ timeout: 30000 });
    await page.getByTestId("countdown").waitFor({ timeout: 20000 }); // software rendering can stall the page for 5 s as the 3D scene starts; the countdown lasts 5.7 s from the first frame
    if (!/Deflector shield lent for the sortie/.test(await page.getByTestId("dogfight-briefing").innerText())) throw new Error("the lent shield is not in the briefing");
    // The shield is beside the hull bar, and the right button makes the next weapon the active one
    await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 30000 });
    const shield = await page.getByTestId("dogfight-shield").getAttribute("data-max");
    if (!(Number(shield) > 0)) throw new Error("no shield on the bars: " + shield);
    const first = await page.getByTestId("dogfight-weapons").locator("[data-active=true]").innerText();
    // (the page can be slow in these first seconds, so the change is waited for)
    const activeWeapon = (was) => page.waitForFunction((w) => { const el = document.querySelector("[data-testid=dogfight-weapons] [data-active=true]"); return !!el && el.textContent !== w; }, was, { timeout: 30000 });
    await page.mouse.click(640, 420, { button: "right" });
    await activeWeapon(first).catch(() => { throw new Error("the right button did not change the weapon from " + first); });
    const second = await page.getByTestId("dogfight-weapons").locator("[data-active=true]").innerText();
    await page.mouse.click(640, 420, { button: "right" });
    await activeWeapon(second).catch(() => { throw new Error("the right button did not move on from " + second); });
    await page.getByTestId("flight-fire").boundingBox().then(async (b) => {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await sleep(8000);
      await page.screenshot({ path: `${OUT}/dogfight-running.png` }).catch((e) => console.log("shot failed", e.message.slice(0, 200)));
      await sleep(12000);
      await page.mouse.up();
    });
    await page.getByTestId("minigame-over").waitFor({ timeout: 150000 }).catch(async (e) => {
      throw new Error("no end of the fight; hud: " + (await page.getByTestId("dogfight-hud").innerText()).replace(/\s+/g, " ") + " " + e.message.split("\n")[0]);
    });
    await page.getByTestId("minigame-land").click();
    await page.getByTestId("downtime-log").waitFor();
    await sleep(1500);
    const log = await page.getByTestId("downtime-log").innerText();
    if (!/Dogfight:.*foes down/.test(log)) throw new Error("no dogfight in the log: " + log.replace(/\s+/g, " "));
    return log.split("\n").find((l) => /Dogfight/.test(l))?.slice(0, 120);
  });

  await step(ctx, "flying games: a speeder race of three laps from a grid, against four rivals; hull and boost bars, the boost meter drains while held; the race is run to its end and placed", async () => {
    const rc = await newChar({ credits: 1000, equipment: ["Blaster pistol"] });
    const rcc = await newCamp(rc, 7, async () => {});
    const parkedAt = rcc.world.areas[rcc.start.parentId]?.parentId ?? rcc.world.startId;
    await api("PATCH", `/api/campaigns/${rcc.id}`, { vehicles: [{ id: "v-race", name: "Landspeeder", model: "Landspeeder", mph: 220, value: 10000, status: "parked", owner: GEAR, seats: 2, areaId: parkedAt }] });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime-speeder-race").click();
    await page.getByTestId("flight-start-speeder-race").click();
    await page.getByTestId("minigame-race").waitFor({ timeout: 60000 });
    await page.getByTestId("countdown").waitFor({ timeout: 30000 });
    await sleep(2000);
    await page.screenshot({ path: `${OUT}/race-countdown.png` }).catch(() => {});
    await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 60000 });
    await page.getByTestId("race-hull").waitFor({ timeout: 30000 });
    const bar = async (id) => Number(await page.getByTestId(id).getAttribute("data-value"));
    const hullMax = Number(await page.getByTestId("race-hull").getAttribute("data-max"));
    if (!(hullMax > 0) || (await bar("race-hull")) !== hullMax) throw new Error(`the hull bar does not start full: ${await bar("race-hull")} of ${hullMax}`);
    // Boost held: the meter drains (it is not stopped by anything but running empty)
    const boost = page.getByTestId("flight-boost");
    const box = await boost.boundingBox();
    const full = await bar("race-boost");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(4000);
    const held = await bar("race-boost");
    await page.screenshot({ path: `${OUT}/race-boost.png` }).catch(() => {});
    await page.mouse.up();
    if (!(held < full - 5)) throw new Error(`the boost meter did not drain while held: ${full} then ${held}`);
    await sleep(6000);
    await page.screenshot({ path: `${OUT}/race-running.png` }).catch(() => {});
    await page.getByTestId("minigame-over").waitFor({ timeout: 600000 }).catch(async (e) => {
      throw new Error("the race did not end; hud: " + (await page.getByTestId("race-hud").innerText()).replace(/\s+/g, " ") + " " + e.message.split("\n")[0]);
    });
    const result = (await page.getByTestId("race-result").innerText()).replace(/\s+/g, " ");
    await page.screenshot({ path: `${OUT}/race-over.png` }).catch(() => {});
    await page.getByTestId("minigame-land").click();
    await page.getByTestId("downtime-log").waitFor();
    await sleep(1500);
    const log = await page.getByTestId("downtime-log").innerText();
    if (!/Speeder race:/.test(log)) throw new Error("no race in the log: " + log.replace(/\s+/g, " "));
    return `boost ${full} -> ${held} held; ${result.slice(0, 160)}`;
  });

  await step(ctx, "pit arena: a bout against a creature of the rules on the 3D arena, after a five-second countdown; a win pays the prize, the party can take the winnings and leave", async () => {
    const pc = await newChar({ credits: 1000, equipment: ["Blaster pistol"] });
    const pcc = await newCamp(pc, 7, async () => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime-pit-arena").click();
    await page.getByTestId("pit-prize").waitFor();
    await page.getByTestId("pit-enter").click();
    await page.getByTestId("countdown").waitFor({ timeout: 20000 }); // software rendering can stall the page for 5 s as the 3D scene starts; the countdown lasts 5.7 s from the first frame
    await page.getByTestId("pit-scene").waitFor({ timeout: 30000 });
    await page.waitForFunction(() => window.__fight && window.__fight.getState().inCombat === true, null, { timeout: 30000 });
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/pit-bout.png` }).catch(() => {});
    // The bout is decided through the combat store: the creatures fall
    await page.evaluate(() => {
      const s = window.__fight.getState();
      window.__fight.setState({ combatants: s.combatants.map((c) => (c.isPlayer ? c : { ...c, hp: 0 })), inCombat: false, outcome: "victory" });
    });
    await page.getByTestId("pit-result").waitFor({ timeout: 15000 });
    const result = (await page.getByTestId("pit-result").innerText()).replace(/\s+/g, " ");
    if (!/Bout 1 won/.test(result)) throw new Error("no win: " + result);
    await page.getByTestId("pit-quit").click();
    await page.getByTestId("downtime-log").waitFor();
    await sleep(1500);
    const log = await page.getByTestId("downtime-log").innerText();
    if (!/Pit arena: 1 bout won, 200 cr/.test(log)) throw new Error("no pit in the log: " + log.replace(/\s+/g, " "));
    const after = (await getChar(pc.id)).credits;
    if (after < 1200) throw new Error(`prize not paid: credits ${after}`);
    return `${result.slice(0, 100)}; credits ${after}`;
  });

  await step(ctx, "starship combat: the party's ship engages a hostile ship in orbit on the 3D map; weapons, a helm action, a move, the enemy's turns, and what comes of it is kept", async () => {
    const sc = await newChar({ level: 5, class: "fighter", maxHp: 45, currentHp: 45, credits: 500, equipment: ["Vibroblade", "Blaster pistol", "Combat suit"] });
    const camp = await newCamp(sc, 9, async () => {});
    // The world: the planet the start is on gets a hostile ship in orbit; the party's ship is there too
    const world = camp.world;
    let planet = world.areas[camp.start.id];
    while (planet && planet.kind !== "planet") planet = world.areas[planet.parentId];
    const foe = { id: "e2e-raider", name: "E2E Raider", size: "Small", role: "Superiority Fighter", tier: 0, status: "orbiting", owner: world.antagonist, equipment: ["Lightweight armor", "Light laser cannon"], value: 20000 };
    planet.ships = [...(planet.ships ?? []), foe];
    const mine = { id: "e2e-mynock", name: "E2E Mynock", size: "Small", role: "Attack Fighter", tier: 3, status: "orbiting", owner: sc.name, equipment: ["Reinforced armor", "Heavy laser cannon", "Laser cannon", "Directional shield", "Hyperdrive, class 1.0"], value: 60000, fuel: 5, areaId: planet.id, hyperdriveClass: "1.0" };
    await api("PATCH", `/api/campaigns/${camp.id}`, { galaxyMap: world, currentLocation: planet.id, starships: [mine] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(2500);
    await page.getByTestId("ship-engage").first().click();
    await page.getByTestId("ship-combat").waitFor();
    const info = (await page.getByTestId("ship-info").innerText()).replace(/\s+/g, " ");
    if (!/Hull \d+\/\d+/.test(info) || !/shields \d+\/\d+/.test(info)) throw new Error("ship info: " + info);
    const weapons = await page.getByTestId("ship-weapons").innerText();
    if (!/Heavy laser cannon/.test(weapons) || !/primary/.test(weapons)) throw new Error("weapons: " + weapons);
    // The ship's numbers come from its size, role and equipment: a Small tier 3 ship has 6d6 of hull, AC 10 + Dex (Reinforced: none) + 2
    const facts = await page.evaluate(() => {
      const f = window.__shipFight.getState().fight;
      const me = f.ships.find((x) => x.id === window.__shipFight.getState().partyShipId);
      return { hull: me.sheet.hullMax, dice: me.sheet.hullDice, ac: me.sheet.ac, dr: me.sheet.reduction, speed: me.sheet.speed, turning: me.sheet.turning, foes: f.ships.filter((x) => x.side === "foe").length, shield: me.sheet.shieldMax };
    });
    if (facts.dice !== 6 || facts.dr !== 6 || facts.speed !== 350 || facts.foes !== 1 || !(facts.shield > 0)) throw new Error(JSON.stringify(facts));
    // The 3D map is probed for the ships
    let meAt = null;
    for (let i = 0; i < 30 && !meAt; i++) {
      meAt = await page.evaluate(() => window.__map3d?.at("me") ?? null);
      if (!meAt) await sleep(300);
    }
    if (!meAt) throw new Error("the space scene is not drawn");
    let fired = 0;
    let moved = false;
    for (let i = 0; i < 160 && !(await page.getByTestId("ship-outcome").count()); i++) {
      const state = await page.evaluate(() => {
        const s = window.__shipFight.getState();
        const f = s.fight;
        if (!f) return null;
        return { mine: f.ships[f.turn].id === s.partyShipId, actions: f.ships.find((x) => x.id === s.partyShipId).actions, outcome: f.outcome };
      });
      if (!state || state.outcome) break;
      if (state.mine) {
        if (!moved) {
          // Fly: a tap on a lit square on the map
          const lit = await page.evaluate(() => {
            const s = window.__shipFight.getState();
            const me = s.fight.ships.find((x) => x.id === s.partyShipId);
            return { x: me.x + 4, y: me.y };
          });
          const p = await page.evaluate((k) => window.__map3d?.at(k) ?? null, `sq:${lit.x},${lit.y}`);
          if (p) { await (PHONE ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y)); await sleep(500); }
          moved = true;
        }
        const fire = page.getByTestId("ship-fire-0");
        if (state.actions > 0 && (await fire.isEnabled().catch(() => false))) { await fire.click(); fired += 1; await sleep(300); }
        else if (state.actions > 0 && (await page.getByTestId("ship-fire-1").isEnabled().catch(() => false))) { await page.getByTestId("ship-fire-1").click(); fired += 1; await sleep(300); }
        else if (await page.getByRole("button", { name: "Evade" }).isEnabled().catch(() => false)) { await page.getByRole("button", { name: "Evade" }).click(); await sleep(300); }
        else await page.getByTestId("ship-end-turn").click().catch(() => {});
      }
      await sleep(500);
    }
    await page.getByTestId("ship-outcome").waitFor({ timeout: 25000 });
    const outcome = (await page.getByTestId("ship-outcome").innerText()).replace(/\s+/g, " ");
    await page.getByTestId("ship-finish").click();
    await sleep(1500);
    const after = await campOf(camp.id);
    const area = after.galaxyMap.areas[planet.id];
    const raider = area.ships.find((x) => x.id === "e2e-raider");
    const c = await getChar(sc.id);
    const myShip = (after.starships ?? []).find((x) => x.id === "e2e-mynock");
    if (/beaten/.test(outcome)) {
      if (!(raider && (raider.status === "wrecked" || raider.disabled))) throw new Error("the beaten ship is untouched: " + JSON.stringify(raider));
      if (!(c.experience > 0)) throw new Error("no experience for the win: " + c.experience);
    }
    if (/lost/.test(outcome) && myShip) throw new Error("a lost ship is still listed");
    return `${outcome}; fired ${fired} times; hull ${facts.hull} (${facts.dice} dice), AC ${facts.ac}, armor takes ${facts.dr}; foe ${raider?.status}${raider?.disabled ? " (disabled)" : ""}; my ship ${myShip ? `hull ${myShip.hull}` : "gone"}; xp ${c.experience}`;
  });

  await step(ctx, "beast and stable: a dealer sells speeders, a stable keeper mounts, a wild creature is gentled", async () => {
    const b = await newChar({ credits: 40000, equipment: ["Blaster pistol", "Vibroblade", "Field rations (one day's)"] });
    const bc = await newCamp(b, 3, async (world, start, put) => {
      // a city: speeders are sold in cities
      world.areas[world.areas[start.parentId].parentId].type = "city";
      put({ id: "ox-dealer", name: "Dorg the Dealer", role: "merchant", trade: "vehicles", disposition: "friendly", count: 1, species: "Human", loadout: [] });
      put({ id: "ox-stable", name: "Hanna Stablehand", role: "merchant", trade: "mounts", disposition: "friendly", count: 1, species: "Human", loadout: [] }, true);
      put({ ...(await stat("tauntaun")), id: "ox-beast", disposition: "neutral", role: "wildlife", count: 1 });
    }, { timeElapsed: { total: 700 } });
    // (the beast is made hostile after the trade, so that it does not start a fight)
    await tap("npc:ox-dealer");
    const stock = card().getByTestId("trade-stock");
    await stock.waitFor();
    const line = stock.locator("li").filter({ hasText: /Landspeeder|Speederbike|Airspeeder/ }).first();
    await line.getByRole("button", { name: "Buy" }).click();
    await sleep(1500);
    const bought = (await campOf(bc.id)).vehicles?.[0];
    if (!bought) throw new Error("no speeder bought");
    // the dealer's card covers the stable on a phone: close it first
    await card().getByRole("button", { name: "Close" }).click();
    await tap("npc:ox-stable");
    await card().getByText("Hanna Stablehand").waitFor({ timeout: 30000 });
    const mounts = card().getByTestId("trade-stock").locator("li").filter({ hasText: /Tauntaun|Kaadu|Dewback|Varactyl|Bantha|Rancor/ }).first();
    await mounts.getByRole("button", { name: "Buy" }).click();
    await sleep(2000);
    let party = (await getChar(b.id)).companionData?.party ?? [];
    if (!party.some((p) => p.kind === "beast" && p.mount)) throw new Error(JSON.stringify(party));
    // a wild creature, hurt, in the room
    const camp = await campOf(bc.id);
    const w = camp.galaxyMap;
    const room = w.areas[bc.world.startId];
    room.occupants = room.occupants.map((o) => (o.id === "ox-beast" ? { ...o, disposition: "hostile", role: "wildlife", wounds: [6] } : o));
    await api("PATCH", `/api/campaigns/${bc.id}`, { galaxyMap: w });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(2500);
    let joined = false;
    for (let i = 0; i < 6 && !joined; i++) {
      await tap("npc:ox-beast");
      await card().getByTestId("gentle-beast").click();
      await sleep(1500);
      party = (await getChar(b.id)).companionData?.party ?? [];
      joined = party.filter((p) => p.kind === "beast").length >= 2;
    }
    if (!joined) throw new Error("six tries and the creature would not settle");
    return `bought ${bought.name} (${bought.mph} mph); party: ${party.map((p) => `${p.name} ${p.hp}/${p.maxHp}`).join(", ")}`;
  });

  await step(ctx, "speeders: a base's bike is taken, a wreck mended with a kit, and the routes offer rides", async () => {
    const m = await newChar({ credits: 30000, equipment: ["Blaster pistol", "Vibroblade", "Combat suit", "Mechanic's kit"], toolProficiencies: ["Mechanic's kit"] });
    let building = null;
    let settlement = null;
    const mc = await newCamp(m, 3, async (world, start) => {
      building = world.areas[start.parentId];
      settlement = world.areas[building.parentId];
      building.vehicles = [
        { id: "vx-bike", name: "74-Z Speeder Bike", model: "Speederbike", mph: 300, value: 6000, status: "parked", owner: "Raiders", seats: 2 },
        { id: "vx-wreck", name: "Wrecked speeder", model: "Landspeeder", mph: 220, value: 10000, status: "wrecked", owner: "Raiders", seats: 6 },
      ];
      for (const room of Object.values(world.areas).filter((a) => a.parentId === building.id)) room.occupants = room.occupants.filter((o) => o.disposition !== "hostile");
    });
    // the helper put the party in the start room; stand outside, before the building
    await api("PATCH", `/api/campaigns/${mc.id}`, { currentLocation: building.id });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(3000);
    await tap("vehicle:vx-bike");
    await card().getByTestId("vehicle-take").click();
    await sleep(1500);
    let mended = false;
    for (let i = 0; i < 8 && !mended; i++) {
      await tap("vehicle:vx-wreck");
      await card().getByTestId("vehicle-mend").click();
      await sleep(1400);
      mended = (await campOf(mc.id)).galaxyMap.areas[building.id].vehicles.find((v) => v.id === "vx-wreck").status === "parked";
    }
    if (!mended) throw new Error("eight tries and it would not start");
    await tap("vehicle:vx-wreck");
    await card().getByTestId("vehicle-take").click();
    await sleep(1400);
    await api("PATCH", `/api/campaigns/${mc.id}`, { currentLocation: settlement.id });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    const rides = page.getByTestId("rides").first();
    await rides.waitFor();
    const text = (await rides.innerText()).replace(/\s+/g, " ");
    if (!/On foot/.test(text) || !/speeder/i.test(text)) throw new Error(text);
    await rides.getByRole("button").filter({ hasText: /speeder/i }).first().click();
    await sleep(1500);
    const after = await campOf(mc.id);
    if (after.currentLocation === settlement.id) throw new Error("did not travel: " + text);
    if (!after.vehicles.some((v) => v.areaId === after.currentLocation)) throw new Error("the speeder stayed behind");
    return `${text.slice(0, 160)} => ${after.galaxyMap.areas[after.currentLocation].name}, the speeder with them`;
  });

  await step(ctx, "roster: another saved character is brought along as a companion", async () => {
    const lead = await newChar({ equipment: ["Blaster pistol", "Vibroblade", "Combat suit"] });
    const friend = await newChar({ name: "Friend " + TAG, class: "scout", equipment: ["Blaster pistol", "Vibroblade", "Combat suit"] });
    await newCamp(lead, 3, async () => {});
    const sel = page.getByTestId("recruit-character").locator("select");
    await sel.waitFor();
    await sel.selectOption({ index: (await sel.locator("option").allInnerTexts()).findIndex((t) => t.startsWith("Friend " + TAG)) });
    await sleep(1500);
    const m = (await getChar(lead.id)).companionData?.party?.[0];
    if (m?.name !== "Friend " + TAG || m.kind !== "character") throw new Error(JSON.stringify(m));
    return `${m.name}: AC ${m.armorClass}, ${m.hp}/${m.maxHp}, ${m.attack.name} +${m.attack.bonus} ${m.attack.damage}`;
  });

  await step(ctx, "hangar: a ship away on a voyage leaves a marked berth, inside and out", async () => {
    const h = await newChar({ equipment: ["Blaster pistol"] });
    let room = null, building = null;
    const hc = await newCamp(h, 3, async (world) => {
      room = Object.values(world.areas).find((a) => a.kind === "room" && a.ships.length && a.layout?.assets.some((x) => x.kind === "ship"));
      building = world.areas[room.parentId];
      const other = Object.values(world.areas).find((a) => a.kind === "settlement" && a.id !== building.parentId && a.parentId === world.areas[building.parentId].parentId);
      room.ships[0].voyage = { ports: [room.id, other.id], stay: 1, legs: [600, 600], phase: 0, homeStay: 1 };
      for (const r of Object.values(world.areas).filter((a) => a.parentId === building.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 480 } });
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: room.id });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(3000);
    const shipName = room.ships[0].name;
    // the ship is away: no ship in the HUD's list, and the berth is on the map (its label)
    const here = (await page.getByTestId("play-occupants").innerText().catch(() => "")).includes(shipName);
    if (here) throw new Error("the ship is listed although it is away");
    // ... but its berth is there to be seen
    await at(`ship:${room.ships[0].id}`);
    return `${shipName} away; the room lists no ship and its berth is on the map`;
  });

  await step(ctx, "ship: boarded from the hangar, the deck has a pilot's seat, the helm takes off, lands and the ramp leads out", async () => {
    const h = await newChar({ equipment: ["Blaster pistol"] });
    let room = null, building = null, mine = null;
    const hc = await newCamp(h, 3, async (world) => {
      room = Object.values(world.areas).find((a) => a.kind === "room" && a.ships.length && a.layout?.assets.some((x) => x.kind === "ship"));
      building = world.areas[room.parentId];
      mine = { ...room.ships[0], owner: GEAR, fuel: 6, hyperdriveClass: "1", areaId: building.parentId };
      room.ships = [];
      for (const r of Object.values(world.areas).filter((a) => a.parentId === building.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 480 } });
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: room.id, starships: [mine] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(3000);
    const [fw, fh] = { Tiny: [6, 4], Small: [10, 6], Medium: [16, 10], Large: [26, 14] }[mine.size] ?? [10, 6];
    const berth = room.layout.assets.find((a) => a.kind === "ship");
    if (berth.w < Math.min(fw, room.layout.width - 4) - 0) throw new Error(`berth ${berth.w}x${berth.h} for a ${mine.size} ship`);
    await tap(`ship:${mine.id}`);
    await card().getByTestId("ship-board").click();
    await sleep(1500);
    let camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    const deck = camp.galaxyMap.areas[camp.currentLocation];
    if (deck?.type !== "deck") throw new Error("not aboard: " + camp.currentLocation);
    if (!deck.layout.assets.some((a) => a.name === "Pilot's seat" && a.ref === "station:helm")) throw new Error("no pilot's seat");
    await page.getByTestId("helm-open").click();
    const orbit = camp.galaxyMap.areas[building.parentId];
    const planet = camp.galaxyMap.areas[orbit.parentId];
    const helmText = await page.getByTestId("helm").innerText().catch(() => "no helm panel");
    if (!(await page.getByTestId(`helm-go-${planet.id}`).count())) throw new Error(`no course to ${planet.id} (${planet.kind}) from ${orbit.id} (${orbit.kind}): ${helmText.replace(/\s+/g, " ")}`);
    await page.getByTestId(`helm-go-${planet.id}`).click();
    await sleep(2500);
    camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    const ship = camp.starships[0];
    if (ship.areaId !== planet.id) throw new Error("the ship is at " + ship.areaId);
    if (camp.currentLocation !== deck.id) throw new Error("the party left the deck");
    if (camp.galaxyMap.areas[`ship-${mine.id}`].parentId !== planet.id) throw new Error("the interior did not move");
    if (!(ship.fuel < 6)) throw new Error("no fuel burned");
    if (!(await page.getByTestId("helm-courses").count())) await page.getByTestId("helm-open").click();
    await page.getByTestId(`helm-go-${orbit.id}`).click();
    await sleep(2500);
    camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    if (camp.starships[0].areaId !== orbit.id) throw new Error("did not land: " + camp.starships[0].areaId);
    // A port with hangars: the ship has to be put down in one first (the first that is open)
    if (await page.getByTestId("hangars").count()) {
      await page.locator('[data-testid^="hangar-"]:not([disabled])').first().click();
      await sleep(1200);
      camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
      if (!camp.starships[0].hangar) throw new Error("the hangar was not chosen");
    }
    await page.getByTestId("disembark").click();
    await sleep(1500);
    camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    if (camp.currentLocation === deck.id || camp.galaxyMap.areas[camp.currentLocation]?.type === "deck") throw new Error("still aboard");
    return `${mine.name} (${mine.size}): berth ${berth.w}x${berth.h}, deck ${deck.layout.width}x${deck.layout.height}; took off to ${planet.name}, landed at ${orbit.name}, stepped out into ${camp.galaxyMap.areas[camp.currentLocation].name}`;
  });

  // Sites (2026-10-18): each building the settlement lists has a local map of its own, with the
  // buildings that belong to it round it; the port's hangars, the palace's wall and gardens, the market's stalls.
  await step(ctx, "sites: the settlement lists its buildings, each with a site of its own (hangars, a palace with its wall and gardens, a market with stalls); the town lies out as designed", async () => {
    const notes = [];
    for (const seed of [1, 7]) {
      const w = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
      const all = Object.values(w.areas);
      const kids = (id) => all.filter((a) => a.parentId === id);
      const rooms = (b) => kids(b.id).filter((r) => r.kind === "room");
      const cities = all.filter((a) => a.kind === "settlement" && a.type === "city" && kids(a.id).length);
      for (const city of cities) {
        const bs = kids(city.id).filter((b) => b.kind === "building");
        const anchor = (type) => bs.find((b) => b.type === type && !b.tags.some((t) => t.startsWith("site:")));
        const spaceport = anchor("spaceport");
        const mine = (a) => bs.filter((b) => b.tags.includes(`site:${a.id}`)).map((b) => b.type).sort().join(",");
        const want = ["cargo hangar", "private hangar", "public hangar", "refuelling depot", "shipyard", "transit hub"].join(",");
        if (mine(spaceport) !== want) throw new Error(`${city.name}: the spaceport's site is ${mine(spaceport)}`);
        const [market, warehouse, palace, estates, tenements, junk, cantina] = ["market", "warehouse", "palace", "estates", "tenements", "junkyard", "cantina"].map(anchor);
        if (!(spaceport.position.x < warehouse.position.x && warehouse.position.x < market.position.x)) throw new Error(`${city.name}: the warehouses are not between the port and the market`);
        if (palace && !(market.position.x < palace.position.x - 5)) throw new Error(`${city.name}: the palace is not across town`);
        if (palace && Math.hypot(estates.position.x - palace.position.x, estates.position.z - palace.position.z) > 6) throw new Error("the estates are not by the palace");
        if (Math.hypot(tenements.position.x - junk.position.x, tenements.position.z - junk.position.z) > 5) throw new Error("the tenements are not by the junkyard");
        if (mine(market).split(",").length < 6) throw new Error(`${city.name}: the market has only ${mine(market)}`);
        if (rooms(cantina).length < 6) throw new Error("the cantina is not larger");
        const plans = Object.values(w.districtPlans).filter((p) => p.id.startsWith(city.id + "/"));
        if (plans.length !== bs.filter((b) => !b.tags.some((t) => t.startsWith("site:"))).length) throw new Error(`${plans.length} districts for the listed buildings`);
        const plan = (b) => w.districtPlans[`${city.id}/${b.id}`];
        const stalls = plan(market).grounds?.stalls ?? [];
        const keepers = market.occupants.filter((o) => o.stall);
        if (stalls.length < 6 || keepers.length !== stalls.length) throw new Error(`${stalls.length} stalls, ${keepers.length} keepers`);
        for (const shop of bs.filter((b) => ["armsmith", "general store", "tech shop"].includes(b.type))) {
          const floor = rooms(shop).find((r) => /sales floor/i.test(r.name));
          if (!floor.layout.assets.some((a) => /shelf|rack|case|stand/i.test(a.name))) throw new Error(`${shop.name} shows no wares`);
        }
        let palaceNote = "no palace";
        if (palace) {
          const pr = rooms(palace);
          const floors = new Set(pr.map((r) => r.layout?.level ?? 0));
          if (Math.max(...floors) < 3) throw new Error("the palace has too few floors");
          if (!pr.some((r) => r.occupants.some((o) => o.role === "dignitary")) || !pr.some((r) => r.occupants.some((o) => o.role === "petitioner"))) throw new Error("no dignitary or petitioners");
          if (pr.some((r) => r.layout?.form === "ladder" || r.layout?.assets.some((a) => /ladder/i.test(a.name)))) throw new Error("a ladder in the palace");
          const g = plan(palace).grounds;
          if (!g?.wall || !g.wall.gates.length || (g.gardens ?? []).length < 4) throw new Error("the palace has no curtain wall and gardens");
          if (!mine(palace).includes("royal hangar")) throw new Error("no hangar for the dignitary");
          palaceNote = `palace of ${pr.length} rooms on ${floors.size} floors, ${g.gardens.length} gardens`;
        }
        notes.push(`${city.name}: ${stalls.length} stalls, ${palaceNote}`);
      }
    }
    return notes.join("; ");
  });

  await step(ctx, "sites: by day the market's stalls are kept; by night their keepers are gone and a shop's door is locked", async () => {
    const h = await newChar({ equipment: ["Blaster pistol", "Security kit"] });
    let market = null;
    const hc = await newCamp(h, 7, async (world) => {
      const all = Object.values(world.areas);
      const start = world.areas[world.startId];
      const city = world.areas[start.parentId].parentId;
      market = all.find((a) => a.parentId === city && a.type === "market");
      for (const r of all.filter((a) => a.kind === "room" && all.some((b) => b.id === a.parentId && b.parentId === city))) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 600 } });
    // (leave the game first: a page that is left saves its own clock)
    const openAt = async (total) => {
      await page.goto("about:blank");
      await sleep(1000);
      await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: market.id, timeElapsed: { total } });
      await page.goto(`${BASE}/game/${hc.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
      await sleep(4000);
    };
    await openAt(600);
    const day = await page.getByTestId("play-occupants").innerText().catch(() => "");
    if (!/stallholder/.test(day)) throw new Error("no stallholders by day: " + day.replace(/\s+/g, " ").slice(0, 200));
    await openAt(1400);
    const night = await page.getByTestId("play-occupants").innerText().catch(() => "");
    if (/stallholder/.test(night)) throw new Error("stallholders at night");
    await tap(`exit:${market.id}`);
    await page.getByText(/is shut: open/).first().waitFor({ timeout: 20000 });
    return "stallholders listed at 10:00, none at 23:20, and the market's door answered with its hours";
  });

  await step(ctx, "ports: the ship puts down in the hangar of its choice, steps off there, and the fuel attendant sells fuel", async () => {
    const h = await newChar({ equipment: ["Blaster pistol"], credits: 3000 });
    let depot = null, hangar = null, mine = null, settlement = null;
    const hc = await newCamp(h, 7, async (world) => {
      const all = Object.values(world.areas);
      const start = world.areas[world.startId];
      settlement = world.areas[start.parentId].parentId;
      depot = all.find((a) => a.parentId === settlement && a.type === "refuelling depot");
      hangar = all.find((a) => a.parentId === depot.id && /refuelling hangar/i.test(a.name));
      mine = { id: "e2e-hopper", name: "Dust Hopper", size: "Small", role: "Freighter", tier: 1, status: "landed", owner: GEAR, equipment: [], value: 1000, fuel: 1, hyperdriveClass: "1", areaId: settlement };
      for (const r of all.filter((a) => a.parentId === depot.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 600 } });
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: hangar.id, starships: [{ ...mine, hangar: depot.id }] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(4000);
    await tap(`ship:${mine.id}`);
    await page.getByTestId("map-card").getByTestId("ship-board").click();
    await sleep(1500);
    await page.getByTestId("hangars").waitFor({ timeout: 10000 });
    const refuelling = page.getByTestId("hangar-refuelling");
    if (!/Here/.test(await refuelling.innerText())) throw new Error("the ship is not shown in the refuelling hangar");
    await page.getByTestId("disembark").click();
    await sleep(1500);
    let camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    if (camp.currentLocation !== hangar.id) throw new Error("the ramp led to " + camp.currentLocation + ", not the refuelling hangar");
    const attendant = Object.values(camp.galaxyMap.areas).filter((a) => a.id === hangar.id).flatMap((r) => r.layout.assets.filter((a) => a.kind === "npc").map((a) => ({ asset: a, o: r.occupants.find((o) => o.id === a.ref) }))).find((x) => x.o?.role === "fuel attendant");
    if (!attendant) throw new Error("no fuel attendant in the hangar");
    await tap(`asset:${attendant.asset.id}`);
    const card = page.locator("[data-testid=map-card], [data-testid=hud-trade]");
    await card.getByTestId("service-refuel").waitFor({ timeout: 10000 });
    const before = await getChar(h.id);
    await card.getByTestId("service-refuel").click();
    await sleep(1500);
    camp = (await api("GET", `/api/campaigns/${hc.id}`)).json;
    const after = await getChar(h.id);
    if (!(camp.starships[0].fuel > 1) || !(after.credits < before.credits)) throw new Error(`fuel ${camp.starships[0].fuel}, credits ${before.credits} -> ${after.credits}`);
    return `put down in ${depot.name}; ${attendant.o.name} sold ${camp.starships[0].fuel - 1} units of fuel for ${before.credits - after.credits} credits`;
  });

  // Gathering and crafting (2026-10-16, house rules): a vein in a room of the party's own is worked
  // with a kit; a premium vein is refused without one; crafting is paid with the materials the tool
  // works with; refining; and the check dialog's choice of who rolls and with which skill.
  const addNode = (start, id, name, node) => {
    const l = start.layout;
    const blocked = (x, y) => l.assets.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
    const doors = l.assets.filter((a) => a.side).map((a) => `${a.x},${a.y}`);
    for (let y = l.height - 1; y >= 0; y--) for (let x = l.width - 1; x >= 0; x--) {
      if (blocked(x, y) || doors.includes(`${x},${y}`)) continue;
      start.loot.push({ id, name, kind: "node", credits: 0, items: [], node });
      l.assets.push({ id: `t-${id}`, kind: "loot", name, x, y, w: 1, h: 1, blocks: true, cover: true, ref: id });
      return;
    }
    throw new Error("no room for a node");
  };
  const veinIn = async (cid, id) => {
    const camp = await campOf(cid);
    for (const area of Object.values(camp.galaxyMap.areas)) {
      const cache = (area.loot ?? []).find((c) => c.id === id);
      if (cache) return cache.node;
    }
    return undefined;
  };
  const dtCraft = async (pick) => {
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime").waitFor();
    await page.getByTestId("downtime-crafting").click();
    await page.getByTestId("downtime-craft-pick").selectOption(pick);
  };

  await step(ctx, "hangars: the roof doors are shut unless a ship is coming or going; visiting ships come and go by the clock", async () => {
    const h = await newChar({ equipment: ["Blaster pistol"] });
    let room = null, building = null;
    const hc = await newCamp(h, 3, async (world) => {
      room = Object.values(world.areas).find((a) => a.kind === "room" && a.layout?.roof === "hangar" && a.layout.assets.some((x) => x.kind === "ship" && x.ref?.startsWith(`${a.id}-berth`)));
      building = world.areas[room.parentId];
      for (const r of Object.values(world.areas).filter((a) => a.parentId === building.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 480 } });
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: building.id });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(3000);
    // The hangar's berths and doors at every minute of four days, by the same functions the map draws with
    const scan = await page.evaluate((id) => {
      let open = 0, total = 0, wide = false, landing = false, docked = 0;
      for (let m = 480; m < 480 + 4 * 1440; m++) {
        const b = window.__bay(id, m);
        total++;
        if (b.door > 0.01) open++;
        if (b.door > 0.99) wide = true;
        if (b.door > 0.99 && b.berths.some((x) => x.ship && x.lift > 0.5)) landing = true;
        if (b.door < 0.01 && b.berths.some((x) => x.ship && x.visitor)) docked++;
      }
      return { open, total, wide, landing, docked };
    }, room.id);
    if (scan.open / scan.total > 0.12) throw new Error(`the doors are open ${scan.open} of ${scan.total} minutes: they should open only for a ship`);
    if (!scan.wide || !scan.landing) throw new Error("no ship was ever seen coming or going through open doors: " + JSON.stringify(scan));
    if (!scan.docked) throw new Error("no visiting ship ever stood in a berth with the doors shut");
    return `${room.name}: doors open ${Math.round((100 * scan.open) / scan.total)}% of four days, wide and with a ship aloft at the changes; a visitor in a berth ${Math.round((100 * scan.docked) / scan.total)}% of the time`;
  });

  await step(ctx, "streets: someone in need walks up to the party on the street, follows it to the building they must reach, and is paid", async () => {
    const h = await newChar({ equipment: ["Blaster pistol"], credits: 100 });
    let building = null, target = null, door = null, district = null;
    const hc = await newCamp(h, 7, async (world) => {
      const start = world.areas[world.startId];
      building = world.areas[start.parentId];
      district = Object.values(world.districtPlans).find((p) => p.boxes[building.id]);
      const mine = district.boxes[building.id];
      const near = Object.keys(district.boxes).filter((id) => id !== building.id).sort((a, b) => Math.hypot(district.boxes[a].x - mine.x, district.boxes[a].y - mine.y) - Math.hypot(district.boxes[b].x - mine.x, district.boxes[b].y - mine.y))[0];
      target = world.areas[near];
      const root = Object.values(world.areas).find((a) => a.parentId === target.id && a.layout?.assets.some((x) => x.kind === "exit"));
      const way = root.layout.assets.find((x) => x.kind === "exit");
      door = { x: root.layout.x + way.x + (way.side === "e" ? 1 : way.side === "w" ? -1 : 0), y: root.layout.y + way.y + (way.side === "s" ? 1 : way.side === "n" ? -1 : 0) };
      for (const r of Object.values(world.areas).filter((a) => a.parentId === building.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
      world.encounter = { id: "e2e|help", kind: "help", districtId: district.id, settlementId: building.parentId, person: "Old Dathan", title: "Someone in trouble", text: "Old Dathan comes up to you in the street and says a sick child needs a medpac.", phase: "approach", begun: 480, target: target.id };
    }, { timeElapsed: { total: 480 } });
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: building.id });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    // Nothing is asked of the party until the person has walked up to it
    let phase = "";
    for (let i = 0; i < 80 && phase !== "talk"; i++) {
      phase = (await campOf(hc.id)).galaxyMap.encounter?.phase;
      if (phase !== "talk") await sleep(1000);
    }
    if (phase !== "talk") throw new Error("the person never walked up to the party (phase " + phase + ")");
    const folk = await page.evaluate(() => window.__folk);
    if (folk["e2e|help"] !== 1) throw new Error("the person is on the map " + folk["e2e|help"] + " times");
    await page.getByTestId("encounter").getByRole("button", { name: "Help them" }).click();
    await sleep(1500);
    if ((await campOf(hc.id)).galaxyMap.encounter?.phase !== "follow") throw new Error("the person did not start to follow");
    await tap(`sq:${door.x},${door.y}`);
    let paid = false;
    for (let i = 0; i < 120 && !paid; i++) {
      await sleep(1000);
      paid = !(await campOf(hc.id)).galaxyMap.encounter;
    }
    if (!paid) throw new Error("the person was never delivered");
    const c = await getChar(h.id);
    if (c.credits !== 250) throw new Error("credits " + c.credits);
    return `Old Dathan walked up, followed the party to ${target.name} and paid 150 credits`;
  });

  await step(ctx, "streets: a gang in a lawless alley closes in, bars the way out and is fought on the map; its leader's fall sends the rest running", async () => {
    const h = await newChar({ equipment: ["Vibroblade", "Blaster pistol"], level: 14, maxHp: 180, currentHp: 180, armorClass: 22, credits: 800, abilityScores: { strength: 20, dexterity: 14, constitution: 16, intelligence: 12, wisdom: 12, charisma: 12 } });
    let building = null, alley = null;
    const hc = await newCamp(h, 5, async (world) => {
      const start = world.areas[world.startId];
      building = world.areas[start.parentId];
      const district = Object.values(world.districtPlans).find((p) => p.boxes[building.id]);
      alley = district.ways.find((w) => w.kind === "alley" && Math.max(w.width, w.height) >= 8);
      for (const r of Object.values(world.areas).filter((a) => a.parentId === building.id)) r.occupants = r.occupants.filter((o) => o.disposition !== "hostile");
    }, { timeElapsed: { total: 480 } });
    await page.goto("about:blank");
    await api("PATCH", `/api/campaigns/${hc.id}`, { currentLocation: building.id });
    await page.goto(`${BASE}/game/${hc.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
    await sleep(3000);
    // A day and an hour in which a gang waits in this alley
    const hours = await page.evaluate((a) => window.__street.ambushHours(a, 1), alley);
    if (!hours.length) throw new Error("no hour of the day has a gang in the alley");
    await page.evaluate(() => localStorage.setItem("sw5e.noEncounters", "0"));
    await page.goto("about:blank");
    await api("PATCH", `/api/campaigns/${hc.id}`, { timeElapsed: { total: hours[0] * 60 + 2 } });
    try {
      await page.goto(`${BASE}/game/${hc.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: GEAR }).waitFor({ timeout: 60000 });
      await sleep(3000);
      if ((await campOf(hc.id)).galaxyMap.encounter) throw new Error("a gang is on the party before it has walked into the alley");
      await tap(`sq:${alley.x + 1},${alley.y + Math.floor(alley.height / 2)}`);
      let phase = "";
      for (let i = 0; i < 90 && phase !== "surround"; i++) {
        await sleep(1000);
        phase = (await campOf(hc.id)).galaxyMap.encounter?.phase;
      }
      if (phase !== "surround") throw new Error("the gang never surrounded the party (phase " + phase + ")");
      const hud = await page.getByTestId("encounter").innerText();
      if (!/Fight the gang/.test(hud) || !/Pay the toll/.test(hud)) throw new Error("the options: " + hud.replace(/\s+/g, " "));
      // The way out is barred: a walk out of the alley is refused
      await tap(`sq:${alley.x + 1},${alley.y - 3}`);
      await page.getByText("The gang bars the way out of the alley.").first().waitFor({ timeout: 15000 });
      const before = (await getChar(h.id)).credits;
      await page.getByRole("button", { name: "Fight the gang" }).click();
      await page.getByText(/Combat - Round/).waitFor({ timeout: 60000 });
      const seen = [];
      for (let i = 0; i < 300; i++) {
        if (!(await page.getByText(/Combat - Round/).count())) break;
        for (const l of await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])) if (!seen.includes(l)) seen.push(l);
        const save = page.getByRole("button", { name: "Death saving throw" });
        const melee = page.getByRole("button", { name: "Melee", exact: true });
        if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
        else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
        else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
        await sleep(300);
      }
      await sleep(2500);
      const camp = await campOf(hc.id);
      if (camp.galaxyMap.encounter) throw new Error("the gang is still there after the fight: " + seen.slice(-3).join(" | "));
      const after = await getChar(h.id);
      if (after.credits !== before + 350) throw new Error(`credits ${before} -> ${after.credits}, not the boss's purse of 350`);
      return `the gang closed in, the alley was barred, the fight opened on the map and won (${seen.filter((l) => /breaks and runs/.test(l)).length ? "the rest ran when their leader fell" : "all fell"}); +350 credits`;
    } finally {
      await page.evaluate(() => localStorage.setItem("sw5e.noEncounters", "1"));
    }
  });

  await step(ctx, "gathering: a vein in the room is mined with a scavenging kit; the ore is kept and the vein runs dry", async () => {
    const mk = await newChar({ equipment: ["Scavenging kit"], toolProficiencies: ["Scavenging kit"] });
    const mc = await newCamp(mk, 11, async (world, start) => addNode(start, "e2e-vein", "Mineral vein", { family: "ore", tier: 0, material: "ore-0", charges: 2, max: 2 }));
    const button = () => page.getByTestId("play-node").getByRole("button", { name: /^Mine/ });
    await page.getByTestId("play-node").waitFor();
    for (let i = 0; i < 12; i++) {
      const node = await veinIn(mc.id, "e2e-vein");
      if (!node || node.charges <= 0) break;
      await button().click();
      await sleep(1500);
    }
    const node = await veinIn(mc.id, "e2e-vein");
    if (node.charges !== 0) throw new Error("the vein still has " + node.charges + " harvests after 12 tries");
    await sleep(800);
    const c = await getChar(mk.id);
    const ore = c.playState?.materials?.["ore-0"] ?? 0;
    if (ore < 1) throw new Error("no ore kept: " + JSON.stringify(c.playState?.materials));
    if (!(await button().isDisabled())) throw new Error("the button of a worked-out vein is still enabled");
    return `vein of 2 harvests run dry; ${ore} x Scrap metal kept in the character's stacks`;
  });

  await step(ctx, "gathering: a premium vein is refused to bare hands, and nothing is taken", async () => {
    const bh = await newChar({ equipment: [] });
    const bc = await newCamp(bh, 17, async (world, start) => addNode(start, "e2e-rich", "Glittering seam", { family: "ore", tier: 1, material: "ore-1", charges: 3, max: 3 }));
    await page.getByTestId("play-node").waitFor();
    await page.getByTestId("play-node").getByRole("button", { name: /^Mine/ }).click();
    await page.getByText(/It takes a scavenging kit to work this premium find/).waitFor();
    await sleep(800);
    const node = await veinIn(bc.id, "e2e-rich");
    if (node.charges !== 3) throw new Error("a refused harvest used the vein: " + node.charges);
    const c = await getChar(bh.id);
    if (Object.keys(c.playState?.materials ?? {}).length) throw new Error("materials given without a kit: " + JSON.stringify(c.playState.materials));
    return "refused without a kit: the vein keeps its 3 harvests, nothing is taken";
  });

  await step(ctx, "crafting: a plant stock does not pay for a blaster (it is not what an armstech works with); ore pays for it and is spent", async () => {
    const ar = await newChar({ credits: 0, equipment: ["Armstech's implements"], toolProficiencies: ["Armstech's implements"], playState: { materials: { "plant-1": 50 } } });
    await newCamp(ar, 19, async () => {});
    await dtCraft("Blaster pistol");
    await page.getByTestId("downtime-craft").waitFor();
    if (!(await page.getByTestId("downtime-craft").isDisabled())) throw new Error("a plant stock let an armstech build a blaster");
    const br = await newChar({ credits: 0, equipment: ["Armstech's implements"], toolProficiencies: ["Armstech's implements"], playState: { materials: { "ore-1": 12 } } });
    await newCamp(br, 23, async () => {});
    await dtCraft("Blaster pistol");
    await page.getByTestId("downtime-craft").click();
    await page.getByText(/Materials used: .*Durasteel ore/).first().waitFor({ timeout: 20000 });
    await sleep(1200);
    const c = await getChar(br.id);
    if (!c.equipment.includes("Blaster pistol")) throw new Error("no blaster made: " + JSON.stringify(c.equipment));
    const left = c.playState?.materials?.["ore-1"] ?? 0;
    if (left >= 12) throw new Error("no ore spent: " + left);
    return `plant stock refused for a blaster; ore paid it: ${12 - left} of 12 Durasteel ore used, ${c.credits} credits left`;
  });

  await step(ctx, "refining: four units of scrap metal are refined with a scavenging kit (one refined unit, or one unit spoiled)", async () => {
    const rf = await newChar({ equipment: ["Scavenging kit"], toolProficiencies: ["Scavenging kit"], playState: { materials: { "ore-0": 4 } } });
    const rc = await newCamp(rf, 29, async () => {});
    await page.getByRole("tab", { name: "Downtime" }).click();
    await page.getByTestId("downtime").waitFor();
    await page.getByTestId("downtime-crafting").click();
    await page.getByRole("button", { name: "Refine", exact: true }).click();
    await page.getByTestId("downtime-refine-pick").selectOption("ore-0");
    await page.getByTestId("downtime-refine").click();
    await page.getByText(/Refining Scrap metal/).first().waitFor();
    await sleep(1200);
    const c = await getChar(rf.id);
    const m = c.playState?.materials ?? {};
    const ok = (m["ore-0-r"] ?? 0) === 1 && !m["ore-0"];
    const spoiled = m["ore-0"] === 3 && !m["ore-0-r"];
    if (!ok && !spoiled) throw new Error("refining left " + JSON.stringify(m));
    return ok ? "four scrap metal refined to one refined unit" : "the roll failed: one scrap metal spoiled, three kept";
  });

  await step(ctx, "checks: the player picks who rolls and with which skill; cancelling calls the check off", async () => {
    const trooper = await named("trooper");
    const ck = await newChar({
      equipment: ["Scavenging kit"], toolProficiencies: ["Scavenging kit"],
      companionData: { party: [{ id: "c-e2e-trooper", name: "Trooper Bo", kind: "hireling", role: "guard", statBlock: trooper.id, armorClass: 14, maxHp: 20, hp: 20, speed: 30, loadout: [], wage: 0, joined: 0 }] },
    });
    const kc = await newCamp(ck, 31, async (world, start) => addNode(start, "e2e-check", "Mineral vein", { family: "ore", tier: 0, material: "ore-0", charges: 2, max: 2 }));
    // Turn the dialog on for this step only (the context's default skips it)
    await page.evaluate(() => localStorage.setItem("sw5e.autoChecks", "0"));
    try {
      const mine = () => page.getByTestId("play-node").getByRole("button", { name: /^Mine/ });
      await mine().click();
      await page.getByTestId("check-dialog").waitFor();
      await page.getByTestId("check-who-c-e2e-trooper").click();
      await page.getByTestId("check-skill-none").click();
      await page.getByTestId("check-roll").click();
      await page.getByText(/Trooper Bo: Mine Mineral vein/).waitFor();
      await sleep(1000);
      const before = await veinIn(kc.id, "e2e-check");
      await mine().click();
      await page.getByTestId("check-dialog").waitFor();
      await page.getByTestId("check-cancel").click();
      await page.getByTestId("check-dialog").waitFor({ state: "detached" });
      await sleep(800);
      const after = await veinIn(kc.id, "e2e-check");
      if (after.charges !== before.charges) throw new Error(`a cancelled check still worked the vein: ${before.charges} -> ${after.charges}`);
      return `Trooper Bo rolled the mining check; cancelling left the vein at ${after.charges} harvests`;
    } finally {
      await page.evaluate(() => localStorage.setItem("sw5e.autoChecks", "1"));
    }
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
      await page.locator(`a[href="/characters/${id}"]`).waitFor({ state: "detached", timeout: 30000 });
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
