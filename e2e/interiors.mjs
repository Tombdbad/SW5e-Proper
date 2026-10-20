// The interiors gallery, looked at in a real browser without the play-through (2026-10-19): opens /dev/models?section=interiors
// at a few cameras, saves a shot of each, reports what was drawn (calls, triangles) and fails on a console error or a model that
// did not load. Usage: BASE=http://127.0.0.1:5173 node e2e/interiors.mjs [name ...]   (names: racks wealth caves moods rounds packs tones rooms kitbash shops walk gear worn hunter items)
// Needs a server that serves the client: `npx vite --port 5173 --host 127.0.0.1` (no build, no database), and nobody else on the VM busy.
import { open, OUT } from "./lib.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const VIEWS = {
  racks: { cam: [-1.5, 3.2, 8], look: [-1.5, 0.7, 0.5] },
  wealth: { cam: [0, 9, 22], look: [0, 0, 12] },
  caves: { cam: [-6, 13, 40], look: [-6, 0, 28] },
  moods: { cam: [-2, 22, 62], look: [-2, 0, 44] },
  rounds: { section: "rounds", cam: [0, 26, 24], look: [0, 0, 7] },
  packs: { section: "packs", cam: [0, 14, 26], look: [4, 0, 9] },
  tones: { section: "packs", cam: [0, 20, -4], look: [0, 0, -12] },
  shops: { section: "interiors", cam: [-0.5, 8, -2], look: [-0.5, 0, -9.5] },
  walk: { section: "walk", cam: [0, 3.2, 9], look: [0, 0.7, 1.5] },
  gear: { section: "gear", cam: [0, 1.6, 6], look: [0, 0.7, 0] },
  kitbash: { section: "packs", cam: [-1.5, 17, -22], look: [-1.5, 0, -37] },
  rooms: { section: "packs", cam: [5, 28, 30], look: [5, 0, 13] },
  // 2026-10-20: the item models worn on every species (one loadout), and every model of the catalogue by pack (PACK=sw5e-sabers)
  worn: { section: "worn", cam: [0, 4.2, 9], look: [0, 0.7, 1.5] },
  hunter: { section: "worn", loadout: "hunter", cam: [0, 4.2, 9], look: [0, 0.7, 1.5] },
  items: { section: "items", cam: [0, 9, 8], look: [0, 0, 1] },
};
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS);
const { browser, page, events } = await open();
// The scene is drawn in software on this VM: a small window, and long waits for a frame
await page.setViewportSize({ width: Number(process.env.W || 900), height: Number(process.env.H || 560) });
let failed = false;
try {
  for (const name of wanted) {
    // CAM=x,y,z and LOOK=x,y,z override the view (a close look at one room of the gallery)
    const v = VIEWS[name] && process.env.CAM ? { ...VIEWS[name], cam: process.env.CAM.split(",").map(Number), look: (process.env.LOOK || "0,0,0").split(",").map(Number) } : VIEWS[name];
    if (!v) throw new Error(`no view ${name}`);
    const t0 = Date.now();
    await page.goto(`${BASE}/dev/models?section=${v.section ?? "interiors"}&cam=${v.cam}&look=${v.look}&loadout=${process.env.LOADOUT || v.loadout || ""}&pack=${process.env.PACK || ""}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__gallery?.info().calls > 0, null, { timeout: 120000 });
    // Models are fetched after the first frame: give them time, then see that the stock has grown into its hero detail
    await page.waitForTimeout(6000);
    const info = await page.evaluate(() => window.__gallery.info());
    await page.screenshot({ path: `${OUT}/interiors-${name}.png`, timeout: 300000 });
    console.log(`${name}: ${info.calls} calls, ${info.triangles} triangles, ${info.geometries} geometries, ${info.baked} baked (${((Date.now() - t0) / 1000).toFixed(0)}s) -> ${OUT}/interiors-${name}.png`);
  }
} finally {
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL/i.test(e)) { console.log(e); if (/requestfailed|pageerror|\[error\]/i.test(e)) failed = true; }
  await browser.close();
}
if (failed) { console.log("FAILED: errors above"); process.exit(1); }
