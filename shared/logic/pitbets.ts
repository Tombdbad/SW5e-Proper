// ---------------------------------------------------------------------------------------------
// Betting on the pit (2026-10-27; the user: "Pit fighting can also be bet upon with odds relevant to beasts/combatant skill"). HOUSE RULES: the
// pit boss lists three bouts for the day, each between two creatures of the rules' stat blocks of near challenge ratings; the odds are read from
// how often each wins a fight played out a few hundred times (a simple fight: each round each hits on a d20 + its attack bonus against the
// other's armour class for its attack's dice, a natural 20 doubling the dice, a 1 missing), less the house's five in a hundred. A bout is then
// fought out on the table, round by round, with the same dice. Pure: the dice are the project's `createRandom`-shaped source.
// ---------------------------------------------------------------------------------------------
import { crValue, createRandom, childrenOf, arenaTiers, DAY, type World } from "./index";
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
  // On a weekend card (see "The weekend card"): a gladiator of the arena, a guest or a beast, and the stat block it fights as
  kind?: "gladiator" | "beast";
  stock?: string;
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

// ---------------------------------------------------------------------------------------------
// The weekend card (2026-11-02; the user: "We also need NPC fights in the arena, these should be at regular intervals and accurately reflected in
// the betting options ... Pit fights should only be fought on weekends (day 6 & 7, and their multiples). Results of pit fights between high level
// combatants should be reflected in NPC conversations for 2-3 days after the bout ... upcoming bouts should be advertised at info terminals and be
// discussed between a few NPCs on the friday prior"). HOUSE RULES, the books keep no calendar of the pit:
//   - the days run in weeks of seven, day 1 a Monday: the pit fights on the sixth and seventh day of each week (Saturday, Sunday: day 6, 7, 13, 14, ...);
//   - five bouts a fight day, every two hours from noon (12:00, 14:00, 16:00, 18:00, 20:00), each fought out in half an hour and its result known
//     at the end of it; the arena's own pit fighters fight, with guests, and its beasts; the bouts grow heavier through the day, and in a bigger
//     arena (more tiers) the fighters are of a higher challenge rating;
//   - the card of a day is fixed by the arena and the day (the same wherever it is read), and so is each bout's result, a fight played out with the
//     bout's own dice; the odds are read from how often each would win (as for any bet above), less the house's cut;
//   - a bet is a ticket, bought before the bout begins and collected at a kiosk once it is over (winnings: the stake times the odds it was bought at);
//   - a bout between two of challenge rating 4 or more is one people talk of: on the day after the bout one talk in five of them is of it, two
//     days after one in ten, three days after one in twenty (the same day, once it is over, three in ten); on the Friday before, a talk in eight is of
//     each day's headline bout.
// ---------------------------------------------------------------------------------------------
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayOf = (day: number) => (((Math.floor(day) - 1) % 7) + 7) % 7;
export const weekdayName = (day: number) => WEEKDAYS[weekdayOf(day)];
export const isBoutDay = (day: number) => weekdayOf(day) >= 5;
export const nextBoutDay = (day: number) => {
  let d = Math.max(1, Math.floor(day));
  while (!isBoutDay(d)) d++;
  return d;
};
export const BOUT_HOURS = [12, 14, 16, 18, 20];
export const BOUT_LENGTH = 30;
export const HIGH_CR = 4;
export const boutStart = (day: number, hour: number) => (day - 1) * DAY + hour * 60;
const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// An arena as the card knows it: the building, how many tiers it has (its size), and its own pit fighters
export interface PitArena { id: string; name: string; settlement: string; tiers: number; fighters: string[] }
export function pitArenaOf(world: World, buildingId: string): PitArena | undefined {
  const building = world.areas[buildingId];
  if (!building || building.type !== "arena") return undefined;
  const rooms = childrenOf(world, building.id).filter((a) => a.kind === "room");
  const fighters = rooms.flatMap((room) => room.occupants.filter((o) => o.role === "pit fighter").map((o) => o.name));
  return { id: building.id, name: building.name, settlement: building.parentId ?? "", tiers: arenaTiers(world, building), fighters };
}
// The arenas of one settlement
export const pitArenasIn = (world: World, settlementId: string): PitArena[] =>
  childrenOf(world, settlementId).filter((a) => a.kind === "building" && a.type === "arena").map((a) => pitArenaOf(world, a.id)!).filter(Boolean);

