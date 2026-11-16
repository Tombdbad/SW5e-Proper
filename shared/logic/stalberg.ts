// Constraint-based choice of looks, after Oskar Stålberg's Bad North / Townscaper (2026-11-12, the user: "more natural, varied, coherent procedural generation";
// 2026-11-15, the soft-rule solver: a district that three crowns cannot colour keeps its varied looks and marks the joins, tests/world/stalberg.fuzz.test.ts).
// Pure and deterministic: every function takes its dice. Nothing here knows the rules data or draws.
//
// - `solveGraphSoft`: wave function collapse on any graph, with the three things the games needed and the first version lacked:
//     * HARD and SOFT rules. A soft rule may be given up (Townscaper "fails silently" where two pieces cannot fit; Bad North restarts instead).
//       Only the rules that actually collide are given up, cheapest first, so one tight corner does not flatten a whole district.
//     * PRIORITY. A node takes its highest-priority label still open; weight chooses only among equals (Townscaper's recipes: big shapes
//       predictable, small shapes varied).
//     * The state after the first propagation is computed once and every attempt starts from it (Bad North: reset to the saved state),
//       and a problem that is unsatisfiable before any choice is made is reported at once instead of retried.
// - `solveGraph`: the old entry point (labels or null), kept for callers and tests.
// - `cornerCase` / `cornerPieces` / `cornerMask`: Townscaper's choice by corner (the dual grid: look at the cells round a vertex, not at a cell).
// - `looksFor` / `looksWithReport`: the look of each building of a district; the report lists neighbours that came out alike and need a seam.

export interface Dice {
  next(): number;
}

export interface GraphProblem<L> {
  // The labels each node may take. Weight shapes chance; priority (default 0) overrides it: only the highest priority still open is drawn from.
  nodes: { labels: { label: L; weight: number; priority?: number }[] }[];
  // Pairs of nodes that stand side by side. Two edges may join the same pair (one per rule).
  edges: [number, number][];
  // Whether label a at the edge's first node may stand beside label b at its second. Always called in the edge's own order.
  allowed: (a: L, b: L, edge: [number, number], index: number) => boolean;
  // What it costs to give up an edge's rule when nothing else solves. undefined = never given up (a hard rule).
  dropCost?: (number | undefined)[];
}

export interface Solution<L> {
  labels: L[];
  // Indexes of the edges whose rule had to be given up (empty when every rule held)
  dropped: number[];
  // Attempts made in the successful round; 1 means no contradiction was met
  attempts: number;
}

interface Adj { to: number; id: number; first: boolean }

