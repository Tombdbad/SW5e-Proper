// The character's powers as the real-time shooter plays them (2026-10-29; shared/logic/shooter.ts `castPower`). Read from the power's own text, as the
// turn-based fight reads it (`powerEffect`, `powerMotion`): no power is named here. What the fight can play is damage (the dice at their average),
// healing, a condition that holds, blinds or frightens, and a push or a pull; a power whose effect the text leaves to the table is not offered
// (the turn-based fight still has it). The first four are on keys 1 to 4.
import { avgDice, type RtPower } from "@shared/logic/shooter";
import { castingStats, powerCost, powerEffect, powerMotion } from "./rules";

const feetOf = (range?: string): number => {
  const m = String(range ?? "").match(/(\d+)[- ]?(?:foot|feet|ft)/i);
  if (m) return Number(m[1]);
  return /touch/i.test(String(range)) ? 5 : 60;
};

export function realtimePowers(powers: any[], level: number, scores: any, limit = 4): RtPower[] {
  const out: RtPower[] = [];
  for (const power of powers) {
    if (out.length >= limit) break;
    if (!power?.name) continue;
    const text = String(power.description ?? "");
    const effect = powerEffect({ level: Number(power.level) || 0, description: text, duration: power.duration, concentration: power.concentration }, level);
    const motion = powerMotion({ level: Number(power.level) || 0, description: text, range: power.range }, level);
    const stats = castingStats(scores ?? {}, level, power);
    const range = Math.max(1, Math.min(14, feetOf(power.range) / 5));
    // An area round the target, if the text gives one ("within 10 feet of it"); else the one target
    const area = text.match(/each creature (?:of your choice )?within (\d+) feet/i);
    const radius = area ? Math.min(4, Number(area[1]) / 5) : 0;
    const base = { id: String(power.id ?? power.name), name: String(power.name), cost: powerCost({ level: Number(power.level) || 0 }), range, radius, seconds: 0, distance: 0, strike: 0, damage: 0, type: "force" };
    const rounds = (n?: number) => Math.min(8, Math.max(2, (n ?? 1) * 6));
    // (a power that moves a creature is a push or a pull, even where its text also gives the damage of the blow that ends the move; one whose
    // movement is only the rider of a hit is a damaging power)
    const mover = motion && !motion.rider && (motion.creatures || motion.feet.any);
    if (mover) {
      const feet = motion.feet.any ?? Math.max(0, ...Object.values(motion.feet).map(Number));
      out.push({ ...base, kind: motion.way === "toward" ? "pull" : "push", distance: Math.max(1, Math.min(14, feet / 5)), strike: motion.strike ? Math.round(avgDice(motion.strike.dice)) : 0, type: motion.strike?.type ?? "kinetic" });
    } else if (effect.kind === "heal") out.push({ ...base, kind: "heal", damage: Math.max(1, Math.round(avgDice(effect.dice) + stats.modifier)), type: "healing" });
    else if ((effect.kind === "attack" || effect.kind === "save") && effect.dice) {
      // (a save that halves is worth three quarters of its dice on average)
      const dmg = avgDice(effect.dice) * (effect.kind === "save" && effect.halfOnSave ? 0.75 : 1);
      out.push({ ...base, kind: "damage", damage: Math.max(1, Math.round(dmg)), type: effect.damageType ?? "force" });
    } else if (effect.conditions && !effect.onSelf) {
      const names = effect.conditions.map((c) => c.toLowerCase());
      if (names.some((c) => /stunned|paralyzed|incapacitated|restrained|charmed|unconscious|prone/.test(c))) out.push({ ...base, kind: "stun", seconds: rounds(effect.conditionRounds) });
      else if (names.some((c) => /frightened/.test(c))) out.push({ ...base, kind: "fear", seconds: rounds(effect.conditionRounds) });
      else if (names.some((c) => /blinded/.test(c))) out.push({ ...base, kind: "blind", seconds: rounds(effect.conditionRounds) });
    }
  }
  return out;
}
