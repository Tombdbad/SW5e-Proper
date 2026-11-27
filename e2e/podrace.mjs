// A podrace in a real browser (2026-11-27; shared/logic "Pod racing"). With CAMPAIGN=<id> of a campaign whose party stands in a settlement on a
// desert, rocky or volcanic world, on a test copy (VITE_TEST_MENU=1, for the Downtime tab): Downtime, Racing games, Podrace; hire a pod, bet on
// the favourite, race the three laps on the autopilot, land, and check the credits and the log. Without it, the lab page's race. Either way
// screenshots of the grid, the canyon, the tunnel and the spires along the way.
// Usage: BASE=http://127.0.0.1:5002 CAMPAIGN=250 node e2e/podrace.mjs   (or BASE=... node e2e/podrace.mjs [seed] for the lab)
import { open, BASE, OUT } from "./lib.mjs";
const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const campaign = process.env.CAMPAIGN;
const seed = process.argv[2] ?? "2";
const { browser, page } = await open();
await page.setViewportSize({ width: 1100, height: 700 });
let failed = false;
const check = (ok, what) => {
  say(ok ? "ok  " : "FAIL", what);
  if (!ok) failed = true;
};
try {
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.autopilot", "1"); } catch {} });
  let credits0 = 0;
  let cost = 0;
  if (campaign) {
    await page.goto(`${BASE}/game/${campaign}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Downtime" }).or(page.getByRole("button", { name: "Downtime", exact: true })).first().click({ timeout: 120000 });
    await page.getByTestId("downtime-podrace").click();
    await page.getByTestId("pod-make-arrow").click();
    await page.getByTestId("pod-bet-mira").click();
    await page.getByTestId("pod-stake").fill("100");
    const setup = await page.getByTestId("podrace-setup").innerText();
    credits0 = Number(/You have ([\d,]+) cr/.exec(setup)[1].replace(/,/g, ""));
    cost = Number(/a day; ([\d,]+) cr/.exec(await page.getByTestId("flight-start-podrace").innerText())[1].replace(/,/g, ""));
    check(cost === 1350, `the race costs the entry, the hire and the stake (${cost} cr)`);
    await page.getByTestId("flight-start-podrace").click();
  } else {
    await page.goto(`${BASE}/dev/dogfight?game=pod&make=ring&biome=${process.env.BIOME ?? "desert"}&seed=${seed}&bet=Mira%20Kesh`, { waitUntil: "domcontentloaded" });
  }
  await page.getByTestId("minigame-pod").waitFor({ timeout: 180000 });
  // (read while the countdown shows it: a slow page may be past it)
  const brief = await page.getByTestId("pod-briefing").innerText({ timeout: 20000 }).catch(() => "");
  check(!brief || /House rules: Boost has no meter/.test(brief), brief ? "the briefing tells the house rules" : "(the countdown was past before the briefing could be read)");
  await page.getByTestId("countdown").waitFor({ state: "detached", timeout: 180000 });
  await page.screenshot({ path: `${OUT}/podrace-1-grid.png`, timeout: 120000 });
  const state = () => page.evaluate(() => {
    const r = window.__race;
    const me = r.racers.find((x) => x.party);
    return { t: +r.t.toFixed(1), gates: me.gates, hull: me.hull, speed: Math.round(me.craft.speed * 3.6), over: r.over, wrecked: r.racers.filter((x) => x.wrecked).length };
  });
  // (the lab: the two levers in place of the stick; the left pulled right back turns the pod left at half power, then the stick again)
  if (!campaign) {
    await page.getByTestId("pod-levers").click();
    const box = await page.getByTestId("pod-lever-left").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.up();
    const lever = await page.evaluate(() => ({ power: window.__raceInput.power, steer: window.__raceInput.steer.x }));
    check(Math.abs(lever.power - 0.5) < 0.05 && lever.steer < -0.9, `the left lever back: power ${lever.power?.toFixed(2)}, steer ${lever.steer?.toFixed(2)}`);
    await page.getByTestId("pod-levers").click();
    check(await page.evaluate(() => window.__raceInput.power === undefined), "the stick again: full power");
  }
  const sections = await page.evaluate(() => window.__raceTrack.sections);
  check(!!(sections.tunnel && sections.canyon && sections.jump && sections.spires), "the course has its tunnel, canyon, jump and spires");
  const shots = { canyon: sections.canyon[0] + 400, tunnel: sections.tunnel[0] + 80, spires: sections.spires[0] - 80 };
  let taken = 0;
  let fast = false;
  for (let n = 0; n < 900; n++) {
    await sleep(1000);
    const s = await state();
    if (n % 15 === 0) say("t", JSON.stringify(s));
    if (s.over) break;
    if (!fast && s.speed > 400) {
      fast = true;
      check(true, `racing at ${s.speed} km/h`);
    }
    // (early on, a look at each section: the party's pod is put just before it for a moment and then raced on from there)
    if (!campaign && taken < 3 && s.t > 8 + taken * 6) {
      const [name, at] = Object.entries(shots)[taken++];
      await page.evaluate((x) => { window.__raceWarp = x; }, at);
      await sleep(4000);
      await page.screenshot({ path: `${OUT}/podrace-2-${name}.png`, timeout: 120000 });
    }
  }
  const end = await state();
  check(fast, "the pod raced at over 400 km/h");
  check(end.over, `the race ends (${end.t} s)`);
  await page.getByTestId("minigame-over").waitFor({ timeout: 60000 });
  const result = await page.getByTestId("pod-result").innerText();
  say(result.split("\n").slice(0, 3).join(" / "));
  check(/house rules/.test(result), "the result names its house rules");
  await page.screenshot({ path: `${OUT}/podrace-3-result.png`, timeout: 120000 });
  if (campaign) {
    const paid = /a purse of ([\d,]+) cr/.exec(result);
    const won = /paid ([\d,]+) cr/.exec(result);
    const gain = (paid ? Number(paid[1].replace(/,/g, "")) : 0) + (won ? Number(won[1].replace(/,/g, "")) : 0);
    await page.getByTestId("minigame-land").click();
    await sleep(2500);
    const after = Number(/([\d,]+) cr\./.exec(await page.getByTestId("downtime-state").innerText())[1].replace(/,/g, ""));
    // (the day the race takes is lived at the party's lifestyle: a Modest one costs 10 cr, an Aristocratic one 100 at least)
    const living = credits0 - cost + gain - after;
    check(living >= 0 && living <= 100, `the credits: ${credits0} - ${cost} + ${gain}, less ${living} cr for the day's lifestyle, = ${after}`);
  }
} catch (e) {
  failed = true;
  say("FAIL", e.message.split("\n")[0]);
  await page.screenshot({ path: `${OUT}/podrace-fail.png` }).catch(() => {});
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