export function solveGraphSoft<L>(problem: GraphProblem<L>, dice: () => Dice, tries = 24): Solution<L> | null {
  const n = problem.nodes.length;
  const m = problem.edges.length;
  const cost = problem.dropCost ?? [];
  const conflicts = new Array<number>(m).fill(0);

  // The rule table of each edge in its own orientation, filled on first use: table[la * nb + lb] is 1 (allowed) or 0 (not)
  const table: (Int8Array | null)[] = new Array(m).fill(null);
  const fits = (id: number, la: number, lb: number): boolean => {
    const [a, b] = problem.edges[id];
    let t = table[id];
    if (!t) { t = new Int8Array(problem.nodes[a].labels.length * problem.nodes[b].labels.length).fill(-1); table[id] = t; }
    const at = la * problem.nodes[b].labels.length + lb;
    if (t[at] < 0) t[at] = problem.allowed(problem.nodes[a].labels[la].label, problem.nodes[b].labels[lb].label, problem.edges[id], id) ? 1 : 0;
    return t[at] === 1;
  };

  // One round: solve with the given edges switched off, up to `budget` attempts. Records which edge each contradiction was met on.
  const round = (off: Set<number>, budget: number): { labels: number[]; attempts: number } | null => {
    const near: Adj[][] = problem.nodes.map(() => []);
    problem.edges.forEach(([a, b], id) => {
      if (off.has(id) || a === b) return;
      near[a].push({ to: b, id, first: true });
      near[b].push({ to: a, id, first: false });
    });
    // Narrow every node to the labels that still have a partner at each neighbour. Returns the edge that emptied a node, or -1.
    const propagate = (open: number[][], start: number[]): number => {
      const queue = [...start];
      while (queue.length) {
        const j = queue.pop()!;
        for (const { to: i, id, first } of near[j]) {
          // `first`: j is the edge's first node, so the rule reads (label at j, label at i); otherwise (label at i, label at j)
          const keep = open[i].filter((li) => open[j].some((lj) => (first ? fits(id, lj, li) : fits(id, li, lj))));
          if (!keep.length) return id;
          if (keep.length < open[i].length) { open[i] = keep; queue.push(i); }
        }
      }
      return -1;
    };
    // The saved state: everything every attempt starts from
    const base: number[][] = problem.nodes.map((nd) => nd.labels.map((_, i) => i));
    const start = propagate(base, Array.from({ length: n }, (_, i) => i));
    if (start >= 0) { conflicts[start]++; return null; }
    for (let attempt = 1; attempt <= budget; attempt++) {
      const r = dice();
      // The first attempt follows the entropy order closely; each retry shakes the order more, so restarts explore different paths
      const jitter = attempt === 1 ? 1e-3 : 0.05 + 0.6 * (attempt / budget);
      // Priority is a preference, not a rule: honoured in the first third of the attempts, then set aside before any rule is given up
      // (a palace that must have crown 0 on every attempt can make an otherwise colourable district fail every time)
      const byPriority = attempt <= Math.ceil(budget / 3);
      const open = base.map((o) => o.slice());
      let edge = -1;
      for (;;) {
        // The undecided node whose best open label has the highest priority (so a palace is placed before its neighbours can take its crown),
        // and among those the one with the least left to choose from (entropy of its weights, plus noise)
        let best = -1, bestH = Infinity, bestP = -Infinity;
        for (let i = 0; i < n; i++) {
          if (open[i].length < 2) continue;
          const labs = problem.nodes[i].labels;
          let p = -Infinity;
          if (byPriority) for (const li of open[i]) p = Math.max(p, labs[li].priority ?? 0); else p = 0;
          if (p < bestP) continue;
          const w = open[i].map((li) => labs[li].weight);
          const sum = w.reduce((s, x) => s + x, 0);
          const h = Math.log(sum) - w.reduce((s, x) => s + x * Math.log(x || 1), 0) / sum + r.next() * jitter;
          if (p > bestP || h < bestH) { bestP = p; bestH = h; best = i; }
        }
        if (best < 0) break;
        // Highest priority still open, weight among equals
        const labs = problem.nodes[best].labels;
        let top = -Infinity;
        if (byPriority) for (const li of open[best]) top = Math.max(top, labs[li].priority ?? 0); else top = 0;
        const pool = byPriority ? open[best].filter((li) => (labs[li].priority ?? 0) === top) : open[best];
        let t = r.next() * pool.reduce((s, li) => s + labs[li].weight, 0);
        let pick = pool[pool.length - 1];
        for (const li of pool) { t -= labs[li].weight; if (t <= 0) { pick = li; break; } }
        open[best] = [pick];
        edge = propagate(open, [best]);
        if (edge >= 0) break;
      }
      if (edge < 0 && open.every((o) => o.length === 1)) return { labels: open.map((o) => o[0]), attempts: attempt };
      if (edge >= 0) conflicts[edge]++;
    }
    return null;
  };

  const holds = (labels: number[], id: number) => { const [a, b] = problem.edges[id]; return a === b || fits(id, labels[a], labels[b]); };
  const finish = (r: { labels: number[]; attempts: number }, off: Set<number>): Solution<L> => ({
    labels: r.labels.map((l, i) => problem.nodes[i].labels[l].label),
    // Only the rules that really are broken in the result (a rule that was switched off but happens to hold is not reported)
    dropped: [...off].filter((id) => !holds(r.labels, id)).sort((x, y) => x - y),
    attempts: r.attempts,
  });

  // Give up the soft rules that collided most, relative to what they are worth, until a round solves
  const off = new Set<number>();
  let found = round(off, tries);
  while (!found) {
    const soft: number[] = [];
    for (let id = 0; id < m; id++) if (!off.has(id) && cost[id] !== undefined) soft.push(id);
    if (!soft.length) return null;
    const score = (id: number) => conflicts[id] / (cost[id] as number);
    const best = soft.reduce((a, b) => (score(b) > score(a) ? b : a));
    off.add(score(best) > 0 ? best : soft.reduce((a, b) => ((cost[a] as number) <= (cost[b] as number) ? a : b)));
    found = round(off, tries);
  }

  // Restore pass: a rule given up on a wrong guess is put back wherever the result still allows it, dearest rule first
  let result = found;
  for (const id of [...off].sort((a, b) => (cost[b] as number) - (cost[a] as number))) {
    if (holds(result.labels, id)) { off.delete(id); continue; }
    const without = new Set(off); without.delete(id);
    const again = round(without, Math.max(6, tries >> 1));
    if (again) { result = again; off.delete(id); }
  }
  return finish(result, off);
}

