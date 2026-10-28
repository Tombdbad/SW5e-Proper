// Spoken dialogue from a local model (Ollama), for people the party talks to and for its own party members.
//   GET  /api/dialogue/status   { ok, model, primed } whether the model answers
//   POST /api/dialogue          { speaker, player, scene, line, recap? } -> NDJSON: {"delta": "..."} lines, then {"done": true, "text": "..."}
//
// Speed on a CPU or a small iGPU (measured on this machine with gemma4:e2b: about 10 tokens a second out, 75 in) shapes every choice here:
//  - Each request is a fresh session: the model is sent the style guide (SYSTEM, the same every time) and one short card for this exchange,
//    never a transcript, so the context stays small however long the talk goes. `recap` is at most the speaker's last reply, trimmed.
//  - Prefix caching: Ollama keeps the evaluated start of the last prompts, but with this model it reuses only a start it has seen as the
//    end of an earlier prompt. So the style guide is sent alone once (`prime`, at start and again when a reply shows it was evaluated in
//    full) and every later request begins with exactly the same text. A primed request evaluates only its card (about 1.3 s, not 6 s).
//    SYSTEM must therefore never change between requests, and `num_ctx` must stay the same (a change reloads the model).
//  - The reply is streamed, so the words appear as they are made; it is capped at three paragraphs and `MAX_TOKENS`.
//  - One reply is made at a time (the machine has one slot's worth of speed).
import type { Express, Request, Response } from "express";

const URL_BASE = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const NUM_CTX = 2048;
const MAX_TOKENS = 240;
const MAX_PARAGRAPHS = 3;
const KEEP_ALIVE = "2h";
// Slower than this per prompt token, a reply was evaluated from scratch (primed ones run at about 2.5 ms, unprimed at about 13 ms)
const SLOW_MS_PER_TOKEN = 7;

const SYSTEM = `You voice characters in a Star Wars tabletop role-playing game (Star Wars 5th Edition), in the tone of the films: plain, lived-in, a little wry. Each message gives you a CARD for one exchange: the SCENE, WHO YOU ARE, WHO IS TALKING TO YOU, and sometimes what you said last. It ends with what the player says. Reply as the character you are, and only as them.

Rules for every reply:
- Write one to three short paragraphs of plain prose, 120 words at most in all. Fewer is better when a few words will do.
- Speak in the first person. A brief action or glance may open a paragraph, but most of it is speech.
- Match the character: their species, trade, mood and how they feel about the party (friendly, neutral or hostile). A shopkeeper talks of trade, a guard of the law, a droid like a droid, a companion like a friend who shares the party's risks.
- Use only what is on the card. Do not invent named people, places, prices, quests or items that are not there. If you would not know something, say so, or turn the talk back to what you do know.
- Never speak or act for the player and never describe what the player is doing or looking like. Never decide the result of a die roll, a fight or a deal, and never mention rules, dice, stats, hit points or the game.
- No lists, no headings, no markdown, no stage directions in brackets, no remarks outside the character. Do not start with your own name.

Example of the style.
CARD: You are Hessa Marl, a human dock clerk, neutral to the party. The port is busy and an Imperial patrol is about.
PLAYER SAYS: "Which berth is the Lark in?"
REPLY: Hessa runs a thumb down a battered datapad without looking up. "Lark, Lark. Bay nine, and don't let it sit there past the evening shift. The patrol's been counting hulls all morning."

She glances over then, and lowers her voice. "If you've something aboard you'd rather they didn't count, that's your business. Just don't make it mine."`;

