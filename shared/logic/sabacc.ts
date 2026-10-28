// ---------------------------------------------------------------------------------------------
// Sabacc, the classic 76-card game (2026-10-27; the user chose it). There is no official rule set ("No definitive sabacc rules were ever
// published"), so this is M. Brent Sleeper's complete procedure for the West End Games deck (pagat.com/docs/sabacc_instructions.txt), the
// one full turn-by-turn set in print, with the two points on which the sources differ settled as HOUSE RULES, said at the table:
//   - Pure Sabacc is 23 or -23 (Ryan B., Star Wars Report, Den of Geek; Sleeper alone has only +23).
//   - A bet may be raised in turn (Sleeper: "raises come in turn"), at most three raises, each of at most the table's limit.
// Pure: nothing here reads a clock or a random of its own (the dice and shuffles take a `createRandom`-shaped source).
//
// The deck: 76 cards. Four suits (Sabers, Staves, Flasks, Coins) of 1 to 11 and the ranked cards Commander 12, Mistress 13, Master 14 and
// Ace 15 (60 cards), and 16 face cards, two of each of eight: The Star -17, The Evil One -15, Moderation -14, Demise -13, Balance -11,
// Endurance -8, Queen of Air and Darkness -2 and The Idiot 0. A hand is worth the sum of its cards; the aim is 23, no higher: over 23, under
// -23 or exactly 0 at the call is "bombed out". Pure Sabacc (23 or -23) wins the sabacc pot as well as the hand pot; the Idiot's Array (the
// Idiot, a 2 and a 3) beats it.
// A hand: each pays 1 into the hand pot (and 1 into the sabacc pot if it is empty); two cards each. In turn, starting left of the dealer,
// each player in four steps: BETTING (open a bet; the others match, raise or fold; a fold costs 1 into the sabacc pot), SHIFTING (the player
// rolls a d6: 1 to 3, every player discards one card at random and the discards are reshuffled and dealt back one each), CALLING (another
// player, once everyone has had a turn, may call: all cards are shown), DRAWING (draw a card, or with more than two cards swap one for the
// top card, or stand). The call: the best total of 23 or less wins the hand pot; whoever bombs out, and a caller who does not win, pays
// into the sabacc pot an amount equal to the hand pot; only a Pure Sabacc or an Idiot's Array wins the sabacc pot as well. A tie is a
// Sudden Demise: each tied player is dealt one more card, and the best total of 23 or less wins; still tied, they split.
// ---------------------------------------------------------------------------------------------
export type Rng = { next: () => number };

