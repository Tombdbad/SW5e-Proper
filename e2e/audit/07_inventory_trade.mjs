// Flow 7: inventory. At the cantina bar: call the bartender, buy, sell, wield/put away, wear/take off, use a consumable, look for a drop control.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, mapTools, api, sleep } from "./h.mjs";

await flow("07_inventory_trade", "Buy, equip, unequip, use, drop; stats before and after", async ({ page, view, shot, note, state, mark }) => {
  const ch = await quickChar(`${TAG} buyer ${view}`, { credits: 1500, currentHp: 12, equipment: ["Blaster pistol", "Vibroblade", "Combat suit", "Medpac"] });
  const world = await genWorld(7, 3);
  const start = world.areas[world.startId];
  const bar = Object.values(world.areas).find((a) => a.name === "Main bar" && a.parentId === start.parentId);
  if (!bar) throw new Error("seed 7 has no Main bar next to the start");
  const camp = await quickCamp(ch.id, world, { loc: bar.id });
  await api("PATCH", `/api/campaigns/${camp.id}`, { currentLocation: bar.id, timeElapsed: { total: 21 * 60 } });
  await openGame(page, BASE, camp.id, ch.name, 3500);
  mark("game open");
  const { doubleTap } = mapTools(page, view);
  const getc = async () => (await api("GET", `/api/characters/${ch.id}`)).json;
  const snap = async (label) => { const c = await getc(); state(label, { hp: c.currentHp, ac: c.armorClass, credits: c.credits, equipment: c.equipment }); return c; };
  const s0 = await snap("start");
  const counter = bar.layout.assets.find((a) => a.name === "Bar counter");
  const tender = bar.occupants.find((o) => o.role === "bartender");
  await doubleTap(`asset:${counter.id}`);
  const card = page.locator("[data-testid=map-card], [data-testid=hud-trade]");
  await card.getByTestId("trade").waitFor({ timeout: 40000 });
  await shot("trade_open");
  const first = card.getByTestId("trade-stock").locator("li").first();
  const line = (await first.innerText()).replace(/\s+/g, " ");
  const name = line.replace(/ x\d+.*$/, "");
  await first.getByRole("button", { name: "Buy" }).click();
  await sleep(1500);
  const s1 = await snap("after buy");
  note("bought", `${name}: credits ${s0.credits} -> ${s1.credits}; in pack: ${s1.equipment.includes(name)}`);
  await shot("after_buy");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await sleep(500);
  await shot("inventory");
  const toggle = async (id, wanted) => { const b = page.getByTestId(id); if (!(await b.count())) return `no control ${id}`; const t0 = (await b.innerText()).trim(); await b.click(); await sleep(700); return `${t0} -> ${(await page.getByTestId(id).innerText().catch(() => "?")).trim()}`; };
  note("weapon toggle", await toggle("equip-Vibroblade"));
  note("armor toggle (off)", await toggle("equip-Combat suit"));
  const s2 = await snap("armor off");
  note("armor class with suit off", `${s0.armorClass} -> ${s2.armorClass}`);
  note("armor toggle (on)", await toggle("equip-Combat suit"));
  await toggle("equip-Vibroblade");
  const s3 = await snap("armor back on");
  note("armor class restored", s3.armorClass === s0.armorClass);
  // a consumable
  const use = page.locator('[data-testid^="use-Medpac"], [data-testid^="take-Medpac"], [data-testid^="use-"][data-testid*="Medpac"]').first();
  if (await use.count()) {
    // "Use" only opens the chooser of who to use it on (T-006): the second click, "Use on yourself", does the healing
    await use.click(); await sleep(500);
    await page.locator('[data-testid="use-on-self"]').click(); await sleep(1500);
    const s4 = await snap("after medpac");
    note("medpac", `hp ${s3.currentHp} -> ${s4.currentHp}; medpacs left ${s4.equipment.filter((e) => e === "Medpac").length}`);
    note("medpac heals and is used up", s4.currentHp > s3.currentHp && s4.equipment.filter((e) => e === "Medpac").length < s3.equipment.filter((e) => e === "Medpac").length);
  } else {
    const names = await page.locator('[data-testid^="use-"], [data-testid^="take-"], [data-testid^="equip-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    note("medpac", "no use button found; controls present: " + names.join(", ").slice(0, 200));
  }
  await shot("after_use");
  // a drop control
  const drops = await page.locator('[data-testid^="drop-"], button:has-text("Drop"), button:has-text("Discard")').count();
  note("drop control present", drops > 0);
  if (drops) {
    // T-029: Drop asks once ("Drop it?"), the second tap throws the item away
    const before = (await getc()).equipment.length;
    const first = page.locator('[data-testid^="drop-"]').first();
    const dropped = (await first.getAttribute("data-testid")).replace(/^drop-/, "");
    await first.click(); await sleep(400);
    note("drop asks first", (await first.innerText()).includes("Drop it?") && (await getc()).equipment.length === before);
    await first.click(); await sleep(1500);
    const after = await snap("after drop");
    note("drop removes one", `${dropped}: pack ${before} -> ${after.equipment.length}`);
    note("drop took exactly one", after.equipment.length === before - 1);
    await shot("after_drop");
  }
  // sell back
  await page.getByRole("tab", { name: "Trade" }).click().catch(() => {});
  await sleep(400);
  await shot("trade_tab");
});
