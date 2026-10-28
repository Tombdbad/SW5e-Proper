// ---------------------------------------------------------------------------------------------
// Betting on the pit (2026-10-27; the user: "Pit fighting can also be bet upon with odds relevant to beasts/combatant skill"). HOUSE RULES: the
// pit boss lists three bouts for the day, each between two creatures of the rules' stat blocks of near challenge ratings; the odds are read from
// how often each wins a fight played out a few hundred times (a simple fight: each round each hits on a d20 + its attack bonus against the
// other's armour class for its attack's dice, a natural 20 doubling the dice, a 1 missing), less the house's five in a hundred. A bout is then
// fought out on the table, round by round, with the same dice. Pure: the dice are the project's `createRandom`-shaped source.
// ---------------------------------------------------------------------------------------------
import { crValue } from "./index";
import type { Sw5eMonster } from "../data";

export type Rng = { next: () => number };
export interface Fighter {
  id: string;
  name: string;
  cr: string;
  hp: number;
  ac: number;
  bonus: number;
  dice: number;
  sides: number;
  plus: number;
  // Attacks a round (a multiattack counts its attacks)
  attacks: number;
}
export interface Bout {
  id: string;
  a: Fighter;
  b: Fighter;
  // The chance each has of winning, and what a credit staked on each pays back in all (stake included), by the odds with the house's cut
  chance: [number, number];
  pays: [number, number];
}
export const HOUSE_CUT = 0.05;
const d = (rng: Rng, sides: number) => 1 + Math.floor(rng.next() * sides);

const parseDice = (expr: string): { dice: number; sides: number; plus: number } => {
  const m = /(\d+)d(\d+)\s*([+-]\s*\d+)?/.exec(expr);
  return m ? { dice: Number(m[1]), sides: Number(m[2]), plus: m[3] ? Number(m[3].replace(/\s/g, "")) : 0 } : { dice: 1, sides: 6, plus: 0 };
};
export function fighterOf(m: Sw5eMonster): Fighter | null {
  const attacks = (m.behaviors ?? []).filter((b) => (b.attackType === "MeleeWeapon" || b.attackType === "RangedWeapon") && b.damageRoll);
  const best = [...attacks].sort((x, y) => (y.attackBonus ?? 0) - (x.attackBonus ?? 0))[0];
  if (!best || !m.hitPoints) return null;
  // A multiattack makes as many attacks as it lists (at least one, at most four)
  const multi = (m.behaviors ?? []).find((b) => /multiattack/i.test(b.name ?? ""));
  const count = Math.max(1, Math.min(4, Number(/(\w+) (?:melee |ranged )?attacks?/i.exec(String(multi?.description ?? ""))?.[1].replace(/two/i, "2").replace(/three/i, "3").replace(/four/i, "4")) || (multi ? 2 : 1)));
  return { id: m.id, name: m.name, cr: String(m.challengeRating), hp: m.hitPoints, ac: m.armorClass, bonus: best.attackBonus ?? 0, ...parseDice(best.damageRoll!), attacks: count };
}

// One fight played out: round by round the one with the quicker start (a die each) strikes first; returns the winner and a line a round
export function fight(a: Fighter, b: Fighter, rng: Rng, log?: string[]): 0 | 1 {
  const hp = [a.hp, b.hp];
  const f = [a, b];
  const first: 0 | 1 = d(rng, 20) >= d(rng, 20) ? 0 : 1;
  for (let round = 1; round <= 40; round++) {
    for (const who of [first, (1 - first) as 0 | 1]) {
      if (hp[0] <= 0 || hp[1] <= 0) break;
      const me = f[who];
      const foe = f[1 - who];
      let hit = 0;
      for (let k = 0; k < me.attacks; k++) {
        const roll = d(rng, 20);
        if (roll === 1 || (roll !== 20 && roll + me.bonus < foe.ac)) continue;
        let dmg = me.plus;
        for (let i = 0; i < me.dice * (roll === 20 ? 2 : 1); i++) dmg += d(rng, me.sides);
        hit += Math.max(1, dmg);
      }
      hp[1 - who] -= hit;
      log?.push(`Round ${round}: ${me.name} ${hit ? `hits for ${hit}` : "misses"} (${foe.name} ${Math.max(0, hp[1 - who])} left).`);
    }
    if (hp[0] <= 0 || hp[1] <= 0) break;
  }
  return hp[0] > hp[1] ? 0 : 1;
}
export function chanceOf(a: Fighter, b: Fighter, rng: Rng, runs = 240): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (fight(a, b, rng) === 0) wins++;
  return wins / runs;
}
// The odds on a bout: a credit on the winner returns 1 / chance, less the house's cut; never less than 1.05 to 1
export const paysFor = (chance: number) => Math.max(1.05, Math.round(((1 - HOUSE_CUT) / Math.max(0.04, chance)) * 100) / 100);

// The day's bouts: three, of rising weight, between creatures of near rating (`level` the party's, for the weight)
export function boutsFor(monsters: Sw5eMonster[], level: number, rng: Rng): Bout[] {
  const fighters = monsters.filter((m) => m.hitPoints > 0 && !/swarm|plant|ooze|droid/i.test((m.types ?? []).join(" "))).map(fighterOf).filter((x): x is Fighter => !!x);
  const out: Bout[] = [];
  const pick = (target: number, not: string[]) => {
    const near = fighters.filter((x) => !not.includes(x.id) && Math.abs(crValue(x.cr) - target) <= Math.max(0.5, target * 0.35));
    const pool = near.length ? near : fighters.filter((x) => !not.includes(x.id));
    return pool[Math.floor(rng.next() * pool.length)];
  };
  for (let i = 0; i < 3; i++) {
    const target = Math.max(0.5, Math.min(14, level - 1 + i * 2));
    const a = pick(target, []);
    const b = pick(target + (rng.next() < 0.5 ? -1 : 1) * Math.round(rng.next() * Math.max(1, target * 0.3)), [a.id]);
    const p = chanceOf(a, b, rng);
    out.push({ id: `bout-${i}`, a, b, chance: [p, 1 - p], pays: [paysFor(p), paysFor(1 - p)] });
  }
  return out;
}
// A bet settled: who wins, the log of the fight, and what comes back (the stake times what it pays, or nothing)
export function settle(bout: Bout, pick: 0 | 1, stake: number, rng: Rng): { winner: 0 | 1; log: string[]; back: number } {
  const log: string[] = [`${bout.a.name} (${bout.a.hp} hp, AC ${bout.a.ac}) against ${bout.b.name} (${bout.b.hp} hp, AC ${bout.b.ac}).`];
  const winner = fight(bout.a, bout.b, rng, log);
  log.push(`${winner === 0 ? bout.a.name : bout.b.name} wins the bout.`);
  return { winner, log, back: winner === pick ? Math.floor(stake * bout.pays[pick]) : 0 };
}
