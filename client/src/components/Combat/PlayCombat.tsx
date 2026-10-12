import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { useCombat } from "@/lib/stores/useCombat";

const d20 = () => Math.floor(Math.random() * 20) + 1;
const mod = (score?: number) => Math.floor(((score ?? 10) - 10) / 2);

export default function PlayCombat() {
  const { combatants, currentTurn, round, combatLog, endCombat } = useCombat();
  const current = combatants[currentTurn];

  const strike = (type: "melee" | "ranged") => {
    const s = useCombat.getState();
    const attacker = s.combatants[s.currentTurn];
    if (!attacker) return;
    const target = attacker.isPlayer
      ? s.combatants.find((c) => !c.isPlayer && c.hp > 0)
      : s.combatants.find((c) => c.isPlayer && c.hp > 0);
    if (!target) return;
    const roll = d20();
    const crit = roll === 20;
    const bonus = attacker.isPlayer
      ? mod(attacker.abilities?.[type === "melee" ? "strength" : "dexterity"]) + 2
      : attacker.attackBonus ?? 3;
    const dmg = s.damageRoll(type, crit);
    s.attackRoll(target.id, roll + bonus, dmg, crit);
    useCombat.getState().nextTurn();
  };

  // Enemies act by themselves after a short pause; defeated combatants are skipped.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      if (current.hp <= 0) useCombat.getState().nextTurn();
      else if (!current.isPlayer) strike("ranged");
    }, 800);
    return () => clearTimeout(t);
  }, [currentTurn, round, combatants.length, current?.id]);

  const player = combatants.find((c) => c.isPlayer);
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0;

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
            <li
              key={String(c.id)}
              className={`flex justify-between text-sm ${i === currentTurn ? "text-yellow-300 font-semibold" : ""} ${c.hp <= 0 ? "opacity-50 line-through" : ""}`}
            >
              <span>
                {c.name}
                {c.isPlayer ? " (you)" : ""}
              </span>
              <span>
                {c.hp}/{c.maxHp}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mb-3">
          <Button disabled={!playerTurn} onClick={() => strike("melee")}>
            Melee
          </Button>
          <Button disabled={!playerTurn} onClick={() => strike("ranged")}>
            Ranged
          </Button>
        </div>
        <div className="text-xs text-gray-300 space-y-1 max-h-32 overflow-y-auto">
          {combatLog.slice(-6).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </TranslucentPane>
    </div>
  );
}
