// Dejarik against someone (2026-10-27), by the rules of No Name Publishing's "Dejarik Holochess" (shared/logic/dejarik.ts; credited in CREDITS.md):
// the three-ring board drawn in SVG, four creatures a side, two actions a turn. Tap a creature of yours, then a lit space to move it, or an enemy
// beside it to attack. The creatures are drawn as simple tokens (a letter or two, a colour by side, its ratings under it): the studio's holograms
// are not ours to copy.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRandom } from "@shared/logic";
import { CENTRE, KINDS, ROLES, SPECIES, dejarikAi, dejarikDo, legalActions, moves, neighbours, newDejarik, orbitOf, randomPicks, rayOf, targets, type Dejarik, type Kind, type Piece, type Variant } from "@shared/logic/dejarik";

const MID = 200;
const R = [34, 96, 160];
const TOKEN: Record<Kind, string> = { savrip: "Sav", monnok: "Mon", ghhhk: "Gh", houjix: "Hou", strider: "Kin", ngok: "Ng", klorslug: "Klo", molator: "Mol" };

// Where a space is drawn: the angle of its ray (ray 0 at the top, clockwise), turned half a turn when `flip` (so that the player's side is below)
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number): [number, number] => [MID + r * Math.cos(rad(deg)), MID + r * Math.sin(rad(deg))];
function sector(space: number, flip: boolean): { d: string; at: [number, number] } {
  if (space === CENTRE) return { d: `M ${MID - R[0]} ${MID} a ${R[0]} ${R[0]} 0 1 0 ${R[0] * 2} 0 a ${R[0]} ${R[0]} 0 1 0 ${-R[0] * 2} 0`, at: [MID, MID] };
  const orbit = orbitOf(space);
  const turn = (rayOf(space) * 30 - 90 + (flip ? 180 : 0));
  const [r0, r1] = orbit === 1 ? [R[0], R[1]] : [R[1], R[2]];
  const [a, b, c, e] = [pt(r1, turn - 15), pt(r1, turn + 15), pt(r0, turn + 15), pt(r0, turn - 15)];
  return { d: `M ${a[0]} ${a[1]} A ${r1} ${r1} 0 0 1 ${b[0]} ${b[1]} L ${c[0]} ${c[1]} A ${r0} ${r0} 0 0 0 ${e[0]} ${e[1]} Z`, at: pt((r0 + r1) / 2, turn) };
}

