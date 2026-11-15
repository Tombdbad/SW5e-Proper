// Flow 12: a card game, Pazaak, from the gambler's table to the result.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, mapTools, api, sleep } from "./h.mjs";

await flow("12_card_game", "Pazaak from start to result", async ({ page, view, shot, note, state, mark }) => {
  const ch = await quickChar(`${TAG} gambler ${view}`, { credits: 2000, equipment: ["Pazaak deck", "Blaster pistol", "Combat suit"], toolProficiencies: ["Pazaak deck"] });
  const world = await genWorld(7, 3);
  const start = world.areas[world.startId];
  start.occupants = []; start.loot = []; start.ships = [];
  start.layout.assets = start.layout.assets.filter((a) => a.kind !== "npc" && a.kind !== "loot" && a.kind !== "ship");
  const l = start.layout;
  const blocked = (x, y) => l.assets.some((a) => !a.side && (a.blocks || a.kind === "npc") && a.x <= x && x < a.x + a.w && a.y <= y && y < a.y + a.h);
  const doors = l.assets.filter((a) => a.side).map((a) => `${a.x},${a.y}`);
  let placed = false;
  for (let y = l.height - 1; y >= 0 && !placed; y--) for (let x = l.width - 1; x >= 0 && !placed; x--) {
    if (blocked(x, y) || doors.includes(`${x},${y}`)) continue;
    l.assets.push({ id: "t-ox-gambler", kind: "npc", name: "Dollo", x, y, w: 1, h: 1, ref: "ox-gambler" });
    start.occupants.push({ id: "ox-gambler", name: "Dollo", role: "gambler", disposition: "neutral", count: 1, species: "Human", loadout: [] });
    placed = true;
  }
  const camp = await quickCamp(ch.id, world, { mode: "tabletop" });
  await openGame(page, BASE, camp.id, ch.name, 3000);
  const { tap } = mapTools(page, view);
  const card = () => page.locator("[data-testid=map-card], [data-testid=hud-trade]");
  for (let i = 0; i < 6; i++) {
    await tap("npc:ox-gambler").catch(() => {});
    if (await card().getByTestId("gamble").first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) break;
    await sleep(800);
  }
  await shot("gambler_card");
  const panel = card().getByTestId("gamble");
  await panel.waitFor({ timeout: 10000 });
  const credits0 = (await api("GET", `/api/characters/${ch.id}`)).json.credits;
  await panel.getByTestId("gamble-real").click();
  await page.getByTestId("pazaak-panel").waitFor({ timeout: 20000 });
  mark("pazaak open");
  await shot("pazaak_start");
  // T-008: the table must not be see-through (an alpha of 1 on the panel's own background)
  const alpha = await page.getByTestId("pazaak-panel").evaluate((el) => { const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []; return m.length > 3 ? Number(m[3]) : 1; });
  note("pazaak panel background alpha", alpha);
  note("pazaak panel is opaque", alpha === 1);
  if (process.env.STOP_AFTER_START) return;
  let sets = 0;
  for (let i = 0; i < 300; i++) {
    if (await page.getByTestId("pazaak-match-result").count()) break;
    if (await page.getByTestId("pazaak-next").count()) { await page.getByTestId("pazaak-next").click().catch(() => {}); sets++; if (sets === 1) await shot("set_result"); await sleep(300); continue; }
    const stand = page.getByTestId("pazaak-stand");
    if ((await stand.count()) && (await stand.isEnabled().catch(() => false))) {
      const n = Number(((await stand.innerText()).match(/Stand on (\d+)/) || [0, 0])[1]);
      if (n >= 17) { await stand.click().catch(() => {}); await sleep(400); continue; }
    }
    const end = page.getByTestId("pazaak-end");
    if ((await end.count()) && (await end.isEnabled().catch(() => false))) await end.click().catch(() => {});
    await sleep(350);
  }
  await page.getByTestId("pazaak-match-result").waitFor({ timeout: 5000 });
  await shot("match_result");
  note("match result", (await page.getByTestId("pazaak-match-result").innerText()).replace(/\s+/g, " ").slice(0, 160));
  await page.getByTestId("pazaak-done").click().catch(() => {});
  await sleep(1500);
  const credits1 = (await api("GET", `/api/characters/${ch.id}`)).json.credits;
  state("credits", { before: credits0, after: credits1 });
  note("credits", `${credits0} -> ${credits1}`);
});
