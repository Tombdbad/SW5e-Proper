// Spoken replies (2026-10-30): only what is said reaches the voice (server/dialogue.ts speechOnly), and each speaker has a voice of their own
// that stays theirs (client/src/lib/voice.ts voiceOf), with the reply's mood and cues (toneOf, partsOf) and a tongue for those who do not
// speak Basic (gibberish)
import test from "node:test";
import assert from "node:assert/strict";
import { speechOnly, tidy } from "../../server/dialogue";
import { gibberish, partsOf, toneOf, voiceOf } from "../../client/src/lib/voice";

const windows = { voices: ["George", "Hazel", "Susan"] };

test("narration, stage directions and quotation marks are taken out; sound cues stay, in the short list", () => {
  assert.equal(tidy(`Hessa runs a thumb down a battered datapad. "Bay nine."\n\nShe glances over then. "That's your business."`, false), "Bay nine.\n\nThat's your business.");
  assert.equal(speechOnly("*leans in* Listen, kid. [sighs heavily] The Empire doesn't forgive. [nods] Neither do I."), "Listen, kid. [sigh] The Empire doesn't forgive. Neither do I.");
  assert.equal(speechOnly("R5-D8 beeps twice. [beep] Unit R5 reports the hatch is sealed."), "[beep] Unit R5 reports the hatch is sealed.");
  assert.equal(speechOnly("Nobody says that to me twice. (He cracks his knuckles.) Now walk."), "Nobody says that to me twice. Now walk.", "someone talking is kept");
  assert.equal(speechOnly("I-I didn't see anything... uh... nothing at all."), "I-I didn't see anything... uh... nothing at all.");
});

test("a speaker's voice is the same every time, and others' differ", () => {
  const kessa = { id: "o-12", name: "Kessa Vane", species: "Human", role: "merchant" };
  assert.deepEqual(voiceOf(kessa, windows), voiceOf(kessa, windows));
  const others = Array.from({ length: 30 }, (_, i) => voiceOf({ id: `o-${i}`, name: `Person ${i}`, species: "Human", role: "patron" }, windows));
  const distinct = new Set(others.map((v) => `${v.voice}|${v.pitch}|${v.rate}|${v.mid.join()}`));
  assert.equal(distinct.size, others.length, "thirty people, thirty voices");
  assert.ok(others.every((v) => windows.voices.includes(v.voice)));
  // A gender the game knows picks a voice of that kind
  assert.equal(voiceOf({ id: "c1", name: "Dax", gender: "male" }, windows).voice, "George");
  assert.notEqual(voiceOf({ id: "c1", name: "Dax", gender: "female" }, windows).voice, "George");
  // A Piper model gives each a speaker of its own
  assert.match(voiceOf(kessa, { voices: ["piper"], speakers: 904 }).voice, /^piper:\d+$/);
});

test("droids, Wookiees, small folk, the masked and the rough sound like it", () => {
  const r2 = voiceOf({ id: "d1", name: "R2 unit", kind: "droid", role: "utility droid" }, windows);
  assert.equal(r2.tongue, "bleeps");
  const proto = voiceOf({ id: "d2", name: "3P0 Series", kind: "droid" }, windows);
  assert.equal(proto.tongue, "basic");
  assert.ok(proto.fx.includes("metal") && proto.tags.includes("polished"));
  const b1 = voiceOf({ id: "d3", name: "B1 Series, B1-A", kind: "droid" }, windows);
  assert.ok(b1.fx.includes("droid") && b1.pitch > 1.2);
  assert.equal(voiceOf({ id: "w", name: "Grrakk", species: "Wookiee" }, windows).tongue, "growls");
  assert.equal(voiceOf({ id: "j", name: "Utinni", species: "Jawa" }, windows).tongue, "chatter");
  assert.ok(voiceOf({ id: "t", name: "TK-421", role: "stormtrooper" }, windows).fx.includes("helmet"));
  assert.ok(voiceOf({ id: "i", name: "Seventh Sister", role: "inquisitor" }, windows).fx.includes("breath"));
  const hutt = voiceOf({ id: "h", name: "Gorga", species: "Hutt" }, windows);
  assert.ok(hutt.pitch < 0.7 && hutt.rough > 0.3);
  assert.ok(voiceOf({ id: "m", name: "Rook", role: "mercenary" }, windows).tags.includes("rough"));
});

test("a reply is heard as runs of speech and cues in order; its mood bends the voice; a tongue not spoken is the same sounds for the same words", () => {
  const parts = partsOf("Listen, kid. [sigh] The Empire doesn't forgive. Neither do I, and I never have, not once in all these years. [chuckle]");
  assert.deepEqual(parts.map((x) => ("cue" in x ? `[${x.cue}]` : "say")), ["say", "[sigh]", "say", "[chuckle]"]);
  // (short sentences go together; a long passage is several runs, so the first is heard soon)
  assert.ok(partsOf("One thing first. ".repeat(12)).length >= 3);
  assert.equal(toneOf("I-I didn't... uh... please don't. [gasp]").mood, "nervous");
  assert.equal(toneOf("[sigh] It's been a long day.").mood, "weary");
  assert.equal(toneOf("Get out!", "hostile").mood, "hostile");
  assert.equal(toneOf("Bay nine.").mood, "calm");
  assert.equal(gibberish("Hello there, friend.", 3), gibberish("Hello there, friend.", 3));
  assert.notEqual(gibberish("Hello there, friend.", 3), "Hello there, friend.");
});
