import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Button } from "@/components/ui/button";
import PlayCombat from "@/components/Combat/PlayCombat";
import { useCombat } from "@/lib/stores/useCombat";
import { pitItem, pitPrize, pitTargetCR } from "@shared/logic";
import type { Sw5eMonster } from "@shared/data";
import { FightScene } from "./LocalMap";

// The pit arena, a dedicated page (house rules, shared/logic "Pit arena"): each bout is a fight of the
// combat engine on the 3D arena, against a creature from the rules' stat blocks. A win pays the prize and an
// enhanced item and leaves the party to take the next bout or leave; a loss ends the run, carried out at
// 1 hit point. Every bout opens with a five-second countdown.

export interface PitSummary { bouts: number; credits: number; items: string[]; knockedOut: boolean }
export interface PitArenaProps {
  enhanced: { name: string; searchableRarity: string }[];
  opponentFor: (bout: number) => Sw5eMonster | null;
  launch: (enemy: Sw5eMonster, bout: number) => void;
  keepHp: (hp: number) => void;
  bank: (total: { credits: number; items: string[] }) => void;
  onExit: (summary: PitSummary) => void;
}

type Phase = "ready" | "countdown" | "fight" | "result";

export default function PitArena({ enhanced, opponentFor, launch, keepHp, bank, onExit }: PitArenaProps) {
  const [bout, setBout] = useState(1);
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(5);
  const [enemy, setEnemy] = useState<Sw5eMonster | null>(null);
  const [total, setTotal] = useState({ credits: 0, items: [] as string[], bouts: 0 });
  const [last, setLast] = useState<{ won: boolean; prize: number; item: string | null; hp: number } | null>(null);
  const [seen, setSeen] = useState(false);
  const outcome = useCombat((s) => s.outcome);
  const inCombat = useCombat((s) => s.inCombat);

  const startBout = (n: number) => {
    const next = opponentFor(n);
    if (!next) return;
    setBout(n);
    setEnemy(next);
    setCount(5);
    setPhase("countdown");
  };

  // Five seconds, then the bout begins
  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => {
      if (count > 0) setCount(count - 1);
      else {
        setPhase("fight");
        if (enemy) launch(enemy, bout);
      }
    }, count > 0 ? 1000 : 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  // The bout has begun once the combat engine says so; it is over when the engine gives an outcome
  useEffect(() => {
    if (phase === "fight" && inCombat) setSeen(true);
  }, [phase, inCombat]);
  useEffect(() => {
    if (phase !== "fight" || !seen || inCombat || !outcome) return;
    setSeen(false);
    const me = useCombat.getState().combatants.find((c) => c.isPlayer);
    const won = outcome === "victory";
    const prize = won ? pitPrize(bout) : 0;
    const item = won ? pitItem(enhanced, bout, Math.random) : null;
    const hp = won ? Math.max(1, me?.hp ?? 1) : 1;
    const credits = total.credits + prize;
    const items = item ? [...total.items, item] : total.items;
    const bouts = total.bouts + (won ? 1 : 0);
    setLast({ won, prize, item, hp });
    setTotal({ credits, items, bouts });
    if (won) bank({ credits, items });
    keepHp(hp);
    setPhase("result");
  }, [phase, inCombat, outcome, seen]);

  const exit = () => onExit({ bouts: total.bouts, credits: total.credits, items: total.items, knockedOut: !!last && !last.won });
  const opponentNow = opponentFor(bout);
  const shell = "fixed inset-0 z-[70] flex flex-col bg-black";

  if (phase === "ready" || phase === "countdown") {
    return (
      <div className={shell} data-testid="pit-arena">
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-gray-950 px-3 py-2 text-sm text-amber-100">
          <span className="font-semibold">Pit arena · bout {bout}</span>
          {phase === "ready" && <Button size="sm" variant="outline" onClick={exit} data-testid="pit-leave">Leave the pit</Button>}
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          {phase === "countdown" ? (
            <span className="text-8xl font-bold text-yellow-300" data-testid="countdown">{count > 0 ? count : "GO!"}</span>
          ) : (
            <div className="max-w-md space-y-3 text-center text-sm text-gray-100">
              <p className="text-xs uppercase tracking-wide text-amber-300">Tonight's opponent</p>
              {opponentNow ? (
                <>
                  <p className="text-xl font-semibold" data-testid="pit-opponent">{opponentNow.name}</p>
                  <p className="text-gray-300">Challenge {opponentNow.challengeRating} (aiming for {pitTargetCR(bout)}) · {opponentNow.hitPoints} hit points · armor {opponentNow.armorClass}</p>
                </>
              ) : (
                <p className="text-gray-300">The pit has no one left to fight you.</p>
              )}
              <p className="text-amber-200" data-testid="pit-prize">Prize: {pitPrize(bout).toLocaleString()} cr and an enhanced item of this fight's level (level {Math.min(20, 2 * bout + 1)}).</p>
              <Button onClick={() => startBout(bout)} disabled={!opponentNow} data-testid="pit-enter">Enter the bout (5 seconds)</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shell} data-testid="pit-arena">
      <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-gray-950 px-3 py-2 text-sm text-amber-100">
        <span className="font-semibold">Pit arena · bout {bout}{enemy ? ` · ${enemy.name}` : ""}</span>
        <span className="text-xs text-gray-300">Won {total.bouts} · {total.credits.toLocaleString()} cr</span>
      </div>
      <div className="relative h-[46dvh] w-full bg-black" data-testid="pit-scene">
        <Canvas camera={{ position: [0, 14, 13], fov: 50 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
          <FightScene wall="#c9a56e" />
        </Canvas>
      </div>
      {phase === "fight" && (
        <div className="min-h-0 flex-1 overflow-auto">
          <PlayCombat items={[]} />
        </div>
      )}
      {phase === "result" && last && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-100" data-testid="pit-result">
          <p className="text-lg font-semibold text-yellow-300">{last.won ? `Bout ${bout} won.` : "You are knocked out and carried out of the pit."}</p>
          {last.won ? (
            <p>{last.prize.toLocaleString()} cr{last.item ? ` and ${last.item}` : ""}. You are at {last.hp} hit point{last.hp === 1 ? "" : "s"}.</p>
          ) : (
            <p>Nothing for this bout. You come to at 1 hit point (house rule: the pit does not kill).</p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {last.won && <Button onClick={() => startBout(bout + 1)} disabled={!opponentFor(bout + 1)} data-testid="pit-next">Next bout (the next is harder)</Button>}
            <Button variant="outline" onClick={exit} data-testid="pit-quit">{last.won ? "Leave with the winnings" : "Leave the pit"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
