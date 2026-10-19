// Shared helpers for the headless play-through. Needs a running server (default http://127.0.0.1:5000)
// and the Playwright browser: npx playwright install --with-deps chromium
import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

export const BASE = process.env.BASE || "http://127.0.0.1:5000";
export const OUT = process.env.OUT || "e2e/out";
const PHONE = process.env.VIEW === "phone";

export async function open() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const context = await browser.newContext(
    PHONE
      ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } },
  );
  // The play-through rolls checks by itself: no dialog asking who rolls and with which skill
  // and draws the 3D map at a lower render scale (SHARPNESS=1.5 for the full size)
  const sharp = process.env.SHARPNESS || "0.75";
  await context.addInitScript((v) => { try { localStorage.setItem("sw5e.autoChecks", "1"); if (!localStorage.getItem("sw5e.sharpness")) localStorage.setItem("sw5e.sharpness", v); } catch {} }, sharp);
  // No one comes up to the party and no gang waits in an alley (the steps that are about them switch it off):
  // a play-through that walks the streets must not be stopped by a chance meeting
  await context.addInitScript(() => { try { localStorage.setItem("sw5e.noEncounters", "1"); } catch {} });
  // Long tasks and frame gaps in the page, read back by diagnose() when a step fails
  await context.addInitScript(() => {
    const perf = (window.__perf = { long: [], frames: 0, maxGap: 0, last: performance.now() });
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) perf.long.push([Math.round(e.startTime), Math.round(e.duration)]);
        if (perf.long.length > 200) perf.long.splice(0, 100);
      }).observe({ entryTypes: ["longtask"] });
    } catch {}
    const tick = (t) => {
      perf.frames++;
      perf.maxGap = Math.max(perf.maxGap, t - perf.last);
      perf.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.TIMEOUT || 15000));
  // A 3D scene's first frame is drawn in software on this VM and blocks the page for up to half a
  // minute (see e2e/probe.mjs): navigations wait longer than the other actions
  page.setDefaultNavigationTimeout(Number(process.env.NAV_TIMEOUT || 90000));
  const events = [];
  const pending = new Map();
  page.on("request", (r) => pending.set(r, Date.now()));
  page.on("requestfinished", (r) => pending.delete(r));
  page.on("requestfailed", (r) => {
    pending.delete(r);
    events.push(`[requestfailed] ${r.method()} ${r.url().replace(BASE, "").slice(0, 120)} ${r.failure()?.errorText}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") events.push(`[console.${m.type()}] ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => events.push(`[pageerror] ${String(e.stack || e).slice(0, 600)}`));
  page.on("dialog", async (d) => {
    events.push(`[dialog] ${d.message().slice(0, 200)}`);
    if (d.type() === "confirm") await d.accept().catch(() => {});
    else await d.dismiss().catch(() => {});
  });
  page.on("response", (r) => {
    const u = r.url().replace(BASE, "");
    if (r.status() >= 400) events.push(`[http ${r.status()}] ${r.request().method()} ${u}`);
    else if (u.startsWith("/api") && r.request().method() !== "GET") events.push(`[api ${r.status()}] ${r.request().method()} ${u}`);
  });
  startSampler();
  return { browser, page, events, pending };
}

const results = [];
let shot = 0;
export async function step(ctx, name, fn) {
  // ONLY=<regex> runs just the steps whose names match (the self-contained ones: gear, fights, downtime, ships)
  if (process.env.ONLY && !new RegExp(process.env.ONLY, "i").test(name)) return;
  const { page, events } = ctx;
  const before = events.length;
  const t0 = Date.now();
  let ok = true;
  let msg = "";
  try {
    msg = (await fn()) || "";
  } catch (e) {
    ok = false;
    msg = String(e.message || e).split("\n").slice(0, 4).join(" | ").slice(0, 500);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  if (!ok) await diagnose(ctx, name, secs);
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}_${name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  const line = `${ok ? "PASS" : "FAIL"}  [${secs}s] ${name}${msg ? "  :: " + msg : ""}`;
  console.log(line);
  for (const ev of events.slice(before)) console.log("        " + ev);
  results.push({ ok, name, msg });
  return ok;
}

export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  for (const f of failed) console.log(`  FAILED: ${f.name}`);
  return failed.length;
}

export async function text(page) {
  return (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
}

export async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, text: t };
}

