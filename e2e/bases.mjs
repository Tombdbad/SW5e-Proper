// Beasts, carrying, spacing and bases in play (2026-10-26). A character over their carrying capacity with a hireling and two droids in the
// party and a bantha saved among them the old way: the load must count the whole pack (the companions no longer take it silently), the
// bantha must be moved to the beasts, follow, be ridden and carry what is loaded onto it; nobody may stand on another's square; a tent and a
// chest set down out in front of a building make a camp, and what is put in the chest is still there after a reload.
// Self-contained (makes and deletes its own character and campaign). Usage: BASE=http://localhost:5057 node e2e/bases.mjs
import { open, step, summary, api, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, browser } = ctx;
const TAG = Date.now().toString(36);
const NAME = "Bases " + TAG;
const wait = (ms) => page.waitForTimeout(ms);
const made = { chars: [], camps: [] };
const getChar = async (id) => (await api("GET", `/api/characters/${id}`)).json;
const getCamp = async (id) => (await api("GET", `/api/campaigns/${id}`)).json;
const tab = async (name) => { await page.getByTestId(`hud-tab-${name}`).click(); await wait(300); };
const companion = (o) => ({ armorClass: 12, maxHp: 20, hp: 20, speed: 30, loadout: [], wage: 0, joined: 0, role: "ally", ...o });
const RIFLE = "Anti-materiel rifle";
let c, camp, buildingId;

