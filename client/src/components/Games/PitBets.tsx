// Bets on the pit's weekend card (shared/logic/pitbets.ts "The weekend card"): five bouts a fight day (Saturday and Sunday), the odds from how often
// each fighter wins, a ticket bought before a bout begins and collected here once it is over. The bouts are the arena's own, fought on its floor.
import { useMemo, useState } from "react";
import { DAY } from "@shared/logic";
import { BOUT_LENGTH, cardFor, isBoutDay, matchState, nextBoutDay, ticketFor, ticketState, weekdayName, type Match, type PitArena, type Ticket } from "@shared/logic/pitbets";
import type { Sw5eMonster } from "@shared/data";

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const MIN_STAKE = 10;

export function PitBets({ arena, monsters, minute, credits, tickets, onBet, onCollect }: {
  arena: PitArena;
  monsters: Sw5eMonster[];
  // The clock now, in minutes
  minute: number;
  credits: number;
  tickets: Ticket[];
  // A ticket bought: the match, the side, the stake
  onBet: (ticket: Ticket) => void;
  // A ticket collected (won, with what it pays; or lost, torn up)
  onCollect: (ticket: Ticket, owed: number) => void;
}) {
  const today = Math.floor(minute / DAY) + 1;
  const [stake, setStake] = useState(50);
  // Today's card if it is a fight day, and the next fight day's (bets are taken from the day the card is posted: all the week before)
  const days = useMemo(() => {
    const first = nextBoutDay(today);
    return [first, nextBoutDay(first + 1)];
  }, [today]);
  const cards = useMemo(() => days.map((d) => ({ day: d, matches: cardFor(arena, d, monsters) })), [arena, days, monsters]);
  const byId = useMemo(() => new Map(cards.flatMap((c) => c.matches).map((m) => [m.id, m] as const)), [cards]);
  // (older tickets are looked for in their own day's card)
  const matchOf = (t: Ticket): Match | undefined => byId.get(t.match) ?? cardFor(arena, t.day, monsters).find((m) => m.id === t.match);
  const mine = tickets.filter((t) => t.arena === arena.id);
  return (
    <div className="space-y-2 text-xs" data-testid="pit-bets">
      <p className="font-semibold text-amber-200">{arena.name}: the pit fights on Saturday and Sunday, five bouts a day from noon, two hours apart. A ticket is 10 credits or more; the house keeps a twentieth. Winnings are paid here once the bout is over.</p>
      <label className="flex items-center gap-1">Stake <input type="number" className="h-6 w-20 rounded bg-gray-700 px-1" min={MIN_STAKE} max={credits} value={stake} onChange={(e) => setStake(Number(e.target.value))} aria-label="Stake on the pit" data-testid="pit-stake" /> cr (you have {credits.toLocaleString()})</label>
      {mine.length > 0 && (
        <div className="rounded border border-amber-700/60 p-1" data-testid="pit-tickets">
          <p className="font-semibold">Your tickets</p>
          {mine.map((t) => {
            const m = matchOf(t);
            const s = ticketState(t, m, minute);
            const picked = m ? (t.pick === 0 ? m.a.name : m.b.name) : "";
            return (
              <div key={t.id} className="flex items-center justify-between gap-2 py-0.5" data-testid="pit-ticket">
                <span>{weekdayName(t.day)} {hh(t.hour)}: {t.stake} cr on {picked} ({t.name}) at {t.pays}:1{s.state === "waiting" ? (m && matchState(m, minute) === "live" ? "; in the ring now" : "") : s.state === "won" ? `; ${m && (m.winner === 0 ? m.a.name : m.b.name)} won` : "; lost"}</span>
                {s.state === "won" && <button className="rounded bg-green-700 px-2 py-0.5 hover:bg-green-600" onClick={() => onCollect(t, s.owed)} data-testid="pit-collect">Collect {s.owed.toLocaleString()}</button>}
                {s.state === "lost" && <button className="rounded bg-gray-700 px-2 py-0.5 hover:bg-gray-600" onClick={() => onCollect(t, 0)} data-testid="pit-tear">Tear up</button>}
              </div>
            );
          })}
        </div>
      )}
      {!isBoutDay(today) && <p className="text-gray-300">No bouts today. The next card is {weekdayName(days[0])} (day {days[0]}).</p>}
      {cards.map(({ day, matches }) => (
        <div key={day} className="space-y-1" data-testid="pit-card">
          <p className="font-semibold">{weekdayName(day)}, day {day}{day === today ? " (today)" : ""}</p>
          {matches.length === 0 && <p className="text-gray-400">No card is posted.</p>}
          {matches.map((b) => {
            const state = matchState(b, minute);
            const bought = mine.filter((t) => t.match === b.id).length;
            return (
              <div key={b.id} className="rounded border border-gray-600 p-1" data-testid="pit-bout">
                <p className="text-gray-300">{hh(b.hour)} {state === "live" ? "(in the ring now)" : state === "done" ? "(over)" : `(bets close at ${hh(b.hour)})`}{b.high ? " - the headline kind" : ""}</p>
                {([0, 1] as const).map((i) => {
                  const f = i === 0 ? b.a : b.b;
                  const won = state === "done" && b.winner === i;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                      <span className={won ? "text-green-300" : state === "done" ? "text-gray-500" : ""}><b>{f.name}</b>{f.kind === "beast" ? " (a beast)" : ""} ({f.stock}, CR {f.cr}; {f.hp} hp, AC {f.ac}, {f.attacks > 1 ? `${f.attacks} attacks of ` : ""}+{f.bonus} for {f.dice}d{f.sides}{f.plus ? `+${f.plus}` : ""}) wins {Math.round(b.chance[i] * 100)}%{won ? " - won" : ""}</span>
                      <button className="rounded bg-amber-700 px-2 py-0.5 hover:bg-amber-600 disabled:opacity-40" disabled={state !== "open" || stake < MIN_STAKE || stake > credits} onClick={() => onBet(ticketFor(b, i, stake))} data-testid={`pit-bet-${i}`}>Bet {stake} to win {Math.floor(stake * b.pays[i]).toLocaleString()}</button>
                    </div>
                  );
                })}
                {bought > 0 && state === "open" && <p className="text-gray-400">You hold {bought} ticket{bought === 1 ? "" : "s"} on this bout.</p>}
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-gray-500">House rule: the books keep no card for the pit. Each bout is fought out in {BOUT_LENGTH} minutes on the arena's floor, and its result is fixed by the day and the arena.</p>
    </div>
  );
}
