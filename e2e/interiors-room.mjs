// A room of the real game, looked at (2026-10-19): puts the party in a room of a given kind of building and saves a shot of the
// 3D map. Self-contained (makes and deletes its own character and campaign), so it can run on a test copy.
// Usage: BASE=http://127.0.0.1:5002 node e2e/interiors-room.mjs cave|armsmith|garrison|palace [room-name-pattern]
// (a development server on the test database: see REVIVAL_NOTES.md "Interiors overhaul")
import { open, api, BASE, OUT } from "./lib.mjs";

const KINDS = { cave: ["cave", /deep chamber|den/i], armsmith: ["armsmith", /sales/i], garrison: ["garrison", /armory/i], palace: ["palace", /audience/i], cantina: ["cantina", /main bar/i], medcenter: ["medcenter", /ward/i], tenements: ["tenements", /apartments/i] };
const [kind, pattern] = [process.argv[2] || "cave", process.argv[3]];
const [type, kindPattern] = KINDS[kind] ?? [kind, new RegExp(pattern || ".")];
// ROOM=<regex> picks the room by name whatever the kind
const roomPattern = process.env.ROOM ? new RegExp(process.env.ROOM, "i") : kindPattern;
const ctx = await open();
const { page, events, browser } = ctx;
await page.setViewportSize({ width: Number(process.env.W || 900), height: Number(process.env.H || 600) });
// VIEWMODE=first|shoulder|overhead starts the game in that view (the view is remembered in localStorage "sw5e.view")
if (process.env.VIEWMODE) await page.addInitScript((m) => localStorage.setItem("sw5e.view", m), process.env.VIEWMODE);
const NAME = "Room " + Date.now().toString(36);
const made = [];
let campId;
try {
  const c = (await api("POST", "/api/characters", {
    name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
    abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 14, speed: 30, credits: 5000,
    startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength"], equipment: ["Blaster pistol"],
  })).json;
  made.push(c.id);
  let world, room;
  for (let seed = 1; seed <= 40 && !room; seed++) {
    world = (await api("POST", "/api/world/generate", { options: { seed, partyLevel: 3 } })).json.world;
    room = Object.values(world.areas).find((a) => a.kind === "room" && a.layout && roomPattern.test(a.name) && world.areas[a.parentId]?.type === type && !(a.layout.level < 0 && type !== "cave"));
    if (room) console.log(`seed ${seed}: ${type} / ${room.name} (${room.layout.width}x${room.layout.height}), ${room.layout.assets.filter((x) => !x.side).map((x) => x.name).join(", ")}`);
  }
  if (!room) throw new Error(`no ${type} room in 40 worlds`);
  for (const r of Object.values(world.areas).filter((a) => a.parentId === room.parentId)) r.occupants = (r.occupants || []).filter((o) => o.disposition !== "hostile");
  const camp = (await api("POST", "/api/campaigns", { characterId: c.id, name: NAME, description: "room", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: room.id, galaxyMap: world, timeElapsed: { total: Number(process.env.MINUTES || 780) } })).json;
  campId = camp.id;
  const t0 = Date.now();
  await page.goto(`${BASE}/game/${camp.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
  // The first frame of a 3D scene blocks the page for a good while in software
  await page.waitForTimeout(Number(process.env.SETTLE || 45000));
  // KEYS="KeyW,1500;ArrowLeft,600" holds each key for that many milliseconds (walking and turning in the first-person and shoulder views)
  for (const step of (process.env.KEYS || "").split(";").filter(Boolean)) {
    const [key, ms] = step.split(",");
    await page.keyboard.down(key);
    await page.waitForTimeout(Number(ms));
    // MID=1 takes a shot while the key is still held (a figure mid-stride)
    if (process.env.MID) await page.screenshot({ path: `${OUT}/room-${kind}-mid.png`, timeout: 300000 });
    await page.keyboard.up(key);
    await page.waitForTimeout(1500);
  }
  if (process.env.KEYS) console.log("reticle", await page.evaluate(() => { const r = document.querySelector('[data-testid="reticle"]'); return r ? `${r.getAttribute("data-kind")} ${r.getAttribute("data-blocked")} ${r.textContent}` : "none"; }));
  await page.screenshot({ path: `${OUT}/room-${kind}${process.env.VIEWMODE ? "-" + process.env.VIEWMODE : ""}.png`, timeout: 300000 });
  console.log(`saved ${OUT}/room-${kind}${process.env.VIEWMODE ? "-" + process.env.VIEWMODE : ""}.png after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  if (campId) await api("DELETE", `/api/campaigns/${campId}`).catch(() => {});
  for (const id of made) await api("DELETE", `/api/characters/${id}`).catch(() => {});
  for (const e of events) if (!/GL Driver|Future Flag|GPU stall|swiftshader|WebGL/i.test(e)) console.log(e);
  await browser.close();
}