interface Card {
  speaker: { name: string; species?: string; role?: string; disposition?: string; kind?: string; notes?: string };
  player: { name: string; species?: string; class?: string; alignment?: string };
  scene: string;
  line: string;
  recap?: string;
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// The variable part of a request. Kept short: every token here is evaluated on each request.
export function cardText(c: Card): string {
  const s = c.speaker;
  const who = [clip(s.species, 40), clip(s.role, 60)].filter(Boolean).join(" ");
  const feeling = s.kind === "party" ? "a member of the player's party, travelling with them" : s.disposition === "friendly" ? "friendly to the party" : s.disposition === "hostile" ? "hostile to the party" : "neutral to the party";
  const p = c.player;
  const you = [clip(p.species, 40), clip(p.class, 40)].filter(Boolean).join(" ");
  return [
    `SCENE: ${clip(c.scene, 300)}`,
    `WHO YOU ARE: ${clip(s.name, 60)}${who ? `, ${/^[aeiou]/i.test(who) ? "an" : "a"} ${who}` : ""}, ${feeling}.${s.notes ? ` ${clip(s.notes, 200)}` : ""}`,
    `WHO IS TALKING TO YOU: ${clip(p.name, 60)}${you ? `, ${/^[aeiou]/i.test(you) ? "an" : "a"} ${you}` : ""}.`,
    c.recap ? `YOU SAID LAST: "${clip(c.recap, 300)}"` : "",
    `PLAYER SAYS: "${clip(c.line, 400)}"`,
  ].filter(Boolean).join("\n");
}

// Whatever the model wrapped the speech in: a leading name or "REPLY:", markdown, more than three paragraphs, a sentence cut off at the cap
export function tidy(text: string, cut: boolean): string {
  let t = text.replace(/\r/g, "").replace(/^\s*(REPLY|Reply)\s*:\s*/, "").replace(/[*_#`]+/g, "").trim();
  let paragraphs = t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (paragraphs.length > MAX_PARAGRAPHS) {
    paragraphs = paragraphs.slice(0, MAX_PARAGRAPHS);
    cut = false;
  }
  t = paragraphs.join("\n\n");
  if (cut) {
    const end = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"), t.lastIndexOf('."'), t.lastIndexOf('!"'), t.lastIndexOf('?"'));
    if (end > t.length * 0.4) t = t.slice(0, t[end + 1] === '"' ? end + 2 : end + 1);
  }
  return t;
}

let primed = false;
let primedAt = 0;
// One reply at a time
let queue: Promise<unknown> = Promise.resolve();
const alone = <T,>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
};

const body = (messages: { role: string; content: string }[], stream: boolean, predict: number) =>
  JSON.stringify({
    model: MODEL,
    messages,
    stream,
    think: false,
    keep_alive: KEEP_ALIVE,
    options: { num_ctx: NUM_CTX, num_predict: predict, temperature: 0.8, top_p: 0.95, repeat_penalty: 1.1 },
  });

// Send the style guide alone, so its evaluated start is what the next request reuses
async function prime(): Promise<boolean> {
  try {
    const r = await fetch(`${URL_BASE}/api/chat`, { method: "POST", body: body([{ role: "system", content: SYSTEM }], false, 1), signal: AbortSignal.timeout(120000) });
    if (!r.ok) return false;
    await r.json();
    primed = true;
    primedAt = Date.now();
    return true;
  } catch {
    primed = false;
    return false;
  }
}
const primeLater = () => void alone(prime);

export function registerDialogueRoutes(app: Express) {
  // Warm the model and the prefix while the rest of the server starts (it may not be running: then talk is simply off)
  setTimeout(primeLater, 1500);

  app.get("/api/dialogue/status", async (_req: Request, res: Response) => {
    try {
      const r = await fetch(`${URL_BASE}/api/tags`, { signal: AbortSignal.timeout(2500) });
      const names: string[] = r.ok ? ((await r.json()) as any).models?.map((m: any) => m.name) ?? [] : [];
      res.json({ ok: names.some((n) => n === MODEL || n.startsWith(`${MODEL}:`)), model: MODEL, primed });
    } catch {
      res.json({ ok: false, model: MODEL, primed: false });
    }
  });

  app.post("/api/dialogue", async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.speaker?.name || !b.line || !b.player?.name) return void res.status(400).json({ message: "speaker, player and line are required" });
    const card = cardText({ speaker: b.speaker, player: b.player, scene: b.scene ?? "", line: b.line, recap: b.recap });

    const stop = new AbortController();
    res.on("close", () => stop.abort());
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    const send = (o: object) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };

    try {
      await alone(async () => {
        if (stop.signal.aborted) return;
        // Idle for a long time (the model may have been unloaded, or another program used it): start the prefix again
        if (!primed || Date.now() - primedAt > 90 * 60 * 1000) await prime();
        const r = await fetch(`${URL_BASE}/api/chat`, {
          method: "POST",
          body: body([{ role: "system", content: SYSTEM }, { role: "user", content: card }], true, MAX_TOKENS),
          signal: stop.signal,
        });
        if (!r.ok || !r.body) throw new Error(`the model answered ${r.status}`);
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let text = "";
        let last: any = {};
        let enough = false;
        while (!enough) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = pending.indexOf("\n")) >= 0) {
            const row = pending.slice(0, nl).trim();
            pending = pending.slice(nl + 1);
            if (!row) continue;
            const j = JSON.parse(row);
            if (j.message?.content) {
              text += j.message.content;
              // A fourth paragraph is not wanted: stop making it
              if (text.split(/\n\s*\n/).filter((x) => x.trim()).length > MAX_PARAGRAPHS) { enough = true; break; }
              send({ delta: j.message.content });
            }
            if (j.done) last = j;
          }
        }
        if (enough) stop.abort();
        send({ done: true, text: tidy(text, last.done_reason === "length") });
        // A reply that had to evaluate its whole prompt means the prefix was lost: start it again for the next one
        if (last.prompt_eval_count && last.prompt_eval_duration / 1e6 / last.prompt_eval_count > SLOW_MS_PER_TOKEN) {
          primed = false;
          primeLater();
        }
      });
    } catch (e: any) {
      if (!stop.signal.aborted) send({ error: e?.message === "fetch failed" ? "The dialogue model is not running (is Ollama started?)." : String(e?.message ?? e) });
    } finally {
      res.end();
    }
  });
}