try {
  await step(ctx, "bases: a laden character, companions and an old-style beast open Play out in front of a building", async () => {
    const r = await api("POST", "/api/characters", {
      name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
      abilityScores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"],
      equipment: ["Tent, two-person", "Chest", "Blaster pistol", "Hovercart", ...Array(9).fill(RIFLE)],
      companionData: {
        party: [
          companion({ id: "c-hire", name: "Senn Solus", kind: "hireling", role: "mercenary", species: "Bothan", size: "Medium", creature: "humanoid", saves: { strength: 3 }, wage: 20 }),
          companion({ id: "c-bb", name: "BB Series Astromech Droid", kind: "droid", role: "droid", size: "Small", creature: "droid" }),
          companion({ id: "c-deka", name: "Destroyer Droid", kind: "droid", role: "droid", size: "Medium", creature: "droid", statBlock: "destroyer-droid" }),
          companion({ id: "c-bantha", name: "Bantha", kind: "beast", role: "wildlife", size: "Huge", creature: "beast", saves: { strength: 5 }, mount: true, speed: 30 }),
        ],
      },
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    c = r.json;
    made.chars.push(c.id);
    const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 3 } })).json.world;
    const start = world.areas[world.startId];
    buildingId = start.kind === "room" ? start.parentId : start.id;
    for (const a of Object.values(world.areas)) if (a.parentId === buildingId || a.id === buildingId) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
    const m = await api("POST", "/api/campaigns", { characterId: c.id, name: "E2E bases " + TAG, description: "bases", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: buildingId, galaxyMap: world, timeElapsed: { total: 0 } });
    if (m.status !== 201) throw new Error(m.text.slice(0, 200));
    camp = m.json;
    made.camps.push(camp.id);
    await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
    await wait(Number(process.env.SETTLE || 20000));
    return `campaign ${camp.id}, out in front of ${world.areas[buildingId].name}`;
  });

  await step(ctx, "bases: the bantha is a beast, not a companion", async () => {
    const saved = await getChar(c.id);
    const party = saved.companionData.party.map((x) => x.name);
    const beasts = (saved.companionData.beasts ?? []).map((x) => x.name);
    if (party.includes("Bantha") || !beasts.includes("Bantha")) throw new Error(JSON.stringify({ party, beasts }));
    await tab("party");
    await page.getByTestId("play-beasts").waitFor();
    return `party: ${party.join(", ")}; beasts: ${beasts.join(", ")}`;
  });

  await step(ctx, "bases: the load counts the whole pack (the companions do not take it)", async () => {
    await tab("pack");
    const line = page.getByTestId("load-line");
    const level = await line.getAttribute("data-level");
    const text = await line.textContent();
    if (level !== "3") throw new Error(`level ${level}: ${text}`);
    return text.trim();
  });

  await step(ctx, "bases: nobody stands on anyone's square, and the followers keep clear of the leader", async () => {
    await wait(4000);
    const claims = await page.evaluate(() => window.__claims?.() ?? {});
    const squares = Object.values(claims);
    if (new Set(squares).size !== squares.length) throw new Error("shared squares: " + JSON.stringify(claims));
    const lead = claims.leader?.split(",").map(Number);
    if (!lead) throw new Error("no leader claim " + JSON.stringify(claims));
    const near = Object.entries(claims).filter(([id]) => id.startsWith("follow:")).map(([id, sq]) => { const [x, y] = sq.split(",").map(Number); return [id, Math.max(Math.abs(x - lead[0]), Math.abs(y - lead[1]))]; });
    if (near.length < 4) throw new Error("followers missing: " + JSON.stringify(claims));
    if (near.some(([, d]) => d < 1)) throw new Error("on the leader: " + JSON.stringify(near));
    await page.screenshot({ path: `${OUT}/bases-followers.png` });
    return near.map(([id, d]) => `${id.slice(7)} ${d} away`).join(", ");
  });

  await step(ctx, "bases: mount the bantha and load rifles onto it", async () => {
    await tab("party");
    await page.getByTestId("mount-c-bantha").click();
    await wait(1500);
    if ((await getChar(c.id)).companionData.riding !== "c-bantha") throw new Error("not riding");
    await tab("pack");
    await page.getByTestId("load-target").selectOption("c-bantha");
    for (let i = 0; i < 5; i++) { await page.getByTestId(`load-${RIFLE}`).click(); await wait(900); }
    const saved = await getChar(c.id);
    const pack = saved.companionData.beasts.find((b) => b.id === "c-bantha").pack ?? [];
    const level = await page.getByTestId("load-line").getAttribute("data-level");
    if (pack.length !== 5 || saved.equipment.filter((n) => n === RIFLE).length !== 4) throw new Error(JSON.stringify({ pack, equipment: saved.equipment }));
    if (level === "3") throw new Error("still over capacity after loading 85 lb onto the bantha");
    await page.screenshot({ path: `${OUT}/bases-mounted.png` });
    return `bantha carries ${pack.length} rifles; load level now ${level}`;
  });

  // A close look from the side at whoever the probe calls `me`
  const closeLook = async (file, far = 3.2, up = 1.6) => {
    await page.evaluate(([far, up]) => { const m = window.__map3d; const p = m?.world("me"); if (p) m.look([p[0] + far, p[1] + up, p[2] + far * 0.6], [p[0], p[1] + 0.3, p[2]]); }, [far, up]);
    await wait(1500);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  };

  await step(ctx, "bases: the rider sits on the bantha's back, and Dismount gets down", async () => {
    await closeLook("bases-rider");
    await tab("party");
    await page.getByTestId("dismount-c-bantha").click();
    await wait(1500);
    const riding = (await getChar(c.id)).companionData.riding;
    if (riding) throw new Error("still riding " + riding);
    await page.getByTestId("mount-c-bantha").waitFor();
    return "on foot again";
  });

  await step(ctx, "bases: the hovercart is on the map, pulled behind; loaded; pushed; parked", async () => {
    let saved = await getChar(c.id);
    if (saved.equipment.includes("Hovercart")) throw new Error("the hovercart is still in the pack");
    const cart = (saved.companionData.carts ?? [])[0];
    if (!cart || cart.handler !== "me" || cart.mode !== "pull") throw new Error("no cart pulled by the character: " + JSON.stringify(saved.companionData.carts));
    await tab("pack");
    await page.getByTestId("load-target").selectOption(cart.id);
    await page.getByTestId(`load-${RIFLE}`).click();
    await wait(1200);
    await tab("party");
    await page.getByTestId(`cart-mode-${cart.id}`).click();
    await wait(1200);
    await closeLook("bases-cart-pushed", 3.5, 2);
    saved = await getChar(c.id);
    const now = saved.companionData.carts[0];
    if (now.mode !== "push" || now.pack.length !== 1) throw new Error(JSON.stringify(now));
    await page.getByTestId(`cart-park-${cart.id}`).click();
    await wait(1200);
    const parked = (await getChar(c.id)).companionData.carts[0];
    if (!parked.parked || parked.handler) throw new Error(JSON.stringify(parked));
    await page.getByTestId(`cart-handler-${cart.id}`).selectOption("me");
    await wait(1200);
    const back = (await getChar(c.id)).companionData.carts[0];
    if (back.parked || back.handler !== "me") throw new Error(JSON.stringify(back));
    return `${cart.name}: holds ${now.pack.join(", ")}; pushed, parked at ${parked.parked.x},${parked.parked.y}, taken again`;
  });

  // Set down a piece from the base panel by tapping squares round the leader until one takes it
  const setDown = async (item) => {
    // (the camera high over the leader: from a close look's low angle a tap on the ground can land on a door in front of it)
    await page.evaluate(() => { const m = window.__map3d; const p = m?.world("me"); if (p) m.look([p[0], p[1] + 14, p[2] + 7], [p[0], p[1], p[2]]); });
    await wait(1200);
    await tab("party");
    await page.getByTestId(`set-down-${item}`).click();
    await page.getByTestId("placing").waitFor();
    const before = ((await getCamp(camp.id)).galaxyMap.bases ?? []).flatMap((b) => b.pieces).length;
    const [lx, ly] = (await page.evaluate(() => window.__claims?.().leader ?? "0,0")).split(",").map(Number);
    // squares away from the building first (a tap near it may land on its door and walk the party in)
    const rooms = Object.values((await getCamp(camp.id)).galaxyMap.areas).filter((a) => a.parentId === buildingId && a.layout).map((a) => a.layout);
    const nearBuilding = (x, y) => rooms.some((l) => x >= l.x - 1 && x < l.x + l.width + 1 && y >= l.y - 1 && y < l.y + l.height + 1);
    const tries = [[0, 3], [3, 0], [0, -3], [-3, 0], [3, 3], [-3, 3], [3, -3], [-3, -3], [0, 5], [5, 0], [0, -5], [-5, 0], [-4, 2], [-4, -2], [4, 2], [4, -2], [-6, 0], [0, 6], [0, -6], [6, 0]].filter(([dx, dy]) => !nearBuilding(lx + dx, ly + dy));
    for (const [dx, dy] of tries) {
      const p = await page.evaluate((k) => window.__map3d?.at(k) ?? null, `sq:${lx + dx},${ly + dy}`);
      if (!p) continue;
      const box = await page.locator("canvas").first().boundingBox();
      if (p.x < box.x + 5 || p.x > box.x + box.width - 5 || p.y < box.y + 5 || p.y > box.y + box.height - 5) continue;
      await page.mouse.click(p.x, p.y);
      await wait(1500);
      const pieces = ((await getCamp(camp.id)).galaxyMap.bases ?? []).flatMap((b) => b.pieces);
      if (pieces.length > before) return pieces[pieces.length - 1];
      if (!(await page.getByTestId("placing").isVisible().catch(() => false))) await page.getByTestId(`set-down-${item}`).click();
    }
    throw new Error(`could not set down the ${item}`);
  };

  let chest, tent;
  await step(ctx, "bases: a tent and a chest set down make a camp", async () => {
    tent = await setDown("Tent, two-person");
    chest = await setDown("Chest");
    const saved = await getChar(c.id);
    if (saved.equipment.includes("Chest") || saved.equipment.includes("Tent, two-person")) throw new Error("still in the pack");
    const base = (await getCamp(camp.id)).galaxyMap.bases[0];
    await page.screenshot({ path: `${OUT}/bases-camp.png` });
    const p = await page.evaluate((k) => window.__map3d?.world(k), `sq:${tent.x + 1},${tent.y + 1}`);
    if (p) await page.evaluate((p) => window.__map3d.look([p[0] + 2.6, 2.2, p[2] + 2.6], [p[0], 0.5, p[2]]), p);
    await wait(1500);
    await page.screenshot({ path: `${OUT}/bases-tent.png` });
    return `${base.name} (${base.kind}): ${base.pieces.map((p) => `${p.name} at ${p.x},${p.y}`).join(", ")}; tent ${tent.id}`;
  });

  await step(ctx, "bases: the tent's card offers rests and waits", async () => {
    await tab("party");
    await page.getByTestId(`base-piece-${tent.id}`).click();
    await page.getByTestId("piece-rest").waitFor();
    const labels = await page.getByTestId("piece-rest").locator("button").allTextContents();
    for (const want of ["Short rest", "Long rest", "Wait 1 h", "Until evening", "Until morning"]) if (!labels.includes(want)) throw new Error("missing " + want + ": " + labels.join(", "));
    await page.getByTestId("piece-wait-1-h").click();
    await page.getByText(/Waited an hour/).first().waitFor({ timeout: 8000 });
    return labels.join(", ");
  });

  await step(ctx, "bases: a blaster put in the chest is still there after a reload", async () => {
    await page.getByTestId(`base-piece-${chest.id}`).click();
    await page.getByTestId("store-item").selectOption("Blaster pistol");
    await wait(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
    await wait(8000);
    const kept = (await getCamp(camp.id)).galaxyMap.bases[0].pieces.find((p) => p.id === chest.id).items;
    if (!kept.includes("Blaster pistol")) throw new Error("chest holds " + JSON.stringify(kept));
    if ((await getChar(c.id)).equipment.includes("Blaster pistol")) throw new Error("the blaster is still in the pack");
    await tab("party");
    await page.getByTestId(`base-piece-${chest.id}`).click();
    await page.getByTestId("take-out-Blaster pistol").waitFor();
    return `the chest keeps: ${kept.join(", ")}`;
  });
} finally {
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`);
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`);
  await summary(ctx);
  await browser.close();
}