export interface Match {
  id: string;
  arena: string;
  arenaName: string;
  day: number;
  hour: number;
  // The minute the bout begins; the result is known BOUT_LENGTH minutes on
  start: number;
  a: Fighter;
  b: Fighter;
  chance: [number, number];
  pays: [number, number];
  winner: 0 | 1;
  // Whether it is one people talk of (both fighters of challenge rating HIGH_CR or more)
  high: boolean;
}
export type MatchState = "open" | "live" | "done";
export const matchState = (m: Pick<Match, "start">, minute: number): MatchState => (minute < m.start ? "open" : minute < m.start + BOUT_LENGTH ? "live" : "done");

const RING_FIRST = ["Kreel", "Brannok", "Tessa", "Ruuk", "Dala", "Hesh", "Orrin", "Vexa", "Garn", "Mirek", "Sabra", "Tolo"];
const RING_LAST = ["the Butcher", "Ironhide", "Two-Blades", "Redhand", "the Breaker", "Stonefist", "Sandviper", "the Bleeder", "Gutterjack", "Dunemaw"];
// (people of the rules who would fight in a pit: not the officers and rulers of the stat blocks)
const gladiatorsOf = (m: Sw5eMonster) => /humanoid/i.test((m.types ?? []).join(" ")) && !/admiral|moff|governor|senator|general|chancellor|emperor|director|crime lord|queen|king|noble|diplomat|politician|bureaucrat|ambassador|scientist|engineer|technician|medic|merchant|clerk/i.test(m.name);
const beastsOf = (m: Sw5eMonster) => /beast|monstrosity/i.test((m.types ?? []).join(" "));

