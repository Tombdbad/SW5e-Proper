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

Your reply is spoken aloud by a voice actor, so it is ONLY the words the character says. Rules for every reply:
- One to three short paragraphs of speech, 90 words at most in all. Fewer is better when a few words will do.
- No narration at all: never describe what anyone does, looks like or feels, no gestures, no glances, no tone of voice, no surroundings, no "she says". No quotation marks around the speech.
- Sounds the character makes go in square brackets, from this list only, and only where they would be heard: [chuckle] [laugh] [sigh] [breath] [groan] [cough] [wheeze] [hmm] [gasp] [growl] [beep] [whistle] [static]. Use one or two at most, often none.
- A nervous, frightened or hurt character may stutter ("I-I didn't...") or trail off ("Well... uh..."); a calm one does not.
- Match the character: their species, trade, mood and how they feel about the party (friendly, neutral or hostile). A shopkeeper talks of trade, a guard of the law, a droid like a droid, a companion like a friend who shares the party's risks.
- Use only what is on the card. Do not invent named people, places, prices, quests or items that are not there. If you would not know something, say so, or turn the talk back to what you do know.
- Never speak for the player. Never decide the result of a die roll, a fight or a deal, and never mention rules, dice, stats, hit points or the game.
- No lists, no headings, no markdown, no remarks outside the character. Do not start with your own name.

Example of the style.
CARD: You are Hessa Marl, a human dock clerk, neutral to the party. The port is busy and an Imperial patrol is about.
PLAYER SAYS: "Which berth is the Lark in?"
REPLY: Lark, Lark... bay nine. And don't let it sit there past the evening shift, the patrol's been counting hulls all morning.

[sigh] If you've something aboard you'd rather they didn't count, that's your business. Just don't make it mine.`;

// The sounds a reply may carry in square brackets (the page plays them: client/src/lib/voice.ts); anything else in brackets is dropped
export const CUES = ["chuckle", "laugh", "sigh", "breath", "groan", "cough", "wheeze", "hmm", "gasp", "growl", "beep", "whistle", "static"];
// Narration the model still writes now and then: a sentence that tells what someone does rather than says (third person, or "I" doing
// something), opening with a name or a pronoun and one of these verbs
const ACTS = "smiles?|smirks?|grins?|glances?|looks?|leans?|shrugs?|nods?|sighs?|laughs?|chuckles?|frowns?|says?|whispers?|mutters?|murmurs?|replies|replied|answers?|adds?|pauses?|gestures?|points?|turns?|steps?|crosses|taps?|runs?|lowers?|raises?|tilts?|narrows?|folds?|rubs?|scratches|waves?|eyes|studies|regards?|watches|considers?|hesitates?|winces?|snorts?|scoffs?|beeps?|whirs?|whistles?|clicks?|buzzes|growls?|rumbles?";
const NARRATION = new RegExp(`^(?:(?:he|she|they|it|his|her|their|the [a-z ]{2,30})|[A-Z][\\w'-]+(?: [A-Z][\\w'-]+)?)\\s+(?:\\w+ly\\s+)?(?:${ACTS})\\b`, "i");
// (a sentence with I, me, you or we in it is someone talking, not narration)
const SPOKEN = /\b(?:I|me|my|you|your|we|us|our)\b/i;

