// Enhanced items in play (2026-10-15): attunement, a stimpac, an enhanced weapon, and surgery at a
// medic (a prosthesis and an enhancement). Self-contained; run it against the test copy:
//   BASE=http://127.0.0.1:5001 node e2e/items.mjs
import { open, step, summary, api, BASE } from "./lib.mjs";

const ctx = await open();
const { page, browser } = ctx;
const TAG = Date.now().toString(36);
const NAME = "Items " + TAG;
const sleep = (ms) => page.waitForTimeout(ms);
const made = [];
const getChar = async (id) => (await api("GET", `/api/characters/${id}`)).json;
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

let c = null;
let camp = null;
const facts = (await api("GET", "/api/sw5e/itemFacts")).json;
const all = Object.values(facts);
const belt = all.find((f) => f.type === "AdventuringGear" && f.attune === 1 && f.effects.setScores?.strength);
const stim = all.find((f) => f.timed?.kind === "stimpac" && f.effects && f.timed.effects.raiseScores?.strength);
const weapon = all.find((f) => f.type === "Weapon" && f.attune === 0 && f.effects.attack && f.subtype);
const enh = all.find((f) => f.name === "Strength Enhancement (Basic)");

await step(ctx, "items: facts are served and parsed", async () => {
  if (!belt || !stim || !weapon || !enh) throw new Error(JSON.stringify({ belt: belt?.name, stim: stim?.name, weapon: weapon?.name, enh: enh?.name }));
  return `${all.length} items; belt ${belt.name}, stimpac ${stim.name}, weapon ${weapon.name}`;
});

await step(ctx, "items: a character carrying them opens Play", async () => {
  const r = await api("POST", "/api/characters", {
    name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
    abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30, credits: 5000,
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"],
    equipment: ["Blaster pistol", belt.name, stim.name, enh.name, "Arm prosthesis", weapon.name],
  });
  if (r.status !== 201) throw new Error(r.text.slice(0, 300));
  c = r.json;
  made.push(c.id);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
  const start = world.areas[world.startId];
  start.occupants = []; start.loot = []; start.ships = [];
  start.layout.assets = start.layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship");
  const l = start.layout;
  const blocked = (x, y) => l.assets.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
  const doors = l.assets.filter((a) => a.side).map((a) => `${a.x},${a.y}`);
  const medic = { id: "ox-medic", name: "Dr. Venn", role: "medic", disposition: "friendly", count: 1, species: "Human", loadout: [] };
  outer: for (let y = l.height - 1; y >= 0; y--) for (let x = l.width - 1; x >= 0; x--) {
    if (blocked(x, y) || doors.includes(`${x},${y}`)) continue;
    l.assets.push({ id: "t-ox-medic", kind: "npc", name: medic.name, x, y, w: 1, h: 1, ref: medic.id });
    start.occupants.push(medic);
    break outer;
  }
  const made2 = await api("POST", "/api/campaigns", { characterId: c.id, name: "E2E items " + TAG, description: "items", npcs: [], locations: [], quests: [], startingLocation: "start", galaxyMap: world });
  if (made2.status !== 201) throw new Error(made2.text.slice(0, 200));
  camp = made2.json;
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await sleep(2500);
  await page.getByRole("tab", { name: "Inventory" }).click();
  await sleep(500);
  return "Play is open";
});

await step(ctx, "items: attunement is needed, takes a slot and an hour", async () => {
  const line = page.getByTestId(`item-effects-${belt.name}`);
  const before = await line.innerText();
  if (!/needs attunement/i.test(before)) throw new Error("before: " + before);
  await page.getByTestId(`attune-${belt.name}`).click();
  await sleep(1500);
  const after = await page.getByTestId(`item-effects-${belt.name}`).innerText();
  const saved = await getChar(c.id);
  if (!saved.playState?.attuned?.includes(belt.name)) throw new Error("not saved: " + JSON.stringify(saved.playState));
  if (!/, attuned/.test(after)) throw new Error("after: " + after);
  const slots = await page.getByTestId("attunement-slots").innerText();
  return `${after.replace(/\s+/g, " ").slice(0, 100)} | ${slots}`;
});

await step(ctx, "items: an enhanced weapon shows its bonus; a stimpac is used and gone", async () => {
  const w = await page.getByTestId(`item-effects-${weapon.name}`).innerText();
  if (!/\+\d\/\+\d attack\/damage/.test(w)) throw new Error("weapon: " + w);
  await page.getByTestId(`take-${stim.name}`).click();
  await sleep(1500);
  const saved = await getChar(c.id);
  if (saved.equipment.includes(stim.name) || saved.playState?.buffs?.length !== 1) throw new Error(JSON.stringify({ eq: saved.equipment, ps: saved.playState }));
  return `${w.replace(/\s+/g, " ").slice(0, 60)}; buff ${saved.playState.buffs[0].name}`;
});

await step(ctx, "items: a medic fits a prosthesis and an enhancement", async () => {
  await tap("npc:ox-medic");
  const panel = page.getByTestId("map-card").getByTestId("augment-ox-medic");
  await panel.waitFor();
  const before = (await getChar(c.id)).credits;
  for (const name of ["Arm prosthesis", enh.name]) {
    for (let tries = 0; tries < 5; tries++) {
      const have = (await getChar(c.id)).playState?.augments ?? [];
      if (have.some((a) => a.name === name)) break;
      await page.getByTestId("map-card").getByTestId(`install-${name}`).click();
      await sleep(1500);
    }
  }
  const saved = await getChar(c.id);
  const names = (saved.playState?.augments ?? []).map((a) => a.name);
  if (!names.includes("Arm prosthesis") || !names.includes(enh.name)) throw new Error("fitted: " + names.join(", "));
  if (!(saved.credits < before)) throw new Error("credits " + before + " -> " + saved.credits);
  return `fitted ${names.join(" and ")}; credits ${before} -> ${saved.credits}`;
});

await step(ctx, "items: augmentations show on the inventory after a reload", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 60000 });
  await page.getByRole("tab", { name: "Inventory" }).click();
  const text = await page.getByTestId("augmentations").innerText();
  if (!/Arm prosthesis/.test(text) || !/Strength Enhancement/.test(text)) throw new Error(text);
  return text.replace(/\s+/g, " ").slice(0, 160);
});

if (!process.env.KEEP) {
  for (const id of made) {
    for (const k of await api("GET", "/api/campaigns").then((r) => r.json.filter((x) => x.characterId === id))) await api("DELETE", `/api/campaigns/${k.id}`);
    await api("DELETE", `/api/characters/${id}`);
  }
}
const failed = summary();
await browser.close();
process.exit(failed ? 1 : 0);