// The card of one day at one arena: five bouts on a fight day, none on any other
// (a card is the same each time it is asked for: kept, as the odds take a few hundred fights a bout to work out)
const CARDS = new Map<string, Match[]>();
export function cardFor(arena: PitArena, day: number, monsters: Sw5eMonster[]): Match[] {
  if (!isBoutDay(day)) return [];
  const key = `${arena.id}|${day}|${arena.tiers}|${arena.fighters.join(",")}|${monsters.length}`;
  const kept = CARDS.get(key);
  if (kept) return kept;
  const card = makeCard(arena, day, monsters);
  if (CARDS.size > 400) CARDS.clear();
  CARDS.set(key, card);
  return card;
}
// An arena keeps a stable of named fighters, each with a stat block of its own for good (so that a name means the same fighter on every card, and what
// is said of one is of someone): its own pit fighters first, then ring names made for it, from the weak to the famous
const STABLE_BANDS = [3, 1, 4, 2, 6, 8, 10, 12];
function stableOf(arena: PitArena, humans: { m: Sw5eMonster; f: Fighter }[], scale: number) {
  const r = createRandom(hashOf(`${arena.id}|stable`));
  const names = [...arena.fighters];
  while (names.length < STABLE_BANDS.length) {
    const n = `${RING_FIRST[Math.floor(r.next() * RING_FIRST.length)]} ${RING_LAST[Math.floor(r.next() * RING_LAST.length)]}`;
    if (!names.includes(n)) names.push(n);
  }
  return names.slice(0, Math.max(STABLE_BANDS.length, arena.fighters.length)).map((name, i) => {
    const target = Math.max(0.5, Math.min(16, (STABLE_BANDS[i] ?? 4) * scale));
    const near = humans.filter((x) => Math.abs(crValue(x.f.cr) - target) <= Math.max(0.5, target * 0.35));
    const from = near.length ? near : [...humans].sort((p, q) => Math.abs(crValue(p.f.cr) - target) - Math.abs(crValue(q.f.cr) - target)).slice(0, 4);
    const pick = from[Math.floor(r.next() * from.length)];
    return { id: pick.m.id, fighter: { ...pick.f, name, kind: "gladiator" as const, stock: pick.m.name } };
  });
}
function makeCard(arena: PitArena, day: number, monsters: Sw5eMonster[]): Match[] {
  const r = createRandom(hashOf(`${arena.id}|${day}|card`));
  const usable = monsters.filter((m) => m.hitPoints > 0 && !/swarm|plant|ooze|droid/i.test((m.types ?? []).join(" "))).map((m) => ({ m, f: fighterOf(m) })).filter((x): x is { m: Sw5eMonster; f: Fighter } => !!x.f);
  const humans = usable.filter((x) => gladiatorsOf(x.m));
  const beasts = usable.filter((x) => beastsOf(x.m));
  if (!humans.length) return [];
  const scale = 0.75 + 0.25 * Math.max(1, arena.tiers);
  const stable = stableOf(arena, humans, scale);
  const used = new Set<string>();
  const pickBeast = (target: number) => {
    const near = beasts.filter((x) => Math.abs(crValue(x.f.cr) - target) <= Math.max(0.5, target * 0.35));
    const from = near.length ? near : [...beasts].sort((p, q) => Math.abs(crValue(p.f.cr) - target) - Math.abs(crValue(q.f.cr) - target)).slice(0, 4);
    const x = from[Math.floor(r.next() * from.length)];
    return { ...x.f, kind: "beast" as const, stock: x.m.name };
  };
  // A fighter of the stable not yet on the day's card, near the weight asked for (one of the nearest three)
  const pickFighter = (target: number, not: Set<string>): Fighter => {
    const free = stable.filter((s) => !not.has(s.fighter.name));
    const near = [...(free.length ? free : stable)].sort((p, q) => Math.abs(crValue(p.fighter.cr) - target) - Math.abs(crValue(q.fighter.cr) - target)).slice(0, 3);
    return near[Math.floor(r.next() * near.length)].fighter;
  };
  return BOUT_HOURS.map((hour, i) => {
    const target = Math.max(0.5, Math.min(16, [1, 2, 4, 6, 9][i] * scale));
    const id = `pit-${arena.id}-${day}-${i}`;
    // A pairing the bookmakers would take: neither side hopeless (a few tries, then the nearest to even)
    let best: { a: Fighter; b: Fighter; p: number } | undefined;
    for (let tries = 0; tries < 12; tries++) {
      const a = pickFighter(target, used);
      const beast = beasts.length > 0 && r.next() < 0.4;
      const b = beast ? pickBeast(target) : pickFighter(target, new Set([...used, a.name]));
      const p = chanceOf(a, b, createRandom(hashOf(`${id}|odds|${tries}`)));
      if (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5)) best = { a, b, p };
      if (p >= 0.15 && p <= 0.85) break;
    }
    const { a, b, p } = best!;
    used.add(a.name);
    if (b.kind !== "beast") used.add(b.name);
    const winner = fight(a, b, createRandom(hashOf(`${id}|fight`)));
    return { id, arena: arena.id, arenaName: arena.name, day, hour, start: boutStart(day, hour), a, b, chance: [p, 1 - p] as [number, number], pays: [paysFor(p), paysFor(1 - p)] as [number, number], winner, high: crValue(a.cr) >= HIGH_CR && crValue(b.cr) >= HIGH_CR };
  });
}

// A ticket: a bet bought on a match of the card, kept until it is collected (the odds are those it was bought at)
export interface Ticket { id: string; arena: string; match: string; day: number; hour: number; pick: 0 | 1; stake: number; pays: number; name: string }
export const ticketFor = (m: Match, pick: 0 | 1, stake: number): Ticket => ({ id: `${m.id}-${pick}-${stake}-${m.start}`, arena: m.arena, match: m.id, day: m.day, hour: m.hour, pick, stake, pays: m.pays[pick], name: `${m.a.name} against ${m.b.name}` });
// What a ticket is worth now: waiting (the bout is not over), won (credits to collect), lost
export function ticketState(t: Ticket, m: Match | undefined, minute: number): { state: "waiting" | "won" | "lost"; owed: number } {
  if (!m || matchState(m, minute) !== "done") return { state: "waiting", owed: 0 };
  return m.winner === t.pick ? { state: "won", owed: Math.floor(t.stake * t.pays) } : { state: "lost", owed: 0 };
}

