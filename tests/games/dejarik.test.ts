// Dejarik (2026-10-27), "Dejarik Holochess" v1.0 by No Name Publishing (copyleft, credited in CREDITS.md): the board, the pieces, the moves
// and the attacks as the rules give them, and whole games played by the computer
import test from "node:test";
import assert from "node:assert/strict";
import { createRandom } from "../../shared/logic/index";
import { SPECIES, KINDS, neighbours, adjacent, inner, outer, CENTRE, START, newDejarik, moves, targets, legalActions, outcomeOf, attackDice, dejarikDo, dejarikAi, randomPicks, type Dejarik, type Kind } from "../../shared/logic/dejarik";

const picks = (): [Kind[], Kind[]] => [["monnok", "ghhhk", "strider", "molator"], ["savrip", "houjix", "ngok", "klorslug"]];
// A dice source: each next() gives the face asked for (1-6), in turn
const dice = (...faces: number[]) => {
  let i = 0;
  return { next: () => (faces[i++ % faces.length] - 1) / 6 + 0.01 };
};
const place = (g: Dejarik, spots: Record<string, number>): Dejarik => {
  const c = structuredClone(g);
  for (const p of c.pieces) if (p.id in spots) p.space = spots[p.id];
  return c;
};

test("the board: 25 spaces; the centre touches the twelve of the inner orbit; the others touch along their orbit and their ray, never diagonally", () => {
  assert.equal(neighbours(CENTRE).length, 12);
  for (let s = 1; s <= 24; s++) {
    for (const n of neighbours(s)) assert.ok(neighbours(n).includes(s), `${s} and ${n} are not mutual`);
    assert.equal(neighbours(s).length, s <= 12 ? 4 : 3);
  }
  assert.ok(adjacent(inner(0), outer(0)) && adjacent(inner(0), inner(1)) && adjacent(inner(0), inner(11)) && adjacent(inner(5), CENTRE));
  assert.ok(!adjacent(inner(0), outer(1)) && !adjacent(outer(0), outer(2)) && !adjacent(outer(3), CENTRE));
});

test("the eight pieces have the ratings in the rules; each side takes one of each role", () => {
  const want: Record<Kind, [number, number, number]> = { savrip: [2, 3, 2], monnok: [3, 2, 2], ghhhk: [3, 2, 1], houjix: [3, 1, 2], strider: [1, 3, 2], ngok: [2, 3, 1], klorslug: [2, 1, 3], molator: [1, 2, 3] };
  for (const k of KINDS) assert.deepEqual([SPECIES[k].attack, SPECIES[k].defense, SPECIES[k].move], want[k], k);
  const g = newDejarik(picks(), createRandom(1));
  assert.equal(g.pieces.length, 8);
  assert.equal(new Set(g.pieces.map((p) => p.space)).size, 8);
  assert.ok(g.pieces.filter((p) => p.owner === 0).every((p) => START[0].includes(p.space)));
  assert.throws(() => newDejarik([["monnok", "savrip", "strider", "molator"], picks()[1]], createRandom(1)), /one Power/);
  const r = createRandom(2);
  const a = randomPicks(r);
  const b = randomPicks(r, a);
  assert.doesNotThrow(() => newDejarik([a, b], r));
  const corellian = newDejarik(null, createRandom(3), "corellian");
  assert.equal(new Set(corellian.pieces.map((p) => p.kind)).size, 8);
});

test("a move is the whole of the movement rating, to free adjacent spaces, never straight back", () => {
  const g = newDejarik(picks(), createRandom(1), "standard", 0);
  const molator = g.pieces.find((p) => p.kind === "molator")!;
  const found = moves(g, molator.id);
  assert.ok(found.length > 5);
  for (const m of found) {
    assert.equal(m.path.length, 4, "three steps exactly");
    for (let i = 2; i < m.path.length; i++) assert.notEqual(m.path[i], m.path[i - 2], "not straight back");
    for (const s of m.path.slice(1)) assert.ok(!g.pieces.some((p) => p.space === s), "never into an occupied space");
    for (let i = 1; i < m.path.length; i++) assert.ok(adjacent(m.path[i - 1], m.path[i]));
  }
  const ghhhk = g.pieces.find((p) => p.kind === "ghhhk")!;
  assert.ok(moves(g, ghhhk.id).every((m) => m.path.length === 2), "the Ghhhk moves one space");
});

