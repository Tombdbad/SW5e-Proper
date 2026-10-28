// Bets on the pit's bouts of the day (shared/logic/pitbets.ts): three bouts between creatures of the rules, the odds from how often each wins, one
// bet to a bout a day. The fight is played out round by round on the page, and what comes back is paid by `onSettled`.
import { useMemo, useState } from "react";
import { createRandom } from "@shared/logic";
import { boutsFor, settle, type Bout } from "@shared/logic/pitbets";
import type { Sw5eMonster } from "@shared/data";

const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function PitBets({ monsters, level, day, boss, credits, done, onSettled }: {
  monsters: Sw5eMonster[];
  level: number;
  day: number;
  boss: string;
  credits: number;
  // The bouts already bet on today
  done: string[];
  // A bet made: the bout, the stake taken and what comes back
  onSettled: (bout: string, stake: number, back: number) => void;
}) {
  const bouts = useMemo<Bout[]>(() => boutsFor(monsters, level, createRandom(hashOf(`${boss}|${day}`))), [monsters, level, day, boss]);
  const [stake, setStake] = useState(50);
  const [fought, setFought] = useState<Record<string, { log: string[]; back: number; winner: string }>>({});
  const bet = (bout: Bout, pick: 0 | 1) => {
    if (stake < 10 || stake > credits) return;
    const r = settle(bout, pick, stake, createRandom((Date.now() & 0xffffff) + hashOf(bout.id)));
    setFought((f) => ({ ...f, [bout.id]: { log: r.log, back: r.back, winner: r.winner === 0 ? bout.a.name : bout.b.name } }));
    onSettled(bout.id, stake, r.back);
  };
  return (
    <div className="space-y-2 text-xs" data-testid="pit-bets">
      <p className="font-semibold text-amber-200">Today's bouts in the pit (a bet on each, 10 credits or more; the house keeps a twentieth)</p>
      <label className="flex items-center gap-1">Stake <input type="number" className="h-6 w-20 rounded bg-gray-700 px-1" min={10} max={credits} value={stake} onChange={(e) => setStake(Number(e.target.value))} aria-label="Stake on the pit" data-testid="pit-stake" /> cr (you have {credits.toLocaleString()})</label>
      {bouts.map((b) => {
        const result = fought[b.id];
        const settled = !!result || done.includes(b.id);
        return (
          <div key={b.id} className="rounded border border-gray-600 p-1" data-testid="pit-bout">
            {([0, 1] as const).map((i) => {
              const f = i === 0 ? b.a : b.b;
              return (
                <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                  <span><b>{f.name}</b> (CR {f.cr}; {f.hp} hp, AC {f.ac}, {f.attacks > 1 ? `${f.attacks} attacks of ` : ""}+{f.bonus} for {f.dice}d{f.sides}{f.plus ? `+${f.plus}` : ""}) wins {Math.round(b.chance[i] * 100)}%</span>
                  <button className="rounded bg-amber-700 px-2 py-0.5 hover:bg-amber-600 disabled:opacity-40" disabled={settled || stake < 10 || stake > credits} onClick={() => bet(b, i)} data-testid={`pit-bet-${i}`}>Bet {stake} to win {Math.floor(stake * b.pays[i]).toLocaleString()}</button>
                </div>
              );
            })}
            {settled && !result && <p className="text-gray-400">You have bet on this one today.</p>}
            {result && (
              <div data-testid="pit-result">
                <p className={result.back ? "text-green-300" : "text-red-300"}>{result.winner} wins. {result.back ? `You win ${result.back.toLocaleString()} credits.` : `You lose your ${stake} credits.`}</p>
                <div className="max-h-16 overflow-y-auto text-gray-400">{result.log.slice(0, 12).map((l, i) => <div key={i}>{l}</div>)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
