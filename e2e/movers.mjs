// The figures as they move (2026-10-26): the gallery's walk section (people walking, a BB unit rolling, a droideka rolling up and
// unfolding, a battle droid walking, a probe floating, beasts trotting, an acklay on its six legs, a mynock beating its wings) shot a few
// times a second apart, and close looks at skin, cloth, armour and fur. No database needed: the gallery is a page of its own.
// Usage: BASE=http://localhost:5057 node e2e/movers.mjs   (shots in e2e/out/movers-*.png)
import { open, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, browser, events } = ctx;
const wait = (ms) => page.waitForTimeout(ms);
const shots = [];
try {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`${BASE}/dev/models?section=walk&cam=0,13,24&look=0,0,8`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__gallery, null, { timeout: 120000 });
  await wait(Number(process.env.SETTLE || 20000));
  for (let i = 0; i < 4; i++) {
    const file = `${OUT}/movers-walk-${i}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
    await wait(700);
  }
  // Close looks: the gait rows, and people (skin, faces, cloth, fur)
  for (const [name, q] of [["beasts", "section=walk&cam=0,4,17&look=0,0.6,13"], ["droids", "section=walk&cam=0,3.2,11.5&look=0,0.5,8.5"], ["faces", "section=people&cam=-4.5,1.6,1.6&look=-4.5,1.1,0"], ["wookiee", "section=people&cam=2.1,2.0,2.4&look=2.1,1.2,0"], ["bantha", "section=beasts&cam=-6.3,2.4,3.6&look=-6.3,0.8,0"], ["wampa", "section=beasts&cam=-2.7,2.4,4.6&look=-2.7,0.9,1.8"], ["trooper", "section=roles&cam=-4.2,1.8,5.4&look=-4.2,1.0,2.8"]]) {
    await page.goto(`${BASE}/dev/models?${q}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__gallery, null, { timeout: 120000 });
    await wait(Number(process.env.SETTLE || 20000));
    const file = `${OUT}/movers-${name}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
  }
  const info = await page.evaluate(() => window.__gallery?.info());
  console.log(JSON.stringify({ shots, info, errors: events.filter((e) => /pageerror|console.error/.test(e)).slice(0, 10) }, null, 1));
} finally {
  await browser.close();
}
