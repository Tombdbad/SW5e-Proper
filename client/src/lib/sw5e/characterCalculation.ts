// Character calculation: what a character's features do to its numbers, and what gaining a level
// gives. Everything is read from the rules data through the views in this folder.
import advancement from "@shared/data/sw5e/characterAdvancement.json";
import {
  getAbilityModifier,
  calculateProficiencyBonus,
  calculatePowerPoints,
  calculatePowersKnown,
  calculateMaxPowerLevel,
  calculateArmorClass,
  hasWeaponProficiency,
  weaponListCovers,
} from "./rules";
import { classes, getClassById, getClassLevelValue, getPowerProgression, type SW5EClass } from "./classes";
import classData from "@shared/data/sw5e/classes.json";
import { getSpeciesById } from "./species";
import { archetypes, type ClassArchetype } from "./archetypes";
import { findFeatByName, type Feat } from "./feats";
import { forcePowers } from "./forcePowers";
import { techPowers } from "./techPowers";
import { equipment } from "./equipment";
import type { Gear, GearItem } from "@/components/Map/interiors/gear";
import { itemRef } from "@/components/Map/interiors/items";
import { SKILLS } from "./constants";
import { maneuvers as maneuverList, type Maneuver } from "./maneuvers";
import { fightingStyles } from "./fightingStyles";
import { conditions as conditionRows } from "./conditions";
import lookups from "@shared/data/sw5e/lookups.json";
import { scoresWith, sumEffects, weaponTraining, powerTraining, powerGate, powerSchool, MASTERY_ATTACK, type ItemFacts, type ItemEffects, type PowerBonus, type WeaponKind } from "@shared/logic";
import { opticOf } from "@shared/logic/shooter";

export const ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const isAbility = (name: string) => (ABILITIES as readonly string[]).includes(name);
const featName = (feat: any): string => (typeof feat === "string" ? feat : feat?.name ?? "");
const union = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]));

// ---------------------------------------------------------------------------------------------
// Features: species traits, class and archetype features up to the character's level, feats
// ---------------------------------------------------------------------------------------------

export interface Feature {
  name: string;
  description: string;
  // Where it comes from: the species, class or archetype name, or "Feat"
  source: string;
  level?: number;
  // The class a class or archetype feature belongs to (its level is the level in that class)
  classId?: string;
}

// An archetype of a class, saved by id (a name is accepted too)
const archetypeOf = (classId: string | undefined, wanted: unknown): ClassArchetype | undefined => {
  const name = String(wanted ?? "").toLowerCase();
  if (!name || !classId) return undefined;
  return archetypes.filter((a) => a.parentClass === String(classId).toLowerCase()).find((a) => a.id === name || a.name.toLowerCase() === name);
};

// The character's archetype in its first class (saved in `subclass`)
export function findArchetype(character: any): ClassArchetype | undefined {
  return archetypeOf(character?.class, character?.subclass);
}

// ---------------------------------------------------------------------------------------------
// Multiclassing (Player's Handbook, Customization Options: Multiclassing). The tables are read
// from the book's text by the importer (lookups.multiclassing): prerequisites, the proficiencies
// a class gives one who enters it later, the Multiclass Max Power Level table, and the features
// gained only once. The first class is saved in `class` and `subclass`; the classes taken after
// it in `multiclass`, in the order taken; `level` is the character level, the sum of them all.
// ---------------------------------------------------------------------------------------------

interface MulticlassRules {
  prerequisites: Record<string, { any: string[]; min: number }[]>;
  proficiencies: Record<string, string[]>;
  maxPowerLevel: number[];
  onceOnly: string[];
  noStacking: string[];
}
export const MULTICLASS: MulticlassRules = (lookups as any).multiclassing;

// A class taken after the first, as saved: its level, its archetype, and the skill and tool its
// multiclass proficiencies let the player choose
export interface MulticlassEntry {
  class: string;
  level: number;
  subclass?: string;
  skills?: string[];
  tools?: string[];
}

export interface ClassLevel {
  klass: SW5EClass;
  level: number;
  archetype?: ClassArchetype;
  first: boolean;
}

export const multiclassOf = (character: any): MulticlassEntry[] =>
  (Array.isArray(character?.multiclass) ? character.multiclass : []).filter(
    (e: any, i: number, all: any[]) => e && getClassById(e.class) && e.class !== character?.class && Number(e.level) > 0 && all.findIndex((x) => x?.class === e.class) === i,
  );

// Each class the character has, with its level in that class: the first class has what the
// character level leaves after the others
export function classLevels(character: any): ClassLevel[] {
  const total = Math.max(1, Number(character?.level) || 1);
  const others: ClassLevel[] = multiclassOf(character).map((e) => ({ klass: getClassById(e.class)!, level: Math.floor(Number(e.level)), archetype: archetypeOf(e.class, e.subclass), first: false }));
  const first = getClassById(character?.class);
  const firstLevel = Math.max(1, total - others.reduce((n, e) => n + e.level, 0));
  return [...(first ? [{ klass: first, level: firstLevel, archetype: findArchetype(character), first: true }] : []), ...others];
}

export const isMulticlass = (character: any): boolean => multiclassOf(character).length > 0;

// The character's level in a class (0 when it has none)
export const levelInClass = (character: any, classId: string | undefined): number => classLevels(character).find((e) => e.klass.id === classId)?.level ?? 0;

// One of the character's classes as if it were single-classed at its level in that class: for
// reading that class's own table (its powers known, its columns), never for the proficiency bonus
export const asClass = (character: any, entry: ClassLevel): any => ({ ...character, class: entry.klass.id, level: entry.level, subclass: entry.archetype?.id, multiclass: [] });

