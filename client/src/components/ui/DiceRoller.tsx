import { useEffect, useRef, useState } from "react";
import { useDice } from "@/lib/stores/useDice";
import { pageDice, faceValues } from "@/lib/sw5e/dice";

// The dice-roller page (public/dice/roller.html) throws the dice a roll needs over the whole screen.
// It is mounted on the first roll and then only shown while a roll is asked for; the result stays
// on the table for HOLD_MS before the logic reads it.
const HOLD_MS = 2000;

// Mounted once, above every page: a roll that the logic asks for covers the map
export default function DiceRoller() {
  const table = useDice((s) => s.table);
  const finishTable = useDice((s) => s.finishTable);
  const [mounted, setMounted] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const holding = useRef(0);

  const throwDice = () => {
    const t = useDice.getState().table;
    if (!t || !ready.current) return;
    frame.current?.contentWindow?.postMessage({ type: "roll", id: t.id, dice: pageDice(t.dice) }, "*");
  };

  useEffect(() => {
    if (table) setMounted(true);
    throwDice();
  }, [table]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "ready") {
        ready.current = true;
        throwDice();
        return;
      }
      if (e.data?.type !== "result") return;
      const t = useDice.getState().table;
      // A result for a roll that is over, or one already being held, is ignored
      if (!t || t.id !== e.data.id || holding.current === t.id) return;
      holding.current = t.id;
      const faces = faceValues(t.dice, e.data.values);
      setTimeout(() => finishTable(t.id, faces), HOLD_MS);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finishTable]);

  return (
    <div className="fixed inset-0 z-[80]" style={{ display: table ? "block" : "none" }}>
      {mounted && <iframe ref={frame} src="/dice/roller.html" title="Dice roller" className="w-full h-full border-0" />}
      {table && (
        <div className="pointer-events-none fixed bottom-4 inset-x-0 text-center text-sm text-gray-200">{table.label}</div>
      )}
    </div>
  );
}