// Each node's label, or null where no choice satisfies the rules in `tries` attempts (hard rules only: every edge counts)
export function solveGraph<L>(problem: GraphProblem<L>, dice: () => Dice, tries = 24): L[] | null {
  return solveGraphSoft({ ...problem, dropCost: undefined }, dice, tries)?.labels ?? null;
}

// ---- Townscaper's corners. The four cells round a corner, in the order north-west, north-east, south-east, south-west, filled (1) or not (0), make 16 cases that are six pieces
// turned: nothing, a lone cell (an outside corner), two side by side (a wall), two opposite (a pinch), three (an inside corner) and all four (solid). `turn` is
// quarter turns clockwise from the piece's own drawing (a lone cell in the north-west, a wall with its filled side to the north, the pinch with north-west and south-east
// filled, the inside corner with the empty cell in the south-west). The pinch and the solid/empty cases look the same turned some ways round; `turn` is the least.
export type CornerPiece = "empty" | "outside" | "wall" | "pinch" | "inside" | "solid";
export type Mask = [boolean, boolean, boolean, boolean];
const DRAWN: Record<CornerPiece, number[]> = { empty: [0, 0, 0, 0], outside: [1, 0, 0, 0], wall: [1, 1, 0, 0], pinch: [1, 0, 1, 0], inside: [1, 1, 1, 0], solid: [1, 1, 1, 1] };
export function cornerCase(mask: Mask): { piece: CornerPiece; turn: number } {
  const bits = mask.map(Number);
  const count = bits.reduce((s, x) => s + x, 0);
  const at = (t: number, from: number[]) => bits.map((_, i) => from[(i - t + 4) % 4]);
  const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);
  const piece: CornerPiece = count === 0 ? "empty" : count === 1 ? "outside" : count === 3 ? "inside" : count === 4 ? "solid" : bits[0] === bits[2] ? "pinch" : "wall";
  for (let t = 0; t < 4; t++) if (same(at(t, DRAWN[piece]), bits)) return { piece, turn: t };
  return { piece, turn: 0 };
}

// The marching-squares saddle: a pinch is two cells touching only at the corner. Is that one pinched piece ("joined"), or two separate outside corners ("split")?
// A castle gate or a bridge reads as joined; two walled yards that merely touch read as split. Everything else is a single piece either way.
export function cornerPieces(mask: Mask, saddle: "joined" | "split" = "joined"): { piece: CornerPiece; turn: number }[] {
  const c = cornerCase(mask);
  if (c.piece !== "pinch" || saddle === "joined") return [c];
  // Split the two filled cells into one lone cell each: the lone cell's own drawing is north-west, turned t quarter turns lands it on corner t
  return mask.map((on, t) => (on ? { piece: "outside" as CornerPiece, turn: t } : null)).filter((x): x is { piece: CornerPiece; turn: number } => x !== null);
}

// The four cells round the vertex at the south-east corner of cell (x, y): NW = (x, y), NE = (x + 1, y), SE = (x + 1, y + 1), SW = (x, y + 1)
export function cornerMask(filled: (x: number, y: number) => boolean, x: number, y: number): Mask {
  return [filled(x, y), filled(x + 1, y), filled(x + 1, y + 1), filled(x, y + 1)];
}

