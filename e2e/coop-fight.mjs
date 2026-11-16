// The co-op shared fight through two real browsers (2026-11-16, batch G): Ann hosts a shooter campaign standing in a room with hostiles, Bo joins
// by the code and starts where she stands; one fight, played by the server, on both screens: the same foes with the same hit points, each one's
// shots their own, the same end. Both tabs are recorded (videos in OUT). Usage: BASE=http://127.0.0.1:5113 OUT=e2e/out/coopfight node e2e/coop-fight.mjs
import { chromium } from "playwright";
import fs from "fs";
import { api, BASE, OUT } from "./lib.mjs";

const say = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const made = { chars: [], camps: [] };
const contexts = [];
const tab = async (label) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUT, size: { width: 960, height: 640 } } });
  await context.addInitScript(() => { try { localStorage.setItem("sw5e.autoChecks", "1"); localStorage.setItem("sw5e.noEncounters", "1"); localStorage.setItem("sw5e.sharpness", "0.6"); localStorage.setItem("sw5e.view", "shoulder"); } catch {} });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (e) => say(`[${label} pageerror]`, String(e.stack || e).slice(0, 300)));
  return page;
};
try {
  const person = async (name) => {
    const r = await api("POST", "/api/characters", {
      name, species: "human", class: "fighter", background: "soldier", alignment: "Neutral", level: 5,
      abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
      maxHp: 400, currentHp: 400, maxForcePoints: 0, currentForcePoints: 0, armorClass: 16, speed: 30, credits: 500,
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"],
      equipment: ["Blaster rifle", "Power cell", "Power cell", "Power cell"],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.chars.push(r.json.id);
    return r.json;
  };
  const tag = Date.now().toString(36).slice(-4);
  const ann = await person("Ann" + tag);
  const bo = await person("Bo" + tag);
  const world = (await api("POST", "/api/world/generate", { options: { seed: 3, partyLevel: 5 } })).json.world;
  // (a room with hostiles, and a quiet room beside it to begin in: the hostiles there would begin the fight before Ann could host)
  const hostile = (a) => (a?.occupants || []).some((o) => o.disposition === "hostile" && o.hitPoints);
  let room, quiet;
  for (const a of Object.values(world.areas)) {
    if (a.kind !== "room" || !hostile(a)) continue;
    const way = world.paths.find((p) => (p.from === a.id || p.to === a.id) && !p.hidden && world.areas[p.from === a.id ? p.to : p.from]?.kind === "room" && !hostile(world.areas[p.from === a.id ? p.to : p.from]));
    if (way) { room = a; quiet = world.areas[way.from === a.id ? way.to : way.from]; break; }
  }
  if (!room) throw new Error("no hostile room beside a quiet one");
  const camp = await api("POST", "/api/campaigns", {
    characterId: ann.id, name: "Co-op fight " + tag, description: "x", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: quiet.id,
    galaxyMap: world, specialRules: { mode: "shooter" },
  });
  if (camp.status !== 201) throw new Error(camp.text.slice(0, 300));
  made.camps.push(camp.json.id);
  const cid = camp.json.id;
  say("room:", room.name, room.id, "from", quiet.name, (room.occupants || []).filter((o) => o.disposition === "hostile").map((o) => `${o.count ?? 1} x ${o.name}`).join(", "));

  // ---- Ann opens the game and hosts at once (the hostiles beside her begin the fight as soon as her map stands; a fight begun before the game
  // is hosted is hers alone)
  const host = await tab("ann");
  await host.goto(`${BASE}/game/${cid}`, { waitUntil: "domcontentloaded" });
  const code = await host.evaluate(async ([c, ch]) => {
    const m = await import("/src/lib/coop.ts");
    await m.startCoop({ campaignId: c, characterId: ch, host: true });
    return m.useCoop.getState().code;
  }, [cid, ann.id]);
  say("code:", code);
  await host.getByRole("heading", { name: ann.name }).waitFor({ timeout: 150000 });

  // ---- Bo joins by the code: he begins where Ann stands, where the fight is (a member who comes in while it goes on joins it)
  const guest = await tab("bo");
  await guest.goto(`${BASE}/coop`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("coop-code-input").fill(code);
  await guest.getByTestId(`coop-pick-${bo.id}`).click();
  await guest.getByTestId("coop-mode-join").click();
  await guest.getByRole("heading", { name: bo.name }).waitFor({ timeout: 150000 });
  say("Bo is in");
  // ---- the fight: begun by the hostiles (or Ann's Fight); Bo's screen joins
  const inFight = (page) => page.evaluate(async () => !!window.__shooter && !!(await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().session?.shared);
  for (let i = 0; i < 40 && !(await inFight(host)); i++) {
    if (i === 5 && (await host.getByRole("button", { name: /^(Fight|Ambush)$/ }).count())) await host.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 3000 }).catch(() => {});
    await sleep(1000);
  }
  for (let i = 0; i < 40 && !(await inFight(guest)); i++) await sleep(1000);
  say("in the shared fight: Ann", await inFight(host), "Bo", await inFight(guest));
  const field = (page) => page.evaluate(() => {
    const s = window.__shooter;
    return { foes: s.units.filter((u) => u.side === "foe" && !u.reserve).map((u) => `${u.id}:${Math.round(u.hp)}${u.dead ? "x" : ""}`).join(" "), party: s.units.filter((u) => u.side === "player").map((u) => `${u.id}:${Math.round(u.hp)}`).join(" "), t: +s.time.toFixed(1) };
  });
  await sleep(500);
  say("Ann sees:", JSON.stringify(await field(host)));
  say("Bo sees: ", JSON.stringify(await field(guest)));
  await host.screenshot({ path: `${OUT}/coopfight-1-ann.png` });
  await guest.screenshot({ path: `${OUT}/coopfight-1-bo.png` });

  // ---- both fire at the nearest foe till the fight ends (or two minutes)
  const shoot = (page) => page.evaluate(async () => {
    const s = window.__shooter;
    const me = s.units.find((u) => u.id === "me");
    const f = s.units.filter((u) => u.side === "foe" && !u.dead && u.mode !== "gone" && !u.reserve).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    if (!f || !me) return "none";
    window.__look(Math.atan2(f.x - me.x, f.y - me.y), -0.12);
    const st = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState();
    st.down("fire");
    await new Promise((r) => setTimeout(r, 450));
    st.up("fire");
    return `${f.id}:${Math.round(f.hp)} ammo ${me.gun?.left}`;
  });
  const ended = (page) => page.evaluate(async () => !(await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState().session);
  let shots = 0;
  let st0 = false;
  for (let i = 0; i < 120; i++) {
    const [a, b] = [await ended(host), await ended(guest)];
    if (a && b) break;
    if (!a) await shoot(host);
    if (!b) await shoot(guest);
    if (a !== b && !st0) { st0 = true; say(`  one ended first (Ann ${a}, Bo ${b}) at shot ${shots}:`, JSON.stringify(await field(a ? guest : host).catch(() => "-"))); }
    if (++shots % 10 === 0) {
      say(`  ${shots}: Ann`, JSON.stringify(await field(host).catch(() => "ended")), "| Bo", JSON.stringify(await field(guest).catch(() => "ended")));
      if (shots === 10) { await host.screenshot({ path: `${OUT}/coopfight-2-ann.png` }); await guest.screenshot({ path: `${OUT}/coopfight-2-bo.png` }); }
    }
    await sleep(300);
  }
  const outcome = (page) => page.evaluate(async () => { const c = (await import("/src/lib/stores/useCombat.ts")).useCombat.getState(); return { outcome: c.outcome, inCombat: c.inCombat }; });
  say("Ann:", JSON.stringify(await outcome(host)), "Bo:", JSON.stringify(await outcome(guest)));
  const bus = (page) => page.evaluate(async () => { const m = await import("/src/lib/coop.ts"); const e = m.fightBus.end; const st = m.useCoop.getState(); return { end: e && { area: e.area, result: e.result, owner: e.owner, me: e.snap?.units?.find((u) => u.id === st.me) ? { hp: Math.round(e.snap.units.find((u) => u.id === st.me).hp), dead: e.snap.units.find((u) => u.id === st.me).dead } : null }, me: st.me, area: st.members.find((x) => x.id === st.me)?.areaId, seq: m.fightBus.seq }; });
  say("Ann bus:", JSON.stringify(await bus(host)), "Bo bus:", JSON.stringify(await bus(guest)));
  await sleep(3000);
  await host.screenshot({ path: `${OUT}/coopfight-3-ann.png` });
  await guest.screenshot({ path: `${OUT}/coopfight-3-bo.png` });
} catch (e) {
  say("FAILED:", e.message);
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`).catch(() => {});
  for (const id of made.chars) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  await browser.close();
  say("videos:", fs.readdirSync(OUT).filter((f) => f.endsWith(".webm")).join(", "));
}
