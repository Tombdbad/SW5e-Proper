// Spoken dialogue, speech to text and the Piper finder, with a fake Ollama (audit T-021, 2026-11-08). Nothing here needs the real model or a voice:
// a small HTTP server answers where Ollama would (GET /api/tags, POST /api/chat, streamed or not), and the routes are mounted on a bare Express app.
// What is checked: the card the model is sent, the NDJSON the page reads ({delta} lines, then {done, text} with narration and stray brackets taken
// out), the answers when the model is off, the transcript cleaning, and where findPiper looks and what it says when a part is missing.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";

type Seen = { url: string; body: any };
const seen: Seen[] = [];
let reply = ["Rook, bay nine. ", "[sighs heavily] *shrugs* ", "Don't be late."];
let transcript = " \"Where is the cantina?\" ";
let fake: http.Server;
let slowSeen = 0;
let slowClosed = 0;
let app: http.Server;
let api = "";

const listen = (s: http.Server) => new Promise<number>((resolve) => s.listen(0, "127.0.0.1", () => resolve((s.address() as any).port)));

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ url: `${req.method} ${req.url}`, body });
      if (req.url === "/api/tags") return void res.end(JSON.stringify({ models: [{ name: "fake-model:latest" }] }));
      // a chatter line (its card says "Small talk") takes two seconds, and notes when the server hangs up on it
      if (req.url === "/api/chat" && String(body.messages?.[1]?.content ?? "").includes("Small talk")) {
        slowSeen++;
        const t = setTimeout(() => res.end(JSON.stringify({ message: { content: "Fine weather." }, done: true })), 2000);
        res.on("close", () => { if (!res.writableEnded) { slowClosed++; clearTimeout(t); } });
        return;
      }
      if (req.url === "/api/chat" && !body.stream) {
        // the prime (a system message alone) and speech to text (a user message with audio)
        const stt = body.messages?.some((m: any) => m.images);
        // a bark (its card says IN A FIGHT): more words than it may have, to see them cut
        const bark = String(body.messages?.[1]?.content ?? "").includes("IN A FIGHT");
        return void res.end(JSON.stringify({ message: { content: stt ? transcript : bark ? "Get down, I will cover you, now run for the door please everyone!" : "" }, done: true }));
      }
      res.setHeader("Content-Type", "application/x-ndjson");
      for (const part of reply) res.write(`${JSON.stringify({ message: { content: part }, done: false })}\n`);
      res.end(`${JSON.stringify({ message: { content: "" }, done: true, done_reason: "stop", prompt_eval_count: 100, prompt_eval_duration: 100e6 })}\n`);
    });
  });
  const port = await listen(fake);
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = "fake-model";
  const { registerDialogueRoutes } = await import("../../server/dialogue");
  const server = express();
  server.use(express.json({ limit: "6mb" }));
  registerDialogueRoutes(server);
  app = http.createServer(server);
  api = `http://127.0.0.1:${await listen(app)}`;
});

after(async () => {
  await new Promise((r) => app.close(r));
  await new Promise((r) => fake.closeAllConnections?.() ?? r(null)).catch(() => {});
  await new Promise((r) => fake.close(r));
});

