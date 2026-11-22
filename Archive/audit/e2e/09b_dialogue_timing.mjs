// T-022: where do the 43 to 47 seconds between "Say" and the reply on screen go? Logs, inside the page, when each chunk of the /api/dialogue
// stream arrives and when the talk panel's text changes, in the same clock (performance.now()), next to the time the Say key was pressed.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, mapTools, api, sleep } from "./h.mjs";

await flow("09b_dialogue_timing", "Dialogue: network versus screen", async ({ page, view, shot, note }) => {
  const ch = await quickChar(`${TAG} timing ${view}`);
  const world = await genWorld(7, 3);
  const start = world.areas[world.startId];
  const bar = Object.values(world.areas).find((a) => a.name === "Main bar" && a.parentId === start.parentId);
  const camp = await quickCamp(ch.id, world, { loc: bar.id });
  await api("PATCH", `/api/campaigns/${camp.id}`, { timeElapsed: { total: 21 * 60 } });
  await openGame(page, BASE, camp.id, ch.name, 3500);
  const { doubleTap } = mapTools(page, view);
  const counter = bar.layout.assets.find((a) => a.name === "Bar counter");
  await doubleTap(`asset:${counter.id}`);
  await page.locator("[data-testid=map-card], [data-testid=hud-trade]").getByTestId("trade").waitFor({ timeout: 60000 });
  await page.evaluate(() => {
    const log = (window.__t = { say: 0, chunks: [], text: [], first: 0 });
    const orig = window.fetch.bind(window);
    window.fetch = async (...a) => {
      const r = await orig(...a);
      if (String(a[0]).includes("/api/dialogue") && !String(a[0]).includes("status")) {
        log.fetchAt = performance.now();
        const c = r.clone().body.getReader();
        (async () => { for (;;) { const { value, done } = await c.read(); if (done) { log.chunks.push([Math.round(performance.now()), "end"]); break; } log.chunks.push([Math.round(performance.now()), value.length]); } })();
      }
      return r;
    };
    new MutationObserver(() => { const el = document.querySelector("[data-testid=talk-heard]"); if (el) log.text.push([Math.round(performance.now()), el.innerText.replace(/\s+/g, " ").slice(0, 70)]); }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const input = page.getByTestId("talk-input");
  await input.fill("Hello. Any work around here?");
  await page.evaluate(() => { document.querySelector("[data-testid=talk-input]").addEventListener("keydown", (e) => { if (e.key === "Enter") window.__t.say = Math.round(performance.now()); }, true); });
  await input.press("Enter");
  for (let i = 0; i < 100; i++) { const t = await page.evaluate(() => window.__t); if (t.chunks.some((c) => c[1] === "end") && t.text.length) break; await sleep(1000); }
  await sleep(2000);
  const t = await page.evaluate(() => window.__t);
  const rel = (x) => Math.round(x - t.say);
  note("say pressed at (page ms)", t.say);
  note("request sent (ms after say)", t.fetchAt ? rel(t.fetchAt) : "none");
  note("chunks (ms after say)", t.chunks.map((c) => `${rel(c[0])}:${c[1]}`).join(" "));
  note("panel text changes (ms after say)", t.text.slice(0, 12).map((c) => `${rel(c[0])}:${c[1]}`).join(" | "));
  const firstText = t.text.find((c) => /: .{3,}|speaks|spoken/.test(c[1]) && !/thinking/.test(c[1]));
  note("first chunk to first words on screen", `${t.chunks.length ? rel(t.chunks[0][0]) : "?"} ms -> ${firstText ? rel(firstText[0]) : "never"} ms`);
  const prefs = await page.evaluate(() => { try { return { voice: localStorage.getItem("sw5e.voice"), keys: Object.keys(localStorage).filter((k) => /voice|subtitle|sw5e/.test(k)) }; } catch { return null; } });
  note("voice prefs", JSON.stringify(prefs));
  await shot("timing_end");
});
