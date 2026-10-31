import { useEffect, useRef, useState } from "react";
import { useDice } from "@/lib/stores/useDice";
import { pageDice, faceValues } from "@/lib/sw5e/dice";
import type { DiceTable } from "./dice";

// The dice table (ui/dice.tsx diceTable) throws the dice a roll needs over the whole screen.
// It is loaded and made on the first roll (with the 3D renderer: kept out of the pages that never roll) and then only shown while a roll
// is asked for; the result stays on the table for HOLD_MS before the logic reads it.
const HOLD_MS = 2000;

// Mounted once, above every page: a roll that the logic asks for covers the map
export default function DiceRoller() {
  const table = useDice((s) => s.table);
  const finishTable = useDice((s) => s.finishTable);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dice = useRef<Promise<DiceTable> | null>(null);
  const holding = useRef(0);
  const [text, setText] = useState({ total: "…", chips: "" });

  useEffect(() => {
    const c = canvas.current;
    if (!table || !c) return;
    dice.current ??= import("./dice").then((m) =>
      m.diceTable(
        c,
        (total, chips) => setText({ total, chips }),
        (id, values) => {
          const t = useDice.getState().table;
          // A result for a roll that is over, or one already being held, is ignored
          if (!t || t.id !== id || holding.current === t.id) return;
          holding.current = t.id;
          const faces = faceValues(t.dice, values);
          setTimeout(() => finishTable(t.id, faces), HOLD_MS);
        },
      ),
    );
    dice.current.then((d) => d.roll(table.id, pageDice(table.dice)));
  }, [table]);

  useEffect(() => () => void dice.current?.then((d) => d.dispose()), []);

  return (
    <div className="fixed inset-0 z-[80] bg-[#14181c]" style={{ display: table ? "block" : "none" }} data-testid="dice-table">
      <canvas ref={canvas} className="block h-full w-full" style={{ touchAction: "none", cursor: "grab" }} />
      <div className="pointer-events-none fixed left-1/2 top-2 min-w-[220px] max-w-[calc(100%-16px)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#16181d]/90 px-3 py-2 text-center text-gray-100 backdrop-blur">
        <div className="text-[22px] font-bold">{text.total}</div>
        <div className="mt-0.5 text-[13px] text-gray-400">{text.chips}</div>
      </div>
      {table && <div className="pointer-events-none fixed inset-x-0 bottom-4 text-center text-sm text-gray-200">{table.label}</div>}
    </div>
  );
}
