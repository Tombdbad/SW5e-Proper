import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  shipModNamed, shipModEffects, canInstall, crewModPlan, crewEquipmentPlan, slotsOf, tierUpgrade, partOffer, maxSuitesOf,
  type PartLine, type ShipPart, type ShipSheet, type PartyShip, type ShipModInstance,
} from "@shared/logic";

// Ship parts and the work on a ship (2026-10-21; the rules are in shared/logic/shipyard.ts): the parts counter of a scrapyard or a
// shipyard, and the ship's systems as seen from its deck, with the parts in its hold and the work the crew can do on them.

const money = (n: number) => `${n.toLocaleString("en-GB")} cr`;
const dayText = (d: number) => (d === 1 ? "1 day" : `${d} days`);

// What a part is, in a few words
export function partLabel(p: Pick<ShipPart, "kind" | "name" | "grade" | "type" | "rarity" | "size" | "salvaged">): string {
  if (p.kind === "mod") return `${p.type} modification, grade ${p.grade ?? 0}${p.size ? `, for a ${p.size} ship` : ""}${p.salvaged ? ", salvaged" : ""}`;
  if (p.kind === "equipment") return `${p.type}${p.size && p.type !== "Weapon" ? `, for a ${p.size} ship` : ""}${p.salvaged ? ", salvaged" : ""}`;
  return `${p.rarity} ${p.type?.replace(/^Ship/, "ship ").toLowerCase()}${p.salvaged ? ", salvaged" : ""}`;
}
export function partEffect(p: Pick<ShipPart, "kind" | "name">): string {
  if (p.kind !== "mod") return "";
  const row = shipModNamed(p.name);
  if (!row) return "";
  const fx = shipModEffects(row);
  return fx.applied.length ? fx.applied.join("; ") : "Shown only: the game does not apply this system's effect.";
}

// The parts a scrapyard's dealer or a shipyard's outfitter has today, and what they will pay for the party's
export function PartsCounter(props: {
  kind: "salvage" | "yard";
  lines: PartLine[];
  owned: ShipPart[];
  credits: number;
  disabled: boolean;
  size: string;
  shipHere?: string;
  installBlocked?: (line: PartLine) => string;
  onBuy: (line: PartLine, install: boolean) => void;
  onSell: (part: ShipPart, offer: number) => void;
}) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [shown, setShown] = useState<string | null>(null);
  const { kind, lines, owned, credits, disabled } = props;
  return (
    <div className="mt-2 border-t border-gray-600 pt-2 text-xs" data-testid={`parts-${kind}`}>
      <p>
        <span className="font-semibold text-amber-200">{kind === "salvage" ? "Salvaged ship parts" : "Ship parts and systems"}</span>
        <span className="text-gray-400"> · priced for a {props.size} ship{props.shipHere ? ` (${props.shipHere})` : ""}</span>
      </p>
      <div className="mt-1 flex gap-1">
        <Button size="sm" variant={tab === "buy" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTab("buy")}>Buy</Button>
        <Button size="sm" variant={tab === "sell" ? "default" : "outline"} className="h-6 px-2" onClick={() => setTab("sell")} data-testid="parts-sell-tab">Sell</Button>
      </div>
      <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto" data-testid={tab === "buy" ? "parts-stock" : "parts-offers"}>
        {tab === "buy" &&
          (lines.length ? lines.map((line, i) => {
            const blocked = props.installBlocked?.(line) ?? "";
            return (
              <li key={`${line.part.name}-${i}`} data-testid="parts-line">
                <div className="flex items-center gap-1">
                  <button className="flex-1 text-left" onClick={() => setShown(shown === line.part.name ? null : line.part.name)}>
                    {line.part.name} <span className="text-gray-400">{partLabel(line.part)}</span>
                  </button>
                  <Button size="sm" variant="outline" className="h-5 px-2" disabled={disabled || line.price > credits} onClick={() => props.onBuy(line, false)} data-testid="parts-buy">
                    Buy {money(line.price)}
                  </Button>
                  {line.installed !== undefined && (
                    <Button size="sm" variant="outline" className="h-5 px-2" disabled={disabled || line.installed > credits || !!blocked} title={blocked} onClick={() => props.onBuy(line, true)} data-testid="parts-buy-install">
                      Installed {money(line.installed)}, {dayText(line.days ?? 1)}
                    </Button>
                  )}
                </div>
                {shown === line.part.name && <p className="text-gray-400">{partEffect(line.part) || (line.part.kind === "enhanced" ? `+${line.part.bonus} while installed.` : "Replaces the part of its kind; a weapon needs a free hardpoint.")}{blocked ? ` ${blocked}` : ""}</p>}
              </li>
            );
          }) : <li className="text-gray-400">{kind === "salvage" ? "No ship parts here: scrapyards deal in them only by a port, away from the Core worlds or where the law hardly reaches." : "Nothing in the showroom today."}</li>)}
        {tab === "sell" &&
          (owned.length ? owned.map((part) => {
            const offer = partOffer(part, kind);
            return (
              <li key={part.id} className="flex items-center gap-1">
                <span className="flex-1">{part.name} <span className="text-gray-400">{partLabel(part)}</span></span>
                <Button size="sm" variant="outline" className="h-5 px-2" disabled={disabled} onClick={() => props.onSell(part, offer)} data-testid="parts-sell">Sell {money(offer)}</Button>
              </li>
            );
          }) : <li className="text-gray-400">You carry no ship parts.</li>)}
      </ul>
      <p className="mt-1 text-gray-500">
        House rules: {kind === "salvage" ? "salvaged parts sell at 60% of their material cost, grade 0 and 1 and premium at best; a scrapyard buys at 40%." : "a shipyard installs without a check (the book allows it), with twice the least workforce; it buys parts at 50%."} Prices of modifications and equipment are the book's (Starships of the Galaxy, chapters 4 and 5).
      </p>
    </div>
  );
}

