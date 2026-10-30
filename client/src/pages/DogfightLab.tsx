// /dev/dogfight: the dogfight on its own page, for looking at it in a browser without a campaign (as /dev/models does for the models).
// Query: scenario (skirmish, cruiser, carrier, battleship, dreadnought, station; in the air: defend, raid, escort, strike, with biome and g), size and role of the party's ship, tier, seed, owner (the
// Empire for the Imperial looks), view=cockpit to begin in the pilot's seat, noshield to take the shield off the ship (a deflector is lent).
// `window.__dogfight` (state(), input) lets a script move things, as the race's window.__race does.
// game=road (biome, seed, leg, with mate, block[=toll], wanted, chase) plays a leg of a road trip. game=race or game=chase (with biome, seed, vehicle) plays the speeder race or the chase on the road instead, to look at a world's course.
import { useMemo, useState } from "react";
import { shipSheet } from "@shared/logic";
import { SCENARIOS, scenarioOf, type ScenarioId, type StarshipRow } from "@shared/logic/dogfight";
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
  const course = q.get("game");
  const game = useMemo<Minigame>(
    () => course === "road" ? ({
      kind: "road", title: "Road lab", seed: Number(q.get("seed") ?? 1), vehicle: q.get("vehicle") ?? "Landspeeder", biome: q.get("biome") ?? "temperate", leg: { i: Number(q.get("leg") ?? 0), n: 3 }, intro: ["Road lab: open road to a last gate."],
      mate: q.has("mate") ? { name: "Mira", pace: 0.95 } : undefined,
      block: q.has("block") ? { by: q.get("block") === "toll" ? "toll" : "checkpoint", who: "an Imperial checkpoint", fee: 40, dc: 13, wanted: q.has("wanted"), model: "Speederbike" } : undefined,
      riders: q.has("chase") ? [{ name: "Raider A", model: "Swoop bike" }, { name: "Raider B", model: "Swoop bike" }] : undefined, who: "a swoop gang", talk: { persuasion: 3, deception: 1 }, credits: 200,
      // (`water`: a water craft's leg over open water, `look` its make: ?game=road&water&look=bongo&biome=ocean)
      ...(q.has("water") ? { water: true, look: q.get("look") ?? "bongo" } : {}),
    }) : course === "race" || course === "chase" ? (course === "race"
      ? { kind: "race", title: "Race lab", seed: Number(q.get("seed") ?? 1), vehicle: q.get("vehicle") ?? "Landspeeder", biome: q.get("biome") ?? "temperate" }
      : { kind: "chase", title: "Chase lab", seed: Number(q.get("seed") ?? 1), vehicle: q.get("vehicle") ?? "Landspeeder", biome: q.get("biome") ?? "temperate", riders: [{ name: "Raider", model: "Speeder bike" }, { name: "Raider", model: "Speeder bike" }], who: "a swoop gang" }) : ({
      kind: "dogfight",
      title: "Dogfight lab",
      seed: Number(q.get("seed") ?? 1),
      scenario,
      rows,
      ship: { sheet: labShip(q.get("size") ?? "Small", q.get("role") ?? "Attack Fighter", Number(q.get("tier") ?? 1), !q.has("noshield")), owner: q.get("owner") ?? "the party" },
      view: q.get("view") === "cockpit" ? "cockpit" : undefined,
      air: scenarioOf(scenario).air ? { biome: q.get("biome") ?? "temperate", g: Number(q.get("g") ?? 1), owner: q.get("owner") ?? undefined } : undefined,
      planet: q.get("biome") ?? undefined,
    }),
    [scenario, course],
  );
  const [done, setDone] = useState<string | null>(null);
  return (
    <div data-testid="dogfight-lab">
      <MinigamePage game={game} onExit={() => setDone("left")} onDone={() => setDone("landed")} />
      {done && <div className="fixed left-2 top-2 z-[80] rounded bg-gray-900 p-2 text-sm text-white">{done}: reload to fly again</div>}
    </div>
  );
}
