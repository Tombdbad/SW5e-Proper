import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { energyFrom, piperArgs, PIPER_ENERGY, placeCached } from "../../server/speech";

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "sw5e-speech-"));

test("placeCached moves the rendered file in, even when Windows refuses the rename twice (EBUSY)", async () => {
  const d = dir();
  const tmp = path.join(d, "a.tmp.wav");
  const file = path.join(d, "a.wav");
  fs.writeFileSync(tmp, "new");
  let calls = 0;
  const rename = (from: string, to: string) => {
    if (++calls <= 2) throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    fs.renameSync(from, to);
  };
  await placeCached(tmp, file, { rename, wait: async () => {} });
  assert.equal(fs.readFileSync(file, "utf8"), "new");
  assert.equal(fs.existsSync(tmp), false);
  assert.equal(calls, 3);
});

test("placeCached keeps the line already cached when another request got there first, and drops the spare", async () => {
  const d = dir();
  const tmp = path.join(d, "b.tmp.wav");
  const file = path.join(d, "b.wav");
  fs.writeFileSync(tmp, "second");
  fs.writeFileSync(file, "first");
  const rename = () => {
    throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
  };
  await placeCached(tmp, file, { rename, wait: async () => {} });
  assert.equal(fs.readFileSync(file, "utf8"), "first");
  assert.equal(fs.existsSync(tmp), false);
});

test("placeCached still reports a rename that keeps failing when nothing is cached", async () => {
  const d = dir();
  const tmp = path.join(d, "c.tmp.wav");
  const file = path.join(d, "c.wav");
  fs.writeFileSync(tmp, "x");
  const rename = () => {
    throw Object.assign(new Error("EPERM"), { code: "EPERM" });
  };
  await assert.rejects(placeCached(tmp, file, { rename, wait: async () => {} }), /EPERM/);
});

test("Piper's liveliness: each energy reaches the command line, calm is the voice file's own flat setting, and anything else asked is calm", () => {
  const args = piperArgs("voice.onnx", "1.1", "excited");
  const flag = (a: string[], f: string) => a[a.indexOf(f) + 1];
  assert.equal(flag(args, "--model"), "voice.onnx");
  assert.equal(flag(args, "--length_scale"), "1.1");
  assert.equal(flag(args, "--noise_scale"), "0.8");
  assert.equal(flag(args, "--noise_w"), "1");
  assert.equal(flag(piperArgs("v", "1.0", "calm"), "--noise_scale"), "0.333");
  assert.equal(flag(piperArgs("v", "1.0", "normal"), "--noise_w"), "0.8");
  // (livelier at each step, and never as far as the setting that made the rhythm uneven: 1.0 and 1.4)
  assert.ok(PIPER_ENERGY.calm.noise < PIPER_ENERGY.normal.noise && PIPER_ENERGY.normal.noise < PIPER_ENERGY.excited.noise);
  assert.ok(PIPER_ENERGY.excited.noise < 1 && PIPER_ENERGY.excited.noiseW < 1.4);
  assert.equal(energyFrom("excited"), "excited");
  assert.equal(energyFrom(undefined), "calm");
  assert.equal(energyFrom("furious"), "calm");
});
