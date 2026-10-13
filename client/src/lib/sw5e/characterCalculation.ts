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
} from "./rules";
import { getClassById, getClassLevelValue } from "./classes";
import { getSpeciesById } from "./species";
import { archetypes, type ClassArchetype } from "./archetypes";
import { findFeatByName, type Feat } from "./feats";
import { forcePowers } from "./forcePowers";
import { techPowers } from "./techPowers";
import { equipment } from "./equipment";
import { SKILLS } from "./constants";

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
  const carried: string[] = (character.equipment ?? []).map((e: any) => e?.name ?? e);
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

// A feat's ability increase: the abilities it offers (one of them goes up by 1)
export const featAbilityOptions = (name: string): string[] => {
  const offered = (findFeatByName(name)?.attributesIncreased ?? []).map((a) => a.toLowerCase());
  return offered.includes("any") ? [...ABILITIES] : offered.filter(isAbility);
};

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
      if (!feat) problems.push("That feat is not in the rules data.");
      else if (feats.includes(feat.name)) problems.push(`${feat.name} is already taken.`);
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
