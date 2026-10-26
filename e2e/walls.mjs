// Doors and windows in walls (2026-10-26): a round room's doors and windows stand on its curve and the wall is cut only inside their
// frames; the corridor to it meets the curve. Opens the cantina of seed 7 (its Entrance is an oval room with a corridor to the main bar)
// from inside the Entrance, from inside the corridor and from the street, and saves close looks at the walls.
// Self-contained (makes and deletes its own character and campaign). Usage: BASE=http://127.0.0.1:5057 node e2e/walls.mjs
import { open, step, summary, api, BASE, OUT } from "./lib.mjs";

const ctx = await open();
const { page, browser } = ctx;
const TAG = Date.now().toString(36);
const NAME = "Walls " + TAG;
const wait = (ms) => page.waitForTimeout(ms);
const made = { chars: [], camps: [] };
let world, cantina, entrance, corridor, campId;

const goTo = async (areaId) => {
  const m = await api("PATCH", `/api/campaigns/${campId}`, { currentLocation: areaId });
  if (m.status >= 300) throw new Error(`${m.status} ${m.text.slice(0, 200)}`);
  await page.goto(`${BASE}/game/${campId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
  await wait(Number(process.env.SETTLE || 12000));
};
// A look from above and behind a square of the building (squares of the building's plan), toward another
const look = async (name, from, to) => {
  const ok = await page.evaluate(([f, t]) => {
    const m = window.__map3d;
    const a = m?.world(`sq:${f[0]},${f[1]}`);
    const b = m?.world(`sq:${t[0]},${t[1]}`);
    if (!a || !b) return false;
    m.look([a[0], f[2], a[2]], [b[0], t[2], b[2]]);
    return true;
  }, [from, to]);
  if (!ok) throw new Error(`no square ${from} or ${to}`);
  await wait(1500);
  await page.screenshot({ path: `${OUT}/walls-${name}.png` });
};

try {
  await step(ctx, "walls: a campaign in seed 7's cantina", async () => {
    const r = await api("POST", "/api/characters", {
      name: NAME, species: "human", class: "fighter", background: "soldier", alignment: "Neutral Balanced", level: 3,
      abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      maxHp: 30, currentHp: 30, maxForcePoints: 0, currentForcePoints: 0, armorClass: 12, speed: 30, credits: 100,
      startingLocation: "Unknown", skillProficiencies: ["Athletics"], savingThrowProficiencies: ["strength", "constitution"], equipment: [],
    });
    if (r.status !== 201) throw new Error(r.text.slice(0, 300));
    made.chars.push(r.json.id);
    world = (await api("POST", "/api/world/generate", { options: { seed: 7, partyLevel: 3 } })).json.world;
    const areas = Object.values(world.areas);
    cantina = areas.find((a) => a.kind === "building" && a.type === "cantina" && areas.some((r) => r.parentId === a.id && r.layout?.shape));
    if (!cantina) throw new Error("no cantina with a round room");
    entrance = areas.find((a) => a.parentId === cantina.id && a.layout?.shape);
    corridor = areas.find((a) => a.parentId === cantina.id && a.name.startsWith("Corridor") && a.layout && a.layout.x === entrance.layout.x + entrance.layout.width);
    for (const a of areas) if (a.parentId === cantina.id) a.occupants = (a.occupants || []).filter((o) => o.disposition !== "hostile");
    const m = await api("POST", "/api/campaigns", { characterId: r.json.id, name: "E2E walls " + TAG, description: "walls", npcs: [], locations: [], quests: [], startingLocation: "start", currentLocation: entrance.id, galaxyMap: world, timeElapsed: { total: 0 } });
    if (m.status !== 201) throw new Error(m.text.slice(0, 200));
    campId = m.json.id;
    made.camps.push(campId);
    await page.goto(`${BASE}/game/${campId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: NAME }).waitFor({ timeout: 120000 });
    await wait(Number(process.env.SETTLE || 15000));
    await page.screenshot({ path: `${OUT}/walls-entrance.png` });
    const l = entrance.layout;
    return `${cantina.name}: ${entrance.name} ${l.shape} ${l.width}x${l.height} at ${l.x},${l.y}; ways ${l.assets.filter((a) => a.side).map((a) => `${a.kind} ${a.side}${a.side === "n" || a.side === "s" ? a.x : a.y}`).join(", ")}; corridor ${corridor ? `${corridor.layout.width}x${corridor.layout.height} at ${corridor.layout.x},${corridor.layout.y}` : "none"}`;
  });

  await step(ctx, "walls: close looks inside the round room", async () => {
    const l = entrance.layout;
    const shots = [];
    for (const a of l.assets.filter((a) => a.side)) {
      // from the middle of the room, a little up, toward the way
      const [x, y] = a.side === "n" ? [l.x + a.x, l.y] : a.side === "s" ? [l.x + a.x, l.y + l.height - 1] : a.side === "w" ? [l.x, l.y + a.y] : [l.x + l.width - 1, l.y + a.y];
      // three squares in from the way, looking back at it
      const [ix, iy] = a.side === "n" ? [0, 3] : a.side === "s" ? [0, -3] : a.side === "w" ? [3, 0] : [-3, 0];
      await look(`in-${a.kind}-${a.side}`, [x + ix, y + iy, 2.4], [x, y, 0.5]);
      shots.push(`${a.kind}-${a.side}`);
    }
    return shots.join(", ");
  });

  if (corridor) await step(ctx, "walls: from the corridor, the round room's curve and its door", async () => {
    await goTo(corridor.id);
    await page.screenshot({ path: `${OUT}/walls-corridor.png` });
    const c = corridor.layout;
    await look("corridor-end", [c.x + 3, c.y + 1, 2.6], [c.x, c.y + 1, 0.4]);
    return "saved";
  });

  await step(ctx, "walls: from the street, the round room's block", async () => {
    await goTo(cantina.id);
    await page.screenshot({ path: `${OUT}/walls-street.png` });
    const l = entrance.layout;
    await look("street-curve", [l.x + l.width + 3, l.y + l.height + 4, 6], [l.x + l.width / 2, l.y + l.height / 2, 0.5]);
    return "saved";
  });
} finally {
  if (!process.env.KEEP) {
    for (const id of made.camps) await api("DELETE", `/api/campaigns/${id}`);
    for (const id of made.chars) await api("DELETE", `/api/characters/${id}`);
  }
  await summary(ctx);
  await browser.close();
}
