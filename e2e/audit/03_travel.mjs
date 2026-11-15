// Flow 3 and 4: world generation, then movement by the exits: room to room, up and down stairs, out of the building, and between places.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, api, sleep } from "./h.mjs";

await flow("03_travel_and_buildings", "Generate a world, walk exits, stairs, doors, leave the building", async ({ page, view, shot, note, state, mark }) => {
  const t = Date.now();
  const world = await genWorld(7, 3);
  note("world generation (API)", `${Date.now() - t} ms, ${Object.keys(world.areas).length} areas, ${world.paths.length} paths`);
  const check = await api("POST", "/api/world/validate", { world });
  note("validate", check.json?.problems?.length ? check.json.problems.slice(0, 3) : "no problems");
  const ch = await quickChar(`${TAG} walker ${view}`);
  const camp = await quickCamp(ch.id, world);
  await openGame(page, BASE, camp.id, ch.name, 4000);
  mark("game open");
  await shot("start");
  const where = async () => (await api("GET", `/api/campaigns/${camp.id}`)).json.currentLocation;
  const trail = async () => (await page.getByTestId("play-trail").innerText().catch(() => "?")).replace(/\s+/g, " ");
  const seen = [];
  const kinds = {};
  for (let hop = 0; hop < 8; hop++) {
    const exits = page.getByTestId("play-exits").getByRole("button");
    const labels = (await exits.allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
    if (!labels.length) { note("no exits at hop " + hop, await trail()); break; }
    // prefer stairs, then doors, then anything not yet seen
    const order = (l) => (/stair|up|down|ladder|lift/i.test(l) ? 0 : /door|leave|outside|out/i.test(l) ? 1 : 2) + (seen.includes(l) ? 5 : 0);
    const idx = labels.map((l, i) => [order(l), i]).sort((a, b) => a[0] - b[0])[0][1];
    const label = labels[idx];
    seen.push(label);
    const before = await where();
    await exits.nth(idx).click().catch((e) => note("click failed", String(e.message).slice(0, 100)));
    for (let i = 0; i < 100 && (await where()) === before; i++) await sleep(300);
    const after = await where();
    const a = world.areas[after];
    kinds[a?.kind] = (kinds[a?.kind] || 0) + 1;
    state(`hop ${hop}`, { took: label.slice(0, 60), moved: after !== before, now: a?.name, kind: a?.kind, type: a?.type, trail: await trail() });
    await shot(`hop${hop}_${(a?.name || "x").slice(0, 20)}`);
    if (after === before) { note(`hop ${hop}`, "did not move: " + label.slice(0, 80)); break; }
    await sleep(1500);
  }
  note("areas visited by kind", kinds);
});
