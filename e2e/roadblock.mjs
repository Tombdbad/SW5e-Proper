// A roadblock's guards in a real browser (2026-10-30): they stand by the barrier with speeders kept at the roadside, fire at a speeder that crashes through,
// and (seed 2) get on their speeders and ride after it. Uses the road lab page. Usage: BASE=http://127.0.0.1:5099 node e2e/roadblock.mjs [seed]
import { open, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = process.argv[2] ?? "2";
const { browser, page, events } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
try {
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.autopilot", "1"); } catch {} });
  await page.goto(`${BASE}/dev/dogfight?game=road&block=checkpoint&seed=${seed}&biome=temperate`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("minigame-page").waitFor({ timeout: 120000 });
  await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 30000 });
  const state = () => page.evaluate(() => {
    const r = window.__race;
    const me = r.racers.find((x) => x.party);
    return { t: +r.t.toFixed(1), block: r.block?.state, mounted: !!r.block?.mounted, riders: r.racers.filter((x) => x.hostile).length, idle: r.racers.filter((x) => x.idle).length, hull: me.hull, at: Math.round(me.at), chase: r.chase?.who ?? null, over: r.over, log: r.log.slice(-3) };
  });
  const block = await page.evaluate(() => window.__raceTrack.road.block);
  say("block at", Math.round(block.at), "guards", block.guards.length, "rigs", block.rigs.length, "chase", block.chase);
  // put the party 140 m short of it
  await page.evaluate((s) => { window.__raceWarp = s; }, block.at - 140);
  await sleep(1500);
  say("before:", JSON.stringify(await state()));
  await page.screenshot({ path: `${OUT}/roadblock-1-approach.png`, timeout: 120000 });
  let shot = false;
  for (let n = 0; n < 40; n++) {
    await sleep(500);
    const s = await state();
    if (n % 4 === 0) say("t", JSON.stringify(s));
    if (s.block === "stopped" && (await page.getByTestId("stop-run").count())) { say("stopped at the barrier: ram it"); await page.screenshot({ path: `${OUT}/roadblock-2b-stopped.png`, timeout: 120000 }); await page.getByTestId("stop-run").click(); }
    if (!shot && s.block !== "ahead") { shot = true; await page.screenshot({ path: `${OUT}/roadblock-2-crash.png`, timeout: 120000 }); }
    if (s.mounted && s.riders) { await page.screenshot({ path: `${OUT}/roadblock-3-chase.png`, timeout: 120000 }); break; }
    if (s.over) break;
  }
  say("after:", JSON.stringify(await state()));
} catch (e) {
  say("FAILED:", e.message);
  await page.screenshot({ path: `${OUT}/roadblock-fail.png`, timeout: 120000 }).catch(() => {});
} finally {
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]|\[api \d+\]/i.test(e)) say("console:", e.slice(0, 300));
  await browser.close();
}
