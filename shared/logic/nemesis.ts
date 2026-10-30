// Nemeses (2026-10-29; the user: "borrow heavily from scripts/NemesisMod.dll ... a 'Nemesis' style system"). The people the party fights do not
// all stay beaten: one who runs away, one who is left for dead, and the one who brings the party down all become NAMED enemies with a
// personality, a grudge (hate), a dread of the party (fear), scars from what was done to them and a rank that climbs with every win.
// They rest, heal, and come back for the party, with their crew, when the grudge is deep enough and their nerve holds.
//
// The shape follows the mod's data model (records of hate and fear with tiers; personalities with temper profiles; intent: hunts / won't hunt /
// provoked only; the party's notoriety scaling ambushes; scars; history; mercy and interrogation; leader seats filled when a boss falls)
// and the tuning numbers are our own. Everything here is a labelled HOUSE RULE (the books have no such system); see REVIVAL_NOTES "Nemeses".
//
// Pure: a state goes in and a new one comes out. A record is plain JSON and lives in `World.nemeses` (so it is saved with the campaign).
import { unitOf, type Gender, type Occupant } from "./index";

export type Personality = "hothead" | "coward" | "proud" | "cold" | "greedy" | "loyal" | "drifter";
export type HateTier = "none" | "resentful" | "vengeful" | "murderous";
export type Intent = "hunts" | "wont-hunt" | "provoked-only";
export type GrudgeOrigin = "fled" | "left-for-dead" | "killed-party" | "comrade-killed" | "spared" | "beaten" | "ambushed";
export type Status = "alive" | "resting" | "at-mercy" | "presumed-dead" | "dead";

export interface Scar {
  wound: string;
  location: string;
  // The damage type that did it, and a body part replaced by a prosthesis (the kit has prosthesis-arm / -hand / -eye / -leg models)
  from: string;
  prosthesis?: "arm" | "hand" | "eye" | "leg";
  at: number;
  byParty: boolean;
}
export interface HistoryEntry {
  at: number;
  text: string;
}
export interface NemesisRecord {
  id: string;
  name: string;
  // Earned from deeds ("the Scarred", "Hand-Taker"); see titleOf
  title?: string;
  // Who they are to their kin (shared/logic/relations.ts): a family name is one family and one species, and a nemesis's family is in
  // World.families under their record id
  species?: string;
  gender?: Gender;
  family?: string;
  // The side they fight for (a faction name or the world's antagonist), whose leader's chair they may take
  gang: string;
  rank: number;
  rankXp: number;
  personality: Personality;
  aggression: number;
  hate: number;
  fear: number;
  // What they were when the party met them: a single stat block, scaled up by rank when they come back (see empower)
  body: Occupant;
  // Where they are from and where they were last seen
  home?: string;
  lastSeen?: { settlementId?: string; areaId?: string; at: number };
  status: Status;
  restUntil: number;
  huntedAt: number;
  origin: GrudgeOrigin;
  scars: Scar[];
  history: HistoryEntry[];
  // How it has gone between them and the party
  killedParty: number;
  beaten: number;
  fled: number;
  spared: number;
  cheatedDeath: number;
  // The party knows where to find them (learned by interrogation or rumour)
  known?: boolean;
  // A spared enemy who owes the party: an informant
  informant?: boolean;
}
export interface NewsItem {
  at: number;
  text: string;
  settlementId?: string;
}
export interface LeaderSeat {
  gang: string;
  fallen: string;
  successor?: string;
  at: number;
}
export interface NemesisState {
  v: 1;
  seed: number;
  counter: number;
  records: Record<string, NemesisRecord>;
  // How feared the party is (0-100); see NOTORIETY
  notoriety: number;
  lastTick: number;
  news: NewsItem[];
  seats: LeaderSeat[];
  // Ids of those left at the party's mercy, waiting to be spared, finished or questioned
  mercy: string[];
  // The number the next record's id is made from (a combat id like "trooper-0" is reused from fight to fight, so a record has an id of its own)
  nextId: number;
}
export interface NemesisEvent {
  kind: "rises" | "returns" | "rank" | "scarred" | "cheated-death" | "dead" | "mercy" | "seat" | "fled" | "hunts";
  id?: string;
  text: string;
}

export const emptyNemeses = (seed = 1): NemesisState => ({ v: 1, seed, counter: 0, records: {}, notoriety: 0, lastTick: 0, news: [], seats: [], mercy: [], nextId: 1 });

// ---- Tuning (house rules) ----------------------------------------------------------------------------------------------------------
export const BALANCE = {
  vengefulAt: 35,
  murderousAt: 70,
  resentfulAt: 12,
  hateMax: 100,
  // Fear at which they stop hunting, and at which they only strike if provoked (unless fierce enough to ignore it)
  wontHuntFear: 80,
  provokedOnlyFear: 55,
  vengefulHuntAggression: 70,
  // Chance of a hunt each check, by tier, and the hours between one hunt and the next
  huntChance: { none: 0, resentful: 0.04, vengeful: 0.12, murderous: 0.3 } as Record<HateTier, number>,
  huntCooldownHours: { none: 999, resentful: 36, vengeful: 18, murderous: 8 } as Record<HateTier, number>,
  // A fighter who was beaten and left for dead lives on this often, a leader more
  survivesBeaten: 0.1,
  survivesLeader: 0.35,
  // Hours a beaten or fled enemy rests before it is about again
  restHours: 12,
  restHoursKilledParty: 24,
  cheatDeathBase: 0.25,
  cheatDeathPerRank: 0.05,
  cheatDeathMax: 2,
  rankXpToRise: 100,
  maxRank: 5,
  maxRecords: 40,
  hatePerComrade: 15,
  // A relative's hate when a nemesis is killed, before the strength of the tie (house rule: a spouse or a parent takes on most of it)
  hatePerKin: 40,
  fearDecayPerDay: 3,
  notorietyPerKill: 0.25,
  notorietyPerNemesisKill: 8,
  notorietyDecayPerDay: 1,
  newsMax: 30,
  historyMax: 20,
  // Per rank above the first: more hit points, a better attack and armor
  hpPerRank: 0.2,
  attackPerTwoRanks: 1,
  acPerThreeRanks: 1,
};