// What people say of the pit (relations.ts and LocalMap choose when): one item for the headline bout of a day's card
export interface PitItem { kind: "result" | "upcoming"; text: string; chance: number; arena: string; day: number }
// The chance a talk is of a bout's result, by the days since the bout (0 the same day, once it is over)
export const RESULT_CHANCE = [0.3, 0.2, 0.1, 0.05];
export const UPCOMING_CHANCE = 0.125;
const stockOf = (f: Fighter) => `${f.kind === "beast" ? "the " : ""}${(f.stock ?? f.name).toLowerCase()}`;
const headline = (card: Match[]) => [...card].sort((p, q) => crValue(q.a.cr) + crValue(q.b.cr) - (crValue(p.a.cr) + crValue(p.b.cr)))[0];
const whenWords = (since: number, day: number) => (since === 0 ? "today" : since === 1 ? "yesterday" : `on ${weekdayName(day)}`);
export function pitNews(arena: PitArena, minute: number, monsters: Sw5eMonster[]): PitItem[] {
  const today = Math.floor(minute / DAY) + 1;
  const out: PitItem[] = [];
  for (let d = today - RESULT_CHANCE.length + 1; d <= today; d++) {
    if (d < 1 || !isBoutDay(d)) continue;
    const since = today - d;
    const m = headline(cardFor(arena, d, monsters).filter((x) => x.high && matchState(x, minute) === "done"));
    if (!m) continue;
    const [w, l] = m.winner === 0 ? [m.a, m.b] : [m.b, m.a];
    const upset = m.chance[m.winner] < 0.35;
    out.push({ kind: "result", arena: arena.name, day: d, chance: RESULT_CHANCE[since], text: `${whenWords(since, d)} at ${arena.name}, ${w.name} (${stockOf(w)}, challenge ${w.cr}) beat ${l.name} (${stockOf(l)}, challenge ${l.cr}) in the pit${upset ? ", at long odds: a famous upset, and the bookmakers paid dearly" : ""}` });
  }
  if (weekdayOf(today) === 4) {
    for (const d of [today + 1, today + 2]) {
      const m = headline(cardFor(arena, d, monsters));
      if (m) out.push({ kind: "upcoming", arena: arena.name, day: d, chance: UPCOMING_CHANCE, text: `on ${weekdayName(d)} at ${hh(m.hour)} at ${arena.name}, ${m.a.name} (${stockOf(m.a)}, challenge ${m.a.cr}) fights ${m.b.name} (${stockOf(m.b)}, challenge ${m.b.cr}) in the pit; the bookmakers favour ${m.chance[0] >= m.chance[1] ? m.a.name : m.b.name}` });
    }
  }
  return out;
}
// Whether this talk (by its seed) is of the pit, and which item: each item has its own chance (times `boost`, more in the arena itself)
export function pitGossip(items: PitItem[], seed: number, boost = 1): PitItem | undefined {
  const u = (hashOf(`${seed}|pit`) % 100000) / 100000;
  let at = 0;
  for (const item of items) {
    at += Math.min(0.9, item.chance * boost);
    if (u < at) return item;
  }
  return undefined;
}
// Stock lines (when the model is not running) about one item
export function pitLines(item: PitItem, seed: number): { who: 0 | 1; text: string }[] {
  const pick = (list: string[], salt: string) => list[hashOf(`${seed}|${salt}`) % list.length];
  const said = item.text.charAt(0).toUpperCase() + item.text.slice(1);
  if (item.kind === "upcoming") return [
    { who: 0, text: pick(["Did you hear who's on the card this weekend?", "You going to the pit this weekend?", "They've posted the bouts for the weekend."], "u0") },
    { who: 1, text: `${said}.` },
    { who: 0, text: pick(["I'll have a few credits on that.", "Won't miss that one.", "The odds will move by Saturday."], "u2") },
  ];
  return [
    { who: 0, text: pick(["Did you see the pit?", "Heard about the bout?", "You hear who won in the pit?"], "r0") },
    { who: 1, text: `${said}.` },
    { who: 0, text: pick(["I'd have lost my shirt on it.", "Something to see.", "They'll be talking about that for days."], "r2") },
  ];
}
