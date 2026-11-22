// Flow 5: tabletop fight. A Consular with two known powers fights the hostile room's creature: melee, a power, damage taken, an end.
import { flow, BASE, TAG, quickChar, genWorld, quickCamp, openGame, hostileRoom, api, sleep } from "./h.mjs";

await flow("05_tabletop_fight", "Tabletop fight: attack, power, damage, result", async ({ page, view, shot, note, state, mark }) => {
  const rows = (await api("GET", "/api/sw5e/powers?fields=name,level,description,forceAlignment&limit=1000")).json;
  const list = Array.isArray(rows) ? rows : rows.items;
  const known = ["Force Push/Pull", "Force Throw"].map((n) => list.find((p) => p.name === n)).filter(Boolean);
  const ch = await quickChar(`${TAG} caster ${view}`, { species: "Togruta", class: "Consular", background: "Jedi", level: 3, maxHp: 28, currentHp: 28, maxForcePoints: 12, currentForcePoints: 12, forcePowers: known, equipment: ["Lightsaber", "Medpac"] });
  const world = await genWorld(3, 3);
  const room = hostileRoom(world);
  if (!room) throw new Error("no hostile room in the world");
  note("hostiles", room.occupants.filter((o) => o.disposition === "hostile").map((o) => `${o.name} x${o.count}`).join(", "));
  const camp = await quickCamp(ch.id, world, { loc: room.id, mode: "tabletop" });
  await openGame(page, BASE, camp.id, ch.name, 3000);
  mark("game open");
  await shot("before_fight");
  const hp = async () => (await api("GET", `/api/characters/${ch.id}`)).json;
  const before = await hp();
  state("before", { hp: before.currentHp, fp: before.currentForcePoints, xp: before.experience, conditions: before.conditions });
  if (!(await page.getByText(/Combat - Round/).count())) await page.getByRole("button", { name: /^(Fight|Ambush)$/ }).first().click({ timeout: 60000 });
  await page.getByText(/Combat - Round/).waitFor({ timeout: 60000 });
  mark("fight started");
  await shot("fight_started");
  note("powers offered", (await page.getByTestId("combat-powers").innerText().catch(() => "(none)")).replace(/\s+/g, " ").slice(0, 160));
  const seen = [];
  let cast = false, shotMid = false;
  for (let i = 0; i < 260; i++) {
    if (!(await page.getByText(/Combat - Round/).count())) break;
    for (const l of await page.locator("div.text-xs.text-gray-300 > div").allInnerTexts().catch(() => [])) if (!seen.includes(l)) seen.push(l);
    const save = page.getByRole("button", { name: "Death saving throw" });
    const power = page.getByTestId("combat-powers").getByRole("button").first();
    const melee = page.getByRole("button", { name: "Melee", exact: true });
    const choose = page.getByTestId("motion-chooser").locator("button:not([disabled])").first();
    if ((await choose.count()) && !/Cancel|Drop/.test(await choose.innerText().catch(() => "Cancel"))) await choose.click().catch(() => {});
    else if ((await save.count()) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
    else if (!cast && (await power.count()) && (await power.isEnabled().catch(() => false))) { await power.click().catch(() => {}); cast = true; await sleep(500); if (!shotMid) { await shot("after_power"); shotMid = true; } }
    else if ((await melee.count()) && (await melee.isEnabled().catch(() => false))) await melee.click().catch(() => {});
    else if (await page.getByRole("button", { name: "End turn" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "End turn" }).click().catch(() => {});
    await sleep(300);
  }
  mark("fight ended");
  await sleep(1500);
  await shot("after_fight");
  const after = await hp();
  state("after", { hp: after.currentHp, fp: after.currentForcePoints, xp: after.experience, conditions: after.conditions });
  note("log (last 8)", seen.slice(-8).join(" | ").slice(0, 700));
  note("dice seen", seen.filter((l) => /roll|d20|saving throw|damage/i.test(l)).slice(0, 4).join(" | ").slice(0, 400));
  note("a power was cast", seen.some((l) => /casts/.test(l)));
  note("conditions mentioned", [...new Set(seen.join(" ").match(/\b(prone|frightened|grappled|blinded|stunned|unconscious|poisoned|restrained|charmed|paralyzed|dead)\b/gi) ?? [])]);
  note("force points spent", before.currentForcePoints - after.currentForcePoints);
  if (after.currentHp === before.currentHp && after.experience === before.experience) throw new Error("nothing changed: no damage taken and no experience gained");
});