const post = (url: string, body: unknown) => fetch(api + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const talk = {
  speaker: { name: "Rook", species: "Duros", role: "dock clerk", disposition: "friendly", gender: "male" },
  player: { name: "Zel", species: "Zabrak", class: "Consular" },
  scene: "A busy port.",
  line: "Which berth is the Lark in?",
};

test("cardText: the card the model is sent for one exchange", async () => {
  const { cardText } = await import("../../server/dialogue");
  const card = cardText({ ...talk, recap: "Bay nine." });
  assert.match(card, /^SCENE: A busy port\./);
  assert.match(card, /WHO YOU ARE: Rook \(he\/him\), a Duros dock clerk, friendly to the party\./);
  assert.match(card, /WHO IS TALKING TO YOU: Zel, a Zabrak Consular\./);
  assert.match(card, /YOU SAID LAST: "Bay nine\."/);
  assert.match(card, /PLAYER SAYS: "Which berth is the Lark in\?"$/);
  assert.match(cardText({ ...talk, speaker: { name: "Vee", kind: "party" } }), /a member of the player's party/);
});

test("speechOnly and tidy: only what is said aloud, sounds kept from the list, no narration", async () => {
  const { speechOnly, tidy } = await import("../../server/dialogue");
  assert.equal(speechOnly("*smiles* Bay nine. (she nods) [sighs heavily] Mind the patrol."), "Bay nine. [sigh] Mind the patrol.");
  assert.equal(speechOnly("[dances wildly] Hello there."), "Hello there.");
  assert.equal(speechOnly('She smiles and says "Come back soon."'), "Come back soon.");
  assert.equal(tidy("REPLY: One.\n\nTwo.\n\nThree.\n\nFour.", false), "One.\n\nTwo.\n\nThree.");
});

test("cleanTranscript: the words said, and nothing for silence", async () => {
  const { cleanTranscript } = await import("../../server/dialogue");
  assert.equal(cleanTranscript(' "Where is the cantina?" \n'), "Where is the cantina?");
  assert.equal(cleanTranscript("[silence]"), "");
  assert.equal(cleanTranscript("No speech detected"), "");
  assert.equal(cleanTranscript("a ".repeat(500)).length <= 400, true);
});

test("GET /api/dialogue/status says the model is there when Ollama lists it", async () => {
  const j: any = await (await fetch(`${api}/api/dialogue/status`)).json();
  assert.equal(j.ok, true);
  assert.equal(j.model, "fake-model");
});

test("POST /api/dialogue: 400 without a speaker, a player and a line", async () => {
  assert.equal((await post("/api/dialogue", { speaker: { name: "Rook" } })).status, 400);
});

test("POST /api/dialogue streams {delta} lines and ends with {done, text}, the text tidied", async () => {
  seen.length = 0;
  const r = await post("/api/dialogue", talk);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /ndjson/);
  const rows = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  const deltas = rows.filter((x) => "delta" in x).map((x) => x.delta);
  assert.ok(deltas.length >= 2, "the words arrive as they are made");
  const last = rows[rows.length - 1];
  assert.equal(last.done, true);
  assert.ok(!/^Rook/.test(last.text), `the speaker's own name is dropped: ${last.text}`);
  assert.ok(!last.text.includes("*"), "stage directions are taken out");
  assert.ok(last.text.includes("[sigh]"), "a sound cue is kept in its short form");
  assert.match(last.text, /bay nine/i);
  const chat = seen.filter((s) => s.url === "POST /api/chat" && s.body.stream === true);
  assert.equal(chat.length, 1);
  assert.equal(chat[0].body.model, "fake-model");
  assert.equal(chat[0].body.messages[0].role, "system");
  assert.match(chat[0].body.messages[1].content, /PLAYER SAYS: "Which berth is the Lark in\?"/);
});

test("cardText: what the speaker knows, what was said earlier, a call and a shout", async () => {
  const { cardText } = await import("../../server/dialogue");
  const card = cardText({ ...talk, knows: { wares: ["blaster pistol (150 cr)", "medpac (50 cr)"], jobs: ["Bounty: a smuggler in Dock Nine"], rumours: ["The patrol is searching ships."] }, history: [{ asked: "Hello", said: "Welcome." }, { asked: "Any work?", said: "Maybe." }] });
  assert.match(card, /WHAT YOU SELL[^\n]*blaster pistol \(150 cr\); medpac/);
  assert.match(card, /WORK YOU CAN OFFER[^\n]*smuggler/);
  assert.match(card, /WHAT YOU HAVE HEARD: The patrol is searching ships\./);
  assert.match(card, /EARLIER[^\n]*\n  They: "Hello"  You: "Welcome\."\n  They: "Any work\?"  You: "Maybe\."\n/);
  assert.ok(!/YOU SAID LAST/.test(card), "the memory replaces the last reply, it does not repeat it");
  assert.equal(cardText({ ...talk, history: [1, 2, 3, 4, 5].map((n) => ({ asked: "q" + n, said: "a" + n })) }).split("They:").length - 1, 3, "three exchanges at most");
  const ring = cardText({ ...talk, line: "(answers)", call: { from: "them", via: "transceiver", ship: "Lark", reason: "the patrol has your ship's name" } });
  assert.match(ring, /YOU ARE CALLING ZEL, by a call between worlds by ship's transceiver \(the Lark\)[^\n]*because the patrol has your ship's name\. You speak first/);
  assert.match(ring, /ZEL ANSWERS: "\(answers\)"$/);
  assert.match(cardText({ ...talk, call: { via: "commlink" } }), /A CALL: a call over commlinks\. You cannot see each other\.\nPLAYER SAYS/);
  const shout = cardText({ ...talk, line: "", fight: { event: "you were hit", foe: "a trooper" } });
  assert.match(shout, /IN A FIGHT: you were hit \(against a trooper\)/);
  assert.ok(!/PLAYER SAYS/.test(shout));
  assert.match(cardText({ ...talk, speaker: { name: "Vee", kind: "party" } }), /HOW YOU TALK: as a companion/);
});

test("speechOnly: a sentence that names the speaker or the player and does something is narration, in any tense", async () => {
  const { speechOnly } = await import("../../server/dialogue");
  const names = ["Hessa Marl", "Zel"];
  assert.equal(speechOnly("Hessa shrugs. No idea, friend.", names), "No idea, friend.");
  assert.equal(speechOnly("Hessa Marl leaned in and whispered to you. Bay nine.", names), "Bay nine.");
  assert.equal(speechOnly("Zel's eyes narrow. You look like trouble.", names), "You look like trouble.");
  assert.equal(speechOnly("She looks at you. Bay nine.", names), "Bay nine.");
  assert.equal(speechOnly("It looks bad for you. Bay nine.", names), "It looks bad for you. Bay nine.");
  assert.equal(speechOnly("Zel, you want bay nine. Hessa is busy.", names), "Zel, you want bay nine. Hessa is busy.");
});

test("POST /api/dialogue sends each finished sentence as it is made, with narration left out, and the memory reaches the model", async () => {
  const keep = reply;
  reply = ["Hessa shrugs. ", "Bay nine, friend. ", "Mind the pa", "trol. Don't be", " late."];
  seen.length = 0;
  const r = await post("/api/dialogue", { ...talk, speaker: { ...talk.speaker, name: "Hessa Marl" }, history: [{ asked: "Hello", said: "Welcome aboard." }], knows: { rumours: ["A patrol is about."] } });
  const rows = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
  const deltas = rows.filter((x) => "delta" in x).map((x) => x.delta as string);
  assert.deepEqual(deltas.map((d) => d.trim()), ["Bay nine, friend.", "Mind the patrol.", "Don't be late."]);
  assert.equal(rows[rows.length - 1].text, "Bay nine, friend. Mind the patrol. Don't be late.");
  assert.equal(deltas.join("").trim(), rows[rows.length - 1].text, "the sentences sent make up the whole reply");
  const card = seen.filter((s) => s.url === "POST /api/chat" && s.body.stream === true)[0].body.messages[1].content;
  assert.match(card, /EARLIER/);
  assert.match(card, /You: "Welcome aboard\."/);
  assert.match(card, /WHAT YOU HAVE HEARD: A patrol is about\./);
  reply = keep;
});

test("POST /api/bark: a short shout when the model is idle, none too soon after the last", async () => {
  assert.equal((await post("/api/bark", { speaker: { name: "Rook" } })).status, 400);
  const shout = (await (await post("/api/bark", { speaker: talk.speaker, event: "you were hit", foe: "a trooper", scene: "A quay." })).json()) as any;
  assert.ok(shout.text.length > 0, "a bark");
  assert.ok(shout.text.replace(/\.\.\.$/, "").split(/\s+/).length <= 10, `ten words or fewer: ${shout.text}`);
  const again = (await (await post("/api/bark", { speaker: talk.speaker, event: "you were hit" })).json()) as any;
  assert.equal(again.text, "", "not twice within a few seconds");
});

test("a player's reply does not wait for a line of background chatter: the chatter is cut off", async () => {
  slowSeen = 0;
  slowClosed = 0;
  const people = { a: { name: "Hessa", role: "clerk" }, b: { name: "Rook", role: "porter" }, scene: "A quay.", turns: 3 };
  const chatter = post("/api/chatter", people).then((r) => r.text());
  for (let i = 0; i < 40 && !slowSeen; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(slowSeen, 1, "the chatter line is being made");
  const t0 = Date.now();
  const rows = (await (await post("/api/dialogue", talk)).text()).trim().split("\n").map((l) => JSON.parse(l));
  const took = Date.now() - t0;
  assert.equal(rows[rows.length - 1].done, true);
  assert.ok(took < 1500, `the reply waited ${took} ms behind the chatter line`);
  assert.equal(slowClosed, 1, "the server hung up on the chatter line");
  await chatter;
  assert.equal(slowSeen, 1, "no further chatter line was started");
});

test("POST /api/stt: the transcript, empty for silence, 400 without audio", async () => {
  assert.equal((await post("/api/stt", {})).status, 400);
  const ok: any = await (await post("/api/stt", { audio: "UklGRg==" })).json();
  assert.equal(ok.text, "Where is the cantina?");
  transcript = "[no speech]";
  const quiet: any = await (await post("/api/stt", { audio: "UklGRg==" })).json();
  assert.equal(quiet.text, "");
});

test("with Ollama off: status says not ok, a dialogue says so in its stream, and speech to text answers 503", async () => {
  await new Promise((r) => { fake.closeAllConnections(); fake.close(r); });
  const status: any = await (await fetch(`${api}/api/dialogue/status`)).json();
  assert.equal(status.ok, false);
  const rows = (await (await post("/api/dialogue", talk)).text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.match(rows[rows.length - 1].error, /not running/i);
  const stt = await post("/api/stt", { audio: "UklGRg==" });
  assert.equal(stt.status, 503);
});

test("findPiper: finds a piper.exe and a voice with its .onnx.json, and says what is missing", async () => {
  const { findPiper } = await import("../../server/speech");
  // (findPiper also looks in folders beside the working directory with piper in their name, so the work folder sits in a parent of its own)
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "sw5e-voices-"));
  const dir = path.join(parent, "voices");
  const cwd = path.join(parent, "work");
  fs.mkdirSync(dir);
  fs.mkdirSync(cwd);
  const exe = process.platform === "win32" ? "piper.exe" : "piper";
  const none = findPiper({ PIPER_DIR: dir }, cwd);
  assert.equal(none.exe, "");
  assert.match(none.note, /no piper\.exe/i);
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin", exe), "");
  assert.match(findPiper({ PIPER_DIR: dir }, cwd).note, /no voice model/i);
  fs.writeFileSync(path.join(dir, "bin", "en_US-test-medium.onnx"), "");
  assert.match(findPiper({ PIPER_DIR: dir }, cwd).note, /no \.onnx\.json/i);
  fs.writeFileSync(path.join(dir, "bin", "en_US-test-medium.onnx.json"), "{}");
  const found = findPiper({ PIPER_DIR: dir }, cwd);
  assert.equal(found.note, "");
  assert.ok(found.exe.endsWith(exe) && found.model.endsWith(".onnx"));
  fs.rmSync(parent, { recursive: true, force: true });
});
