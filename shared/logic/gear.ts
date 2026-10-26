// What a piece of gear does, read from its text (2026-10-21, asked by the user: every item must serve its purpose as the rules say). A leaf
// module (no game state), like caves.ts and shipyard.ts: index.ts's `gearUse` reads every item through it, and the fight, the clock and
// the map apply what it finds. The text is the equipment data's description, or, where the data has none, the book chapter's
// (`gear.json` `texts`, derived by the importer: the environmental suits, the oxygen tank, the rations). Where the books give an item no
// rule at all (a bedroll, a mirror, a shovel), the use is a house rule, labelled where the game applies it.
import gearData from "../data/sw5e/gear.json";

export const GEAR = gearData as unknown as {
  texts: Record<string, string>;
  droids: { designation: string; cost: number }[];
  lifestyle: { name: string; cost: number }[];
  rules: Record<string, string>;
};
const squash = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
export const gearText = (item: { name: string; description?: string }) => squash(item.description?.trim() ? item.description : GEAR.texts[item.name] ?? "");
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
const num = (s: string | undefined) => (s === undefined ? 0 : NUM[s.toLowerCase()] ?? (Number(s.replace(/,/g, "")) || 0));
const CONDITION_WORDS = ["blinded", "deafened", "frightened", "poisoned", "shocked", "stunned", "restrained", "prone", "slowed", "corroded", "ignited", "weakened"];

// ---- Ammunition --------------------------------------------------------------------------------------------------------------------

// What a weapon is fed with: power cells, slug cartridges, or the ammunition of a special weapon (bows arrows, a bolt-thrower bolts, a
// wrist launcher darts, missiles, flechette clips, projector canisters and snares, a flechette cannon mags, a vapor projector tanks, a
// rocket launcher rockets, a torpedo launcher torpedoes, a blaster cannon a power generator)
export type AmmoFamily = "cell" | "cartridge" | "arrow" | "bolt" | "wrist" | "mag" | "tank" | "rocket" | "torpedo" | "generator";
export function ammoFamilyOf(weapon: { name: string; properties?: string[] | null }): AmmoFamily | undefined {
  const props = (weapon.properties ?? []).join(";").toLowerCase();
  const n = weapon.name.toLowerCase();
  if (/power cell/.test(props)) return "cell";
  if (/slug cartridge/.test(props)) return "cartridge";
  if (/blaster cannon/.test(n)) return "generator";
  if (/\bbow\b|bow$|longbow|shortbow|compound bow/.test(n) && !/bowcaster/.test(n)) return "arrow";
  if (/bolt-thrower|bolt thrower/.test(n)) return "bolt";
  if (/wrist launcher/.test(n)) return "wrist";
  if (/flechette cannon/.test(n)) return "mag";
  if (/vapor projector/.test(n)) return "tank";
  if (/rocket launcher|rocket rifle/.test(n)) return "rocket";
  if (/torpedo launcher/.test(n)) return "torpedo";
  return undefined;
}
// The family an ammunition item belongs to, and how it loads: a cell or a generator fills the weapon (its reload number of shots); the
// rest are a round a shot (a flechette clip or mag, a projector canister or tank: three shots in a line, house reading: a shot each)
export function ammoItemFamily(name: string): AmmoFamily | undefined {
  const n = name.toLowerCase();
  if (/^power generator/.test(n)) return "generator";
  if (/cell$|^power cell/.test(n)) return "cell";
  if (/cartridge$/.test(n)) return "cartridge";
  if (/^arrow/.test(n)) return "arrow";
  if (/^bolt/.test(n)) return "bolt";
  if (/dart$|^dart|^missile|^flechette clip|^projector canister|^snare/.test(n)) return "wrist";
  if (/^flechette mag/.test(n)) return "mag";
  if (/^projector tank/.test(n)) return "tank";
  if (/^rocket/.test(n)) return "rocket";
  if (/^torpedo/.test(n)) return "torpedo";
  return undefined;
}
export const fillsWeapon = (family: AmmoFamily) => family === "cell" || family === "generator";
// Shots of a load: the weapon's reload number (a weapon with none, a bow, draws a round at a time: 1)
export const reloadOf = (weapon: { properties?: string[] | null }) => Number((weapon.properties ?? []).join(";").match(/reload (\d+)/i)?.[1] ?? 0);
export const burstOf = (weapon: { properties?: string[] | null }) => Number((weapon.properties ?? []).join(";").match(/burst (\d+)/i)?.[1] ?? 0);
export const rapidOf = (weapon: { properties?: string[] | null }) => Number((weapon.properties ?? []).join(";").match(/rapid (\d+)/i)?.[1] ?? 0);
// A power generator's shots (house rule: the book gives a blaster cannon's generator no number): 10
export const GENERATOR_SHOTS = 10;

