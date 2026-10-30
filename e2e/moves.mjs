// How people move and fight (2026-10-30): the gallery's `moves` section (a row for each thing held, a column for each thing done, then a row of
// lightsaber styles) shot a few times apart, and close looks. No database needed. Usage: BASE=http://127.0.0.1:5099 node e2e/moves.mjs [view ...]
// A view is name=query (the gallery's own: section, act, cam, look); with none, the default set.
import { open, BASE, OUT } from "./lib.mjs";

const { page, browser, events } = await open();
const wait = (ms) => page.waitForTimeout(ms);
const views = process.argv.slice(2).length
  ? process.argv.slice(2).map((v) => [v.slice(0, v.indexOf("=")), v.slice(v.indexOf("=") + 1)])
  : [
      ["all", "section=moves&cam=0,16,16&look=0,0,1"],
      ["holds", "section=moves&cam=0,5.5,-14&look=0,0.8,-3"],
      ["forms", "section=moves&cam=0,3.2,15&look=0,0.9,10.4"],
    ];
try {
  await page.setViewportSize({ width: 1400, height: 900 });
  for (const [name, q] of views) {
    await page.goto(`${BASE}/dev/models?${q}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__gallery, null, { timeout: 120000 });
    await wait(Number(process.env.SETTLE || 12000));
    for (let i = 0; i < Number(process.env.SHOTS || 3); i++) {
      await page.screenshot({ path: `${OUT}/moves-${name}-${i}.png` });
      await wait(Number(process.env.GAP || 230));
    }
    console.log("shot", name);
  }
} catch (e) {
  console.log("FAILED:", e.message);
} finally {
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|Download the React DevTools|\[vite\]/i.test(e)) console.log("console:", e.slice(0, 300));
  await browser.close();
}
