// The test menu of a test copy (a god-mode style panel): built into the page only where the page was built with VITE_TEST_MENU=1
// (deploy/test-plain.sh), never into the build the game is played on. It sets things on the character and the campaign that the game
// itself would make you earn; every action goes through the page's own save paths, so what it does is what play would have done.
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface TestArea {
  id: string;
  label: string;
}
export interface TestActions {
  heal: () => void;
  credits: (amount: number) => void;
  nextLevel: () => void;
  give: (names: string[]) => void;
  teleport: (id: string) => void;
  clock: (minutesOfDay: number | "+hour" | "+8hours") => void;
  revive: () => void;
}

export function TestMenu({ areas, items, weapons, here, credits, level, dead, act }: { areas: TestArea[]; items: string[]; weapons: string[]; here: string; credits: number; level: number; dead: boolean; act: TestActions }) {
  const [item, setItem] = useState("");
  const [find, setFind] = useState("");
  const [area, setArea] = useState("");
  const shown = areas.filter((a) => !find.trim() || a.label.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 300);
  const btn = "h-7 px-2 text-xs";
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
        <div className="flex gap-1">
          <input list="test-items" className="h-7 flex-1 rounded bg-gray-700 px-2 text-xs" value={item} placeholder="An item's name" onChange={(e) => setItem(e.target.value)} data-testid="test-item" />
          <datalist id="test-items">{items.map((n) => <option key={n} value={n} />)}</datalist>
          <Button size="sm" variant="outline" className={btn} disabled={!items.includes(item)} onClick={() => { act.give([item]); setItem(""); }} data-testid="test-give">Give</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {["Blaster pistol", "Blaster rifle", "Blaster carbine", "Vibroblade", "Lightsaber", "Shortbow"].filter((n) => items.includes(n)).map((n) => (
            <Button key={n} size="sm" variant="outline" className={btn} onClick={() => act.give([n])}>{n}</Button>
          ))}
          <Button size="sm" variant="outline" className={btn} onClick={() => act.give(weapons)} data-testid="test-give-weapons">Every weapon ({weapons.length})</Button>
        </div>
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
