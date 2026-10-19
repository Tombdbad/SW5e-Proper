import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TONES, TONE_NAMES, retone, toned, worldTone, saturation } from "../../client/src/components/Map/interiors/tones";
import { TONES as TOOL_TONES, toned as toolToned } from "../../tools/tones.mjs";

const lightness = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test("every palette is three stops from dark to light and an accent", () => {
  assert.ok(TONE_NAMES.length >= 8);
  for (const name of TONE_NAMES) {
    const t = TONES[name];
    assert.ok(lightness(t.ramp[0]) < lightness(t.ramp[1]) && lightness(t.ramp[1]) < lightness(t.ramp[2]), `${name} runs dark to light`);
    assert.ok(saturation(t.accent) > 0.3, `${name}'s accent is a colour`);
  }
});

test("the converter's turn of colour and the loader's are the same", () => {
  const samples: [number, number, number][] = [[0.02, 0.02, 0.02], [0.2, 0.2, 0.2], [0.8, 0.8, 0.8], [0.7, 0.1, 0.05], [0.05, 0.3, 0.7], [0.5, 0.45, 0.3]];
  for (const name of TONE_NAMES) for (const rgb of samples) {
    const [a, b] = [toned(TONES[name], rgb), toolToned(TOOL_TONES[name], rgb)];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `${name} ${rgb}`);
  }
});

test("greys follow the ramp by lightness, saturated colours become the accent, light stays light", () => {
  const t = TONES.industrial;
  const [dark, mid, light] = [toned(t, [0.01, 0.01, 0.01]), toned(t, [0.3, 0.3, 0.3]), toned(t, [0.9, 0.9, 0.9])];
  assert.ok(lightness(dark) < lightness(mid) && lightness(mid) < lightness(light));
  const hazard = toned(t, [0.8, 0.1, 0.05]);
  assert.ok(hazard[0] > hazard[2], "the accent is a warm yellow");
});

test("a world tone draws its ramp from the wall colour and keeps the palette's accent", () => {
  const dust = worldTone("frontier", "#c9a56e");
  const slate = worldTone("frontier", "#cfd8dc");
  assert.notEqual(dust.id, slate.id);
  assert.ok(lightness(dust.ramp[0]) < lightness(dust.ramp[1]) && lightness(dust.ramp[1]) < lightness(dust.ramp[2]));
  assert.deepEqual(dust.accent, TONES.frontier.accent);
});

test("retoning leaves the original geometry alone and changes the colours", () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const n = g.getAttribute("position").count;
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  const out = retone(g, TONES.military);
  assert.equal(g.getAttribute("color").getX(0), 0.5);
  assert.notEqual(out.getAttribute("color").getX(0), 0.5);
  assert.equal(out.getAttribute("position").count, n);
});
