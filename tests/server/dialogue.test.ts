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
      if (req.url === "/api/chat" && !body.stream) {
        // the prime (a system message alone) and speech to text (a user message with audio)
        const stt = body.messages?.some((m: any) => m.images);
        return void res.end(JSON.stringify({ message: { content: stt ? transcript : "" }, done: true }));
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
