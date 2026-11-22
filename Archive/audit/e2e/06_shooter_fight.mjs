// Flow 6: shooter fight. Real-time: move, aim, fire, take damage, then a forced defeat to see the respawn.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, hostileRoom, api, sleep } from "./h.mjs";

await flow("06_shooter_fight", "Shooter fight: move, aim, fire, hurt, defeat", async ({ page, view, shot, note, state, mark }) => {
  const ch = await quickChar(`${TAG} shooter ${view}`, { level: 3, maxHp: 40, currentHp: 40, equipment: ["Blaster rifle", "Power cell", "Power cell", "Power cell", "Grenade, corrosive", "Lightsaber", "Combat suit", "Medpac"] });
  const world = await genWorld(3, 3);
  const room = hostileRoom(world);
  if (!room) throw new Error("no hostile room");
  const camp = await quickCamp(ch.id, world, { loc: room.id, mode: "shooter" });
  await page.addInitScript(() => { try { localStorage.setItem("sw5e.view", "overhead"); } catch { /* storage */ } });
  await openGame(page, BASE, camp.id, ch.name, 8000);
  mark("game open");
  await shot("room");
  const st = () => page.evaluate(async () => {
    const c = await import("/src/lib/stores/useCombat.ts"); const s = await import("/src/components/Map/interiors/shoot.ts");
    const k = c.useCombat.getState(); const sh = s.useShoot.getState(); const sim = window.__shooter;
    return { inCombat: k.inCombat, realtime: k.realtime, outcome: k.outcome, session: !!sh.session, hud: sh.hud, time: sim ? +sim.time.toFixed(1) : null };
  });
  const held = (k, on) => page.evaluate(async ([key, v]) => { const s = (await import("/src/components/Map/interiors/shoot.ts")).useShoot.getState(); v ? s.down(key) : s.up(key); }, [k, on]);
  const look = () => page.evaluate(() => { const s = window.__shooter; if (!s) return null; const me = s.units.find((u) => u.side === "player"); const foe = s.units.find((u) => u.side === "foe" && !u.dead); if (!foe || !me) return null; window.__look(Math.atan2(foe.x - me.x, foe.y - me.y), -0.05); return +Math.hypot(foe.x - me.x, foe.y - me.y).toFixed(1); });
  if (await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).count()) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 5000 }).catch(() => {});
  await sleep(3000);
  const s0 = await st();
  state("start", { inCombat: s0.inCombat, realtime: s0.realtime, hud: s0.hud });
  note("shooter session started", s0.session);
  if (!s0.session) throw new Error("no shooter session started: " + JSON.stringify(s0).slice(0, 200));
  await shot("fight_start");
  // T-007: nothing of the shooter screen may overlap: the buttons, the compass, the ammo and the vitals, and none may leave the view
  const overlaps = await page.evaluate(() => {
    const q = (sel) => [...document.querySelectorAll(sel)].map((e) => ({ id: e.getAttribute("data-testid") || e.textContent.slice(0, 12), r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
    const boxes = [...q('[data-testid="shoot-buttons"] button'), ...q('[data-testid="compass"]'), ...q('[data-testid="shooter-ammo"]'), ...q('[data-testid="shooter-vitals"]')];
    const hit = (a, b) => a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1;
    const out = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) out.push(`${boxes[i].id} x ${boxes[j].id}`);
    for (const b of boxes) if (b.r.left < 0 || b.r.right > innerWidth || b.r.top < 0) out.push(`${b.id} outside the view`);
    return { out, text: document.querySelector('[data-testid="shooter-hud"]')?.textContent.match(/\[[GZT]\]/g) ?? [] };
  });
  note("shooter screen overlaps", overlaps.out.length ? overlaps.out.join("; ") : "none");
  if (view === "phone") note("keyboard hints shown on a phone", overlaps.text.length ? overlaps.text.join(" ") : "none");
  const hp0 = s0.hud?.hp;
  await held("up", true); await sleep(600); await held("up", false);
  note("distance to foe", await look());
  await held("fire", true);
  const hpTrace = [];
  for (let i = 0; i < 40; i++) { await look(); await sleep(300); const h = (await st()).hud; hpTrace.push(`${h?.hp}/${h?.left}${h?.reloading ? "R" : ""}`); }
  await held("fire", false);
  await shot("firing");
  const s1 = await st();
  state("after firing", { hud: s1.hud, foes: await page.evaluate(() => window.__shooter?.units.filter((u) => u.side === "foe").map((u) => Math.round(u.hp))) });
  note("player hp/ammo over 12 s", hpTrace.filter((_, i) => i % 5 === 0).join(" "));
  note("player hp start -> now", `${hp0} -> ${s1.hud?.hp}`);
  // Force a defeat to see the respawn path (induced: the player's hit points are set to 1, then left to the foes)
  await page.evaluate(() => { const me = window.__shooter?.units.find((u) => u.side === "player"); if (me) me.hp = 1; });
  for (let i = 0; i < 80; i++) { const s = await st(); if (s.outcome || !s.inCombat) break; await sleep(500); }
  const s2 = await st();
  note("after induced defeat", { outcome: s2.outcome, inCombat: s2.inCombat });
  await sleep(2500);
  await shot("after_defeat");
  const c = (await api("GET", `/api/characters/${ch.id}`)).json;
  state("saved character after", { hp: c.currentHp, conditions: c.conditions, xp: c.experience });
});
