// The test menu of a test copy (a god-mode style panel): built into the page only where the page was built with VITE_TEST_MENU=1
// (deploy/test-plain.sh), never into the build the game is played on. It sets things on the character and the campaign that the game
// itself would make you earn; every action goes through the page's own save paths, so what it does is what play would have done.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getStarshipSize } from "@/lib/sw5e/starships";
import { SHIP_MODS, SHIP_SIZE_ORDER, PROSTHESES, roleShip, shipRoleNames } from "@shared/logic";

export interface TestArea {
  id: string;
  label: string;
}
// What the "Give" list can hand out, by the kind of thing it is
export type TestCategory = "weapons" | "weaponMods" | "armour" | "armourMods" | "gear" | "ships" | "shipMods" | "speeders" | "speederMods" | "droids" | "droidMods" | "cyber" | "beasts";
export const TEST_CATEGORIES: { id: TestCategory; label: string }[] = [
  { id: "weapons", label: "Weapons" },
  { id: "weaponMods", label: "Weapon upgrades" },
  { id: "armour", label: "Armour" },
  { id: "armourMods", label: "Armour upgrades" },
  { id: "gear", label: "Misc gear" },
  { id: "ships", label: "Ships" },
  { id: "shipMods", label: "Ship upgrades" },
  { id: "speeders", label: "Speeders" },
  { id: "speederMods", label: "Speeder upgrades" },
  { id: "droids", label: "Droids" },
  { id: "droidMods", label: "Droid upgrades" },
  { id: "cyber", label: "Prosthetics/cybernetics" },
  { id: "beasts", label: "Beasts" },
];
// One thing that can be given: `id` tells the page what to make (an item's name, "size|role" of a ship, "mod|name" of a ship part, a stat block's id)
export interface TestItem {
  id: string;
  name: string;
  note: string;
}
// The rules data the lists are made from (all of it already loaded by the page)
export interface TestData {
  equipment: { name: string; cost?: number; equipmentCategory: string }[];
  enhanced: { name: string; type: string; subtype?: string; searchableRarity?: string }[];
  shipRows: { name: string; type: string; cost: number; weaponSize?: string; weaponCategory?: string; hyperDriveClass?: string }[];
  enhancedShip: { name: string; type: string; searchableRarity?: string }[];
  vehicles: { name: string; cost: number; mph: number }[];
  droids: { id: string; name: string; challengeRating?: string | number }[];
  beasts: { id: string; name: string; challengeRating?: string | number }[];
}
export interface TestActions {
  heal: () => void;
  credits: (amount: number) => void;
  nextLevel: () => void;
  give: (category: TestCategory, item: TestItem) => void;
  teleport: (id: string) => void;
  clock: (minutesOfDay: number | "+hour" | "+8hours") => void;
  revive: () => void;
}

