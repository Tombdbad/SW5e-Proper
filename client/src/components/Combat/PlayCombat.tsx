import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { useCombat, attackPlan, cannotAct, rollD20, movementLeft, pickTarget, powerOutOfRange, squaresApart, onPartySide, rollDamage, LASTING } from "@/lib/stores/useCombat";
import { conditionSummary } from "@/lib/sw5e/rules";

const mod = (score?: number) => Math.floor(((score ?? 10) - 10) / 2);
const dieRoll = (sides: number) => Math.floor(Math.random() * sides) + 1;

// What the character can use in a fight, made by the Play page from what is carried: `target` says
// who it is used on (an ally or the character, an enemy, nobody), `use` does it and says whether it was used
export interface CombatItemOption {
  key: string;
  label: string;
  hint?: string;
  target: "ally" | "foe" | "none";
  use: (targetId?: number | string) => boolean;
}

export default function PlayCombat({ items = [] }: { items?: CombatItemOption[] }) {
  const { combatants, currentTurn, round, combatLog, endCombat, deathSaves, castPower, deathSave, pass, arena, targetId, setTarget } = useCombat();
  const current = combatants[currentTurn];

  // An attack from where the attacker stands, with whatever weapon suits the kind of attack
  const strike = (type: "melee" | "ranged") => {
    const s = useCombat.getState();
    const attacker = s.combatants[s.currentTurn];
    const target = attacker && pickTarget(s.combatants, attacker, attacker.isPlayer ? s.targetId : null);
    if (!attacker || !target) {
      // Nobody left standing to attack: a downed player is left for dead
      useCombat.getState().nextTurn();
      return;
    }
    // Reach, range, cover and conditions: whether the attack can be made, and how the die is rolled
    const plan = attackPlan(s.arena, s.combatants, attacker, target, type);
    if (plan.barred) {
      pass(`is ${plan.barred.toLowerCase()} and cannot attack ${target.name}`);
      return;
    }
    if (!plan.possible) {
      pass(`cannot attack: ${plan.why}`);
      return;
    }
    const roll = rollD20(plan.mode);
    // The player's bonus with the weapon in hand; unarmed, Strength and proficiency
    let bonus = attacker.isPlayer
      ? (type === "melee" ? attacker.meleeAttack : attacker.rangedAttack) ?? mod(attacker.abilities?.[type === "melee" ? "strength" : "dexterity"]) + (attacker.attackBonus ?? 2)
      : attacker.attackBonus ?? 3;
    const extras: string[] = [];
    // A substance's extra d3 on attacks made with its ability
    if (attacker.high && attacker.high.ability === (type === "melee" ? "strength" : "dexterity")) {
      const d3 = dieRoll(3) * (attacker.high.low ? -1 : 1);
      bonus += d3;
      extras.push(`${d3 > 0 ? "+" : ""}${d3} ${attacker.high.low ? "low" : "high"}`);
    }
    // A tool's prepared die, once, on an attack
    if (attacker.isPlayer && attacker.boons?.attack && !s.spent.includes("attack")) {
      const d = dieRoll(attacker.boons.attack);
      bonus += d;
      extras.push(`+${d} prepared`);
      s.spend("attack");
    }
    // A natural 1 misses whatever the bonus; cover adds to the target's Armor Class, and so does a
    // prepared die of armor work, once, against one attack
    let guard = 0;
    if (target.isPlayer && target.boons?.ac && !s.spent.includes("ac")) {
      guard = dieRoll(target.boons.ac);
      extras.push(`armor work +${guard} AC`);
      s.spend("ac");
    }
    const total = roll === 1 ? 0 : roll + bonus - plan.cover.bonus - guard;
    const crit = roll === 20 || (plan.crit && total >= target.armorClass);
    let dmg = s.damageRoll(type, crit);
    const hit = roll !== 1 && (total >= target.armorClass || crit);
    if (hit && attacker.isPlayer) {
      if (attacker.boons?.damage && !s.spent.includes("damage")) {
        const d = dieRoll(attacker.boons.damage);
        dmg += d;
        extras.push(`+${d} prepared damage`);
        s.spend("damage");
      }
      if (attacker.boons?.damageFlat && !s.spent.includes("damage")) {
        dmg += attacker.boons.damageFlat;
        extras.push(`+${attacker.boons.damageFlat} honed`);
        s.spend("damage");
      }
      const poison = attacker.boons?.poison;
      if (poison && !s.spent.includes("poison")) {
        // A dose of poison on the weapon: Constitution save against its DC, half on a save
        const full = rollDamage(poison.dice, false);
        const saved = rollD20(0) + (target.saves?.constitution ?? 0) >= poison.dc;
        const taken = saved ? Math.floor(full / 2) : full;
        dmg += taken;
        extras.push(`poison ${taken}${saved ? " (saved)" : ""}`);
        s.spend("poison");
      }
    }
    const notes = [plan.mode ? `${plan.mode > 0 ? "advantage" : "disadvantage"}: ${plan.reasons.join(", ")}` : "", plan.cover.name, extras.join(", "), `${plan.feet} ft.`].filter(Boolean).join("; ");
    s.attackRoll(target.id, total, dmg, crit, notes);
    useCombat.getState().nextTurn();
  };

  // Close with the target as far as movement allows, then attack if it is in reach
  const charge = (reachFeet: number, type: "melee" | "ranged") => {
    const s = useCombat.getState();
    const attacker = s.combatants[s.currentTurn];
    const target = attacker && pickTarget(s.combatants, attacker, attacker.isPlayer ? s.targetId : null);
    if (!attacker || !target) return strike(type);
    if (s.approach(target.id, reachFeet)) strike(type);
    else pass(`closes in on ${target.name} but cannot reach this turn`);
  };

  // Enemies act by themselves after a short pause; defeated combatants are skipped. One that
  // fights hand to hand closes in; one that shoots holds its ground unless out of range.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      // The player acts by tapping, even when down (death saving throws)
      if (current.isPlayer) return;
      const held = cannotAct(current);
      if (current.hp <= 0) useCombat.getState().nextTurn();
      else if (held) pass(`is ${held.toLowerCase()} and cannot act`);
      else if (useCombat.getState().surprise && useCombat.getState().round === 1) pass("is surprised and cannot act");
      else if (current.rangedAttacker === false) charge(current.reach ?? 5, "melee");
      else charge(current.range?.[0] ?? 80, "ranged");
    }, 800);
    return () => clearTimeout(t);
  }, [currentTurn, round, combatants.length, current?.id]);

  const player = combatants.find((c) => c.isPlayer);
  const held = player ? cannotAct(player) : undefined;
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !held;
  const down = !!player && player.hp <= 0;
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const ranged = player && target && player.rangedDice ? attackPlan(arena, combatants, player, target, "ranged") : undefined;
  const melee = player && target ? attackPlan(arena, combatants, player, target, "melee") : undefined;
  const cast = (index: number) => {
    castPower(index);
    if (useCombat.getState().inCombat) useCombat.getState().nextTurn();
  };
  const rollDeathSave = () => {
    deathSave();
    if (useCombat.getState().inCombat) useCombat.getState().nextTurn();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 h-[54dvh] overflow-y-auto bg-gray-900 md:inset-x-auto md:bottom-auto md:left-2 md:top-2 md:h-auto md:w-80 md:max-h-[82vh] md:bg-transparent">
      <TranslucentPane className="p-3 text-white">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-yellow-400">Combat - Round {round}</h2>
          <Button size="sm" variant="outline" onClick={endCombat}>
            Leave
          </Button>
        </div>
        <ul className="space-y-1 mb-2">
          {combatants.map((c, i) => (
            <li key={String(c.id)} className={`text-sm ${i === currentTurn ? "text-yellow-300 font-semibold" : ""} ${c.hp <= 0 ? "opacity-50 line-through" : ""}`} onClick={() => !onPartySide(c) && c.hp > 0 && setTarget(c.id)}>
              <div className="flex justify-between">
                <span>
                  {target?.id === c.id && c.hp > 0 ? "◎ " : ""}
                  {c.name}
                  {c.isPlayer ? " (you)" : c.ally ? " (ally)" : ""}
                </span>
                <span>
                  {c.hp}/{c.maxHp}{c.tempHp ? ` +${c.tempHp}` : ""}
                </span>
              </div>
              {c.hp > 0 && (c.conditions?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 font-normal" data-testid="combat-conditions">
                  {c.conditions!.map((condition) => (
                    <span key={condition.name} className="rounded bg-purple-900/60 px-1 text-xs text-purple-100" title={conditionSummary(condition.name)}>
                      {condition.name}
                      {condition.rounds < LASTING ? ` ${condition.rounds}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {player && target && !down && (
          <p className="text-xs text-gray-300 mb-2" data-testid="combat-target">
            Target: {target.name}, {squaresApart(player, target) * 5} ft.
            {ranged?.cover.bonus ? `, ${ranged.cover.name} (+${ranged.cover.bonus} AC)` : ""}
            {ranged && !ranged.possible ? ", out of range" : ranged?.reasons.length ? `, ${ranged.mode < 0 ? "disadvantage" : ranged.mode > 0 ? "advantage" : "straight roll"} at range (${ranged.reasons.join(", ")})` : ""}
            . Movement left: {movementLeft(player)} ft.
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-2">
          <Button disabled={!playerTurn} onClick={() => charge(player?.reach ?? 5, "melee")} title={player?.meleeWeapon ?? "Unarmed"}>
            Melee
          </Button>
          <Button disabled={!playerTurn || !player?.rangedDice || !ranged?.possible} onClick={() => strike("ranged")} title={player?.rangedWeapon ?? "No ranged weapon"}>
            Ranged
          </Button>
          <Button variant="outline" disabled={!playerTurn} onClick={() => pass("holds")}>
            End turn
          </Button>
        </div>
        <div className="text-xs text-gray-400 mb-2">
          Melee: {player?.meleeWeapon ?? "unarmed"} ({player?.reach ?? 5} ft.{melee && !melee.possible ? "; Melee closes in first" : ""}) · Ranged: {player?.rangedWeapon ? `${player.rangedWeapon} (${player.range?.join("/") ?? "80/320"} ft.)` : "none"}.
          On the map, tap a green square to move and an enemy to pick it out; an attack or power ends the turn.
        </div>
        {held && current?.isPlayer && !down && (
          <div className="mb-3 p-2 rounded bg-purple-900/40 text-sm" data-testid="combat-held">
            <p>You are {held.toLowerCase()} and cannot act.</p>
            <Button size="sm" className="mt-1" onClick={() => pass(`is ${held.toLowerCase()} and cannot act`)}>
              Pass the turn
            </Button>
          </div>
        )}
        {(() => {
          // What the conditions in force do, in plain words
          const inForce = Array.from(new Set(combatants.filter((c) => c.hp > 0).flatMap((c) => (c.conditions ?? []).map((x) => x.name))));
          return inForce.length ? (
            <div className="text-xs text-purple-200 mb-2" data-testid="condition-notes">
              {inForce.map((name) => (
                <div key={name}>
                  {name}: {conditionSummary(name)}
                </div>
              ))}
            </div>
          ) : null;
        })()}
        {down && (
          <div className="mb-3 p-2 rounded bg-red-900/40 text-sm" data-testid="death-saves">
            <p>
              You are down. Successes {deathSaves.successes}/3, failures {Math.min(3, deathSaves.failures)}/3.
            </p>
            <Button size="sm" className="mt-1" disabled={!current?.isPlayer} onClick={rollDeathSave}>
              Death saving throw
            </Button>
          </div>
        )}
        {!down && items.length > 0 && <ItemList items={items} disabled={!playerTurn} />}
        {!down && (player?.powers?.length ?? 0) > 0 && (
          <div className="mb-3" data-testid="combat-powers">
            <p className="text-xs text-gray-400 mb-1">Powers ({player?.powerPoints ?? 0} points left)</p>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {player!.powers!.map((power, index) => {
                const far = powerOutOfRange(combatants, player!, power, targetId);
                return (
                  <Button
                    key={power.name}
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal justify-start text-left"
                    disabled={!playerTurn || (player?.powerPoints ?? 0) < power.cost || far}
                    onClick={() => cast(index)}
                  >
                    {power.name}
                    <span className="text-gray-400 ml-1">
                      ({power.cost ? `${power.cost} pts` : "at-will"}; {power.range === 0 ? "self; " : power.range === 5 ? "touch; " : power.range ? `${power.range} ft.; ` : ""}{far ? "out of range; " : ""}{power.summary})
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <div className="text-xs text-gray-300 space-y-1 max-h-32 overflow-y-auto">
          {combatLog.slice(-6).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </TranslucentPane>
    </div>
  );
}

// The items the character can use now. An item used on a friend asks whom; one thrown goes at the
// enemy picked out. Using one takes the turn.
function ItemList({ items, disabled }: { items: CombatItemOption[]; disabled: boolean }) {
  const { combatants, targetId } = useCombat();
  const [who, setWho] = useState<Record<string, string>>({});
  const friends = combatants.filter((c) => onPartySide(c));
  const player = combatants.find((c) => c.isPlayer);
  const run = (item: CombatItemOption) => {
    const state = useCombat.getState();
    const foe = player ? pickTarget(state.combatants, player, state.targetId) : undefined;
    const target = item.target === "ally" ? who[item.key] ?? String(player?.id) : item.target === "foe" ? foe?.id : undefined;
    const friend = item.target === "ally" ? state.combatants.find((c) => String(c.id) === String(target)) : undefined;
    if (item.use(friend ? friend.id : target)) useCombat.getState().nextTurn();
  };
  return (
    <div className="mb-3" data-testid="combat-items">
      <p className="text-xs text-gray-400 mb-1">Items (using one takes the turn)</p>
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-auto flex-1 whitespace-normal justify-start text-left" disabled={disabled} onClick={() => run(item)} data-testid={`combat-item-${item.key}`}>
              {item.label}
              {item.hint && <span className="text-gray-400 ml-1">({item.hint})</span>}
            </Button>
            {item.target === "ally" && friends.length > 1 && (
              <select
                className="h-8 rounded bg-gray-700 px-1 text-xs"
                value={who[item.key] ?? String(player?.id)}
                onChange={(e) => setWho({ ...who, [item.key]: e.target.value })}
                aria-label={`Use ${item.label} on`}
              >
                {friends.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>{c.isPlayer ? "you" : c.name}{c.hp <= 0 ? " (down)" : ""}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">{targetId ? "Thrown at the enemy picked out." : "Thrown at the nearest enemy."}</p>
    </div>
  );
}
