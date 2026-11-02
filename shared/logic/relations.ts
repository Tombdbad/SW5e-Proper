// People and what the party is to them (2026-10-30; the user: "assign gender to NPCs ... NPCs with the same last name MUST share a race, and become
// family members, interactions with familial NPCs pass on reputation data to other family members (at a reduced rate - rate depends on the strength
// of the family tie) ... levels of friendliness/unfriendliness - as players improve their friendliness with NPCs we unlock more details about their
// character sheet"). Everything here is a labelled HOUSE RULE (the books have no such system); see REVIVAL_NOTES "People and regard".
//
// Pure. What is kept is plain JSON: a person's `gender` and `family` on the Occupant, `World.families` (who is related to whom, made when the world
// is), and the party's `regard` for each person in the campaign's Standing (`factionInfluence.regard`, by occupant id, -100 to 100).
import { ATTITUDES, GIVEN_NAMES, KIN_TIE, type Family, type Gender, type Kin, type Occupant, type Standing, type World } from "./index";
import { findOccupant } from "./contracts";
import { NOTORIETY, TEMPERS, notorietyLevel, rumorsFor, tierOf, type Personality } from "./nemesis";

const hash = (t: string) => Array.from(t).reduce((n, ch) => (Math.imul(n, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;

// ---- Gender
// Worlds made before have none: it is read from the given name (the lists the names are drawn from), else by the id
export function genderOf(o: Pick<Occupant, "id" | "name" | "role" | "gender" | "creature">): Gender {
  if (o.gender) return o.gender;
  if (/droid/i.test(`${o.role} ${o.creature ?? ""} ${o.name}`)) return "other";
  const given = o.name.split(" ")[0];
  for (const g of ["male", "female", "other"] as const) if (GIVEN_NAMES[g].includes(given)) return g;
  return hash(o.id) % 2 ? "female" : "male";
}
export const pronounsOf = (g: Gender) =>
  g === "male" ? { subject: "he", object: "him", possessive: "his" } : g === "female" ? { subject: "she", object: "her", possessive: "her" } : { subject: "they", object: "them", possessive: "their" };

// ---- Families
const familyOfId = (world: World, id: string): Family | undefined => Object.values(world.families ?? {}).find((f) => f.members.some((m) => m.id === id));
const inverse = (k: Kin): Kin => (k === "parent" ? "child" : k === "child" ? "parent" : k);

// What the other one is to this one, if it is a direct tie (a distant relative has none)
function directKin(f: Family, a: string, b: string): Kin | undefined {
  const m = f.members.find((x) => (x.id === b && x.to === a) || (x.id === a && x.to === b));
  if (!m || !m.kin) return undefined;
  return m.id === b ? m.kin : inverse(m.kin);
}

// The strength of the tie between two people, 0 to 1 (0 if they are not of one family): the strongest chain of links, each worth its KIN_TIE
export function tieOf(world: World, a: string, b: string): number {
  const f = familyOfId(world, a);
  if (!f || !f.members.some((m) => m.id === b)) return 0;
  if (a === b) return 1;
  const best = new Map<string, number>([[a, 1]]);
  for (let pass = 0; pass < f.members.length; pass++) {
    let moved = false;
    for (const m of f.members) {
      if (!m.to || !m.kin) continue;
      const t = KIN_TIE[m.kin];
      for (const [x, y] of [[m.id, m.to], [m.to, m.id]]) {
        const v = (best.get(x) ?? 0) * t;
        if (v > (best.get(y) ?? 0) + 1e-9) { best.set(y, v); moved = true; }
      }
    }
    if (!moved) break;
  }
  return best.get(b) ?? 0;
}

export interface Relative { id: string; tie: number; kin?: Kin; name?: string }
// Everyone related to this person, nearest first. `kin` is what they are to this person when it is a direct tie.
export function kinOf(world: World, id: string): Relative[] {
  const f = familyOfId(world, id);
  if (!f) return [];
  return f.members
    .filter((m) => m.id !== id)
    .map((m) => ({ id: m.id, tie: tieOf(world, id, m.id), kin: directKin(f, id, m.id), name: `${m.given} ${f.name}` }))
    .sort((x, y) => y.tie - x.tie);
}
export function kinWord(kin: Kin | undefined, g: Gender): string {
  if (!kin) return "relative";
  const by: Record<Kin, [string, string, string]> = { parent: ["father", "mother", "parent"], child: ["son", "daughter", "child"], sibling: ["brother", "sister", "sibling"], spouse: ["husband", "wife", "spouse"], cousin: ["cousin", "cousin", "cousin"] };
  return by[kin][g === "male" ? 0 : g === "female" ? 1 : 2];
}

// ---- Regard: what a person feels for the party, -100 to 100, and the level it makes (the words of ATTITUDES: hostile ... devoted)
export const regardLevel = (n: number) => Math.max(-4, Math.min(4, Math.trunc(n / 20)));
export const levelName = (level: number) => ATTITUDES[level + 4];
export const regardOf = (standing: Standing | undefined | null, id: string): number => standing?.regard?.[id] ?? 0;
// Where each way of earning it stops: talk makes a person warm at most, trade friendly, only deeds go further (house rule)
export const CAPS = { talk: 25, trade: 45, deed: 100 } as const;
export const CHANGE = { talk: 1, trade: 1, haggleWon: 0, haggleLost: -2, hired: 8, freed: 40, helped: 25, refused: -10, robbed: -40, attacked: -50, killed: -80 } as const;

// One person's regard moved by `amount`; a rise stops at `cap` (never lowering what is higher already), a fall stops at -100
export function bump(standing: Standing, id: string, amount: number, cap = 100): Standing {
  const now = regardOf(standing, id);
  const next = amount >= 0 ? (now >= cap ? now : Math.min(cap, now + amount)) : Math.max(-100, now + amount);
  if (next === now) return standing;
  return { ...standing, regard: { ...(standing.regard ?? {}), [id]: next } };
}

// What the party does to one person, and what their kin hear of it: each relative's regard moves by the amount times the strength of the tie
// (a spouse or a parent hears most of it, a cousin little, and a chain of links less than any one of them). Under one point is not heard.
export function reputation(world: World, standing: Standing, id: string, amount: number, cap = 100): { standing: Standing; heard: { id: string; name?: string; delta: number; kin?: Kin }[] } {
  let next = bump(standing, id, amount, cap);
  const heard: { id: string; name?: string; delta: number; kin?: Kin }[] = [];
  for (const rel of kinOf(world, id)) {
    const delta = Math.round(amount * rel.tie);
    if (!delta) continue;
    const moved = bump(next, rel.id, delta, cap);
    if (moved !== next) heard.push({ id: rel.id, name: rel.name, delta: regardOf(moved, rel.id) - regardOf(next, rel.id), kin: rel.kin });
    next = moved;
  }
  return { standing: next, heard };
}

// ---- The character sheet, as much of it as the person's regard opens
export interface SheetLine { label: string; value: string; level: number }
export const SHEET_LEVELS = [
  { level: 0, what: "who they are" },
  { level: 1, what: "their family, home and what they carry" },
  { level: 2, what: "their body: hit points, armor, speed" },
  { level: 3, what: "how they fight, and their saves" },
  { level: 4, what: "everything: traits, reactions and resistances" },
];

const list = (xs: (string | undefined)[]) => xs.filter(Boolean).join(", ");
export function sheetLines(world: World, o: Occupant): SheetLine[] {
  const g = genderOf(o);
  const out: SheetLine[] = [];
  const add = (level: number, label: string, value?: string | number | null) => {
    if (value !== undefined && value !== null && value !== "") out.push({ level, label, value: String(value) });
  };
  add(0, "Species", o.species);
  add(0, "Gender", g === "other" ? "neither (they)" : g);
  add(0, "Role", o.role);
  const kin = kinOf(world, o.id).slice(0, 5);
  add(1, "Family", o.family ? `${o.family}${kin.length ? ": " + kin.map((k) => `${k.name} (${kinWord(k.kin, genderOf({ id: k.id, name: k.name ?? "", role: "" }))})`).join(", ") : ""}` : "");
  add(1, "Home", o.routine?.home ? world.areas[o.routine.home]?.name : "");
  add(1, "Carries", o.loadout.length ? o.loadout.join(", ") : "");
  add(2, "Hit points", o.hitPoints);
  add(2, "Armor class", o.armorClass);
  add(2, "Speed", o.speed ? `${o.speed} ft.` : "");
  add(2, "Size", list([o.size, o.creature]));
  if (o.attack) add(3, "Attack", `${o.attack.name} +${o.attack.bonus}, ${o.attack.damage}${o.attack.damageType ? " " + o.attack.damageType : ""}`);
  if (o.saves) add(3, "Saves", Object.entries(o.saves).map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${v >= 0 ? "+" : ""}${v}`).join(", "));
  add(3, "Challenge", o.cr ? `${o.cr}${o.xp ? ` (${o.xp} XP)` : ""}` : "");
  const p = o.profile;
  if (p) {
    add(4, "Other attacks", list(p.attacks.map((a) => a.name)));
    add(4, "Traits", list(p.traits.map((t) => t.name)));
    add(4, "Reactions", list(p.reactions.map((r) => r.name)));
    add(4, "Resistances", list([...(p.resistances ?? []), ...(p.immunities ?? []).map((i) => `immune to ${i}`)]));
    add(4, "Weak to", list(p.vulnerabilities ?? []));
  }
  return out;
}

// What this regard shows: the lines it opens, the lines still closed (and at what level), and the next level to reach
export function sheetFor(world: World, o: Occupant, regard: number) {
  const level = Math.max(0, regardLevel(regard));
  const lines = sheetLines(world, o);
  return {
    level,
    attitude: levelName(regardLevel(regard)),
    open: lines.filter((l) => l.level <= level),
    closed: lines.filter((l) => l.level > level),
    next: level < 4 ? { level: level + 1, regard: (level + 1) * 20, opens: SHEET_LEVELS[level + 1].what } : undefined,
  };
}

// The words a person's relatives are known by, for the dialogue prompt and the panel: "their brother Dax Vos"
export function kinLine(world: World, o: Occupant, limit = 3): string {
  return kinOf(world, o.id)
    .filter((k) => k.kin)
    .slice(0, limit)
    .map((k) => `${kinWord(k.kin, genderOf({ id: k.id, name: k.name ?? "", role: "" }))} ${k.name}`)
    .join(", ");
}

// A person by id, wherever they are (for the panels that hold only an id)
export const personById = (world: World, id: string) => findOccupant(world, id)?.occupant;

// ---- Small talk (2026-11-02; the user: "We need NPCs that talk to one another"). Two people of a place who meet exchange a few lines,
// turn about (two to four), chosen by where they are and who they are: an arena's crowd talks of the bouts, a cantina's patrons of drink
// and rumour, a market's of prices, guards of their watch, the rest of the day's news. Flavour only, a labelled HOUSE RULE (the books say
// nothing on it). Pure: the same seed gives the same talk (the map seeds it from the two people and the minute).
export interface TalkLine { who: 0 | 1; text: string }
type Talk = { open: string[]; reply: string[]; more: string[]; close: string[] };
const TALKS: Record<string, Talk> = {
  arena: {
    open: ["Who's your credits on?", "Did you see that last bout?", "They say the next one's a rancor.", "The pit boss is fixing fights again.", "I lost a week's pay on that Gamorrean."],
    reply: ["The Trandoshan, every time.", "Never seen a throw like it.", "A rancor? They'll need a bigger pit.", "Prove it. Then bet on it.", "Should've backed the little one."],
    more: ["The odds board says otherwise.", "Watch the left hand, that's the tell.", "Blood on the sand before sundown.", "I'm doubling my stake."],
    close: ["Here they come!", "Shh, it's starting.", "Your funeral.", "Get me a drink before the bell."],
  },
  cantina: {
    open: ["Another round?", "Heard about the Hutt's shipment?", "That pilot owes me forty credits.", "The band's sharp tonight.", "Keep your voice down."],
    reply: ["On you, this time.", "Spice, they say. Lots of it.", "Get in line.", "They've played that one three times.", "Why, who's listening?"],
    more: ["Customs has been sniffing round the docks.", "Don't look now, bounty hunter by the door.", "I'm out by the next cycle.", "Word is the Empire pays well for names."],
    close: ["Drink up.", "Not here. Later.", "I'll take my chances.", "Watch your back."],
  },
  market: {
    open: ["Prices are up again.", "Fresh in from the Outer Rim, he says.", "Have you tried the stall by the gate?", "My power cells died after a week.", "Looking for anything?"],
    reply: ["Everything is, these days.", "And I'm a Jedi.", "Overpriced, but it works.", "You get what you pay for.", "Just looking."],
    more: ["The haulers are late from the spaceport.", "He'll knock off ten if you smile.", "The tech shop has the good stuff.", "Mind your pockets in this crowd."],
    close: ["Good luck with it.", "See you round.", "I'll think about it.", "Safe travels."],
  },
  guard: {
    open: ["Quiet shift.", "Anything on the scanners?", "The captain wants a report.", "My feet are killing me.", "Did you hear that?"],
    reply: ["Too quiet.", "Static. As usual.", "When doesn't he?", "Two more hours.", "Probably a womp rat."],
    more: ["Keep your blaster handy.", "Somebody tripped the alarm last night.", "Double the watch after dark.", "Smugglers again, I'd wager."],
    close: ["Stay sharp.", "Back to it.", "Eyes open.", "Carry on."],
  },
  any: {
    open: ["Busy day.", "Any news from the spaceport?", "Hot one today.", "You look tired.", "Heard the rumours?"],
    reply: ["Isn't it always?", "Ships in, ships out.", "Could be worse.", "Long week.", "Which ones?"],
    more: ["My cousin's got work going, if you're looking.", "The governor's in a mood, they say.", "Saw a ship come down hard past the ridge.", "Prices, taxes, patrols. Same as ever."],
    close: ["Take care.", "See you around.", "Back to work.", "Stay out of trouble."],
  },
};
export function talkPlace(buildingType: string, roomName: string, roles: string[]): string {
  if (/arena/.test(buildingType) || /arena|betting|sign-up/i.test(roomName)) return "arena";
  if (roles.every((r) => /guard|officer|trooper|sentry/i.test(r))) return "guard";
  if (/cantina|gambling hall|cookshop|rooming house/.test(buildingType) || /bar|booth|dance|gaming/i.test(roomName)) return "cantina";
  if (/market|general store|armsmith|tech shop|apothecary|outfitter|curio shop|pawnshop/.test(buildingType) || /stall|market|sales floor/i.test(roomName)) return "market";
  return "any";
}
// The scene the local model is given for two people talking (server/dialogue.ts /api/chatter, which makes the lines; the stock lines
// above are said only when the model is not running): where they are, the hour, and what people there talk of
const TALK_TOPICS: Record<string, string> = {
  arena: "the bouts, the fighters and the bets",
  cantina: "drink, rumours, deals and who is in tonight",
  market: "prices, goods and the traders",
  guard: "their watch, orders and trouble in the town",
  street: "the day's news, work, family and the town",
  any: "the day's news and their work",
};
export function chatScene(place: string, where: string[], minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const time = hour < 5 ? "late at night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  return `${where.filter(Boolean).join(", ")}, ${time}. Two locals talk of ${TALK_TOPICS[place] ?? TALK_TOPICS.any}.`;
}
export function smallTalk(place: string, seed: number): TalkLine[] {
  const t = TALKS[place] ?? TALKS.any;
  const pick = (list: string[], salt: number) => list[hash(`${seed}|${salt}`) % list.length];
  const length = 2 + (hash(`${seed}|n`) % 3);
  const out: TalkLine[] = [{ who: 0, text: pick(t.open, 1) }];
  // (a reply goes with its opener where the lists line up, else any)
  const at = t.open.indexOf(out[0].text);
  out.push({ who: 1, text: at >= 0 && at < t.reply.length && hash(`${seed}|r`) % 3 ? t.reply[at] : pick(t.reply, 2) });
  if (length >= 3) out.push({ who: 0, text: pick(t.more, 3) });
  if (length >= 4) out.push({ who: 1, text: pick(t.close, 4) });
  return out;
}

// ---- Between the people of the world (2026-11-02; the user: "they should also have their own reputation/relationships (use our existing ...
// nemesis system), which impact their dialogue content"). HOUSE RULE, flavour for the local model that voices them (server/dialogue.ts): nothing
// rolls on it. Each person has a nature, one of the nemesis system's personalities (a nemesis their own, anyone else by their id), with its
// temper; two people have a bond, -100 to 100, read the same way as the party's regard and a nemesis's hate: kin by their family tie (now and
// then a family at odds), anyone else by a shared past drawn from the pair, pulled by both natures (two hotheads or two proud ones clash, the
// loyal hold to people, a drifter cares little either way). Below zero it is a grudge of the nemesis tiers (resentful, vengeful, murderous),
// with a reason. What they know of the party is their own regard for it, a relative who is a nemesis of the party, the party's notoriety and
// the news of its nemeses in that settlement. All of it is worked out when asked, from the world, so older worlds have it too.
const NATURES = Object.keys(TEMPERS) as Personality[];
export function natureOf(world: World, o: Pick<Occupant, "id">): Personality {
  return world.nemeses?.records[o.id]?.personality ?? NATURES[hash(`${o.id}|nature`) % NATURES.length];
}
// How each nature leans when it thinks of someone, and what a pair of the same does
// (the same natures in everyday life, for someone who is not a fighter)
const NATURE_WORDS: Record<Personality, string> = { hothead: "quick to anger and loud about it", coward: "timid; keeps out of trouble", proud: "touchy about their honour", cold: "reserved; says little and misses nothing", greedy: "always after a credit", loyal: "stands by friends and family", drifter: "easy-going; never stays anywhere long" };
const LEAN: Record<Personality, number> = { hothead: -10, coward: 2, proud: -8, cold: -6, greedy: -4, loyal: 10, drifter: 0 };
const GRUDGES = ["owes you credits and keeps putting it off", "cheated you at sabacc", "said something about your family you have not forgotten", "took a job that should have been yours", "talked to the law about your cousin", "sold you a power cell that died in a week"];
const FRIENDSHIPS = ["an old friend from before the war", "drinks with you most nights", "helped you through a bad season", "works the same shift as you", "grew up on the same street", "lent you credits once and never asked twice"];
const FEUDS = ["a quarrel over an inheritance", "a marriage the family never forgave", "an old debt between you"];
export interface Bond { score: number; kin?: Kin; tie: number; text: string }
export function bondOf(world: World, a: Pick<Occupant, "id" | "name">, b: Pick<Occupant, "id" | "name" | "gender" | "role" | "creature">): Bond {
  const pair = [a.id, b.id].sort().join("|");
  const unit = (salt: string) => (hash(`${pair}|${salt}`) % 10000) / 10000;
  const tie = tieOf(world, a.id, b.id);
  const kin = tie ? kinOf(world, a.id).find((k) => k.id === b.id)?.kin : undefined;
  const na = natureOf(world, a);
  const nb = natureOf(world, b);
  const word = tie ? (kin ? `your ${kinWord(kin, genderOf(b))}` : "a relative of yours") : "";
  if (tie) {
    const feud = unit("feud") < 0.15;
    const score = feud ? -20 - Math.round(unit("depth") * 40) : Math.round(40 + tie * 50 + LEAN[na] / 2);
    return { score, kin, tie, text: feud ? `${word}, but you are at odds over ${FEUDS[hash(`${pair}|why`) % FEUDS.length]}` : `${word}${score >= 70 ? ", and you are close" : ""}` };
  }
  let score = (unit("past") - 0.5) * 110 + LEAN[na];
  if (na === nb && (na === "hothead" || na === "proud")) score -= 15;
  if (na === "loyal" && nb === "loyal") score += 10;
  if (na === "drifter") score *= 0.6;
  score = Math.round(Math.max(-100, Math.min(100, score)));
  const tier = tierOf(-score);
  const text = score >= 60 ? `a close friend: ${FRIENDSHIPS[hash(`${pair}|why`) % FRIENDSHIPS.length]}`
    : score >= 30 ? `a friend: ${FRIENDSHIPS[hash(`${pair}|why`) % FRIENDSHIPS.length]}`
    : score >= 10 ? "someone you get on with"
    : tier === "none" ? "someone you know by sight"
    : tier === "resentful" ? `someone you resent: they ${GRUDGES[hash(`${pair}|why`) % GRUDGES.length]}`
    : tier === "vengeful" ? `someone you bear a deep grudge against: they ${GRUDGES[hash(`${pair}|why`) % GRUDGES.length]}`
    : `someone you hate: they ${GRUDGES[hash(`${pair}|why`) % GRUDGES.length]}`;
  return { score, tie: 0, text };
}
// The party as one person sees it: their regard, a relative of theirs the party made a nemesis of, and the party's name in the town
export function partyViewOf(world: World, standing: Standing | null | undefined, o: Pick<Occupant, "id">, party: string, withRegard = true): string {
  const level = regardLevel(regardOf(standing, o.id));
  const records = world.nemeses?.records ?? {};
  const grudge = kinOf(world, o.id).find((k) => records[k.id] && records[k.id].status !== "dead" && tierOf(records[k.id].hate) !== "none");
  const dead = kinOf(world, o.id).find((k) => records[k.id]?.status === "dead");
  return [
    level && withRegard ? `You are ${levelName(level)} towards ${party}.` : "",
    grudge ? `Your ${kinWord(grudge.kin, genderOf({ id: grudge.id, name: grudge.name ?? "", role: "" }))} ${grudge.name} is ${tierOf(records[grudge.id].hate)} against ${party}.` : "",
    dead ? `${party} killed your ${kinWord(dead.kin, genderOf({ id: dead.id, name: dead.name ?? "", role: "" }))} ${dead.name}.` : "",
  ].filter(Boolean).join(" ");
}
// What the town says of the party: how feared it is, and the latest news of its nemeses here
export function townTalk(world: World, party: string, settlementId?: string): string {
  const state = world.nemeses;
  if (!state) return "";
  const level = notorietyLevel(state.notoriety);
  const news = rumorsFor(state, settlementId, 2).map((n) => n.text);
  return [level ? `${party}, an outsider with a party of their own, is known here as a ${NOTORIETY.names[level].toLowerCase()}.` : "", ...news].filter(Boolean).join(" ");
}
// One person's card for talk: their nature and their view of the party (`notes`; `withRegard` false where the card says it already, as the
// party's own talk with them does), and, talking to someone, who that person is to them (`bond`)
export function talkNotes(world: World, standing: Standing | null | undefined, o: Pick<Occupant, "id">, party: string, withRegard = true): string {
  const nature = natureOf(world, o);
  return [`By nature ${nature}: ${world.nemeses?.records[o.id] ? TEMPERS[nature].blurb : NATURE_WORDS[nature]}.`, partyViewOf(world, standing, o, party, withRegard)].filter(Boolean).join(" ");
}
