// Flow 1: create characters through the creation screens (Human Fighter, Zabrak Consular (caster), and a third combination).
import { flow, createViaUI, BASE, TAG, api, made } from "./h.mjs";

const combos = [
  { cls: "Fighter", species: "Human", opts: { increases: [["+2 to one", ["str"]], ["+1 to 2", ["dex", "con"]]], buy: ["Blaster pistol", "Vibroblade", "Combat suit"] } },
  { cls: "Consular", species: "Zabrak", opts: { increases: [["+1 to one", ["dex"]]], forcePowers: 2 } },
  { cls: "Scout", species: "Mirialan", opts: {} },
];

await flow("01_create_character", "Create characters (3 combinations)", async ({ page, view, shot, note, state, mark }) => {
  const todo = view === "phone" ? combos.slice(0, 2) : combos;
  for (const c of todo) {
    const name = `${TAG} ${c.cls} ${view}`;
    mark("start " + c.cls);
    let saved;
    try {
      saved = await createViaUI(page, BASE, shot, name, c.cls, c.species, c.opts);
    } catch (e) {
      note(`${c.species} ${c.cls}`, "UI path failed: " + String(e.message).split("\n")[0].slice(0, 200));
      await shot(`${c.cls}_failed`);
      continue;
    }
    mark("saved " + c.cls);
    state(`${c.species} ${c.cls}`, { id: saved.id, hp: saved.maxHp, ac: saved.armorClass, powerPoints: saved.maxForcePoints, abilities: saved.abilityScores, skills: saved.skillProficiencies, feats: saved.feats, equipment: saved.equipment, credits: saved.credits, powers: (saved.forcePowers || []).length });
    // Open the saved character page and read it back
    await page.goto(`${BASE}/characters/${saved.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name }).waitFor({ timeout: 60000 }).catch(() => {});
    await shot(`${c.cls}_sheet`);
    const again = (await api("GET", `/api/characters/${saved.id}`)).json;
    note(`${c.species} ${c.cls} reload`, again?.name === name && again?.maxHp === saved.maxHp ? "saved and read back equal" : "MISMATCH after reload");
  }
});
