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
const MAX_TOKENS = 160;
const MAX_PARAGRAPHS = 3;
const KEEP_ALIVE = "2h";
// Slower than this per prompt token, a reply was evaluated from scratch (primed ones run at about 2.5 ms, unprimed at about 13 ms)
const SLOW_MS_PER_TOKEN = 7;

const SYSTEM = `You voice characters in a Star Wars tabletop role-playing game (Star Wars 5th Edition), in the tone of the films: plain, lived-in, a little wry. Each message gives you a CARD for one exchange: the SCENE, WHO YOU ARE, WHO IS TALKING TO YOU, and sometimes what you said last. It ends with what the player says. Reply as the character you are, and only as them.

Your reply is spoken aloud by a voice actor, so it is ONLY the words the character says. Rules for every reply:
- One to three short paragraphs of speech, 60 words at most in all. Fewer is better when a few words will do.
- Always the first person: you ARE the character. Say "I" and "me", never your own name or "he" or "she" for yourself, and never write about yourself from outside.
- No narration at all: never describe what anyone does, looks like or feels, no gestures, no glances, no tone of voice, no surroundings, no "she says". No quotation marks around the speech.
- Sounds the character makes go in square brackets, from this list only, and only where they would be heard: [chuckle] [laugh] [sigh] [breath] [groan] [cough] [wheeze] [hmm] [gasp] [growl] [beep] [whistle] [static]. Use one or two at most, often none.
- A nervous, frightened or hurt character may stutter ("I-I didn't...") or trail off ("Well... uh..."); a calm one does not.
- The voice actor reads your punctuation: an exclamation mark where the character shouts, is excited, angry or alarmed, a question mark for a question, full stops when calm.
- Match the character: their species, trade, mood and how they feel about the party (friendly, neutral or hostile). A shopkeeper talks of trade, a guard of the law, a droid like a droid, a companion like a friend who shares the party's risks.
- Use only what is on the card. Do not invent named people, places, prices, quests or items that are not there. If you would not know something, say so, or turn the talk back to what you do know.
- The card may list WHAT YOU SELL, WORK YOU CAN OFFER, WHAT YOU HAVE HEARD and what was said EARLIER. Bring these up only when they fit what the player says or when you would naturally mention them; never read a list out. Do not repeat what you already said.
- If the card says YOU ARE CALLING, you speak first: say who you are and why you called. If it says A CALL, you are talking over a link and cannot see each other. If it says IN A FIGHT, shout ten words or fewer.
- Never speak for the player. Never decide the result of a die roll, a fight or a deal, and never mention rules, dice, stats, hit points or the game.
- No lists, no headings, no markdown, no remarks outside the character. Do not start with your own name.

Example of the style.
CARD: You are Hessa Marl, a human dock clerk, neutral to the party. The port is busy and an Imperial patrol is about.
PLAYER SAYS: "Which berth is the Lark in?"
REPLY: Lark, Lark... bay nine. And don't let it sit there past the evening shift, the patrol's been counting hulls all morning.

[sigh] If you've something aboard you'd rather they didn't count, that's your business. Just don't make it mine.

Wrong: Hessa shrugs and says she has no idea.
Right: No idea, friend. Ask the harbour office.`;

