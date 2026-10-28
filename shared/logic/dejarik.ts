// ---------------------------------------------------------------------------------------------
// Dejarik holochess (2026-10-27). The rules are "Dejarik Holochess" v1.0 by No Name Publishing (copyleft 2017: it "may be freely reproduced or
// distributed so long as original authorship credit is provided to No Name Publishing"; based on HOLOCHESS by Mike Kelly, starwars-rpg.net),
// which the user supplied; CREDITS.md carries the credit. Pure: no clock, no random of its own (the dice take a `createRandom`-shaped source).
//
// The board: a centre space and two orbits of twelve, the twelve rays running out from the centre (so 25 spaces). A space is next to those
// beside it on its orbit and the ones above and below it on its ray (never diagonally); the centre is next to all twelve of the inner orbit.
// Eight creatures with Attack and Defense (dice, d6) and Movement (spaces); each player takes one Power, one Offensive, one Defensive and
// one Mobile piece, four a side. A turn is two actions, both used: move a piece the FULL number of its movement (to a free adjacent space
// at each step, never straight back into the space it has just left), attack an adjacent enemy, or stand a Prone piece up. An attack: the
// attacker rolls its Attack dice (one more if another of its pieces is adjacent to the target: Flanking), the target its Defense dice (one
// more if another of its own is adjacent to it: Reinforced; one fewer if Prone); the attack wins by 5 or more: Kill; by 1 to 4 or a tie: Push
// (the winner moves the loser to a free adjacent space of its choice, or lays it Prone if there is none); loses by 1 to 4: Counter-Push; loses
// by 5 or more: Counter-Kill. A Prone piece cannot attack or move. When each side has one piece left they fight to the death in the centre
// with the better of Attack and Defense. The side with pieces left wins.
// ---------------------------------------------------------------------------------------------
export type Rng = { next: () => number };

export type Kind = "savrip" | "monnok" | "ghhhk" | "houjix" | "strider" | "ngok" | "klorslug" | "molator";
export type Role = "power" | "offense" | "defense" | "mobile";
export interface Species { name: string; role: Role; attack: number; defense: number; move: number }
export const SPECIES: Record<Kind, Species> = {
  savrip: { name: "Mantellian Savrip", role: "power", attack: 2, defense: 3, move: 2 },
  monnok: { name: "Monnok", role: "power", attack: 3, defense: 2, move: 2 },
  ghhhk: { name: "Ghhhk", role: "offense", attack: 3, defense: 2, move: 1 },
  houjix: { name: "Houjix", role: "offense", attack: 3, defense: 1, move: 2 },
  strider: { name: "Kintan Strider", role: "defense", attack: 1, defense: 3, move: 2 },
  ngok: { name: "Ng'ok", role: "defense", attack: 2, defense: 3, move: 1 },
  klorslug: { name: "K'lor'slug", role: "mobile", attack: 2, defense: 1, move: 3 },
  molator: { name: "Grimtaash the Molator", role: "mobile", attack: 1, defense: 2, move: 3 },
};
export const KINDS = Object.keys(SPECIES) as Kind[];
export const ROLES: Role[] = ["power", "offense", "defense", "mobile"];
export type Variant = "standard" | "corellian" | "imperial";

// ---- The board: space 0 is the centre, 1-12 the inner orbit and 13-24 the outer, by ray (0-11) clockwise
export const CENTRE = 0;
export const inner = (ray: number) => 1 + (((ray % 12) + 12) % 12);
export const outer = (ray: number) => 13 + (((ray % 12) + 12) % 12);
export const orbitOf = (space: number): 0 | 1 | 2 => (space === 0 ? 0 : space <= 12 ? 1 : 2);
export const rayOf = (space: number) => (space === 0 ? -1 : (space - 1) % 12);
export function neighbours(space: number): number[] {
  if (space === CENTRE) return Array.from({ length: 12 }, (_, r) => inner(r));
  const ray = rayOf(space);
  const orbit = orbitOf(space);
  const ring = orbit === 1 ? inner : outer;
  return orbit === 1 ? [ring(ray - 1), ring(ray + 1), CENTRE, outer(ray)] : [ring(ray - 1), ring(ray + 1), inner(ray)];
}
export const adjacent = (a: number, b: number) => neighbours(a).includes(b);
// Where a player's four pieces start: the outer orbit, four rays side by side, on opposite sides of the board
export const START: [number[], number[]] = [[10, 11, 0, 1].map(outer), [4, 5, 6, 7].map(outer)];