// "Fighter 4 (Champion) / Operative 1", or "Fighter (Champion)" for a single class
export function classSummary(character: any, withLevels = isMulticlass(character)): string {
  return classLevels(character)
    .map((e) => `${e.klass.name}${withLevels ? ` ${e.level}` : ""}${e.archetype ? ` (${e.archetype.name})` : ""}`)
    .join(" / ") || String(character?.class ?? "");
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The ability scores a class asks of one who enters it or leaves it, unmet: "Strength or Dexterity 13"
export function multiclassPrerequisiteUnmet(classId: string, scores: Record<string, number> = {}): string | null {
  const unmet = (MULTICLASS.prerequisites[classId] ?? []).filter((g) => !g.any.some((a) => (scores[a] ?? 10) >= g.min));
  return unmet.length ? unmet.map((g) => `${g.any.map(capital).join(" or ")} ${g.min}`).join(", ") : null;
}

// The classes a character can take its next level in: a class it has, or a new one when it meets
// the prerequisites of both every class it has and the new one ("Prerequisites")
export interface ClassChoice {
  klass: SW5EClass;
  // The level in the class now (0 for a class not yet taken)
  level: number;
  unmet: string[];
}
export function classChoices(character: any): ClassChoice[] {
  const have = classLevels(character);
  const scores = character?.abilityScores ?? {};
  const leaving = have
    .map((e) => ({ name: e.klass.name, unmet: multiclassPrerequisiteUnmet(e.klass.id, scores) }))
    .filter((x) => x.unmet)
    .map((x) => `${x.name} (to leave it): ${x.unmet}`);
  return classes.map((klass) => {
    const level = have.find((e) => e.klass.id === klass.id)?.level ?? 0;
    if (level) return { klass, level, unmet: [] };
    const own = multiclassPrerequisiteUnmet(klass.id, scores);
    return { klass, level, unmet: [...leaving, ...(own ? [`${klass.name}: ${own}`] : [])] };
  });
}

// The proficiencies entering a class later gives ("Multiclassing Proficiencies"): armor and
// weapons outright, and the skills and tools the player chooses
export interface MulticlassProficiencies {
  armor: string[];
  weapons: string[];
  // How many skills, and from which list (every skill for "any one skill")
  skills: { count: number; from: string[] };
  tools: { count: number; from: string[] };
}
export function multiclassProficiencies(classId: string): MulticlassProficiencies {
  const klass = getClassById(classId);
  const out: MulticlassProficiencies = { armor: [], weapons: [], skills: { count: 0, from: [] }, tools: { count: 0, from: [] } };
  for (const item of MULTICLASS.proficiencies[classId] ?? []) {
    const text = item.trim();
    const skill = text.match(/^(\w+) skills? from the class's (?:skill )?list$/i) ?? text.match(/^any (\w+) skills?$/i);
    const tool = text.match(/^(\w+) tools? from the class's list$/i);
    if (skill) out.skills = { count: wordNumber(skill[1]), from: /^any/i.test(text) ? SKILLS.map((s) => s.name) : klass?.skillChoices ?? [] };
    else if (tool) out.tools = { count: wordNumber(tool[1]), from: classToolList(classId) };
    else if (/\barmor$/i.test(text)) out.armor.push(capital(text));
    else out.weapons.push(text);
  }
  return out;
}

// A class's tool list as the importer has it ("Tinker's implements", "one of your choice", "One
// specialist's kit of your choice", "Any one"): the named tools, and every tool where it leaves the
// choice open (a specialist's kit where it says so)
function classToolList(classId: string): string[] {
  const row = (classData as any[]).find((c) => c.id === classId);
  const listed: string[] = (row?.toolProficienciesList ?? []).filter((t: string) => !/^none$/i.test(t));
  const named = listed.filter((t) => !/of your choice|^any\b/i.test(t));
  const open = listed.filter((t) => /of your choice|^any\b/i.test(t));
  const tools = equipment.filter((e) => e.category === "Tool");
  const kits = open.some((t) => /specialist's kit/i.test(t)) ? tools.filter((t) => t.kind === "Kit") : open.length ? tools : [];
  return Array.from(new Set([...named, ...kits.map((t) => t.name)]));
}

// Weapons a character is proficient with through its classes: the first class's full list, and
// what each class taken after it gives ("Light armor, all vibroweapons"; the monk's "Techblades")
export function classWeaponProficient(character: any, weapon: { name?: string; weaponClassification?: string; properties?: string[] }): boolean {
  return classLevels(character).some((e) => (e.first ? hasWeaponProficiency(e.klass.id, weapon) : weaponListCovers(multiclassProficiencies(e.klass.id).weapons, weapon)));
}

// The Hit Dice of every class, kept apart by size ("five d10 Hit Dice and five d8 Hit Dice"), largest first
export function hitDicePool(character: any): { die: number; count: number }[] {
  const bySize = new Map<number, number>();
  for (const e of classLevels(character)) bySize.set(e.klass.hitDie, (bySize.get(e.klass.hitDie) ?? 0) + e.level);
  if (!bySize.size) bySize.set(8, Math.max(1, Number(character?.level) || 1));
  return Array.from(bySize.entries()).map(([die, count]) => ({ die, count })).sort((a, b) => b.die - a.die);
}

// The die the next Hit Die spent rolls. House rule ("Multiclass Hit Dice", Play rules): the
// largest dice are spent first, since the app keeps only how many have been spent
export function nextHitDie(character: any, used = Number(character?.hitDiceUsed) || 0): number | null {
  let left = used;
  for (const { die, count } of hitDicePool(character)) {
    if (left < count) return die;
    left -= count;
  }
  return null;
}

// "d10 x5, d8 x5"; "d8" for a single size
export const hitDiceLabel = (character: any): string => {
  const pool = hitDicePool(character);
  return pool.length === 1 ? `d${pool[0].die}` : pool.map((p) => `${p.count}d${p.die}`).join(" + ");
};

export function characterFeatures(character: any): Feature[] {
  const species = getSpeciesById(character?.species);
  const taken = (character?.feats ?? []).map((feat: any) => findFeatByName(featName(feat))).filter(Boolean) as Feat[];
  // "If you already have the Unarmored Defense feature, you can't gain it again from another class"
  const holder = new Map<string, string>();
  const once = (f: Feature) => {
    if (!MULTICLASS.onceOnly.includes(f.name)) return true;
    const had = holder.get(f.name);
    if (had && had !== f.classId) return false;
    holder.set(f.name, f.classId!);
    return true;
  };
  const fromClasses = classLevels(character).flatMap((e) => [
    ...e.klass.features.filter((f) => f.level <= e.level).map((f) => ({ ...f, source: e.klass.name, classId: e.klass.id })),
    ...(e.archetype?.features ?? []).filter((f) => f.level <= e.level).map((f) => ({ ...f, source: e.archetype!.name, classId: e.klass.id })),
  ]);
  return [
    ...(species?.traits ?? []).map((t) => ({ name: t.name, description: t.description, source: species!.name })),
    ...fromClasses.filter(once),
    ...taken.map((f) => ({ name: f.name, description: f.description, source: "Feat" })),
  ];
}

// Haggling is a Charisma (Persuasion) check to barter or trade. Read from the features' own words:
// advantage where one grants it for bartering or trading (the Haggler feat), expertise where one
// treats you as having it for haggling (the Business Savvy of Squibs and Toydarians)
export function hagglingEdge(features: Feature[]): { advantage?: string; expertise?: string } {
  const advantage = features.find((f) => /advantage on Charisma \(Persuasion\)[^.]*\b(barter|trade|haggl)/i.test(f.description));
  const expertise = features.find((f) => /\b(haggl|barter)[^.]*\bexpertise\b|\bexpertise\b[^.]*\b(haggl|barter)/i.test(f.description));
  return { advantage: advantage?.name, expertise: expertise?.name };
}

// ---------------------------------------------------------------------------------------------
// What the features do, where the books word it the same way every time
// ---------------------------------------------------------------------------------------------

export interface FeatureEffects {
  // Armor class formulas: the base, the abilities added (the best of each group), and whether a
  // shield may be carried with it
  armor: { base: number; abilities: string[][]; shield: boolean; source: string }[];
  // Unarmed strikes that roll a die instead of dealing 1 + Strength
  unarmed?: { dice: string; damageType: string; source: string };
  skills: string[];
  saves: string[];
  hitPointsPerLevel: number;
  speed: number;
  // Speed gained only without armor (the Monk's Unarmored Movement)
  unarmoredSpeed: number;
}

export function featureEffects(features: Feature[], character: { class?: string; level?: number; multiclass?: unknown } = {}): FeatureEffects {
  const effects: FeatureEffects = { armor: [], skills: [], saves: [], hitPointsPerLevel: 0, speed: 0, unarmoredSpeed: 0 };
  const dieSize = (dice: string) => Number(dice.split("d")[1]) || 0;

  for (const feature of features) {
    const text = feature.description ?? "";

    // "While you are unarmored or wearing light armor, your AC is 12 + your Dexterity modifier"
    // "... your AC equals 10 + your Dexterity modifier + your Wisdom or Charisma modifier"
    for (const m of text.matchAll(/([^.\n]*)(?:AC|Armor Class) (?:is|equals) (\d+) \+ your (\w+) modifier((?: \+ your \w+(?: or \w+)? modifier)*)/gi)) {
      const more = Array.from(m[4].matchAll(/your (\w+)(?: or (\w+))? modifier/gi)).map((g) => [g[1], g[2]].filter(Boolean).map((a) => a.toLowerCase()));
      const abilities = [[m[3].toLowerCase()], ...more].filter((group) => group.every(isAbility));
      if (!effects.armor.some((a) => a.source === feature.name)) {
        effects.armor.push({ base: Number(m[2]), abilities, shield: !/shield/i.test(m[1]), source: feature.name });
      }
    }

    // "Your unarmed strikes deal 1d4 kinetic damage"
    const unarmed = text.match(/your unarmed strikes? deals? (\d+d\d+) (\w+) damage/i);
    if (unarmed && dieSize(unarmed[1]) > dieSize(effects.unarmed?.dice ?? "")) {
      effects.unarmed = { dice: unarmed[1], damageType: unarmed[2].toLowerCase(), source: feature.name };
    }

    // "You are proficient in the Insight and Deception skills"
    for (const m of text.matchAll(/You (?:have|gain|are) proficien(?:cy|t) (?:in|with) (?:the )?((?:[A-Z][a-z]+(?: [A-Z][a-z]+)*(?:, and |, | and )?)+) skills?/g)) {
      const names = m[1].split(/, and |, | and /).filter((name) => SKILLS.some((skill) => skill.name === name));
      effects.skills = union(effects.skills, names);
    }

    // "You gain proficiency in Wisdom saving throws", "proficiency in all saving throws"
    for (const m of text.matchAll(/proficiency in (\w+) saving throws/gi)) {
      const ability = m[1].toLowerCase();
      effects.saves = union(effects.saves, ability === "all" ? [...ABILITIES] : isAbility(ability) ? [ability] : []);
    }

    // "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level"
    // "... increases by an amount equal to twice your level ..."
    const perLevel = text.match(/hit point maximum increases by \d+, and it increases by (\d+) (?:again )?(?:every time|whenever) you gain a level/i);
    if (perLevel) effects.hitPointsPerLevel += Number(perLevel[1]);
    if (/hit point maximum increases by an amount equal to twice your level/i.test(text)) effects.hitPointsPerLevel += 2;

    // "- Your speed increases by 10 feet" with nothing after it: no condition attached
    const speed = text.match(/^-? ?Your (?:walking )?speed increases by (\d+) feet\.?\s*$/im);
    if (speed) effects.speed += Number(speed[1]);
  }

  // The Monk's class table: the Martial Arts die and Unarmored Movement, at the level in the class
  // the feature comes from
  const column = (f: Feature | undefined, name: string): number => {
    const classId = f?.classId ?? character.class;
    if (!f || !classId) return 0;
    const level = f.classId ? levelInClass(character, f.classId) || Number(character.level) || 1 : Number(character.level) || 1;
    return getClassLevelValue(classId, level, name);
  };
  const martial = column(features.find((f) => f.name === "Martial Arts"), "Martial Arts");
  if (martial > dieSize(effects.unarmed?.dice ?? "")) effects.unarmed = { dice: `1d${martial}`, damageType: "kinetic", source: "Martial Arts" };
  const movement = features.find((f) => f.name === "Unarmored Movement");
  if (movement) effects.unarmoredSpeed = column(movement, "Unarmored Movement");
  return effects;
}

// ---------------------------------------------------------------------------------------------
// Features in a fight: when each is used, how often, and what it does where the wording is regular
// ---------------------------------------------------------------------------------------------

// A number of hit points or damage: dice and a flat part ("1d10 + your fighter level")
export interface Amount {
  dice?: string;
  flat: number;
}

// What a feature's text can be resolved to. Everything is read from the text and the class table;
// a feature with none of the effects below is only tracked (its uses) and described.
export interface CombatFeature {
  // Stable id for the uses a rest gives back: the feature's source and name
  key: string;
  // The feature whose uses this option shares (Channel the Force's Cause Harm and Lend Aid)
  pool: string;
  name: string;
  source: string;
  level: number;
  text: string;
  activation: "action" | "bonus" | "reaction" | "free" | "passive";
  uses?: { max: number; recharge: "short" | "long" };
  // Power points (force or tech) or focus points spent when it is used; `perDie` for a number of
  // dice bought one point each, up to `upTo`
  cost?: { pool: "power" | "focus" | "die"; points: number; kind?: "force" | "tech" };
  // The attacks the Attack action makes (Extra Attack), an extra action (Action Surge)
  attacksPerAction?: number;
  extraAction?: boolean;
  // A state entered at will (a rage): the bonus to damage with melee Strength attacks, resistances
  stance?: { label: string; damage: number; resist: string[] };
  heal?: { amount: Amount; target: "self" | "touch" };
  // Standard actions that can be taken as a bonus action (Cunning Action)
  actions?: string[];
  // An attack made as a bonus action after what is named (the Attack action, Dodge, a cast power)
  bonusAttack?: { after: string[]; unarmed: boolean };
  // Extra damage on a hit: dice, once a turn, only with advantage or an enemy of the target next to it
  extraDamage?: { dice: string; oncePerTurn: boolean; needs: "advantage" | "none"; weapon: "finesse" | "melee" | "any"; perPoint?: boolean; maxDice?: number };
  // A reaction that cuts damage taken: by an amount, by half; against which attacks
  reduce?: { amount?: Amount; halve?: boolean; against: "melee" | "ranged" | "any" };
  // A reaction that adds to Armor Class against the attack that hit
  acBonus?: Amount;
  // Extra weapon dice on a critical hit
  critDice?: number;
  evasion?: boolean;
  // Attacks recklessly: advantage on one's own melee Strength attacks, and against oneself, until the next turn
  reckless?: boolean;
  // Advantage on saving throws of these abilities against effects (powers, traps, grenades)
  saveAdvantage?: string[];
  initiativeAdvantage?: boolean;
  // A die rolled and added to Armor Class against an attack (Deflection)
  acDie?: string;
  // Marks a creature (Ranger's Quarry); the extra damage is for the marked one only
  marks?: boolean;
  // Points regained at the end of a short rest (Force Recovery): force or tech
  onRest?: { points: Amount; kind: "force" | "tech" };
  // A fighting style's standing effects: no disadvantage on ranged attacks next to an enemy, the
  // ability modifier on the off hand's damage, damage dice that cannot roll below the threshold
  noCloseRangedPenalty?: boolean;
  offhandModifier?: boolean;
  minRoll?: { weapon: "twoHanded" | "blaster" | "any" };
  // A maneuver: when it is used (on the attack roll, on a hit, or as its own action), what it adds
  // to damage, the saving throw that comes with it, hit points it gives, and the die's modifier
  maneuver?: {
    timing: "attack" | "hit" | "use";
    damage: boolean;
    damageType?: string;
    save?: { ability: string; conditions: string[]; dc: number };
    heal?: "hp" | "temp";
    modifier: number;
    // Superiority die size for the pool
    die: number;
  };
  // An effect that makes a creature save: damage on a failed save, half on a success
  save?: { ability: string; dc: number; damage: Amount; type: string; range: number };
  // Dice named in the text that nothing applies for the player, so that they can be rolled by hand
  rolls: string[];
  // Whether the app resolves it (some effect above), or only tracks and describes it
  automated: boolean;
}

export interface FeatureContext {
  // The level in the class the feature comes from ("your consular level", a use gained at 5th level)
  level: number;
  // The character level, for the proficiency bonus and "your level" (the class level when absent)
  totalLevel?: number;
  scores: Record<string, number>;
  className?: string;
  // A cell of the class table at this level, as printed
  column: (name: string) => string;
}

const ORDINAL = /(\d+)(?:st|nd|rd|th)/;
const wordNumber = (word: string): number => ({ once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 } as Record<string, number>)[word.toLowerCase()] ?? (Number(word) || 0);

// "1d10 + your fighter level", "half your consular level + your Wisdom or Charisma modifier
// (your choice, minimum of one)", "1d10 + your Dexterity modifier + your monk level"
export function evalAmount(expression: string, ctx: FeatureContext): Amount | null {
  const text = expression.replace(/\s*\([^)]*\)/g, (m) => (/minimum of/i.test(m) ? ` ${m}` : "")).trim();
  const minimum = /minimum of (?:\+?(\d+)|one)/i.test(text) ? Number(text.match(/minimum of \+?(\d+)/i)?.[1] ?? 1) : 0;
  const terms = text.replace(/\(.*?\)/g, "").split(/\s*\+\s*/).filter(Boolean);
  const dice: string[] = [];
  let flat = 0;
  const ability = (name: string) => Math.floor(((ctx.scores[name.toLowerCase()] ?? 10) - 10) / 2);
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d+d\d+)$/))) dice.push(m[1]);
    else if ((m = t.match(/^(\d+)$/))) flat += Number(m[1]);
    else if ((m = t.match(/^(half )?your (?:([a-z' -]+) )?level$/))) {
      // "your fighter level" is the level in that class; "your level" the character level
      const n = m[2] && m[2] !== "character" ? ctx.level : ctx.totalLevel ?? ctx.level;
      flat += m[1] ? Math.floor(n / 2) : n;
    } else if ((m = t.match(/^your proficiency bonus$/))) flat += calculateProficiencyBonus(ctx.totalLevel ?? ctx.level);
    else if ((m = t.match(/^your ((?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?: or (?:strength|dexterity|constitution|intelligence|wisdom|charisma))*) modifier/))) {
      flat += Math.max(...m[1].split(" or ").map(ability));
    } else if ((m = t.match(/^(?:\+)?(\d+)$/))) flat += Number(m[1]);
    else return null;
  }
  if (!dice.length && !flat && !minimum) return null;
  // Several dice of one size add up ("1d8 + 1d8" is not written; but "2d6" is)
  const bySize = new Map<number, number>();
  for (const d of dice) {
    const [n, size] = d.split("d").map(Number);
    bySize.set(size, (bySize.get(size) ?? 0) + n);
  }
  const first = Array.from(bySize.entries())[0];
  const amount: Amount = { flat, ...(first ? { dice: `${first[1]}d${first[0]}` } : {}) };
  if (minimum && !amount.dice) amount.flat = Math.max(minimum, amount.flat);
  return amount;
}

// The italic header line the books put on every feature ("_**Berserker:** 1st level_")
const withoutHeader = (text: string) => text.replace(/^\s*(?:_\*\*[^\n]*?\*\*[^\n]*?_|\*\*\*[^\n]*?\*\*[^\n]*?\*)\s*\n?/, "").trim();

// How a piece of feature text is activated: whichever of the four the text names first
function activationOf(text: string): CombatFeature["activation"] {
  const candidates: [CombatFeature["activation"], RegExp][] = [
    ["bonus", /\bbonus action\b/i],
    ["reaction", /\b(?:your|a|the|as a) reaction\b/i],
    ["action", /\b(?:as an action|your action|an action to|use an action|as your action|takes? an action)\b/i],
    ["free", /\(no action required\)|\bno action required\b|\bas a free action\b/i],
  ];
  const found = candidates
    .map(([kind, pattern]) => ({ kind, at: text.search(pattern) }))
    .filter((c) => c.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  return found?.kind ?? "passive";
}

// Uses before a rest and what restores them
function usesOf(text: string, ctx: FeatureContext): CombatFeature["uses"] | undefined {
  // What gives the uses back: "must finish a short or long rest before you can use it again",
  // "can't use it again until you finish a long rest", "regain all expended uses when you finish a long rest"
  const restWord =
    text.match(/(?:finish|complete) an? (short or long|short|long) rest before you can use (?:it|this feature|this ability|them) again/i)?.[1]
    ?? text.match(/can't use (?:it|this feature|this ability|them) again until you (?:finish|complete) an? (short or long|short|long) rest/i)?.[1]
    ?? text.match(/regain[^.]*?when you (?:finish|complete) an? (short or long|short|long) rest/i)?.[1]
    ?? text.match(/after (?:a|an) (short or long|short|long) rest/i)?.[1];
  const rest = restWord ? (/short/i.test(restWord) ? "short" : "long") : undefined;
  let max = 0;
  const base = text.match(/you can (?:use (?:this feature|it|this ability)|enter (?:a|an|your) \w+|manifest[^.]*?) (?:a combined total of )?(once|twice|\w+ times)\b(?! per (?:round|turn))/i)
    ?? text.match(/\b(?:use|manifest)[^.]*?\b(once|twice|\w+ times)\b(?! per (?:round|turn))(?! (?:on|in) (?:each|every|the same) turn)/i);
  if (base) max = wordNumber(base[1].replace(/ times/, ""));
  // "a number of times as shown in the Rages column of the berserker table"
  const column = text.match(/number of times as shown in the ([A-Za-z' -]+?) column/i);
  if (column) max = Number(ctx.column(column[1]).match(/\d+/)?.[0] ?? 0);
  const prof = text.match(/number of times equal to your (proficiency bonus|\w+ modifier)/i);
  if (prof) max = prof[1].startsWith("proficiency") ? calculateProficiencyBonus(ctx.totalLevel ?? ctx.level) : Math.max(1, Math.floor(((ctx.scores[prof[1].split(" ")[0].toLowerCase()] ?? 10) - 10) / 2));
  if (!max && /(?:once you've used this|once you have used this|you can't use (?:it|this feature) again until|must (?:finish|complete) a (?:short|long)[^.]* before you can use (?:it|this))/i.test(text)) max = 1;
  if (!max) return undefined;
  // "You gain an additional use at 5th, 9th, 13th, and 17th level"
  const more = text.match(/additional use at ([\d\w, and]+?) level/i);
  if (more) for (const m of more[1].matchAll(/(\d+)(?:st|nd|rd|th)/g)) if (ctx.level >= Number(m[1])) max++;
  // "twice ... starting at 17th level", "starting at 17th level, you can use it twice"
  const steps: { level: number; uses: number }[] = [];
  for (const m of text.matchAll(/(twice|\w+ times)[^.]*?starting at (\d+)(?:st|nd|rd|th) level/gi)) steps.push({ level: Number(m[2]), uses: wordNumber(m[1].replace(/ times/, "")) });
  for (const m of text.matchAll(/starting at (\d+)(?:st|nd|rd|th) level, you can use (?:it|this feature) (twice|\w+ times)/gi)) steps.push({ level: Number(m[1]), uses: wordNumber(m[2].replace(/ times/, "")) });
  for (const step of steps) if (ctx.level >= step.level) max = Math.max(max, step.uses);
  return { max, recharge: rest ?? "long" };
}

// Powers and focus points a feature costs: "expend a force point", "spend 1 focus point", "costs 1 force point"
function costOf(text: string): CombatFeature["cost"] | undefined {
  const m = text.match(/(?:expend|spend|costs?)\s+(an?|one|two|three|\d+)\s+(?:additional\s+)?(force|tech|focus) points?/i);
  if (!m) return undefined;
  const kind = m[2].toLowerCase();
  return { pool: kind === "focus" ? "focus" : "power", points: wordNumber(m[1] === "a" || m[1] === "an" ? "one" : m[1]), ...(kind === "focus" ? {} : { kind: kind as "force" | "tech" }) };
}

const STANDARD_ACTIONS = ["Dash", "Disengage", "Hide", "Dodge", "Help"];

// One piece of feature text (the feature itself, or one of its options) as something usable
function parseSegment(feature: Feature, name: string, text: string, ctx: FeatureContext, pool: string, poolText: string): CombatFeature {
  const activation = activationOf(text);
  const out: CombatFeature = {
    key: `${feature.source}:${name}`,
    pool,
    name,
    source: feature.source,
    level: feature.level ?? 1,
    text,
    activation,
    uses: usesOf(poolText, ctx),
    cost: costOf(text),
    rolls: [],
    automated: false,
  };
  const set = (patch: Partial<CombatFeature>) => {
    Object.assign(out, patch);
    out.automated = true;
  };

  // Extra Attack: "You can attack twice, instead of once, whenever you take the Attack action"
  const extra = text.match(/you can attack (twice|three times|four times)[^.]*whenever you take the Attack action/i);
  if (extra) set({ activation: "passive", attacksPerAction: wordNumber(extra[1].replace(/ times/, "")) });

  // Action Surge: "you can take one additional action on top of your regular action"
  if (/take one additional action on top of your regular action/i.test(text)) set({ extraAction: true, activation: "free" });

  // Rage: "you can enter a rage as a bonus action", "While raging, you gain the following benefits:"
  const stance = text.match(/you can enter (?:a|an|your) ([a-z' -]+?) as a bonus action/i);
  const whileLine = text.match(/While (\w+ing), you (?:gain|have) the following benefits/i);
  if (stance && whileLine) {
    const resist = (text.match(/resistance to ([a-z, ]+?(?:,? and [a-z]+)?) damage/i)?.[1] ?? "").split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean).map((r) => r.toLowerCase());
    const column = text.match(/bonus to the damage roll[^.]*shown in the ([A-Za-z' -]+?) column/i);
    const flat = text.match(/bonus to (?:the )?damage rolls? (?:equal to|of) \+?(\d+)/i);
    set({
      activation: "bonus",
      stance: { label: whileLine[1], damage: column ? Number(ctx.column(column[1]).match(/\d+/)?.[0] ?? 0) : flat ? Number(flat[1]) : 0, resist },
    });
  }

  // Second Wind, Lend Aid: "regain hit points equal to 1d10 + your fighter level"
  const heal = text.match(/regains? (?:a number of )?hit points equal to ([^.]+?)(?:\.|, or|\s+Alternatively)/i);
  if (heal && activation !== "passive") {
    const amount = evalAmount(heal[1], ctx);
    if (amount) set({ heal: { amount, target: /touch|within 5 feet of you/i.test(text) && !/regain hit points equal/i.test(text.slice(0, 80)) ? "touch" : "self" } });
  }

  // Cunning Action: "You can take the Dash, Disengage, or Hide actions as a bonus action"
  const actions = text.match(/you can (?:take|use) the ([a-z]+(?:(?:, | or | and )+(?:or )?[a-z]+)*) actions? as a bonus action/i);
  if (actions) {
    const cap = (a: string) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase();
    const list = actions[1].split(/, | or | and /).map((a) => cap(a.replace(/^or /i, "").trim())).filter((a) => STANDARD_ACTIONS.includes(a));
    if (list.length) set({ actions: list, activation: "passive" });
  }

  // Martial Arts, Battle Readiness, Combat Tech: a weapon attack as a bonus action after something
  const bonusAttack = text.match(/(?:when|whenever) you (?:use|take) (?:the )?([^,.]*?)(?:,| on your turn)[^.]*?you can make one (unarmed strike|weapon attack|attack)[^.]*?as a bonus action/i)
    ?? text.match(/(?:when you take the|when you use your action to cast|when you take) ([^.]*?)[^.]*?you can make one (unarmed strike|weapon attack)[^.]*?as a bonus action/i);
  if (bonusAttack && !/superiority die|maneuver/i.test(text)) {
    const clause = (bonusAttack[1] ?? "").toLowerCase();
    const after = [/attack action/.test(clause) ? "attack" : "", /dodge/.test(clause) ? "dodge" : "", /disengage/.test(clause) ? "disengage" : "", /cast|power/.test(clause) ? "cast" : ""].filter(Boolean);
    const alsoDodge = /\b(?:Dodge|Disengage)\b/.test(text) ? ["dodge", "disengage"] : [];
    const castToo = /cast a (?:force|tech) power|to cast a (?:force|tech)/i.test(text) ? ["cast"] : [];
    set({ bonusAttack: { after: Array.from(new Set([...after, ...alsoDodge, ...castToo])).length ? Array.from(new Set([...after, ...alsoDodge, ...castToo])) : ["attack"], unarmed: /unarmed strike/i.test(bonusAttack[2]) }, activation: "bonus" });
  }

  // Sneak Attack and its kin: "Once per turn, you can deal an extra 1d6 damage to one creature you hit
  // with a weapon attack if you have advantage" (the dice may come from the class table)
  const extraDamage = text.match(/(?:once (?:per|on each of your) turns?|once on each of your turns)[^.]*?(?:deal|dealing) (?:an? )?(?:extra|additional) (\d+d\d+)[^.]*?damage/i)
    ?? text.match(/once (?:per|on each of your) turns?,? when you hit[^.]*?(?:you can )?deal (\d+d\d+) additional damage/i);
  const tableDice = text.match(/(?:extra|additional) damage[^.]*?(?:increases|changes)[^.]*?shown in the ([A-Za-z' -]+?) column/i)
    ?? text.match(/(?:extra|additional)[^.]*?damage increases as you gain levels[^.]*?shown in the ([A-Za-z' -]+?) column/i);
  if (extraDamage && activation === "passive") {
    let dice = extraDamage[1];
    if (tableDice) {
      const cell = ctx.column(tableDice[1]).trim();
      if (/\d*d\d+/.test(cell)) dice = cell.startsWith("d") ? `1${cell}` : cell;
    }
    set({
      extraDamage: {
        dice,
        oncePerTurn: true,
        needs: /if you have advantage on the attack roll/i.test(text) ? "advantage" : "none",
        weapon: /finesse or a ranged weapon|finesse weapon or a ranged/i.test(text) ? "finesse" : /melee/i.test(text) ? "melee" : "any",
      },
    });
  }

  // Reactions that cut damage: "use your reaction to halve the attack's damage",
  // "the damage you take from the attack is reduced by 1d10 + your Dexterity modifier + your monk level"
  if (activation === "reaction") {
    if (/halve the attack's damage|halve the damage/i.test(text)) set({ reduce: { halve: true, against: "any" } });
    else {
      const reduced = text.match(/(?:damage you take[^.]*?|damage[^.]*?) is reduced by ((?:\d+d\d+|your [^.,]+? (?:modifier|level)|\d+)(?: \+ (?:\d+d\d+|your [^.,+]+? (?:modifier|level)|\d+))*)/i);
      const amount = reduced ? evalAmount(reduced[1], ctx) : null;
      if (amount) set({ reduce: { amount, against: /ranged weapon attack/i.test(text) ? "ranged" : /melee/i.test(text) ? "melee" : "any" } });
    }
    const ac = text.match(/bonus to (?:AC|Armor Class) equal to ([^.]+?)\./i);
    if (ac) {
      const amount = evalAmount(ac[1].replace(/\s*\(your choice, minimum of \+1\)/i, " (minimum of +1)"), ctx);
      if (amount) set({ acBonus: amount });
    }
  }

  // Brutal Critical: "You can roll one additional weapon damage die when determining the extra damage for a critical hit"
  const crit = text.match(/roll (one|two|three) additional weapon damage di(?:e|ce) when determining the extra damage for a critical hit/i);
  if (crit) {
    let dice = wordNumber(crit[1]);
    for (const m of text.matchAll(/(one|two|three) additional dic?e? at (\d+)(?:st|nd|rd|th) level/gi)) if (ctx.level >= Number(m[2])) dice = Math.max(dice, wordNumber(m[1]));
    set({ critDice: dice, activation: "passive" });
  }

  // Evasion: "you instead take no damage if you succeed on a saving throw, and only half damage if you fail"
  if (/take no damage if you succeed on a saving throw, and only half damage if you fail/i.test(text) && !/spend|expend/i.test(text)) set({ evasion: true, activation: "passive" });

  // Cause Harm and the like: "must make a Constitution saving throw. On a failed save, the creature
  // takes necrotic damage equal to your guardian level + your Charisma modifier ..., or half as much"
  const saving = text.match(/must (?:succeed on|make) an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw[^.]*\.\s*On a failed save, [^.]*?takes? (\w+) damage equal to ([^.]+?),? or half as much/i);
  if (saving && activation === "action") {
    const amount = evalAmount(saving[3], ctx);
    const range = Number(text.match(/within (\d+) feet/i)?.[1] ?? 60);
    if (amount) set({ save: { ability: saving[1].toLowerCase(), dc: 8 + calculateProficiencyBonus(ctx.totalLevel ?? ctx.level) + Math.max(0, ...["wisdom", "charisma", "intelligence"].map((a) => Math.floor(((ctx.scores[a] ?? 10) - 10) / 2))), damage: amount, type: saving[2].toLowerCase(), range } });
  }

  // Reckless Attack: "advantage on melee weapon attack rolls using Strength during this turn, but
  // attack rolls against you have advantage until your next turn"
  if (/advantage on (?:melee weapon attack rolls|your attack rolls)[^.]*during this turn, but attack rolls against you have advantage until your next turn/i.test(text)) {
    set({ reckless: true, activation: "free" });
  }

  // Danger Sense: "You have advantage on Dexterity saving throws against effects that you can see"
  const savesAdv = text.match(/you have advantage on (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throws against (?:effects|powers|traps)/i);
  if (savesAdv) set({ saveAdvantage: [savesAdv[1].toLowerCase()], activation: "passive" });

  // "you have advantage on initiative checks"
  if (/you have advantage on initiative checks/i.test(text)) set({ initiativeAdvantage: true, activation: "passive" });

  // Deflection: "you can roll a Kinetic Combat die and add it to your AC (no action required)"
  const acDie = text.match(/roll an? ([A-Za-z' -]+?) die and add it to your AC/i);
  if (acDie) {
    const cell = ctx.column(acDie[1].trim()).trim();
    if (/d\d+/.test(cell)) set({ acDie: cell.startsWith("d") ? cell : cell.replace(/^\d+/, ""), activation: "reaction" });
  }

  // Double Strike: "When you hit a creature with a weapon attack, you can roll a Kinetic Combat die
  // and deal additional damage of the same type equal to the amount rolled"
  const dieDamage = text.match(/when you hit a creature with a (?:melee )?weapon attack, you can roll an? ([A-Za-z' -]+?) die and deal additional damage/i);
  if (dieDamage) {
    const cell = ctx.column(dieDamage[1].trim()).trim();
    if (/d\d+/.test(cell)) set({ extraDamage: { dice: `1${cell.startsWith("d") ? cell : cell.replace(/^\d+/, "")}`, oncePerTurn: /once per round|once per turn/i.test(poolText), needs: "none", weapon: "any" }, activation: "free" });
  }

  // Force-Empowered Strikes: "When you hit a creature with a melee weapon attack, you can expend force
  // points to deal additional damage ... 1d8 for each point spent ... no more than the Focused Strikes column"
  const perPoint = text.match(/you can expend (?:force|tech|focus) points to deal additional damage[^.]*?(\d+d\d+) for each point spent[^.]*?(?:shown in the ([A-Za-z' -]+?) column)?/i);
  if (perPoint) {
    const cap = perPoint[2] ? Number(ctx.column(perPoint[2]).match(/^(\d+)/)?.[1] ?? 0) : 0;
    const kind = (text.match(/you can expend (force|tech) points to deal additional damage/i)?.[1]?.toLowerCase() as "force" | "tech" | undefined);
    set({ extraDamage: { dice: perPoint[1], oncePerTurn: false, needs: "none", weapon: /melee/i.test(text) ? "melee" : "any", perPoint: true, maxDice: cap || undefined }, cost: { pool: "power", points: 1, ...(kind ? { kind } : {}) }, activation: "free" });
  }
  // Improved Force-Empowered Strikes: "Whenever you hit a creature with a melee weapon attack, the creature takes an extra 1d8 damage"
  const always = text.match(/whenever you hit a creature with a (melee )?weapon attack, the creature takes an extra (\d+d\d+) damage/i);
  if (always) set({ extraDamage: { dice: always[2], oncePerTurn: false, needs: "none", weapon: always[1] ? "melee" : "any" }, activation: "passive" });

  // Ranger's Quarry and its kin: the creature marked, and the extra die on a hit against it
  if (/mark (?:it|the creature|a creature)[^.]*as your/i.test(text)) {
    const quarry = text.match(/(?:once per turn|once on each of your turns)[^.]*?deal (\d+d\d+) additional damage/i);
    let dice = quarry?.[1];
    const column = text.match(/This die changes as you gain [a-z]+ levels, as shown in the ([A-Za-z' -]+?) column/i);
    if (column) {
      const cell = ctx.column(column[1]).trim();
      if (/d\d+/.test(cell)) dice = `1${cell.startsWith("d") ? cell : cell.replace(/^\d+/, "")}`;
    }
    if (dice) set({ marks: true, extraDamage: { dice, oncePerTurn: true, needs: "none", weapon: "any" }, activation: "free" });
  }

  // Force Recovery: "When you finish a short rest, you can regain a number of force points equal to half
  // your consular level + your Wisdom or Charisma modifier (your choice, minimum of one)"
  const recovery = text.match(/when you (?:finish|complete) a short rest, you can regain a number of (force|tech) points equal to ([^.]+?)\./i);
  if (recovery) {
    const amount = evalAmount(recovery[2], ctx);
    if (amount) set({ onRest: { points: amount, kind: recovery[1].toLowerCase() as "force" | "tech" }, activation: "passive" });
  }

  // Fighting styles' standing effects
  if (/no longer have disadvantage on ranged weapon attacks due to being within 5 feet of a hostile creature/i.test(text)) set({ noCloseRangedPenalty: true, activation: "passive" });
  if (/add your ability modifier to the damage roll of your Two-Weapon Fighting attack/i.test(text)) set({ offhandModifier: true, activation: "passive" });
  const minRoll = text.match(/(?:your )?(?:blaster )?weapon damage rolls gain a minimum roll threshold/i);
  if (minRoll) set({ minRoll: { weapon: /two-handed/i.test(text) ? "twoHanded" : /blaster weapon damage rolls/i.test(text) ? "blaster" : "any" }, activation: "passive" });

  // Whatever dice are named and nothing resolves: left to be rolled by hand
  if (!out.automated || out.activation !== "passive") {
    out.rolls = Array.from(new Set(Array.from(text.matchAll(/\b(\d+d\d+)\b/g)).map((m) => m[1])));
  }
  return out;
}

// Every feature the character has that matters in a fight or has limited uses, parsed. Options
// ("#### Cause Harm") of a feature are listed on their own and share the feature's uses.
// What a feature's text is read against: for a class or archetype feature its class's level and
// table, for the others (species, feats, fighting styles) the character level and the first class's table
export function featureContext(character: any, classId?: string): FeatureContext {
  const total = Number(character?.level) || 1;
  const entries = classLevels(character);
  const own = classId ? entries.find((e) => e.klass.id === classId) : undefined;
  const entry = own ?? entries[0];
  const level = own ? own.level : total;
  const tableLevel = entry ? (own ? own.level : entry.level) : total;
  return {
    level,
    totalLevel: total,
    scores: character?.abilityScores ?? {},
    className: entry?.klass.name,
    column: (name) => String(entry?.klass.levelTable?.[String(Math.min(20, Math.max(1, tableLevel)))]?.[name] ?? ""),
  };
}

export function combatFeatures(character: any): CombatFeature[] {
  const ctx = featureContext(character);
  const out: CombatFeature[] = [];
  const seen = new Set<string>();
  // The highest-level copy of a feature that repeats ("Brutal Critical" at 9, 13 and 17) is the one in force.
  // The fighting styles the character has chosen are features like any other.
  const styles: Feature[] = combatChoicesOf(character).styles
    .map((name) => fightingStyles.find((f) => f.name === name))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ name: f.name, description: f.description, source: "Fighting Style", level: 1 }));
  const features = [...characterFeatures(character), ...styles];
  const latest = new Map<string, Feature>();
  for (const f of features) {
    const key = `${f.source}:${f.name}`;
    const was = latest.get(key);
    if (!was || (f.level ?? 0) >= (was.level ?? 0)) latest.set(key, f);
  }
  const contexts = new Map<string, FeatureContext>();
  const contextOf = (f: Feature) => {
    if (!f.classId) return ctx;
    if (!contexts.has(f.classId)) contexts.set(f.classId, featureContext(character, f.classId));
    return contexts.get(f.classId)!;
  };
  for (const feature of Array.from(latest.values())) {
    const fctx = contextOf(feature);
    const text = withoutHeader(feature.description ?? "");
    if (!text || /^Ability Score Improvement/i.test(feature.name) || seen.has(`${feature.source}:${feature.name}`)) continue;
    seen.add(`${feature.source}:${feature.name}`);
    const [intro, ...optionTexts] = text.split(/\n#{3,5} +/);
    const options = optionTexts.map((o) => {
      const [title, ...rest] = o.split("\n");
      return { title: title.trim(), text: rest.join("\n").trim() };
    });
    const whole = parseSegment(feature, feature.name, intro, fctx, `${feature.source}:${feature.name}`, text);
    out.push(whole);
    // Options that are used, as opposed to ones that are only chosen between or described
    for (const option of options) {
      if (!option.title || !option.text) continue;
      const parsed = parseSegment(feature, `${feature.name}: ${option.title}`, option.text, fctx, whole.key, text);
      if (parsed.automated || parsed.activation !== "passive") out.push(parsed);
    }
  }
  return [...out.filter((f) => f.automated || f.uses || f.activation !== "passive"), ...maneuverFeatures(character, ctx)];
}

// ---------------------------------------------------------------------------------------------
// Fighting styles and maneuvers: what the character may choose, and what a maneuver does
// ---------------------------------------------------------------------------------------------

// Saved in the character's `fighterManeuvers` (the column is for any class that has them)
export interface CombatChoices {
  styles: string[];
  maneuvers: string[];
}
export const combatChoicesOf = (character: any): CombatChoices => {
  const raw = character?.fighterManeuvers ?? {};
  return { styles: Array.isArray(raw.styles) ? raw.styles : [], maneuvers: Array.isArray(raw.maneuvers) ? raw.maneuvers : [] };
};

// A column of each class's table at the level in that class (or at another level), as numbers
const classColumn = (character: any, column: string, level?: (e: ClassLevel) => number): { entry: ClassLevel; value: number }[] =>
  classLevels(character).map((entry) => ({
    entry,
    value: Number(String(entry.klass.levelTable?.[String(Math.min(20, Math.max(1, level ? level(entry) : entry.level)))]?.[column] ?? "").match(/\d+/)?.[0] ?? 0),
  }));

// A column summed over the character's classes, each at its own level (the Monk's Focus Points)
export const classColumnTotal = (character: any, column: string): number => classColumn(character, column).reduce((n, c) => n + c.value, 0);

// How many fighting styles the character may have (one for each Fighting Style feature, and for
// the Fighting Stylist feat) and how many maneuvers (the class table's Maneuvers Known, and one for
// each Superiority Style or the like)
export function combatChoiceSlots(character: any): { styles: number; maneuvers: number } {
  const features = characterFeatures(character);
  const styles = new Set(features.filter((f) => /^Fighting Style$/i.test(f.name)).map((f) => `${f.source}`)).size
    + (character?.feats ?? []).map(featName).filter((n: string) => /^Fighting Stylist$/i.test(n)).length;
  const chosen = combatChoicesOf(character).styles.map((n) => fightingStyles.find((s) => s.name === n)).filter(Boolean);
  const extraManeuvers = chosen.filter((s) => /you learn one maneuver/i.test(s!.description)).length;
  // ("Maneuvers Known: Choose your maneuvers from each class separately and then combine them into a single pool")
  return { styles, maneuvers: classColumnTotal(character, "Maneuvers Known") + extraManeuvers };
}

// Superiority dice: the class table's number and size, or the one die a Superiority Style gives,
// which grows as the style's text says ("to d6 at 5th level, to d8 at 9th level ..."). With
// superiority from more than one class the dice of each are one pool, and the size is read from
// the tables at the levels in those classes added together ("Superiority and Maneuvers")
export function superiorityDice(character: any): { size: number; count: number } | null {
  const level = Number(character?.level) || 1;
  const counted = classColumn(character, "Superiority Dice Quantity").filter((c) => c.value > 0);
  const count = counted.reduce((n, c) => n + c.value, 0);
  const levels = counted.reduce((n, c) => n + c.entry.level, 0);
  const size = Math.max(0, ...classColumn(character, "Superiority Dice Size", () => levels).filter((c) => counted.some((k) => k.entry.klass.id === c.entry.klass.id)).map((c) => c.value));
  if (count && size) return { size, count };
  const style = combatChoicesOf(character).styles.map((n) => fightingStyles.find((f) => f.name === n)).find((f) => f && /superiority die/i.test(f.description));
  if (!style) return null;
  let die = Number(style.description.match(/superiority die, which is a d(\d+)/i)?.[1] ?? 4);
  for (const m of style.description.matchAll(/to d(\d+) at (\d+)(?:st|nd|rd|th) level/gi)) if (level >= Number(m[2])) die = Math.max(die, Number(m[1]));
  return { size: die, count: 1 };
}

// A maneuver's ability modifier: Strength, Dexterity or Constitution (the best) for physical ones,
// Intelligence, Wisdom or Charisma for mental ones, the best of all for general ones
export function maneuverModifier(character: any, type: string): number {
  const scores = character?.abilityScores ?? {};
  const group = type === "Physical" ? ["strength", "dexterity", "constitution"] : type === "Mental" ? ["intelligence", "wisdom", "charisma"] : [...ABILITIES];
  return Math.max(...group.map((a) => getAbilityModifier(scores[a] ?? 10)));
}

// What a maneuver's text lets the app do. Timing: with the attack roll, after a hit, or as an
// action of its own (a heal, a ward). Only what the wording makes plain is automated.
function maneuverFeature(m: Maneuver, character: any, ctx: FeatureContext, dice: { size: number; count: number }): CombatFeature {
  const text = m.description.replace(/\s+/g, " ").trim();
  const modifier = maneuverModifier(character, m.type);
  const proficiency = calculateProficiencyBonus(ctx.totalLevel ?? ctx.level);
  const onHit = /when you hit a creature with a (?:melee |ranged )?weapon attack/i.test(text) || /when you (?:score a critical hit|hit) with a weapon attack/i.test(text);
  const onRoll = /when you make (?:a|an) (?:melee |ranged )?(?:weapon )?attack roll[^.]*(?:expend|add)/i.test(text) || /when you make a weapon attack roll against a creature, you can expend/i.test(text);
  const damage = /(?:add|adding)[^.]*(?:superiority die|number rolled|result)[^.]*damage roll|(?:additional|extra)(?: \w+)? damage equal to[^.]*(?:superiority die|number rolled|result|amount rolled)|damage equal to the (?:number|amount) rolled/i.test(text);
  const type = text.match(/(?:additional|extra|deal|dealing)\s+(\w+)\s+damage equal to/i)?.[1]?.toLowerCase();
  const saveAbility = text.match(/must (?:make|succeed on) an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i)?.[1]?.toLowerCase();
  const afterFail = text.split(/failed save|fails the save|fails the saving throw/i)[1] ?? text.split(/saving throw/i)[1] ?? "";
  const conditions = conditionRows.map((c) => c.name.toLowerCase()).filter((name) => new RegExp(`\\b${name}\\b`).test(afterFail));
  const heal = /regains? (?:a number of )?hit points equal to (?:the )?(?:number rolled|superiority die roll|result of the roll)/i.test(text) ? "hp" as const
    : /temporary hit points equal to (?:the )?(?:amount rolled|result of the roll|superiority die roll|number rolled)/i.test(text) ? "temp" as const : undefined;
  const parry = /reduce the damage by the number you roll on your superiority die/i.test(text);
  const activation: CombatFeature["activation"] = onHit || onRoll ? "free" : activationOf(text) === "passive" ? "free" : activationOf(text);
  const feature: CombatFeature = {
    key: `Maneuver:${m.name}`,
    pool: "Maneuver:dice",
    name: m.name,
    source: "Maneuver",
    level: 1,
    text,
    activation: parry ? "reaction" : activation,
    uses: { max: dice.count, recharge: "short" },
    cost: { pool: "die", points: 1 },
    rolls: [],
    automated: false,
  };
  if (onHit || onRoll) {
    feature.maneuver = {
      timing: onRoll && !onHit ? "attack" : "hit",
      damage,
      damageType: type && /^(?:force|psychic|sonic|fire|necrotic|energy|kinetic|ion|lightning|acid|cold|poison|true)$/.test(type) ? type : undefined,
      ...(saveAbility ? { save: { ability: saveAbility, conditions, dc: 8 + proficiency + modifier } } : conditions.length && /\bor be\b|\bis\b/.test(afterFail) ? { save: undefined } : {}),
      modifier,
      die: dice.size,
    };
    feature.automated = true;
  } else if (parry) {
    feature.reduce = { amount: { dice: `1d${dice.size}`, flat: modifier }, against: "melee" };
    feature.automated = true;
  } else if (heal) {
    feature.maneuver = { timing: "use", damage: false, heal, modifier, die: dice.size };
    feature.automated = true;
  } else feature.rolls = [`1d${dice.size}`];
  return feature;
}

// The chosen maneuvers as features, sharing the pool of superiority dice
function maneuverFeatures(character: any, ctx: FeatureContext): CombatFeature[] {
  const dice = superiorityDice(character);
  if (!dice) return [];
  const known = new Set(combatChoicesOf(character).maneuvers);
  return maneuverList.filter((m) => known.has(m.name) && !checkSkillOf(m)).map((m) => maneuverFeature(m, character, ctx, dice));
}

// The skill a maneuver adds a superiority die to ("When you make a Persuasion check, you can expend a superiority die, rolling the die and
// adding it to the d20 roll": Assist, Conceal, Persuade, Threaten ...). Such a maneuver is for the checks of play, not for a fight.
const checkSkillOf = (m: Maneuver): string | undefined =>
  m.description.replace(/\s+/g, " ").match(/When you make an? ([A-Za-z ]+?) check, you can expend a superiority die, rolling the die and adding it to the d20 roll/i)?.[1]?.toLowerCase();

// The chosen maneuvers that help a skill check, with the character's superiority dice (the pool is "Maneuver:dice", shared with the fight)
export function checkManeuvers(character: any): { name: string; skill: string; size: number; count: number }[] {
  const dice = superiorityDice(character);
  if (!dice) return [];
  const known = new Set(combatChoicesOf(character).maneuvers);
  return maneuverList.filter((m) => known.has(m.name)).flatMap((m) => {
    const skill = checkSkillOf(m);
    return skill ? [{ name: m.name, skill, size: dice.size, count: dice.count }] : [];
  });
}

// The size of die a minimum roll threshold treats as its lowest result ("2 for d4 ... 8 for d20")
export const minimumRoll = (sides: number): number => (lookups as any).minimumRollThreshold?.[`d${sides}`] ?? 1;

// What a character has in hand and on, once the player has chosen (saved in `armor`): the
// weapons wielded, the armor worn and the shield carried. Until then everything carried is in
// use, as it was before there was a choice, and the best armor counts.
export interface Equipped {
  weapons: string[];
  body: string | null;
  shield: string | null;
}
export const equippedOf = (character: any): Equipped | null => {
  const a = character?.armor;
  return a && typeof a === "object" && Array.isArray(a.weapons) ? { weapons: a.weapons, body: a.body ?? null, shield: a.shield ?? null } : null;
};
const equipmentNamed = (name: string) => equipment.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
export const isShield = (name: string) => equipmentNamed(name)?.armorClassification === "Shield";
// What the Play page has worked out about the items carried (`withItemEffects` below): the facts
// of each enhanced item by lower-case name, on the character it hands to everything else
const factsFor = (character: any, name: string): ItemFacts | undefined => character?.itemFacts?.[String(name).toLowerCase()];
export const itemKind = (name: string, character?: any): "weapon" | "armor" | "shield" | "gear" => {
  const facts = character ? factsFor(character, name) : undefined;
  if (facts && facts.type === "Weapon") return "weapon";
  if (facts && facts.type === "Armor") return "armor";
  if (facts && facts.type === "Shield") return "shield";
  if (facts) return "gear";
  const e = equipmentNamed(name);
  return e?.category === "Weapon" ? "weapon" : e?.category === "Armor" ? (e.armorClassification === "Shield" ? "shield" : "armor") : "gear";
};

// The plain item an enhanced weapon, armor or shield is a kind of ("combat suit", "bo-rifle")
const squashName = (s: string) => String(s).toLowerCase().replace(/[^a-z]/g, "");
const baseOf = (character: any, name: string) => {
  const facts = factsFor(character, name);
  if (!facts || !["Weapon", "Armor", "Shield"].includes(facts.type) || !facts.subtype) return undefined;
  const wanted = squashName(facts.subtype);
  return equipment.find((e) => squashName(e.name) === wanted || squashName(e.name) === wanted + "s");
};

// Whether an enhanced item's effects apply: it needs no attunement, or the character is attuned
export const isAttuned = (character: any, name: string): boolean => (character?.playState?.attuned ?? []).some((n: string) => String(n).toLowerCase() === String(name).toLowerCase());
const itemWorks = (character: any, facts: ItemFacts) => facts.attune === 0 || isAttuned(character, facts.name);

// Every effect in force: carried items that are worn, wielded or just carried (and attuned where
// that is needed), installed augmentations, and a stimpac, adrenal or collimator's hour
export function activeEffects(character: any): { source: string; effects: ItemEffects }[] {
  const out: { source: string; effects: ItemEffects }[] = [];
  for (const name of inUse(character)) {
    const facts = factsFor(character, name);
    if (facts && !facts.timed && facts.type !== "CyberneticAugmentation" && itemWorks(character, facts)) out.push({ source: facts.name, effects: facts.effects });
  }
  // Modifications fitted in plain items in use: they work once the item is attuned
  for (const name of inUse(character)) {
    const fit = character?.playState?.fitted?.[name];
    if (!fit?.mods?.length || !isAttuned(character, name)) continue;
    for (const m of fit.mods) {
      const facts = factsFor(character, m);
      if (facts) out.push({ source: `${name}: ${facts.name}`, effects: facts.effects });
    }
  }
  for (const a of character?.playState?.augments ?? []) {
    const facts = factsFor(character, a.name);
    if (facts) out.push({ source: facts.name, effects: facts.effects });
  }
  for (const b of character?.playState?.buffs ?? []) if (b.kind !== "collimator") out.push({ source: b.name, effects: b.effects });
  return out;
}

// The names of what is carried and counts: weapons not wielded and armor not worn are only carried
export function inUse(character: any): string[] {
  const carried: string[] = (character?.equipment ?? []).map((e: any) => String(e?.name ?? e));
  const chosen = equippedOf(character);
  if (!chosen) return carried;
  const lower = (names: (string | null)[]) => names.filter(Boolean).map((n) => n!.toLowerCase());
  const wielded = lower(chosen.weapons);
  const worn = lower([chosen.body, chosen.shield]);
  return carried.filter((name) => {
    const kind = itemKind(name, character);
    return kind === "weapon" ? wielded.includes(name.toLowerCase()) : kind === "armor" || kind === "shield" ? worn.includes(name.toLowerCase()) : true;
  });
}

// What is in use now, written out so that a change can be made to it: everything carried when
// nothing has been chosen yet, with the armor that gives the best class
export function equippedNow(character: any): Equipped {
  const chosen = equippedOf(character);
  if (chosen) return chosen;
  const carried: string[] = (character?.equipment ?? []).map((e: any) => String(e?.name ?? e));
  const armors = carried.filter((n) => itemKind(n, character) === "armor");
  const classOf = (name: string) => calculateArmorClass(character?.abilityScores ?? {}, [baseOf(character, name)?.name ?? name]);
  const body = armors.sort((a, b) => classOf(b) - classOf(a))[0] ?? null;
  const shield = carried.find((n) => itemKind(n, character) === "shield") ?? null;
  return { weapons: Array.from(new Set(carried.filter((n) => itemKind(n, character) === "weapon"))), body, shield };
}

// What shows on the character's figure on the map (components/Map/interiors/gear.ts): the weapons wielded, the weight of armour worn (by
// the rules data's own class), the shield, and the kits, tools, medical supplies and prostheses carried
export function gearOf(character: any): Gear {
  const worn = equippedNow(character);
  const item = (name: string | null | undefined): GearItem | undefined => {
    if (!name) return undefined;
    const e = equipmentNamed(baseOf(character, name)?.name ?? name);
    if (e) return { name: e.name, equipmentCategory: e.kind, armorClassification: e.armorClassification, weaponClassification: e.weaponClassification };
    // An enhanced item with a model made for it (a pauldron, a ring, a bo-rifle) is known by its name
    return itemRef(name) ? { name, equipmentCategory: "Enhanced" } : undefined;
  };
  const body = item(worn.body);
  const used = new Set([...worn.weapons, worn.body, worn.shield].map((n) => String(n ?? "").toLowerCase()));
  const carried = ((character?.equipment ?? []) as any[]).map((e) => String(e?.name ?? e)).filter((n) => !used.has(n.toLowerCase())).map(item).filter((i): i is GearItem => !!i);
  const installed = ((character?.playState?.augments ?? []) as { name: string }[]).filter((a) => a?.name);
  // The scope fitted in the main weapon (shared/logic/shooter.ts opticOf: the zoom each grade gives), drawn on the gun's rail
  const main = worn.weapons[0];
  const optic = main ? opticOf(activeEffects(character).map((a) => a.source).filter((x) => x.startsWith(`${main}: `)).map((x) => x.split(": ").pop()!))?.zoom : undefined;
  return {
    ...(optic ? { optic } : {}),
    weapons: worn.weapons.map(item).filter((i): i is GearItem => !!i).slice(0, 2),
    bodyClass: body?.armorClassification === "Light" || body?.armorClassification === "Medium" || body?.armorClassification === "Heavy" ? (body.armorClassification.toLowerCase() as "light" | "medium" | "heavy") : undefined,
    shield: item(worn.shield),
    // (an augmentation or a prosthesis fitted by a surgeon has left the pack but is on the body: drawn like what is worn)
    carried: [...carried, ...installed.map((a) => item(a.name)).filter((i): i is GearItem => !!i)],
    // What is put on (a suit, a mask, goggles), of what is carried, and what the surgeon has fitted
    worn: [...((character?.playState?.wearing ?? []) as string[]).filter((n) => ((character?.equipment ?? []) as any[]).some((e) => String(e?.name ?? e) === n)), ...installed.map((a) => a.name)],
  };
}

const carriedArmor = (carried: string[]) => {
  const names = carried.map((name) => String(name).toLowerCase());
  const owned = equipment.filter((e) => e.category === "Armor" && names.includes(e.name.toLowerCase()));
  return {
    body: owned.filter((e) => e.armorClassification !== "Shield"),
    shield: Math.max(0, ...owned.filter((e) => e.armorClassification === "Shield").map((e) => Number((String(e.armorClass).match(/\d+/) ?? [0])[0]))),
  };
};

// Armor class: the better of the armor carried and the character's own formulas (natural armor,
// Unarmored Defense), which replace armor rather than add to it
export function armorClassOf(abilityScores: any, carried: string[], effects: FeatureEffects): number {
  const { shield } = carriedArmor(carried);
  let best = calculateArmorClass(abilityScores, carried);
  for (const formula of effects.armor) {
    const bonus = formula.abilities.reduce((sum, group) => sum + Math.max(...group.map((a) => getAbilityModifier(abilityScores[a] ?? 10))), 0);
    best = Math.max(best, formula.base + bonus + (formula.shield ? shield : 0));
  }
  return best;
}

// What features and equipment decide, for a character as it stands
export function derivedStats(character: any) {
  const effects = featureEffects(characterFeatures(character), character);
  // Enhanced armor and shields count as the plain kind they are a kind of, with their own bonus
  const carried: string[] = inUse(character).map((name) => baseOf(character, name)?.name ?? name);
  const unarmored = carriedArmor(carried).body.length === 0;
  const items = sumEffects(activeEffects(character).map((a) => a.effects));
  // "When you aren't wearing armor, your AC becomes 13 + your Dexterity modifier"
  if (items.acBase && unarmored) effects.armor.push({ base: items.acBase.base, abilities: [[items.acBase.ability]], shield: true, source: "Augmentation" });
  return {
    effects,
    armorClass: armorClassOf(character.abilityScores ?? {}, carried, effects) + (items.ac ?? 0),
    speedBonus: effects.speed + (unarmored ? effects.unarmoredSpeed : 0) + (items.speed ?? 0),
    hitPointBonus: effects.hitPointsPerLevel * (Number(character.level) || 1),
    // Saved in the character's `weapons` so that Play can use it without the species data
    naturalWeapons: effects.unarmed
      ? [{ name: `Unarmed strike (${effects.unarmed.source})`, type: "Natural weapon", damage: effects.unarmed.dice, damageType: effects.unarmed.damageType, ability: "strength", proficient: true, natural: true }]
      : [],
  };
}

// The weapons a character can attack with: those carried (equipment is saved by name) and a
// species' or class's unarmed strike, each with the numbers for an attack. Blasters use Dexterity,
// other weapons Strength, or the better of the two with the finesse property; the proficiency
// bonus is added when the class is proficient with the weapon.
export interface CarriedWeapon {
  name: string;
  type: string;
  ranged: boolean;
  dice: string;
  damageType: string;
  ability: "strength" | "dexterity";
  proficient: boolean;
  properties: string[];
  attackBonus: number;
  damageBonus: number;
  natural?: boolean;
  // Feet: the reach of a melee weapon, or the normal and long range of a ranged or thrown one
  reach: number;
  range?: [number, number];
  // The damage with two hands of a versatile weapon ("versatile (1d10)"), and whether a melee weapon can be thrown (and comes back)
  versatile?: string;
  thrown?: boolean;
  returning?: boolean;
}

// "Power cell (range 50/200)", "thrown (range 20/60)" and "reach" among a weapon's properties
const weaponReach = (properties: string[]) => {
  const range = properties.map((p) => p.match(/range (\d+)\/(\d+)/i)).find(Boolean);
  return { reach: properties.some((p) => /^reach/i.test(p)) ? 10 : 5, ...(range ? { range: [Number(range[1]), Number(range[2])] as [number, number] } : {}) };
};

// Weapon proficiency a species or feat names (audit T-015): "You have proficiency with the heavy pistol and sniper rifle", "proficiency with all
// blasters". "Of your choice" sentences are left out: the choice is not stored on a character.
const grantedWeapon = (character: any, weapon: { name: string; weaponClassification?: string }): boolean => {
  // ("all" covers simple and martial weapons; exotic ones are learned one by one)
  const kind = (weapon.weaponClassification ?? "").match(/^(?:Simple|Martial)(\w+)$/)?.[1]?.toLowerCase();
  const name = weapon.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return characterFeatures(character).some((f) =>
    (f.description.match(/proficien(?:t|cy)\s+(?:with|in)\s+[^.:\n]*/gi) ?? []).some((sentence) => {
      const text = sentence.toLowerCase();
      if (/of your choice/.test(text)) return false;
      return (!!kind && new RegExp(`\\ball ${kind}s\\b`).test(text)) || new RegExp(`(?<=^|[,;] |\\band |\\bthe |\\bwith |\\bin |\\bas well as |\\bor )${name}s?\\b`).test(text);
    }));
};

export function carriedWeapons(character: any): CarriedWeapon[] {
  const scores = character?.abilityScores ?? {};
  const str = getAbilityModifier(scores.strength ?? 10);
  const dex = getAbilityModifier(scores.dexterity ?? 10);
  const proficiency = calculateProficiencyBonus(Number(character?.level) || 1);
  const carried: string[] = inUse(character).map((name) => name.toLowerCase());
  const owned = equipment.filter((e) => e.category === "Weapon" && e.damage && carried.includes(e.name.toLowerCase()));
  // Enhanced weapons: the plain weapon they are a kind of, with their bonus when it works
  const enhanced = inUse(character)
    .map((name) => ({ name, facts: factsFor(character, name), base: baseOf(character, name) }))
    .filter((x) => x.facts?.type === "Weapon" && x.base?.category === "Weapon" && x.base.damage);
  const bonusOf = (name: string): { attack: number; damage: number } => {
    const facts = factsFor(character, name);
    return facts && itemWorks(character, facts) ? { attack: facts.effects.attack ?? 0, damage: facts.effects.damage ?? 0 } : { attack: 0, damage: 0 };
  };
  const buffed = (e: { weaponClassification?: string }) => {
    const buff = (character?.playState?.buffs ?? []).find((b: any) => b.kind === "collimator" && String(e.weaponClassification ?? "").toLowerCase().includes(String(b.weapon ?? "")));
    return buff ? { attack: buff.effects?.attack ?? 0, damage: buff.effects?.damage ?? 0, props: (buff.effects?.properties ?? []) as string[] } : { attack: 0, damage: 0, props: [] as string[] };
  };
  // What modifications fitted in a plain weapon give (once attuned): bonuses and properties
  // (and the properties they take away or lower a step: "loses the two-handed property", "dexterity number is reduced by one step")
  const modded = (name: string): { attack: number; damage: number; props: string[]; drops: string[]; lowers: string[] } => {
    const fit = character?.playState?.fitted?.[name];
    if (!fit?.mods?.length || !isAttuned(character, name)) return { attack: 0, damage: 0, props: [], drops: [], lowers: [] };
    const list = fit.mods.map((m: string) => factsFor(character, m)).filter(Boolean) as ItemFacts[];
    return { attack: list.reduce((n, f) => n + (f.effects.attack ?? 0), 0), damage: list.reduce((n, f) => n + (f.effects.damage ?? 0), 0), props: list.flatMap((f) => f.properties ?? []), drops: list.flatMap((f) => f.effects.drops ?? []), lowers: list.flatMap((f) => f.effects.lowers ?? []) };
  };
  // A weapon's own properties less what its modifications take away, a lowered one a step down (21, 19, 17, 15, 13, 11, then gone)
  const reshaped = (name: string, props: string[]) => {
    const m = modded(name);
    if (!m.drops.length && !m.lowers.length) return props;
    return props
      .filter((p) => !m.drops.some((d) => p.toLowerCase().startsWith(d)))
      .map((p) => {
        const hit = m.lowers.find((l) => p.toLowerCase().startsWith(l));
        const n = hit ? Number(p.match(/\d+/)?.[0]) : NaN;
        if (!hit || !n) return p;
        const steps = m.lowers.filter((l) => l === hit).length;
        const next = n - 2 * steps;
        return next < 11 ? "" : p.replace(/\d+/, String(next));
      })
      .filter(Boolean);
  };
  // A modal weapon (2026-10-26): the weapons named with the property ("modal (blaster rifle and techstaff)"), each carried as a mode of it
  // (switched by an object interaction: house reading, both are at hand; each mode by its own numbers and proficiency)
  const modes = equipment
    .filter((e) => e.category === "Weapon" && !e.damage && carried.includes(e.name.toLowerCase()))
    .flatMap((e) => (e.properties ?? []).map((p) => p.match(/^modal \((.+)\)/i)?.[1]).filter(Boolean).flatMap((list) => list!.split(/,\s*|\s+and\s+/)).map((mode) => ({ of: e, mode: equipment.find((x) => x.category === "Weapon" && x.damage && x.name.toLowerCase() === mode.trim().toLowerCase()) })))
    .filter((x): x is { of: (typeof equipment)[number]; mode: (typeof equipment)[number] } => !!x.mode)
    // (the rules data has a modal weapon in two rows of one name)
    .filter((x, i, all) => all.findIndex((y) => y.of.name === x.of.name && y.mode.name === x.mode.name) === i);
  const weapons: CarriedWeapon[] = [
    ...modes.map(({ of, mode }) => ({ e: mode, name: `${of.name} (${mode.name.toLowerCase()})`, bonus: { attack: 0, damage: 0 } })),
    ...owned.map((e) => ({ e: { ...e, properties: reshaped(e.name, e.properties ?? []) }, name: e.name, bonus: { ...buffed(e), attack: buffed(e).attack + modded(e.name).attack, damage: buffed(e).damage + modded(e.name).damage, props: [...modded(e.name).props, ...buffed(e).props] } })),
    ...enhanced.map((x) => ({ e: x.base as typeof owned[number], name: x.name, bonus: { attack: bonusOf(x.name).attack + buffed(x.base!).attack, damage: bonusOf(x.name).damage + buffed(x.base!).damage, props: buffed(x.base!).props } })),
  ].map(({ e, name, bonus }: { e: typeof owned[number]; name: string; bonus: { attack: number; damage: number; props?: string[] } }) => {
    const ranged = /blaster/i.test(e.weaponClassification ?? "");
    const finesse = (e.properties ?? []).some((p) => /^finesse/i.test(p));
    // Mighty (a bow): Strength or Dexterity, whichever is better, for both rolls (2026-10-26: was read as Dexterity only)
    const mighty = (e.properties ?? []).some((p) => /^mighty/i.test(p));
    const ability = mighty ? (str > dex ? "strength" : "dexterity") : ranged || (finesse && dex > str) ? "dexterity" : "strength";
    const versatile = (e.properties ?? []).map((p) => p.match(/^versatile \((\d+d\d+)\)/i)?.[1]).find(Boolean);
    const thrown = !ranged && (e.properties ?? []).some((p) => /^thrown/i.test(p));
    // Smart ("smart (15/+2)"): the weapon's own Dexterity score and proficiency bonus in place of the wielder's
    const smart = (e.properties ?? []).map((p) => p.match(/^smart \((\d+)\/\+?(\d+)\)/i)).find(Boolean);
    const modifier = smart ? getAbilityModifier(Number(smart[1])) : ability === "dexterity" ? dex : str;
    // A weapon type learned from a Master (house rule, shared/logic "Weapon Masters"): proficient with its simple and martial weapons,
    // a master with its exotic ones too and +1 to attack
    const kind = (e.weaponClassification ?? "").match(/^(Simple|Martial|Exotic)(Blaster|Vibroweapon|Lightweapon)$/i);
    const trained = kind ? weaponTraining(character?.playState?.training)[kind[2].toLowerCase() as WeaponKind] : undefined;
    // (a weapon trained in the downtime before 2026-11-09 is kept: its name is in `weaponProficiencies`)
    const drilled = (character?.weaponProficiencies ?? []).some((n: unknown) => String(n).toLowerCase() === e.name.toLowerCase());
    const proficient = classWeaponProficient(character, e) || grantedWeapon(character, e) || drilled || (!!trained && (trained === "master" || !/^exotic/i.test(kind![1])));
    const mastery = trained === "master" ? MASTERY_ATTACK : 0;
    const [dice, damageType = ""] = e.damage!.split(" ");
    return {
      name,
      type: (e.weaponClassification ?? "Weapon").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ (\w)/, (_, c) => ` ${c.toLowerCase()}`),
      ranged,
      dice,
      damageType,
      ability,
      proficient,
      properties: [...(e.properties ?? []), ...(bonus.props ?? [])],
      ...weaponReach([...(e.properties ?? []), ...(bonus.props ?? [])]),
      attackBonus: modifier + (proficient ? (smart ? Number(smart[2]) : proficiency) : 0) + bonus.attack + mastery,
      damageBonus: modifier + bonus.damage,
      ...(versatile ? { versatile } : {}),
      ...(thrown ? { thrown, returning: (e.properties ?? []).some((p) => /^returning/i.test(p)) } : {}),
    };
  });
  const natural: CarriedWeapon[] = (character?.weapons ?? [])
    .filter((w: any) => w?.natural && w.damage)
    .map((w: any) => ({
      name: w.name,
      type: w.type ?? "Natural weapon",
      ranged: false,
      dice: String(w.damage).split(" ")[0],
      damageType: w.damageType ?? "kinetic",
      ability: "strength" as const,
      proficient: true,
      properties: [],
      reach: 5,
      attackBonus: str + proficiency,
      damageBonus: str,
      natural: true,
    }));
  return [...weapons, ...natural];
}

// A feat's ability increase: the abilities it offers (one of them goes up by 1)
export const featAbilityOptions = (name: string): string[] => {
  const offered = (findFeatByName(name)?.attributesIncreased ?? []).map((a) => a.toLowerCase());
  return offered.includes("any") ? [...ABILITIES] : offered.filter(isAbility);
};

// What stops a character from taking a feat, for the prerequisites that can be checked: a level,
// the ability to cast powers (of a level), another feat, an ability score. Species type and size,
// and "this or that" ability scores, are left to the player; null means nothing stands in the way.
export function featPrerequisiteUnmet(feat: Feat, character: any): string | null {
  const text = feat.prerequisite;
  if (!text) return null;
  const level = Number(character.level) || 1;
  const needLevel = text.match(/(\d+)(?:st|nd|rd|th) level/i);
  if (needLevel && level < Number(needLevel[1])) return `needs ${needLevel[0]}`;
  const cast = text.match(/ability to cast (?:(\d+)(?:st|nd|rd|th)-level )?(force or tech|force|tech) powers/i);
  if (cast) {
    const kinds = cast[2].toLowerCase().split(" or ");
    const pools = castingPools(character);
    const pool = (kind: string) => pools.find((p) => p.kind.toLowerCase() === kind);
    const can = kinds.some((kind) => pool(kind) || (kind === "force" ? character.forcePowers : character.techPowers)?.length > 0);
    if (!can || (cast[1] && Math.max(0, ...kinds.map((kind) => pool(kind)?.maxLevel ?? 0)) < Number(cast[1]))) return `needs ${cast[0]}`;
  }
  const other = text.match(/([A-Z][\w' ]*?) feat/);
  if (other && !(character.feats ?? []).map(featName).includes(other[1])) return `needs the ${other[1]} feat`;
  if (!/\bor\b/i.test(text.replace(/force or tech/i, ""))) {
    for (const m of text.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (\d+)/g)) {
      if ((character.abilityScores?.[m[1].toLowerCase()] ?? 10) < Number(m[2])) return `needs ${m[0]}`;
    }
  }
  return null;
}

// What changes in the saved numbers when the character's features change (a level, an archetype,
// a feat). Numbers the sheet lets the player edit keep their edits: only the difference is applied.
function featureChanges(before: any, after: any) {
  const was = derivedStats(before);
  const now = derivedStats(after);
  return {
    hitPoints: now.hitPointBonus - was.hitPointBonus,
    fields: {
      armorClass: before.armorClass + (now.armorClass - was.armorClass),
      speed: before.speed + (now.speedBonus - was.speedBonus),
      skillProficiencies: union(before.skillProficiencies, now.effects.skills),
      savingThrowProficiencies: union(before.savingThrowProficiencies, now.effects.saves),
      weapons: [...(before.weapons ?? []).filter((w: any) => !w?.natural), ...now.naturalWeapons],
    },
  };
}

// The character with an archetype taken in one of its classes: the first class's is saved in
// `subclass`, another's in its `multiclass` entry
function withArchetype(character: any, classId: string, archetypeId: string | undefined): any {
  if (!archetypeId) return character;
  if (classId === character.class) return { ...character, subclass: archetypeId };
  return { ...character, multiclass: multiclassOf(character).map((e) => (e.class === classId ? { ...e, subclass: archetypeId } : e)) };
}

// The character after a level in a class: the first class's levels follow from the character
// level, another class's are counted in its `multiclass` entry (a new class starts at 1)
function withLevelIn(character: any, classId: string, entry: Partial<MulticlassEntry> = {}): any {
  const next = { ...character, level: (Number(character.level) || 1) + 1 };
  if (classId === character.class) return next;
  const extra = multiclassOf(character);
  return {
    ...next,
    multiclass: extra.some((e) => e.class === classId)
      ? extra.map((e) => (e.class === classId ? { ...e, level: e.level + 1 } : e))
      : [...extra, { class: classId, level: 1, ...entry }],
  };
}

// Archetypes open in a class that has reached the level for one and has none yet: in `classId`,
// or in the first class with one due. `level`: the level in that class (by default the one it has).
export function archetypeOptions(character: any, level?: number, classId?: string): ClassArchetype[] {
  const entries = classLevels(character);
  const entry = classId
    ? entries.find((e) => e.klass.id === classId)
    : entries.find((e) => !e.archetype && (level ?? e.level) >= e.klass.archetypeLevel);
  const klass = entry?.klass ?? (classId ? getClassById(classId) : undefined);
  const at = level ?? entry?.level ?? 0;
  if (!klass || at < klass.archetypeLevel || entry?.archetype) return [];
  return archetypes.filter((a) => a.parentClass === klass.id);
}

// The saved fields that change when a character takes an archetype outside a level-up
export function chooseArchetype(character: any, archetypeId: string): Record<string, any> | null {
  const taken = archetypes.find((a) => a.id === archetypeId);
  if (!taken || !archetypeOptions(character, undefined, taken.parentClass).some((a) => a.id === archetypeId)) return null;
  const after = withArchetype(character, taken.parentClass, archetypeId);
  const { hitPoints, fields } = featureChanges(character, after);
  // (an archetype with a caster table of its own brings its points)
  const points = pointChanges(character, after, character.abilityScores ?? {}, character.abilityScores ?? {});
  return {
    ...(taken.parentClass === character.class ? { subclass: archetypeId } : { multiclass: after.multiclass }),
    maxHp: character.maxHp + hitPoints,
    currentHp: character.currentHp + hitPoints,
    ...points,
    ...fields,
  };
}

// ---------------------------------------------------------------------------------------------
// Gaining a level
// ---------------------------------------------------------------------------------------------

// Experience points needed to be a level (Player's Handbook, Character Advancement). Always the
// character level, whatever class the level is taken in ("Experience Points").
export const experienceForLevel = (level: number): number =>
  (advancement as any[]).find((row) => row.level === level)?.experiencePoints ?? Infinity;

export const canLevelUp = (currentLevel: number, currentExperience: number): boolean =>
  currentLevel < 20 && currentExperience >= experienceForLevel(currentLevel + 1);

export const calculateExperienceForNextLevel = (currentLevel: number, currentExperience: number): number =>
  currentLevel >= 20 ? 0 : Math.max(0, experienceForLevel(currentLevel + 1) - currentExperience);

const knownPowers = (character: any): any[] => [...(character.forcePowers ?? []), ...(character.techPowers ?? [])];
const powerKind = (power: any): "Force" | "Tech" => ("forceAlignment" in (power ?? {}) ? "Force" : "Tech");

// What one class's casting grants at a level in it: the class's table, or, for a class that has none, the table of its archetype
// (audit T-014: nine archetypes make a Marauder, a Slicer or a Shield Specialist a partial caster). Points exclude the ability
// modifier. `character.class` names the class; `level` is the level in it.
export function castingAt(character: any, level: number, archetype = findArchetype(character)): { type: "Force" | "Tech" | "None"; known: number; points: number; maxLevel: number } {
  const klass = getClassById(character?.class);
  if (klass && klass.casterType !== "None") {
    return { type: klass.casterType, known: calculatePowersKnown(klass.id, level), points: getPowerProgression(klass.id, level).points, maxLevel: calculateMaxPowerLevel(level, klass.id) };
  }
  const rows = archetype?.casting ?? {};
  const at = Math.max(0, ...Object.keys(rows).map(Number).filter((l) => l <= level));
  return at && archetype && archetype.casterType !== "None" ? { type: archetype.casterType, ...rows[at] } : { type: "None", known: 0, points: 0, maxLevel: 0 };
}

// A kind of casting the character has, with every class that gives it ("Force- and Tech-casting"):
// the points of each class's table added together, the casting modifier added once; the highest
// power level of the class when one class gives it, else from the Multiclass Max Power Level table
export interface CastingPool {
  kind: "Force" | "Tech";
  // The tables' points, and with the casting modifier
  tablePoints: number;
  points: number;
  maxLevel: number;
  classes: { id: string; name: string; level: number; known: number; maxLevel: number }[];
}

export function castingPools(character: any, scores: Record<string, number> = character?.abilityScores ?? {}): CastingPool[] {
  const casters = classLevels(character)
    .map((e) => ({ e, cast: castingAt(asClass(character, e), e.level, e.archetype) }))
    .filter((c) => c.cast.type !== "None");
  const kinds = Array.from(new Set(casters.map((c) => c.cast.type))) as ("Force" | "Tech")[];
  return kinds.map((kind) => {
    const own = casters.filter((c) => c.cast.type === kind);
    const tablePoints = own.reduce((n, c) => n + c.cast.points, 0);
    const modifier = kind === "Force" ? Math.max(getAbilityModifier(scores.wisdom ?? 10), getAbilityModifier(scores.charisma ?? 10)) : getAbilityModifier(scores.intelligence ?? 10);
    // "dividing each class's potential Max Power Level by 9, multiplying the result by the number of levels in that class,
    // adding the results for each class together, and consulting the Multiclass Max Power Level table" (in ninths, so no rounding creeps in)
    const ninths = own.reduce((n, c) => n + castingAt(asClass(character, { ...c.e, level: 20 }), 20, c.e.archetype).maxLevel * c.e.level, 0);
    const casterLevel = Math.min(20, Math.max(1, Math.floor(ninths / 9)));
    return {
      kind,
      tablePoints,
      points: tablePoints ? Math.max(0, tablePoints + modifier) : 0,
      maxLevel: own.length === 1 ? own[0].cast.maxLevel : MULTICLASS.maxPowerLevel[casterLevel - 1],
      classes: own.map((c) => ({ id: c.e.klass.id, name: c.e.klass.name, level: c.e.level, known: c.cast.known, maxLevel: c.cast.maxLevel })),
    };
  });
}

// Where each pool's points are saved: the first kind in `maxForcePoints`/`currentForcePoints` (a
// tech caster's tech points too, as before multiclassing), the second in `maxOtherPoints`/`currentOtherPoints`
export const POOL_FIELDS = [
  { max: "maxForcePoints", current: "currentForcePoints" },
  { max: "maxOtherPoints", current: "currentOtherPoints" },
] as const;

// Each pool with its saved points
export function savedPools(character: any): (CastingPool & { max: number; current: number; field: (typeof POOL_FIELDS)[number] })[] {
  return castingPools(character).slice(0, 2).map((pool, i) => ({ ...pool, field: POOL_FIELDS[i], max: Number(character?.[POOL_FIELDS[i].max]) || 0, current: Number(character?.[POOL_FIELDS[i].current]) || 0 }));
}

// The saved points that change when a character's classes or scores change: each kind's pool keeps
// what was spent and grows by what the tables add, in whichever field it is saved now
function pointChanges(before: any, after: any, scoresBefore: Record<string, number>, scoresAfter: Record<string, number>): Record<string, number> {
  const was = castingPools(before, scoresBefore);
  const now = castingPools(after, scoresAfter).slice(0, 2);
  const out: Record<string, number> = {};
  now.forEach((pool, i) => {
    const j = was.findIndex((p) => p.kind === pool.kind);
    const delta = pool.points - (j >= 0 ? was[j].points : 0);
    const from = j >= 0 && j < 2 ? POOL_FIELDS[j] : undefined;
    out[POOL_FIELDS[i].max] = Math.max(0, (from ? Number(before[from.max]) || 0 : 0) + delta);
    out[POOL_FIELDS[i].current] = Math.max(0, (from ? Number(before[from.current]) || 0 : 0) + delta);
  });
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => v !== (Number(before[k]) || 0)));
}

// Force or tech: the first kind of power the character casts (the one its saved points are for)
export const castingKind = (character: any): "Force" | "Tech" | "None" => castingPools(character)[0]?.kind ?? "None";

// The class a known power is cast through ("Each power you know is associated with one of your classes"): saved with it
// (`castClass`) when it is learned; one learned before is the first class of its kind, or the first class that casts at all
export function powerClass(character: any, power: any, pools = castingPools(character)): string | undefined {
  if (power?.castClass && classLevels(character).some((e) => e.klass.id === power.castClass)) return power.castClass;
  return (pools.find((p) => p.kind === powerKind(power)) ?? pools[0])?.classes[0]?.id;
}
export const powersKnownIn = (character: any, classId: string): any[] => {
  const pools = castingPools(character);
  return knownPowers(character).filter((p) => powerClass(character, p, pools) === classId);
};

// Powers the character may learn at a level in a class ("as if you were a single-classed member of that class"): of the class's
// kind, no higher than its own Max Power Level, not yet known, and with the power they build on already known
export function powerOptions(character: any, level: number, archetype = findArchetype(character), classId: string = character?.class): any[] {
  const cast = castingAt({ ...character, class: classId }, level, archetype);
  if (cast.type === "None") return [];
  const known = new Set(knownPowers(character).map((p) => String(p.name).toLowerCase()));
  // (house rule, shared/logic "Power Masters") a power of 6th level or more, of Expanded Content, of the other kind of casting or of the
  // opposite alignment is learned only after its school's Master's trials; the other kind's powers are offered once a school of it is open
  const schools = powerTraining(character?.playState?.training);
  const align = String(character?.forceAlignment ?? "");
  const own: any[] = cast.type === "Force" ? forcePowers : techPowers;
  const other: any[] = cast.type === "Force" ? (schools.tech ? techPowers : []) : schools.light || schools.dark || schools.universal ? forcePowers : [];
  return [...own, ...other]
    .filter((p) => powerGate(p, cast.type, align) <= (schools[powerSchool(p)] ?? 0))
    .filter((p) => p.level <= cast.maxLevel && !known.has(p.name.toLowerCase()) && (!p.prerequisite || known.has(p.prerequisite.toLowerCase())))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface LevelUpPlan {
  // The character level reached, and the class the level is in with the level in it
  level: number;
  classId: string;
  className: string;
  classLevel: number;
  // A class the character did not have; what stops it (unmet prerequisites); the proficiencies it gives
  newClass: boolean;
  unmet: string[];
  proficiencies?: MulticlassProficiencies;
  hitDie: number;
  // Class features gained at the new level in the class
  features: Feature[];
  // Archetypes to choose from, when the class has reached the level for one and has none
  archetypes: ClassArchetype[];
  abilityScoreImprovement: boolean;
  powersToLearn: number;
  powerOptions: any[];
}

// (`archetypeId`: the archetype chosen with this level, when the class has none yet: its casting counts for the new level;
// `classId`: the class the level is taken in, the first class by default)
export function levelUpPlan(character: any, archetypeId?: string, classId: string = character?.class): LevelUpPlan | null {
  const level = Number(character?.level) || 1;
  if (!getClassById(character?.class) || !canLevelUp(level, Number(character.experience) || 0)) return null;
  const choice = classChoices(character).find((c) => c.klass.id === classId);
  if (!choice) return null;
  const klass = choice.klass;
  const classLevel = choice.level + 1;
  const entry = classLevels(character).find((e) => e.klass.id === klass.id);
  const due = !entry?.archetype && classLevel >= klass.archetypeLevel ? archetypes.filter((a) => a.parentClass === klass.id) : [];
  const taking = due.find((a) => a.id === archetypeId) ?? entry?.archetype;
  const options = powerOptions(character, classLevel, taking, klass.id);
  const known = castingAt({ ...character, class: klass.id }, classLevel, taking).known;
  return {
    level: level + 1,
    classId: klass.id,
    className: klass.name,
    classLevel,
    newClass: choice.level === 0,
    unmet: choice.unmet,
    ...(choice.level === 0 ? { proficiencies: multiclassProficiencies(klass.id) } : {}),
    hitDie: klass.hitDie,
    features: klass.features.filter((f) => f.level === classLevel).map((f) => ({ ...f, source: klass.name, classId: klass.id })),
    archetypes: due,
    abilityScoreImprovement: klass.features.some((f) => f.level === classLevel && /^Ability Score Improvement/i.test(f.name)),
    powersToLearn: Math.min(options.length, Math.max(0, known - powersKnownIn(character, klass.id).length)),
    powerOptions: options,
  };
}

export interface LevelUpChoices {
  // The class the level is taken in (the first class when absent)
  class?: string;
  archetype?: string;
  // An Ability Score Improvement: two points among the abilities (the same one twice for +2), or a feat
  abilities?: string[];
  feat?: string;
  // The ability a feat raises, when it offers more than one
  featAbility?: string;
  powers?: string[];
  // The skills and tools a new class's multiclass proficiencies let the player choose
  skills?: string[];
  tools?: string[];
}

// The saved fields that change when the character gains a level with these choices, or what is
// still missing from the choices
export function applyLevelUp(character: any, choices: LevelUpChoices): { changes?: Record<string, any>; problems: string[] } {
  const classId = choices.class ?? character.class;
  const plan = levelUpPlan(character, choices.archetype, classId);
  if (!plan) return { problems: [getClassById(character?.class) && canLevelUp(Number(character?.level) || 1, Number(character?.experience) || 0) ? "That class is not in the rules data." : "Not enough experience for the next level."] };
  if (plan.unmet.length) return { problems: [`Multiclassing into ${plan.className} needs ${plan.unmet.join("; ")}.`] };
  const klass = getClassById(classId)!;
  const problems: string[] = [];
  const scores: Record<string, number> = { ...character.abilityScores };
  const raise = (ability: string) => {
    scores[ability] = Math.min(20, (scores[ability] ?? 10) + 1);
  };

  const archetype = plan.archetypes.find((a) => a.id === choices.archetype);
  if (plan.archetypes.length && !archetype) problems.push(`Choose one of the ${klass.name}'s archetypes.`);

  let feats: string[] = (character.feats ?? []).map(featName);
  if (plan.abilityScoreImprovement) {
    if (choices.feat) {
      const feat = findFeatByName(choices.feat);
      const offered = featAbilityOptions(choices.feat);
      const ability = offered.length === 1 ? offered[0] : choices.featAbility;
      const unmet = feat && featPrerequisiteUnmet(feat, { ...character, level: plan.level });
      if (!feat) problems.push("That feat is not in the rules data.");
      else if (feats.includes(feat.name)) problems.push(`${feat.name} is already taken.`);
      else if (unmet) problems.push(`${feat.name} ${unmet}.`);
      else if (offered.length && !(ability && offered.includes(ability))) problems.push(`Choose the ability ${feat.name} raises.`);
      else {
        feats = [...feats, feat.name];
        if (ability) raise(ability);
      }
    } else if ((choices.abilities ?? []).length === 2 && choices.abilities!.every(isAbility)) {
      choices.abilities!.forEach(raise);
    } else {
      problems.push("Spend the Ability Score Improvement: two points among your abilities, or a feat.");
    }
  }

  // A new class's proficiencies: the skills and tools to choose ("one skill from the class's list")
  const gained = plan.proficiencies;
  const skills = gained ? (choices.skills ?? []).filter((s, i, all) => gained.skills.from.includes(s) && all.indexOf(s) === i) : [];
  const tools = gained ? (choices.tools ?? []).filter((t, i, all) => gained.tools.from.includes(t) && all.indexOf(t) === i) : [];
  if (gained && skills.length !== Math.min(gained.skills.count, gained.skills.from.length)) problems.push(`Choose ${gained.skills.count} skill${gained.skills.count === 1 ? "" : "s"} ${klass.name} gives (${skills.length} chosen).`);
  if (gained && tools.length !== Math.min(gained.tools.count, gained.tools.from.length)) problems.push(`Choose ${gained.tools.count} tool${gained.tools.count === 1 ? "" : "s"} ${klass.name} gives (${tools.length} chosen).`);

  const picked = plan.powerOptions.filter((p) => (choices.powers ?? []).includes(p.name));
  if (picked.length !== plan.powersToLearn) problems.push(`Choose ${plan.powersToLearn} new power${plan.powersToLearn === 1 ? "" : "s"} (${picked.length} chosen).`);
  if (problems.length) return { problems };

  const after = withArchetype(
    withLevelIn({ ...character, feats, abilityScores: scores }, classId, { ...(skills.length ? { skills } : {}), ...(tools.length ? { tools } : {}) }),
    classId,
    archetype?.id,
  );
  const featured = featureChanges(character, after);
  const conBefore = getAbilityModifier(character.abilityScores?.constitution ?? 10);
  const conNow = getAbilityModifier(scores.constitution ?? 10);
  // The average of the Hit Die of the class the level is in, plus Constitution ("You gain the hit points from your new class as
  // described for levels after 1st"); a higher Constitution counts for earlier levels too
  const hitPoints = Math.max(1, klass.hitDie / 2 + 1 + conNow) + (conNow - conBefore) * (plan.level - 1) + featured.hitPoints;
  const points = pointChanges(character, after, character.abilityScores ?? {}, scores);
  // Each power learned is cast through the class it was learned for
  const learned = picked.map((p) => ({ ...p, castClass: classId }));
  const force = learned.filter((p) => "forceAlignment" in p);
  const tech = learned.filter((p) => !("forceAlignment" in p));

  return {
    problems,
    changes: {
      level: plan.level,
      proficiencyBonus: calculateProficiencyBonus(plan.level),
      abilityScores: scores,
      maxHp: character.maxHp + hitPoints,
      currentHp: character.currentHp + hitPoints,
      ...points,
      ...featured.fields,
      ...(skills.length ? { skillProficiencies: union(featured.fields.skillProficiencies, skills) } : {}),
      ...(tools.length ? { toolProficiencies: union(character.toolProficiencies ?? [], tools) } : {}),
      ...(gained?.armor.length ? { armorProficiencies: union(character.armorProficiencies ?? [], gained.armor) } : {}),
      ...(classId !== character.class ? { multiclass: after.multiclass } : archetype ? { subclass: archetype.id } : {}),
      ...(feats.length !== (character.feats ?? []).length ? { feats } : {}),
      ...(force.length ? { forcePowers: [...(character.forcePowers ?? []), ...force] } : {}),
      ...(tech.length ? { techPowers: [...(character.techPowers ?? []), ...tech] } : {}),
    },
  };
}

// The standard array (Player's Handbook, Determine Ability Scores)
export const getStandardAbilityArray = (): number[] => [15, 14, 13, 12, 10, 8];

// The character as Play sees it: ability scores with items and augmentations applied, the armor
// class the items change, and the facts of what is carried for the functions above. `facts` is
// the server's item facts by lower-case name; nothing is written back (the sheet keeps its own
// numbers, and Play's saves send only what they change).
export function withItemEffects(character: any, facts: Record<string, ItemFacts> | undefined, clockMinutes = 0): any {
  if (!character || !facts) return character;
  const state = character.playState ?? {};
  // A timed effect ends at its minute; one that waits for a fight (`fight`) stays until it is over
  const buffs = (state.buffs ?? []).filter((b: any) => b.fight || (b.until ?? 0) > clockMinutes);
  const view = { ...character, itemFacts: facts, playState: { ...state, buffs } };
  const active = activeEffects(view);
  // The side effects fall on the abilities chosen when the item was attuned or installed
  const falls = active.filter((a) => a.effects.falls).map((a) => state.sides?.[a.source]).filter(Boolean) as string[];
  const abilityScores = scoresWith(character.abilityScores ?? {}, active.map((a) => a.effects), falls);
  const scored = { ...view, abilityScores };
  const change = derivedStats(scored).armorClass - derivedStats({ ...character, itemFacts: undefined, playState: { ...state, buffs: [], augments: [] } }).armorClass;
  const unarmed = active.filter((a) => a.effects.unarmed);
  return {
    ...scored,
    armorClass: Math.max(0, (character.armorClass ?? 10) + change),
    itemTempHp: sumEffects(active.map((a) => a.effects)).tempHp,
    // An enhanced shield's or armor's "damage you take is reduced by N"
    itemAbsorb: sumEffects(active.map((a) => a.effects)).absorb ?? 0,
    // Handwraps and the like: a bonus to unarmed strikes
    itemUnarmed: { attack: unarmed.reduce((n, a) => n + (a.effects.attack ?? 0), 0), damage: unarmed.reduce((n, a) => n + (a.effects.damage ?? 0), 0) },
    // (2026-11-02) Proficiency tiers raised (by skill, "wisdom saving throws" or tool name: each item's raise), bonuses to force and tech
    // powers' attacks and save DCs, force power damage, damage types resisted
    itemProficiency: active.reduce((acc, a) => {
      for (const [k, v] of Object.entries(a.effects.proficiency ?? {})) (acc[k] ??= []).push(v);
      return acc;
    }, {} as Record<string, { by?: number; to?: number }[]>),
    itemPowers: active.reduce((acc, a) => {
      for (const kind of ["force", "tech"] as const) {
        const p = a.effects.powers?.[kind];
        if (!p) continue;
        const t = (acc[kind] ??= { melee: 0, ranged: 0, dc: {} });
        t.melee = (t.melee ?? 0) + (p.melee ?? 0);
        t.ranged = (t.ranged ?? 0) + (p.ranged ?? 0);
        for (const [ab, n] of Object.entries(p.dc ?? {})) t.dc![ab] = (t.dc![ab] ?? 0) + n;
      }
      return acc;
    }, {} as { force?: PowerBonus; tech?: PowerBonus }),
    itemForceDamage: active.reduce((n, a) => n + (a.effects.forceDamage ?? 0), 0),
    itemResist: Array.from(new Set(active.flatMap((a) => a.effects.resist ?? []))),
    // (2026-11-03) What each item in use does in a real-time fight (shared/logic FightFacts), by its source: an item's name, or "Weapon: Mod" for a
    // modification fitted in a weapon, armour or clothing
    itemFight: active.filter((a) => a.effects.fight).map((a) => ({ source: a.source, fight: a.effects.fight! })),
    // (2026-11-05) every item in use and every modification fitted ("Weapon: Mod"), whether it has an effect in a fight or not: a scope shows on the gun
    itemSources: active.map((a) => a.source),
    // Darkvision, stealth, a decoy shadow, a guard against weapons, water at will (parseItemEffects)
    itemSenses: {
      darkvision: Math.max(0, ...active.map((a) => a.effects.darkvision ?? 0)),
      stealth: Math.sign(active.reduce((n, a) => n + (a.effects.stealth ?? 0), 0)),
      decoy: active.some((a) => a.effects.decoy),
      weaponGuard: active.some((a) => a.effects.weaponGuard),
      water: active.some((a) => a.effects.water),
    },
  };
}
