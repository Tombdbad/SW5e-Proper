// People and what the party is to them (2026-10-30; the user: "assign gender to NPCs ... NPCs with the same last name MUST share a race, and become
// family members, interactions with familial NPCs pass on reputation data to other family members (at a reduced rate - rate depends on the strength
// of the family tie) ... levels of friendliness/unfriendliness - as players improve their friendliness with NPCs we unlock more details about their
// character sheet"). Everything here is a labelled HOUSE RULE (the books have no such system); see REVIVAL_NOTES "People and regard".
//
// Pure. What is kept is plain JSON: a person's `gender` and `family` on the Occupant, `World.families` (who is related to whom, made when the world
// is), and the party's `regard` for each person in the campaign's Standing (`factionInfluence.regard`, by occupant id, -100 to 100).
import { ATTITUDES, GIVEN_NAMES, KIN_TIE, type Family, type Gender, type Kin, type Occupant, type Standing, type World } from "./index";
import { findOccupant } from "./contracts";

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
