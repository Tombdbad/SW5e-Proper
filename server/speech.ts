// Voices for the spoken replies (2026-10-30; the user: "can the model generate audio speech responses (relegating text to optional
// subtitles)"). Gemma 4 E2B takes audio in (speech recognition) but gives only text out, so the words it writes are spoken by a speech
// engine on this machine, and the page gives each speaker a voice of their own (client/src/lib/voice.ts: the voice picked, its pitch, its
// timbre and the effects over it, droids, helmets and comms).
//   GET  /api/speech/status   { engine, voices, speakers? }  which engine speaks, and with what voices
//   POST /api/speech          { text, voice: { name, rate, pitch } } -> audio/wav (one sentence or a short run of them)
//
// Engines, in order:
//  - Piper (a small neural speech engine, one program and a voice model; found by findPiper: PIPER_EXE and PIPER_MODEL, or a folder beside
//    the project with "piper" in its name, with a model such as en_US-libritts_r-medium.onnx, whose 904 speakers give every character a
//    voice of their own). A voice is
//    "piper:<speaker>"; rate is the length scale's inverse; pitch is the page's to change (playback).
//  - Windows' own voices (OneCore: George, Hazel and Susan on this PC), driven by one PowerShell process kept running for speed (about
//    80 ms a sentence once warm). SSML rate and pitch.
//  - none: the page falls back on the browser's own speech (no effects can be laid over it).
// Every rendered line is kept on disk (.cache/speech), by engine, voice and words: the same line in the same voice is not made twice.
import type { Express, Request, Response } from "express";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const CACHE = path.resolve(process.cwd(), ".cache", "speech");
const MAX_TEXT = 600;

// Where Piper is: PIPER_EXE and PIPER_MODEL when set, else PIPER_DIR, else any folder beside this project (or in tools/piper) whose name
// has "piper" in it (the user keeps it at ../rhasspy-piper-*): the first piper.exe and the first voice model (.onnx with its .onnx.json)
// found there, three levels down. The project's own test voice (etc/test_voice.onnx, 16 kHz and rough) is not used unless PIPER_MODEL
// names it. `note` says what is missing, for /api/speech/status.
export type PiperFound = { exe: string; model: string; note: string };
export function findPiper(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): PiperFound {
  const roots = [env.PIPER_DIR, path.join(cwd, "tools", "piper"), ...(() => { try { return fs.readdirSync(path.dirname(cwd)).filter((n) => /piper/i.test(n)).map((n) => path.join(path.dirname(cwd), n)); } catch { return []; } })()].filter((r): r is string => !!r && fs.existsSync(r));
  const walk = (dir: string, depth: number, hit: (f: string) => boolean): string => {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { return ""; }
    for (const n of names) if (hit(n)) { try { if (fs.statSync(path.join(dir, n)).isFile()) return path.join(dir, n); } catch { /* gone */ } }
    if (depth > 0) for (const n of names) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = path.join(dir, n);
      try { if (fs.statSync(p).isDirectory()) { const f = walk(p, depth - 1, hit); if (f) return f; } } catch { /* unreadable */ }
    }
    return "";
  };
  const find = (hit: (f: string) => boolean) => roots.map((r) => walk(r, 3, hit)).find(Boolean) ?? "";
  const exe = env.PIPER_EXE && fs.existsSync(env.PIPER_EXE) ? env.PIPER_EXE : find((n) => (process.platform === "win32" ? /^piper.exe$/i : /^piper$/).test(n));
  const model = env.PIPER_MODEL && fs.existsSync(env.PIPER_MODEL) ? env.PIPER_MODEL : find((n) => /.onnx$/i.test(n) && !/test_voice/i.test(n));
  const note = !roots.length && !env.PIPER_EXE ? "No Piper folder found (PIPER_DIR, or a folder beside the project with piper in its name)."
    : !exe ? "Piper's folder has no piper.exe (it holds the source: download a release build, or build it)."
    : !model ? "No voice model (.onnx and .onnx.json, e.g. en_US-libritts_r-medium) in Piper's folder."
    : !fs.existsSync(`${model}.json`) ? "The voice model has no .onnx.json beside it." : "";
  return { exe: note ? "" : exe, model: note ? "" : model, note };
}
let piperAt: { at: number; found: PiperFound } | null = null;
const piper = () => (piperAt && Date.now() - piperAt.at < 10000 ? piperAt : (piperAt = { at: Date.now(), found: findPiper() })).found;
const piperReady = () => !!piper().exe;
// How many speakers the Piper model has (its .onnx.json says)
function piperSpeakers(): number {
  try {
    return Number(JSON.parse(fs.readFileSync(`${piper().model}.json`, "utf8")).num_speakers) || 1;
  } catch {
    return 1;
  }
}

