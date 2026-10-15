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
} from "./rules";
import { getClassById, getClassLevelValue } from "./classes";
import { getSpeciesById } from "./species";
import { archetypes, type ClassArchetype } from "./archetypes";
import { findFeatByName, type Feat } from "./feats";
import { forcePowers } from "./forcePowers";
import { techPowers } from "./techPowers";
import { equipment } from "./equipment";
import { SKILLS } from "./constants";
import { maneuvers as maneuverList, type Maneuver } from "./maneuvers";
import { fightingStyles } from "./fightingStyles";
import { conditions as conditionRows } from "./conditions";
import lookups from "@shared/data/sw5e/lookups.json";

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
}

// The character's archetype (saved in `subclass` by id; a name is accepted too)
export function findArchetype(character: any): ClassArchetype | undefined {
  const wanted = String(character?.subclass ?? "").toLowerCase();
  if (!wanted) return undefined;
  const ofClass = archetypes.filter((a) => a.parentClass === String(character.class).toLowerCase());
  return ofClass.find((a) => a.id === wanted || a.name.toLowerCase() === wanted);
}

export function characterFeatures(character: any): Feature[] {
  const level = Number(character?.level) || 1;
  const species = getSpeciesById(character?.species);
  const klass = getClassById(character?.class);
  const archetype = findArchetype(character);
  const taken = (character?.feats ?? []).map((feat: any) => findFeatByName(featName(feat))).filter(Boolean) as Feat[];
  return [
    ...(species?.traits ?? []).map((t) => ({ name: t.name, description: t.description, source: species!.name })),
    ...(klass?.features ?? []).filter((f) => f.level <= level).map((f) => ({ ...f, source: klass!.name })),
    ...(archetype?.features ?? []).filter((f) => f.level <= level).map((f) => ({ ...f, source: archetype!.name })),
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

export function featureEffects(features: Feature[], character: { class?: string; level?: number } = {}): FeatureEffects {
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

  // The Monk's class table: the Martial Arts die and Unarmored Movement
  if (character.class && features.some((f) => f.name === "Martial Arts")) {
    const die = getClassLevelValue(character.class, Number(character.level) || 1, "Martial Arts");
    if (die > dieSize(effects.unarmed?.dice ?? "")) effects.unarmed = { dice: `1d${die}`, damageType: "kinetic", source: "Martial Arts" };
  }
  if (character.class && features.some((f) => f.name === "Unarmored Movement")) {
    effects.unarmoredSpeed = getClassLevelValue(character.class, Number(character.level) || 1, "Unarmored Movement");
  }
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
  cost?: { pool: "power" | "focus" | "die"; points: number };
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
  level: number;
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
    else if ((m = t.match(/^(half )?your (?:[a-z' -]+ )?level$/))) flat += m[1] ? Math.floor(ctx.level / 2) : ctx.level;
    else if ((m = t.match(/^your proficiency bonus$/))) flat += calculateProficiencyBonus(ctx.level);
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
  if (prof) max = prof[1].startsWith("proficiency") ? calculateProficiencyBonus(ctx.level) : Math.max(1, Math.floor(((ctx.scores[prof[1].split(" ")[0].toLowerCase()] ?? 10) - 10) / 2));
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
  return { pool: m[2].toLowerCase() === "focus" ? "focus" : "power", points: wordNumber(m[1] === "a" || m[1] === "an" ? "one" : m[1]) };
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
    if (amount) set({ save: { ability: saving[1].toLowerCase(), dc: 8 + calculateProficiencyBonus(ctx.level) + Math.max(0, ...["wisdom", "charisma", "intelligence"].map((a) => Math.floor(((ctx.scores[a] ?? 10) - 10) / 2))), damage: amount, type: saving[2].toLowerCase(), range } });
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
    set({ extraDamage: { dice: perPoint[1], oncePerTurn: false, needs: "none", weapon: /melee/i.test(text) ? "melee" : "any", perPoint: true, maxDice: cap || undefined }, cost: { pool: "power", points: 1 }, activation: "free" });
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
export function combatFeatures(character: any): CombatFeature[] {
  const level = Number(character?.level) || 1;
  const klass = getClassById(character?.class);
  const ctx: FeatureContext = {
    level,
    scores: character?.abilityScores ?? {},
    className: klass?.name,
    column: (name) => String(klass?.levelTable?.[String(Math.min(20, Math.max(1, level)))]?.[name] ?? ""),
  };
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
  for (const feature of Array.from(latest.values())) {
    const text = withoutHeader(feature.description ?? "");
    if (!text || /^Ability Score Improvement/i.test(feature.name) || seen.has(`${feature.source}:${feature.name}`)) continue;
    seen.add(`${feature.source}:${feature.name}`);
    const [intro, ...optionTexts] = text.split(/\n#{3,5} +/);
    const options = optionTexts.map((o) => {
      const [title, ...rest] = o.split("\n");
      return { title: title.trim(), text: rest.join("\n").trim() };
    });
    const whole = parseSegment(feature, feature.name, intro, ctx, `${feature.source}:${feature.name}`, text);
    out.push(whole);
    // Options that are used, as opposed to ones that are only chosen between or described
    for (const option of options) {
      if (!option.title || !option.text) continue;
      const parsed = parseSegment(feature, `${feature.name}: ${option.title}`, option.text, ctx, whole.key, text);
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

const tableCell = (character: any, column: string): string =>
  String(getClassById(character?.class)?.levelTable?.[String(Math.min(20, Math.max(1, Number(character?.level) || 1)))]?.[column] ?? "");

// How many fighting styles the character may have (one for each Fighting Style feature, and for
// the Fighting Stylist feat) and how many maneuvers (the class table's Maneuvers Known, and one for
// each Superiority Style or the like)
export function combatChoiceSlots(character: any): { styles: number; maneuvers: number } {
  const features = characterFeatures(character);
  const styles = new Set(features.filter((f) => /^Fighting Style$/i.test(f.name)).map((f) => `${f.source}`)).size
    + (character?.feats ?? []).map(featName).filter((n: string) => /^Fighting Stylist$/i.test(n)).length;
  const chosen = combatChoicesOf(character).styles.map((n) => fightingStyles.find((s) => s.name === n)).filter(Boolean);
  const extraManeuvers = chosen.filter((s) => /you learn one maneuver/i.test(s!.description)).length;
  return { styles, maneuvers: Number(tableCell(character, "Maneuvers Known").match(/\d+/)?.[0] ?? 0) + extraManeuvers };
}

// Superiority dice: the class table's number and size, or the one die a Superiority Style gives,
// which grows as the style's text says ("to d6 at 5th level, to d8 at 9th level ...")
export function superiorityDice(character: any): { size: number; count: number } | null {
  const level = Number(character?.level) || 1;
  const count = Number(tableCell(character, "Superiority Dice Quantity").match(/\d+/)?.[0] ?? 0);
  const size = Number(tableCell(character, "Superiority Dice Size").match(/\d+/)?.[0] ?? 0);
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
  const proficiency = calculateProficiencyBonus(ctx.level);
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
  return maneuverList.filter((m) => known.has(m.name)).map((m) => maneuverFeature(m, character, ctx, dice));
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
export const itemKind = (name: string): "weapon" | "armor" | "shield" | "gear" => {
  const e = equipmentNamed(name);
  return e?.category === "Weapon" ? "weapon" : e?.category === "Armor" ? (e.armorClassification === "Shield" ? "shield" : "armor") : "gear";
};

// The names of what is carried and counts: weapons not wielded and armor not worn are only carried
export function inUse(character: any): string[] {
  const carried: string[] = (character?.equipment ?? []).map((e: any) => String(e?.name ?? e));
  const chosen = equippedOf(character);
  if (!chosen) return carried;
  const lower = (names: (string | null)[]) => names.filter(Boolean).map((n) => n!.toLowerCase());
  const wielded = lower(chosen.weapons);
  const worn = lower([chosen.body, chosen.shield]);
  return carried.filter((name) => {
    const kind = itemKind(name);
    return kind === "weapon" ? wielded.includes(name.toLowerCase()) : kind === "armor" || kind === "shield" ? worn.includes(name.toLowerCase()) : true;
  });
}

// What is in use now, written out so that a change can be made to it: everything carried when
// nothing has been chosen yet, with the armor that gives the best class
export function equippedNow(character: any): Equipped {
  const chosen = equippedOf(character);
  if (chosen) return chosen;
  const carried: string[] = (character?.equipment ?? []).map((e: any) => String(e?.name ?? e));
  const armors = carried.filter((n) => itemKind(n) === "armor");
  const classOf = (name: string) => calculateArmorClass(character?.abilityScores ?? {}, [name]);
  const body = armors.sort((a, b) => classOf(b) - classOf(a))[0] ?? null;
  const shield = carried.find((n) => itemKind(n) === "shield") ?? null;
  return { weapons: Array.from(new Set(carried.filter((n) => itemKind(n) === "weapon"))), body, shield };
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
  const carried: string[] = inUse(character);
  const unarmored = carriedArmor(carried).body.length === 0;
  return {
    effects,
    armorClass: armorClassOf(character.abilityScores ?? {}, carried, effects),
    speedBonus: effects.speed + (unarmored ? effects.unarmoredSpeed : 0),
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
}

// "Power cell (range 50/200)", "thrown (range 20/60)" and "reach" among a weapon's properties
const weaponReach = (properties: string[]) => {
  const range = properties.map((p) => p.match(/range (\d+)\/(\d+)/i)).find(Boolean);
  return { reach: properties.some((p) => /^reach/i.test(p)) ? 10 : 5, ...(range ? { range: [Number(range[1]), Number(range[2])] as [number, number] } : {}) };
};

export function carriedWeapons(character: any): CarriedWeapon[] {
  const scores = character?.abilityScores ?? {};
  const str = getAbilityModifier(scores.strength ?? 10);
  const dex = getAbilityModifier(scores.dexterity ?? 10);
  const proficiency = calculateProficiencyBonus(Number(character?.level) || 1);
  const carried: string[] = inUse(character).map((name) => name.toLowerCase());
  const owned = equipment.filter((e) => e.category === "Weapon" && e.damage && carried.includes(e.name.toLowerCase()));
  const weapons: CarriedWeapon[] = owned.map((e) => {
    const ranged = /blaster/i.test(e.weaponClassification ?? "");
    const finesse = (e.properties ?? []).some((p) => /^finesse/i.test(p));
    const ability = ranged || (finesse && dex > str) ? "dexterity" : "strength";
    const modifier = ability === "dexterity" ? dex : str;
    const proficient = hasWeaponProficiency(String(character?.class ?? ""), e);
    const [dice, damageType = ""] = e.damage!.split(" ");
    return {
      name: e.name,
      type: (e.weaponClassification ?? "Weapon").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ (\w)/, (_, c) => ` ${c.toLowerCase()}`),
      ranged,
      dice,
      damageType,
      ability,
      proficient,
      properties: e.properties ?? [],
      ...weaponReach(e.properties ?? []),
      attackBonus: modifier + (proficient ? proficiency : 0),
      damageBonus: modifier,
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
  const klass = getClassById(character.class);
  const needLevel = text.match(/(\d+)(?:st|nd|rd|th) level/i);
  if (needLevel && level < Number(needLevel[1])) return `needs ${needLevel[0]}`;
  const cast = text.match(/ability to cast (?:(\d+)(?:st|nd|rd|th)-level )?(force or tech|force|tech) powers/i);
  if (cast) {
    const kinds = cast[2].toLowerCase().split(" or ");
    const can = kinds.some((kind) => klass?.casterType.toLowerCase() === kind || (kind === "force" ? character.forcePowers : character.techPowers)?.length > 0);
    if (!can || (cast[1] && calculateMaxPowerLevel(level, klass?.id) < Number(cast[1]))) return `needs ${cast[0]}`;
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

// Archetypes open to a character that has reached the level for one and has none yet
export function archetypeOptions(character: any, level = Number(character?.level) || 1): ClassArchetype[] {
  const klass = getClassById(character?.class);
  if (!klass || level < klass.archetypeLevel || findArchetype(character)) return [];
  return archetypes.filter((a) => a.parentClass === klass.id);
}

// The saved fields that change when a character takes an archetype outside a level-up
export function chooseArchetype(character: any, archetypeId: string): Record<string, any> | null {
  if (!archetypeOptions(character).some((a) => a.id === archetypeId)) return null;
  const { hitPoints, fields } = featureChanges(character, { ...character, subclass: archetypeId });
  return { subclass: archetypeId, maxHp: character.maxHp + hitPoints, currentHp: character.currentHp + hitPoints, ...fields };
}

// ---------------------------------------------------------------------------------------------
// Gaining a level
// ---------------------------------------------------------------------------------------------

// Experience points needed to be a level (Player's Handbook, Character Advancement)
export const experienceForLevel = (level: number): number =>
  (advancement as any[]).find((row) => row.level === level)?.experiencePoints ?? Infinity;

export const canLevelUp = (currentLevel: number, currentExperience: number): boolean =>
  currentLevel < 20 && currentExperience >= experienceForLevel(currentLevel + 1);

export const calculateExperienceForNextLevel = (currentLevel: number, currentExperience: number): number =>
  currentLevel >= 20 ? 0 : Math.max(0, experienceForLevel(currentLevel + 1) - currentExperience);

const knownPowers = (character: any): any[] => [...(character.forcePowers ?? []), ...(character.techPowers ?? [])];

// Powers the character may learn at a level: of its class's kind, castable, not yet known, and
// with the power they build on already known
export function powerOptions(character: any, level: number): any[] {
  const klass = getClassById(character.class);
  if (!klass || klass.casterType === "None") return [];
  const known = new Set(knownPowers(character).map((p) => String(p.name).toLowerCase()));
  const maxLevel = calculateMaxPowerLevel(level, klass.id);
  const pool: any[] = klass.casterType === "Force" ? forcePowers : techPowers;
  return pool
    .filter((p) => p.level <= maxLevel && !known.has(p.name.toLowerCase()) && (!p.prerequisite || known.has(p.prerequisite.toLowerCase())))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface LevelUpPlan {
  level: number;
  // Class features gained at the new level
  features: Feature[];
  // Archetypes to choose from, when the character has reached the level for one and has none
  archetypes: ClassArchetype[];
  abilityScoreImprovement: boolean;
  powersToLearn: number;
  powerOptions: any[];
}

export function levelUpPlan(character: any): LevelUpPlan | null {
  const level = Number(character?.level) || 1;
  const klass = getClassById(character?.class);
  if (!klass || !canLevelUp(level, Number(character.experience) || 0)) return null;
  const next = level + 1;
  const options = powerOptions(character, next);
  return {
    level: next,
    features: klass.features.filter((f) => f.level === next).map((f) => ({ ...f, source: klass.name })),
    archetypes: archetypeOptions(character, next),
    abilityScoreImprovement: klass.features.some((f) => f.level === next && /^Ability Score Improvement/i.test(f.name)),
    powersToLearn: Math.min(options.length, Math.max(0, calculatePowersKnown(klass.id, next) - knownPowers(character).length)),
    powerOptions: options,
  };
}

export interface LevelUpChoices {
  archetype?: string;
  // An Ability Score Improvement: two points among the abilities (the same one twice for +2), or a feat
  abilities?: string[];
  feat?: string;
  // The ability a feat raises, when it offers more than one
  featAbility?: string;
  powers?: string[];
}

// The saved fields that change when the character gains a level with these choices, or what is
// still missing from the choices
export function applyLevelUp(character: any, choices: LevelUpChoices): { changes?: Record<string, any>; problems: string[] } {
  const plan = levelUpPlan(character);
  if (!plan) return { problems: ["Not enough experience for the next level."] };
  const klass = getClassById(character.class)!;
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

  const picked = plan.powerOptions.filter((p) => (choices.powers ?? []).includes(p.name));
  if (picked.length !== plan.powersToLearn) problems.push(`Choose ${plan.powersToLearn} new power${plan.powersToLearn === 1 ? "" : "s"} (${picked.length} chosen).`);
  if (problems.length) return { problems };

  const featured = featureChanges(character, { ...character, level: plan.level, subclass: archetype?.id ?? character.subclass, feats, abilityScores: scores });
  const conBefore = getAbilityModifier(character.abilityScores?.constitution ?? 10);
  const conNow = getAbilityModifier(scores.constitution ?? 10);
  // The average of the Hit Die, plus Constitution; a higher Constitution counts for earlier levels too
  const hitPoints = Math.max(1, klass.hitDie / 2 + 1 + conNow) + (conNow - conBefore) * (plan.level - 1) + featured.hitPoints;
  const points = calculatePowerPoints(klass.id, plan.level, scores as any) - calculatePowerPoints(klass.id, plan.level - 1, character.abilityScores);
  const force = picked.filter((p) => "forceAlignment" in p);
  const tech = picked.filter((p) => !("forceAlignment" in p));

  return {
    problems,
    changes: {
      level: plan.level,
      proficiencyBonus: calculateProficiencyBonus(plan.level),
      abilityScores: scores,
      maxHp: character.maxHp + hitPoints,
      currentHp: character.currentHp + hitPoints,
      maxForcePoints: Math.max(0, character.maxForcePoints + points),
      currentForcePoints: Math.max(0, character.currentForcePoints + points),
      ...featured.fields,
      ...(archetype ? { subclass: archetype.id } : {}),
      ...(feats.length !== (character.feats ?? []).length ? { feats } : {}),
      ...(force.length ? { forcePowers: [...(character.forcePowers ?? []), ...force] } : {}),
      ...(tech.length ? { techPowers: [...(character.techPowers ?? []), ...tech] } : {}),
    },
  };
}

// The standard array (Player's Handbook, Determine Ability Scores)
export const getStandardAbilityArray = (): number[] => [15, 14, 13, 12, 10, 8];
