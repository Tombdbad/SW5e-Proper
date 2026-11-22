// Flow 2: create a campaign through the screens (generate, save), then play it once in tabletop and once in shooter mode (the mode dialog).
import { flow, BASE, TAG, api, made, quickChar, openGame } from "./h.mjs";

for (const mode of ["tabletop", "shooter"]) {
  await flow(`02_campaign_${mode}`, `Create a ${mode} campaign`, async ({ page, view, shot, note, state, mark, events }) => {
    const ch = await quickChar(`${TAG} ${mode} ${view}`);
    mark("start");
    await page.goto(`${BASE}/campaigns/create?characterId=${ch.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Generate Campaign" }).click({ timeout: 60000 });
    await page.getByText("Primary Objective").waitFor();
    mark("generated");
    await shot("generated");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/campaigns") && r.request().method() === "POST", { timeout: 60000 }),
      page.getByRole("button", { name: "Create Campaign" }).click(),
    ]);
    const body = await resp.json().catch(() => ({}));
    if (resp.status() !== 201) throw new Error("POST /api/campaigns " + resp.status());
    made("campaign", body.id);
    await page.getByTestId("world-status").waitFor({ timeout: 60000 });
    note("world-status", (await page.getByTestId("world-status").innerText()).slice(0, 80));
    mark("saved");
    await shot("campaign_page");
    state("campaign", { id: body.id, areas: Object.keys(body.galaxyMap?.areas ?? {}).length, quests: (body.quests || []).length, mode: body.specialRules?.mode ?? null });
    // Play it: the mode dialog asks how it is played (the harness answers with the mode under test)
    await openGame(page, BASE, body.id, ch.name, 4000);
    mark("game open");
    await shot("game_first_view");
    await page.waitForTimeout(1500);
    const saved = (await api("GET", `/api/campaigns/${body.id}`)).json;
    note("mode saved", saved.specialRules?.mode ?? "(not saved)");
    if (saved.specialRules?.mode !== mode) throw new Error(`mode saved as ${saved.specialRules?.mode}, wanted ${mode}`);
    note("canvas", (await page.locator("canvas").count()) + " canvas element(s)");
    note("view shown", await page.evaluate(async () => { try { const s = (await import("/src/components/Map/interiors/aim.ts")).useView.getState(); return `${s.mode}${s.shooter ? " (shooter)" : ""}`; } catch (e) { return "n/a"; } }));
  }, { mode });
}
