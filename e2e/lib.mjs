// Shared helpers for the headless play-through. Needs a running server (default http://127.0.0.1:5000)
// and the Playwright browser: npx playwright install --with-deps chromium
import { chromium } from "playwright";
import fs from "fs";

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
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.TIMEOUT || 15000));
  const events = [];
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
  return { browser, page, events };
}

const results = [];
let shot = 0;
export async function step(ctx, name, fn) {
  // ONLY=<regex> runs just the steps whose names match (the self-contained ones: gear, fights, downtime, ships)
  if (process.env.ONLY && !new RegExp(process.env.ONLY, "i").test(name)) return;
  const { page, events } = ctx;
  const before = events.length;
  let ok = true;
  let msg = "";
  try {
    msg = (await fn()) || "";
  } catch (e) {
    ok = false;
    msg = String(e.message || e).split("\n").slice(0, 4).join(" | ").slice(0, 500);
  }
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}_${name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${msg ? "  :: " + msg : ""}`;
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
