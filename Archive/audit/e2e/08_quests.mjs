// Flow 8: quests and contracts. Read the quest list, look at the jobs the bartender gives, go to a quest target and see what the game records.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, mapTools, api, sleep } from "./h.mjs";

await flow("08_quests", "Quest and contract: list, accept, progress, reward", async ({ page, view, shot, note, state, mark }) => {
  const ch = await quickChar(`${TAG} quester ${view}`, { credits: 500 });
  const world = await genWorld(7, 3);
  const start = world.areas[world.startId];
  const bar = Object.values(world.areas).find((a) => a.name === "Main bar" && a.parentId === start.parentId);
  const camp = await quickCamp(ch.id, world, { loc: bar ? bar.id : world.startId });
  await api("PATCH", `/api/campaigns/${camp.id}`, { timeElapsed: { total: 21 * 60 } });
  const c0 = (await api("GET", `/api/campaigns/${camp.id}`)).json;
  note("quests stored on this campaign (API-made)", (c0.quests || []).length);
  await openGame(page, BASE, camp.id, ch.name, 3500);
  mark("game open");
  await page.getByRole("tab", { name: "Quests" }).click();
  await sleep(800);
  await shot("quests_tab");
  const text = (await page.getByTestId("play-quests").innerText().catch(() => page.locator("body").innerText())).replace(/\s+/g, " ").slice(0, 500);
  note("quests tab text", text);
  // jobs from the bartender
  const { doubleTap } = mapTools(page, view);
  if (bar) {
    const counter = bar.layout.assets.find((a) => a.name === "Bar counter");
    await doubleTap(`asset:${counter.id}`);
    const card = page.locator("[data-testid=map-card], [data-testid=hud-trade]");
    await card.getByTestId("trade").waitFor({ timeout: 40000 }).catch(() => {});
    await shot("bartender_card");
    const jobs = card.locator('[data-testid^="job"], [data-testid*="contract"], [data-testid*="jobs"]');
    note("job controls on the card", await jobs.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))).catch(() => []));
    const accept = card.getByRole("button", { name: /Accept|Take the job|Take job/ }).first();
    if (await accept.count()) {
      const before = (await api("GET", `/api/campaigns/${camp.id}`)).json;
      await accept.click();
      await sleep(1500);
      const after = (await api("GET", `/api/campaigns/${camp.id}`)).json;
      state("contract", { questsBefore: (before.quests || []).length, questsAfter: (after.quests || []).length, contracts: JSON.stringify(after.availableResources?.contracts ?? after.contracts ?? null).slice(0, 300) });
      await shot("contract_accepted");
    } else note("accept button", "none on the bartender's card");
  }
  await page.getByRole("tab", { name: "Quests" }).click().catch(() => {});
  await sleep(500);
  await shot("quests_after");
  note("quests tab after", (await page.locator("body").innerText()).replace(/\s+/g, " ").match(/Quests[^]{0,300}/)?.[0]?.slice(0, 300));
});
