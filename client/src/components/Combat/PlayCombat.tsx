import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { useCombat, attackOdds, cannotAct, rollD20, LASTING } from "@/lib/stores/useCombat";
import { conditionSummary } from "@/lib/sw5e/rules";

const mod = (score?: number) => Math.floor(((score ?? 10) - 10) / 2);

export default function PlayCombat() {
  const { combatants, currentTurn, round, combatLog, endCombat, deathSaves, castPower, deathSave, pass } = useCombat();
  const current = combatants[currentTurn];

  const strike = (type: "melee" | "ranged") => {
    const s = useCombat.getState();
    const attacker = s.combatants[s.currentTurn];
    if (!attacker) return;
    const target = attacker.isPlayer
      ? s.combatants.find((c) => !c.isPlayer && c.hp > 0)
      : s.combatants.find((c) => c.isPlayer && c.hp > 0);
    if (!target) {
      // Nobody left standing to attack: a downed player is left for dead
      useCombat.getState().nextTurn();
      return;
    }
    // Conditions on either side: advantage or disadvantage, and a hit that is always critical
    const odds = attackOdds(attacker, target, type);
    if (odds.barred) {
      pass(`is ${odds.barred.toLowerCase()} and cannot attack ${target.name}`);
      return;
    }
    const roll = rollD20(odds.mode);
    // The player's bonus with the weapon in hand; unarmed, Strength and proficiency
    const bonus = attacker.isPlayer
      ? (type === "melee" ? attacker.meleeAttack : attacker.rangedAttack) ?? mod(attacker.abilities?.[type === "melee" ? "strength" : "dexterity"]) + (attacker.attackBonus ?? 2)
      : attacker.attackBonus ?? 3;
    // A natural 1 misses whatever the bonus
    const total = roll === 1 ? 0 : roll + bonus;
    const crit = roll === 20 || (odds.crit && total >= target.armorClass);
    const dmg = s.damageRoll(type, crit);
    s.attackRoll(target.id, total, dmg, crit, odds.mode ? `${odds.mode > 0 ? "advantage" : "disadvantage"}: ${odds.reasons.join(", ")}` : undefined);
    useCombat.getState().nextTurn();
  };

  // Enemies act by themselves after a short pause; defeated combatants are skipped.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      // The player acts by tapping, even when down (death saving throws)
      if (current.isPlayer) return;
      const held = cannotAct(current);
      if (current.hp <= 0) useCombat.getState().nextTurn();
      else if (held) pass(`is ${held.toLowerCase()} and cannot act`);
      else strike(current.rangedAttacker === false ? "melee" : "ranged");
    }, 800);
    return () => clearTimeout(t);
  }, [currentTurn, round, combatants.length, current?.id]);

  const player = combatants.find((c) => c.isPlayer);
  const held = player ? cannotAct(player) : undefined;
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !held;
  const down = !!player && player.hp <= 0;
  const cast = (index: number) => {
    castPower(index);
    if (useCombat.getState().inCombat) useCombat.getState().nextTurn();
  };
  const rollDeathSave = () => {
    deathSave();
    if (useCombat.getState().inCombat) useCombat.getState().nextTurn();
  };

  return (
    <div className="absolute left-2 top-2 z-20 w-80 max-h-[70vh] overflow-y-auto">
      <TranslucentPane className="p-4 text-white">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-yellow-400">Combat - Round {round}</h2>
          <Button size="sm" variant="outline" onClick={endCombat}>
            Leave
          </Button>
        </div>
        <ul className="space-y-1 mb-3">
          {combatants.map((c, i) => (
            <li key={String(c.id)} className={`text-sm ${i === currentTurn ? "text-yellow-300 font-semibold" : ""} ${c.hp <= 0 ? "opacity-50 line-through" : ""}`}>
              <div className="flex justify-between">
                <span>
                  {c.name}
                  {c.isPlayer ? " (you)" : ""}
                </span>
                <span>
                  {c.hp}/{c.maxHp}
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
        <div className="flex gap-2 mb-3">
          <Button disabled={!playerTurn} onClick={() => strike("melee")} title={player?.meleeWeapon ?? "Unarmed"}>
            Melee
          </Button>
          <Button disabled={!playerTurn || !player?.rangedDice} onClick={() => strike("ranged")} title={player?.rangedWeapon ?? "No ranged weapon"}>
            Ranged
          </Button>
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
        <div className="text-xs text-gray-400 mb-2">
          Melee: {player?.meleeWeapon ?? "unarmed"} · Ranged: {player?.rangedWeapon ?? "none"}
        </div>
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
        {!down && (player?.powers?.length ?? 0) > 0 && (
          <div className="mb-3" data-testid="combat-powers">
            <p className="text-xs text-gray-400 mb-1">Powers ({player?.powerPoints ?? 0} points left)</p>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {player!.powers!.map((power, index) => (
                <Button
                  key={power.name}
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal justify-start text-left"
                  disabled={!playerTurn || (player?.powerPoints ?? 0) < power.cost}
                  onClick={() => cast(index)}
                >
                  {power.name}
                  <span className="text-gray-400 ml-1">
                    ({power.cost ? `${power.cost} pts` : "at-will"}; {power.summary})
                  </span>
                </Button>
              ))}
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
