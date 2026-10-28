// A hand of classic Sabacc at the house table (2026-10-27): the player sits among the people seated at it and plays real hands of the 76-card game
// (shared/logic/sabacc.ts) with chips bought in at a stake. The other seats play by `sabaccAi`, a croupier calls the game, and what each does is
// sent to the map as a gesture (the figure at the table draws, bets, thinks, calls or folds: `onGesture`) so that the 3D table plays along.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRandom } from "@shared/logic";
import { actor, bombedOut, handTotal, newSabacc, nextHand, sabaccActions, sabaccAi, sabaccDeck, sabaccDo, type Sabacc, type SabaccAction } from "@shared/logic/sabacc";
import type { Shot } from "@/components/Map/interiors/limbs";
import { CardBack, SabaccCard } from "./cards";

export interface TableOpponent { id: string; name: string; note?: string }
export const BUY_IN_CHIPS = 20;
const shotFor = (a: SabaccAction): Shot | undefined => (a.type === "fold" ? "fold" : a.type === "call" ? "call" : a.type === "draw" || a.type === "swap" ? "draw" : a.type === "bet" ? (a.amount ? "bet" : "think") : a.type === "match" || a.type === "raise" ? "bet" : a.type === "stand" || a.type === "pass" ? "think" : undefined);

export function SabaccTable({ place, player, opponents, croupier, unit, trained, onGesture, onSay, onHand, onChips, onClose }: {
  place: string;
  player: string;
  opponents: TableOpponent[];
  croupier?: TableOpponent;
  // Credits a chip is worth, and whether the player knows the game (they see the odds of a draw)
  unit: number;
  trained: boolean;
  // `who` is "me" or an occupant's id
  onGesture?: (who: string, shot: Shot) => void;
  onSay?: (who: string, text: string) => void;
  // A hand has been played (the clock moves), and what the player's chips come to now
  onHand?: () => void;
  onChips?: (chips: number) => void;
  // Leaving: the chips the player cashes out
  onClose: (chips: number) => void;
}) {
  const rng = useRef(createRandom((Date.now() & 0xffffff) + 1));
  const [game, setGame] = useState<Sabacc>(() => newSabacc([{ id: "me", name: player, credits: BUY_IN_CHIPS, human: true }, ...opponents.map((o) => ({ id: o.id, name: o.name, credits: BUY_IN_CHIPS }))], rng.current, 3, opponents.length ? 1 : 0));
  const ref = useRef(game);
  ref.current = game;
  const [selected, setSelected] = useState<number | null>(null);
  const said = useRef("");
  const me = game.seats.findIndex((s) => s.id === "me");
  const croupierSays = (text: string) => croupier && onSay?.(croupier.id, text);

  // One action by whoever is to act: it is played, and the table's figures and the croupier answer it
  const play = (a: SabaccAction) => {
    const cur = ref.current;
    const seat = cur.seats[actor(cur)];
    const next = sabaccDo(cur, a, rng.current);
    const shot = shotFor(a);
    if (shot) onGesture?.(seat.id, shot);
    if (a.type === "roll" && next.die !== undefined) croupierSays(next.die <= 3 ? "The shift! Cards change hands." : "No shift.");
    if (a.type === "call") croupierSays(`${seat.name} calls. Cards up!`);
    if (next.phase === "over" && cur.phase !== "over") {
      onHand?.();
      if (next.result?.winners.length) croupierSays(`${next.result.winners.map((i) => next.seats[i].name).join(" and ")} take${next.result.winners.length === 1 ? "s" : ""} the pot.`);
    }
    ref.current = next;
    setGame(next);
    setSelected(null);
  };

  // The others play for themselves after a moment; a player who has folded rolls the shift die without being asked
  useEffect(() => {
    if (game.phase === "over") return;
    const who = actor(game);
    const seat = game.seats[who];
    const mine = seat.id === "me";
    if (mine && !seat.folded) return;
    const t = setTimeout(() => play(mine ? { type: "roll" } : sabaccAi(ref.current, rng.current)), mine ? 400 : 750);
    return () => clearTimeout(t);
  }, [game]);
  useEffect(() => { onChips?.(game.seats[me].credits + (game.phase !== "over" ? 0 : 0)); }, [game.seats[me].credits]);
  // The croupier calls the ante
  useEffect(() => {
    if (game.phase === "bet" && said.current !== `h${game.hand}`) {
      said.current = `h${game.hand}`;
      croupierSays(game.hand === 1 ? "Welcome to the table. Ante's in: two cards each." : "New hand. Ante up.");
    }
  }, [game.hand]);

  const deal = () => {
    // (a player with no chips for the ante is out of the next hand; a computer player who has been cleaned out buys in again)
    const refill: Sabacc = { ...ref.current, seats: ref.current.seats.map((s) => (s.id !== "me" && s.credits < 4 ? { ...s, credits: BUY_IN_CHIPS } : s)) };
    const next = nextHand(refill, rng.current);
    ref.current = next;
    setGame(next);
  };

  const mine = game.seats[me];
  const turn = actor(game);
  const myTurn = turn === me && game.phase !== "over" && !mine.folded;
  const actions = myTurn ? sabaccActions(game) : [];
  const can = (type: string) => actions.some((a) => a.type === type);
  const maxBet = Math.min(game.limit, mine.credits);
  // Cards still unseen, for the odds shown to a player who knows the game: how many of them would bomb the hand out on a draw
  const risk = useMemo(() => {
    if (!trained || !mine) return null;
    const unseen = sabaccDeck().filter((c) => !mine.cards.some((m) => m.id === c.id));
    return Math.round((unseen.filter((c) => bombedOut([...mine.cards, c])).length / unseen.length) * 100);
  }, [trained, mine?.cards.map((c) => c.id).join()]);
  const total = mine ? handTotal(mine.cards) : 0;
  const over = game.phase === "over";
  const broke = mine.credits < 1;
  const others = game.seats.filter((s) => s.credits >= 1 || !s.folded).length;

  return (
    <div className="pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto rounded-lg border border-amber-700/60 bg-gray-950/95 p-3 text-sm text-gray-100 shadow-xl" data-testid="sabacc-panel">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-amber-300">Sabacc · {place}</div>
          <div className="text-xs text-gray-400">Hand {game.hand} · a chip is {unit} cr · bets and raises up to {game.limit}{croupier ? ` · ${croupier.name} deals` : ""}</div>
        </div>
        <button className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800" onClick={() => onClose(mine.credits)} data-testid="sabacc-leave">Leave the table ({mine.credits} chips = {mine.credits * unit} cr)</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded bg-gray-900 px-2 py-1 text-xs" data-testid="sabacc-pots">
        <span>Hand pot <b className="text-amber-200">{game.handPot}</b></span>
        <span>Sabacc pot <b className="text-amber-200">{game.sabaccPot}</b></span>
        {game.die !== undefined && <span>Shift die <b>{game.die}</b> {game.die <= 3 ? "(shift)" : "(none)"}</span>}
        {!over && <span className="text-gray-400">Phase: {({ bet: "betting", respond: "answering a bet", shift: "the shift", call: "the call", draw: "drawing", over: "" } as const)[game.phase]}</span>}
      </div>

      <div className="grid gap-1" data-testid="sabacc-seats">
        {game.seats.map((s, i) => {
          const shown = over && game.result?.shown.find((h) => h.seat === i);
          const winner = over && game.result?.winners.includes(i);
          return (
            <div key={s.id} className={`flex flex-wrap items-center gap-2 rounded px-2 py-1 ${i === turn && !over ? "bg-amber-900/40 ring-1 ring-amber-500" : "bg-gray-900"} ${s.folded ? "opacity-50" : ""}`}>
              <div className="min-w-[7rem]">
                <div className="font-semibold">{s.name}{i === game.dealer ? " (D)" : ""}{winner ? " ★" : ""}</div>
                <div className="text-xs text-gray-400">{s.credits} chips{s.folded ? " · folded" : ""}{s.bet && !over ? ` · bet ${s.bet}` : ""}</div>
              </div>
              <div className="flex gap-1">
                {s.id === "me" || shown ? s.cards.map((c) => <SabaccCard key={c.id} card={c} size="sm" />) : s.folded ? null : s.cards.map((_, k) => <CardBack key={k} size="sm" />)}
              </div>
              {shown && <span className="text-xs text-gray-300">= {shown.total}{shown.rank === 0 ? " (bombed out)" : shown.rank === 2 ? " (Pure Sabacc)" : shown.rank === 3 ? " (Idiot's Array)" : ""}</span>}
            </div>
          );
        })}
      </div>

      {!mine.folded && (
        <div className="rounded border border-gray-700 bg-gray-900 p-2" data-testid="sabacc-hand">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-300">
            <span>Your hand: <b className={bombedOut(mine.cards) ? "text-red-300" : "text-emerald-300"} data-testid="sabacc-total">{total}</b> (aim for 23, no higher; {bombedOut(mine.cards) ? "this bombs out" : "in range"})</span>
            {risk !== null && <span title="You know the game: the share of unseen cards that would bomb this hand out if you drew">draw bust risk {risk}%</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {mine.cards.map((c, i) => (
              <SabaccCard key={c.id} card={c} size="lg" selected={selected === i} onClick={game.phase === "draw" && myTurn && mine.cards.length > 2 ? () => setSelected(selected === i ? null : i) : undefined} />
            ))}
          </div>
          {game.phase === "draw" && myTurn && mine.cards.length > 2 && <div className="mt-1 text-xs text-gray-400">Tap a card to choose it for a swap.</div>}
        </div>
      )}

      {myTurn && (
        <div className="flex flex-wrap items-center gap-2" data-testid="sabacc-actions">
          {game.phase === "bet" && <>
            <span className="text-xs text-gray-400">Open the betting:</span>
            {Array.from({ length: maxBet + 1 }, (_, n) => <button key={n} className="rounded bg-amber-700 px-2 py-1 hover:bg-amber-600" onClick={() => play({ type: "bet", amount: n })} data-testid={`sabacc-bet-${n}`}>{n === 0 ? "No bet" : `Bet ${n}`}</button>)}
            <button className="rounded bg-red-800 px-2 py-1 hover:bg-red-700" onClick={() => play({ type: "fold" })} data-testid="sabacc-fold">Fold (1 chip into the sabacc pot)</button>
          </>}
          {game.phase === "respond" && <>
            <span className="text-xs text-gray-400">Bet to you: {game.bet - mine.bet} more</span>
            <button className="rounded bg-amber-700 px-2 py-1 hover:bg-amber-600" onClick={() => play({ type: "match" })} data-testid="sabacc-match">Match</button>
            {can("raise") && Array.from({ length: Math.min(game.limit, Math.max(0, mine.credits - (game.bet - mine.bet))) }, (_, n) => <button key={n} className="rounded bg-emerald-800 px-2 py-1 hover:bg-emerald-700" onClick={() => play({ type: "raise", amount: n + 1 })} data-testid={`sabacc-raise-${n + 1}`}>Raise {n + 1}</button>)}
            <button className="rounded bg-red-800 px-2 py-1 hover:bg-red-700" onClick={() => play({ type: "fold" })} data-testid="sabacc-fold">Fold</button>
          </>}
          {game.phase === "shift" && <button className="rounded bg-sky-800 px-2 py-1 hover:bg-sky-700" onClick={() => play({ type: "roll" })} data-testid="sabacc-roll">Roll the shift die (1-3 shifts the cards)</button>}
          {game.phase === "call" && <>
            <button className="rounded bg-emerald-700 px-2 py-1 hover:bg-emerald-600" onClick={() => play({ type: "call" })} data-testid="sabacc-call">Call: all show their cards</button>
            <button className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600" onClick={() => play({ type: "pass" })} data-testid="sabacc-pass">Not yet</button>
          </>}
          {game.phase === "draw" && <>
            <button className="rounded bg-sky-800 px-2 py-1 hover:bg-sky-700" onClick={() => play({ type: "draw" })} data-testid="sabacc-draw">Draw a card</button>
            {mine.cards.length > 2 && <button className="rounded bg-sky-900 px-2 py-1 hover:bg-sky-800 disabled:opacity-40" disabled={selected === null} onClick={() => selected !== null && play({ type: "swap", index: selected })} data-testid="sabacc-swap">Swap the chosen card</button>}
            <button className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600" onClick={() => play({ type: "stand" })} data-testid="sabacc-stand">Stand</button>
          </>}
        </div>
      )}
      {!over && !myTurn && <div className="text-xs italic text-gray-400" data-testid="sabacc-waiting">{mine.folded ? "You have folded; the hand plays on." : `${game.seats[turn].name} is to act...`}</div>}

      {over && game.result && (
        <div className="rounded border border-amber-600 bg-amber-950/60 p-2" data-testid="sabacc-result">
          <div className="font-semibold text-amber-200">{game.result.why}{game.result.takes ? ` (${game.result.takes} chips)` : ""}.</div>
          <div className="mt-1 flex gap-2">
            {!broke && others >= 2 ? <button className="rounded bg-amber-700 px-2 py-1 hover:bg-amber-600" onClick={deal} data-testid="sabacc-next">Deal the next hand</button> : <span className="text-xs text-gray-300">{broke ? "You are out of chips." : "The table has broken up."}</span>}
            <button className="rounded border border-gray-600 px-2 py-1 hover:bg-gray-800" onClick={() => onClose(mine.credits)}>Cash out and leave</button>
          </div>
        </div>
      )}

      <div className="max-h-24 overflow-y-auto rounded bg-black/40 p-1 text-xs text-gray-400" data-testid="sabacc-log">{game.log.slice(-7).map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}

// (the first player of a hand is left of the dealer)
const next0 = (g: Sabacc) => (g.dealer + 1) % g.seats.length;
