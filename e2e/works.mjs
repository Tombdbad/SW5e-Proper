// Ship and droid works in a real browser (2026-10-21; shared/logic/shipyard.ts and the cards on the 3D map): a scrapyard's dealer sells
// salvaged ship parts and buys them back; a shipyard's mechanic fits a part from the hold (a fee and days of work, the ship grounded);
// the showroom's outfitter sells new parts; aboard, the crew installs a part itself (a workforce, days on the clock, a mechanic's kit
// check). Self-contained: makes and deletes its own character and campaign, on seed 14 (an Outer Rim city with a scrapyard, a shipyard
// and a droid dealer). Not the play-through: a few minutes. Usage: BASE=http://127.0.0.1:5002 node e2e/works.mjs   (ONLY=ships|droids)
import { open, api, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, events, browser } = ctx;
await page.setViewportSize({ width: Number(process.env.W || 1000), height: Number(process.env.H || 700) });
const NAME = "Works " + Date.now().toString(36);
const SEED = Number(process.env.SEED || 14);
let charId;
const camps = [];
let failed = false;
const sleep = (ms) => page.waitForTimeout(ms);
const getChar = async () => (await api("GET", `/api/characters/${charId}`)).json;
const getCamp = async (id) => (await api("GET", `/api/campaigns/${id}`)).json;
const card = () => page.getByTestId("map-card");
// Open a person's card: a tap where they are drawn (they move about), checked by their name on the card; else a double tap on the
// counter they serve at, which calls them over
const openPerson = async (room, who) => {
  const counter = room.layout?.assets.find((a) => a.kind === "furniture" && /counter|desk/i.test(a.name));
  for (let tries = 0; tries < 5; tries++) {
    const at = await page.evaluate((k) => window.__map3d?.at(`asset:${k}`) ?? null, who.asset.id);
    if (tries < 2 && at) {
      await page.mouse.click(at.x, at.y);
    } else if (tries < 3 && counter) {
      const c = await page.evaluate((k) => window.__map3d?.at(`asset:${k}`) ?? null, counter.id);
      if (c) await page.mouse.dblclick(c.x, c.y);
    } else {
      // (as a tap on them would: the test hook picks them out)
      console.log(`  (${who.o.name}: picked out by the test hook)`);
      await page.evaluate((id) => window.__play?.pick("occupant", id), who.o.id);
    }
    const ok = await page.waitForFunction((name) => (document.querySelector('[data-testid="map-card"]')?.textContent ?? "").includes(name), who.o.name, { timeout: 20000 }).then(() => true).catch(() => false);
    if (ok) return;
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(4000);
  }
  await page.screenshot({ path: `${OUT}/works-fail.png`, timeout: 60000 }).catch(() => {});
  throw new Error(`could not open the card of ${who.o.name}`);
};
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    const note = await fn();
    console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)${note ? `: ${note}` : ""}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}: ${e.message}`);
    await page.screenshot({ path: `${OUT}/works-${name.replace(/\W+/g, "-").slice(0, 40)}.png`, timeout: 60000 }).catch(() => {});
    console.log(events.slice(-8).join("\n"));
  }
};
// A room's person of a role, with the asset that draws them
const personIn = (room, test) => {
  for (const o of room.occupants) {
    const asset = room.layout?.assets.find((a) => a.kind === "npc" && a.ref === o.id);
    if (asset && test(o)) return { o, asset };
  }
  return null;
};
const goTo = async (campId, roomId, settleMs = 40000) => {
  await api("PATCH", `/api/campaigns/${campId}`, { currentLocation: roomId });
  await page.goto(`${BASE}/game/${campId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
  await sleep(Number(process.env.SETTLE || settleMs));
};