// The sounds a reply may carry in square brackets (the page plays them: client/src/lib/voice.ts); anything else in brackets is dropped
export const CUES = ["chuckle", "laugh", "sigh", "breath", "groan", "cough", "wheeze", "hmm", "gasp", "growl", "beep", "whistle", "static"];
// Narration the model still writes now and then: a sentence that tells what someone does rather than says (third person, or "I" doing
// something), opening with a name or a pronoun and one of these verbs
const ACTS = "smiles?|smirks?|grins?|glances?|looks?|leans?|shrugs?|nods?|sighs?|laughs?|chuckles?|frowns?|says?|whispers?|mutters?|murmurs?|replies|replied|answers?|adds?|pauses?|gestures?|points?|turns?|steps?|crosses|taps?|runs?|lowers?|raises?|tilts?|narrows?|folds?|rubs?|scratches|waves?|eyes|studies|regards?|watches|considers?|hesitates?|winces?|snorts?|scoffs?|beeps?|whirs?|whistles?|clicks?|buzzes|growls?|rumbles?|smiled|smirked|grinned|glanced|looked|leaned|shrugged|nodded|sighed|laughed|chuckled|frowned|said|whispered|muttered|murmured|answered|added|paused|gestured|pointed|turned|stepped|tapped|ran|lowered|raised|tilted|narrowed|folded|rubbed|scratched|waved|eyed|studied|regarded|watched|considered|hesitated|winced|snorted|scoffed|beeped|whirred|clicked|growled|rumbled";
const NARRATION = new RegExp(`^(?:(?:he|she|they|it|his|her|their|the [a-z ]{2,30})|[A-Z][\\w'-]+(?: [A-Z][\\w'-]+)?)\\s+(?:\\w+ly\\s+)?(?:${ACTS})\\b`, "i");
// (a sentence with I, me, you or we in it is someone talking, not narration)
const SPOKEN = /\b(?:I|me|my|you|your|we|us|our)\b/i;

// Only what is said aloud: stage directions in asterisks or round brackets, square brackets that are not a sound cue, narrating sentences
// (and, when the model put the speech in quotation marks, everything outside them) are taken out
// A narrating sentence that looks at someone ("She looks at you."): the word "you" does not make it speech
const GAZE = /^(?:he|she|they|it|the [a-z ]{2,30})\s+(?:\w+ly\s+)?(?:looks?|looked|glances?|glanced|turns?|turned|nods?|nodded|leans?|leaned|steps?|stepped|eyes|eyed|studies|studied|gestures?|gestured|points?|pointed)\s+(?:at|toward|towards|over|up|down|away|back|around|to)\b/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A sentence that has one of these names (the speaker's, the player's) for its subject and then does something is narration, whoever "you" is
function namedActs(names: string[]): RegExp | null {
  const all = [...new Set(names.flatMap((n) => { const t = clip(n, 60); return [t, t.split(" ")[0]]; }).filter((n) => n.length >= 3))];
  return all.length ? new RegExp(`^(?:${all.map(escapeRe).join("|")})(?:'s)?\\s+(?:\\w+ly\\s+)?(?:${ACTS})\\b`, "i") : null;
}
export function speechOnly(text: string, names: string[] = []): string {
  const named = namedActs(names);
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
      .filter((s) => { const t = s.trim().replace(/^\[[a-z]+\]\s*/, ""); if (named?.test(t) || GAZE.test(t)) return false; return SPOKEN.test(t) || !NARRATION.test(t); })
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
  // The last few exchanges of this talk, oldest first (the page keeps them; the model is never sent a transcript)
  history?: { asked?: string; said?: string }[];
  // What this person can speak of, from the world: their wares, the work they offer, what they have heard, and for a companion what the party is about
  knows?: { wares?: string[]; jobs?: string[]; rumours?: string[]; party?: string };
  // A call over a link: who rang (`them`: the speaker rang the player and speaks first), by what, and why they rang
  call?: { from?: "them" | "you"; via?: "commlink" | "transceiver"; reason?: string; ship?: string };
  // A shout in a fight, not a talk: what has just happened (see /api/bark)
  fight?: { event: string; foe?: string };
}