const cr = (n: number | undefined) => (n ? `${n.toLocaleString("en-GB")} cr` : "");
const byName = (a: TestItem, b: TestItem) => a.name.localeCompare(b.name);
const WEAPON_MODS = ["blaster", "vibroweapon", "lightweapon"];
// A chassis row ("Blaster Chassis (Prototype)") raises the rarity of a plain item: an upgrade of the item it is for
const isChassis = (name: string) => / Chassis \(/.test(name);

// Every item of every category, from the rules data: the plain equipment and the enhanced items (a modification goes with the item kind it
// fits, a chassis with the item it upgrades), the ship parts the shipyards trade in, the ships the role table makes, the speeders, droids
// and beasts. The books list no speeder upgrades, so that list is empty.
export function catalogOf(data: TestData): Record<TestCategory, TestItem[]> {
  const out = Object.fromEntries(TEST_CATEGORIES.map((c) => [c.id, [] as TestItem[]])) as Record<TestCategory, TestItem[]>;
  // (the equipment data lists the bo-rifle and the saberstaff twice: one line of each, or the list's keys clash)
  const add = (category: TestCategory, name: string, note: string, id = name) => {
    if (!out[category].some((i) => i.id === id)) out[category].push({ id, name, note });
  };
  for (const e of data.equipment) {
    const note = cr(e.cost);
    if (e.equipmentCategory === "Weapon") add("weapons", e.name, note);
    else if (e.equipmentCategory === "Armor") add("armour", e.name, note);
    else if (PROSTHESES[e.name.toLowerCase()]) add("cyber", e.name, `prosthesis, ${note}`);
    else add("gear", e.name, `${e.equipmentCategory}, ${note}`);
  }
  for (const e of data.enhanced) {
    const rarity = (e.searchableRarity ?? "").toLowerCase();
    const kind = String(e.subtype ?? "").toLowerCase();
    if (e.type === "ItemModification") {
      if (WEAPON_MODS.includes(kind)) add("weaponMods", e.name, `${kind} modification, ${rarity}`);
      else if (kind === "armor") add("armourMods", e.name, `armor modification, ${rarity}`);
      else add("gear", e.name, `${kind} modification, ${rarity}`);
    } else if (e.type === "Weapon") add(isChassis(e.name) ? "weaponMods" : "weapons", e.name, rarity);
    else if (e.type === "Armor" || e.type === "Shield") add(isChassis(e.name) ? "armourMods" : "armour", e.name, rarity);
    else if (e.type === "CyberneticAugmentation") add("cyber", e.name, `${kind}, ${rarity}`);
    else if (e.type === "DroidCustomization") add("droidMods", e.name, `${kind}, ${rarity}`);
    else if (["Consumable", "AdventuringGear", "Focus"].includes(e.type)) add("gear", e.name, `${e.type === "AdventuringGear" ? "gear" : e.type.toLowerCase()}, ${rarity}`);
  }
  for (const m of SHIP_MODS) add("shipMods", m.name, `${m.type.toLowerCase()} system, grade ${m.grade}`, `mod|${m.name}`);
  for (const r of data.shipRows) if (r.type !== "Ammunition" && r.cost > 0) add("shipMods", r.name, `${r.type.toLowerCase()}, ${cr(r.cost)}`, `equipment|${r.name}`);
  for (const e of data.enhancedShip) add("shipMods", e.name, `enhanced ${e.type.replace("Ship", "").toLowerCase()}, ${(e.searchableRarity ?? "").toLowerCase()}`, `enhanced|${e.name}`);
  for (const size of SHIP_SIZE_ORDER) {
    for (const role of shipRoleNames(size)) {
      const ship = data.shipRows.length ? roleShip(size, role, data.shipRows, "", "", getStarshipSize(size)?.stockCost ?? 0) : undefined;
      add("ships", `${size} ${role}`, ship ? `fitted, ${cr(ship.value)}` : "", `${size}|${role}`);
    }
  }
  for (const v of data.vehicles) add("speeders", v.name, `${cr(v.cost)}, ${v.mph} mph`);
  for (const d of data.droids) add("droids", d.name, `CR ${d.challengeRating ?? 0}`, d.id);
  for (const b of data.beasts) add("beasts", b.name, `CR ${b.challengeRating ?? 0}`, b.id);
  for (const c of TEST_CATEGORIES) if (c.id !== "ships") out[c.id].sort(byName);
  return out;
}

export function TestMenu({ areas, data, here, credits, level, dead, act }: { areas: TestArea[]; data: TestData; here: string; credits: number; level: number; dead: boolean; act: TestActions }) {
  const [category, setCategory] = useState<TestCategory>("weapons");
  const [item, setItem] = useState("");
  const [look, setLook] = useState("");
  const [find, setFind] = useState("");
  const [area, setArea] = useState("");
  const catalog = useMemo(() => catalogOf(data), [data.equipment, data.enhanced, data.shipRows, data.enhancedShip, data.vehicles, data.droids, data.beasts]);
  const list = catalog[category];
  const listed = list.filter((i) => !look.trim() || i.name.toLowerCase().includes(look.trim().toLowerCase()));
  const chosen = list.find((i) => i.id === item);
  const shown = areas.filter((a) => !find.trim() || a.label.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 300);
  const btn = "h-7 px-2 text-xs";
  const pick = (next: TestCategory) => {
    setCategory(next);
    setItem("");
    setLook("");
  };
  return (
    <div className="space-y-3 text-sm" data-testid="test-menu">
      <p className="rounded bg-fuchsia-900/50 p-2 text-xs text-fuchsia-100">Test copy: this menu is only in the test build, on its own database. Credits {credits.toLocaleString()}, level {level}.</p>

      <div className="space-y-1">
        <h3 className="font-semibold">Character</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className={btn} onClick={act.heal} data-testid="test-heal">Full health, points and dice</Button>
          {dead && <Button size="sm" variant="outline" className={btn} onClick={act.revive} data-testid="test-revive">Revive</Button>}
          <Button size="sm" variant="outline" className={btn} onClick={() => act.credits(10000)} data-testid="test-credits">+10,000 credits</Button>
          <Button size="sm" variant="outline" className={btn} onClick={() => act.credits(1000000)}>+1,000,000</Button>
          <Button size="sm" variant="outline" className={btn} disabled={level >= 20} onClick={act.nextLevel} data-testid="test-xp">XP for the next level</Button>
        </div>
        <p className="text-xs text-gray-400">After the XP, open the character sheet from the HUD's level-up link to choose what the level gives.</p>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Give items</h3>
        <div className="flex flex-wrap gap-1" data-testid="test-categories">
          {TEST_CATEGORIES.map((c) => (
            <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"} className={btn} onClick={() => pick(c.id)} data-testid={`test-category-${c.id}`}>{c.label}</Button>
          ))}
        </div>
        <input className="h-7 w-full rounded bg-gray-700 px-2 text-xs" value={look} placeholder={`Part of a name (${list.length} in ${TEST_CATEGORIES.find((c) => c.id === category)!.label})`} onChange={(e) => setLook(e.target.value)} data-testid="test-look" />
        <div className="flex gap-1">
          <select className="h-7 min-w-0 flex-1 rounded bg-gray-700 px-1 text-xs" value={item} disabled={!list.length} onChange={(e) => setItem(e.target.value)} data-testid="test-item">
            <option value="">{list.length ? `Choose one (${listed.length} shown)` : "Nothing in this list"}</option>
            {listed.map((i) => <option key={i.id} value={i.id}>{i.note ? `${i.name} (${i.note})` : i.name}</option>)}
          </select>
          <Button size="sm" variant="outline" className={btn} disabled={!chosen} onClick={() => chosen && act.give(category, chosen)} data-testid="test-give">Give</Button>
        </div>
        {category === "speederMods" && <p className="text-xs text-gray-400" data-testid="test-empty">The books list no speeder upgrades (the rules data has none), so there is nothing to give here.</p>}
        {category !== "speederMods" && !list.length && <p className="text-xs text-gray-400">The rules data is still loading.</p>}
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Time</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className={btn} onClick={() => act.clock(12 * 60)} data-testid="test-noon">Noon (shops open)</Button>
          <Button size="sm" variant="outline" className={btn} onClick={() => act.clock(22 * 60)}>22:00</Button>
          <Button size="sm" variant="outline" className={btn} onClick={() => act.clock("+hour")}>+1 hour</Button>
          <Button size="sm" variant="outline" className={btn} onClick={() => act.clock("+8hours")}>+8 hours</Button>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">Go to</h3>
        <input className="h-7 w-full rounded bg-gray-700 px-2 text-xs" value={find} placeholder="Part of a name (a shop, a street, a planet)" onChange={(e) => setFind(e.target.value)} data-testid="test-find" />
        <select className="w-full rounded bg-gray-700 p-1 text-xs" size={6} value={area} onChange={(e) => setArea(e.target.value)} data-testid="test-areas">
          {shown.map((a) => <option key={a.id} value={a.id}>{a.label}{a.id === here ? " (here)" : ""}</option>)}
        </select>
        <Button size="sm" variant="outline" className={btn} disabled={!area || area === here} onClick={() => act.teleport(area)} data-testid="test-go">Go there now</Button>
      </div>
    </div>
  );
}
