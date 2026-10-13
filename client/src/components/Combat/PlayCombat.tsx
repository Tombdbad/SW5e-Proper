import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import { useCombat, attackPlan, cannotAct, rollD20, movementLeft, reachable, pickTarget, powerOutOfRange, squaresApart, LASTING, type Combatant } from "@/lib/stores/useCombat";
import { conditionSummary } from "@/lib/sw5e/rules";
import { RoomFloor } from "@/components/Map/RoomPlan";
import { TokenArt, floorOf, tokenOf, SIDE_COLORS } from "@/components/Map/sprites";

const mod = (score?: number) => Math.floor(((score ?? 10) - 10) / 2);

export default function PlayCombat() {
  const { combatants, currentTurn, round, combatLog, endCombat, deathSaves, castPower, deathSave, pass, arena, targetId, moveTo, setTarget } = useCombat();
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
    const bonus = attacker.isPlayer
      ? (type === "melee" ? attacker.meleeAttack : attacker.rangedAttack) ?? mod(attacker.abilities?.[type === "melee" ? "strength" : "dexterity"]) + (attacker.attackBonus ?? 2)
      : attacker.attackBonus ?? 3;
    // A natural 1 misses whatever the bonus; cover adds to the target's Armor Class
    const total = roll === 1 ? 0 : roll + bonus - plan.cover.bonus;
    const crit = roll === 20 || (plan.crit && total >= target.armorClass);
    const dmg = s.damageRoll(type, crit);
    const notes = [plan.mode ? `${plan.mode > 0 ? "advantage" : "disadvantage"}: ${plan.reasons.join(", ")}` : "", plan.cover.name, `${plan.feet} ft.`].filter(Boolean).join("; ");
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
  const steps = playerTurn && player ? reachable(arena, combatants, player) : new Map<string, { cost: number }>();
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

  const s = 26;
  const tapSquare = (x: number, y: number) => {
    const there = combatants.find((c) => c.hp > 0 && c.x === x && c.y === y);
    if (there && !there.isPlayer) setTarget(there.id);
    else if (playerTurn && steps.get(`${x},${y}`)?.cost) moveTo(x, y);
  };
  const token = (c: Combatant) => (
    <g key={String(c.id)} transform={`translate(${(c.x ?? 0) * s + s / 2} ${(c.y ?? 0) * s + s / 2})`} data-testid={c.isPlayer ? "token-player" : "token-enemy"} style={{ transition: "transform 0.25s" }}>
      {combatants[currentTurn]?.id === c.id && <circle r={s * 0.56} fill="none" stroke="#fde047" strokeWidth={1.5} strokeDasharray="3 3" />}
      <TokenArt
        kind={tokenOf({ name: c.name, role: c.role, creature: c.creature, isPlayer: c.isPlayer, forceUser: c.role === "force" })}
        d={s * 0.9}
        ring={c.isPlayer ? SIDE_COLORS.player : SIDE_COLORS.hostile}
        label={c.name}
        dim={c.hp <= 0}
        large={/large|huge|gargantuan/i.test(c.size ?? "")}
      />
      {target?.id === c.id && c.hp > 0 && <path d={`M${-s * 0.5} ${-s * 0.3}V${-s * 0.5}H${-s * 0.3}M${s * 0.3} ${-s * 0.5}H${s * 0.5}V${-s * 0.3}M${s * 0.5} ${s * 0.3}V${s * 0.5}H${s * 0.3}M${-s * 0.3} ${s * 0.5}H${-s * 0.5}V${s * 0.3}`} stroke="#f87171" strokeWidth={2} fill="none" />}
      {c.hp > 0 && (
        <g transform={`translate(${-s * 0.4} ${s * 0.4})`}>
          <rect width={s * 0.8} height={3} fill="#111" />
          <rect width={s * 0.8 * Math.max(0, Math.min(1, c.hp / c.maxHp))} height={3} fill={c.isPlayer ? "#4ade80" : "#f87171"} />
        </g>
      )}
      <title>{`${c.name} ${c.hp}/${c.maxHp}`}</title>
    </g>
  );

  return (
    <div className="absolute left-2 top-2 z-20 w-80 max-w-[calc(100vw-1rem)] max-h-[82vh] overflow-y-auto">
      <TranslucentPane className="p-3 text-white">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-yellow-400">Combat - Round {round}</h2>
          <Button size="sm" variant="outline" onClick={endCombat}>
            Leave
          </Button>
        </div>
        <svg viewBox={`-4 -4 ${arena.width * s + 8} ${arena.height * s + 8}`} className="w-full mb-2 rounded" data-testid="combat-grid">
          <RoomFloor width={arena.width} height={arena.height} assets={arena.assets.filter((a) => a.kind !== "npc")} s={s} floor={floorOf(arena.floor)}>
            {/* Where the player can walk this turn; a tap moves there, a tap on an enemy picks it out */}
            {Array.from(steps.entries()).filter(([, step]) => step.cost > 0).map(([k]) => {
              const [x, y] = k.split(",").map(Number);
              return <rect key={k} x={x * s + 1} y={y * s + 1} width={s - 2} height={s - 2} fill="#4ade80" fillOpacity={0.16} stroke="#4ade80" strokeOpacity={0.35} strokeWidth={0.6} />;
            })}
            {player && target && target.hp > 0 && (
              <line x1={(player.x ?? 0) * s + s / 2} y1={(player.y ?? 0) * s + s / 2} x2={(target.x ?? 0) * s + s / 2} y2={(target.y ?? 0) * s + s / 2} stroke={ranged?.cover.bonus ? "#fbbf24" : "#f87171"} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" />
            )}
            {[...combatants].sort((a, b) => Number(a.hp > 0) - Number(b.hp > 0)).map(token)}
            {Array.from({ length: arena.width * arena.height }, (_, i) => {
              const x = i % arena.width;
              const y = Math.floor(i / arena.width);
              return <rect key={i} x={x * s} y={y * s} width={s} height={s} fill="transparent" onClick={() => tapSquare(x, y)} data-square={`${x},${y}`} />;
            })}
          </RoomFloor>
        </svg>
        <ul className="space-y-1 mb-2">
          {combatants.map((c, i) => (
            <li key={String(c.id)} className={`text-sm ${i === currentTurn ? "text-yellow-300 font-semibold" : ""} ${c.hp <= 0 ? "opacity-50 line-through" : ""}`} onClick={() => !c.isPlayer && c.hp > 0 && setTarget(c.id)}>
              <div className="flex justify-between">
                <span>
                  {target?.id === c.id && c.hp > 0 ? "◎ " : ""}
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
          Tap a green square to move, an enemy to pick it out; an attack or power ends the turn.
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
