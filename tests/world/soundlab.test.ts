// The sound lab (tools/soundlab.mjs): the headless half of the SeptaBee workflow. A recipe renders the same sound every time, a file
// from SeptaBee (any rate, channels or level) is conformed to what the game wants, and every cue the dialogue may use has a preset
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error plain JS tool
import { BANKS, CUES, PRESETS, SR, conform, inspect, install, picture, readWav, render, spectrogram, varied, writeWav } from "../../tools/soundlab.mjs";
import { CUES as DIALOGUE_CUES } from "../../server/dialogue";

test("the cue list is the dialogue's, and each cue has a preset to make a bank from", () => {
  assert.deepEqual([...CUES].sort(), [...DIALOGUE_CUES].sort());
  for (const cue of CUES) assert.ok(BANKS.some((b: string) => PRESETS[`${b}/${cue}`]), `a preset for ${cue}`);
  for (const k of ["ir/helmet", "ir/mask", "ir/comms"]) assert.ok(PRESETS[k]);
});

test("a recipe renders the same sound each time, at the level the game wants, and takes differ", () => {
  const beep = PRESETS["droid/beep"];
  const a = render(beep, 5);
  assert.deepEqual(a, render(beep, 5));
  const r = inspect(a, SR);
  assert.ok(Math.abs(r.peakDb + 3) < 0.1, `peak ${r.peakDb}`);
  assert.ok(r.seconds > 0.25 && r.seconds < 0.4 && r.leadMs < 30);
  assert.notDeepEqual(render(varied(beep, 1), 1), render(varied(beep, 2), 2));
  for (const [name, recipe] of Object.entries<any>(PRESETS)) {
    const x = render(recipe, 1);
    assert.ok(x.length > 100 && x.every(Number.isFinite), name);
    assert.ok(inspect(x, SR).clipped <= 2, `${name} does not clip`);
  }
});

test("a WAV survives the round trip; a stereo, 44.1 kHz, loud export is made mono, 48 kHz, trimmed and brought to -3 dBFS", () => {
  const x = render(PRESETS["human/sigh"], 2);
  const back = readWav(writeWav(x, SR, 24));
  assert.equal(back.sr, SR);
  assert.ok(back.channels[0].length === x.length && Math.abs(back.channels[0][1000] - x[1000]) < 1e-4);
  // a SeptaBee-style export: half a second of silence, then a loud tone with an offset, in stereo at 44.1 kHz
  const n = 44100;
  const left = new Float32Array(n);
  for (let i = 22050; i < n; i++) left[i] = 0.05 + 0.9 * Math.sin((2 * Math.PI * 440 * i) / 44100);
  const out = conform({ sr: 44100, channels: [left, left] });
  const r = inspect(out, SR);
  assert.ok(r.leadMs <= 31, `lead ${r.leadMs}`);
  assert.ok(Math.abs(r.peakDb + 3) < 0.1 && Math.abs(r.dc) < 0.01);
  assert.ok(Math.abs(out.length / SR - 0.55) < 0.06, `length ${out.length / SR}`);
  assert.throws(() => readWav(Buffer.from("fLaC....")), /not a WAV/);
});

test("takes are installed one after another, and an impulse response keeps its own name", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soundlab-"));
  const x = render(PRESETS["droid/whistle"], 1);
  assert.match(install(x, "droid/whistle", dir), /whistle-1\.wav$/);
  assert.match(install(x, "droid/whistle", dir), /whistle-2\.wav$/);
  assert.match(install(render(PRESETS["ir/helmet"], 1), "ir/helmet", dir), /ir[\\/]helmet\.wav$/);
  assert.throws(() => install(x, "droid/yodel", dir), /cue one of/);
  assert.throws(() => install(x, "robot/beep", dir), /bank one of/);
  const ir = readWav(fs.readFileSync(path.join(dir, "ir", "helmet.wav")));
  assert.ok(ir.channels[0].length > 1000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a picture of a sound shows where its energy is, so it can be read without hearing it", () => {
  const x = new Float32Array(SR / 2).map((_: number, i: number) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR));
  const g = spectrogram(x, SR, 40, 256);
  const mid = g[20];
  const row = mid.indexOf(Math.max(...mid));
  const hz = 16000 * (50 / 16000) ** (row / 255);
  assert.ok(Math.abs(hz - 1000) < 80, `brightest at ${hz} Hz`);
  const png = picture(x, SR, 200);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 200);
});