export const RANKS = ["Recruit", "Veteran", "Sergeant", "Lieutenant", "Captain", "Warlord"];
// How feared the party has grown: a level every so many points; the ambush multiplier makes the vengeful come sooner
export const NOTORIETY = {
  starts: [0, 8, 25, 50, 80],
  names: ["Unknown", "Troublemaker", "Menace", "Scourge", "Legend of Terror"],
  ambush: [1, 1.1, 1.25, 1.5, 1.8],
};
export const notorietyLevel = (n: number) => NOTORIETY.starts.reduce((lvl, start, i) => (n >= start ? i : lvl), 0);

// Temper: what each personality does with a slight. `fleeAt` is the share of hit points at which they break and run; `surrender` the
// chance a beaten one begs; `aggression` the base of how fiercely they come back.
interface Temper {
  hateGain: number;
  fearGain: number;
  coolPerDay: number;
  fleeAt: number;
  surrender: number;
  aggression: number;
  blurb: string;
}
export const TEMPERS: Record<Personality, Temper> = {
  hothead: { hateGain: 1.5, fearGain: 0.7, coolPerDay: 1, fleeAt: 0.1, surrender: 0.05, aggression: 75, blurb: "rash and quick to anger; forgets nothing and cools slowly" },
  coward: { hateGain: 0.7, fearGain: 1.6, coolPerDay: 4, fleeAt: 0.5, surrender: 0.5, aggression: 25, blurb: "quick to run, slow to come back; the worse the party's name, the less they dare" },
  proud: { hateGain: 1.3, fearGain: 0.9, coolPerDay: 1.5, fleeAt: 0.2, surrender: 0.1, aggression: 65, blurb: "cannot bear to be spared; mercy only deepens the grudge" },
  cold: { hateGain: 1, fearGain: 1, coolPerDay: 2, fleeAt: 0.25, surrender: 0.2, aggression: 55, blurb: "patient and exact; plans the return" },
  greedy: { hateGain: 0.9, fearGain: 1.1, coolPerDay: 3, fleeAt: 0.3, surrender: 0.4, aggression: 45, blurb: "can be bought off; hates being robbed above all" },
  loyal: { hateGain: 1.2, fearGain: 0.8, coolPerDay: 2, fleeAt: 0.15, surrender: 0.1, aggression: 60, blurb: "fights for their crew; a fallen friend is a grudge for life" },
  drifter: { hateGain: 0.8, fearGain: 1.2, coolPerDay: 5, fleeAt: 0.35, surrender: 0.3, aggression: 35, blurb: "goes where the work is; forgets quickly" },
};
const PERSONALITIES = Object.keys(TEMPERS) as Personality[];

