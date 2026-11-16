// Gallery sections of the never-checked list, shot at desktop and phone size (2026-11-15). Usage: BASE=http://127.0.0.1:5103 OUT=e2e/out/sweep node e2e/sweep-gallery.mjs [section[,section]]
import { open, BASE, OUT } from "./lib.mjs";
const sections = (process.argv[2] || "drums,rounds,scale&cam=0,6,26&look=0,1,6,water,walk,caves,moves").split(/,(?=[a-z])/);
const phone = process.env.VIEW === "phone";
{
  const { browser, page, events } = await open();
  for (const s of sections) {
    const name = s.split("&")[0];
    try {
      await page.goto(`${BASE}/dev/models?section=${s}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(25000);
      await page.screenshot({ path: `${OUT}/gallery-${name}-${phone ? "phone" : "desk"}.png`, timeout: 120000 });
      console.log("shot", name, phone ? "phone" : "desk");
    } catch (e) { console.log("FAIL", name, e.message.slice(0, 120)); }
  }
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL|DevTools|\[vite\]|AudioContext/i.test(e)) console.log("console:", e.slice(0, 200));
  await browser.close();
}
