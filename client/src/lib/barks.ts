// Barks in a fight (2026-11-15): a short shout from someone in the turn-based fight, written by the local model (server/dialogue.ts POST /api/bark) and
// spoken in their own voice, quietly, never over a reply to the party. It is colour: it changes nothing in the fight. A bark is asked for when something
// happens (a foe falls, a companion is badly hurt, a foe is hit), at most one every BARK_EVERY ms, and the server answers "" when the model is busy, so on a
// slow machine most fights say little. `watchFight` returns the function that stops it.
import { useCombat } from "@/lib/stores/useCombat";
import { speak, voicePrefs } from "@/lib/voice";

const BARK_EVERY = 9000;

export function watchFight(o: { scene: string; player: string }): () => void {
  let last = 0;
  let asking = false;
  const seen = new Map<string, number>();
  const ask = async (who: { id: string | number; name: string; ally?: boolean; species?: string }, event: string, foe?: string) => {
    if (asking || Date.now() - last < BARK_EVERY || !voicePrefs().voice) return;
    asking = true;
    last = Date.now();
    try {
      const r = await fetch("/api/bark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ speaker: { name: who.name, species: who.species, disposition: who.ally ? "friendly" : "hostile", kind: who.ally ? "party" : undefined }, player: { name: o.player }, event, foe, scene: o.scene }) });
      const text = r.ok ? String(((await r.json()) as { text?: string }).text ?? "") : "";
      if (text) await speak(text, { id: String(who.id), name: who.name, species: who.species, disposition: who.ally ? "friendly" : "hostile" }, { ambient: true, gain: 0.9 });
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