// ---- Names and lines ---------------------------------------------------------------------------------------------------------------
const FIRST = ["Kovak", "Dren", "Marek", "Vessa", "Tarn", "Orrin", "Zeya", "Brakk", "Lutha", "Sorn", "Kessa", "Ruuk", "Jaro", "Nyla", "Taddeus", "Varga", "Hesk", "Mirra", "Daxon", "Corvo", "Ilsa", "Pell", "Grath", "Soren", "Yara", "Bodrik", "Talon", "Eris", "Juno", "Rask"];
const LAST = ["Vane", "Skarsk", "Tolliver", "Drax", "Okonar", "Valtis", "Ketch", "Marrow", "Starkiller", "Brannic", "Haldane", "Voss", "Krennick", "Sarn", "Dahl", "Ostrander", "Reyes", "Blackwater", "Tanis", "Quill"];
const HOW: Record<GrudgeOrigin, string> = {
  fled: "ran from the party and swore to repay it",
  "left-for-dead": "was left for dead by the party and crawled away",
  "killed-party": "brought the party down and left them for dead",
  "comrade-killed": "lost a friend to the party",
  spared: "was spared by the party",
  beaten: "was beaten by the party",
  ambushed: "was ambushed by the party",
};
type Moment = "spot" | "ambush" | "winning" | "losing" | "flee" | "beg" | "return" | "spared";
const LINES: Record<Personality, Record<Moment, string[]>> = {
  hothead: {
    spot: ["There you are! I've been looking for you!", "You! Draw!"],
    ambush: ["No more running!", "I've waited for this!"],
    winning: ["Is that all you've got?!", "Stay down!"],
    losing: ["No... not again!", "I'll tear you apart!"],
    flee: ["This isn't over!", "Fall back! Fall back!"],
    beg: ["Wait! Wait!"],
    return: ["Remember me?!"],
    spared: ["You think that makes us even?!"],
  },
  coward: {
    spot: ["Y-you're the one they're talking about...", "Stay back!"],
    ambush: ["There are more of us this time!", "Get them before they get us!"],
    winning: ["Ha! Ha, I did it!", "Don't get up, please don't get up..."],
    losing: ["I knew it, I knew it!", "Run!"],
    flee: ["I'm out of here!", "Not worth it! Not worth it!"],
    beg: ["Please! I have a family!", "I'll tell you anything!"],
    return: ["I'm better than I was. I swear I am."],
    spared: ["Thank you. Thank you!"],
  },
  proud: {
    spot: ["I do not forget a debt of honor.", "You humiliated me. That ends today."],
    ambush: ["Face me properly this time.", "Let us settle this."],
    winning: ["Learn from this, if you live.", "The better fighter wins. As it should be."],
    losing: ["Impossible...", "Finish it, then. I will not beg."],
    flee: ["This is not the end of it.", "I will be back, and better."],
    beg: ["Do it. I will not ask twice."],
    return: ["I have trained. Draw."],
    spared: ["You pity me? You will regret that."],
  },
  cold: {
    spot: ["I've been watching you.", "Right on schedule."],
    ambush: ["Everything is in place.", "You walked straight into it."],
    winning: ["As expected.", "Nothing personal."],
    losing: ["A miscalculation.", "Noted."],
    flee: ["Withdraw. We will adjust.", "A setback, nothing more."],
    beg: ["Let us discuss terms."],
    return: ["I've corrected my mistakes."],
    spared: ["Your mercy has been recorded."],
  },
  greedy: {
    spot: ["There's a price on your head, you know.", "Credits walking around on two legs."],
    ambush: ["Nothing personal. It pays.", "Hand over everything you've got!"],
    winning: ["Pleasure doing business.", "Check their pockets!"],
    losing: ["I'm not paid enough for this!", "Name your price!"],
    flee: ["Keep it! Keep the credits!", "Not worth the fee!"],
    beg: ["I can make it worth your while!"],
    return: ["You cost me a lot of credits. I want them back."],
    spared: ["You won't regret this. I'll make it up to you."],
  },
  loyal: {
    spot: ["You'll answer for what you did to my people.", "I haven't forgotten their names."],
    ambush: ["For the fallen!", "Stand together!"],
    winning: ["That's for them.", "Hold the line!"],
    losing: ["Get the others out!", "I'll hold them!"],
    flee: ["Retreat! Take the wounded!", "We'll be back for you."],
    beg: ["Spare my crew. Take me."],
    return: ["I swore I'd see you again."],
    spared: ["I'll remember this."],
  },
  drifter: {
    spot: ["Oh. It's you.", "Small galaxy."],
    ambush: ["Sorry, it's the job.", "Business is business."],
    winning: ["Easy money.", "Better luck next time."],
    losing: ["Not for this pay!", "I'm done, I'm done!"],
    flee: ["I'm gone.", "Find someone else."],
    beg: ["Hey, hey, no need for that."],
    return: ["Funny running into you again."],
    spared: ["I owe you one."],
  },
};
export function tauntOf(rec: Pick<NemesisRecord, "personality" | "id">, moment: Moment, n = 0): string {
  const bank = LINES[rec.personality][moment];
  return bank[Math.floor(unitOf(`${rec.id}|${moment}|${n}`) * bank.length)];
}