// What a round adds to a hit (or, for a missile or rocket, hit or miss): a saving throw, damage and a condition; a cell that changes the
// weapon's damage type; an area (a missile's burst, the line or cone of a flechette clip or projector); fire left burning
export interface AmmoRider {
  save?: string;
  dc?: number;
  dice?: string;
  type?: string;
  half?: boolean;
  condition?: string;
  // Turns the condition lasts (10 a minute), repeated at the end of its turns where the text says so
  rounds?: number;
  repeat?: boolean;
  // A cell of another kind: the weapon's damage becomes this type
  becomes?: string;
  // An explosion (a missile, a rocket, a combustive arrow): every creature within the radius saves, hit or miss
  burst?: { radius: number; save: string; dc: number; dice: string; type: string; half: boolean; hitOrMiss: boolean };
  // A line or cone instead of an attack (flechettes, projectors)
  area?: { shape: "line" | "cone"; length: number; save: string; dc: number; dice: string; type: string; half: boolean };
  // The ground set ablaze (5- or 15-foot) for a minute: a save each turn there
  fire?: { radius: number; dice: string; dc: number };
  // Reduced to 0 hit points: a Constitution save or disintegrated / frozen in carbonite
  finish?: { dc: number; what: "disintegrated" | "frozen" };
  // A snare or net: restrained until freed (a DC to escape)
  restrains?: { dc: number; max: string };
  // A weapon's own damage per round (a dart 1d6, a bolt 2d6, a torpedo 20d4)
  base?: { dice: string; type: string };
  // An enhanced round's bonus to the attack and damage of its shot
  bonus?: number;
}
const firstSave = (t: string) => t.match(/DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
export function ammoRider(item: { name: string; description?: string }): AmmoRider {
  const t = gearText(item);
  const out: AmmoRider = {};
  const base = t.match(/deals (\d+d\d+) (\w+) damage on a hit/i);
  if (base) out.base = { dice: base[1], type: base[2].toLowerCase() };
  const becomes = t.match(/deals (\w+) damage instead of its normal damage type/i);
  if (becomes) out.becomes = becomes[1].toLowerCase();
  const save = firstSave(t);
  const area = t.match(/(?:in a short line|in a line) (\d+) feet long and 5 feet wide|a (\d+)-foot cone/i);
  const half = /half (?:as much|damage)/i.test(t);
  const dmg = (from: string) => from.match(/(?:take|taking|takes) (\d+d\d+) (\w+) damage/i) ?? from.match(/(\d+d\d+) (\w+) damage/i);
  if (/hit or miss, the (?:missile|rocket) then explodes/i.test(t) || /detonates\. Each creature within (\d+) ?ft/i.test(t)) {
    const radius = Number(t.match(/within (\d+) ?(?:feet|ft)/i)?.[1] ?? 5);
    const d = dmg(t.split(/explodes|detonates/i)[1] ?? "");
    if (save && d) out.burst = { radius, save: save[2].toLowerCase(), dc: Number(save[1]), dice: d[1], type: d[2].toLowerCase(), half, hitOrMiss: /hit or miss/i.test(t) };
  } else if (area && save) {
    const d = dmg(t);
    if (d) out.area = { shape: area[2] ? "cone" : "line", length: Number(area[1] ?? area[2]), save: save[2].toLowerCase(), dc: Number(save[1]), dice: d[1], type: d[2].toLowerCase(), half };
  } else if (save) {
    const d = dmg(t.slice(save.index ?? 0));
    out.save = save[2].toLowerCase();
    out.dc = Number(save[1]);
    if (d) {
      out.dice = d[1];
      out.type = d[2].toLowerCase();
    }
    out.half = half;
  }
  const failed = t.split(/On a failed save|or take|taking/i).slice(1).join(" ").split(/On a successful save|On a success/i)[0] || t;
  const cond = CONDITION_WORDS.find((c) => new RegExp(`\\b(?:is|becomes|be|gains \\d+) ${c}|${c} (?:until|for)|\\b${c}\\b`, "i").test(failed) && !/immune/i.test(failed.split(c)[0].slice(-30)));
  if (cond && !out.burst && !out.area) {
    out.condition = cond;
    out.rounds = /for 1 minute/i.test(t) ? 10 : 1;
    out.repeat = /repeat this save/i.test(t);
  } else if (cond && (out.area || out.burst)) {
    out.condition = cond;
    out.rounds = 1;
  }
  const fire = t.match(/ablaze for 1 minute.*?When a creature enters the fire or starts its turn there,? it must make a DC (\d+) Dexterity saving throw.*?takes (\d+d\d+) fire damage/i);
  const ablaze = t.match(/in a (\d+)[- ]foot (?:radius|square) ablaze|a (\d+)-foot square ablaze/i);
  if (fire) out.fire = { radius: Number(ablaze?.[1] ?? ablaze?.[2] ?? 5), dc: Number(fire[1]), dice: fire[2] };
  const finish = t.match(/reduce[sd]? a creature to 0 hit points[^.]*DC (\d+) Constitution/i);
  if (finish) out.finish = { dc: Number(finish[1]), what: "disintegrated" };
  if (/frozen in carbonite/i.test(t)) out.finish = { dc: 0, what: "frozen" };
  const snare = t.match(/(Medium|Large) or smaller creature is restrained.*?DC (\d+) Strength/i);
  if (snare) out.restrains = { dc: Number(snare[2]), max: snare[1] };
  return out;
}

// A calibrator or collimator: applied to a weapon of its kind as an action, +1 to damage for a minute and a property (sonorous,
// shocking, neuralizing 13)
export function calibratorOf(item: { name: string; description?: string }): { weapon: "vibroweapon" | "lightweapon"; damage: number; attack?: number; dice?: string; property?: string; rounds: number } | undefined {
  const t = gearText(item);
  const m = t.match(/apply this (calibrator|collimator) to one (vibroweapon|lightweapon)[^,]*, granting it a \+(\d+) bonus to (attack and )?damage rolls for 1 minute/i);
  // The top grades: "+3 bonus to attack rolls and dealing an additional 1d8 damage"
  const top = t.match(/apply this (calibrator|collimator) to one (vibroweapon|lightweapon)[^,]*, granting it a \+(\d+) bonus to attack rolls and dealing an additional (\d+d\d+) damage for 1 minute/i);
  if (!m && !top) return undefined;
  const prop = t.match(/gains the (\w+ \d+) property/i)?.[1];
  if (top) return { weapon: top[2].toLowerCase() as "vibroweapon" | "lightweapon", damage: 0, attack: Number(top[3]), dice: top[4], property: prop, rounds: 10 };
  return { weapon: m![2].toLowerCase() as "vibroweapon" | "lightweapon", damage: Number(m![3]), ...(m![4] ? { attack: Number(m![3]) } : {}), property: prop, rounds: 10 };
}

// ---- Accessories -----------------------------------------------------------------------------------------------------------------

export interface AccessoryFacts {
  // Reloading or drawing without an action or an object interaction (once a turn where the text says so)
  reload?: { families: AmmoFamily[]; holds?: number };
  draw?: "free" | "holster";
  // Powered flight, swimming or a slow descent: the speed, minutes a power cell (and the most), or a fixed time
  fly?: number;
  swim?: number;
  descent?: number;
  minutes?: number;
  perCell?: boolean;
  maxMinutes?: number;
  // A climbing speed equal to the walking speed (friction grips)
  climb?: boolean;
  // Extra damage on an unarmed attack
  unarmed?: { dice: string; type: string };
  // Advantage on Stealth that relies on sight, for a time; ends on an attack or a power
  stealth?: boolean;
  // Light items carried without counting toward encumbrance
  carryFree?: { items: number; each: number };
  // Braced: ignores a blaster's Strength requirement; speed 0; +10 against being disarmed
  brace?: { prone: boolean; minutes: number };
  // Pairs with mines (how many, within how far to pair and to set them off)
  detonator?: { mines: number; pair: number; range: number };
  // A launcher of its own (a rocketpack's)
  launcher?: { normal: number; long: number; reload: number };
}
export function accessoryOf(item: { name: string; description?: string }): AccessoryFacts {
  const t = gearText(item);
  const out: AccessoryFacts = {};
  if (/without using an object interaction|does not require (?:an|your) object interaction|reloaded, it can be done without using an action/i.test(t)) {
    const families: AmmoFamily[] = [];
    if (/slug cartridge/i.test(t)) families.push("cartridge");
    if (/power cell/i.test(t)) families.push("cell");
    if (/arrows/i.test(t)) families.push("arrow");
    if (/bolts/i.test(t)) families.push("bolt");
    if (/darts/i.test(t)) families.push("wrist");
    if (/grenade|vibrodagger/i.test(t) && /bandolier/i.test(item.name)) families.push("cell");
    out.reload = { families, holds: num(t.match(/holds? (\d+)|slots to hold (\w+)|has (\d+) pockets|hold up to (\d+)/i)?.slice(1).find(Boolean)) || undefined };
  }
  if (/draw a weapon stored in a holster without using an action/i.test(t)) out.draw = "holster";
  const fly = t.match(/flying speed of (\d+) feet/i);
  if (fly) out.fly = Number(fly[1]);
  const swim = t.match(/swimming speed of (\d+) feet/i);
  if (swim) out.swim = Number(swim[1]);
  const down = t.match(/rate of descent slow to (\d+) feet/i);
  if (down) out.descent = Number(down[1]);
  const lasts = t.match(/lasts? for (\d+) minutes? per power cell \(to a maximum of (\d+) minutes\)/i) ?? t.match(/last for (\d+) minutes? per power cell \(to a maximum of (\d+) minutes\)/i);
  if (lasts) {
    out.minutes = Number(lasts[1]);
    out.perCell = true;
    out.maxMinutes = Number(lasts[2]);
  } else {
    const fixed = t.match(/lasts? for (\d+) minutes?/i);
    if (fixed) out.minutes = Number(fixed[1]);
  }
  if (/climbing speed equal your walking speed|climbing speed equal to your walking speed/i.test(t)) out.climb = true;
  const shock = t.match(/deals (\d+d\d+) (\w+) damage to any objects that the glove/i);
  if (shock) out.unarmed = { dice: shock[1], type: shock[2].toLowerCase() };
  if (/advantage on Dexterity \(Stealth\) ability checks that rely on sight/i.test(t)) out.stealth = true;
  const vest = t.match(/carry up to (\d+) light items \(up to ([\d.]+) lb each\) without increasing their total encumbrance/i);
  if (vest) out.carryFree = { items: Number(vest[1]), each: Number(vest[2]) };
  if (/ignore the Strength requirement/i.test(t)) out.brace = { prone: /while prone/i.test(t), minutes: /Over the course of 1 minute/i.test(t) ? 1 : 0 };
  const det = t.match(/pair the detonator with up to (\w+) mines within (\d+) feet[^.]*\.[^.]*\.[^.]*within (\d+) feet/i);
  if (det) out.detonator = { mines: num(det[1]), pair: Number(det[2]), range: Number(det[3]) };
  const rp = t.match(/integrated rocket launcher with the Ammunition \(range (\d+)\/(\d+)\) and reload (\d+)/i);
  if (rp) out.launcher = { normal: Number(rp[1]), long: Number(rp[2]), reload: Number(rp[3]) };
  return out;
}

// Speed in water (Player's Handbook, Swimming: each foot of movement costs 1 extra foot unless the creature has a swimming speed): half
// the walking speed, at least 5 ft., or the swimming speed of gear running (a propulsion pack)
export const waterSpeed = (walking: number, swim = 0) => swim || Math.max(5, Math.floor(walking / 2));

// ---- Life support, survival and the environment --------------------------------------------------------------------------------------

// The hazards of a place (house rule for where they are: see index.ts `hazardsAt`; what answers them is the books'): no air (vacuum),
// bad air (toxic gas), water (under it), high pressure (the deep), cold, heat, darkness, low or high gravity, radiation
export type EnvHazard = "vacuum" | "toxic" | "underwater" | "pressure" | "cold" | "heat" | "dark" | "gravity" | "radiation" | "fire";
export interface SuitFacts {
  resist: string[];
  immune: string[];
  protects: EnvHazard[];
  // Hours of air it carries (an environmental suit 8, a respirator 1, an oxygen tank 8 to refill)
  air: number;
  speed: number;
  advantage: string[];
  breathesWater?: boolean;
}
export function suitOf(item: { name: string; description?: string }): SuitFacts | undefined {
  const t = gearText(item);
  if (!t) return undefined;
  const resist = Array.from(t.matchAll(/resistance to (\w+) damage/gi)).map((m) => m[1].toLowerCase());
  const immune = Array.from(t.matchAll(/immune to the (\w+) condition/gi)).map((m) => m[1].toLowerCase());
  const protects: EnvHazard[] = [];
  if (/hazards associated with low pressure|vacuum of space/i.test(t)) protects.push("vacuum");
  if (/hazards associated with high pressure/i.test(t)) protects.push("pressure");
  if (/noxious gases|immune to the poisoned condition/i.test(t)) protects.push("toxic");
  if (/breath(?:e)? underwater/i.test(t)) protects.push("underwater");
  if (/resistance to fire damage/i.test(t)) protects.push("fire", "heat");
  if (/resistance to cold damage|cold climates/i.test(t)) protects.push("cold");
  if (/resistance to necrotic damage/i.test(t)) protects.push("radiation");
  const air = Number(t.match(/(\d+) hours?'? (?:capacity|worth) of oxygen/i)?.[1] ?? t.match(/includes (\d+) hours?'s worth of oxygen/i)?.[1] ?? 0) || (/includes 1 hour's worth of oxygen/i.test(t) ? 1 : 0);
  if (air && !protects.includes("vacuum") && /all environments/i.test(t)) protects.push("toxic", "vacuum");
  const speed = -Number(t.match(/speed is reduced by (\d+)/i)?.[1] ?? 0);
  const advantage = Array.from(t.matchAll(/advantage on saving throws to avoid ([^,.]+)/gi)).map((m) => m[1].trim()).concat(/advantage on ability checks and saving throws to avoid being moved/i.test(t) ? ["being moved"] : []);
  if (!resist.length && !immune.length && !protects.length && !air) return undefined;
  return { resist, immune, protects: [...new Set(protects)], air, speed, advantage, breathesWater: /breath(?:e)? underwater/i.test(t) };
}
// An air supply: a respirator's hour, an underwater respirator's hour a power cell, an oxygen tank's eight to refill a suit or respirator
export function airOf(item: { name: string; description?: string }): { hours: number; refill?: boolean; underwater?: boolean; perCell?: boolean } | undefined {
  const t = gearText(item);
  if (/oxygen tanks? include (\d+) hours/i.test(t)) return { hours: Number(t.match(/include (\d+) hours/i)![1]), refill: true };
  const under = t.match(/functions for (\d+) hours? per power cell \(to a maximum of (\d+) hours\)/i);
  if (under) return { hours: Number(under[1]), underwater: true, perCell: true };
  if (/includes 1 hour's worth of oxygen/i.test(t)) return { hours: 1 };
  return undefined;
}
// Food: a day's rations for one
export const foodOf = (item: { name: string; description?: string }) => (/rations \(one day's\)/i.test(item.name) || /provide all the necessary nourishment for one person for one day|enough food for one person per day/i.test(gearText(item)) ? { days: 1 } : undefined);
// Water a container holds, in pints (a gallon is 8 pints)
export function liquidOf(item: { name: string; description?: string }): number {
  const t = gearText(item);
  const m = t.match(/stores (\d+(?:\/\d+)?(?: and \d+\/\d+)?) (pints?|gallons?|ounces?) of liquid/i);
  if (!m) return 0;
  const amount = m[1].trim().split(/\s+and\s+/).reduce((n, part) => n + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part) || 0), 0);
  const unit = (m[2] ?? "gallon").toLowerCase();
  return unit.startsWith("gallon") ? amount * 8 : unit.startsWith("ounce") ? amount / 16 : amount;
}
// What a container holds (pounds), a hidden part of it (pounds, and the Investigation DC to find it), its lock (a security kit DC), its speed
export function containerOf(item: { name: string; description?: string }): { lb?: number; pints?: number; hidden?: number; hiddenDc?: number; lock?: number; speed?: number } | undefined {
  const t = gearText(item);
  const lb = t.match(/stores ([\d,.]+) ?lb/i) ?? t.match(/can store ([\d,.]+) lb/i);
  const oz = t.match(/stores (\d+) ounces, not exceeding/i);
  const pints = liquidOf(item);
  const hidden = t.match(/hidden (?:storage )?compartment that stores ([\d.]+) lb|(\w+) hidden pockets, each of which can store up to ([\d.]+) lb/i);
  // ("two hidden pockets", "three hidden pockets" of the better grades)
  const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const dc = t.match(/requires a DC (\d+) Investigation check/i);
  const lock = t.match(/requires a DC (\d+) security kit to force open/i);
  const speed = t.match(/has a speed of (\d+) feet/i);
  if (!lb && !oz && !pints && !hidden) return undefined;
  return {
    ...(lb ? { lb: Number(lb[1].replace(/,/g, "")) } : oz ? { lb: Number(oz[1]) / 16 } : {}),
    ...(pints ? { pints } : {}),
    ...(hidden ? { hidden: hidden[1] ? Number(hidden[1]) : (COUNT[hidden[2].toLowerCase()] ?? 2) * Number(hidden[3]), hiddenDc: Number(dc?.[1] ?? 15) } : {}),
    ...(lock ? { lock: Number(lock[1]) } : {}),
    ...(speed ? { speed: Number(speed[1]) } : {}),
  };
}
// Light a glowrod sheds: bright and dim radii, hours before it needs a power cell
export function lightOf(item: { name: string; description?: string }): { bright: number; dim: number; hours: number } | undefined {
  const m = gearText(item).match(/bright light for a (\d+)-foot radius and dim light for an additional (\d+) feet\. The \w+ lasts for (\d+) hours/i);
  return m ? { bright: Number(m[1]), dim: Number(m[2]), hours: Number(m[3]) } : undefined;
}
// A belt generator: a field around the wearer for some minutes (a gravity generator: standard gravity; a heat generator: adapted to cold)
export function generatorOf(item: { name: string; description?: string }): { answers: EnvHazard; minutes: number } | undefined {
  const t = gearText(item);
  const minutes = Number(t.match(/lasts for (\d+) minutes/i)?.[1] ?? 0);
  if (/move as if in a standard gravitational pull/i.test(t)) return { answers: "gravity", minutes };
  if (/adapted to cold climates/i.test(t)) return { answers: "cold", minutes };
  return undefined;
}

// ---- Rules the gear answers to (the Player's Handbook, derived into gear.json) -------------------------------------------------------

// Days without food a character can go: 3 + Constitution modifier (at least 1); water a day in pints (a gallon, two when it is hot)
export function foodRule(): { graceBase: number; gallons: number; hotGallons: number; halfSaveDc: number } {
  const food = GEAR.rules.food ?? "";
  const water = GEAR.rules.water ?? "";
  return {
    graceBase: Number(food.match(/equal to (\d+) \+ (?:his or her|their) Constitution modifier/i)?.[1] ?? 3),
    gallons: num(water.match(/needs (\w+) gallons? of water per day/i)?.[1]) || 1,
    hotGallons: num(water.match(/or (\w+) gallons per day if the weather is hot/i)?.[1]) || 2,
    halfSaveDc: Number(water.match(/DC (\d+) Constitution saving throw/i)?.[1] ?? 15),
  };
}
// Holding one's breath: 1 + Constitution modifier minutes (at least half a minute), then Constitution modifier rounds (at least 1)
export function breathRule(conMod: number): { minutes: number; rounds: number } {
  const t = GEAR.rules.suffocating ?? "";
  const base = Number(t.match(/equal to (\d+) \+ its Constitution modifier/i)?.[1] ?? 1);
  return { minutes: Math.max(0.5, base + conMod), rounds: Math.max(1, conMod) };
}
// Carrying capacity: Strength x 15 (x2 a size above Medium, x0.5 Tiny); the variant: encumbered over 5 x Strength (speed -10), heavily
// over 10 x Strength (speed -20, disadvantage on Strength, Dexterity and Constitution checks, attacks and saves)
export function carryRule(): { capacity: number; encumbered: number; heavily: number; encumberedSpeed: number; heavilySpeed: number } {
  const c = GEAR.rules.carrying ?? "";
  const e = GEAR.rules.encumbrance ?? "";
  return {
    capacity: Number(c.match(/Strength score multiplied by (\d+)/i)?.[1] ?? 15),
    encumbered: Number(e.match(/in excess of (\d+) times your Strength score, you are \*{0,3}encumbered/i)?.[1] ?? 5),
    heavily: Number(e.match(/in excess of (\d+) times your Strength score, up to your maximum/i)?.[1] ?? 10),
    encumberedSpeed: Number(e.match(/speed drops by (\d+) feet\./i)?.[1] ?? 10),
    heavilySpeed: Number(e.match(/speed drops by (\d+) feet and you have disadvantage/i)?.[1] ?? 20),
  };
}
export const lifestyleCost = (name: string) => GEAR.lifestyle.find((l) => l.name.toLowerCase() === name.toLowerCase())?.cost ?? 10;

// ---- A day's food and water (Player's Handbook, Food and Water; the lifestyle expenses of chapter 5) ---------------------------------

// Where the day was spent: in a settlement the lifestyle paid covers food, drink and lodging (the book), and the canteens are filled;
// aboard the party's ship its stores give water (house rule), food is the rations carried (or a hydroponics garden); in the wild the
// rations carried, or what is foraged (Wisdom (Survival) against a DC by the land, house rule after the DMG's foraging DCs)
export interface Supplies {
  // The day last provided for
  day: number;
  // Days in a row without food, and the pints of water carried
  hungry: number;
  water: number;
  // The levels of exhaustion owed to hunger and thirst: a long rest cannot take them off until the character has eaten and drunk
  lack: number;
  lifestyle?: string;
}
export interface DayPlace {
  where: "settlement" | "ship" | "wild";
  hot: boolean;
  // The pints the containers carried hold
  capacity: number;
  conMod: number;
  // The forage check's bonus and DC (none in the wild means nothing grows: a DC of 99)
  survival: number;
  forageDc: number;
  // Aboard a ship with a hydroponics garden: food
  garden?: boolean;
  // Water to be had at will (an item that makes it, such as an atmospheric decanting vessel)
  water?: boolean;
}
export interface DayResult {
  supplies: Supplies;
  cost: number;
  // Rations eaten (item names, one a day)
  eaten: string[];
  exhaustion: number;
  notes: string[];
}
// The forage DC of a land (house rule from the DMG's food and water abundance: 10 plenty, 15 some, 20 little; 99 none)
export const FORAGE_DC: Record<string, number> = { forest: 10, jungle: 10, swamp: 10, temperate: 10, ocean: 15, urban: 15, desert: 20, ice: 20, volcanic: 20, barren: 99, "gas giant": 99 };
export const HOT_LANDS = ["desert", "volcanic"];
export function passDays(start: Supplies, upTo: number, place: DayPlace, credits: number, rations: string[], roll: () => number): DayResult {
  const rule = foodRule();
  const s: Supplies = { ...start };
  let cost = 0;
  const eaten: string[] = [];
  let exhaustion = 0;
  const notes: string[] = [];
  const pack = [...rations];
  const grace = Math.max(1, rule.graceBase + place.conMod);
  let lastFull = upTo <= start.day && start.lack === 0;
  for (let day = start.day + 1; day <= upTo; day++) {
    let fed = false;
    let watered = false;
    if (place.where === "settlement") {
      const price = lifestyleCost(s.lifestyle ?? "Modest");
      if (credits - cost >= price) {
        cost += price;
        fed = watered = price > 0;
        if (!price) notes.push("A wretched day: you sleep rough and go hungry (the book: hunger follows you).");
      } else notes.push(`You cannot pay a ${s.lifestyle ?? "Modest"} lifestyle (${price} cr a day): you go hungry.`);
      s.water = place.capacity;
      watered = true;
    } else {
      if (place.where === "ship" || place.water) {
        s.water = place.capacity;
        watered = true;
        if (place.garden) fed = true;
      }
      if (!fed && pack.length) {
        eaten.push(pack.shift()!);
        fed = true;
      }
      if (!fed || !watered) {
        const d = Math.floor(roll() * 20) + 1;
        if (place.forageDc < 99 && d + place.survival >= place.forageDc) {
          fed = true;
          watered = true;
          notes.push(`Day ${day}: you forage what you need (Survival ${d + place.survival} against DC ${place.forageDc}).`);
        } else if (place.forageDc < 99) notes.push(`Day ${day}: foraging finds nothing (Survival ${d + place.survival} against DC ${place.forageDc}).`);
      }
      if (!watered) {
        const need = 8 * (place.hot ? rule.hotGallons : rule.gallons);
        const drunk = Math.min(need, s.water);
        s.water -= drunk;
        if (drunk >= need) watered = true;
        else if (drunk >= need / 2) {
          const save = Math.floor(roll() * 20) + 1 + place.conMod;
          if (save < rule.halfSaveDc) {
            const n = start.lack + exhaustion > 0 ? 2 : 1;
            exhaustion += n;
            notes.push(`Day ${day}: half the water you need, Constitution ${save} against DC ${rule.halfSaveDc}: ${n} level${n > 1 ? "s" : ""} of exhaustion.`);
          } else watered = true;
        } else {
          const n = start.lack + exhaustion > 0 ? 2 : 1;
          exhaustion += n;
          notes.push(`Day ${day}: too little water: ${n} level${n > 1 ? "s" : ""} of exhaustion.`);
        }
      }
    }
    if (fed) s.hungry = 0;
    else {
      s.hungry += 1;
      if (s.hungry > grace) {
        exhaustion += 1;
        notes.push(`Day ${day}: ${s.hungry} days without food: a level of exhaustion.`);
      }
    }
    lastFull = fed && watered;
  }
  s.day = Math.max(start.day, upTo);
  // Eaten and drunk in full on the last day: what hunger and thirst brought can be rested off now
  s.lack = lastFull ? 0 : s.lack + exhaustion;
  return { supplies: s, cost, eaten, exhaustion, notes };
}

// ---- Exposure to a hazard: what protects, and what an hour without protection does -------------------------------------------------

export interface Protections {
  // Gear put on, and carried
  wearing: string[];
  carried: string[];
  // Damage types resisted (a suit's, a species' or a feature's)
  resist: string[];
  darkvision: boolean;
  // A light lit (a glowrod switched on), a belt generator running against a hazard
  light: boolean;
  generators: EnvHazard[];
  // Water carried (the DMG's heat: a creature with drinkable water to hand)
  water: boolean;
  // Minutes of air left in what is worn
  air: number;
  // Breathes water (a species' trait)
  gills?: boolean;
  // What each suit worn protects against (suitOf, read by the caller with the item's text)
  suits?: Record<string, EnvHazard[]>;
}
export interface Exposure {
  hazard: EnvHazard;
  safe: boolean;
  by?: string;
  // Breathing from a suit or respirator: its air runs down while here
  breathing?: boolean;
  // No protection and no time to find one: the book's death (vacuum, the deep) or drowning
  deadly?: boolean;
}
const wearsSuitFor = (p: Protections, h: EnvHazard): string | undefined => p.wearing.find((n) => (p.suits?.[n] ?? suitOf({ name: n })?.protects ?? []).includes(h));
export function exposure(h: EnvHazard, p: Protections): Exposure {
  const suit = wearsSuitFor(p, h);
  const respirator = p.wearing.find((n) => /^respirator/i.test(n));
  const underwaterMask = p.wearing.find((n) => /underwater respirator/i.test(n));
  switch (h) {
    case "vacuum":
    case "pressure":
      return suit && p.air > 0 ? { hazard: h, safe: true, by: suit, breathing: true } : { hazard: h, safe: false, deadly: true };
    case "underwater": {
      if (p.gills) return { hazard: h, safe: true, by: "gills" };
      const sealed = p.wearing.find((n) => /water suit|diving suit/i.test(n));
      if (sealed && (/water suit/i.test(sealed) || p.air > 0)) return { hazard: h, safe: true, by: sealed, breathing: /diving suit/i.test(sealed) };
      if (underwaterMask) return { hazard: h, safe: true, by: underwaterMask, breathing: true };
      if (respirator && p.air > 0) return { hazard: h, safe: true, by: respirator, breathing: true };
      return { hazard: h, safe: false, deadly: true };
    }
    case "toxic":
      if (suit) return { hazard: h, safe: true, by: suit };
      if (respirator && p.air > 0) return { hazard: h, safe: true, by: respirator, breathing: true };
      if (p.resist.includes("poison")) return { hazard: h, safe: true, by: "resistance to poison" };
      return { hazard: h, safe: false };
    case "cold":
      if (p.resist.includes("cold")) return { hazard: h, safe: true, by: suit ?? "resistance to cold" };
      if (p.generators.includes("cold")) return { hazard: h, safe: true, by: "a heat generator" };
      return { hazard: h, safe: false };
    case "heat":
      if (p.resist.includes("fire")) return { hazard: h, safe: true, by: suit ?? "resistance to fire" };
      if (p.water) return { hazard: h, safe: true, by: "water to hand" };
      return { hazard: h, safe: false };
    case "dark":
      return p.light ? { hazard: h, safe: true, by: "a light" } : p.darkvision ? { hazard: h, safe: true, by: "darkvision" } : { hazard: h, safe: false };
    case "gravity":
      return p.generators.includes("gravity") ? { hazard: h, safe: true, by: "a gravity generator" } : { hazard: h, safe: false };
    case "radiation":
      return p.resist.includes("necrotic") ? { hazard: h, safe: true, by: suit ?? "resistance to necrotic" } : { hazard: h, safe: false };
    default:
      return { hazard: h, safe: false };
  }
}
// What an hour unprotected does (the DMG's extreme cold and heat; house rules for the rest, the books give none): a saving throw, and
// on a failure damage or a level of exhaustion or a condition
export const HAZARD_HOUR: Record<EnvHazard, { save?: string; dc?: number; damage?: string; type?: string; exhaustion?: boolean; condition?: string; text: string }> = {
  cold: { save: "constitution", dc: 10, exhaustion: true, text: "Extreme cold: a DC 10 Constitution save each hour or a level of exhaustion (the DMG)." },
  heat: { save: "constitution", dc: 5, exhaustion: true, text: "Extreme heat: a Constitution save each hour, DC 5 and 1 more an hour, or a level of exhaustion; water to hand keeps it off (the DMG)." },
  toxic: { save: "constitution", dc: 13, damage: "1d6", type: "poison", condition: "Poisoned", text: "Bad air: a DC 13 Constitution save each hour or 1d6 poison and poisoned (house rule)." },
  radiation: { damage: "1d6", type: "necrotic", text: "Radiation: 1d6 necrotic an hour, halved by resistance (house rule)." },
  gravity: { text: "Heavy or light gravity: disadvantage on Dexterity checks and attack rolls, speed halved, until a gravity generator steadies you (house rule)." },
  dark: { text: "Darkness: heavily obscured; you are effectively blinded without a light or darkvision (the book): disadvantage on attacks and on Perception." },
  vacuum: { text: "No air and no pressure: a creature lasts a few rounds (the book). Not without a space suit." },
  pressure: { text: "The crushing deep: a creature lasts a few rounds (the book). Not without a diving suit." },
  underwater: { text: "Underwater: hold your breath (1 + Constitution modifier minutes), or breathe from a water suit, diving suit or respirator." },
  fire: { save: "dexterity", dc: 14, damage: "1d8", type: "fire", text: "Fire: a Dexterity save or burn." },
};

// ---- Weight and carrying (Player's Handbook, Lifting and Carrying, and its Variant: Encumbrance) ----------------------------------

export const SIZE_CARRY: Record<string, number> = { Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 4, Gargantuan: 8 };
export const weightOf = (w: string | number | undefined) => (typeof w === "number" ? w : Number(String(w ?? "").replace(/[^\d.]/g, "")) || 0);
export interface Load {
  // Pounds the character carries (what others carry for the party left out)
  weight: number;
  capacity: number;
  // 0 unburdened, 1 encumbered, 2 heavily encumbered, 3 over capacity (speed 5: pushing and dragging)
  level: 0 | 1 | 2 | 3;
  speed: number;
  // Disadvantage on Strength, Dexterity and Constitution checks, attacks and saves (heavily encumbered)
  disadvantage: boolean;
  // Packed in containers, and what is carried loose beyond them (house rule: gear beyond what the containers hold and 20 lb loose is
  // carried awkwardly, as if encumbered)
  packed: number;
  awkward: boolean;
  // What the party's other carriers take (a hovercart, beasts of burden, companions)
  shared: number;
  notes: string[];
}
export const LOOSE_POUNDS = 20;
export function loadOf(
  items: { name: string; weight?: string | number; containerLb?: number }[],
  o: { strength: number; size?: string; variant: boolean; others?: number; freeItems?: { items: number; each: number } },
): Load {
  const notes: string[] = [];
  const rule = carryRule();
  const factor = SIZE_CARRY[o.size ?? "Medium"] ?? 1;
  const capacity = Math.round(o.strength * rule.capacity * factor);
  // A utility vest carries its light items without counting
  let free = o.freeItems ? o.freeItems.items : 0;
  let total = 0;
  for (const it of [...items].sort((a, b) => weightOf(a.weight) - weightOf(b.weight))) {
    const w = weightOf(it.weight);
    if (free > 0 && o.freeItems && w > 0 && w <= o.freeItems.each) {
      free--;
      continue;
    }
    total += w;
  }
  const shared = Math.min(o.others ?? 0, Math.max(0, total - capacity / 2));
  const weight = Math.round((total - shared) * 10) / 10;
  const packed = items.reduce((n, it) => n + (it.containerLb ?? 0), 0);
  const awkward = weight > packed + LOOSE_POUNDS;
  let level: Load["level"] = 0;
  if (weight > capacity) level = 3;
  else if (o.variant && weight > o.strength * rule.heavily * factor) level = 2;
  else if (o.variant && weight > o.strength * rule.encumbered * factor) level = 1;
  if (awkward && level === 0) {
    level = 1;
    notes.push(`More than your containers and ${LOOSE_POUNDS} lb loose hold: carried awkwardly, as if encumbered (house rule)`);
  }
  const speed = level === 3 ? -999 : level === 2 ? -rule.heavilySpeed : level === 1 ? -rule.encumberedSpeed : 0;
  if (shared) notes.push(`${Math.round(shared)} lb carried by the others`);
  return { weight, capacity, level, speed, disadvantage: level >= 2, packed, awkward, shared, notes };
}

// ---- Armour and shield properties (2026-10-21; the books' armor properties, derived in armorProperties.json) ----------------------------
// What worn armour and a wielded shield do beyond their class, from the property words on the item (`properties`: "Bulky", "strength 15",
// "Absorptive 1", "reactive 1" ...) and the `stealthDisadvantage` flag. A Strength requirement not met costs 10 feet of speed, Cumbersome 5;
// Bulky (sound) and Obtrusive (sight) are disadvantage on Stealth, Silent and Concealing advantage on it, the flag is disadvantage too;
// Absorptive takes damage from weapons down (at least 1 of it stays), Regulated rerolls the best roll of a damage die, Rigid halves the Dexterity
// bonus to Dexterity saves, Reactive adds to AC against the next attack of whoever hit, Avoidant narrows a critical range, Insulated lifts a
// low d20 against ion and lightning, Imbalanced leaves the wielder open after a critical hit. Not played: Charging, Obscured, Impermeable,
// Reinforced, Spiked, Magnetic and the rest of the shield properties (they need things the game has no rules for).
export interface ArmorTraits {
  speed: number;
  stealthDisadvantage: boolean;
  stealthAdvantage: boolean;
  absorb: number;
  regulated: boolean;
  rigid: boolean;
  reactive: number;
  avoidant: number;
  insulated: number;
  imbalanced: boolean;
  // The AC a shield gives, lost when Imbalanced leaves it open
  shield: number;
  notes: string[];
}
export function armorTraits(items: { name: string; properties?: string[] | null; stealthDisadvantage?: boolean; shieldBonus?: number; absorb?: number }[], strength: number): ArmorTraits {
  const t: ArmorTraits = { speed: 0, stealthDisadvantage: false, stealthAdvantage: false, absorb: 0, regulated: false, rigid: false, reactive: 0, avoidant: 0, insulated: 0, imbalanced: false, shield: 0, notes: [] };
  for (const item of items) {
    const words = (item.properties ?? []).map((p) => String(p).trim().toLowerCase());
    const number = (word: string) => Number(words.find((w) => w.startsWith(word))?.match(/\d+/)?.[0] ?? 0);
    const has = (word: string) => words.some((w) => w.startsWith(word));
    const need = number("strength");
    if (need && strength < need) {
      t.speed -= 10;
      t.notes.push(`${item.name} wants Strength ${need}: speed -10`);
    }
    if (has("cumbersome")) {
      t.speed -= 5;
      t.notes.push(`${item.name} is cumbersome: speed -5`);
    }
    if (item.stealthDisadvantage || has("bulky") || has("obtrusive")) t.stealthDisadvantage = true;
    if (has("silent") || has("concealing")) t.stealthAdvantage = true;
    t.absorb += number("absorptive") + (item.absorb ?? 0);
    if (has("regulated")) t.regulated = true;
    if (has("rigid")) t.rigid = true;
    t.reactive = Math.max(t.reactive, number("reactive"));
    t.avoidant = Math.max(t.avoidant, number("avoidant"));
    t.insulated = Math.max(t.insulated, number("insulated"));
    if (has("imbalanced")) {
      t.imbalanced = true;
      t.shield = Math.max(t.shield, item.shieldBonus ?? 0);
    }
  }
  return t;
}
// Stealth with the armour on: disadvantage and advantage cancel (the books' rule for any mix)
export const stealthMode = (t: Pick<ArmorTraits, "stealthDisadvantage" | "stealthAdvantage">): -1 | 0 | 1 => (t.stealthDisadvantage === t.stealthAdvantage ? 0 : t.stealthAdvantage ? 1 : -1);
// The Dexterity modifier a Rigid suit lets through to Dexterity saves: half of a bonus (rounded down), a penalty in full
export const rigidDex = (modifier: number) => (modifier > 0 ? Math.floor(modifier / 2) : modifier);
