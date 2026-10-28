// ---------------------------------------------------------------------------------------------
// Pazaak (2026-10-27; the rules are the ones the user gave, the Knights of the Old Republic game). Pure: no clock, no random of its own
// (the shuffles and draws take the project's `createRandom`-shaped source), so the tests and the table can both play it.
//
// A 40-card main deck (four of each 1-10) and each player's side deck of up to 10 cards (+1..+6, -1..-6, or flip +/- cards); each player is
// dealt 4 random cards of the side deck as a HAND that lasts the whole match (a hand card is played once per match). A SET: the player to
// move draws a main-deck card and plays it face up, may then play at most one hand card (a flip card is declared + or - when played, for
// good), and then ENDS THE TURN (draws again next turn) or STANDS (no more cards this set). The set is won by the higher total of 20 or
// less; over 20 at the end of one's own turn is a bust and loses it; equal totals replay the set; nine cards in play without a bust
// wins the set at once. The first to win 3 sets wins the match and the wager.
// ---------------------------------------------------------------------------------------------
export type Rng = { next: () => number };

// A side card: its sign is fixed (plus, minus) or chosen when it is played (flip)
export interface SideCard {
  kind: "plus" | "minus" | "flip";
  value: number;
}
export const SIDE_MAX = 10;
export const HAND_SIZE = 4;
export const PAZAAK_TARGET = 20;
export const NINE = 9;
export const SETS_TO_WIN = 3;