// ---- Small helpers -----------------------------------------------------------------------------------------------------------------
function work(state: NemesisState) {
  const s: NemesisState = structuredClone(state);
  const roll = (tag: string) => unitOf(`${s.seed}|${s.counter++}|${tag}`);
  return { s, roll };
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const tierOf = (hate: number): HateTier => (hate >= BALANCE.murderousAt ? "murderous" : hate >= BALANCE.vengefulAt ? "vengeful" : hate >= BALANCE.resentfulAt ? "resentful" : "none");
export const intentOf = (rec: Pick<NemesisRecord, "fear" | "aggression">): Intent =>
  rec.fear >= BALANCE.wontHuntFear ? "wont-hunt" : rec.fear >= BALANCE.provokedOnlyFear && rec.aggression < BALANCE.vengefulHuntAggression ? "provoked-only" : "hunts";
const note = (rec: NemesisRecord, at: number, text: string) => {
  rec.history.push({ at, text });
  if (rec.history.length > BALANCE.historyMax) rec.history.splice(0, rec.history.length - BALANCE.historyMax);
};
const news = (s: NemesisState, at: number, text: string, settlementId?: string) => {
  s.news.push({ at, text, settlementId });
  if (s.news.length > BALANCE.newsMax) s.news.splice(0, s.news.length - BALANCE.newsMax);
};
const addHate = (rec: NemesisRecord, base: number) => void (rec.hate = clamp(Math.round(rec.hate + base * TEMPERS[rec.personality].hateGain), 0, BALANCE.hateMax));
const addFear = (rec: NemesisRecord, base: number, notoriety: number) => void (rec.fear = clamp(Math.round(rec.fear + base * TEMPERS[rec.personality].fearGain * (1 + notorietyLevel(notoriety) * 0.15)), 0, 100));
const gainXp = (rec: NemesisRecord, xp: number, at: number, ev: NemesisEvent[]) => {
  rec.rankXp += xp;
  while (rec.rankXp >= BALANCE.rankXpToRise && rec.rank < BALANCE.maxRank) {
    rec.rankXp -= BALANCE.rankXpToRise;
    rec.rank++;
    note(rec, at, `Rose to ${RANKS[rec.rank]}.`);
    ev.push({ kind: "rank", id: rec.id, text: `${nameOf(rec)} has risen to ${RANKS[rec.rank]}.` });
  }
  if (rec.rank >= BALANCE.maxRank) rec.rankXp = Math.min(rec.rankXp, BALANCE.rankXpToRise - 1);
};

// ---- Scars -------------------------------------------------------------------------------------------------------------------------
const WOUNDS: Record<string, { wound: string; location: string; prosthesis?: Scar["prosthesis"] }[]> = {
  energy: [{ wound: "a blaster burn", location: "cheek" }, { wound: "a lightsaber slash", location: "face" }, { wound: "a seared stump", location: "hand", prosthesis: "hand" }, { wound: "a burned-out socket", location: "left eye", prosthesis: "eye" }],
  kinetic: [{ wound: "a crooked, broken nose", location: "face" }, { wound: "a shattered knee", location: "leg", prosthesis: "leg" }, { wound: "a slug scar", location: "shoulder" }],
  fire: [{ wound: "burn scars", location: "face" }, { wound: "melted skin", location: "arm" }],
  ion: [{ wound: "fried circuitry", location: "temple" }, { wound: "a dead, fused arm", location: "arm", prosthesis: "arm" }],
  lightning: [{ wound: "branching lightning scars", location: "neck" }],
  force: [{ wound: "a crushed windpipe, a rasp", location: "throat" }],
  sonic: [{ wound: "a ruined ear", location: "ear" }],
  acid: [{ wound: "eaten flesh", location: "jaw" }],
  cold: [{ wound: "frostbitten fingers", location: "hand" }],
  necrotic: [{ wound: "withered skin", location: "arm" }],
  poison: [{ wound: "a sickly pallor and a tremor", location: "hands" }],
  psychic: [{ wound: "a vacant stare", location: "eyes" }],
};
export const PROSTHESIS_MODEL: Record<NonNullable<Scar["prosthesis"]>, string> = { arm: "prosthesis-arm", hand: "prosthesis-hand", eye: "prosthesis-eye", leg: "prosthesis-leg" };
// A survivor of the party's blows may carry a mark of the worst of them. `dominant` is the damage type that did most; `shareOfMax` how
// much of the creature's hit points the party's blows came to (a savage beating more often leaves a lasting wound, and the worst a lost limb)
function scarFor(dominant: string | undefined, shareOfMax: number, roll: (tag: string) => number, at: number): Scar | undefined {
  const type = (dominant ?? "kinetic").toLowerCase();
  if (roll("scar?") >= clamp(shareOfMax * 0.5, 0.05, 0.6)) return undefined;
  const bank = WOUNDS[type] ?? WOUNDS.kinetic;
  const heavy = shareOfMax >= 1;
  const pool = heavy ? bank : bank.filter((w) => !w.prosthesis);
  const pick = (pool.length ? pool : bank)[Math.floor(roll("scar") * (pool.length || bank.length))];
  return { wound: pick.wound, location: pick.location, from: type, prosthesis: pick.prosthesis, at, byParty: true };
}
export function titleOf(rec: Pick<NemesisRecord, "scars" | "killedParty" | "fled" | "cheatedDeath" | "rank">): string | undefined {
  const lost = rec.scars.find((s) => s.prosthesis);
  if (lost) return lost.prosthesis === "eye" ? "One-Eye" : lost.prosthesis === "leg" ? "Hobble" : "Hand-Taker";
  if (rec.cheatedDeath) return "the Undying";
  if (rec.killedParty) return "the Butcher";
  if (rec.scars.length) return "the Scarred";
  if (rec.fled) return "the Wounded Pride";
  return rec.rank >= 3 ? "the Relentless" : undefined;
}
export const nameOf = (rec: Pick<NemesisRecord, "name" | "title">) => (rec.title ? `${rec.name} ${rec.title}` : rec.name);
const retitle = (rec: NemesisRecord) => void (rec.title = titleOf(rec));

// ---- Making a nemesis --------------------------------------------------------------------------------------------------------------
export interface FightFoe {
  // A single enemy of the fight: its combat id (a nemesis keeps its record id), the stat block it came from and how it ended
  id: string;
  name: string;
  body: Occupant;
  hp: number;
  maxHp: number;
  fled?: boolean;
  leader?: boolean;
  // What the party's blows did to it: damage by type
  struck?: Record<string, number>;
}
export interface FightReport {
  outcome: "victory" | "fled" | "stable" | "dead";
  foes: FightFoe[];
  now: number;
  settlementId?: string;
  areaId?: string;
  // The foe that brought the party down (its combat id), where that happened
  downedBy?: string;
  faction?: string;
  // Names a new nemesis as a person of this species with a family (GameBoard gives it the world's families; see personIn in shared/logic)
  person?: (species: string, id: string) => { name: string; gender: Gender; family: string };
}
// A person (not a beast, a horror or a droid) can hold a grudge
export const isPerson = (o: Pick<Occupant, "role" | "creature">) => !["wildlife", "horror"].includes(o.role) && (o.creature ?? "humanoid").toLowerCase() !== "droid" && (o.creature ?? "humanoid").toLowerCase() !== "beast";
const dominantType = (struck?: Record<string, number>) => Object.entries(struck ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const totalOf = (struck?: Record<string, number>) => Object.values(struck ?? {}).reduce((a, b) => a + b, 0);

function create(s: NemesisState, roll: (t: string) => number, foe: FightFoe, origin: GrudgeOrigin, report: FightReport): NemesisRecord {
  const personality = PERSONALITIES[Math.floor(roll("personality") * PERSONALITIES.length)];
  const t = TEMPERS[personality];
  const id = `nem-${s.nextId++}`;
  const species = foe.body.species ?? "Human";
  const who = report.person?.(species, id);
  const name = who?.name ?? `${FIRST[Math.floor(roll("first") * FIRST.length)]} ${LAST[Math.floor(roll("last") * LAST.length)]}`;
  const body: Occupant = { ...foe.body, id: foe.id, name: foe.body.name, count: 1, wounds: undefined, disposition: "hostile" };
  const rec: NemesisRecord = {
    id, name, ...(who ? { species, gender: who.gender, family: who.family } : {}), gang: report.faction ?? "outlaws", rank: 0, rankXp: 0, personality, aggression: clamp(t.aggression + Math.round(roll("aggr") * 20 - 10), 5, 95),
    hate: 0, fear: 0, body, home: report.settlementId, lastSeen: { settlementId: report.settlementId, areaId: report.areaId, at: report.now },
    status: "alive", restUntil: report.now, huntedAt: report.now, origin, scars: [], history: [], killedParty: 0, beaten: 0, fled: 0, spared: 0, cheatedDeath: 0,
  };
  note(rec, report.now, `A ${foe.body.name.toLowerCase()} who ${HOW[origin]}.`);
  return rec;
}

// What a fight leaves behind. Fleeing foes, a beaten leader that lived, and the one who downed the party become nemeses; those who
// already are rise, scar, rest or fall. Returns the new state and what happened (for toasts and the log).
export function settleFight(state: NemesisState, report: FightReport): { state: NemesisState; events: NemesisEvent[] } {
  const { s, roll } = work(state);
  const events: NemesisEvent[] = [];
  const lost = report.outcome === "stable" || report.outcome === "dead";
  const at = report.now;
  let kills = 0;
  for (const foe of report.foes) {
    if (!isPerson(foe.body)) continue;
    const down = foe.hp <= 0 && !foe.fled;
    if (down) kills++;
    let rec = s.records[foe.id];
    const struck = totalOf(foe.struck);
    const shareOfMax = foe.maxHp > 0 ? struck / foe.maxHp : 0;
    const downedParty = lost && report.downedBy === foe.id;
    const rollFor = (tag: string) => roll(`${foe.id}|${tag}`);
    if (!rec) {
      const rises =
        foe.fled ? !!foe.leader || rollFor("rise-fled") < 0.7
        : downedParty ? true
        : down && report.outcome === "victory" ? rollFor("rise-down") < (foe.leader ? BALANCE.survivesLeader : BALANCE.survivesBeaten)
        : false;
      if (!rises) continue;
      const origin: GrudgeOrigin = downedParty ? "killed-party" : foe.fled ? "fled" : "left-for-dead";
      rec = create(s, rollFor, foe, origin, report);
      s.records[rec.id] = rec;
      events.push({ kind: "rises", id: rec.id, text: `${rec.name}, ${rec.body.name.toLowerCase()}, ${HOW[origin]}.` });
    }
    // A nemesis who ended the fight on their feet, on the run or down
    rec.lastSeen = { settlementId: report.settlementId, areaId: report.areaId, at };
    rec.known = false;
    if (down) {
      // Beaten: left at the party's mercy after a win, or gone with the party's defeat's last breath
      const scar = scarFor(dominantType(foe.struck), Math.max(shareOfMax, 0.5), rollFor, at);
      if (scar) {
        rec.scars.push(scar);
        events.push({ kind: "scarred", id: rec.id, text: `${nameOf(rec)} carries ${scar.wound} on the ${scar.location}.` });
      }
      rec.beaten++;
      addHate(rec, 12);
      addFear(rec, 22, s.notoriety);
      if (report.outcome === "victory") {
        rec.status = "at-mercy";
        s.mercy.push(rec.id);
        note(rec, at, "Beaten by the party and left at their mercy.");
        events.push({ kind: "mercy", id: rec.id, text: `${nameOf(rec)} lies at your mercy.` });
      } else {
        // Downed in a fight the party lost or fled: their own pick them up
        rec.status = "resting";
        rec.restUntil = at + BALANCE.restHours * 60;
        note(rec, at, "Struck down, but the party did not finish the job.");
      }
    } else if (foe.fled) {
      rec.fled++;
      const scar = shareOfMax >= 0.25 ? scarFor(dominantType(foe.struck), shareOfMax, rollFor, at) : undefined;
      if (scar) {
        rec.scars.push(scar);
        events.push({ kind: "scarred", id: rec.id, text: `${nameOf(rec)} flees with ${scar.wound} on the ${scar.location}.` });
      }
      addHate(rec, 20);
      addFear(rec, 14, s.notoriety);
      gainXp(rec, 25, at, events);
      rec.status = "resting";
      rec.restUntil = at + BALANCE.restHours * 60;
      note(rec, at, "Broke and ran from the party.");
      events.push({ kind: "fled", id: rec.id, text: `${nameOf(rec)} slips away. ${tauntOf(rec, "flee")}` });
    } else {
      // Standing at the end
      if (downedParty) {
        rec.killedParty++;
        addHate(rec, 4);
        addFear(rec, -10, s.notoriety);
        gainXp(rec, 60, at, events);
        rec.status = "resting";
        rec.restUntil = at + BALANCE.restHoursKilledParty * 60;
        note(rec, at, "Brought the party down.");
        events.push({ kind: "rank", id: rec.id, text: `${nameOf(rec)} stands over the fallen. ${tauntOf(rec, "winning")}` });
      } else if (report.outcome === "fled") {
        addHate(rec, 8);
        addFear(rec, -4, s.notoriety);
        gainXp(rec, 20, at, events);
        rec.status = "resting";
        rec.restUntil = at + 6 * 60;
        note(rec, at, "Let the party run.");
      } else {
        gainXp(rec, 10, at, events);
      }
    }
    retitle(rec);
  }
  // The party has grown more feared for the fallen
  s.notoriety = clamp(s.notoriety + kills * BALANCE.notorietyPerKill, 0, 100);
  if (kills && report.outcome === "victory") {
    // Friends of the fallen take it hard
    const fallen = report.foes.filter((f) => f.hp <= 0 && !f.fled && isPerson(f.body));
    for (const rec of Object.values(s.records)) {
      if (rec.status === "dead" || rec.status === "at-mercy" || report.foes.some((f) => f.id === rec.id)) continue;
      const friends = fallen.length && rec.gang === (report.faction ?? rec.gang);
      if (friends && (rec.personality === "loyal" || roll(`friend|${rec.id}`) < 0.5)) {
        addHate(rec, BALANCE.hatePerComrade);
        rec.origin = rec.hate >= BALANCE.vengefulAt ? "comrade-killed" : rec.origin;
      }
    }
  }
  prune(s);
  return { state: s, events };
}

function prune(s: NemesisState) {
  const all = Object.values(s.records);
  if (all.length <= BALANCE.maxRecords) return;
  const dropped = all.filter((r) => r.status === "dead" || r.status === "presumed-dead").sort((a, b) => a.rank - b.rank || a.hate - b.hate);
  while (Object.keys(s.records).length > BALANCE.maxRecords && dropped.length) delete s.records[dropped.shift()!.id];
}

// ---- Mercy and questions -----------------------------------------------------------------------------------------------------------
export type MercyChoice = "spare" | "execute" | "interrogate";
// What the party does with one it has beaten. Executing may fail to kill (they cheat death, up to twice) and then they are scarred, a
// Warlord's chance the highest; sparing a proud one deepens the grudge while a greedy or fearful one may turn informant; questioning
// frightens them and may give up where others can be found.
// `kin` says who is related to a record and how closely (relations.ts kinOf): when a nemesis is killed, a relative who is a nemesis too takes
// the grudge on, by the strength of the tie
export function resolveMercy(state: NemesisState, id: string, choice: MercyChoice, now: number, kin?: (id: string) => { id: string; tie: number }[]): { state: NemesisState; events: NemesisEvent[] } {
  const { s, roll } = work(state);
  const events: NemesisEvent[] = [];
  const rec = s.records[id];
  if (!rec || rec.status !== "at-mercy") return { state, events };
  s.mercy = s.mercy.filter((m) => m !== id);
  if (choice === "execute") {
    const cheat = rec.cheatedDeath < BALANCE.cheatDeathMax && roll(`cheat|${id}`) < BALANCE.cheatDeathBase + BALANCE.cheatDeathPerRank * rec.rank;
    if (cheat) {
      rec.cheatedDeath++;
      rec.status = "presumed-dead";
      rec.restUntil = now + 3 * 24 * 60;
      rec.hate = clamp(rec.hate + 25, 0, BALANCE.hateMax);
      rec.origin = "left-for-dead";
      const scar = scarFor("kinetic", 1, (t) => roll(`${id}|${t}`), now);
      if (scar) rec.scars.push({ ...scar, wound: scar.prosthesis ? scar.wound : `${scar.wound} (a near-fatal wound)` });
      note(rec, now, "Left for dead, but did not die.");
      retitle(rec);
      news(s, now, `${nameOf(rec)} is said to be dead. Some say otherwise.`, rec.lastSeen?.settlementId);
      events.push({ kind: "cheated-death", id, text: `${rec.name} goes still. You leave ${rec.name} for dead.` });
    } else {
      rec.status = "dead";
      note(rec, now, "Killed by the party.");
      s.notoriety = clamp(s.notoriety + BALANCE.notorietyPerNemesisKill, 0, 100);
      news(s, now, `${nameOf(rec)} was killed. The ${rec.gang} are looking for who did it.`, rec.lastSeen?.settlementId);
      events.push({ kind: "dead", id, text: `${nameOf(rec)} is dead.` });
      fillSeat(s, rec, now, events, roll);
      for (const o of Object.values(s.records)) if (o.status !== "dead" && o.id !== id && o.gang === rec.gang && o.personality === "loyal") addHate(o, BALANCE.hatePerComrade);
      for (const rel of kin?.(id) ?? []) {
        const o = s.records[rel.id];
        if (!o || o.status === "dead") continue;
        addHate(o, Math.round(BALANCE.hatePerKin * rel.tie));
        note(o, now, `Swore vengeance for ${rec.name}, of their own blood.`);
        events.push({ kind: "mercy", id: o.id, text: `${nameOf(o)} will not forget what was done to ${rec.name}.` });
      }
    }
  } else if (choice === "spare") {
    rec.spared++;
    rec.status = "resting";
    rec.restUntil = now + BALANCE.restHours * 60;
    rec.origin = "spared";
    if (rec.personality === "proud") {
      addHate(rec, 20);
      events.push({ kind: "mercy", id, text: `${rec.name} spits at your feet. ${tauntOf(rec, "spared")}` });
    } else {
      rec.hate = clamp(rec.hate - 20, 0, BALANCE.hateMax);
      if ((rec.personality === "greedy" || rec.personality === "coward" || rec.personality === "drifter") && roll(`informant|${id}`) < 0.5) rec.informant = true;
      events.push({ kind: "mercy", id, text: `${rec.name} goes. ${tauntOf(rec, "spared")}${rec.informant ? " (They may talk to you later.)" : ""}` });
    }
    note(rec, now, "Spared by the party.");
  } else {
    rec.status = "resting";
    rec.restUntil = now + BALANCE.restHours * 60;
    addFear(rec, 30, s.notoriety);
    addHate(rec, 10);
    const tells = roll(`talk|${id}`) < 1 - TEMPERS[rec.personality].aggression / 160;
    const others = Object.values(s.records).filter((o) => o.id !== id && o.status !== "dead" && !o.known);
    if (tells && others.length) {
      const learned = others.slice(0, 2);
      learned.forEach((o) => (o.known = true));
      events.push({ kind: "mercy", id, text: `${rec.name} talks: ${learned.map((o) => `${nameOf(o)} was last seen ${o.lastSeen?.settlementId ? `near ${o.lastSeen.settlementId}` : "somewhere out there"}`).join("; ")}.` });
    } else {
      events.push({ kind: "mercy", id, text: `${rec.name} says nothing useful.` });
    }
    note(rec, now, "Questioned by the party.");
  }
  retitle(rec);
  return { state: s, events };
}

// When a chief falls the next-highest of the same side takes the chair (and a rank)
function fillSeat(s: NemesisState, fallen: NemesisRecord, at: number, ev: NemesisEvent[], roll: (t: string) => number) {
  const peers = Object.values(s.records).filter((r) => r.gang === fallen.gang && r.id !== fallen.id && r.status !== "dead" && r.status !== "presumed-dead");
  if (!peers.length || !peers.every((p) => p.rank <= fallen.rank)) return;
  const heir = peers.sort((a, b) => b.rank - a.rank || b.hate - a.hate)[0];
  const seat: LeaderSeat = { gang: fallen.gang, fallen: fallen.id, successor: heir.id, at };
  s.seats.push(seat);
  gainXp(heir, BALANCE.rankXpToRise, at, ev);
  note(heir, at, `Took ${fallen.name}'s place.`);
  news(s, at, `${nameOf(heir)} takes up ${fallen.name}'s command of the ${fallen.gang}.`, heir.lastSeen?.settlementId);
  ev.push({ kind: "seat", id: heir.id, text: `${nameOf(heir)} takes ${fallen.name}'s place.` });
  void roll;
}

// ---- Time --------------------------------------------------------------------------------------------------------------------------
// A day passes: grudges cool (the cold and drifting faster than the proud), fear fades, the rested get up, the "dead" who were not may
// show themselves, and nemeses at large gain standing. Call it as the campaign clock moves; it does nothing within a day.
export function tickNemeses(state: NemesisState, now: number): { state: NemesisState; events: NemesisEvent[] } {
  const days = Math.floor((now - state.lastTick) / 1440);
  if (state.lastTick === 0) return { state: { ...state, lastTick: now }, events: [] };
  if (days < 1) return { state, events: [] };
  const { s, roll } = work(state);
  const events: NemesisEvent[] = [];
  s.lastTick += days * 1440;
  s.notoriety = clamp(s.notoriety - BALANCE.notorietyDecayPerDay * days, 0, 100);
  for (const rec of Object.values(s.records)) {
    if (rec.status === "dead") continue;
    const t = TEMPERS[rec.personality];
    // The longer they stew the more hate settles; only the unprovoked cool, and the murderous cool slowest
    if (rec.status !== "at-mercy") rec.hate = clamp(rec.hate - Math.round(t.coolPerDay * days * (tierOf(rec.hate) === "murderous" ? 0.5 : 1)), 0, BALANCE.hateMax);
    rec.fear = clamp(rec.fear - BALANCE.fearDecayPerDay * days, 0, 100);
    if (rec.status === "presumed-dead" && s.lastTick >= rec.restUntil) {
      rec.status = "alive";
      note(rec, s.lastTick, "Was not dead after all.");
      news(s, s.lastTick, `${nameOf(rec)}, thought dead, has been seen alive.`, rec.lastSeen?.settlementId);
      events.push({ kind: "returns", id: rec.id, text: `${nameOf(rec)} was not dead after all.` });
    } else if (rec.status === "resting" && s.lastTick >= rec.restUntil) {
      rec.status = "alive";
    }
    if (rec.status === "alive") gainXp(rec, 5 * days, s.lastTick, events);
    // An unanswered mercy is a death at the party's hand
    if (rec.status === "at-mercy" && !s.mercy.includes(rec.id)) rec.status = "resting";
  }
  // Those left at the party's mercy for days are gone one way or another (stabbed by their own, rescued, bled out)
  for (const id of [...s.mercy]) {
    const rec = s.records[id];
    if (!rec) continue;
    const fate = roll(`mercy-gone|${id}`);
    s.mercy = s.mercy.filter((m) => m !== id);
    if (fate < 0.5) {
      rec.status = "resting";
      rec.restUntil = s.lastTick + BALANCE.restHours * 60;
      rec.hate = clamp(rec.hate + 10, 0, BALANCE.hateMax);
      note(rec, s.lastTick, "Dragged away by their own.");
    } else {
      rec.status = "dead";
      note(rec, s.lastTick, "Died where they were left.");
      fillSeat(s, rec, s.lastTick, events, roll);
    }
  }
  return { state: s, events };
}

// ---- The hunt ----------------------------------------------------------------------------------------------------------------------
export interface HuntContext {
  now: number;
  settlementId?: string;
  // The party's level, and whether the place is a lawless one (they come in the open there; in the law's eye they wait outside)
  level: number;
}
// A nemesis is able to hunt now: awake, grudge deep enough, nerve enough, past the pause since the last hunt
export function canHunt(rec: NemesisRecord, now: number): boolean {
  if (rec.status !== "alive") return false;
  const tier = tierOf(rec.hate);
  if (tier === "none") return false;
  if (intentOf(rec) === "wont-hunt") return false;
  if (intentOf(rec) === "provoked-only" && tier !== "murderous") return false;
  return now >= rec.restUntil && now - rec.huntedAt >= BALANCE.huntCooldownHours[tier] * 60;
}
// Whether one of them finds the party in this place now. The chance grows with hate and with how feared the party is (the vengeful
// come sooner for a name like that), and a fierce one comes more often. Returns the chosen nemesis, if any (state unchanged: call
// `beginHunt` to commit).
export function pickHunter(state: NemesisState, ctx: HuntContext): NemesisRecord | undefined {
  const roll = (tag: string) => unitOf(`${state.seed}|${tag}`);
  const mult = NOTORIETY.ambush[notorietyLevel(state.notoriety)];
  const ready = Object.values(state.records).filter((r) => canHunt(r, ctx.now) && (!r.lastSeen?.settlementId || !ctx.settlementId || r.home === ctx.settlementId || r.lastSeen.settlementId === ctx.settlementId || r.hate >= BALANCE.murderousAt));
  ready.sort((a, b) => b.hate - a.hate || b.rank - a.rank);
  for (const rec of ready) {
    const chance = clamp(BALANCE.huntChance[tierOf(rec.hate)] * mult * (rec.aggression / 50), 0, 0.9);
    if (roll(`hunt|${rec.id}|${ctx.now}`) < chance) return rec;
  }
  return undefined;
}
// The hunt begins: the hunter's clock is noted. (They are still the same record; the fight settles what became of them.)
export function beginHunt(state: NemesisState, id: string, now: number): NemesisState {
  const rec = state.records[id];
  if (!rec) return state;
  const s = structuredClone(state);
  s.records[id].huntedAt = now;
  note(s.records[id], now, "Came for the party.");
  return s;
}
// Rank's gift: more hit points, a better attack and sturdier armor; and a creature that has been through the party's wars is worth more
export function empower(body: Occupant, rank: number, scars = 0): Occupant {
  const hp = Math.round((body.hitPoints ?? 10) * (1 + BALANCE.hpPerRank * rank));
  return {
    ...body,
    hitPoints: hp,
    armorClass: (body.armorClass ?? 10) + Math.floor(rank / 3),
    attack: body.attack ? { ...body.attack, bonus: body.attack.bonus + Math.floor(rank / 2) * BALANCE.attackPerTwoRanks } : body.attack,
    xp: Math.round((body.xp ?? 0) * (1 + 0.5 * rank + 0.1 * scars)),
    count: 1,
    wounds: undefined,
  };
}
// The hunter and their crew as occupants for a fight (the gang ambush's shape): the nemesis first, under their own id
export function huntParty(rec: NemesisRecord, size = 1 + Math.floor(rec.rank / 2)): { gang: Occupant[]; text: string } {
  const lead: Occupant = { ...empower(rec.body, rec.rank, rec.scars.length), id: rec.id, name: nameOf(rec), disposition: "hostile", role: rec.body.role, count: 1 };
  const crew: Occupant[] = Array.from({ length: Math.min(3, size) }, (_, i) => ({ ...rec.body, id: `${rec.id}-c${i}`, name: `${rec.name}'s ${rec.body.name.toLowerCase()}`, count: 1, wounds: undefined, disposition: "hostile" as const }));
  const scars = rec.scars.length ? ` ${rec.name} bears ${rec.scars[rec.scars.length - 1].wound} on the ${rec.scars[rec.scars.length - 1].location}.` : "";
  return { gang: [lead, ...crew], text: `${nameOf(rec)}, ${RANKS[rec.rank].toLowerCase()} of the ${rec.gang}, who ${HOW[rec.origin]}, has found you.${scars} "${tauntOf(rec, "ambush", rec.killedParty + rec.beaten)}"` };
}

// ---- What the people say -----------------------------------------------------------------------------------------------------------
export function rumorsFor(state: NemesisState, settlementId?: string, n = 3): NewsItem[] {
  return state.news.filter((x) => !x.settlementId || !settlementId || x.settlementId === settlementId).slice(-n).reverse();
}
export function describe(rec: NemesisRecord): string {
  const tier = tierOf(rec.hate);
  const parts = [`${RANKS[rec.rank]} of the ${rec.gang}`, `${rec.personality}: ${TEMPERS[rec.personality].blurb}`, tier === "none" ? "no grudge" : `${tier} (${rec.hate})`];
  if (rec.scars.length) parts.push(rec.scars.map((s) => `${s.wound} (${s.location})`).join(", "));
  return parts.join(" · ");
}
export const activeNemeses = (state?: NemesisState) => Object.values(state?.records ?? {}).filter((r) => r.status !== "dead").sort((a, b) => b.rank - a.rank || b.hate - a.hate);