// ---- Windows voices: one PowerShell process, fed a line per request (id, voice, SSML in base64, the file to write), answering a line ----
const WORKER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Await($op, [type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$syn = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
[Console]::Out.WriteLine('voices' + [char]9 + (($voices | ForEach-Object { $_.DisplayName -replace '^Microsoft ', '' }) -join ','))
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $p = $line.Split([char]9)
  try {
    $v = $voices | Where-Object { $_.DisplayName -eq ('Microsoft ' + $p[1]) } | Select-Object -First 1
    if ($v) { $syn.Voice = $v }
    $ssml = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[2]))
    $stream = Await ($syn.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $n = [uint32]$stream.Size
    $null = Await ($reader.LoadAsync($n)) ([uint32])
    $bytes = New-Object byte[] $n
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($p[3], $bytes)
    [Console]::Out.WriteLine('ok' + [char]9 + $p[0])
  } catch {
    [Console]::Out.WriteLine('err' + [char]9 + $p[0] + [char]9 + ($_.Exception.Message -replace '\s+', ' '))
  }
  [Console]::Out.Flush()
}
`;

let worker: ChildProcessWithoutNullStreams | null = null;
let windowsVoices: string[] = [];
let starting: Promise<boolean> | null = null;
const waiting = new Map<string, (error?: string) => void>();
let seq = 0;

function startWorker(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  if (worker && windowsVoices.length) return Promise.resolve(true);
  if (starting) return starting;
  const job = new Promise<boolean>((resolve) => {
    try {
      const file = path.join(os.tmpdir(), "sw5e-speech-worker.ps1");
      fs.writeFileSync(file, WORKER, "utf8");
      const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true });
      worker = ps;
      let pending = "";
      const timer = setTimeout(() => resolve(false), 20000);
      ps.stdout.setEncoding("utf8");
      ps.stdout.on("data", (chunk: string) => {
        pending += chunk;
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const row = pending.slice(0, nl).replace(/\r$/, "");
          pending = pending.slice(nl + 1);
          const [kind, id, msg] = row.split("\t");
          if (kind === "voices") {
            windowsVoices = (id ?? "").split(",").filter(Boolean);
            clearTimeout(timer);
            resolve(windowsVoices.length > 0);
          } else if (kind === "ok" || kind === "err") {
            waiting.get(id)?.(kind === "err" ? msg || "speech failed" : undefined);
            waiting.delete(id);
          }
        }
      });
      ps.on("exit", () => {
        worker = null;
        windowsVoices = [];
        starting = null;
        for (const done of waiting.values()) done("the speech process stopped");
        waiting.clear();
        resolve(false);
      });
      ps.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  }).then((ok) => {
    if (!ok) starting = null;
    return ok;
  });
  starting = job;
  return job;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const within = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

async function speakWindows(text: string, name: string, rate: number, pitch: number, out: string): Promise<void> {
  if (!(await startWorker()) || !worker) throw new Error("no Windows voices");
  const voice = windowsVoices.includes(name) ? name : windowsVoices[0];
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><prosody rate="${rate.toFixed(2)}" pitch="${pitch >= 0 ? "+" : ""}${Math.round(pitch)}%">${xml(text)}</prosody></speak>`;
  const id = String(++seq);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error("speech timed out")); }, 20000);
    waiting.set(id, (error) => { clearTimeout(timer); error ? reject(new Error(error)) : resolve(); });
    worker!.stdin.write(`${id}\t${voice}\t${Buffer.from(ssml, "utf8").toString("base64")}\t${out}\n`);
  });
}

function speakPiper(text: string, speaker: number, rate: number, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(piper().exe, ["--model", piper().model, "--speaker", String(speaker), "--length_scale", (1 / rate).toFixed(2), "--output_file", out], { windowsHide: true });
    const timer = setTimeout(() => { p.kill(); reject(new Error("speech timed out")); }, 30000);
    p.on("exit", (code) => { clearTimeout(timer); code === 0 && fs.existsSync(out) ? resolve() : reject(new Error(`piper ended ${code}`)); });
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.stdin.end(text);
  });
}

const engineNow = async (): Promise<"piper" | "windows" | "none"> => (piperReady() ? "piper" : (await startWorker()) ? "windows" : "none");

// One line at a time (the engines are single-voiced, and a queue keeps a reply's sentences in order)
let queue: Promise<unknown> = Promise.resolve();
const alone = <T,>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
};

export function registerSpeechRoutes(app: Express) {
  // Warm the Windows voices while the server starts (PowerShell and WinRT take a second or two the first time)
  if (!piperReady()) setTimeout(() => void startWorker(), 2500);

  app.get("/api/speech/status", async (_req: Request, res: Response) => {
    const engine = await engineNow();
    res.json({ engine, voices: engine === "windows" ? windowsVoices : engine === "piper" ? ["piper"] : [], speakers: engine === "piper" ? piperSpeakers() : undefined, piper: piper().note || undefined });
  });

  app.post("/api/speech", async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    const v = req.body?.voice ?? {};
    if (!text) return void res.status(400).json({ message: "text is required" });
    try {
      const engine = await engineNow();
      if (engine === "none") return void res.status(503).json({ message: "No speech engine on the server: the page speaks with the browser's own voices." });
      const name = String(v.name ?? "");
      const rate = within(v.rate, 0.5, 2, 1);
      const pitch = within(v.pitch, -50, 50, 0);
      const key = createHash("sha1").update(JSON.stringify([engine, name, rate.toFixed(2), Math.round(pitch), text])).digest("hex");
      fs.mkdirSync(CACHE, { recursive: true });
      const file = path.join(CACHE, `${key}.wav`);
      if (!fs.existsSync(file)) {
        const tmp = `${file}.${process.pid}.tmp.wav`;
        await alone(() => (engine === "piper" ? speakPiper(text, Math.max(0, Math.floor(Number(name.replace(/^piper:/, "")) || 0)), rate, tmp) : speakWindows(text, name, rate, pitch, tmp)));
        fs.renameSync(tmp, file);
      }
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "private, max-age=86400");
      fs.createReadStream(file).pipe(res);
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ message: String(e?.message ?? e) });
    }
  });
}
