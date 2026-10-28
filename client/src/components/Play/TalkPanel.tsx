// Talking with someone in their own words: a person the party meets, or one of its own party members. The reply is made by the local model
// (server/dialogue.ts, Ollama) and streamed in as it is written. Each line is a fresh exchange: only the speaker's own last reply travels with
// it, never a transcript. What is said here is colour, not a roll: it changes nothing in the game (Persuade, Deceive and the rest are the
// buttons beside it).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export interface TalkSpeaker {
  id: string;
  name: string;
  species?: string;
  role?: string;
  disposition?: string;
  // "party" for the party's own companions
  kind?: string;
  notes?: string;
}
export interface TalkPlayer {
  name: string;
  species?: string;
  class?: string;
  alignment?: string;
}

// The last thing each speaker said, kept while the page is open
const lastSaid = new Map<string, string>();

export function TalkPanel({ speaker, player, scene, disabled }: { speaker: TalkSpeaker; player: TalkPlayer; scene: string; disabled?: boolean }) {
  const [line, setLine] = useState("");
  const [heard, setHeard] = useState<{ asked: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef<AbortController | null>(null);

  const status = useQuery<{ ok: boolean; model: string }>({
    queryKey: ["/api/dialogue/status"],
    queryFn: async () => (await fetch("/api/dialogue/status")).json(),
    staleTime: 30000,
  });

  // Another person picked, or the panel closed: whatever was being said stops
  useEffect(() => () => stop.current?.abort(), []);
  useEffect(() => {
    stop.current?.abort();
    setHeard(null);
    setError("");
    setLine("");
    setBusy(false);
  }, [speaker.id]);

  const say = async () => {
    const asked = line.trim();
    if (!asked || busy) return;
    const control = new AbortController();
    stop.current = control;
    setBusy(true);
    setError("");
    setHeard({ asked, text: "" });
    setLine("");
    try {
      const response = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker, player, scene, line: asked, recap: lastSaid.get(speaker.id) }),
        signal: control.signal,
      });
      if (!response.ok || !response.body) throw new Error("The dialogue service did not answer.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const row = pending.slice(0, nl).trim();
          pending = pending.slice(nl + 1);
          if (!row) continue;
          const event = JSON.parse(row);
          if (event.error) throw new Error(event.error);
          if (event.delta) {
            text += event.delta;
            setHeard({ asked, text });
          }
          // The server's cleaned copy (markdown removed, cut at the last whole sentence) replaces what streamed in
          if (event.done) {
            text = event.text;
            setHeard({ asked, text });
          }
        }
      }
      if (text) lastSaid.set(speaker.id, text);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message ?? "Could not get a reply.");
    } finally {
      if (stop.current === control) setBusy(false);
    }
  };

  if (status.data && !status.data.ok) {
    return <p className="text-xs text-gray-400" data-testid="talk-off">Spoken replies are off: the local model ({status.data.model}) is not running. Say what you do on the GM Interface tab.</p>;
  }

  return (
    <div className="mt-1 space-y-1" data-testid="talk-panel">
      {heard && (
        <div className="space-y-1 rounded border border-gray-600/60 p-1 text-xs" data-testid="talk-heard">
          <p className="italic text-gray-400">You: {heard.asked}</p>
          {heard.text
            ? heard.text.split(/\n\s*\n/).map((p, i) => <p key={i} className="text-gray-100">{p}</p>)
            : busy && <p className="text-gray-400">{speaker.name} is thinking...</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-300" data-testid="talk-error">{error}</p>}
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void say(); }}>
        <input
          className="min-w-0 flex-1 rounded border border-gray-600 bg-transparent px-2 py-1 text-xs"
          value={line}
          maxLength={400}
          placeholder={`Say something to ${speaker.name}...`}
          onChange={(e) => setLine(e.target.value)}
          disabled={disabled}
          data-testid="talk-input"
        />
        {busy
          ? <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => stop.current?.abort()} data-testid="talk-stop">Stop</Button>
          : <Button type="submit" size="sm" variant="outline" className="h-7 px-2" disabled={disabled || !line.trim()} data-testid="talk-say">Say</Button>}
      </form>
    </div>
  );
}
