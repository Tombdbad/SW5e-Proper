import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import TranslucentPane from "@/components/ui/TranslucentPane";
import {
  useCombat, attackPlan, cannotAct, movementLeft, pickTarget, powerOutOfRange, squaresApart, onPartySide, LASTING,
  playerSpec, bonusAttackKinds, bonusFeatures, attacksPerAction, objectReach, squaresToAsset, reloadPlan, propertyNumber, drawPlan,
} from "@/lib/stores/useCombat";
import { conditionSummary, motionFeet } from "@/lib/sw5e/rules";

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
  const {
    combatants, currentTurn, round, combatLog, endCombat, deathSaves, castPower, deathSave, pass, arena, targetId, setTarget,
    pending, resolvePending, attack, standard, useFeature, setEmpower, setManeuver, autoEnd, setAutoEnd, aiStep, nextTurn,
    objectId, setObject, reload, spray, brace, draw, stow, detonate, mines,
  } = useCombat();
  // A power that moves things waiting to be told what to move and which way
  const [aiming, setAiming] = useState<number | null>(null);
  const current = combatants[currentTurn];
  // For the play-through test (as `window.__map3d` is for the map): the fight's state
  useEffect(() => {
    (window as any).__fight = useCombat;
  }, []);

  // Close with the target as far as movement allows, then strike if it is in reach
  const melee = () => {
    const s = useCombat.getState();
    const me = s.combatants[s.currentTurn];
    if (!me?.isPlayer) return;
    const spec = playerSpec(me, "melee")!;
    const foe = pickTarget(s.combatants, me, s.targetId);
    if (!foe) {
      // Nobody left standing to attack: a downed player is left for dead
      s.nextTurn();
      return;
    }
    if (squaresApart(me, foe) * 5 > spec.reach && !s.approach(foe.id, spec.reach)) {
      const after = useCombat.getState();
      if (after.pending) return;
      pass(`closes in on ${foe.name} but cannot reach this turn`);
      return;
    }
    if (useCombat.getState().inCombat) useCombat.getState().attack("melee");
  };

  // Computer-run creatures (enemies, companions) act by themselves, a step at a time, after a short
  // pause; a reaction offered to the character holds them until it is answered
  useEffect(() => {
    if (!current || current.isPlayer || pending) return;
    const t = setTimeout(() => aiStep(), 700);
    return () => clearTimeout(t);
  }, [currentTurn, round, combatants.length, current?.id, pending, combatLog.length]);

  const player = combatants.find((c) => c.isPlayer);
  const held = player ? cannotAct(player) : undefined;
  const playerTurn = !!current?.isPlayer && (player?.hp ?? 0) > 0 && !held && !pending;
  const down = !!player && player.hp <= 0;
  const target = player ? pickTarget(combatants, player, targetId) : undefined;
  const rangedSpec = player ? playerSpec(player, "ranged") : undefined;
  const meleeSpec = player ? playerSpec(player, "melee") : undefined;
  const ranged = player && target && rangedSpec ? attackPlan(arena, combatants, player, target, "ranged", { range: rangedSpec.range, props: rangedSpec.properties }) : undefined;
  // The ranged weapon's load: shots left (a bow: the rounds carried), the round in it, and what can be loaded
  const ammo = player?.ammo;
  const loadedNow = ammo ? (ammo.max > 0 ? ammo.left : ammo.reserves[ammo.round ?? ammo.plain] ?? 0) : 0;
  const burstN = rangedSpec ? propertyNumber(rangedSpec.properties, "burst") : 0;
  const rapidN = rangedSpec ? propertyNumber(rangedSpec.properties, "rapid") : 0;
  const meleePlan = player && target && meleeSpec ? attackPlan(arena, combatants, player, target, "melee", { reach: meleeSpec.reach }) : undefined;
  const hasAction = (player?.actions ?? 0) > 0 || (player?.attacksLeft ?? 0) > 0;
  const perAction = player ? attacksPerAction(player) : 1;
  const midAttack = (player?.attacksLeft ?? 0) > 0;
  const bonusAttacks = player ? bonusAttackKinds(player) : [];
  const bonusUses = player ? bonusFeatures(player) : [];
  const bonusStandard = (player?.features ?? []).filter((f) => f.actions?.length && (player?.bonus ?? 0) > 0).flatMap((f) => f.actions!.map((a) => ({ a: a.toLowerCase() as "dash" | "disengage" | "hide" | "dodge" | "help", from: f.name })));
  const friends = combatants.filter((c) => onPartySide(c) && !c.isPlayer && c.hp > 0);
  const cast = (index: number) => castPower(index);
  const rollDeathSave = () => {
    deathSave();
    if (useCombat.getState().inCombat) useCombat.getState().nextTurn();
  };
  // Features that are used by choice (not a reaction offered when a hit lands, not always on)
  const chosen = (player?.features ?? []).filter((f) => f.activation !== "passive" || f.uses);
  const usesLeft = (key: string) => {
    const f = chosen.find((x) => x.key === key);
    return f?.uses ? f.uses.max - (player?.uses?.[f.pool] ?? 0) : null;
  };
  const maneuvers = (player?.features ?? []).filter((f) => f.maneuver && f.maneuver.timing !== "use");
  // What the character chooses to do with an action or no action at all: not what happens by itself
  // on a hit or as a reaction, a stance (a bonus action), a maneuver picked for the attack
  const usedNow = (f: (typeof chosen)[number]) =>
    (f.activation === "action" || f.activation === "free") && !f.bonusAttack && !f.stance && !(f.maneuver && f.maneuver.timing !== "use") && !f.marks && !f.extraDamage && !f.acDie && !f.reduce && !f.acBonus;
  const empowerFeature = (player?.features ?? []).find((f) => f.extraDamage?.perPoint);
  const empowerMax = empowerFeature ? Math.min(empowerFeature.extraDamage!.maxDice ?? 9, player?.powerPoints ?? 0) : 0;
  const attacker = pending ? combatants.find((c) => c.id === pending.attackerId) : undefined;

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
                  {c.isPlayer ? " (you)" : c.ally ? " (ally)" : c.fled ? " (ran)" : c.leader ? " (leader)" : ""}
                </span>
                <span>
                  {c.hp}/{c.maxHp}{c.tempHp ? ` +${c.tempHp}` : ""}
                </span>
              </div>
              {c.hp > 0 && ((c.conditions?.length ?? 0) > 0 || c.stance || c.dodging || c.hidden || c.reckless || c.guarding !== undefined) && (
                <div className="flex flex-wrap gap-1 font-normal" data-testid="combat-conditions">
                  {c.stance && <span className="rounded bg-red-900/70 px-1 text-xs text-red-100">{c.stance.label}</span>}
                  {c.dodging && <span className="rounded bg-sky-900/70 px-1 text-xs text-sky-100">dodging</span>}
                  {c.hidden && <span className="rounded bg-sky-900/70 px-1 text-xs text-sky-100">hidden</span>}
                  {c.reckless && <span className="rounded bg-red-900/70 px-1 text-xs text-red-100">reckless</span>}
                  {c.guarding !== undefined && <span className="rounded bg-sky-900/70 px-1 text-xs text-sky-100">guarding</span>}
                  {c.conditions?.map((condition) => (
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
        {player && !down && (
          <div className="flex flex-wrap gap-1 mb-2 text-xs" data-testid="combat-economy">
            <span className={`rounded px-1.5 py-0.5 ${hasAction ? "bg-emerald-900/70 text-emerald-100" : "bg-gray-700 text-gray-400"}`}>
              Action {midAttack ? `(${player.attacksLeft} attack${player.attacksLeft === 1 ? "" : "s"} left)` : hasAction ? "●" : "○"}
            </span>
            <span className={`rounded px-1.5 py-0.5 ${(player.bonus ?? 0) > 0 ? "bg-emerald-900/70 text-emerald-100" : "bg-gray-700 text-gray-400"}`}>Bonus {(player.bonus ?? 0) > 0 ? "●" : "○"}</span>
            <span className={`rounded px-1.5 py-0.5 ${(player.reactions ?? 0) > 0 ? "bg-emerald-900/70 text-emerald-100" : "bg-gray-700 text-gray-400"}`}>Reaction {(player.reactions ?? 0) > 0 ? "●" : "○"}</span>
            <label className="ml-auto flex items-center gap-1 text-gray-400">
              <input type="checkbox" checked={autoEnd} onChange={(e) => setAutoEnd(e.target.checked)} /> end turn by itself
            </label>
          </div>
        )}
        {pending && player && (
          <div className="mb-3 p-2 rounded bg-amber-900/50 text-sm" data-testid="combat-reaction">
            <p>
              {attacker?.name ?? "Something"} hits you with {pending.attackName} for {pending.damage} damage{pending.crit ? " (critical)" : ""}. Use your reaction?
            </p>
            <div className="mt-1 flex flex-col gap-1">
              {pending.options.map((o) => (
                <Button key={o.key} size="sm" variant="outline" className="h-auto whitespace-normal justify-start text-left" onClick={() => resolvePending(o.key)} data-testid={`combat-reaction-${o.feature}`}>
                  {o.label}
                </Button>
              ))}
              <Button size="sm" onClick={() => resolvePending(null)} data-testid="combat-reaction-none">
                Take the hit
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-2">
          <Button disabled={!playerTurn || !hasAction} onClick={melee} title={player?.meleeWeapon ?? "Unarmed"}>
            Melee
          </Button>
          <Button disabled={!playerTurn || !hasAction || !rangedSpec || !ranged?.possible} onClick={() => attack("ranged")} title={player?.rangedWeapon ?? "No ranged weapon"}>
            Ranged
          </Button>
          <Button variant="outline" disabled={!playerTurn} onClick={() => (midAttack || (player?.actions ?? 0) <= 0 ? nextTurn() : pass("holds"))}>
            End turn
          </Button>
        </div>
        {ammo && (
          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs" data-testid="combat-ammo">
            <span className={loadedNow > 0 ? "text-gray-300" : "text-red-300"} data-testid="combat-ammo-left" data-value={loadedNow}>
              {ammo.weapon}: {ammo.max > 0 ? `${ammo.left}/${ammo.max} shots` : `${loadedNow} rounds`} ({(ammo.round ?? ammo.plain).toLowerCase()})
            </span>
            {ammo.max > 0 && Object.entries(ammo.reserves).filter(([, n]) => n > 0).map(([round, n]) => {
              const plan = reloadPlan(player!, round);
              return (
                <Button key={round} size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || !!plan.why} title={plan.why || (plan.cost === "free" ? "No action (a pouch or belt)" : plan.cost === "bonus" ? "A bonus action" : "An action")} onClick={() => reload(round)} data-testid="combat-reload">
                  Reload: {round} ({n})
                </Button>
              );
            })}
            {ammo.max > 0 && !Object.values(ammo.reserves).some((n) => n > 0) && <span className="text-gray-500">No rounds carried to reload with.</span>}
            {burstN > 0 && <Button size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || !hasAction || loadedNow < burstN || !ranged?.possible} onClick={() => spray("burst")} data-testid="combat-burst">Burst ({burstN})</Button>}
            {rapidN > 0 && <Button size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || !hasAction || loadedNow < rapidN || !ranged?.possible} onClick={() => spray("rapid")} data-testid="combat-rapid">Rapid ({rapidN})</Button>}
          </div>
        )}
        {player && (player.holster || player.detonator || (player.meleeWeapon && player.rangedWeapon)) && (
          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs" data-testid="combat-hands">
            <span className="text-gray-300" data-testid="combat-inhand">In hand: {player.inHand === "none" ? "nothing" : player.inHand === "melee" ? player.meleeWeapon : player.inHand === "ranged" ? player.rangedWeapon : "the weapon you came in with"}</span>
            {(["melee", "ranged"] as const).map((kind) => {
              const weapon = kind === "melee" ? player.meleeWeapon : player.rangedWeapon;
              const plan = drawPlan(player, kind);
              if (!weapon || plan.cost === "none") return null;
              return (
                <Button key={kind} size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || (plan.cost === "action" && (!hasAction || midAttack))} onClick={() => draw(kind)} data-testid={`combat-draw-${kind}`}>
                  Switch to {weapon} ({plan.cost === "holster" ? "from the holster: no action" : plan.cost === "interaction" ? "free, once a turn" : "your action"})
                </Button>
              );
            })}
            {player.holster && player.inHand !== "none" && !player.holster.ready && (
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || !hasAction || midAttack} onClick={stow} data-testid="combat-stow">Holster it (an action)</Button>
            )}
            {player.detonator && (
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={!playerTurn || !hasAction || !mines.some((m) => m.paired && m.armed)} onClick={detonate} data-testid="combat-detonate">
                Detonate ({mines.filter((m) => m.paired).length} paired mine{mines.filter((m) => m.paired).length === 1 ? "" : "s"}{mines.some((m) => m.paired && !m.armed) ? ", not yet armed" : ""})
              </Button>
            )}
          </div>
        )}
        {mines.length > 0 && <p className="mb-2 text-xs text-amber-300" data-testid="combat-mines">Mines set: {mines.map((m) => `${m.label} (${m.armed ? "armed" : "arms next turn"}${m.paired ? ", paired" : ""})`).join("; ")}</p>}
        {player?.bipod && <Button size="sm" variant="outline" className="mb-2 h-6 px-2" disabled={!playerTurn || !hasAction} onClick={brace}>{player.braced ? "Fold the bipod" : "Deploy the bipod (prone, speed 0)"}</Button>}
        {playerTurn && (
          <div className="flex flex-wrap gap-1 mb-2" data-testid="combat-standard">
            {(["dash", "disengage", "dodge", "hide"] as const).map((a) => (
              <Button key={a} size="sm" variant="outline" disabled={!hasAction} onClick={() => standard(a)}>
                {a[0].toUpperCase() + a.slice(1)}
              </Button>
            ))}
            {friends.length > 0 && (
              <>
                <Button size="sm" variant="outline" disabled={!hasAction} onClick={() => standard("help")}>Help</Button>
                <Button size="sm" variant="outline" disabled={!hasAction} onClick={() => standard("guard")}>Guard</Button>
              </>
            )}
            {bonusStandard.map((b) => (
              <Button key={`${b.from}-${b.a}`} size="sm" variant="secondary" onClick={() => standard(b.a, true)} title={`${b.from}: as a bonus action`}>
                {b.a[0].toUpperCase() + b.a.slice(1)} (bonus)
              </Button>
            ))}
          </div>
        )}
        {playerTurn && (bonusAttacks.length > 0 || bonusUses.length > 0) && (
          <div className="mb-2" data-testid="combat-bonus">
            <p className="text-xs text-gray-400 mb-1">Bonus action</p>
            <div className="flex flex-col gap-1">
              {bonusAttacks.map((b) => (
                <Button key={`${b.kind}-${b.source}`} size="sm" variant="secondary" className="h-auto whitespace-normal justify-start text-left" onClick={() => attack(b.kind)}>
                  {b.label} <span className="text-gray-400 ml-1">({b.source})</span>
                </Button>
              ))}
              {bonusUses.map((f) => (
                <Button key={f.key} size="sm" variant="secondary" className="h-auto whitespace-normal justify-start text-left" onClick={() => useFeature(f.key, player?.id)} data-testid={`combat-feature-${f.name}`}>
                  {player?.stance && f.stance ? `End ${f.stance.label.replace(/ing$/, "e")}` : f.name}
                  <span className="text-gray-400 ml-1">
                    {usesLeft(f.key) !== null ? `(${usesLeft(f.key)} left` : "("}
                    {f.cost ? `${usesLeft(f.key) !== null ? "; " : ""}${f.cost.points} ${f.cost.pool === "focus" ? "focus" : "point"}` : ""}
                    {f.automated ? "" : `${usesLeft(f.key) !== null || f.cost ? "; " : ""}you apply it`})
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}
        {playerTurn && chosen.some(usedNow) && (
          <div className="mb-2" data-testid="combat-features">
            <p className="text-xs text-gray-400 mb-1">Features</p>
            <div className="flex flex-col gap-1">
              {chosen
                .filter(usedNow)
                .map((f) => {
                  const left = usesLeft(f.key);
                  const blocked = (left !== null && left <= 0) || (f.activation === "action" && !hasAction) || (f.cost && (f.cost.pool === "focus" ? (player?.focus ?? 0) : (player?.powerPoints ?? 0)) < f.cost.points);
                  return (
                    <Button key={f.key} size="sm" variant="outline" className="h-auto whitespace-normal justify-start text-left" disabled={!!blocked} onClick={() => useFeature(f.key, target?.id)} data-testid={`combat-feature-${f.name}`}>
                      {f.name}
                      <span className="text-gray-400 ml-1">
                        ({[f.activation === "action" ? "action" : "no action", left !== null ? `${left} left` : "", f.cost ? `${f.cost.points} ${f.cost.pool === "focus" ? "focus" : "point"}` : "", f.automated ? "" : "you apply it"].filter(Boolean).join("; ")})
                      </span>
                    </Button>
                  );
                })}
            </div>
          </div>
        )}
        {playerTurn && maneuvers.length > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-300" data-testid="combat-maneuver">
            Maneuver ({maneuvers[0].uses ? maneuvers[0].uses.max - (player?.uses?.[maneuvers[0].pool] ?? 0) : 0} dice left)
            <select className="h-7 min-w-0 flex-1 rounded bg-gray-700 px-1" value={player?.maneuver ?? ""} onChange={(e) => setManeuver(e.target.value || null)}>
              <option value="">none</option>
              {maneuvers.map((m) => (
                <option key={m.key} value={m.key}>{m.name}{m.maneuver!.timing === "attack" ? " (with the attack roll)" : ""}</option>
              ))}
            </select>
          </label>
        )}
        {playerTurn && empowerFeature && empowerMax > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-300">
            {empowerFeature.name}: force points on the next hit
            <select className="h-7 rounded bg-gray-700 px-1" value={player?.empower ?? 0} onChange={(e) => setEmpower(Number(e.target.value))}>
              {Array.from({ length: empowerMax + 1 }, (_, n) => (
                <option key={n} value={n}>{n === 0 ? "none" : `${n} (+${n}${empowerFeature.extraDamage!.dice.replace(/^\d+/, "")})`}</option>
              ))}
            </select>
          </label>
        )}
        <div className="text-xs text-gray-400 mb-2">
          Melee: {player?.meleeWeapon ?? "unarmed"} ({player?.reach ?? 5} ft.{meleePlan && !meleePlan.possible ? "; Melee closes in first" : ""}) · Ranged: {player?.rangedWeapon ? `${player.rangedWeapon} (${player.range?.join("/") ?? "80/320"} ft.)` : "none"}.
          {perAction > 1 ? ` The Attack action makes ${perAction} attacks.` : ""} On the map, tap a green square to move and an enemy to pick it out; moving out of an enemy's reach gives it an attack unless you Disengage.
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
        {!down && items.length > 0 && <ItemList items={items} disabled={!playerTurn || !hasAction} />}
        {!down && aiming !== null && player?.powers?.[aiming]?.motion && (() => {
          const power = player.powers![aiming];
          const motion = power.motion!;
          const piece = objectId ? arena.assets.find((a) => a.id === objectId) : undefined;
          const reach = piece ? objectReach(motion, piece) : undefined;
          const pieceFar = !!piece && squaresToAsset(player, piece) * 5 > Math.max(5, power.range ?? 1000);
          const foeFeet = target && motion.creatures ? motionFeet(motion, target.size ?? "Medium", false) : 0;
          const foeFar = powerOutOfRange(combatants, player, power, targetId);
          const go = (choice: { mode: "away" | "toward" | "at"; objectId?: string }) => {
            setAiming(null);
            castPower(aiming, choice);
          };
          const thing = piece?.name.toLowerCase();
          return (
            <div className="mb-3 rounded bg-sky-950/70 p-2 text-sm" data-testid="motion-chooser">
              <p className="mb-1 text-xs text-sky-200">
                {power.name}: {piece ? `the ${thing} is picked out${reach?.bulk ? ` (${reach.bulk.size.toLowerCase()}, about ${reach.bulk.pounds === Infinity ? "fixed" : `${reach.bulk.pounds.toLocaleString()} lb`})` : ""}` : motion.objects ? "tap a piece of furniture on the map to move it" : ""}
                {piece && pieceFar ? "; it is out of range" : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                {piece && reach?.feet ? (
                  <>
                    <Button size="sm" disabled={pieceFar} onClick={() => go({ mode: "away", objectId: piece.id })} data-testid="motion-push-object">Push the {thing} up to {reach.feet} ft away</Button>
                    <Button size="sm" disabled={pieceFar} onClick={() => go({ mode: "toward", objectId: piece.id })} data-testid="motion-pull-object">Pull it to you</Button>
                    {target && target.hp > 0 && <Button size="sm" disabled={pieceFar} onClick={() => go({ mode: "at", objectId: piece.id })} data-testid="motion-hurl">Hurl it at {target.name}</Button>}
                  </>
                ) : piece ? <p className="text-xs text-gray-300">Not with this power: {reach?.why}.</p> : null}
                {target && target.hp > 0 && foeFeet > 0 && (
                  <>
                    <Button size="sm" variant="outline" disabled={foeFar} onClick={() => go({ mode: "away" })} data-testid="motion-push-foe">Push {target.name} {foeFeet} ft away</Button>
                    <Button size="sm" variant="outline" disabled={foeFar} onClick={() => go({ mode: "toward" })} data-testid="motion-pull-foe">Pull {target.name} to you</Button>
                  </>
                )}
                {target && target.hp > 0 && motion.creatures && !foeFeet && <p className="text-xs text-gray-300">{target.name} is too large for this power.</p>}
                <Button size="sm" variant="ghost" onClick={() => setAiming(null)}>Cancel</Button>
                {piece && <Button size="sm" variant="ghost" onClick={() => setObject(null)}>Drop the {thing}</Button>}
              </div>
            </div>
          );
        })()}
        {!down && (player?.powers?.length ?? 0) > 0 && (
          <div className="mb-3" data-testid="combat-powers">
            <p className="text-xs text-gray-400 mb-1">Powers ({player?.powerPoints ?? 0} points left)</p>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {player!.powers!.map((power, index) => {
                // A power that moves things can be aimed at a piece of the ground even with the enemy out of range
                const moves = !!power.motion && !power.motion.rider;
                const far = !moves && powerOutOfRange(combatants, player!, power, targetId);
                const bonusCast = power.castTime === "bonus";
                const noTime = bonusCast ? (player?.bonus ?? 0) <= 0 : !hasAction;
                return (
                  <Button
                    key={power.name}
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal justify-start text-left"
                    disabled={!playerTurn || (player?.powerPoints ?? 0) < power.cost || far || noTime || power.castTime === "reaction" || power.castTime === "long"}
                    onClick={() => (moves ? setAiming(aiming === index ? null : index) : cast(index))}
                  >
                    {power.name}
                    <span className="text-gray-400 ml-1">
                      ({power.cost ? `${power.cost} pts` : "at-will"}; {bonusCast ? "bonus action; " : ""}{power.range === 0 ? "self; " : power.range === 5 ? "touch; " : power.range ? `${power.range} ft.; ` : ""}{far ? "out of range; " : ""}{power.summary})
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
// enemy picked out. Using one is the Use an Object action.
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
    item.use(friend ? friend.id : target);
  };
  return (
    <div className="mb-3" data-testid="combat-items">
      <p className="text-xs text-gray-400 mb-1">Items (using one is your action)</p>
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

// ---------------------------------------------------------------------------------------------
// A fight between starships (shared/logic "Starship combat"). The character's ship acts on its
// turn: fire its weapons (each once, an action each), the helm's one action (evade, fly, a hard
// turn, an attack run), boost, patch the hull, regenerate shields; tap the map to fly.
// ---------------------------------------------------------------------------------------------

import { shipFeet, bearingOff, shipSpeed, shipSpecialUses } from "@shared/logic";
import { useShipFight } from "@/lib/stores/useCombat";

export function ShipCombatPanel({ onFinish }: { onFinish: (outcome: NonNullable<ReturnType<typeof useShipFight.getState>["fight"]>["outcome"]) => void }) {
  const { fight, partyShipId, targetId, setTarget, fire, helm, boost, patch, regenerate, direct, interfere, special, flee, endTurn, aiStep, turn } = useShipFight();
  const me = fight?.ships.find((s) => s.id === partyShipId);
  const current = fight?.ships[fight.turn];
  const myTurn = !!fight && !!me && current?.id === me.id && !fight.outcome && !me.disabled && !me.destroyed;

  // The computer's ships fly their turns by themselves, a step at a time
  useEffect(() => {
    if (!fight || fight.outcome || !current || current.id === partyShipId) return;
    const t = setTimeout(() => aiStep(), 800);
    return () => clearTimeout(t);
  }, [fight?.turn, fight?.round, fight?.log.length, fight?.outcome]);
  // A disabled ship at 0 hull cannot act, but its turn still comes round
  useEffect(() => {
    if (!fight || fight.outcome || !me || current?.id !== me.id || !(me.disabled || me.destroyed)) return;
    const t = setTimeout(() => endTurn(), 700);
    return () => clearTimeout(t);
  }, [fight?.turn, fight?.round]);

  useEffect(() => {
    (window as any).__shipFight = useShipFight;
  }, []);

  if (!fight || !me) return null;
  const foes = fight.ships.filter((s) => s.side === "foe");
  const target = fight.ships.find((s) => s.id === targetId && !s.destroyed && !s.fled) ?? foes.find((s) => !s.destroyed && !s.fled);
  const why = (index: number): string => {
    const w = me.sheet.weapons[index];
    if (!target) return "no target";
    if (me.fired.includes(index)) return "fired";
    if (me.actions <= 0) return "no action";
    if (w.ammo !== undefined && (me.ammo[index] ?? 0) <= 0) return "empty";
    if (shipFeet(me, target) > w.far) return "out of range";
    if (w.arc === "forward" && bearingOff(me, target) > 45.01 && !me.attackRun) return "not in arc";
    return "";
  };
  const feet = target ? shipFeet(me, target) : 0;
  const bar = (now: number, max: number) => (max > 0 ? `${now}/${max}` : "-");
  // A tuned or computer-aided system acts without an action once a turn
  const free = (kind: "helm" | "boost" | "patch") => (me.sheet.bonusActions ?? []).includes(kind) && !me.bonusUsed;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 h-[54dvh] overflow-y-auto bg-gray-900 md:inset-x-auto md:bottom-auto md:left-2 md:top-2 md:h-auto md:w-80 md:max-h-[82vh] md:bg-transparent" data-testid="ship-combat">
      <TranslucentPane className="p-3 text-white">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold text-yellow-400">Space - Round {fight.round}</h2>
          {me.sheet.hyperdrive && myTurn && (
            <Button size="sm" variant="outline" onClick={flee} data-testid="ship-flee">
              Jump away
            </Button>
          )}
        </div>
        <ul className="space-y-1 mb-2" data-testid="ship-list">
          {fight.ships.map((s) => (
            <li key={s.id} className={`text-sm ${current?.id === s.id ? "text-yellow-300 font-semibold" : ""} ${s.destroyed || s.fled ? "opacity-50 line-through" : ""}`} onClick={() => s.side === "foe" && !s.destroyed && setTarget(s.id)}>
              <div className="flex justify-between">
                <span>
                  {target?.id === s.id ? "◎ " : ""}
                  {s.name}
                  {s.side === "party" ? " (you)" : ""}
                  <span className="text-xs text-gray-400"> {s.sheet.size} {s.sheet.role.toLowerCase()}</span>
                </span>
                <span>
                  {bar(s.hull, s.sheet.hullMax)}
                  {s.sheet.shieldMax ? <span className="text-sky-300"> +{s.shield}</span> : ""}
                </span>
              </div>
              {(s.disabled || s.systemDamage > 0 || s.evading || s.stable || (s.conds ?? []).length > 0) && (
                <div className="flex flex-wrap gap-1 text-xs" data-testid="ship-conditions">
                  {s.disabled && <span className="rounded bg-red-900/70 px-1">disabled{s.stable ? ", stable" : ""}</span>}
                  {s.systemDamage > 0 && <span className="rounded bg-purple-900/60 px-1">system damage {s.systemDamage}</span>}
                  {s.evading && <span className="rounded bg-sky-900/70 px-1">evading</span>}
                  {(s.conds ?? []).map((c, ci) => <span key={`${c.name}-${ci}`} className="rounded bg-amber-900/70 px-1">{c.name}</span>)}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-300 mb-2" data-testid="ship-info">
          Hull {me.hull}/{me.sheet.hullMax}{me.sheet.shieldMax ? `, shields ${me.shield}/${me.sheet.shieldMax} (+${me.sheet.shieldRegen} a turn, ${me.shieldDiceLeft} dice)` : ", no shields"} · AC {me.sheet.ac}{me.sheet.reduction ? `, armor takes ${me.sheet.reduction}` : ""} · speed {me.speedLeft}/{shipSpeed(me)} ft.
          {target ? ` · Target: ${target.name}, ${feet} ft.` : ""}
        </p>
        <div className="flex flex-wrap gap-1 mb-2 text-xs" data-testid="ship-economy">
          <span className={`rounded px-1.5 py-0.5 ${me.actions > 0 ? "bg-emerald-900/70 text-emerald-100" : "bg-gray-700 text-gray-400"}`}>Actions {me.actions}/{me.actionsMax}</span>
          <span className={`rounded px-1.5 py-0.5 ${!me.helmUsed ? "bg-emerald-900/70 text-emerald-100" : "bg-gray-700 text-gray-400"}`}>Helm {me.helmUsed ? "○" : "●"}</span>
          {me.attackRun && <span className="rounded bg-amber-900/70 px-1.5 py-0.5">attack run</span>}
        </div>
        {fight.outcome ? (
          <div className="mb-3 rounded bg-gray-800 p-2 text-sm" data-testid="ship-outcome">
            <p>
              {fight.outcome === "victory" ? "The enemy is beaten." : fight.outcome === "destroyed" ? "Your ship is lost." : fight.outcome === "fled" ? "You jump away." : "Your ship is disabled."}
            </p>
            <Button size="sm" className="mt-1" onClick={() => onFinish(fight.outcome)} data-testid="ship-finish">Continue</Button>
          </div>
        ) : (
          <>
            <div className="mb-2" data-testid="ship-weapons">
              <p className="text-xs text-gray-400 mb-1">Fire (an action each, once a turn)</p>
              <div className="flex flex-col gap-1">
                {me.sheet.weapons.length === 0 && <p className="text-xs text-gray-400">The ship carries no weapons.</p>}
                {me.sheet.weapons.map((w, i) => {
                  const reason = why(i);
                  return (
                    <Button key={`${w.name}-${i}`} size="sm" variant="outline" className="h-auto whitespace-normal justify-start text-left" disabled={!myTurn || !!reason} onClick={() => fire(i)} data-testid={`ship-fire-${i}`}>
                      {w.name}
                      <span className="text-gray-400 ml-1">
                        ({w.category.toLowerCase()}, {w.dice} {w.damageType}, {w.near ? `${w.near}/` : ""}{w.far} ft., {w.arc}{w.ammo !== undefined ? `, ${me.ammo[i] ?? 0} left` : ""}{reason ? `; ${reason}` : ""})
                      </span>
                    </Button>
                  );
                })}
                {me.sheet.weapons.some((w, i) => !why(i) && w.category !== "Tertiary" && w.category !== "Quaternary") && me.gunners === 0 && !me.attackRun && (
                  <p className="text-[11px] text-gray-500">Firing from the helm has disadvantage with primary and secondary weapons; an attack run or a gunner removes it.</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-2" data-testid="ship-helm">
              <Button size="sm" variant="outline" disabled={!myTurn || me.helmUsed || (me.actions <= 0 && !free("helm"))} onClick={() => helm("evade")}>Evade</Button>
              <Button size="sm" variant="outline" disabled={!myTurn || me.helmUsed || (me.actions <= 0 && !free("helm"))} onClick={() => helm("fly")}>Fly</Button>
              <Button size="sm" variant="outline" disabled={!myTurn || me.helmUsed || me.actions <= 0} onClick={() => helm("hardTurn")}>Hard turn</Button>
              <Button size="sm" variant="outline" disabled={!myTurn || me.helmUsed || me.actions <= 0 || me.movedToward < 150} onClick={() => helm("attackRun")} title="Needs 150 ft. of flying toward the target first">Attack run</Button>
              <Button size="sm" variant="outline" disabled={!myTurn} onClick={() => turn(-1)}>Turn ↶</Button>
              <Button size="sm" variant="outline" disabled={!myTurn} onClick={() => turn(1)}>Turn ↷</Button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2" data-testid="ship-actions">
              {(["engines", "shields", "weapons"] as const).map((b) => (
                <Button key={b} size="sm" variant="secondary" disabled={!myTurn || (me.actions <= 0 && !free("boost")) || me.boosts[b] > 0 || (b === "shields" && !me.sheet.hasShield)} onClick={() => boost(b)}>
                  Boost {b}
                </Button>
              ))}
              <Button size="sm" variant="secondary" disabled={!myTurn || (me.actions <= 0 && !free("patch")) || me.hullDiceLeft <= 0 || me.hull >= me.sheet.hullMax} onClick={patch}>Patch ({me.hullDiceLeft})</Button>
              <Button size="sm" variant="secondary" disabled={!myTurn || me.actions <= 0 || !me.sheet.hasShield || me.shieldDiceLeft <= 0 || me.shield >= me.sheet.shieldMax} onClick={regenerate}>Regenerate shields</Button>
              <Button size="sm" variant="secondary" disabled={!myTurn || me.actions <= 0} onClick={direct}>Direct</Button>
              <Button size="sm" variant="secondary" disabled={!myTurn || me.actions <= 0 || !target} onClick={interfere}>Interfere</Button>
            </div>
            {(me.sheet.specials ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2" data-testid="ship-specials">
                {(me.sheet.specials ?? []).map((sp, i) => {
                  const left = shipSpecialUses(me, sp);
                  const far = sp.area !== "self" && target ? shipFeet(me, target) > sp.range : false;
                  return (
                    <Button key={sp.name} size="sm" variant="secondary" disabled={!myTurn || me.actions <= 0 || left <= 0 || far || (sp.area !== "self" && !target)} onClick={() => special(i)} title={`${sp.save} save${sp.damage.length ? `, ${sp.damage.map((d) => `${d.dice} ${d.type}`).join(" + ")}` : ""}${sp.condition ? `, ${sp.condition}` : ""}; ${sp.area === "self" ? `within ${sp.radius} ft.${sp.forward ? " ahead" : ""}` : `up to ${sp.range} ft.`}`} data-testid={`ship-special-${i}`}>
                      {sp.name} ({left})
                    </Button>
                  );
                })}
              </div>
            )}
            {((me.sheet.bonusActions ?? []).length > 0) && <p className="text-[11px] text-gray-500 mb-1">Without an action once a turn ({me.bonusUsed ? "used" : "ready"}): {(me.sheet.bonusActions ?? []).map((b) => (b === "helm" ? "Fly or Evade" : b === "boost" ? "a Boost" : "a Patch")).join(", ")} (house rule: a bonus action of the book).</p>}
            <Button className="mb-2" variant="outline" disabled={!myTurn} onClick={endTurn} data-testid="ship-end-turn">End turn</Button>
            <p className="text-xs text-gray-400 mb-2">On the map, tap a green square to fly there (a square is 50 ft.; turning costs half the turning speed for each 45 degrees) and an enemy to pick it out.</p>
          </>
        )}
        <div className="text-xs text-gray-300 space-y-1 max-h-32 overflow-y-auto">
          {fight.log.slice(-6).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </TranslucentPane>
    </div>
  );
}