export interface Piece { id: string; owner: 0 | 1; kind: Kind; space: number; prone: boolean }
export type Action =
  | { type: "move"; piece: string; path: number[] }
  | { type: "attack"; piece: string; target: string }
  | { type: "stand"; piece: string }
  | { type: "push"; to: number }
  | { type: "pass" };
export interface Pending { // a push awaiting where it goes
  mover: 0 | 1; // who chooses the space
  piece: string; // the piece pushed
  options: number[];
}
export interface Dejarik {
  variant: Variant;
  pieces: Piece[];
  // Whose turn, and how many of its two actions are left
  turn: 0 | 1;
  actions: number;
  // The space a piece moved from this turn (it may not go straight back in the next step of the same move: kept only inside a move)
  pending?: Pending;
  winner?: 0 | 1;
  log: string[];
}
const clone = (g: Dejarik): Dejarik => structuredClone(g);
const roll = (rng: Rng, dice: number) => { let t = 0; for (let i = 0; i < dice; i++) t += 1 + Math.floor(rng.next() * 6); return t; };
const shuffled = <T,>(list: readonly T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

// ---- The ratings of a piece in this game (Imperial Dejarik: all 2/2/2, and a die more in the centre)
export function rating(g: Pick<Dejarik, "variant">, p: Piece): { attack: number; defense: number; move: number } {
  const s = SPECIES[p.kind];
  return g.variant === "imperial" ? { attack: 2, defense: 2, move: 2 } : { attack: s.attack, defense: s.defense, move: s.move };
}
const centreDie = (g: Pick<Dejarik, "variant">, p: Piece) => (g.variant === "imperial" && p.space === CENTRE ? 1 : 0);

// A game from each side's four chosen pieces (one of each role), the player rolling highest placing first; Corellian Dejarik deals the eight
// pieces out at random (four each, in random places)
export function newDejarik(picks: [Kind[], Kind[]] | null, rng: Rng, variant: Variant = "standard", first?: 0 | 1): Dejarik {
  const opener = first ?? ((rng.next() < 0.5 ? 0 : 1) as 0 | 1);
  let chosen: [Kind[], Kind[]];
  if (variant === "corellian" || !picks) {
    const deal = shuffled(KINDS, rng);
    chosen = [deal.slice(0, 4), deal.slice(4)];
  } else {
    chosen = picks;
    for (const side of chosen) {
      if (side.length !== 4 || !ROLES.every((role) => side.some((k) => SPECIES[k].role === role))) throw new Error("Each side takes one Power, one Offensive, one Defensive and one Mobile piece");
    }
    if (new Set([...chosen[0], ...chosen[1]]).size !== 8) throw new Error("A piece can only be taken once");
  }
  const pieces: Piece[] = [];
  ([0, 1] as const).forEach((owner) => chosen[owner].forEach((kind, i) => pieces.push({ id: `${owner}-${kind}`, owner, kind, space: START[owner][i], prone: false })));
  return { variant, pieces, turn: opener, actions: 2, log: [`${variant === "standard" ? "Dejarik" : variant === "corellian" ? "Corellian Dejarik" : "Imperial Dejarik"}: side ${opener + 1} moves first.`] };
}
// A fair pick for a side: one of each role, the ones its opponent has not taken
export function randomPicks(rng: Rng, taken: Kind[] = []): Kind[] {
  return ROLES.map((role) => shuffled(KINDS.filter((k) => SPECIES[k].role === role && !taken.includes(k)), rng)[0]);
}

export const at = (g: Dejarik, space: number) => g.pieces.find((p) => p.space === space);
const piece = (g: Dejarik, id: string) => g.pieces.find((p) => p.id === id);
const foes = (g: Dejarik, p: Piece) => g.pieces.filter((q) => q.owner !== p.owner);
// Friends of `p` (not `p`) next to a space
const friendsNext = (g: Dejarik, p: Piece, space: number, exclude?: string) => g.pieces.filter((q) => q.owner === p.owner && q.id !== p.id && q.id !== exclude && adjacent(q.space, space)).length;

// ---- Moves: the whole of the movement rating, a free adjacent space each step, never straight back into the space just left
export function moves(g: Dejarik, id: string): { to: number; path: number[] }[] {
  const p = piece(g, id);
  if (!p || p.prone || g.winner || g.pending) return [];
  const steps = rating(g, p).move;
  const found = new Map<number, number[]>();
  const walk = (path: number[], came: number | null) => {
    const here = path[path.length - 1];
    if (path.length - 1 === steps) { if (!found.has(here)) found.set(here, path); return; }
    for (const n of neighbours(here)) {
      if (n === came) continue;
      const blocker = at(g, n);
      if (blocker && blocker.id !== p.id) continue;
      if (blocker && blocker.id === p.id) continue;
      walk([...path, n], here);
    }
  };
  walk([p.space], null);
  found.delete(p.space);
  return [...found].map(([to, path]) => ({ to, path }));
}
// The enemy pieces `id` could attack now
export function targets(g: Dejarik, id: string): Piece[] {
  const p = piece(g, id);
  if (!p || p.prone || g.winner || g.pending) return [];
  return foes(g, p).filter((q) => adjacent(p.space, q.space));
}

// Every legal action for the side to move
export function legalActions(g: Dejarik): Action[] {
  if (g.winner) return [];
  if (g.pending) return g.pending.options.map((to) => ({ type: "push", to }));
  const out: Action[] = [];
  for (const p of g.pieces.filter((q) => q.owner === g.turn)) {
    if (p.prone) { out.push({ type: "stand", piece: p.id }); continue; }
    for (const m of moves(g, p.id)) out.push({ type: "move", piece: p.id, path: m.path });
    for (const t of targets(g, p.id)) out.push({ type: "attack", piece: p.id, target: t.id });
  }
  return out.length ? out : [{ type: "pass" }];
}

// ---- The attack: Flanking and Reinforced dice, the totals, and what they come to
export type Outcome = "kill" | "push" | "counter-push" | "counter-kill";
export const outcomeOf = (attack: number, defense: number): Outcome => (attack - defense >= 5 ? "kill" : attack - defense >= 0 ? "push" : attack - defense > -5 ? "counter-push" : "counter-kill");
export function attackDice(g: Dejarik, attacker: Piece, target: Piece) {
  const flank = friendsNext(g, attacker, target.space) > 0;
  const reinforced = friendsNext(g, target, target.space) > 0;
  const a = rating(g, attacker).attack + (flank ? 1 : 0) + centreDie(g, attacker);
  const d = Math.max(0, rating(g, target).defense + (reinforced ? 1 : 0) - (target.prone ? 1 : 0) + centreDie(g, target));
  return { attack: a, defense: d, flank, reinforced };
}

// Apply an action for the side to move
export function dejarikDo(game: Dejarik, action: Action, rng: Rng): Dejarik {
  const g = clone(game);
  if (g.winner !== undefined) return g;
  const say = (t: string) => g.log.push(t);
  const name = (p: Piece) => `${SPECIES[p.kind].name}`;
  if (g.pending) {
    if (action.type !== "push" || !g.pending.options.includes(action.to)) return game;
    const moved = piece(g, g.pending.piece)!;
    moved.space = action.to;
    say(`${name(moved)} is pushed to space ${action.to}.`);
    g.pending = undefined;
    return spend(g);
  }
  if (action.type === "pass") { g.actions = 0; return spend(g, true); }
  const p = piece(g, (action as { piece: string }).piece);
  if (!p || p.owner !== g.turn) return game;
  if (action.type === "stand") {
    if (!p.prone) return game;
    p.prone = false;
    say(`${name(p)} stands up.`);
    return spend(g);
  }
  if (action.type === "move") {
    const legal = moves(g, p.id).find((m) => m.to === action.path[action.path.length - 1]);
    if (!legal) return game;
    p.space = legal.to;
    say(`${name(p)} moves to space ${legal.to}.`);
    return spend(g);
  }
  if (action.type === "attack") {
    const t = piece(g, action.target);
    if (!t || t.owner === p.owner || p.prone || !adjacent(p.space, t.space)) return game;
    const dice = attackDice(g, p, t);
    const [a, d] = [roll(rng, dice.attack), roll(rng, dice.defense)];
    const out = outcomeOf(a, d);
    say(`${name(p)} attacks ${name(t)}: ${a} (${dice.attack} dice${dice.flank ? ", flanking" : ""}) against ${d} (${dice.defense} dice${dice.reinforced ? ", reinforced" : ""}${t.prone ? ", prone" : ""}): ${out}.`);
    if (out === "kill") { g.pieces = g.pieces.filter((q) => q.id !== t.id); return spend(checkEnd(g, rng)); }
    if (out === "counter-kill") { g.pieces = g.pieces.filter((q) => q.id !== p.id); return spend(checkEnd(g, rng)); }
    // a push: the winner moves the loser to a free adjacent space of its choice; none, and the loser lies Prone
    const [loser, winnerSide] = out === "push" ? [t, p.owner] : [p, t.owner];
    const options = neighbours(loser.space).filter((n) => !at(g, n));
    if (!options.length) { loser.prone = true; say(`${name(loser)} has nowhere to go and is laid Prone.`); return spend(g); }
    g.pending = { mover: winnerSide, piece: loser.id, options };
    // the action is spent when the push is placed
    return g;
  }
  return game;
}
// An action is used; after two the turn passes (and a stuck side that passes ends its turn)
function spend(g: Dejarik, passed = false): Dejarik {
  if (g.winner !== undefined) return g;
  g.actions -= passed ? 2 : 1;
  if (g.actions <= 0) {
    g.turn = (1 - g.turn) as 0 | 1;
    g.actions = 2;
    // A side with nothing to do passes its turn (a stuck side cannot be made to move)
    if (legalActions(g).every((a) => a.type === "pass")) { g.log.push(`Side ${g.turn + 1} cannot act and passes.`); g.turn = (1 - g.turn) as 0 | 1; }
  }
  return g;
}
// The end of the game: a side with no pieces has lost; one piece each is the final confrontation
function checkEnd(g: Dejarik, rng: Rng): Dejarik {
  const left = ([0, 1] as const).map((o) => g.pieces.filter((p) => p.owner === o));
  for (const o of [0, 1] as const) if (!left[o].length) { g.winner = (1 - o) as 0 | 1; g.log.push(`Side ${g.winner + 1} wins: all the other side's pieces are destroyed.`); return g; }
  if (left[0].length === 1 && left[1].length === 1) return suddenDeath(g, left[0][0], left[1][0], rng);
  return g;
}
// Sudden Death: both to the centre, each with the better of its Attack and Defense, the side to move attacking; until one is killed
function suddenDeath(g: Dejarik, a: Piece, b: Piece, rng: Rng): Dejarik {
  g.log.push("Sudden death: the last two creatures meet in the centre.");
  const best = (p: Piece) => Math.max(rating(g, p).attack, rating(g, p).defense) + centreDie(g, p);
  const first = a.owner === g.turn ? a : b;
  const second = first === a ? b : a;
  for (let round = 0; round < 1000; round++) {
    const [x, y] = [roll(rng, best(first)), roll(rng, best(second))];
    const out = outcomeOf(x, y);
    g.log.push(`${SPECIES[first.kind].name} ${x} against ${SPECIES[second.kind].name} ${y}: ${out}.`);
    if (out === "kill") { g.winner = first.owner; break; }
    if (out === "counter-kill") { g.winner = second.owner; break; }
  }
  if (g.winner === undefined) g.winner = first.owner;
  g.pieces = g.pieces.filter((p) => p.owner === g.winner);
  g.log.push(`Side ${g.winner + 1} wins.`);
  return g;
}

// ---- The computer's play: scores each action (a kill is worth most, then a push that sets up a kill, flanking, the centre; a loss is
// weighed by the chance of the dice) and takes the best, a little at random
export function dejarikAi(g: Dejarik, rng: Rng): Action {
  const actions = legalActions(g);
  if (g.pending) {
    // push it where it is most exposed: next to the most of our pieces, and as far from its friends as can be
    const moved = piece(g, g.pending.piece)!;
    const best = g.pending.options.map((to) => {
      const mine = g.pieces.filter((q) => q.owner === g.pending!.mover && adjacent(q.space, to)).length;
      const theirs = g.pieces.filter((q) => q.owner === moved.owner && q.id !== moved.id && adjacent(q.space, to)).length;
      return { to, score: mine * 2 - theirs + rng.next() * 0.5 };
    }).sort((a, b) => b.score - a.score)[0];
    return { type: "push", to: best.to };
  }
  const scored = actions.map((a) => ({ a, score: score(g, a) + rng.next() * 0.6 }));
  return scored.sort((x, y) => y.score - x.score)[0].a;
}
function score(g: Dejarik, a: Action): number {
  if (a.type === "pass") return -10;
  if (a.type === "push") return 0;
  const p = piece(g, a.piece)!;
  if (a.type === "stand") return 3;
  if (a.type === "attack") {
    const t = piece(g, a.target)!;
    const dice = attackDice(g, p, t);
    // the chance of a win is read from the dice: mean 3.5 a die
    const margin = dice.attack * 3.5 - dice.defense * 3.5;
    const sd = Math.sqrt((dice.attack + dice.defense) * 2.92);
    const kill = 1 - normal((5 - margin) / sd);
    const counterKill = normal((-5 - margin) / sd);
    return 4 + kill * 10 - counterKill * 8 + (margin > 0 ? 1 : -1);
  }
  // a move: toward the enemy, to flank, away from a strong foe, the centre
  const to = a.path[a.path.length - 1];
  const nearFoes = foes(g, p).filter((q) => adjacent(q.space, to));
  let s = 0;
  for (const q of nearFoes) {
    const dice = attackDice({ ...g, pieces: g.pieces.map((x) => (x.id === p.id ? { ...x, space: to } : x)) }, p, q);
    s += (dice.attack - dice.defense) * 0.6 + 0.8;
  }
  s += friendsNext(g, p, to) * 0.4;
  if (to === CENTRE) s += 1;
  const closest = Math.min(...foes(g, p).map((q) => distance(to, q.space)));
  s -= closest * 0.3;
  return s;
}
const normal = (z: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z * z * z)));
// Steps between two spaces along the board
export function distance(a: number, b: number): number {
  const seen = new Map<number, number>([[a, 0]]);
  const queue = [a];
  while (queue.length) {
    const here = queue.shift()!;
    if (here === b) return seen.get(here)!;
    for (const n of neighbours(here)) if (!seen.has(n)) { seen.set(n, seen.get(here)! + 1); queue.push(n); }
  }
  return 99;
}
