// Classic 76-card Sabacc (2026-10-27): the deck, the hands, the call, and whole hands played by the computer with the money kept
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { sabaccDeck, handTotal, bombedOut, idiotsArray, pureSabacc, rankOf, newSabacc, sabaccDo, sabaccAi, sabaccActions, sabaccMoney, nextHand, actor, type Sabacc, type Card } from "../../shared/logic/sabacc";

const deck = sabaccDeck();
const card = (id: string): Card => {
  const c = deck.find((x) => x.id === id);
  assert.ok(c, `no card ${id}`);
  return c!;
};
const idiot = () => deck.find((c) => c.name === "The Idiot")!;
const table = (n = 3, credits = 50) => newSabacc(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, credits })), createRandom(3));

test("the deck: 76 cards, four suits of 1-11 and Commander, Mistress, Master, Ace (12-15), and sixteen faces two of each", () => {
  assert.equal(deck.length, 76);
  assert.equal(new Set(deck.map((c) => c.id)).size, 76);
  for (const suit of ["sabers", "staves", "flasks", "coins"]) {
    const cards = deck.filter((c) => c.suit === suit);
    assert.equal(cards.length, 15);
    assert.deepEqual(cards.map((c) => c.value), Array.from({ length: 15 }, (_, i) => i + 1));
  }
  assert.equal(card("coins-12").name, "Commander of coins");
  assert.equal(card("sabers-15").name, "Ace of sabers");
  const faces = deck.filter((c) => !c.suit);
  assert.equal(faces.length, 16);
  const values: Record<string, number> = { "The Star": -17, "The Evil One": -15, Moderation: -14, Demise: -13, Balance: -11, Endurance: -8, "Queen of Air and Darkness": -2, "The Idiot": 0 };
  for (const [name, v] of Object.entries(values)) assert.deepEqual(faces.filter((c) => c.name === name).map((c) => c.value), [v, v], name);
});

test("a hand: the sum of its cards; over 23, under -23 and exactly 0 bomb out; Pure Sabacc is 23 or -23; the Idiot's Array beats it", () => {
  assert.equal(handTotal([card("coins-10"), card("flasks-13")]), 23);
  assert.equal(pureSabacc([card("coins-10"), card("flasks-13")]), true);
  assert.equal(pureSabacc([card("the-star-1"), card("the-evil-one-1"), card("sabers-9")]), true, "-17 -15 +9 = -23");
  assert.equal(bombedOut([card("coins-15"), card("flasks-9")]), true, "24");
  assert.equal(bombedOut([card("the-star-1"), card("the-evil-one-1"), card("moderation-1")]), true, "under -23");
  assert.equal(bombedOut([card("coins-4"), card("sabers-4"), card("the-evil-one-1"), card("sabers-7")]), true, "exactly 0");
  assert.equal(bombedOut([card("coins-4"), card("sabers-3")]), false);
  const array = [idiot(), card("flasks-2"), card("staves-3")];
  assert.equal(handTotal(array), 5);
  assert.equal(idiotsArray(array), true);
  assert.equal(idiotsArray([idiot(), card("flasks-2"), card("staves-4")]), false);
  assert.ok(rankOf(array) > rankOf([card("coins-10"), card("flasks-13")]));
  assert.ok(rankOf([card("coins-10"), card("flasks-13")]) > rankOf([card("coins-10"), card("flasks-12")]));
  assert.equal(rankOf([card("coins-15"), card("flasks-9")]), 0);
});

test("a hand begins with the ante and two cards each; no call is possible before everyone has had a turn", () => {
  const g = table(3, 50);
  assert.equal(g.handPot, 3);
  assert.equal(g.sabaccPot, 3, "a credit each into the sabacc pot while it is empty");
  assert.equal(sabaccMoney(g), 150);
  for (const s of g.seats) assert.equal(s.cards.length, 2);
  assert.equal(g.turn, 1, "the first turn is left of the dealer");
  assert.equal(g.phase, "bet");
  const rng = createRandom(4);
  let h = sabaccDo(g, { type: "bet", amount: 0 }, rng);
  assert.equal(h.phase, "shift");
  h = sabaccDo(h, { type: "roll" }, rng);
  assert.equal(h.phase, "draw", "no one may call yet");
});

test("betting: the others match, raise or fold; a fold costs a credit into the sabacc pot; everyone folding but one ends the hand", () => {
  const rng = createRandom(8);
  let g = table(3, 50);
  const before = sabaccMoney(g);
  g = sabaccDo(g, { type: "bet", amount: 2 }, rng);
  assert.equal(g.phase, "respond");
  assert.deepEqual(g.pending, [2, 0]);
  assert.equal(actor(g), 2);
  g = sabaccDo(g, { type: "match" }, rng);
  g = sabaccDo(g, { type: "raise", amount: 1 }, rng);
  assert.equal(g.bet, 3);
  // the opener and the other player must answer the raise
  assert.deepEqual([...g.pending].sort(), [1, 2]);
  const pot = g.sabaccPot;
  g = sabaccDo(g, { type: "fold" }, rng);
  assert.equal(g.sabaccPot, pot + 1, "a fold costs a credit into the sabacc pot");
  assert.equal(sabaccMoney(g), before);
  // two players: the one who is bet against and folds loses the hand pot at once
  let two = newSabacc([{ id: "a", name: "A", credits: 20 }, { id: "b", name: "B", credits: 20 }], createRandom(2));
  two = sabaccDo(two, { type: "bet", amount: 3 }, rng);
  two = sabaccDo(two, { type: "fold" }, rng);
  assert.equal(two.phase, "over");
  assert.equal(two.result?.winners.length, 1);
  assert.equal(sabaccMoney(two), 40);
});

