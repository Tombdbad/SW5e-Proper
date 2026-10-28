// Pazaak (2026-10-27): the rules as the user gave them, played through by hand and by the computer
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { mainDeck, newPazaak, pazaakActions, pazaakDo, pazaakAi, nextSet, total, startingSideDeck, legalSideDeck, type Pazaak, type SideCard } from "../../shared/logic/pazaak";

const side = (...cards: [SideCard["kind"], number][]): SideCard[] => cards.map(([kind, value]) => ({ kind, value }));
const decks = (): [SideCard[], SideCard[]] => [side(["plus", 2], ["minus", 3], ["flip", 4], ["plus", 6]), side(["minus", 1], ["plus", 1], ["flip", 2], ["minus", 6])];
// A match whose main deck is fixed, so that a set can be played out
const rigged = (deck: number[], hands?: [SideCard[], SideCard[]]): Pazaak => {
  const g = newPazaak(["Ann", "Bo"], decks(), createRandom(5), 0);
  g.deck = [...deck];
  g.sides[0].table = [];
  g.sides[1].table = [];
  if (hands) { g.sides[0].hand = hands[0]; g.sides[1].hand = hands[1]; }
  // (newPazaak has already drawn for the first player: draw again from the rigged deck)
  g.sides[0].table = [g.deck.shift()!];
  return g;
};
const rng = createRandom(9);
const run = (g: Pazaak, ...acts: Parameters<typeof pazaakDo>[1][]) => acts.reduce((game, a) => pazaakDo(game, a, rng), g);

test("the main deck is 40 cards, four of each from 1 to 10; a side deck is at most ten cards of +-1 to +-6; four are dealt to each hand", () => {
  const deck = mainDeck();
  assert.equal(deck.length, 40);
  for (let v = 1; v <= 10; v++) assert.equal(deck.filter((x) => x === v).length, 4);
  assert.equal(legalSideDeck(startingSideDeck()), true);
  assert.equal(legalSideDeck(Array.from({ length: 11 }, () => ({ kind: "plus" as const, value: 1 }))), false);
  assert.equal(legalSideDeck([{ kind: "plus", value: 7 }]), false);
  const g = newPazaak(["Ann", "Bo"], [startingSideDeck(), startingSideDeck()], createRandom(1));
  assert.equal(g.sides[0].hand.length, 4);
  assert.equal(g.sides[1].hand.length, 4);
  // the first player has drawn a card to begin the turn
  assert.equal(g.sides[0].table.length, 1);
  assert.equal(g.deck.length, 39);
});

test("a turn: draw, at most one hand card, then end the turn or stand; a played hand card is gone for the match", () => {
  let g = rigged([5, 4, 3, 2], [side(["plus", 2], ["plus", 1]), side(["minus", 1])]);
  assert.equal(total(g.sides[0]), 5);
  g = run(g, { type: "play", index: 0 });
  assert.deepEqual(g.sides[0].table, [5, 2]);
  assert.equal(g.sides[0].hand.length, 1);
  // only one hand card a turn
  assert.ok(!pazaakActions(g).some((a) => a.type === "play"));
  g = run(g, { type: "end" });
  // the other player draws to begin their turn
  assert.equal(g.turn, 1);
  assert.deepEqual(g.sides[1].table, [4]);
  g = run(g, { type: "end" });
  // and Ann draws again, with a hand card to play again
  assert.equal(g.turn, 0);
  assert.deepEqual(g.sides[0].table, [5, 2, 3]);
  assert.ok(pazaakActions(g).some((a) => a.type === "play"));
});