// Pick an option from a Radix Select whose trigger currently shows `triggerText`.
export async function pick(page, triggerText, optionText) {
  await page.getByRole("combobox").filter({ hasText: triggerText }).first().click();
  const opt = optionText
    ? page.getByRole("option", { name: optionText, exact: true }).first()
    : page.getByRole("option").first();
  await opt.click();
}

// ---- Failure analysis -------------------------------------------------------------------------
// A background sampler writes OUT/sys.log (one line per 5 s: load, pressure stall info, memory, the
// busiest processes, how long the server takes to answer). When a step fails, diagnose() appends a
// probe to OUT/failures.log: is the server slow, is the system starved, is the page's main thread
// blocked, which requests were still open. Read the two together to tell the causes apart.
const stamp = () => new Date().toISOString().slice(11, 23);
const read = (f) => { try { return fs.readFileSync(f, "utf8").trim(); } catch { return ""; } };
const psi = (n) => (read(`/proc/pressure/${n}`).match(/some avg10=([\d.]+)/) || [])[1] || "?";
const sh = (c) => { try { return execSync(c, { timeout: 3000 }).toString().trim(); } catch { return ""; } };

async function ping() {
  const t = Date.now();
  try {
    const r = await fetch(BASE + "/api/sw5e", { signal: AbortSignal.timeout(10000) });
    await r.arrayBuffer();
    return `${Date.now() - t}ms/${r.status}`;
  } catch (e) {
    return `${Date.now() - t}ms/${e.name}`;
  }
}

function snapshot() {
  const mem = read("/proc/meminfo");
  const avail = Math.round(Number((mem.match(/MemAvailable:\s+(\d+)/) || [])[1] || 0) / 1024);
  const top = sh("ps -eo pcpu,rss,comm --sort=-pcpu | sed -n 2,4p | tr -s ' ' | tr '\\n' ';'");
  const chrome = sh("ps -C chrome,headless_shell -o rss= | awk '{s+=$1} END {print int(s/1024)}'");
  return `load=${os.loadavg()[0].toFixed(2)} psi(cpu/io/mem)=${psi("cpu")}/${psi("io")}/${psi("memory")} memAvail=${avail}MB chromeRSS=${chrome || 0}MB top=${top}`;
}

function startSampler() {
  const file = `${OUT}/sys.log`;
  fs.writeFileSync(file, "");
  const timer = setInterval(async () => {
    fs.appendFileSync(file, `${stamp()} ${snapshot()} ping=${await ping()}\n`);
  }, 5000);
  timer.unref();
}

async function diagnose(ctx, name, secs) {
  const { page, pending } = ctx;
  const out = [`== ${stamp()} FAIL after ${secs}s: ${name.slice(0, 80)}`, `   system: ${snapshot()}`, `   server ping: ${await ping()}`];
  const t = Date.now();
  const alive = await Promise.race([page.evaluate(() => 1).then(() => true), new Promise((r) => setTimeout(() => r(false), 3000))]).catch(() => false);
  out.push(`   page main thread: ${alive ? "answered in " + (Date.now() - t) + "ms" : "BLOCKED (no answer in 3s)"} url=${page.url().replace(BASE, "")}`);
  if (alive) {
    const p = await page.evaluate(() => {
      const perf = window.__perf;
      const nav = performance.getEntriesByType("navigation")[0];
      const gl = !!document.querySelector("canvas");
      return perf && { frames: perf.frames, maxGap: Math.round(perf.maxGap), long: perf.long.slice(-5), top: perf.long.reduce((m, l) => Math.max(m, l[1]), 0), canvas: gl, dcl: nav && Math.round(nav.domContentLoadedEventEnd), res: performance.getEntriesByType("resource").length };
    }).catch(() => null);
    out.push(`   page perf: ${JSON.stringify(p)}`);
  }
  const open = [...pending].map(([r, at]) => `${r.method()} ${r.url().replace(BASE, "").slice(0, 80)} (${Math.round((Date.now() - at) / 1000)}s)`).slice(0, 8);
  out.push(`   requests still open: ${open.length ? open.join(" | ") : "none"}`);
  fs.appendFileSync(`${OUT}/failures.log`, out.join("\n") + "\n");
  console.log(out.join("\n"));
}