// ---- The looks of a district's buildings
export interface BuildingLook {
  // Which of the family's crowns (added to the roof's own number)
  crown: number;
  // How dark the trim is: 0 plain, 1 a shade darker, 2 darker still
  trim: number;
  // A band under the roof
  band: boolean;
}
export const CROWNS = 3;
export const TRIMS = 3;
export interface LookNode {
  id: string;
  box: { x: number; y: number; width: number; height: number };
  // A palace, a great house: takes the first crown and the plainest trim wherever its neighbours leave them open
  grand?: boolean;
}
// Two buildings are neighbours when their boxes face each other across a way (no more than an avenue's width between them, overlapping along the other axis)
export const AVENUE = 6;
export const ALLEY = 3;
export function neighbours(nodes: LookNode[]): { edges: [number, number][]; alley: boolean[] } {
  const edges: [number, number][] = [];
  const alley: boolean[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].box, b = nodes[j].box;
      const gx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
      const gy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
      // (apart along one axis by the width of a way, and overlapping along the other)
      const faces = (gx >= 0 && gx <= AVENUE && gy < 0) || (gy >= 0 && gy <= AVENUE && gx < 0);
      if (!faces) continue;
      edges.push([i, j]);
      alley.push(Math.max(gx, gy) <= ALLEY);
    }
  }
  return { edges, alley };
}

export interface LooksReport {
  looks: Record<string, BuildingLook>;
  // Neighbours that had to come out with the same crown (the "different crowns" rule was given up there). Where two buildings read alike they read as
  // one house unless something marks the join: the client should draw a seam, a pilaster or a party wall between them.
  seams: [string, string][];
}

// Rules, per pair of facing buildings:
//   crown: differ. SOFT: this is a graph colouring, and a building ringed by five that all face each other cannot be coloured with three crowns,
//          so the rule is given up where it collides (across an avenue before across an alley) rather than flattening the whole district.
//   trim:  differ by at most one step (a street drifts from plain to dark, never jumps). HARD (always satisfiable).
//   band:  shared across an alley (a street reads as one frontage); free across an avenue. HARD (always satisfiable).
export function looksWithReport(nodes: LookNode[], dice: () => Dice): LooksReport {
  const { edges: pairs, alley } = neighbours(nodes);
  const edges: [number, number][] = [];
  const kind: ("crown" | "trim" | "band")[] = [];
  const dropCost: (number | undefined)[] = [];
  const crownEdgeOf: number[] = [];
  pairs.forEach((p, k) => {
    crownEdgeOf[k] = edges.length;
    edges.push(p); kind.push("crown"); dropCost.push(alley[k] ? 3 : 1);
    edges.push(p); kind.push("trim"); dropCost.push(undefined);
    if (alley[k]) { edges.push(p); kind.push("band"); dropCost.push(undefined); }
  });
  const labels = (g?: boolean) => {
    const out: { label: BuildingLook; weight: number; priority: number }[] = [];
    for (let crown = 0; crown < CROWNS; crown++) for (let trim = 0; trim < TRIMS; trim++) for (const band of [true, false]) {
      out.push({ label: { crown, trim, band }, weight: band ? 2 : 1, priority: g ? (crown === 0 ? 2 : 0) + (trim === 0 ? 1 : 0) : 0 });
    }
    return out;
  };
  const solved = solveGraphSoft<BuildingLook>({
    nodes: nodes.map((n) => ({ labels: labels(n.grand) })),
    edges,
    allowed: (a, b, _e, id) => kind[id] === "crown" ? a.crown !== b.crown : kind[id] === "trim" ? Math.abs(a.trim - b.trim) <= 1 : a.band === b.band,
    dropCost,
  }, dice);
  const looks: Record<string, BuildingLook> = {};
  nodes.forEach((n, i) => { looks[n.id] = solved?.labels[i] ?? { crown: 0, trim: 0, band: true }; });
  const seams: [string, string][] = [];
  pairs.forEach(([i, j]) => { if (solved && solved.labels[i].crown === solved.labels[j].crown) seams.push([nodes[i].id, nodes[j].id]); });
  return { looks, seams };
}

export function looksFor(nodes: LookNode[], dice: () => Dice): Record<string, BuildingLook> {
  return looksWithReport(nodes, dice).looks;
}