try {
  const c = (await api("POST", "/api/characters", {
    name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 5,
    abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 12, charisma: 12 },
    maxHp: 44, currentHp: 44, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 400000,
    startingLocation: "Unknown", skillProficiencies: ["Technology"], savingThrowProficiencies: ["strength"], toolProficiencies: ["Mechanic's kit", "Astrotech's implements"],
    equipment: ["Blaster pistol", "Mechanic's kit", "Astrotech's implements"],
  })).json;
  charId = c.id;
  const world = (await api("POST", "/api/world/generate", { options: { seed: SEED, partyLevel: 5 } })).json.world;
  const areas = Object.values(world.areas);
  let settlement = world.areas[world.startId];
  while (settlement && settlement.kind !== "settlement") settlement = world.areas[settlement.parentId];
  const inTown = (type) => areas.filter((a) => a.kind === "building" && a.parentId === settlement.id && a.type === type);
  const roomsOf = (b) => areas.filter((a) => a.parentId === b.id && a.kind === "room");
  // Nobody hostile about, the shops open
  for (const a of areas) if (a.kind === "room") a.occupants = (a.occupants ?? []).filter((o) => o.disposition !== "hostile");
  const scrap = [...inTown("junkyard"), ...inTown("scrap dealer")].map((b) => roomsOf(b).map((r) => ({ r, d: personIn(r, (o) => o.trade === "salvage") })).find((x) => x.d)).find(Boolean);
  const yard = inTown("shipyard")[0];
  if (!scrap || !yard) throw new Error(`seed ${SEED}: no scrap dealer or shipyard in ${settlement.name}`);
  const hangar = roomsOf(yard).find((r) => /mechanics hangar/i.test(r.name));
  const showroom = roomsOf(yard).find((r) => /upgrade showroom/i.test(r.name));
  const mechanic = personIn(hangar, (o) => o.role === "mechanic");
  const outfitter = personIn(showroom, (o) => o.role === "starship outfitter");
  const ship = { id: "works-ship", name: "Rust Bucket", size: "Small", role: "Freighter", tier: 0, status: "landed", owner: NAME, equipment: ["Deflection armor", "Assault laser cannon"], value: 20000, fuel: 4, hyperdriveClass: "2", areaId: settlement.id, hangar: yard.id };
  const camp = (await api("POST", "/api/campaigns", { characterId: charId, name: NAME, description: "works", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: scrap.r.id, galaxyMap: world, starships: [ship], timeElapsed: { total: 600 } })).json;
  camps.push(camp.id);

  if (process.env.ONLY !== "droids") {
    await step("a scrapyard's dealer sells salvaged ship parts of low grade and buys them back", async () => {
      await goTo(camp.id, scrap.r.id);
      await openPerson(scrap.r, scrap.d);
      const counter = card().getByTestId("parts-salvage");
      await counter.waitFor({ timeout: 20000 });
      const lines = counter.getByTestId("parts-line");
      if (!(await lines.count())) throw new Error("no parts at the scrapyard");
      const text = (await counter.getByTestId("parts-stock").innerText()).replace(/\s+/g, " ");
      if (/grade [2-5]/.test(text) || /prototype|advanced/i.test(text)) throw new Error(`a scrapyard sells high grades: ${text.slice(0, 200)}`);
      const before = await getChar();
      await lines.first().getByTestId("parts-buy").click();
      await sleep(2000);
      const after = await getChar();
      const parts = after.playState?.shipParts ?? [];
      if (parts.length !== 1 || !(after.credits < before.credits)) throw new Error(`parts ${parts.length}, credits ${before.credits} -> ${after.credits}`);
      await counter.getByTestId("parts-sell-tab").click();
      await counter.getByTestId("parts-sell").first().click();
      await sleep(2000);
      const sold = await getChar();
      if ((sold.playState?.shipParts ?? []).length !== 0 || !(sold.credits > after.credits)) throw new Error("selling the part back did nothing");
      // Buy one again for the yard to fit
      await counter.getByRole("button", { name: "Buy", exact: true }).click();
      await lines.first().getByTestId("parts-buy").click();
      await sleep(2000);
      return `${parts[0].name} bought for ${before.credits - after.credits}, sold back for ${sold.credits - after.credits}`;
    });

    await step("the shipyard's mechanic fits a part from the hold: a fee, days of work, the ship grounded", async () => {
      await goTo(camp.id, hangar.id);
      await openPerson(hangar, mechanic);
      const work = card().getByTestId("yard-work");
      await work.waitFor({ timeout: 20000 });
      const fit = work.getByTestId("yard-fit-part").first();
      await fit.waitFor({ timeout: 10000 });
      const label = await fit.innerText();
      const before = await getChar();
      await fit.click();
      await sleep(2500);
      const after = await getChar();
      const s = (await getCamp(camp.id)).starships[0];
      const fitted = (s.mods ?? []).length + s.equipment.length - 2 + Object.keys(s.enhanced ?? {}).length;
      if (!s.work || !(after.credits < before.credits) || fitted < 1) throw new Error(`work ${JSON.stringify(s.work)}, credits ${before.credits} -> ${after.credits}, mods ${JSON.stringify(s.mods)}`);
      return `${label}; ready at minute ${s.work.ready}`;
    });

    await step("the showroom sells new parts, of grades a far city has, and installed ones", async () => {
      // The yard's work done: let the clock pass it
      const s = (await getCamp(camp.id)).starships[0];
      await api("PATCH", `/api/campaigns/${camp.id}`, { timeElapsed: { total: (s.work?.ready ?? 0) + 60 } });
      await goTo(camp.id, showroom.id);
      await openPerson(showroom, outfitter);
      const counter = card().getByTestId("parts-yard");
      await counter.waitFor({ timeout: 20000 });
      const text = (await counter.getByTestId("parts-stock").innerText()).replace(/\s+/g, " ");
      if (/grade [4-5]/.test(text)) throw new Error("an Outer Rim city's yard sells grade 4 or 5");
      const before = await getChar();
      const line = counter.getByTestId("parts-line").filter({ hasText: /modification/ }).first();
      await line.getByTestId("parts-buy").click();
      await sleep(2000);
      const after = await getChar();
      if ((after.playState?.shipParts ?? []).length !== 1 || !(after.credits < before.credits)) throw new Error("buying a new part did nothing");
      return `${text.slice(0, 120)}...`;
    });

    await step("aboard, the crew installs the part itself: a mechanic's kit check, days on the clock", async () => {
      const before = await getCamp(camp.id);
      await goTo(camp.id, hangar.id);
      const shipAt = await page.evaluate(() => window.__map3d?.at("ship:works-ship") ?? null);
      if (!shipAt) throw new Error("the ship is not on the map");
      await page.mouse.click(shipAt.x, shipAt.y);
      await card().getByTestId("ship-board").click();
      await sleep(3000);
      await page.getByTestId("ship-systems-open").click();
      const install = page.getByTestId("hold-install").first();
      await install.waitFor({ timeout: 10000 });
      if (await install.isDisabled()) throw new Error(`install is disabled: ${await page.getByTestId("hold-part").first().innerText()}`);
      await install.click();
      await sleep(3000);
      const after = await getCamp(camp.id);
      const char = await getChar();
      const passed = (after.timeElapsed?.total ?? 0) - (before.timeElapsed?.total ?? 0);
      const inHold = (char.playState?.shipParts ?? []).length;
      const mods = (after.starships[0].mods ?? []).length;
      if (passed < 12 * 60) throw new Error(`the work took ${passed} minutes`);
      if (!(inHold === 0 || inHold === 1)) throw new Error(`hold ${inHold}`);
      return `${inHold === 0 ? "installed" : "failed the check (the part kept)"}; ${Math.round(passed / 60)} h passed; ${mods} modifications now`;
    });
  }
  if (process.env.ONLY !== "ships") {
    const dealerShop = inTown("droid dealer")[0];
    const showroomD = dealerShop && roomsOf(dealerShop).find((r) => /showroom/i.test(r.name));
    const dealerD = showroomD && personIn(showroomD, (o) => o.trade === "droids");
    await step("the droid dealer is a shop: today's droids stand on its plinths, its parts on the shelves", async () => {
      if (!dealerD) throw new Error("no droid dealer with a trader");
      await goTo(camp.id, showroomD.id);
      const shown = await page.evaluate(() => {
        const d = window.__display?.getState();
        return d ? { droids: Object.values(d.droids).map((x) => x.name), shelves: Object.values(d.shelves).map((x) => x.length) } : null;
      });
      if (!shown || !shown.droids.length) throw new Error(`nothing on the plinths: ${JSON.stringify(shown)}`);
      if (!shown.shelves.some((n) => n > 0)) throw new Error("the parts shelves show nothing of the dealer's stock");
      await page.screenshot({ path: `${OUT}/works-showroom.png`, timeout: 60000 }).catch(() => {});
      return `${shown.droids.length} droids on show (${shown.droids.slice(0, 3).join(", ")}...), shelves of ${shown.shelves.join(", ")} parts`;
    });

    await step("a tap on a plinth calls the dealer; a droid is bought, and a customization bought and fitted by the technician", async () => {
      if (!dealerD) throw new Error("no droid dealer");
      const plinth = showroomD.layout.assets.find((a) => a.name === "Droid plinth");
      const at = await page.evaluate((k) => window.__map3d?.at(`asset:${k}`) ?? null, plinth.id);
      if (at) await page.mouse.click(at.x, at.y);
      const called = await card().getByTestId("droid-shop").waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      if (!called) await openPerson(showroomD, dealerD);
      const shop = card().getByTestId("droid-shop");
      await shop.waitFor({ timeout: 20000 });
      const before = await getChar();
      await shop.locator('[data-testid^="droid-buy-"]').first().click();
      await sleep(2500);
      const bought = await getChar();
      const droid = (bought.companionData?.party ?? []).find((c) => c.kind === "droid");
      if (!droid || !(bought.credits < before.credits)) throw new Error("buying a droid did nothing");
      const parts = card().getByTestId("droid-parts");
      await parts.waitFor({ timeout: 20000 });
      await parts.getByTestId("droid-part-fit").first().click();
      await sleep(2500);
      const fitted = await getChar();
      const mine = (fitted.companionData?.party ?? []).find((c) => c.id === droid.id);
      if (!(mine?.custom ?? []).length) throw new Error("the customization was not fitted");
      await parts.getByTestId("droid-part-buy").first().click();
      await sleep(2000);
      const carried = await getChar();
      if (!(carried.equipment.length > fitted.equipment.length)) throw new Error("buying a customization to carry did nothing");
      return `${droid.name} for ${before.credits - bought.credits} cr; fitted ${mine.custom[0]}; carrying ${carried.equipment.at(-1)}`;
    });
  }
} catch (e) {
  failed = true;
  console.log(`FAIL setup: ${e.message}`);
} finally {
  for (const id of camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  if (charId) await api("DELETE", `/api/characters/${charId}`).catch(() => {});
  await browser.close();
  console.log(failed ? "WORKS: FAIL" : "WORKS: PASS");
  process.exit(failed ? 1 : 0);
}