// Only what is said aloud: stage directions in asterisks or round brackets, square brackets that are not a sound cue, narrating sentences
// (and, when the model put the speech in quotation marks, everything outside them) are taken out
export function speechOnly(text: string): string {
  const paragraphs = text.replace(/\r/g, "").split(/\n\s*\n/).map((para) => {
    let p = para.replace(/\*[^*\n]{1,200}\*/g, " ").replace(/\([^)\n]{1,200}\)/g, " ");
    // ([sighs heavily] is a sigh, [beeps] a beep)
    p = p.replace(/\[([^\]\n]{1,40})\]/g, (_, said: string) => { const cue = CUES.find((c) => said.toLowerCase().includes(c)); return cue ? `[${cue}]` : " "; });
    // Speech in quotation marks with narration round it: the quoted words alone
    const quoted = [...p.matchAll(/["“]([^"”]{2,})["”]/g)].map((m) => m[1].trim());
    if (quoted.length) {
      const cues = [...p.matchAll(/\[[a-z]+\]/g)].map((m) => m[0]);
      p = `${cues.length && p.trim().startsWith("[") ? `${cues[0]} ` : ""}${quoted.join(" ")}`;
    }
    const sentences = p.match(/[^.!?]+(?:[.!?]+["”]?|$)/g) ?? [p];
    return sentences
      .filter((s) => { const t = s.trim().replace(/^\[[a-z]+\]\s*/, ""); return SPOKEN.test(t) || !NARRATION.test(t); })
      .join("")
      .replace(/["“”]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  });
  return paragraphs.filter((p) => p.replace(/\[[a-z]+\]/g, "").trim()).join("\n\n");
}

interface Card {
  speaker: { name: string; species?: string; role?: string; disposition?: string; kind?: string; notes?: string; gender?: string; attitude?: string; kin?: string; bond?: string };
  player: { name: string; species?: string; class?: string; alignment?: string };
  scene: string;
  line: string;
  recap?: string;
  // What the town says (of the party, its nemeses): shared/logic/relations.ts townTalk
  news?: string;
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// The variable part of a request. Kept short: every token here is evaluated on each request.
export function cardText(c: Card): string {
  const s = c.speaker;
  const who = [clip(s.species, 40), clip(s.role, 60)].filter(Boolean).join(" ");
  const feeling = s.kind === "party" ? "a member of the player's party, travelling with them" : s.kind === "chatter" ? "passing the time with someone you know, not with the party" : s.disposition === "friendly" ? "friendly to the party" : s.disposition === "hostile" ? "hostile to the party" : "neutral to the party";
  const p = c.player;
  const you = [clip(p.species, 40), clip(p.class, 40)].filter(Boolean).join(" ");
  return [
    `SCENE: ${clip(c.scene, 300)}`,
    c.news ? `TALK IN TOWN (gossip; bring it up only if it fits): ${clip(c.news, 220)}` : "",
    `WHO YOU ARE: ${clip(s.name, 60)}${s.gender === "male" ? " (he/him)" : s.gender === "female" ? " (she/her)" : ""}${who ? `, ${/^[aeiou]/i.test(who) ? "an" : "a"} ${who}` : ""}, ${feeling}.${s.notes ? ` ${clip(s.notes, 280)}` : ""}`,
    s.attitude && s.kind !== "party" ? `HOW YOU FEEL ABOUT THEM: ${clip(s.attitude, 12)} (on a scale of hostile, cold, wary, cool, neutral, warm, friendly, generous, devoted); let it colour how you speak.` : "",
    s.kin ? `YOUR KIN: ${clip(s.kin, 120)}.` : "",
    `WHO IS TALKING TO YOU: ${clip(p.name, 60)}${you ? `, ${/^[aeiou]/i.test(you) ? "an" : "a"} ${you}` : ""}.`,
    s.bond ? `WHAT ${clip(p.name, 60).toUpperCase()} IS TO YOU: ${clip(s.bond, 160)}. Let it show in how you speak to ${clip(p.name, 60)}.` : "",
    c.recap ? `YOU SAID LAST: "${clip(c.recap, 300)}"` : "",
    `PLAYER SAYS: "${clip(c.line, 400)}"`,
  ].filter(Boolean).join("\n");
}

// Whatever the model wrapped the speech in: a leading name or "REPLY:", markdown, more than three paragraphs, a sentence cut off at the cap
export function tidy(text: string, cut: boolean): string {
  let t = speechOnly(text.replace(/\r/g, "").replace(/^\s*(REPLY|Reply)\s*:\s*/, "")).replace(/[*_#`]+/g, "").trim();
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

// Two people of the world talking to each other (2026-11-02; the user: "ensure that these conversations are driven by the Gemma4 (via
// ollama) llm"): each line is one request with the same style guide (so the primed prefix holds), the speaker's card with the other as the
// one talking to them and the other's last line as what they said; one short sentence a line. Chatter gives way to the party: one talk at
// a time in all, and it stops between lines when a reply to a player is waiting.
const CHATTER_TOKENS = 40;
const CHATTER_WORDS = 18;
export function chatterLine(text: string, name: string): string {
  const own = clip(name, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let t = tidy(text, true).replace(new RegExp(`^${own}\\s*[,:]\\s*`, "i"), "").replace(/\s*\n+\s*/g, " ").trim();
  // The first sentence or two, no more than CHATTER_WORDS words
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? [t];
  t = sentences[0].trim();
  if (sentences[1] && (t + sentences[1]).split(/\s+/).length <= CHATTER_WORDS) t += ` ${sentences[1].trim()}`;
  const words = t.split(/\s+/);
  return words.length > CHATTER_WORDS ? `${words.slice(0, CHATTER_WORDS).join(" ")}...` : t;
}
let chatting = false;
let playerWaiting = 0;
// The chatter in progress: a player's request cuts off the line it is making (T-022: the player waited behind it, 10 s and more, for the model's one slot)
let chatterStop: AbortController | null = null;

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

// What the player said into the microphone (2026-10-30; the user: "utilise the users mobile device microphone as an option to speak vocally to
// NPCs and distant party members"): Gemma 4 E2B takes audio in, so the same local model that writes the replies reads the recording and nothing
// leaves this machine. The page sends a short 16 kHz mono WAV (base64); the answer is the words, or nothing if there was no speech.
const STT_PROMPT = "Transcribe this audio exactly. Reply with only the words spoken, nothing else. If there is no speech, reply with nothing.";
export function cleanTranscript(text: string): string {
  const t = text.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
  return /^[\[(*]?\s*(no speech|silence|inaudible|no audio|unintelligible)\b/i.test(t) ? "" : t.slice(0, 400);
}

export function registerDialogueRoutes(app: Express) {
  app.post("/api/stt", async (req: Request, res: Response) => {
    const audio = String(req.body?.audio ?? "");
    if (!audio || audio.length > 4_000_000) return void res.status(400).json({ message: "audio is required (a short WAV, base64)" });
    try {
      const text = await alone(async () => {
        const r = await fetch(`${URL_BASE}/api/chat`, {
          method: "POST",
          body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: KEEP_ALIVE, messages: [{ role: "user", content: STT_PROMPT, images: [audio] }], options: { num_ctx: NUM_CTX, num_predict: 120, temperature: 0 } }),
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) throw new Error(`the model answered ${r.status}`);
        return cleanTranscript(String(((await r.json()) as any).message?.content ?? ""));
      });
      res.json({ text });
    } catch (e: any) {
      res.status(503).json({ message: String(e?.message ?? e) });
    }
  });

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
    const card = cardText({ speaker: b.speaker, player: b.player, scene: b.scene ?? "", line: b.line, recap: b.recap, news: b.news });

    const stop = new AbortController();
    res.on("close", () => stop.abort());
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    const send = (o: object) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };

    playerWaiting++;
    chatterStop?.abort();
    let counted = true;
    const started = () => { if (counted) { counted = false; playerWaiting--; } };
    try {
      await alone(async () => {
        started();
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
        // (a reply that opens with the speaker's own name, "Rook, ...", is said without it)
        const own = clip(b.speaker.name, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        send({ done: true, text: tidy(text, last.done_reason === "length").replace(new RegExp(`^${own}\\s*[,:]\\s*`, "i"), "") });
        // A reply that had to evaluate its whole prompt means the prefix was lost: start it again for the next one
        if (last.prompt_eval_count && last.prompt_eval_duration / 1e6 / last.prompt_eval_count > SLOW_MS_PER_TOKEN) {
          primed = false;
          primeLater();
        }
      });
    } catch (e: any) {
      if (!stop.signal.aborted) send({ error: e?.message === "fetch failed" ? "The dialogue model is not running (is Ollama started?)." : String(e?.message ?? e) });
    } finally {
      started();
      res.end();
    }
  });

  // { a, b, scene, turns } -> NDJSON: {"line": {"who": 0|1, "text"}} as each is made, then {"done": true}; 429 while another talk is going
  app.post("/api/chatter", async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const people = [b.a, b.b];
    if (!people.every((p) => p?.name)) return void res.status(400).json({ message: "a and b (each with a name) are required" });
    if (chatting) return void res.status(429).json({ message: "another talk is going" });
    chatting = true;
    const turns = Math.max(2, Math.min(4, Number(b.turns) || 3));
    const scene = `${clip(b.scene, 200)} Small talk in passing: reply with ONE short sentence, 15 words at most, mostly of your own lives and what is between you two.`;
    const stop = new AbortController();
    chatterStop = stop;
    res.on("close", () => stop.abort());
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    const send = (o: object) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
    try {
      const said: string[] = [];
      for (let i = 0; i < turns && !stop.signal.aborted && !playerWaiting; i++) {
        const [me, other] = i % 2 ? [people[1], people[0]] : [people[0], people[1]];
        const card = cardText({
          speaker: { ...me, kind: "chatter" },
          news: b.news,
          player: { name: other.name, species: other.species, class: other.role },
          scene,
          line: said.length ? said[said.length - 1] : `(${clip(other.name, 60)}${me.bond ? `, ${clip(me.bond, 120)},` : ""} stops beside you)`,
          recap: said.length > 1 ? said[said.length - 2] : undefined,
        });
        const text = await alone(async () => {
          if (stop.signal.aborted || playerWaiting) return "";
          if (!primed || Date.now() - primedAt > 90 * 60 * 1000) await prime();
          const r = await fetch(`${URL_BASE}/api/chat`, { method: "POST", body: body([{ role: "system", content: SYSTEM }, { role: "user", content: card }], false, CHATTER_TOKENS), signal: AbortSignal.any([stop.signal, AbortSignal.timeout(30000)]) });
          if (!r.ok) throw new Error(`the model answered ${r.status}`);
          const j = (await r.json()) as any;
          if (j.prompt_eval_count && j.prompt_eval_duration / 1e6 / j.prompt_eval_count > SLOW_MS_PER_TOKEN) {
            primed = false;
            primeLater();
          }
          return chatterLine(String(j.message?.content ?? ""), me.name);
        });
        if (!text) break;
        said.push(text);
        send({ line: { who: i % 2, text } });
      }
      send({ done: true });
    } catch (e: any) {
      if (!stop.signal.aborted) send({ error: e?.message === "fetch failed" ? "The dialogue model is not running (is Ollama started?)." : String(e?.message ?? e) });
    } finally {
      chatting = false;
      if (chatterStop === stop) chatterStop = null;
      res.end();
    }
  });
}