test("the outcomes of an attack: 5 or more kills, 0 to 4 pushes, down to -4 counter-pushes, -5 or worse counter-kills", () => {
  assert.equal(outcomeOf(15, 10), "kill");
  assert.equal(outcomeOf(14, 10), "push");
  assert.equal(outcomeOf(10, 10), "push");
  assert.equal(outcomeOf(9, 10), "counter-push");
  assert.equal(outcomeOf(6, 10), "counter-push");
  assert.equal(outcomeOf(5, 10), "counter-kill");
});

test("flanking adds an Attack die, being reinforced a Defense die, being prone takes one away; Imperial Dejarik is 2/2/2 with a die more in the centre", () => {
  let g = newDejarik(picks(), createRandom(1), "standard", 0);
  // the Monnok at outer(5) attacks the Houjix at outer(6); the Ghhhk at inner(6) is next to the Houjix: flanking
  g = place(g, { "0-monnok": outer(5), "1-houjix": outer(6), "0-ghhhk": inner(6), "1-savrip": outer(9), "0-strider": outer(0), "0-molator": outer(1), "1-ngok": outer(10), "1-klorslug": outer(11) });
  const get = (id: string) => g.pieces.find((p) => p.id === id)!;
  assert.deepEqual(attackDice(g, get("0-monnok"), get("1-houjix")), { attack: 4, defense: 1, flank: true, reinforced: false });
  g = place(g, { "1-savrip": outer(7) });
  const flanked = attackDice(g, get("0-monnok"), get("1-houjix"));
  assert.equal(flanked.reinforced, true);
  assert.equal(flanked.defense, 2);
  const prone = structuredClone(g);
  prone.pieces.find((p) => p.id === "1-houjix")!.prone = true;
  assert.equal(attackDice(prone, prone.pieces.find((p) => p.id === "0-monnok")!, prone.pieces.find((p) => p.id === "1-houjix")!).defense, 1);
  const imperial = newDejarik(picks(), createRandom(1), "imperial", 0);
  const p0 = imperial.pieces[0];
  const t = imperial.pieces[4];
  assert.equal(attackDice(imperial, p0, t).attack, 2);
  const centred = place(imperial, { [p0.id]: CENTRE });
  assert.equal(attackDice(centred, centred.pieces[0], t).attack, 3, "a die more in the centre");
});

// The Monnok (side 0) at outer(5) next to the Houjix (side 1) at outer(6); the rest well away
const duel = (): Dejarik => place(newDejarik(picks(), createRandom(1), "standard", 0), { "0-monnok": outer(5), "1-houjix": outer(6), "0-ghhhk": outer(0), "0-strider": outer(1), "0-molator": outer(2), "1-savrip": outer(9), "1-ngok": outer(10), "1-klorslug": outer(11) });

test("an attack: a kill removes the target and keeps the attacker where it is; two actions end the turn", () => {
  const g = duel();
  assert.deepEqual(targets(g, "0-monnok").map((p) => p.id), ["1-houjix"]);
  // 3 dice of 6 (18) against 1 die of 1: a kill
  const killed = dejarikDo(g, { type: "attack", piece: "0-monnok", target: "1-houjix" }, dice(6, 6, 6, 1));
  assert.ok(!killed.pieces.some((p) => p.id === "1-houjix"));
  assert.equal(killed.pieces.find((p) => p.id === "0-monnok")!.space, outer(5));
  assert.equal(killed.actions, 1);
  assert.equal(killed.turn, 0);
  const molator = moves(killed, "0-molator")[0];
  const after = dejarikDo(killed, { type: "move", piece: "0-molator", path: molator.path }, createRandom(2));
  assert.equal(after.turn, 1);
  assert.equal(after.actions, 2);
});