export const sideLabel = (c: SideCard) => (c.kind === "plus" ? `+${c.value}` : c.kind === "minus" ? `-${c.value}` : `±${c.value}`);
export const mainDeck = (): number[] => Array.from({ length: 40 }, (_, i) => (i % 10) + 1);
const shuffled = <T,>(list: readonly T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
// The plain side deck a beginner starts with (all +1 to +5, twice each: the game's own starting deck)
export const startingSideDeck = (): SideCard[] => [1, 2, 3, 4, 5, 1, 2, 3, 4, 5].map((value) => ({ kind: "plus" as const, value }));
// A side deck is legal when it holds at most 10 cards of +-1 to +-6
export const legalSideDeck = (deck: SideCard[]) => deck.length > 0 && deck.length <= SIDE_MAX && deck.every((c) => Number.isInteger(c.value) && c.value >= 1 && c.value <= 6);

export interface PazaakSide {
  name: string;
  // The hand: what is left of the four dealt for the match (a played card leaves it)
  hand: SideCard[];
  // The values in play this set, in the order they came (main-deck cards and hand cards played)
  table: number[];
  // The hand card played this turn (only one a turn)
  played: boolean;
  standing: boolean;
  // Sets won this match
  sets: number;
}
export type PazaakAction =
  | { type: "play"; index: number; sign?: 1 | -1 }
  | { type: "end" }
  | { type: "stand" };
export interface Pazaak {
  deck: number[];
  sides: [PazaakSide, PazaakSide];
  // Who is to move, and who began the match (the other begins the next set)
  turn: 0 | 1;
  firstOfSet: 0 | 1;
  // "turn": the player to move has drawn and may act; "set": a set has ended (`last`), `next` starts the next; "match": the match is over
  phase: "turn" | "set" | "match";
  setNumber: number;
  // How the last set ended
  last?: { winner: 0 | 1 | null; why: string; totals: [number, number] };
  winner?: 0 | 1;
  log: string[];
}
export const total = (s: Pick<PazaakSide, "table">) => s.table.reduce((a, b) => a + b, 0);

const clone = (g: Pazaak): Pazaak => structuredClone(g);
const sideName = (g: Pazaak, who: 0 | 1) => g.sides[who].name;

// A match: each side's deck (up to 10 cards), four dealt at random to each hand
export function newPazaak(names: [string, string], decks: [SideCard[], SideCard[]], rng: Rng, first: 0 | 1 = 0): Pazaak {
  if (!decks.every(legalSideDeck)) throw new Error("A side deck holds 1 to 10 cards of +-1 to +-6");
  const side = (i: 0 | 1): PazaakSide => ({ name: names[i], hand: shuffled(decks[i], rng).slice(0, HAND_SIZE), table: [], played: false, standing: false, sets: 0 });
  const g: Pazaak = { deck: [], sides: [side(0), side(1)], turn: first, firstOfSet: first, phase: "turn", setNumber: 1, log: [] };
  return beginSet(g, rng);
}

// A new set: a freshly shuffled main deck, nothing in play; the player to move draws
function beginSet(g: Pazaak, rng: Rng): Pazaak {
  g.deck = shuffled(mainDeck(), rng);
  for (const s of g.sides) { s.table = []; s.played = false; s.standing = false; }
  g.turn = g.firstOfSet;
  g.phase = "turn";
  g.log.push(`Set ${g.setNumber}: ${sideName(g, g.turn)} to play.`);
  return drawFor(g);
}
// The player to move draws a main-deck card and plays it face up
function drawFor(g: Pazaak): Pazaak {
  const s = g.sides[g.turn];
  s.played = false;
  const card = g.deck.shift()!;
  s.table.push(card);
  g.log.push(`${s.name} draws ${card} (${total(s)}).`);
  return nineCheck(g);
}
// Nine cards in play: the player stands at once, and wins the set unless over 20
function nineCheck(g: Pazaak): Pazaak {
  const s = g.sides[g.turn];
  if (s.table.length < NINE) return g;
  s.standing = true;
  g.log.push(`${s.name} has nine cards in play.`);
  return finishTurn(g, true);
}

// What the player to move may do now
export function pazaakActions(g: Pazaak): PazaakAction[] {
  if (g.phase !== "turn") return [];
  const s = g.sides[g.turn];
  const out: PazaakAction[] = [{ type: "end" }, { type: "stand" }];
  if (!s.played) s.hand.forEach((c, index) => {
    if (c.kind === "flip") out.push({ type: "play", index, sign: 1 }, { type: "play", index, sign: -1 });
    else out.push({ type: "play", index });
  });
  return out;
}

export function pazaakDo(game: Pazaak, action: PazaakAction, rng: Rng): Pazaak {
  const g = clone(game);
  if (g.phase === "set") return beginNextSet(g, rng);
  if (g.phase !== "turn") return g;
  const who = g.turn;
  const s = g.sides[who];
  if (action.type === "play") {
    const card = s.hand[action.index];
    if (!card || s.played) return g;
    const sign = card.kind === "plus" ? 1 : card.kind === "minus" ? -1 : action.sign;
    if (!sign) throw new Error("A flip card is played as plus or as minus");
    s.hand.splice(action.index, 1);
    s.table.push(sign * card.value);
    s.played = true;
    g.log.push(`${s.name} plays ${sign > 0 ? "+" : "-"}${card.value} (${total(s)}).`);
    return nineCheck(g);
  }
  if (action.type === "stand") {
    s.standing = true;
    g.log.push(`${s.name} stands on ${total(s)}.`);
  } else g.log.push(`${s.name} ends the turn on ${total(s)}.`);
  return finishTurn(g, false);
}

// The turn is over (by choice, by standing or by a ninth card): over 20 is a bust; else the set is decided if both stand or the nine are
// in; else the move goes to the other player (or stays if the other stands)
function finishTurn(g: Pazaak, nine: boolean): Pazaak {
  const who = g.turn;
  const other = (1 - who) as 0 | 1;
  const mine = total(g.sides[who]);
  if (mine > PAZAAK_TARGET) return endSet(g, other, `${sideName(g, who)} busts on ${mine}`);
  if (nine) return endSet(g, who, `${sideName(g, who)} wins with nine cards in play (${mine})`);
  const [a, b] = g.sides;
  if (a.standing && b.standing) {
    const [ta, tb] = [total(a), total(b)];
    if (ta === tb) return endSet(g, null, `both stand on ${ta}: the set is replayed`);
    return endSet(g, ta > tb ? 0 : 1, `${ta > tb ? a.name : b.name} wins ${Math.max(ta, tb)} to ${Math.min(ta, tb)}`);
  }
  // On to the next turn: the other player's, unless they stand
  g.turn = g.sides[other].standing ? who : other;
  return drawFor(g);
}

function endSet(g: Pazaak, winner: 0 | 1 | null, why: string): Pazaak {
  g.last = { winner, why, totals: [total(g.sides[0]), total(g.sides[1])] };
  g.log.push(`Set ${g.setNumber}: ${why}.`);
  if (winner !== null) {
    g.sides[winner].sets += 1;
    if (g.sides[winner].sets >= SETS_TO_WIN) {
      g.phase = "match";
      g.winner = winner;
      g.log.push(`${g.sides[winner].name} wins the match, ${g.sides[winner].sets} sets to ${g.sides[1 - winner].sets}.`);
      return g;
    }
  }
  g.phase = "set";
  return g;
}
// The next set, after one has ended (a tied set is played again and not counted; otherwise the player who did not begin the last one begins)
function beginNextSet(g: Pazaak, rng: Rng): Pazaak {
  if (g.last?.winner !== null) g.firstOfSet = (1 - g.firstOfSet) as 0 | 1;
  g.setNumber += 1;
  return beginSet(g, rng);
}
export const nextSet = (g: Pazaak, rng: Rng): Pazaak => (g.phase === "set" ? beginNextSet(clone(g), rng) : g);

// What the computer plays (a plain player of the game): hit up to 17; use a hand card to get out of a bust, or to make 19 or 20, or to beat a
// standing opponent; stand on 17 or more unless the opponent's standing total beats it
export function pazaakAi(g: Pazaak): PazaakAction {
  const me = g.sides[g.turn];
  const foe = g.sides[1 - g.turn];
  const t = total(me);
  const foeStands = foe.standing;
  const foeTotal = total(foe);
  const options: { action: PazaakAction; after: number }[] = [];
  if (!me.played) me.hand.forEach((c, index) => {
    const signs: (1 | -1)[] = c.kind === "plus" ? [1] : c.kind === "minus" ? [-1] : [1, -1];
    for (const sign of signs) options.push({ action: c.kind === "flip" ? { type: "play", index, sign } : { type: "play", index }, after: t + sign * c.value });
  });
  const good = (after: number) => after <= PAZAAK_TARGET;
  // over 20: the card that brings it back highest
  if (t > PAZAAK_TARGET) {
    const fix = options.filter((o) => good(o.after)).sort((a, b) => b.after - a.after)[0];
    return fix ? fix.action : { type: "end" };
  }
  // a standing opponent has to be beaten
  if (foeStands && foeTotal <= PAZAAK_TARGET) {
    if (t > foeTotal) return { type: "stand" };
    const beat = options.filter((o) => good(o.after) && o.after > foeTotal).sort((a, b) => a.after - b.after)[0];
    if (beat) return beat.action;
    return t === foeTotal && t >= 17 ? { type: "stand" } : { type: "end" };
  }
  if (t >= 19) return { type: "stand" };
  const sharp = options.filter((o) => o.after === 19 || o.after === 20).sort((a, b) => b.after - a.after)[0];
  if (sharp && t >= 14) return sharp.action;
  if (t >= 17) return { type: "stand" };
  return { type: "end" };
}
