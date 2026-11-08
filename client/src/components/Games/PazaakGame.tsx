// A match of Pazaak against someone (2026-10-27), by the rules in shared/logic/pazaak.ts: a green main deck and a hand of four side cards each,
// first to three sets. The wager is paid out by the page (`onDone`): the winner takes both stakes.
import { useEffect, useRef, useState } from "react";
import { createRandom } from "@shared/logic";
import { newPazaak, nextSet, pazaakActions, pazaakAi, pazaakDo, total, type Pazaak, type PazaakAction, type SideCard } from "@shared/logic/pazaak";
import { PazaakCardFace } from "./cards";

// A decent side deck for someone who plays: +1 to +5, -1 to -3 and two flips (the plain starting deck is all plus cards)
export const playerDeck = (): SideCard[] => [...[1, 2, 3, 4, 5].map((value) => ({ kind: "plus" as const, value })), ...[1, 2, 3].map((value) => ({ kind: "minus" as const, value })), { kind: "flip", value: 1 }, { kind: "flip", value: 2 }];
// The other player's deck by how good they are (0 to 3): the better ones carry bigger cards and flips
export function rivalDeck(skill: number, rng: { next: () => number }): SideCard[] {
  const pool: SideCard[] = [];
  for (let v = 1; v <= 6; v++) { pool.push({ kind: "plus", value: v }, { kind: "minus", value: v }); }
  for (let v = 1; v <= 3 + skill; v++) pool.push({ kind: "flip", value: Math.min(6, v + 1) });
  const picked = [...pool].sort(() => rng.next() - 0.5).slice(0, 9 + (skill > 1 ? 1 : 0));
  return picked.sort((a, b) => b.value - a.value).slice(0, 10);
}