test("a flip card is played as plus or as minus; over 20 at the end of the turn is a bust; a negative card after the draw can save it", () => {
  // Ann: 10, then 10 (20), then a third 10 (30) -> bust on ending the turn
  let g = rigged([10, 5, 10, 5, 10, 5]);
  g = run(g, { type: "end" }, { type: "end" }, { type: "end" }, { type: "end" });
  assert.equal(g.turn, 0);
  assert.equal(total(g.sides[0]), 30);
  g = run(g, { type: "end" });
  assert.equal(g.phase, "set");
  assert.equal(g.last?.winner, 1);
  assert.equal(g.sides[1].sets, 1);
  // the same draw to 25, with a flip card in hand played as a minus 6: 19, and no bust at the end of the turn
  let h = rigged([10, 5, 10, 5, 5, 5], [side(["flip", 6]), side(["plus", 1])]);
  h = run(h, { type: "end" }, { type: "end" }, { type: "end" }, { type: "end" });
  assert.equal(total(h.sides[0]), 25);
  assert.deepEqual(pazaakActions(h).filter((a) => a.type === "play").map((a) => (a as { sign?: number }).sign), [1, -1]);
  h = run(h, { type: "play", index: 0, sign: -1 }, { type: "end" });
  assert.equal(h.phase, "turn");
  assert.equal(total(h.sides[0]), 19);
});

test("standing: a player who stands draws and plays no more, and the other goes on until they stand or bust; the higher total wins", () => {
  let g = rigged([10, 8, 4, 3, 9, 9]);
  g = run(g, { type: "stand" });
  assert.equal(g.sides[0].standing, true);
  // Bo draws 8, ends the turn; Ann stands, so Bo draws again (4: 12), and again (3: 15), and a 9 (24: bust)
  assert.equal(g.turn, 1);
  g = run(g, { type: "end" });
  assert.equal(g.turn, 1, "the standing player is not given another turn");
  assert.equal(total(g.sides[1]), 12);
  g = run(g, { type: "end" });
  assert.equal(total(g.sides[1]), 15);
  g = run(g, { type: "end" });
  assert.equal(total(g.sides[1]), 24);
  g = run(g, { type: "end" });
  assert.equal(g.last?.winner, 0);
  assert.match(g.last!.why, /Bo busts on 24/);
  // both stand: the higher total wins; equal totals replay the set, counting for neither
  let h = rigged([10, 9, 2, 1]);
  h = run(h, { type: "stand" }, { type: "stand" });
  assert.equal(h.last?.winner, 0);
  let t = rigged([10, 10]);
  t = run(t, { type: "stand" }, { type: "stand" });
  assert.equal(t.last?.winner, null);
  assert.equal(t.sides[0].sets + t.sides[1].sets, 0);
  const again = nextSet(t, rng);
  assert.equal(again.setNumber, 2);
  assert.equal(again.phase, "turn");
  assert.equal(again.sides[0].hand.length, t.sides[0].hand.length, "no new cards from the side decks");
});

test("nine cards in play without going over 20 win the set at once", () => {
  // Ann draws a 1 each turn (nine of them: 9), Bo stands at once on 5
  let g = rigged([1, 5, 1, 1, 1, 1, 1, 1, 1, 1]);
  g = run(g, { type: "end" }, { type: "stand" });
  for (let i = 0; i < 7; i++) g = run(g, { type: "end" });
  assert.equal(g.phase, "set");
  assert.equal(g.last?.winner, 0);
  assert.match(g.last!.why, /nine cards/);
});

test("first to three sets wins the match; a computer against a computer always finishes, with the rules kept", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = createRandom(seed);
    let g = newPazaak(["A", "B"], [startingSideDeck(), startingSideDeck()], r);
    for (let steps = 0; steps < 2000 && g.phase !== "match"; steps++) {
      if (g.phase === "set") { g = nextSet(g, r); continue; }
      const legal = pazaakActions(g);
      const a = pazaakAi(g);
      assert.ok(legal.some((x) => x.type === a.type && (x as { index?: number }).index === (a as { index?: number }).index && (x as { sign?: number }).sign === (a as { sign?: number }).sign), `seed ${seed}: the computer chose an action that is not legal`);
      g = pazaakDo(g, a, r);
      for (const s of g.sides) assert.ok(s.table.length <= 9 && s.hand.length <= 4);
    }
    assert.equal(g.phase, "match", `seed ${seed} did not finish`);
    assert.equal(g.sides[g.winner!].sets, 3);
    assert.ok(g.sides[1 - g.winner!].sets < 3);
  }
});