test("a push moves the loser to a free adjacent space of the winner's choice; a counter-push the attacker, by the defender's choice", () => {
  const g = duel();
  // 3 dice of 3 (9) against 1 die of 6: the attack loses by... 9 against 6: a push (+3)
  const pushed = dejarikDo(g, { type: "attack", piece: "0-monnok", target: "1-houjix" }, dice(3, 3, 3, 6));
  assert.ok(pushed.pending, "the push waits for its space");
  assert.equal(pushed.pending!.mover, 0);
  assert.equal(pushed.pending!.piece, "1-houjix");
  assert.ok(pushed.pending!.options.every((o) => adjacent(o, outer(6))));
  const to = pushed.pending!.options[0];
  const placed = dejarikDo(pushed, { type: "push", to }, createRandom(1));
  assert.equal(placed.pending, undefined);
  assert.equal(placed.actions, 1);
  assert.equal(placed.pieces.find((p) => p.id === "1-houjix")!.space, to);
  // the Monnok's 3 dice of 1 (3) against the Houjix's 1 die of 5: a counter-push of 2; the defender (side 1) places the Monnok
  const counter = dejarikDo(g, { type: "attack", piece: "0-monnok", target: "1-houjix" }, dice(1, 1, 1, 5));
  assert.equal(counter.pending?.piece, "0-monnok");
  assert.equal(counter.pending?.mover, 1);
});

test("a counter-kill destroys the attacker", () => {
  const g = duel();
  // a Ghhhk-less attack: the Monnok (3 dice of 1) against the Houjix (1 die of 6 + reinforced by the Savrip 1 die): 3 against 12
  const withSavrip = place(g, { "1-savrip": outer(7) });
  const lost = dejarikDo(withSavrip, { type: "attack", piece: "0-monnok", target: "1-houjix" }, dice(1, 1, 1, 6, 6));
  assert.ok(!lost.pieces.some((p) => p.id === "0-monnok"));
  assert.ok(lost.pieces.some((p) => p.id === "1-houjix"));
});

test("a pushed piece with nowhere to go lies prone; a prone piece cannot move or attack, and stands up with an action", () => {
  // the Houjix at outer(6) with a piece on every space round it: inner(6), outer(5) (the Monnok) and outer(7)
  let g = duel();
  g = place(g, { "1-savrip": outer(7), "0-ghhhk": inner(6) });
  const boxed = dejarikDo(g, { type: "attack", piece: "0-monnok", target: "1-houjix" }, dice(6, 6, 6, 6, 1));
  const houjix = boxed.pieces.find((p) => p.id === "1-houjix");
  assert.ok(!houjix || houjix.prone, "killed, or laid prone with no space to go to");
  const lying = structuredClone(g);
  lying.pieces.find((p) => p.id === "0-monnok")!.prone = true;
  assert.deepEqual(moves(lying, "0-monnok"), []);
  assert.deepEqual(targets(lying, "0-monnok"), []);
  assert.ok(legalActions(lying).some((a) => a.type === "stand"));
  const up = dejarikDo(lying, { type: "stand", piece: "0-monnok" }, createRandom(1));
  assert.equal(up.pieces.find((p) => p.id === "0-monnok")!.prone, false);
});

test("whole games between two computers end with one side's pieces gone (or the last two fought out), in every variant", () => {
  for (const variant of ["standard", "corellian", "imperial"] as const) {
    for (let seed = 1; seed <= 12; seed++) {
      const r = createRandom(seed * 7);
      const a = randomPicks(r);
      let g = newDejarik([a, randomPicks(r, a)], r, variant);
      for (let steps = 0; steps < 3000 && g.winner === undefined; steps++) {
        const legal = legalActions(g);
        const action = dejarikAi(g, r);
        assert.ok(legal.some((x) => JSON.stringify(x) === JSON.stringify(action)), `${variant} ${seed}: an illegal action ${JSON.stringify(action)}`);
        g = dejarikDo(g, action, r);
      }
      assert.notEqual(g.winner, undefined, `${variant} seed ${seed} did not finish: ${g.log.slice(-3).join(" | ")}`);
      assert.ok(g.pieces.every((p) => p.owner === g.winner), "only the winner's pieces are left");
    }
  }
});
