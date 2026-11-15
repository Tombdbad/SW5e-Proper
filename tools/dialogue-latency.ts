// Latency of a spoken reply on this machine, through the real routes, the real model (Ollama) and the real voice (Piper):
//   PIPER_DIR=<piper folder> PORT=5105 npx tsx tools/dialogue-latency.ts [rounds]    (WHOLE=1: the voice waits for the whole reply, as it did before streamed speech)
// It mounts only the dialogue and speech routes on a bare server. Per exchange it prints the seconds to the first words (the first {delta}), to the
// first sound (the page asks Piper for speech as soon as it has words to say: the whole reply with WHOLE=1, else the first streamed sentence) and to
// the whole reply. It tells nothing of the page itself, and the numbers move with whatever else the PC is doing.
import express from "express";
import http from "http";
import { registerDialogueRoutes } from "../server/dialogue";
import { registerSpeechRoutes } from "../server/speech";

const rounds = Math.max(1, Number(process.argv[2]) || 3);
const port = Number(process.env.PORT) || 5105;
const talks = [
  "Which berth is the Lark in?",
  "Do you know anything about the patrol that came through last night?",
  "I could use a good meal. What do you recommend?",
  "Have you any work for someone who is handy with a blaster?",
];
const app = express();
app.use(express.json({ limit: "6mb" }));
registerDialogueRoutes(app);
registerSpeechRoutes(app);
const server = http.createServer(app).listen(port, "127.0.0.1", async () => {
  const api = `http://127.0.0.1:${port}`;
  const sp = { name: "Hessa Marl", species: "Human", role: "dock clerk", disposition: "neutral", gender: "female", attitude: "neutral" };
  const player = { name: "Zel", species: "Zabrak", class: "Consular" };
  const scene = "Dock Nine, Port Verrin, on Dantooine (a temperate world). It is 14:20. An Imperial patrol is about.";
  // The model warms up (the style guide is evaluated alone, as the page's first request would find it)
  for (let i = 0; i < 60; i++) { const j: any = await (await fetch(`${api}/api/dialogue/status`)).json(); if (j.primed) break; await new Promise((r) => setTimeout(r, 1000)); }
  // Piper is started once before the first measure (the server keeps it warm after that)
  await (await fetch(`${api}/api/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Ready.", voice: { name: "piper:12", rate: 1, pitch: 0 } }) })).arrayBuffer();
  const rows: { first: number; sound: number; done: number }[] = [];
  for (let n = 0; n < rounds * talks.length; n++) {
    const t0 = Date.now();
    const r = await fetch(`${api}/api/dialogue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speaker: sp, player, scene, line: talks[n % talks.length] }) });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let pend = "", first = 0, done = 0, text = "", firstText = "";
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      pend += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = pend.indexOf("\n")) >= 0) {
        const row = pend.slice(0, nl).trim(); pend = pend.slice(nl + 1);
        if (!row) continue;
        const e = JSON.parse(row);
        if (e.delta && !first) { first = Date.now() - t0; firstText = e.delta; }
        if (e.done) { done = Date.now() - t0; text = e.text; }
        if (e.error) throw new Error(e.error);
      }
    }
    const heard = process.env.WHOLE ? text : firstText || text;
    const s0 = Date.now();
    await (await fetch(`${api}/api/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: (heard.match(/^[^.!?]+[.!?]/)?.[0] ?? heard).replace(/\[[a-z]+\]/g, "").trim() || "Hello.", voice: { name: "piper:12", rate: 1, pitch: 0 } }) })).arrayBuffer();
    const sound = (process.env.WHOLE ? done : first) + (Date.now() - s0);
    rows.push({ first, sound, done });
    console.log(`#${n + 1} first words ${(first / 1000).toFixed(1)} s, first sound ${(sound / 1000).toFixed(1)} s, whole reply ${(done / 1000).toFixed(1)} s, ${text.split(/\s+/).length} words`);
  }
  const med = (k: "first" | "sound" | "done") => { const v = rows.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] / 1000; };
  console.log(`MEDIAN first words ${med("first").toFixed(1)} s, first sound ${med("sound").toFixed(1)} s, whole reply ${med("done").toFixed(1)} s (${rows.length} exchanges)`);
  server.close();
  process.exit(0);
});
