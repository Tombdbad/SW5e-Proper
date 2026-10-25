// /dev/dogfight: the dogfight on its own page, for looking at it in a browser without a campaign (as /dev/models does for the models).
// Query: scenario (skirmish, cruiser, carrier, battleship, dreadnought, station), size and role of the party's ship, tier, seed, owner (the
// Empire for the Imperial looks), view=cockpit to begin in the pilot's seat, noshield to take the shield off the ship (a deflector is lent).
// `window.__dogfight` (state(), input) lets a script move things, as the race's window.__race does.
import { useMemo, useState } from "react";
import { shipSheet } from "@shared/logic";
import { SCENARIOS, type ScenarioId, type StarshipRow } from "@shared/logic/dogfight";
import starshipEquipment from "@shared/data/sw5e/starshipEquipment.json";
import { MinigamePage, type Minigame } from "@/components/Map/FlightScene";

const rows = starshipEquipment as unknown as StarshipRow[];

// A party ship of a size and role with typical equipment, as the tests build one
function labShip(size: string, role: string, tier: number, shield = true) {
  const small = ["Tiny", "Small", "Medium"].includes(size);
  const mount = small ? "Small" : "Huge";
  const weapon = (cat: string, re: RegExp) => rows.find((r) => r.type === "Weapon" && r.weaponSize === mount && r.weaponCategory === cat && re.test(r.name))?.name;
  const equipment = [
    weapon("Primary", small ? /^Laser cannon$/ : /point-defense/),
    weapon("Primary", small ? /^Laser cannon$/ : /point-defense/),
    small ? undefined : weapon("Secondary", /turbolaser/),
    weapon("Tertiary", small ? /^Missile launcher$/ : /missile launcher/),
    weapon("Quaternary", /./),
    "Deflection armor",
    size === "Tiny" || !shield ? undefined : "Directional shield",
  ].filter(Boolean) as string[];
  return shipSheet({ name: "Lab Wing", size, role, tier, equipment }, rows, Math.max(2, tier + 1));
}

export default function DogfightLab() {
  const q = new URLSearchParams(window.location.search);
  const scenario = (SCENARIOS.find((s) => s.id === q.get("scenario"))?.id ?? "skirmish") as ScenarioId;
  const game = useMemo<Minigame>(
    () => ({
      kind: "dogfight",
      title: "Dogfight lab",
      seed: Number(q.get("seed") ?? 1),
      scenario,
      rows,
      ship: { sheet: labShip(q.get("size") ?? "Small", q.get("role") ?? "Attack Fighter", Number(q.get("tier") ?? 1), !q.has("noshield")), owner: q.get("owner") ?? "the party" },
      view: q.get("view") === "cockpit" ? "cockpit" : undefined,
    }),
    [scenario],
  );
  const [done, setDone] = useState<string | null>(null);
  return (
    <div data-testid="dogfight-lab">
      <MinigamePage game={game} onExit={() => setDone("left")} onDone={() => setDone("landed")} />
      {done && <div className="fixed left-2 top-2 z-[80] rounded bg-gray-900 p-2 text-sm text-white">{done}: reload to fly again</div>}
    </div>
  );
}
