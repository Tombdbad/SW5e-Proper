// Flow 9: NPC dialogue and voice. Run twice: LABEL=ai_on against the normal test server (5099), LABEL=ollama_off against a second test server
// started with OLLAMA_URL pointing nowhere (BASE=http://127.0.0.1:5098). Records what works and what the game does when it does not.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, mapTools, api, sleep } from "./h.mjs";

const label = process.env.LABEL || "ai_on";
await flow(`09_dialogue_${label}`, `Dialogue and voice (${label})`, async ({ page, view, shot, note, state, mark }) => {
  // ---- the service endpoints, timed ----
  const st = await api("GET", "/api/dialogue/status");
  note("dialogue status", st.text.slice(0, 120));
  const sp = await api("GET", "/api/speech/status");
  note("speech status", sp.text.slice(0, 160));
  const body = { speaker: { name: "Dollo", species: "Human", role: "bartender", disposition: "neutral" }, player: { name: "Audit", species: "Human", class: "Fighter" }, scene: "A busy cantina in the evening.", line: "Any work around here?" };
  const t0 = Date.now();
  let first = null, lines = [];
  try {
    const r = await fetch(BASE + "/api/dialogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; if (first == null) first = Date.now() - t0; lines.push(dec.decode(value)); }
    note("dialogue HTTP", r.status);
  } catch (e) { note("dialogue request failed", String(e.message).slice(0, 120)); }
  const joined = lines.join("");
  note("dialogue first byte ms / total ms", `${first} / ${Date.now() - t0}`);
  note("dialogue reply (start)", joined.replace(/\s+/g, " ").slice(0, 300));
  const t1 = Date.now();
  const sr = await fetch(BASE + "/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Welcome to the cantina.", voice: { name: "piper:12" } }) });
  const bytes = (await sr.arrayBuffer()).byteLength;
  note("speech", `HTTP ${sr.status}, ${bytes} bytes, ${Date.now() - t1} ms, ${sr.headers.get("content-type")}`);
  // ---- the screen: talk to the bartender ----
  const ch = await quickChar(`${TAG} talker ${view} ${label}`);
  const world = await genWorld(7, 3);
  const start = world.areas[world.startId];
  const bar = Object.values(world.areas).find((a) => a.name === "Main bar" && a.parentId === start.parentId);
  const camp = await quickCamp(ch.id, world, { loc: bar.id });
  await api("PATCH", `/api/campaigns/${camp.id}`, { timeElapsed: { total: 21 * 60 } });
  await openGame(page, BASE, camp.id, ch.name, 3500);
  const { doubleTap } = mapTools(page, view);
  const counter = bar.layout.assets.find((a) => a.name === "Bar counter");
  await doubleTap(`asset:${counter.id}`);
  const card = page.locator("[data-testid=map-card], [data-testid=hud-trade]");
  await card.getByTestId("trade").waitFor({ timeout: 40000 }).catch(() => {});
  await shot("person_card");
  const panel = page.getByTestId("talk-panel");
  const has = await panel.count();
  note("talk panel present", has > 0);
  if (!has) { note("talk-off present", (await page.getByTestId("talk-off").count()) > 0); return; }
  const input = page.getByTestId("talk-input");
  await input.fill("Hello. Any work around here?");
  await shot("talk_typed");
  const t2 = Date.now();
  await input.press("Enter");
  let got = null;
  for (let i = 0; i < 90; i++) {
    const heard = await page.getByTestId("talk-heard").innerText().catch(() => "");
    const err = await page.getByTestId("talk-error").innerText().catch(() => "");
    if (err) { got = { error: err }; break; }
    if (heard && heard.length > 15 && !/is thinking/i.test(heard)) { got = { heard }; break; }
    if (i === 89 && heard) got = { stillThinking: heard };
    await sleep(1000);
  }
  mark("reply or error");
  note("screen result", got ? JSON.stringify(got).slice(0, 300) : "no reply or error within 90 s");
  note("screen seconds", Math.round((Date.now() - t2) / 1000));
  await shot("talk_result");
});