export function DejarikGame({ player, rival, stake, onDone }: { player: string; rival: string; stake: number; onDone: (paid: number, won: boolean) => void }) {
  const rng = useRef(createRandom((Date.now() & 0xffffff) + 11));
  const [variant, setVariant] = useState<Variant>("standard");
  const [mine, setMine] = useState<Partial<Record<(typeof ROLES)[number], Kind>>>({});
  const [g, setG] = useState<Dejarik | null>(null);
  const ref = useRef<Dejarik | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const me = 1 as 0 | 1;
  const flip = me === 0;

  const start = () => {
    const chosen = ROLES.map((role) => mine[role]).filter(Boolean) as Kind[];
    const theirs = randomPicks(rng.current, chosen);
    const picks: [Kind[], Kind[]] = me === 0 ? [chosen, theirs] : [theirs, chosen];
    const game = newDejarik(variant === "corellian" ? null : picks, rng.current, variant);
    ref.current = game;
    setG(game);
  };
  const act = (a: Parameters<typeof dejarikDo>[1]) => {
    if (!ref.current) return;
    const next = dejarikDo(ref.current, a, rng.current);
    ref.current = next;
    setG(next);
    setSel(null);
  };
  // The other side plays after a moment, a move at a time
  useEffect(() => {
    if (!g || g.winner !== undefined) return;
    const theirTurn = g.pending ? g.pending.mover !== me : g.turn !== me;
    if (!theirTurn) return;
    const t = setTimeout(() => ref.current && act(dejarikAi(ref.current, rng.current)), 750);
    return () => clearTimeout(t);
  }, [g]);

  const pieceAt = (space: number) => g?.pieces.find((p) => p.space === space);
  const mineTurn = !!g && g.winner === undefined && (g.pending ? g.pending.mover === me : g.turn === me);
  const selPiece = g?.pieces.find((p) => p.id === sel && p.owner === me);
  const canMove = useMemo(() => (g && selPiece && mineTurn && !g.pending ? moves(g, selPiece.id) : []), [g, sel, mineTurn]);
  const canHit = useMemo(() => (g && selPiece && mineTurn && !g.pending ? targets(g, selPiece.id) : []), [g, sel, mineTurn]);
  const pushes = g?.pending && g.pending.mover === me ? g.pending.options : [];
  const stuck = !!g && mineTurn && !g.pending && legalActions(g).every((a) => a.type === "pass");
  const taken = new Set(Object.values(mine));

  const tapSpace = (space: number) => {
    if (!g || !mineTurn) return;
    if (pushes.includes(space)) return act({ type: "push", to: space });
    const here = pieceAt(space);
    if (here && here.owner === me && !g.pending) return setSel(here.id === sel ? null : here.id);
    if (here && selPiece && canHit.some((t) => t.id === here.id)) return act({ type: "attack", piece: selPiece.id, target: here.id });
    const m = canMove.find((c) => c.to === space);
    if (m && selPiece) return act({ type: "move", piece: selPiece.id, path: m.path });
    setSel(null);
  };

  if (!g) {
    return (
      <div className="pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto rounded-lg border border-sky-700/60 bg-gray-950/95 p-3 text-sm text-gray-100 shadow-xl" data-testid="dejarik-draft">
        <div className="font-bold text-sky-300">Dejarik against {rival}</div>
        <div className="text-xs text-gray-400">Wager {stake} cr a side (the winner takes {stake * 2}). Take one Power, one Offensive, one Defensive and one Mobile creature. Attack and Defense are dice, Movement is spaces.</div>
        <div className="flex gap-1 text-xs">
          {([["standard", "Standard"], ["corellian", "Corellian (random)"], ["imperial", "Imperial (all 2/2/2)"]] as const).map(([v, label]) => (
            <button key={v} className={`rounded border px-2 py-1 ${variant === v ? "border-sky-400 bg-sky-900" : "border-gray-600"}`} onClick={() => setVariant(v)} data-testid={`dejarik-variant-${v}`}>{label}</button>
          ))}
        </div>
        {variant !== "corellian" && ROLES.map((role) => (
          <div key={role} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-xs capitalize text-gray-400">{role === "power" ? "Power" : role === "offense" ? "Offensive" : role === "defense" ? "Defensive" : "Mobile"}</span>
            {KINDS.filter((k) => SPECIES[k].role === role).map((k) => {
              const s = SPECIES[k];
              return (
                <button key={k} className={`rounded border px-2 py-1 text-left text-xs ${mine[role] === k ? "border-sky-400 bg-sky-900" : "border-gray-600 hover:bg-gray-800"}`} onClick={() => setMine({ ...mine, [role]: k })} data-testid={`dejarik-pick-${k}`}>
                  <b>{s.name}</b><br />Attack {variant === "imperial" ? 2 : s.attack} · Defense {variant === "imperial" ? 2 : s.defense} · Move {variant === "imperial" ? 2 : s.move}
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex gap-2">
          <button className="rounded bg-sky-700 px-2 py-1 hover:bg-sky-600 disabled:opacity-40" disabled={variant !== "corellian" && taken.size < 4} onClick={start} data-testid="dejarik-start">Begin</button>
          <button className="rounded border border-gray-600 px-2 py-1 hover:bg-gray-800" onClick={() => onDone(stake, false)} data-testid="dejarik-cancel">Not now (stake returned)</button>
        </div>
      </div>
    );
  }

  const won = g.winner === me;
  const over = g.winner !== undefined;
  return (
    <div className="pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto rounded-lg border border-sky-700/60 bg-gray-950/95 p-3 text-sm text-gray-100 shadow-xl" data-testid="dejarik-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-sky-300">Dejarik: {player} against {rival}</div>
          <div className="text-xs text-gray-400" data-testid="dejarik-turn">{over ? (won ? "You have won." : "You have lost.") : g.pending ? (g.pending.mover === me ? "Choose where the creature is pushed." : `${rival} places the pushed creature.`) : g.turn === me ? `Your turn: ${g.actions} action${g.actions === 1 ? "" : "s"} left` : `${rival}'s turn`}</div>
        </div>
        {!over && <button className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800" onClick={() => onDone(0, false)} data-testid="dejarik-forfeit">Forfeit</button>}
      </div>
      <svg viewBox="0 0 400 400" className="mx-auto w-full max-w-[380px]" data-testid="dejarik-board">
        <rect width="400" height="400" rx="16" fill="#06121f" />
        {Array.from({ length: 25 }, (_, space) => {
          const { d } = sector(space, flip);
          const ring = orbitOf(space);
          const base = ring === 0 ? "#0b3b5a" : (rayOf(space) + ring) % 2 ? "#0e4a6e" : "#082c44";
          const lit = canMove.some((m) => m.to === space) ? "#16a34a" : pushes.includes(space) ? "#ea580c" : undefined;
          return <path key={space} d={d} fill={lit ?? base} fillOpacity={lit ? 0.75 : 1} stroke="#38bdf8" strokeWidth="1" onClick={() => tapSpace(space)} style={{ cursor: "pointer" }} data-testid={`dejarik-space-${space}`} />;
        })}
        {g.pieces.map((p) => {
          const [x, y] = sector(p.space, flip).at;
          const s = SPECIES[p.kind];
          const hit = canHit.some((t) => t.id === p.id);
          const mineP = p.owner === me;
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} onClick={() => tapSpace(p.space)} style={{ cursor: "pointer" }} data-testid={`dejarik-piece-${p.id}`}>
              <title>{`${s.name}: Attack ${s.attack}, Defense ${s.defense}, Move ${s.move}${p.prone ? " (prone)" : ""}`}</title>
              <circle r="19" fill={mineP ? "#1d4ed8" : "#b91c1c"} stroke={sel === p.id ? "#facc15" : hit ? "#f97316" : "#e5e7eb"} strokeWidth={sel === p.id || hit ? 3.5 : 1.5} opacity={p.prone ? 0.55 : 1} />
              <text y="-2" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{TOKEN[p.kind]}{p.prone ? "·z" : ""}</text>
              <text y="10" textAnchor="middle" fontSize="8" fill="#e5e7eb">{`${g.variant === "imperial" ? 2 : s.attack}/${g.variant === "imperial" ? 2 : s.defense}/${g.variant === "imperial" ? 2 : s.move}`}</text>
            </g>
          );
        })}
      </svg>
      {mineTurn && !g.pending && (
        <div className="flex flex-wrap gap-2" data-testid="dejarik-actions">
          {selPiece?.prone && <button className="rounded bg-sky-800 px-2 py-1 hover:bg-sky-700" onClick={() => act({ type: "stand", piece: selPiece.id })} data-testid="dejarik-stand">Stand {SPECIES[selPiece.kind].name} up</button>}
          {stuck && <button className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600" onClick={() => act({ type: "pass" })} data-testid="dejarik-pass">Nothing can act: pass</button>}
          {!selPiece && !stuck && <span className="text-xs text-gray-400">Tap one of your (blue) creatures, then a lit space to move it or an enemy beside it to attack. Both actions must be used.</span>}
          {selPiece && !selPiece.prone && <span className="text-xs text-gray-300">{SPECIES[selPiece.kind].name}: {canMove.length} places to go, {canHit.length} to attack.</span>}
        </div>
      )}
      {over && (
        <div className={`rounded border p-2 ${won ? "border-green-600 bg-green-950/50" : "border-red-700 bg-red-950/40"}`} data-testid="dejarik-result">
          <div className="font-semibold">{won ? `You win and take the wager: ${stake * 2} cr.` : `${rival} wins. Your ${stake} cr are gone.`}</div>
          <button className="mt-1 rounded border border-gray-500 px-2 py-1 hover:bg-gray-800" onClick={() => onDone(won ? stake * 2 : 0, won)} data-testid="dejarik-done">Leave the board</button>
        </div>
      )}
      <div className="max-h-20 overflow-y-auto rounded bg-black/40 p-1 text-xs text-gray-400">{g.log.slice(-5).map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}
