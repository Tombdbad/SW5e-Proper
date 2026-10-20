import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TONES, TONE_NAMES, retone, toned, worldTone, saturation, accentShare, holdOf } from "../../client/src/components/Map/interiors/tones";
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
  const samples: [number, number, number][] = [[0.02, 0.02, 0.02], [0.2, 0.2, 0.2], [0.8, 0.8, 0.8], [0.7, 0.1, 0.05], [0.05, 0.3, 0.7], [0.5, 0.45, 0.3], [0.9, 0.6, 0.39], [0.95, 0.37, 0.34]];
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

// A triangle (position and colour of its three vertices) per colour given
const painted = (colours: [number, number, number][]) => {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const col: number[] = [];
  colours.forEach((c, i) => {
    pos.push(i * 2, 0, 0, i * 2 + 1, 0, 0, i * 2, 1, 0);
    for (let v = 0; v < 3; v++) col.push(...c);
  });
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
};

test("a colour between a material and a signal takes part of the accent", () => {
  const [wood, blanket, hazard] = [[0.9, 0.6, 0.39], [0.95, 0.37, 0.34], [1, 0.63, 0.2]] as [number, number, number][];
  assert.equal(accentShare([0.5, 0.5, 0.5]), 0);
  assert.equal(accentShare(hazard), 1);
  assert.ok(accentShare(wood) > 0 && accentShare(wood) < accentShare(blanket) && accentShare(blanket) < 1);
  const t = TONES.military;
  const [a, b] = [toned(t, wood), toned(t, blanket)];
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.02), "the wood and the blanket of a bunk stay two colours");
});

test("an accent is held back on a model that is mostly coloured, not on one with a stripe", () => {
  const grey: [number, number, number] = [0.67, 0.71, 0.77];
  const hazard: [number, number, number] = [1, 0.63, 0.2];
  assert.equal(holdOf(painted([grey, grey, grey, hazard])), 1, "a stripe on a grey body is the accent as it was");
  const sofa = holdOf(painted([hazard, hazard, hazard, grey]));
  assert.ok(sofa < 1 && sofa >= 0.7, `a mostly coloured model is held back, not dropped (${sofa})`);
  const t = TONES.industrial;
  const [held, full] = [toned(t, hazard, sofa), toned(t, hazard)];
  assert.ok(lightness(held) !== lightness(full) || held.some((v, i) => v !== full[i]));
});