const HISTORY = 3;
const list = (xs: unknown, n: number, each: number) => (Array.isArray(xs) ? xs : []).map((x) => clip(x, each)).filter(Boolean).slice(0, n);

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
    // A companion talks as a friend in the same trouble, in their own manner (their nature is in the notes), not as a stranger answering questions
    s.kind === "party" ? `HOW YOU TALK: as a companion who shares the party's risks, in your own manner, with your own opinions of the place, the plan and the company. You may tease, warn, worry or ask something back. A droid talks like a droid, a beast in sounds and few words.` : "",
    `WHO IS TALKING TO YOU: ${clip(p.name, 60)}${you ? `, ${/^[aeiou]/i.test(you) ? "an" : "a"} ${you}` : ""}.`,
    s.bond ? `WHAT ${clip(p.name, 60).toUpperCase()} IS TO YOU: ${clip(s.bond, 160)}. Let it show in how you speak to ${clip(p.name, 60)}.` : "",
    ...knownLines(c),
    ...memoryLines(c),
    ...momentLines(c),
  ].filter(Boolean).join("\n");
}

// What the speaker can speak of besides themselves (the world gives it: nothing here is made up)
function knownLines(c: Card): string[] {
  const k = c.knows ?? {};
  const wares = list(k.wares, 6, 48);
  const jobs = list(k.jobs, 3, 90);
  const rumours = list(k.rumours, 3, 110);
  return [
    wares.length ? `WHAT YOU SELL (mention at most one, and only if it fits): ${wares.join("; ")}.` : "",
    jobs.length ? `WORK YOU CAN OFFER (say what it is in a few words, not its pay): ${jobs.join("; ")}.` : "",
    rumours.length ? `WHAT YOU HAVE HEARD: ${rumours.join(" ")}` : "",
    k.party ? `WHAT THE PARTY IS ABOUT: ${clip(k.party, 200)}` : "",
  ];
}

// The last few exchanges, short, newest last; the speaker's last reply alone when that is all there is
function memoryLines(c: Card): string[] {
  const past = (Array.isArray(c.history) ? c.history : []).slice(-HISTORY).map((h) => ({ asked: clip(h?.asked, 90), said: clip(h?.said, 140) })).filter((h) => h.asked || h.said);
  if (!past.length) return c.recap ? [`YOU SAID LAST: "${clip(c.recap, 300)}"`] : [];
  return ["EARLIER (do not repeat it):", ...past.map((h) => `  They: "${h.asked}"  You: "${h.said}"`)];
}

// The moment the card ends on: the player speaking, a call coming in, or a fight
function momentLines(c: Card): string[] {
  const name = clip(c.player.name, 60);
  if (c.fight) return [`IN A FIGHT: ${clip(c.fight.event, 120)}${c.fight.foe ? ` (against ${clip(c.fight.foe, 60)})` : ""}. Shout one short line, ten words or fewer, as yourself.`, "NO ONE IS TALKING TO YOU: shout."];
  const call = c.call;
  const link = call?.via === "transceiver" ? `a call between worlds by ship's transceiver${call.ship ? ` (the ${clip(call.ship, 40)})` : ""}: the line is thin, with some static` : "a call over commlinks";
  if (call?.from === "them") return [`YOU ARE CALLING ${name.toUpperCase()}, by ${link}${call.reason ? `, because ${clip(call.reason, 160)}` : ""}. You speak first: say who you are and why you called.`, `${name.toUpperCase()} ANSWERS: "${clip(c.line, 400) || "Hello?"}"`];
  return [call ? `A CALL: ${link}. You cannot see each other.` : "", `PLAYER SAYS: "${clip(c.line, 400)}"`];
}