export interface Worker {
  id: string;
  name: string;
}

// The ship's systems from its deck: tier, slots, modifications and enhanced parts, the parts in the hold, and the work the crew can do
export function ShipSystems(props: {
  ship: PartyShip;
  sheet: ShipSheet;
  parts: ShipPart[];
  workers: Worker[];
  hasKit: boolean;
  atPort: boolean;
  credits: number;
  disabled: boolean;
  minutesNow: number;
  shipRows: { name: string; type: string; cost: number }[];
  onCrewInstall: (part: ShipPart, workers: string[], weapon?: string, hands?: number) => void;
  onCrewTier: (workers: string[], hands?: number) => void;
  onRemove: (mod: ShipModInstance, index: number) => void;
}) {
  const { ship, sheet, parts, workers } = props;
  const [picked, setPicked] = useState<string[]>(() => workers.map((w) => w.id));
  const [weaponFor, setWeaponFor] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  // Skilled hands hired at a port to make up the workforce (Player's Handbook, Services: a skilled hireling 20 cr a day)
  const [hands, setHands] = useState(0);
  const crew = workers.filter((w) => picked.includes(w.id)).map((w) => w.id);
  const workforce = crew.length + (props.atPort ? hands : 0);
  const slots = slotsOf(ship);
  const suites = (ship.mods ?? []).filter((m) => shipModNamed(m.name)?.type === "Suite").length;
  const busy = ship.work && ship.work.ready > props.minutesNow ? ship.work : undefined;
  const weapons = sheet.weapons.map((w) => w.name);
  const nextTier = (ship.tier ?? 0) + 1;
  const tier = nextTier <= 5 ? tierUpgrade(ship.size, nextTier, workforce) : undefined;
  const fittedFor = (part: ShipPart) => (part.kind === "mod" || part.kind === "equipment") && part.size && part.size !== ship.size && part.type !== "Weapon";
  return (
    <div className="space-y-1" data-testid="ship-systems">
      <button className="font-semibold text-sky-200" onClick={() => setOpen((o) => !o)} data-testid="ship-systems-open">
        {open ? "▾" : "▸"} Systems: tier {ship.tier ?? 0}, {slots.used}/{slots.capacity} modification slots{parts.length ? `, ${parts.length} part${parts.length === 1 ? "" : "s"} in the hold` : ""}
      </button>
      {busy && <p className="text-amber-300" data-testid="ship-work">Work under way: {busy.what}; ready in {Math.ceil((busy.ready - props.minutesNow) / 60)} h. The ship cannot fly before then.</p>}
      {open && (
        <div className="space-y-2">
          <p className="text-gray-300">
            AC {sheet.ac}, damage reduction {sheet.reduction}, speed {sheet.speed} ft., turning {sheet.turning} ft.; Str {sheet.abilities.strength}, Dex {sheet.abilities.dexterity}, Con {sheet.abilities.constitution}.
            {sheet.hullResist?.length ? ` Hull resists ${sheet.hullResist.join(", ")}.` : ""}
            {sheet.shieldResist?.length ? ` Shields resist ${sheet.shieldResist.join(", ")}.` : ""}
            {` Suites ${suites}/${maxSuitesOf(ship.size, Math.floor((sheet.abilities.constitution - 10) / 2))}.`}
          </p>
          {(ship.mods ?? []).length > 0 && (
            <ul className="space-y-0.5" data-testid="ship-mods">
              {(ship.mods ?? []).map((m, i) => (
                <li key={`${m.name}-${i}`} className="flex items-start gap-1">
                  <span className="flex-1">{m.name}{m.weapon ? ` (on the ${m.weapon})` : ""} <span className="text-gray-400">{partEffect({ kind: "mod", name: m.name })}</span></span>
                  <Button size="sm" variant="outline" className="h-5 px-2" disabled={props.disabled || !!busy || !props.hasKit} title={props.hasKit ? "Half the time; the part goes to the hold" : "Needs a mechanic's kit"} onClick={() => props.onRemove(m, i)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          {(ship.enhanced?.armor || ship.enhanced?.shield || Object.keys(ship.enhanced?.weapons ?? {}).length > 0) && (
            <p className="text-gray-300">
              Enhanced: {[ship.enhanced?.armor && `${ship.enhanced.armor.name} (AC +${ship.enhanced.armor.bonus})`, ship.enhanced?.shield && `${ship.enhanced.shield.name} (Str, Dex, Con saves +${ship.enhanced.shield.bonus})`, ...Object.entries(ship.enhanced?.weapons ?? {}).map(([w, p]) => `${p.name} on the ${w} (+${p.bonus})`)].filter(Boolean).join("; ")}
            </p>
          )}
          <div className="space-y-0.5">
            <p className="font-semibold">Crew for the work {workers.length > 1 ? "(tick who works)" : ""}</p>
            <div className="flex flex-wrap gap-2">
              {workers.map((w) => (
                <label key={w.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={picked.includes(w.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, w.id] : p.filter((x) => x !== w.id)))} data-testid={`worker-${w.id}`} />
                  {w.name}
                </label>
              ))}
            </div>
            {props.atPort && (
              <label className="flex items-center gap-1">
                Hire skilled hands (20 cr a day each, the book's Services):
                <input type="number" min={0} max={20} value={hands} onChange={(e) => setHands(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className="w-12 rounded bg-gray-800 px-1" data-testid="hire-hands" />
              </label>
            )}
            {!props.hasKit && <p className="text-amber-300">Installing needs a mechanic's kit (an Intelligence (Mechanic's Kit) check by whoever leads the work).</p>}
            {!props.atPort && <p className="text-amber-300">Away from a port the work takes twice as long and the check is 5 harder (house rule; the book allows up to twice the time).</p>}
          </div>
          {parts.length > 0 && (
            <ul className="space-y-1" data-testid="ship-hold">
              {parts.map((part) => {
                const row = part.kind === "mod" ? shipModNamed(part.name) : undefined;
                const eq = part.kind === "equipment" ? props.shipRows.find((r) => r.name === part.name) : undefined;
                const needsWeapon = (row?.type === "Weapon" && !/^Hardpoint$/i.test(row.name) && !shipModEffects(row).weapon?.allPrimary) || (part.kind === "enhanced" && part.type === "ShipWeapon");
                const weapon = weaponFor[part.id] ?? weapons[0];
                const plan = row ? crewModPlan(ship, row, workforce, props.atPort) : eq ? crewEquipmentPlan(ship, eq, workforce, props.atPort) : { days: 0.5, dc: 10, workforce: 1, enough: workforce >= 1, reason: workforce ? "" : "Pick who works." };
                const wages = (props.atPort ? hands : 0) * 20 * Math.ceil(plan.days);
                const why = fittedFor(part) ? `Assembled for a ${part.size} ship, not this ${ship.size} one.` : row ? canInstall(ship, row, sheet.abilities as any, needsWeapon ? weapon : undefined) || plan.reason : plan.reason;
                return (
                  <li key={part.id} data-testid="hold-part">
                    <div className="flex items-center gap-1">
                      <span className="flex-1">{part.name} <span className="text-gray-400">{partLabel(part)}</span></span>
                      {needsWeapon && weapons.length > 0 && (
                        <select className="bg-gray-800 text-xs" value={weapon} onChange={(e) => setWeaponFor((m) => ({ ...m, [part.id]: e.target.value }))}>
                          {weapons.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      )}
                      <Button size="sm" variant="outline" className="h-5 px-2" disabled={props.disabled || !!busy || !props.hasKit || !!why || (needsWeapon && !weapons.length) || wages > props.credits} title={why} onClick={() => props.onCrewInstall(part, crew, needsWeapon ? weapon : undefined, props.atPort ? hands : 0)} data-testid="hold-install">
                        Install ({dayText(plan.days)}, DC {plan.dc}{wages ? `, ${money(wages)} wages` : ""})
                      </Button>
                    </div>
                    {why && <p className="text-gray-400">{why}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {tier && (
            <div className="flex items-center gap-1" data-testid="ship-tier">
              <span className="flex-1">Tier {nextTier}: {money(tier.own)} of materials with your own workforce ({tier.workforce} at least), {dayText(tier.days)}; no check (the book's cost halved).</span>
              <Button size="sm" variant="outline" className="h-5 px-2" disabled={props.disabled || !!busy || !props.atPort || workforce < tier.workforce || tier.own + hands * 20 * Math.ceil(tier.days) > props.credits || (ship.hull !== undefined && ship.hull < sheet.hullMax)} title={!props.atPort ? "Only docked at a port" : ship.hull !== undefined && ship.hull < sheet.hullMax ? "Mend the hull first" : ""} onClick={() => props.onCrewTier(crew, hands)} data-testid="ship-tier-up">
                Upgrade
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