export function PazaakGame({ player, rival, stake, skill = 1, onGesture, onDone }: {
  player: string;
  rival: string;
  stake: number;
  skill?: number;
  onGesture?: (shot: "draw" | "bet" | "call" | "fold" | "think") => void;
  // The match is over: the credits the player is paid back (twice the stake if they won, none if they lost), and whether they won
  onDone: (paid: number, won: boolean) => void;
}) {
  const rng = useRef(createRandom((Date.now() & 0xffffff) + 7));
  const [g, setG] = useState<Pazaak>(() => newPazaak([player, rival], [playerDeck(), rivalDeck(skill, rng.current)], rng.current, 0));
  const ref = useRef(g);
  ref.current = g;
  const [flip, setFlip] = useState<number | null>(null);
  const me = 0;
  const act = (a: PazaakAction) => {
    const next = pazaakDo(ref.current, a, rng.current);
    ref.current = next;
    setG(next);
    setFlip(null);
  };
  // The other player plays after a moment
  useEffect(() => {
    if (g.phase !== "turn" || g.turn === me) return;
    const t = setTimeout(() => act(pazaakAi(ref.current)), 800);
    return () => clearTimeout(t);
  }, [g]);
  const mine = g.sides[me];
  const theirs = g.sides[1];
  const myTurn = g.phase === "turn" && g.turn === me;
  const actions = myTurn ? pazaakActions(g) : [];
  const over = g.phase === "match";
  const won = over && g.winner === me;
  const board = (s: Pazaak["sides"][number], who: number) => (
    <div className={`rounded border px-2 py-1 ${g.phase === "turn" && g.turn === who ? "border-amber-500 bg-amber-950/30" : "border-gray-700 bg-gray-900"}`} data-testid={`pazaak-board-${who}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{s.name}{s.standing ? " · standing" : ""}</span>
        <span>Sets {"●".repeat(s.sets)}{"○".repeat(3 - s.sets)} · <b className={total(s) > 20 ? "text-red-300" : "text-emerald-300"} data-testid={`pazaak-total-${who}`}>{total(s)}</b></span>
      </div>
      <div className="mt-1 flex min-h-[70px] flex-wrap gap-1">
        {s.table.map((v, i) => <PazaakCardFace key={i} value={v} />)}
      </div>
    </div>
  );
  return (
    <div className="pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto rounded-lg border border-emerald-700/60 bg-gray-950 p-3 text-sm text-gray-100 shadow-xl" data-testid="pazaak-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-emerald-300">Pazaak against {rival}</div>
          <div className="text-xs text-gray-400">Closest to 20 without going over; first to 3 sets takes the wager of {stake * 2} cr.</div>
        </div>
        {!over && <button className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800" onClick={() => onDone(0, false)} data-testid="pazaak-forfeit">Forfeit</button>}
      </div>
      {board(theirs, 1)}
      {board(mine, 0)}
      <div className="rounded border border-gray-700 bg-gray-900 p-2" data-testid="pazaak-hand">
        <div className="mb-1 text-xs text-gray-400">Your hand (one card a turn, and a card is used for the match){flip !== null ? ": choose its sign" : ""}</div>
        <div className="flex flex-wrap items-center gap-2">
          {mine.hand.map((c, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <PazaakCardFace side={c} onClick={myTurn && !mine.played ? () => (c.kind === "flip" ? setFlip(flip === i ? null : i) : (onGesture?.("draw"), act({ type: "play", index: i }))) : undefined} />
              {flip === i && (
                <span className="flex gap-1">
                  <button className="rounded bg-blue-700 px-1 text-xs" onClick={() => (onGesture?.("draw"), act({ type: "play", index: i, sign: 1 }))} data-testid="pazaak-flip-plus">+{c.value}</button>
                  <button className="rounded bg-red-700 px-1 text-xs" onClick={() => (onGesture?.("draw"), act({ type: "play", index: i, sign: -1 }))} data-testid="pazaak-flip-minus">-{c.value}</button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {myTurn && (
        <div className="flex flex-wrap gap-2" data-testid="pazaak-actions">
          <button className="rounded bg-emerald-800 px-2 py-1 hover:bg-emerald-700 disabled:opacity-40" disabled={!actions.some((a) => a.type === "end")} onClick={() => (onGesture?.("think"), act({ type: "end" }))} data-testid="pazaak-end">End turn (draw next turn)</button>
          <button className="rounded bg-amber-800 px-2 py-1 hover:bg-amber-700 disabled:opacity-40" disabled={!actions.some((a) => a.type === "stand")} onClick={() => (onGesture?.("call"), act({ type: "stand" }))} data-testid="pazaak-stand">Stand on {total(mine)}</button>
        </div>
      )}
      {g.phase === "turn" && !myTurn && <div className="text-xs italic text-gray-400">{theirs.name} is playing...</div>}
      {g.phase === "set" && g.last && (
        <div className="rounded border border-amber-600 bg-amber-950/60 p-2" data-testid="pazaak-set-result">
          <div className="font-semibold text-amber-200">{g.last.why}.</div>
          <button className="mt-1 rounded bg-amber-700 px-2 py-1 hover:bg-amber-600" onClick={() => { const n = nextSet(ref.current, rng.current); ref.current = n; setG(n); }} data-testid="pazaak-next">Next set</button>
        </div>
      )}
      {over && (
        <div className={`rounded border p-2 ${won ? "border-green-600 bg-green-950/50" : "border-red-700 bg-red-950/40"}`} data-testid="pazaak-match-result">
          <div className="font-semibold">{won ? `You win the match, ${mine.sets} sets to ${theirs.sets}, and the wager: ${stake * 2} cr.` : `${theirs.name} wins the match, ${theirs.sets} sets to ${mine.sets}. Your ${stake} cr are gone.`}</div>
          <button className="mt-1 rounded border border-gray-500 px-2 py-1 hover:bg-gray-800" onClick={() => onDone(won ? stake * 2 : 0, won)} data-testid="pazaak-done">Leave the table</button>
        </div>
      )}
      <div className="max-h-20 overflow-y-auto rounded bg-black/40 p-1 text-xs text-gray-400">{g.log.slice(-5).map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}