test("the shift: on 1 to 3 every live player discards one card and the discards are dealt back one each; 4 to 6 is no shift", () => {
  const g = table(3, 50);
  const low = { next: () => 0.0 }; // a roll of 1
  const counts = g.seats.map((s) => s.cards.length);
  let h = sabaccDo(g, { type: "bet", amount: 0 }, low);
  const ids = h.seats.flatMap((s) => s.cards.map((c) => c.id)).sort();
  h = sabaccDo(h, { type: "roll" }, low);
  assert.equal(h.die, 1);
  assert.deepEqual(h.seats.flatMap((s) => s.cards.map((c) => c.id)).sort(), ids, "the same cards, dealt back");
  assert.deepEqual(h.seats.map((s) => s.cards.length), counts);
  const none = sabaccDo(sabaccDo(g, { type: "bet", amount: 0 }, low), { type: "roll" }, { next: () => 0.99 });
  assert.equal(none.die, 6);
  assert.match(none.log.join(" "), /no shift/);
});

const forCall = (cards: Card[][], handPot = 12, sabaccPot = 9): Sabacc => {
  const g = table(cards.length, 50);
  g.seats.forEach((s, i) => { s.cards = cards[i]; s.turns = 1; s.credits = 50; });
  g.phase = "call";
  g.turn = 0;
  g.callers = [1];
  g.handPot = handPot;
  g.sabaccPot = sabaccPot;
  return g;
};
test("the call: the best total of 23 or less takes the hand pot; one who bombs out, and a caller who loses, pay the hand pot's amount into the sabacc pot", () => {
  const rng = createRandom(1);
  // P0 has 21, P1 (the caller) 19, P2 bombs out (24)
  let g = forCall([[card("coins-10"), card("flasks-11")], [card("coins-9"), card("flasks-10")], [card("coins-15"), card("flasks-9")]]);
  const money = sabaccMoney(g);
  g = sabaccDo(g, { type: "call" }, rng);
  assert.equal(g.phase, "over");
  assert.deepEqual(g.result?.winners, [0]);
  assert.equal(g.seats[0].credits, 50 + 12, "the hand pot");
  assert.equal(g.seats[2].credits, 50 - 12, "the bust pays 12 into the sabacc pot");
  assert.equal(g.seats[1].credits, 50 - 12, "the caller did not win, and pays the same");
  assert.equal(g.sabaccPot, 9 + 24);
  assert.equal(sabaccMoney(g), money);
});

test("Pure Sabacc wins the sabacc pot as well; the Idiot's Array beats a Pure Sabacc", () => {
  const rng = createRandom(1);
  let g = forCall([[card("coins-10"), card("flasks-13")], [card("coins-9"), card("flasks-10")]]);
  g = sabaccDo(g, { type: "call" }, rng);
  assert.equal(g.result?.special, "pure");
  // the caller lost and paid 12 into the sabacc pot, which the Pure Sabacc then takes with the hand pot: 12 + (9 + 12)
  assert.equal(g.seats[0].credits, 50 + 12 + 9 + 12);
  assert.equal(g.sabaccPot, 0);
  let h = forCall([[card("coins-10"), card("flasks-13")], [idiot(), card("flasks-2"), card("staves-3")]]);
  h = sabaccDo(h, { type: "call" }, rng);
  assert.deepEqual(h.result?.winners, [1]);
  assert.equal(h.result?.special, "array");
  assert.equal(h.seats[1].credits, 50 + 12 + 9);
});

test("a tie is a sudden demise: each tied player is dealt one more card, and the best total in range wins", () => {
  const rng = createRandom(1);
  let g = forCall([[card("coins-10"), card("flasks-8")], [card("sabers-10"), card("staves-8")]]);
  // the next two cards off the deck: P0 gets a 4 (22), P1 a 1 (19)
  g.deck = [card("coins-4"), card("coins-1"), ...g.deck.filter((c) => !["coins-4", "coins-1"].includes(c.id))];
  g = sabaccDo(g, { type: "call" }, rng);
  assert.deepEqual(g.result?.winners, [0]);
  assert.match(g.log.join(" "), /sudden demise/i);
});

test("everyone bombing out puts the hand pot into the sabacc pot", () => {
  const start = forCall([[card("coins-15"), card("flasks-9")], [card("sabers-15"), card("staves-9")]]);
  const money = sabaccMoney(start);
  const g = sabaccDo(start, { type: "call" }, createRandom(1));
  assert.deepEqual(g.result?.winners, []);
  assert.equal(sabaccMoney(g), money);
  assert.equal(g.handPot, 0);
});

test("whole hands played by the computer finish and keep every credit, hand after hand", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = createRandom(seed);
    const players = ["a", "b", "c", "d"].slice(0, 2 + (seed % 3)).map((id) => ({ id, name: id.toUpperCase(), credits: 40 }));
    let g = newSabacc(players, rng);
    const money = sabaccMoney(g);
    for (let hand = 0; hand < 6; hand++) {
      let steps = 0;
      while (g.phase !== "over") {
        const legal = sabaccActions(g);
        const a = sabaccAi(g, rng);
        assert.ok(legal.some((x) => x.type === a.type), `seed ${seed}: ${a.type} is not legal in ${g.phase}`);
        g = sabaccDo(g, a, rng);
        assert.equal(sabaccMoney(g), money, `seed ${seed}: credits changed`);
        for (const s of g.seats) assert.ok(s.credits >= 0);
        assert.ok(++steps < 2000, `seed ${seed}: a hand did not end`);
      }
      assert.ok(g.result, "a hand ends with a result");
      if (g.seats.filter((s) => s.credits >= 1).length < 2) break;
      g = nextHand(g, rng);
    }
  }
});
