// Flow 10: save, reload the page, and compare: character, inventory, position, clock, quest state, as text before and after.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, api, sleep } from "./h.mjs";

await flow("10_persistence", "Change things, reload, confirm they persisted", async ({ page, view, shot, note, state, mark }) => {
  const ch = await quickChar(`${TAG} keeper ${view}`);
  const world = await genWorld(7, 3);
  const camp = await quickCamp(ch.id, world);
  await openGame(page, BASE, camp.id, ch.name, 3500);
  const read = async () => {
    const c = (await api("GET", `/api/characters/${ch.id}`)).json;
    const k = (await api("GET", `/api/campaigns/${camp.id}`)).json;
    return { hp: c.currentHp, credits: c.credits, equipment: c.equipment, conditions: c.conditions, xp: c.experience, at: k.currentLocation, clock: k.timeElapsed?.total ?? null, questStates: (k.quests || []).map((q) => q.status ?? q.completed ?? null) };
  };
  const ui = async () => ({ clock: (await page.getByTestId("play-clock").innerText().catch(() => "?")).replace(/\s+/g, " "), trail: (await page.getByTestId("play-trail").innerText().catch(() => "?")).replace(/\s+/g, " "), credits: (await page.getByTestId("play-credits").innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 80) });
  state("before changes", { ...(await read()), ...(await ui()) });
  // 1. wait until evening (clock), 2. take an exit (position), 3. put the weapon away (equipment state), 4. a short rest (hp, hit dice)
  await page.getByRole("button", { name: "Until evening" }).click().catch((e) => note("until evening", "not clickable: " + String(e.message).slice(0, 80)));
  await sleep(1200);
  const exits = page.getByTestId("play-exits").getByRole("button");
  const label = (await exits.first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const before = (await read()).at;
  await exits.first().click().catch(() => {});
  for (let i = 0; i < 100 && (await read()).at === before; i++) await sleep(300);
  note("moved by exit", label.slice(0, 60));
  await page.getByRole("tab", { name: "Inventory" }).click();
  await sleep(400);
  const w = page.getByTestId("equip-Vibroblade");
  if (await w.count()) { await w.click(); await sleep(800); }
  await page.getByRole("tab", { name: "Here" }).click().catch(() => {});
  await shot("changed");
  const changed = { ...(await read()), ...(await ui()) };
  state("after changes (before reload)", changed);
  mark("changes made");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: ch.name }).waitFor({ timeout: 120000 });
  await sleep(4000);
  await shot("reloaded");
  const reloaded = { ...(await read()), ...(await ui()) };
  state("after reload", reloaded);
  const keys = ["hp", "credits", "at", "clock", "conditions", "equipment"];
  const diffs = keys.filter((k) => JSON.stringify(changed[k]) !== JSON.stringify(reloaded[k]));
  note("server-side differences after reload", diffs.length ? diffs : "none");
  const uiDiffs = ["clock", "trail"].filter((k) => changed[k] !== reloaded[k]);
  note("on-screen differences after reload", uiDiffs.length ? uiDiffs.map((k) => `${k}: "${changed[k]}" -> "${reloaded[k]}"`) : "none");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await sleep(500);
  const wield = (await page.getByTestId("equip-Vibroblade").innerText().catch(() => "?")).trim();
  note("weapon control after reload", wield);
  await shot("inventory_after_reload");
});
