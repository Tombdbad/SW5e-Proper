// Barks in a fight (2026-11-15): a short shout from someone in the turn-based fight, written by the local model (server/dialogue.ts POST /api/bark) and
// spoken in their own voice, quietly, never over a reply to the party. It is colour: it changes nothing in the fight. A bark is asked for when something
// happens (a foe falls, a companion is badly hurt, a foe is hit), at most one every BARK_EVERY ms, and the server answers "" when the model is busy, so on a
// slow machine most fights say little. `watchFight` returns the function that stops it. Each shout is told how the fight stands for the one shouting
// (shared/logic/relations.ts rightNow: winning, losing, hurt), so the words, and the voice after them, carry it.
import { useCombat, type Combatant } from "@/lib/stores/useCombat";
import { speak, voicePrefs } from "@/lib/voice";
import { rightNow, sideStrength } from "@shared/logic/relations";
import { crowdBacks, crowdEventText, crowdShout, PIT_CROWD_SPECIES, type CrowdEvent } from "@shared/logic/pitbets";

const BARK_EVERY = 9000;

export function watchFight(o: { scene: string; player: string }): () => void {
  let last = 0;
  let asking = false;
  const seen = new Map<string, number>();
  // How the fight stands for one fighter: their side's strength and the other's, and their own wounds
  const nowFor = (who: { id: string | number }): string | undefined => {
    const all = useCombat.getState().combatants;
    const me = all.find((c) => String(c.id) === String(who.id));
    if (!me) return undefined;
    const ours = (c: Combatant) => !!(c.isPlayer || c.ally) === !!(me.isPlayer || me.ally);
    return rightNow({ hp: me.hp, maxHp: me.maxHp, fight: { ours: sideStrength(all.filter(ours)), theirs: sideStrength(all.filter((c) => !ours(c))) } }) || undefined;
  };
  const ask = async (who: { id: string | number; name: string; ally?: boolean; species?: string }, event: string, foe?: string) => {
    if (asking || Date.now() - last < BARK_EVERY || !voicePrefs().voice) return;
    asking = true;
    last = Date.now();
    try {
      const r = await fetch("/api/bark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speaker: { name: who.name, species: who.species, disposition: who.ally ? "friendly" : "hostile", kind: who.ally ? "party" : undefined, now: nowFor(who) }, player: { name: o.player }, event, foe, scene: o.scene }) });
      const text = r.ok ? String(((await r.json()) as { text?: string }).text ?? "") : "";
      if (text) await speak(text, { id: String(who.id), name: who.name, species: who.species, disposition: who.ally ? "friendly" : "hostile" }, { ambient: true, gain: 0.9, energy: "excited" });
    } catch {
      // (the model is off: a fight is silent)
    } finally {
      asking = false;
    }
  };
  return useCombat.subscribe((state) => {
    const fighters = state.combatants;
    for (const c of fighters) {
      const key = String(c.id);
      const before = seen.get(key);
      seen.set(key, c.hp);
      if (before === undefined || c.hp >= before || c.isPlayer) continue;
      const foe = (name: string) => fighters.find((x) => !x.isPlayer && !x.ally && x.hp > 0 && x.name !== name)?.name;
      if (c.hp <= 0 && !c.ally) {
        const friend = fighters.find((x) => x.ally && x.hp > 0);
        if (friend) void ask(friend, `${c.name} just went down`, c.name);
      } else if (c.ally && c.hp > 0 && c.hp <= c.maxHp / 2) void ask(c, "you are badly hurt", foe(c.name));
      else if (!c.ally && c.hp > 0) void ask(c, `the party just hit you; you are at ${Math.round((c.hp / c.maxHp) * 100)}% of your strength`, o.player);
    }
  });
}

// The crowd in the pit's stands (2026-11-17; colour only, not a rule: shared/logic/pitbets.ts "The crowd in the stands"). While the party fights a bout,
// a few spectators round the stands shout at what happens: a blow either way, one side nearly done, the bout won or lost. Each backs one side for
// the evening and has a voice of their own, placed where they sit (HRTF), always excited. The stock shout is said at once; now and then the local
// model is asked for a spectator's own line (IN THE STANDS, with the bet on their card) and it is said when it comes. A shout never cuts off
// another line (`politely`) and never plays over a reply to the party. `watchCrowd` returns the function that stops it.
const SEATS = 6;
const CROWD_EVERY = 2500;
const CROWD_ASK_EVERY = 15000;
export function watchCrowd(o: { scene: string; evening: number }): () => void {
  let last = 0;
  let lastAsk = 0;
  let asking = false;
  let turn = 0;
  let started = false;
  const seen = new Map<string, number>();
  const sides = () => {
    const all = useCombat.getState().combatants;
    return { fighter: all.find((c) => c.isPlayer), beast: all.find((c) => !c.isPlayer && !c.ally) };
  };
  const voiceAt = (seat: number) => {
    const a = (seat / SEATS) * Math.PI * 2 + 0.4;
    return { speaker: { id: `pit-crowd-${seat}`, name: "Spectator", species: PIT_CROWD_SPECIES[seat % PIT_CROWD_SPECIES.length], role: "pit spectator" }, at: { x: Math.sin(a) * 7, z: Math.cos(a) * 7 } };
  };
  const say = (text: string, seat: number) => {
    const v = voiceAt(seat);
    return speak(text, v.speaker, { ambient: true, politely: true, gain: 0.6, energy: "excited", at: v.at });
  };
  const shout = (event: CrowdEvent, end = false) => {
    if (!voicePrefs().voice || (!end && Date.now() - last < CROWD_EVERY)) return;
    const { fighter, beast } = sides();
    if (!fighter || !beast) return;
    last = Date.now();
    const names = { fighter: fighter.name, beast: beast.name };
    const seat = (turn++ * 5 + event.length) % SEATS;
    const backs = crowdBacks(seat, o.evening);
    void say(crowdShout(event, backs, names, turn * 31 + o.evening), seat);
    // (now and then a spectator of the other half of the stands says a line of the model's own, when it is free)
    if (asking || Date.now() - lastAsk < CROWD_ASK_EVERY) return;
    asking = true;
    lastAsk = Date.now();
    const other = (seat + SEATS / 2) % SEATS;
    const v = voiceAt(other);
    const bet = crowdBacks(other, o.evening) === "fighter" ? names.fighter : names.beast;
    fetch("/api/bark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crowd: true, speaker: { name: "A spectator", species: v.speaker.species, role: "spectator in the pit's stands", disposition: "neutral", now: rightNow({ bet }) }, player: { name: names.fighter }, event: crowdEventText(event, names), scene: o.scene }) })
      .then((r) => (r.ok ? r.json() : { text: "" }))
      .then((r: { text?: string }) => (r.text ? say(String(r.text), other) : undefined))
      .catch(() => undefined)
      .finally(() => { asking = false; });
  };
  const look = (state: ReturnType<typeof useCombat.getState>) => {
    if (!state.inCombat) return;
    const { fighter, beast } = { fighter: state.combatants.find((c) => c.isPlayer), beast: state.combatants.find((c) => !c.isPlayer && !c.ally) };
    if (!fighter || !beast) return;
    if (!started) { started = true; setTimeout(() => shout("start", true), 600); }
    for (const c of [fighter, beast]) {
      const key = String(c.id);
      const before = seen.get(key);
      seen.set(key, c.hp);
      if (before === undefined || c.hp >= before) continue;
      if (c.hp <= 0) continue;
      shout(c.hp <= c.maxHp / 3 ? "close" : c === beast ? "hit" : "hurt");
    }
  };
  look(useCombat.getState());
  let ended = false;
  const stop = useCombat.subscribe((state, prev) => {
    look(state);
    if (!ended && state.outcome && state.outcome !== prev.outcome && started) {
      ended = true;
      if (state.outcome === "victory") shout("won", true);
      else if (state.outcome !== "left") shout("lost", true);
    }
  });
  return stop;
}
