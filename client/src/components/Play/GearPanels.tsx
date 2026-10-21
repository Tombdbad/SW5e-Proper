// Small panels of the gear in play that keep a little state of their own (typing a note, ticking languages): components, so that
// their hooks do not depend on the page's render order. The rules are in shared/logic comms.ts (house rules, labelled on screen).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Note } from "@shared/logic";

export function NotesPanel({ notes, allowed, where, onAdd, onDelete }: { notes: Note[]; allowed: number; where?: string; onAdd: (text: string) => void; onDelete: (index: number) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-1" data-testid="notes-panel">
      <p className="text-gray-300">Notes ({notes.length} of {allowed}){where ? `, written at ${where}` : ""}. House rule: the books give it no uses beyond holding information.</p>
      <div className="flex gap-1">
        <input className="h-7 flex-1 rounded bg-gray-700 px-2" value={text} maxLength={400} placeholder="A note" onChange={(e) => setText(e.target.value)} data-testid="note-input" />
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={!text.trim()} onClick={() => { onAdd(text); setText(""); }} data-testid="note-add">Write</Button>
      </div>
      {notes.map((n, i) => (
        <div key={i} className="flex items-start gap-1" data-testid="note">
          <span className="flex-1 text-gray-200">Day {n.day}{n.where ? `, ${n.where}` : ""}: {n.text}</span>
          <Button size="sm" variant="outline" className="h-5 px-2" onClick={() => onDelete(i)} data-testid="note-delete">Delete</Button>
        </div>
      ))}
    </div>
  );
}

export function TranslatorPanel({ name, slots, chosen, languages, known, canChange, onChange }: { name: string; slots: number; chosen: string[]; languages: string[]; known: string[]; canChange: boolean; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const unknown = languages.filter((l) => !known.includes(l));
  return (
    <div className="space-y-1" data-testid="translator-panel">
      <p className="text-gray-300">{name} holds {slots} languages beyond the ones you know: {chosen.length ? chosen.join(", ") : "none set"} ({chosen.length} of {slots}). A people that speaks only its own tongue (Wookiees, Jawas, Ewoks, Tusken, droids in Binary) is understood with it: haggling with them is not at disadvantage. House rule; the book lets the languages be changed while it is interfaced with a protocol droid or a computer, so only in a settlement, aboard a ship or with a protocol droid along.</p>
      <Button size="sm" variant="outline" className="h-6 px-2" disabled={!canChange} onClick={() => setOpen(!open)} data-testid="translator-set">{open ? "Done" : "Set languages"}</Button>
      {!canChange && <span className="ml-1 text-gray-400">No computer or protocol droid to interface with here.</span>}
      {open && canChange && (
        <div className="flex flex-wrap gap-1">
          {unknown.map((l) => {
            const on = chosen.includes(l);
            return (
              <Button key={l} size="sm" variant={on ? "default" : "outline"} className="h-6 px-2" disabled={!on && chosen.length >= slots} onClick={() => onChange(on ? chosen.filter((x) => x !== l) : [...chosen, l])} data-testid={`translator-${l}`}>{l}</Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
