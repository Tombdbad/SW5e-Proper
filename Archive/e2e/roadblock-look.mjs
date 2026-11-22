// A close look at a roadblock's guards and speeders (2026-10-30). Usage: BASE=http://127.0.0.1:5099 node e2e/roadblock-look.mjs [seed]
import { open, BASE, OUT } from "./lib.mjs";
const seed = process.argv[2] ?? "2";
const { browser, page } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
try {
  await page.goto(`${BASE}/dev/dogfight?game=road&block=checkpoint&seed=${seed}&biome=temperate`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("minigame-page").waitFor({ timeout: 120000 });
  await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 30000 });
  const block = await page.evaluate(() => window.__raceTrack.road.block);
  await page.evaluate((s) => { window.__raceWarp = s; }, block.at - 28);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${OUT}/roadblock-look.png`, timeout: 120000 });
} finally { await browser.close(); }
