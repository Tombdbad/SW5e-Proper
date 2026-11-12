// Constraint-based choice of looks, after Oskar Stålberg's Bad North / Townscaper (2026-11-12, the user: "more natural, varied, coherent procedural generation").
// Pure and deterministic: every function takes its dice. Nothing here knows the rules data or draws.
//
// - `solveGraph`: wave function collapse on any graph. Each node keeps a set of labels it may still take; the node with the fewest (weighted by entropy) is collapsed
//   to one label and what its neighbours may still take is narrowed by the edge rule until nothing changes; a contradiction restarts with the next dice.
// - `cornerCase`: Townscaper's choice by corner: the filled/empty state of the four cells round a corner picks a piece and the turn it is given.
// - `looksFor`: the look of each building of a district, so that neighbours agree where they should and differ where they should.

export interface Dice {
  next(): number;
}

export interface GraphProblem<L> {
  // The labels each node may take, with their weights
  nodes: { labels: { label: L; weight: number }[] }[];
  // Pairs of nodes that stand side by side
  edges: [number, number][];
  // Whether label a at the first node may stand beside label b at the second
  allowed: (a: L, b: L, edge: [number, number]) => boolean;
}

// Each node's label, or null where no choice satisfies the rules in `tries` attempts. The result is as hard as the rules allow: a node left with several
// labels is chosen from them by weight; on a contradiction the attempt is dropped and made again.
export function solveGraph<L>(problem: GraphProblem<L>, dice: () => Dice, tries = 24): L[] | null {
  const n = problem.nodes.length;
  const near: number[][] = problem.nodes.map(() => []);
  for (const [a, b] of problem.edges) { near[a].push(b); near[b].push(a); }
  for (let attempt = 0; attempt < tries; attempt++) {
    const r = dice();
    const open: number[][] = problem.nodes.map((nd) => nd.labels.map((_, i) => i));
    const ok = (i: number, j: number, li: number, lj: number) => {
      const e: [number, number] = [i, j];
      return problem.allowed(problem.nodes[i].labels[li].label, problem.nodes[j].labels[lj].label, e);
    };
    // Narrow every node to the labels that still have a partner at each neighbour; false on an empty node
    const propagate = (start: number[]): boolean => {
      const queue = [...start];
      while (queue.length) {
        const j = queue.pop()!;
        for (const i of near[j]) {
          const keep = open[i].filter((li) => open[j].some((lj) => ok(i, j, li, lj)));
          if (!keep.length) return false;
          if (keep.length < open[i].length) { open[i] = keep; queue.push(i); }
        }
      }
      return true;
    };
    let fine = propagate(Array.from({ length: n }, (_, i) => i));
    while (fine) {
      // The undecided node with the least left to choose from (entropy of its weights, a little noise to break ties)
      let best = -1, bestH = Infinity;
      for (let i = 0; i < n; i++) {
        if (open[i].length < 2) continue;
        const w = open[i].map((li) => problem.nodes[i].labels[li].weight);
        const sum = w.reduce((s, x) => s + x, 0);
        const h = Math.log(sum) - w.reduce((s, x) => s + x * Math.log(x || 1), 0) / sum + r.next() * 1e-3;
        if (h < bestH) { bestH = h; best = i; }
      }
      if (best < 0) break;
      const w = open[best].map((li) => problem.nodes[best].labels[li].weight);
      let t = r.next() * w.reduce((s, x) => s + x, 0);
      let pick = open[best][open[best].length - 1];
      for (let k = 0; k < w.length; k++) { t -= w[k]; if (t <= 0) { pick = open[best][k]; break; } }
      open[best] = [pick];
      fine = propagate([best]);
    }
    if (fine && open.every((o) => o.length === 1)) return open.map((o, i) => problem.nodes[i].labels[o[0]].label);
  }
  return null;
}

// ---- Townscaper's corners. The four cells round a corner, in the order north-west, north-east, south-east, south-west, filled (1) or not (0), make 16 cases that are six pieces
// turned: nothing, a lone cell (an outside corner), two side by side (a wall), two opposite (a pinch), three (an inside corner) and all four (solid). `turn` is
// quarter turns clockwise from the piece's own drawing (a lone cell in the north-west, a wall with its filled side to the north, the pinch with north-west and south-east
// filled, the inside corner with the empty cell in the south-west).
export type CornerPiece = "empty" | "outside" | "wall" | "pinch" | "inside" | "solid";
export function cornerCase(mask: [boolean, boolean, boolean, boolean]): { piece: CornerPiece; turn: number } {
  const bits = mask.map(Number);
  const count = bits.reduce((s, x) => s + x, 0);
  const at = (t: number, from: number[]) => bits.map((_, i) => from[(i - t + 4) % 4]);
  const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);
  const drawn: Record<CornerPiece, number[]> = { empty: [0, 0, 0, 0], outside: [1, 0, 0, 0], wall: [1, 1, 0, 0], pinch: [1, 0, 1, 0], inside: [1, 1, 1, 0], solid: [1, 1, 1, 1] };
  const piece = (["empty", "outside", "wall", "pinch", "inside", "solid"] as CornerPiece[])[count === 2 && bits[0] === bits[2] ? 3 : count === 2 ? 2 : count === 1 ? 1 : count === 3 ? 4 : count === 0 ? 0 : 5];
  for (let t = 0; t < 4; t++) if (same(at(t, drawn[piece]), bits)) return { piece, turn: t };
  return { piece, turn: 0 };
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
  // A palace, a great house: favours the first crown, the plainest trim
  grand?: boolean;
}
// Two buildings are neighbours when their boxes face each other across a way (no more than a avenue's width between them, overlapping along the other axis)
const AVENUE = 6;
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
      alley.push(Math.max(gx, gy) <= 3);
    }
  }
  return { edges, alley };
}

// Rules: facing buildings never take the same crown; their trims differ by at most one step; a band is shared across an alley (a street reads as one frontage)
export function looksFor(nodes: LookNode[], dice: () => Dice): Record<string, BuildingLook> {
  const { edges, alley } = neighbours(nodes);
  const kind = new Map(edges.map((e, i) => [`${e[0]}|${e[1]}`, alley[i]]));
  const labels = (g?: boolean) => {
    const out: { label: BuildingLook; weight: number }[] = [];
    for (let crown = 0; crown < CROWNS; crown++) for (let trim = 0; trim < TRIMS; trim++) for (const band of [true, false]) out.push({ label: { crown, trim, band }, weight: (g ? (crown === 0 ? 6 : 1) * (trim === 0 ? 3 : 1) : 1) * (band ? 2 : 1) });
    return out;
  };
  const solved = solveGraph<BuildingLook>({
    nodes: nodes.map((n) => ({ labels: labels(n.grand) })),
    edges,
    allowed: (a, b, e) => a.crown !== b.crown && Math.abs(a.trim - b.trim) <= 1 && (!kind.get(`${e[0]}|${e[1]}`) && !kind.get(`${e[1]}|${e[0]}`) || a.band === b.band),
  }, dice);
  const out: Record<string, BuildingLook> = {};
  nodes.forEach((n, i) => { out[n.id] = solved?.[i] ?? { crown: 0, trim: 0, band: true }; });
  return out;
}