// Whatever the model wrapped the speech in: a leading name or "REPLY:", markdown, more than three paragraphs, a sentence cut off at the cap
export function tidy(text: string, cut: boolean, names: string[] = []): string {
  let t = speechOnly(text.replace(/\r/g, "").replace(/^\s*(REPLY|Reply)\s*:\s*/, ""), names).replace(/[*_#`]+/g, "").trim();
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
// A shout in a fight: ten words, 32 tokens (about 3 s of the model), and not more often than every 4 s whoever shouts
const BARK_WORDS = 10;
const BARK_TOKENS = 32;
const BARK_GAP_MS = 4000;
const BARK_WAIT_MS = 8000;
let lastBark = 0;
export function chatterLine(text: string, name: string, maxWords = CHATTER_WORDS): string {
  const own = clip(name, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let t = tidy(text, true).replace(new RegExp(`^${own}\\s*[,:]\\s*`, "i"), "").replace(/\s*\n+\s*/g, " ").trim();
  // The first sentence or two, no more than CHATTER_WORDS words
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? [t];
  t = sentences[0].trim();
  if (sentences[1] && (t + sentences[1]).split(/\s+/).length <= maxWords) t += ` ${sentences[1].trim()}`;
  const words = t.split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}...` : t;
}
let chatting = false;
let playerWaiting = 0;
// The chatter in progress: a player's request cuts off the line it is making (T-022: the player waited behind it, 10 s and more, for the model's one slot)
let chatterStop: AbortController | null = null;

let primed = false;
let primedAt = 0;
// One reply at a time
let queue: Promise<unknown> = Promise.resolve();
// (`jobs` counts those waiting or running: a bark is made only when it is 0)
let jobs = 0;
const alone = <T,>(job: () => Promise<T>): Promise<T> => {
  jobs++;
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next.finally(() => { jobs--; });
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
    const card = cardText({ speaker: b.speaker, player: b.player, scene: b.scene ?? "", line: b.line, recap: b.recap, news: b.news, history: b.history, knows: b.knows, call: b.call });
    const names = [b.speaker.name, b.player.name];
    // (a reply that opens with the speaker's own name, "Rook, ...", is said without it)
    const own = clip(b.speaker.name, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const clean = (t: string, cut: boolean) => tidy(t, cut, names).replace(new RegExp(`^${own}\\s*[,:]\\s*`, "i"), "");

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
        // What has been sent so far, cleaned. Only finished sentences go out (a half sentence may turn out to be narration, which is dropped), each as
        // soon as it is whole: the page speaks it while the rest is still being made
        let said = "";
        const stream = (final: boolean) => {
          const part = final ? text : text.match(/^[\s\S]*[.!?]["”]?(?=\s)/)?.[0] ?? "";
          if (!part.trim()) return;
          const cleaned = clean(part, false);
          if (cleaned.length > said.length && cleaned.startsWith(said)) {
            send({ delta: cleaned.slice(said.length) });
            said = cleaned;
          }
        };
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
              stream(false);
            }
            if (j.done) last = j;
          }
        }
        if (enough) stop.abort();
        stream(true);
        send({ done: true, text: clean(text, last.done_reason === "length") });
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

  // Barks in a fight (2026-11-15): { speaker, event, foe?, scene, player? } -> { text }, a shout of BARK_WORDS words or fewer in the speaker's voice. A bark
  // is colour, and the fight does not wait for it: it is made only when the model has nothing else to do (no reply, no chatter), at most one every
  // BARK_GAP_MS, and it is cut off at BARK_WAIT_MS, so it answers "" far more often than not on a slow machine, and the page then says nothing.
  app.post("/api/bark", async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.speaker?.name || !b.event) return void res.status(400).json({ message: "speaker and event are required" });
    if (jobs > 0 || playerWaiting || chatting || Date.now() - lastBark < BARK_GAP_MS || !primed) return void res.json({ text: "" });
    lastBark = Date.now();
    const card = cardText({ speaker: b.speaker, player: { name: clip(b.player?.name || "the party", 60) }, scene: b.scene ?? "", line: "", news: undefined, fight: { event: b.event, foe: b.foe } });
    try {
      const text = await alone(async () => {
        if (playerWaiting) return "";
        const r = await fetch(`${URL_BASE}/api/chat`, { method: "POST", body: body([{ role: "system", content: SYSTEM }, { role: "user", content: card }], false, BARK_TOKENS), signal: AbortSignal.timeout(BARK_WAIT_MS) });
        if (!r.ok) return "";
        return chatterLine(String(((await r.json()) as any).message?.content ?? ""), b.speaker.name, BARK_WORDS);
      });
      res.json({ text });
    } catch {
      res.json({ text: "" });
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