export const SUITS = ["sabers", "staves", "flasks", "coins"] as const;
export type Suit = (typeof SUITS)[number];
export interface Card {
  id: string;
  name: string;
  value: number;
  suit?: Suit;
  // 1-11 for a numbered card, 12-15 for Commander, Mistress, Master and Ace; faces have none
  rank?: number;
}
const RANKED = ["Commander", "Mistress", "Master", "Ace"];
const FACES: [string, number][] = [["The Star", -17], ["The Evil One", -15], ["Moderation", -14], ["Demise", -13], ["Balance", -11], ["Endurance", -8], ["Queen of Air and Darkness", -2], ["The Idiot", 0]];
export function sabaccDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 15; rank++) {
    deck.push({ id: `${suit}-${rank}`, suit, rank, value: rank, name: rank <= 11 ? `${rank} of ${suit}` : `${RANKED[rank - 12]} of ${suit}` });
  }
  for (const [name, value] of FACES) for (const copy of [1, 2]) deck.push({ id: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${copy}`, name, value });
  return deck;
}
const shuffled = <T,>(list: readonly T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const handTotal = (cards: Card[]) => cards.reduce((a, c) => a + c.value, 0);
export const isIdiot = (c: Card) => c.name === "The Idiot";
export const bombedOut = (cards: Card[]) => {
  const t = handTotal(cards);
  return t > 23 || t < -23 || t === 0;
};
// Idiot's Array: the Idiot, a 2 and a 3 (numbered cards)
export const idiotsArray = (cards: Card[]) => cards.some(isIdiot) && cards.some((c) => c.rank === 2) && cards.some((c) => c.rank === 3);
export const pureSabacc = (cards: Card[]) => Math.abs(handTotal(cards)) === 23;
// A hand's standing at the call: 3 an Idiot's Array, 2 a Pure Sabacc, 1 a total in range, 0 bombed out
export type Rank = 0 | 1 | 2 | 3;
export const rankOf = (cards: Card[]): Rank => (idiotsArray(cards) ? 3 : bombedOut(cards) ? 0 : pureSabacc(cards) ? 2 : 1);

export interface Seat {
  id: string;
  name: string;
  credits: number;
  cards: Card[];
  folded: boolean;
  // How many turns it has had this hand (a call waits until all have had one)
  turns: number;
  // What it has put into the hand pot this hand (for the betting)
  bet: number;
  human?: boolean;
}
export type Phase = "bet" | "respond" | "shift" | "call" | "draw" | "over";
export interface Sabacc {
  seats: Seat[];
  dealer: number;
  limit: number;
  hand: number;
  deck: Card[];
  handPot: number;
  sabaccPot: number;
  // The player whose turn it is, and the step of it
  turn: number;
  phase: Phase;
  // Betting: the bet to match, how many raises there have been, and who still has to answer it (in order)
  bet: number;
  raises: number;
  pending: number[];
  // Who may still be asked to call, in order
  callers: number[];
  // The shift die last rolled
  die?: number;
  // The end of the hand
  result?: { winners: number[]; why: string; special?: "pure" | "array"; shown: { seat: number; total: number; rank: Rank }[]; takes: number };
  log: string[];
}
export type SabaccAction =
  | { type: "bet"; amount: number }
  | { type: "match" }
  | { type: "raise"; amount: number }
  | { type: "fold" }
  | { type: "roll" }
  | { type: "call" }
  | { type: "pass" }
  | { type: "draw" }
  | { type: "swap"; index: number }
  | { type: "stand" };

const clone = (g: Sabacc): Sabacc => structuredClone(g);
const live = (g: Sabacc) => g.seats.map((s, i) => (s.folded ? -1 : i)).filter((i) => i >= 0);
// Seats in the order they answer a bet or a call: left of `from`, round the table
const fromLeft = (g: Sabacc, from: number) => (a: number, b: number) => ((a - from + g.seats.length) % g.seats.length) - ((b - from + g.seats.length) % g.seats.length);
const next = (g: Sabacc, from: number, includeFolded = false) => {
  for (let k = 1; k <= g.seats.length; k++) {
    const i = (from + k) % g.seats.length;
    if (includeFolded || !g.seats[i].folded) return i;
  }
  return from;
};
const pay = (s: Seat, amount: number) => {
  const paid = Math.max(0, Math.min(s.credits, amount));
  s.credits -= paid;
  return paid;
};
const say = (g: Sabacc, text: string) => { g.log.push(text); };

// A table: the seats (id, name, credits), the limit of a bet or raise (3 in Sleeper's), and the dealer. `deal` starts the first hand.
export function newSabacc(players: { id: string; name: string; credits: number; human?: boolean }[], rng: Rng, limit = 3, dealer = 0): Sabacc {
  const g: Sabacc = {
    seats: players.map((p) => ({ ...p, cards: [], folded: false, turns: 0, bet: 0 })),
    dealer, limit, hand: 0, deck: [], handPot: 0, sabaccPot: 0, turn: 0, phase: "over", bet: 0, raises: 0, pending: [], callers: [], log: [],
  };
  return deal(g, rng);
}

// A new hand: ante, two cards each, the first turn is left of the dealer. A player with no credit for the ante sits out.
export function deal(game: Sabacc, rng: Rng): Sabacc {
  const g = clone(game);
  g.hand += 1;
  g.deck = shuffled(sabaccDeck(), rng);
  g.result = undefined;
  g.die = undefined;
  for (const s of g.seats) { s.cards = []; s.turns = 0; s.bet = 0; s.folded = s.credits < 1; }
  if (live(g).length < 2) { g.phase = "over"; say(g, "Not enough players with credit to play a hand."); return g; }
  // The ante: a credit each into the hand pot, and a credit each into the sabacc pot when it is empty
  const emptyPot = g.sabaccPot === 0;
  for (const i of live(g)) { g.handPot += pay(g.seats[i], 1); if (emptyPot) g.sabaccPot += pay(g.seats[i], 1); }
  for (let round = 0; round < 2; round++) for (const i of live(g)) g.seats[i].cards.push(g.deck.shift()!);
  g.turn = next(g, g.dealer);
  say(g, `Hand ${g.hand}: ${g.seats[g.dealer].name} deals. Hand pot ${g.handPot}, sabacc pot ${g.sabaccPot}.`);
  return beginTurn(g);
}

function beginTurn(g: Sabacc): Sabacc {
  g.phase = "bet";
  g.bet = 0;
  g.raises = 0;
  g.pending = [];
  for (const s of g.seats) s.bet = 0;
  say(g, `${g.seats[g.turn].name}'s turn.`);
  return g;
}

// What the player to act may do now (the seat is `actor(g)`)
export function actor(g: Sabacc): number {
  if (g.phase === "respond") return g.pending[0];
  if (g.phase === "call") return g.callers[0];
  return g.turn;
}
export function sabaccActions(g: Sabacc): SabaccAction[] {
  const seat = g.seats[actor(g)];
  switch (g.phase) {
    case "bet": return [...Array.from({ length: g.limit + 1 }, (_, amount) => ({ type: "bet", amount }) as SabaccAction), { type: "fold" }];
    case "respond": {
      const out: SabaccAction[] = [{ type: "match" }, { type: "fold" }];
      if (g.raises < 3) for (let amount = 1; amount <= g.limit; amount++) out.push({ type: "raise", amount });
      return out;
    }
    case "shift": return [{ type: "roll" }];
    case "call": return [{ type: "call" }, { type: "pass" }];
    case "draw": return [{ type: "draw" }, { type: "stand" }, ...(seat.cards.length > 2 ? seat.cards.map((_, index) => ({ type: "swap", index }) as SabaccAction) : [])];
    default: return [];
  }
}

export function sabaccDo(game: Sabacc, action: SabaccAction, rng: Rng): Sabacc {
  const g = clone(game);
  const who = actor(g);
  const seat = g.seats[who];
  switch (g.phase) {
    case "bet": {
      if (action.type === "fold") return fold(g, who);
      if (action.type !== "bet") return g;
      const amount = Math.max(0, Math.min(g.limit, Math.floor(action.amount), seat.credits));
      g.bet = amount;
      g.handPot += pay(seat, amount);
      seat.bet = amount;
      if (amount) say(g, `${seat.name} bets ${amount}.`);
      g.pending = amount ? live(g).filter((i) => i !== who) : [];
      // (the others answer in turn, starting left of the better)
      g.pending.sort(fromLeft(g, who));
      return g.pending.length ? ((g.phase = "respond"), g) : toShift(g);
    }
    case "respond": {
      if (action.type === "fold") return fold(g, who);
      if (action.type === "raise" && g.raises < 3) {
        const raise = Math.max(1, Math.min(g.limit, Math.floor(action.amount)));
        const owed = g.bet + raise - seat.bet;
        g.handPot += pay(seat, owed);
        seat.bet = g.bet + raise;
        g.bet += raise;
        g.raises += 1;
        say(g, `${seat.name} raises ${raise} (to ${g.bet}).`);
        // everyone else (the opener too) must answer the raise
        g.pending = live(g).filter((i) => i !== who).sort(fromLeft(g, who));
        return g;
      }
      // match
      const owed = g.bet - seat.bet;
      g.handPot += pay(seat, owed);
      seat.bet = g.bet;
      say(g, `${seat.name} matches ${g.bet}.`);
      g.pending.shift();
      return g.pending.length ? g : live(g).length < 2 ? finishUnopposed(g) : toShift(g);
    }
    case "shift": {
      g.die = 1 + Math.floor(rng.next() * 6);
      say(g, `${seat.name} rolls a ${g.die}${g.die <= 3 ? ": a sabacc shift!" : ": no shift."}`);
      if (g.die <= 3) shift(g, rng);
      return toCall(g);
    }
    case "call": {
      if (action.type === "call") return resolve(g, rng, who);
      g.callers.shift();
      return g.callers.length ? g : toDraw(g);
    }
    case "draw": {
      if (seat.folded) return endTurn(g);
      if (action.type === "draw") {
        const card = g.deck.shift();
        if (card) { seat.cards.push(card); say(g, `${seat.name} draws a card.`); }
      } else if (action.type === "swap" && seat.cards.length > 2 && seat.cards[action.index]) {
        const out = seat.cards.splice(action.index, 1)[0];
        const card = g.deck.shift();
        if (card) seat.cards.push(card);
        say(g, `${seat.name} swaps ${out.name} for a card from the deck.`);
      } else say(g, `${seat.name} stands.`);
      return endTurn(g);
    }
    default: return g;
  }
}

function fold(g: Sabacc, who: number): Sabacc {
  const s = g.seats[who];
  s.folded = true;
  g.sabaccPot += pay(s, 1);
  say(g, `${s.name} folds, and puts 1 into the sabacc pot.`);
  if (live(g).length < 2) return finishUnopposed(g);
  g.pending = g.pending.filter((i) => i !== who);
  if (g.phase === "bet" && who === g.turn) return toShift(g);
  if (g.phase === "respond" && !g.pending.length) return toShift(g);
  return g;
}
// Everyone but one has folded: they take the hand pot
function finishUnopposed(g: Sabacc): Sabacc {
  const [winner] = live(g);
  const takes = g.handPot;
  g.seats[winner].credits += takes;
  g.handPot = 0;
  g.phase = "over";
  g.result = { winners: [winner], why: `${g.seats[winner].name} wins the hand pot, all others having folded`, shown: [], takes };
  say(g, g.result.why + ".");
  return g;
}

function toShift(g: Sabacc): Sabacc {
  g.phase = "shift";
  g.pending = [];
  return g;
}
// A shift: each live player discards a card at random, the discards are shuffled and dealt back, one each
function shift(g: Sabacc, rng: Rng) {
  const players = live(g).filter((i) => g.seats[i].cards.length > 0);
  const pool: Card[] = [];
  for (const i of players) {
    const [out] = g.seats[i].cards.splice(Math.floor(rng.next() * g.seats[i].cards.length), 1);
    pool.push(out);
  }
  const back = shuffled(pool, rng);
  players.forEach((i, k) => g.seats[i].cards.push(back[k]));
}
// The call: another player may call, once everyone has had a turn
function toCall(g: Sabacc): Sabacc {
  g.phase = "call";
  // (no calls until every player, the dealer too, has had a turn)
  const everyone = live(g).every((i) => g.seats[i].turns >= 1);
  g.callers = everyone ? live(g).filter((i) => i !== g.turn).sort(fromLeft(g, g.turn)) : [];
  return g.callers.length ? g : toDraw(g);
}
function toDraw(g: Sabacc): Sabacc {
  g.phase = "draw";
  g.callers = [];
  // (a player who has folded does not draw)
  if (g.seats[g.turn].folded) return endTurn(g);
  return g;
}
function endTurn(g: Sabacc): Sabacc {
  g.seats[g.turn].turns += 1;
  g.turn = next(g, g.turn);
  return beginTurn(g);
}

// The hand's totals at the call, and who wins what
function resolve(g: Sabacc, rng: Rng, caller: number): Sabacc {
  const shown = live(g).map((seat) => ({ seat, total: handTotal(g.seats[seat].cards), rank: rankOf(g.seats[seat].cards) }));
  say(g, `${g.seats[caller].name} calls! ${shown.map((h) => `${g.seats[h.seat].name} ${h.total}`).join(", ")}.`);
  const top = Math.max(...shown.map((h) => h.rank));
  let winners: number[];
  let why: string;
  if (top === 0) {
    // everyone bombed out: no winner, the hand pot goes to the sabacc pot
    winners = [];
    why = "everyone bombs out: the hand pot goes into the sabacc pot";
  } else {
    let tied = shown.filter((h) => h.rank === top);
    if (top < 2) {
      const best = Math.max(...tied.map((h) => h.total));
      tied = tied.filter((h) => h.total === best);
    }
    winners = tied.map((h) => h.seat);
    // A Sudden Demise: each tied player is dealt one more card; the best total in range wins, still tied they split
    if (winners.length > 1) {
      say(g, `A tie: sudden demise between ${winners.map((i) => g.seats[i].name).join(" and ")}.`);
      for (const i of winners) { const c = g.deck.shift(); if (c) g.seats[i].cards.push(c); }
      const after = winners.map((i) => ({ i, t: handTotal(g.seats[i].cards), ok: !bombedOut(g.seats[i].cards) }));
      const ok = after.filter((a) => a.ok);
      if (ok.length) {
        const best = Math.max(...ok.map((a) => a.t));
        winners = ok.filter((a) => a.t === best).map((a) => a.i);
      }
    }
    why = `${winners.map((i) => g.seats[i].name).join(" and ")} win${winners.length === 1 ? "s" : ""}${top === 3 ? " with the Idiot's Array" : top === 2 ? " with a Pure Sabacc" : ""}`;
  }
  const special = top === 3 ? "array" : top === 2 ? "pure" : undefined;
  // Bombed-out players, and a caller who does not win, pay into the sabacc pot an amount equal to the hand pot
  const penalty = g.handPot;
  const losers = new Set<number>(shown.filter((h) => h.rank === 0).map((h) => h.seat));
  if (!winners.includes(caller)) losers.add(caller);
  for (const i of losers) {
    const paid = pay(g.seats[i], penalty);
    g.sabaccPot += paid;
    say(g, `${g.seats[i].name} ${shown.find((h) => h.seat === i)?.rank === 0 ? "bombs out" : "called and lost"} and pays ${paid} into the sabacc pot.`);
  }
  let takes = 0;
  if (winners.length) {
    takes = g.handPot + (special ? g.sabaccPot : 0);
    const share = Math.floor(takes / winners.length);
    for (const i of winners) g.seats[i].credits += share;
    // (a remainder from a split stays in the hand pot for the next hand)
    const left = takes - share * winners.length;
    g.handPot = 0;
    if (special) g.sabaccPot = 0;
    g.handPot += left;
  } else {
    g.sabaccPot += g.handPot;
    g.handPot = 0;
  }
  g.phase = "over";
  g.result = { winners, why, special, shown: shown.map((h) => ({ seat: h.seat, total: handTotal(g.seats[h.seat].cards), rank: rankOf(g.seats[h.seat].cards) })), takes };
  say(g, `${why}${takes ? `, taking ${takes}` : ""}.`);
  return g;
}

// The next hand: the dealer passes left
export function nextHand(g: Sabacc, rng: Rng): Sabacc {
  const c = clone(g);
  c.dealer = next(c, c.dealer, true);
  return deal(c, rng);
}
// The credits in the game: seats and both pots, which a hand never changes (for the tests)
export const sabaccMoney = (g: Sabacc) => g.seats.reduce((a, s) => a + s.credits, 0) + g.handPot + g.sabaccPot;

// What the computer plays: the quality of the hand (how near 23 without going over, a special hand, or out), and what it does with it
export function sabaccAi(g: Sabacc, rng: Rng): SabaccAction {
  const seat = g.seats[actor(g)];
  const t = handTotal(seat.cards);
  const rank = rankOf(seat.cards);
  const near = rank >= 2 || (t >= 18 && t <= 23);
  const fair = t >= 10 && t <= 23;
  switch (g.phase) {
    case "bet": {
      if (rank >= 2) return { type: "bet", amount: g.limit };
      return { type: "bet", amount: near ? Math.min(g.limit, 2) : fair && rng.next() < 0.5 ? 1 : 0 };
    }
    case "respond": {
      if (rank >= 2 && g.raises < 3 && rng.next() < 0.5) return { type: "raise", amount: 1 };
      if (rank === 0 && g.bet > 1 && rng.next() < 0.6) return { type: "fold" };
      if (!fair && g.bet >= 2 && rng.next() < 0.5) return { type: "fold" };
      return { type: "match" };
    }
    case "shift": return { type: "roll" };
    case "call": return rank >= 2 || (t >= 20 && t <= 23) ? { type: "call" } : { type: "pass" };
    case "draw": {
      if (rank >= 2 || (t >= 19 && t <= 23)) return { type: "stand" };
      if (seat.cards.length > 2 && (t > 23 || t <= 0)) {
        // swap out the card that does the most harm
        const worst = seat.cards.map((c, index) => ({ index, harm: t > 23 ? c.value : -c.value })).sort((a, b) => b.harm - a.harm)[0];
        return { type: "swap", index: worst.index };
      }
      return t <= 17 || t > 23 || t <= 0 ? { type: "draw" } : { type: "stand" };
    }
    default: return { type: "stand" };
  }
}
