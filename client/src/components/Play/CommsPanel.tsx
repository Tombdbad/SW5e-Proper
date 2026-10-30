// The commlink (2026-10-30; the user: "players and party members to EACH have a comms item in their possession to allow communication over
// distance, ... speak vocally to NPCs and distant party members (fallback to keyboard)"). People the party has grown warm to (regard 20 or more)
// and who carry a commlink can be called from anywhere on the same planet: the talk is the same as face to face (TalkPanel, local model, their
// own voice) but over the comlink's sound. Other players of a co-op game are reached by a message, typed or spoken, that they hear in this
// character's voice. House rules, labelled on screen: see shared/logic/comms.ts.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TalkPanel, useMic, type TalkPlayer, type TalkSpeaker } from "@/components/Play/TalkPanel";
import type { Say } from "@/lib/coop";

export interface CommsContact extends TalkSpeaker {
  where: string;
  ok: boolean;
  why: string;
}
export interface CommsMate {
  id: string;
  name: string;
  where: string;
  ok: boolean;
  why: string;
}

function MateLine({ mate, onSay }: { mate: CommsMate; onSay: (text: string, to: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const send = (t: string) => {
    if (!t.trim()) return;
    onSay(t, mate.id);
    setText("");
    setError("");
  };
  const mic = useMic((t) => send(t), setError);
  return (
    <div className="space-y-1 rounded border border-gray-600/60 p-1" data-testid="comms-mate">
      <p className="text-xs"><span className="font-semibold text-sky-200">{mate.name}</span> <span className="text-gray-400">at {mate.where}</span></p>
      {mate.ok ? (
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="min-w-0 flex-1 rounded border border-gray-600 bg-transparent px-2 py-1 text-xs" value={text} maxLength={400} placeholder={`Message ${mate.name}...`} onChange={(e) => setText(e.target.value)} data-testid="comms-mate-input" />
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={!!mic.why || mic.state === "reading"} title={mic.why || "Speak: the game's own model reads it, nothing leaves this PC"} onClick={() => void mic.toggle()} data-testid="comms-mate-mic">
            {mic.state === "listening" ? "Listening... (tap to send)" : mic.state === "reading" ? "Reading..." : "Speak"}
          </Button>
          <Button type="submit" size="sm" variant="outline" className="h-7 px-2" disabled={!text.trim()} data-testid="comms-mate-send">Send</Button>
        </form>
      ) : <p className="text-xs text-gray-400">{mate.why}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function CommsPanel({ hasComms, contacts, mates, says, player, scene, onSpoke, onSay }: {
  hasComms: boolean;
  contacts: CommsContact[];
  mates: CommsMate[];
  says: Say[];
  player: TalkPlayer;
  scene: (where: string) => string;
  onSpoke: (id: string) => void;
  onSay: (text: string, to: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const contact = contacts.find((c) => c.id === picked);
  return (
    <div className="space-y-2 text-xs" data-testid="comms-panel">
      <p className="text-gray-300">
        {hasComms ? "You carry a commlink." : "You carry no commlink."} House rules: everyone in the party is issued a commlink; a call needs one at each end and reaches anyone on the same planet (the book's 30 miles, in
        the open), and nothing between worlds without a ship's transceiver. People you have grown warm to (regard 20 or more) who carry one can be called. Speak into the microphone or type.
      </p>
      {mates.length > 0 && <div className="space-y-1">{mates.map((m) => <MateLine key={m.id} mate={m} onSay={onSay} />)}</div>}
      {says.length > 0 && (
        <div className="max-h-28 space-y-0.5 overflow-y-auto rounded border border-gray-700 p-1" data-testid="comms-log">
          {says.slice(-8).map((s, i) => <p key={i} className={s.mine ? "text-gray-400" : "text-gray-100"}><span className="font-semibold">{s.name}:</span> {s.text}</p>)}
        </div>
      )}
      <p className="font-semibold text-gray-200">People you can call</p>
      {contacts.length === 0 && <p className="text-gray-400">No one yet. Talk, trade and help people until they are warm to you, and they will give you their frequency.</p>}
      <div className="flex flex-wrap gap-1">
        {contacts.map((c) => (
          <Button key={c.id} size="sm" variant={picked === c.id ? "default" : "outline"} className="h-auto whitespace-normal px-2 py-1 text-left text-xs" disabled={!c.ok} title={c.ok ? "" : c.why} onClick={() => setPicked(picked === c.id ? null : c.id)} data-testid="comms-contact">
            {c.name} <span className="text-gray-400">{c.ok ? `(${c.attitude}, at ${c.where})` : c.why}</span>
          </Button>
        ))}
      </div>
      {contact && <TalkPanel key={contact.id} speaker={contact} player={player} scene={scene(contact.where)} comms onSpoke={() => onSpoke(contact.id)} />}
    </div>
  );
}
