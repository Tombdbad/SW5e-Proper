// The game's music (2026-11-22, client/src/lib/music.ts): its notes read as written, every part of every piece fills the piece's bars
// exactly (a part that does not divide the piece would drift against the others on every loop), the notes lie where the instruments can
// play them, a pass of a piece holds what its parts say, and the mood follows where the party is
import test from "node:test";
import assert from "node:assert/strict";
import { PIECES, STINGS, freqOf, midiOf, moodOfPlace, parseNotes, passOf, pieceBeats, type Mood } from "../../client/src/lib/music";

test("notes, chords, rests, lengths and marks are read as written", () => {
  assert.equal(midiOf("A4"), 69);
  assert.equal(midiOf("C4"), 60);
  assert.equal(midiOf("Bb2"), 46);
  assert.equal(midiOf("F#3"), 54);
  assert.ok(Math.abs(freqOf(69) - 440) < 1e-9);
  const { events, length } = parseNotes("C4 D4:0.5 r:0.5 | E4+G4:2! x:1/3 F4:0.5.");
  assert.equal(events.length, 5);
  assert.ok(Math.abs(length - (1 + 0.5 + 0.5 + 2 + 1 / 3 + 0.5)) < 1e-9);
  assert.deepEqual(events.map((e) => e.at), [0, 1, 2, 4, 4 + 1 / 3]);
  assert.equal(events[2].freqs.length, 2);
  assert.equal(events[2].vel, 1.25);
  assert.deepEqual(events[3].freqs, [0]);
  assert.equal(events[4].stacc, true);
  assert.equal(events[4].dur, 0.5);
  // an octave shift moves every note
  assert.ok(Math.abs(parseNotes("A4", -1).events[0].freqs[0] - 220) < 1e-9);
  assert.throws(() => parseNotes("H4"));
  assert.throws(() => parseNotes("C4:0"));
});

test("every part of every piece and stinger fills its bars exactly, with notes the instruments can play", () => {
  for (const piece of [...Object.values(PIECES), ...Object.values(STINGS)]) {
    const total = pieceBeats(piece);
    for (const part of piece.parts) {
      const { events, length } = parseNotes(part.notes, part.oct ?? 0);
      const loops = total / length;
      assert.ok(Math.abs(loops - Math.round(loops)) < 1e-6 && loops >= 1, `${piece.name} ${part.inst}: ${length} beats does not divide ${total}`);
      for (const e of events) for (const f of e.freqs) if (f) assert.ok(f >= 27 && f <= 2100, `${piece.name} ${part.inst}: ${f.toFixed(1)} Hz`);
    }
    assert.ok(piece.gain > 0 && piece.gain < 4, `${piece.name}: gain ${piece.gain}`);
  }
});

test("a pass of a piece holds each part's notes once per loop of the part, in time order", () => {
  const piece = PIECES.combat;
  const hits = passOf(piece, 5, () => 0);
  const beat = 60 / piece.bpm;
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].at >= hits[i - 1].at);
  piece.parts.forEach((part, k) => {
    const { events, length } = parseNotes(part.notes, part.oct ?? 0);
    assert.equal(hits.filter((h) => h.part === k).length, events.length * Math.round(pieceBeats(piece) / length), `part ${k}`);
  });
  assert.ok(hits[hits.length - 1].at < pieceBeats(piece) * beat);
  // a layer that waits for a later pass is not in the first
  const late = PIECES.title.parts.findIndex((p) => (p.from ?? 0) > 0);
  assert.ok(late >= 0 && !passOf(PIECES.title, 0, () => 0).some((h) => h.part === late));
  // the cantina's off-beats are swung
  const reed = PIECES.cantina.parts.findIndex((p) => p.inst === "clarinet");
  const offbeats = passOf(PIECES.cantina, 0, () => 0).filter((h) => h.part === reed).map((h) => (h.at / (60 / PIECES.cantina.bpm)) % 1);
  assert.ok(offbeats.some((f) => Math.abs(f - (PIECES.cantina.swing ?? 0)) < 1e-6));
  assert.ok(!offbeats.some((f) => Math.abs(f - 0.5) < 1e-6));
});

test("the music follows where the party is", () => {
  const area = (id: string, kind: string, type: string, parentId: string | null, extra: object = {}) => ({ id, kind, type, parentId, name: id, description: "", tags: [], position: { x: 0, y: 0, z: 0 }, danger: 0, occupants: [], ships: [], loot: [], ...extra });
  const world = {
    areas: Object.fromEntries([
      area("g", "galaxy", "", null), area("sys", "system", "yellow", "g"), area("p", "planet", "desert", "sys"),
      area("city", "settlement", "city", "p"), area("cantina", "building", "cantina", "city"), area("bar", "room", "Main bar", "cantina"),
      area("market", "building", "market", "city"), area("stall", "room", "Stalls", "market"),
      area("ruins", "settlement", "ruins", "p"), area("hall", "building", "ruin", "ruins"),
      area("den", "room", "Den", "hall", { occupants: [{ id: "o", name: "Raider", role: "raider", disposition: "hostile", count: 1, hitPoints: 9, loadout: [] }] }),
      area("cell", "room", "Cell", "hall", { occupants: [{ id: "c", name: "Prisoner", role: "captive", disposition: "hostile", count: 1, hitPoints: 0, loadout: [] }] }),
    ].map((a) => [a.id, a])),
  } as unknown as Parameters<typeof moodOfPlace>[0];
  const cases: [string, boolean, Mood][] = [
    ["bar", false, "cantina"], ["cantina", false, "cantina"], ["stall", false, "town"], ["city", false, "town"], ["den", false, "tension"],
    ["cell", false, "explore"], ["hall", false, "explore"], ["p", false, "explore"], ["p", true, "space"], ["sys", false, "space"], ["g", false, "space"],
  ];
  for (const [id, aboard, mood] of cases) assert.equal(moodOfPlace(world, id, aboard), mood, id);
  assert.equal(moodOfPlace(null, null), "explore");
});
