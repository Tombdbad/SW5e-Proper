// The character's powers as the real-time shooter plays them (2026-10-29; shared/logic/shooter.ts `castPower`). Read from the power's own text, as the
// turn-based fight reads it (`powerEffect`, `powerMotion`): no power is named here. What the fight can play is damage (the dice at their average),
// healing, a condition that holds, blinds or frightens, and a push or a pull; and (2026-11-03, the user: the Force and tech powers with no logic
// yet "need their own rules written, visual effects, character animations, and implementation") a weapon imbued for its next blow, a buff on the
// caster (temporary hit points, AC, resistances, invisibility, haste, duplicates, a d4 on attacks, damage back at whoever strikes, a blade spun
// round the body), a teleport, a sense of what moves beyond the walls, a foe marked, slowed, held, charmed or kept unaware, ground that hurts or
// hides, a hologram, a kill or a stun below a number of hit points, a companion brought back, poison cured, a gun pulled away, a droid turned, a
// blade thrown, a dash and a blow. A power whose effect the text leaves to the table is not offered (the turn-based fight still has it). The first
// nine are on keys 1 to 9 (0 shows the next nine).
import { avgDice, type Buff, type RtPower } from "@shared/logic/shooter";
import { castingStats, powerCost, powerEffect, powerMotion } from "./rules";

const feetOf = (range?: string): number => {
  const m = String(range ?? "").match(/(\d+)[- ]?(?:foot|feet|ft)/i);
  if (m) return Number(m[1]);
  return /touch|self/i.test(String(range)) ? 5 : 60;
};
const TYPES = ["acid", "cold", "energy", "fire", "force", "ion", "kinetic", "lightning", "necrotic", "poison", "psychic", "sonic"];
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
// Seconds a duration lasts here: a round six, a minute sixty, an hour or more the whole fight (house rule)
export function secondsOfDuration(duration?: string): number {
  const d = String(duration ?? "").toLowerCase();
  const n = Number(d.match(/(\d+)/)?.[1] ?? 1);
  if (/round|turn/.test(d)) return 6 * n;
  if (/minute/.test(d)) return Math.min(600, 60 * n);
  if (/hour|day|until/.test(d)) return 600;
  return 0;
}
// "two targets at 5th level, three targets at 11th level, and four targets at 17th level": how many at this character level
function targetsAt(text: string, level: number): number {
  let n = 1;
  for (const m of text.matchAll(/(two|three|four|five) (?:targets|creatures|beams)[^,.]*? at (\d+)(?:st|nd|rd|th) level/gi)) if (level >= Number(m[2])) n = Math.max(n, NUM[m[1].toLowerCase()]);
  return n;
}
// The dice a cantrip grows to at this character level ("This power's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8)...")
function grownDice(text: string, level: number, base: string): string {
  let dice = base;
  for (const m of text.matchAll(/(\d+)(?:st|nd|rd|th) level \((\d+d\d+)\)/gi)) if (level >= Number(m[1])) dice = m[2];
  return dice;
}

export function realtimePowers(powers: any[], level: number, scores: any, limit = 18): RtPower[] {
  const out: RtPower[] = [];
  for (const power of powers) {
    if (out.length >= limit) break;
    if (!power?.name) continue;
    const text = String(power.description ?? "").replace(/\*\*\*(Force Potency|Overcharge Tech)\.?\*\*\*[^]*$/i, "").replace(/[*_]/g, "").replace(/\s+/g, " ");
    const effect = powerEffect({ level: Number(power.level) || 0, description: text, duration: power.duration, concentration: power.concentration }, level);
    const motion = powerMotion({ level: Number(power.level) || 0, description: text, range: power.range }, level);
    const stats = castingStats(scores ?? {}, level, power);
    const range = Math.max(1, Math.min(14, feetOf(power.range) / 5));
    // An area round the target, if the text gives one ("within 10 feet of it", "a 20-foot-radius sphere"); else the one target
    const area = text.match(/each creature (?:of your choice )?within (\d+) feet/i) ?? text.match(/(\d+)-foot[- ]radius/i);
    const radius = area ? Math.min(4, Number(area[1]) / 5) : 0;
    const tradition: "force" | "tech" = /tech/i.test(String(power.powerType ?? "")) || !("forceAlignment" in power) ? "tech" : "force";
    const base = { id: String(power.id ?? power.name), name: String(power.name), cost: powerCost({ level: Number(power.level) || 0 }), range, radius, seconds: 0, distance: 0, strike: 0, damage: 0, type: "force", tradition, level: Number(power.level) || 0 };
    const rounds = (n?: number) => Math.min(8, Math.max(2, (n ?? 1) * 6));
    const seconds = secondsOfDuration(power.duration) || 6;
    // (a power that moves a creature is a push or a pull, even where its text also gives the damage of the blow that ends the move; one whose
    // movement is only the rider of a hit is a damaging power)
    const mover = motion && !motion.rider && (motion.creatures || motion.feet.any);
    if (mover) {
      const feet = motion.feet.any ?? Math.max(0, ...Object.values(motion.feet).map(Number));
      out.push({ ...base, kind: motion.way === "toward" ? "pull" : "push", distance: Math.max(1, Math.min(14, feet / 5)), strike: motion.strike ? Math.round(avgDice(motion.strike.dice)) : 0, type: motion.strike?.type ?? "kinetic" });
      continue;
    }
    if (effect.kind === "heal") { out.push({ ...base, kind: "heal", damage: Math.max(1, Math.round(avgDice(effect.dice) + stats.modifier)), type: "healing" }); continue; }
    if ((effect.kind === "attack" || effect.kind === "save") && effect.dice && !/As part of the action used to cast (?:this|the) power, you (?:must|can)/i.test(text)) {
      // (a save that halves is worth three quarters of its dice on average)
      const dmg = avgDice(effect.dice) * (effect.kind === "save" && effect.halfOnSave ? 0.75 : 1);
      out.push({ ...base, kind: "damage", damage: Math.max(1, Math.round(dmg)), type: effect.damageType ?? "force", targets: targetsAt(text, level) });
      continue;
    }
    if (effect.conditions && !effect.onSelf) {
      const names = effect.conditions.map((c) => c.toLowerCase());
      if (names.some((c) => /stunned|paralyzed|incapacitated|restrained|charmed|unconscious|prone/.test(c))) { out.push({ ...base, kind: "stun", seconds: rounds(effect.conditionRounds) }); continue; }
      if (names.some((c) => /frightened/.test(c))) { out.push({ ...base, kind: "fear", seconds: rounds(effect.conditionRounds) }); continue; }
      if (names.some((c) => /blinded/.test(c))) { out.push({ ...base, kind: "blind", seconds: rounds(effect.conditionRounds) }); continue; }
    }
    const read = readMore(text, { ...base, kind: "damage" }, level, stats.modifier, seconds, String(power.range ?? ""));
    if (read) out.push(read);
  }
  return out;
}

// The powers the older reading leaves out (2026-11-03), from their wording. Order matters: the first that fits is what the power is.
function readMore(text: string, base: RtPower, level: number, mod: number, seconds: number, rawRange: string): RtPower | undefined {
  const dice = (re: RegExp) => { const m = text.match(re); return m ? avgDice(m[1].replace(/\s+/g, "")) : 0; };
  const typeIn = (s: string) => TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(s));
  const self = /^(Self|Touch)/i.test(rawRange);
  // A weapon's next blow or shot carries the power ("As part of the action used to cast this power, you must make a melee weapon attack"); a
  // dash across the floor and a blow (", you can move up to your speed and make one melee weapon attack")
  if (/As part of the action used to cast (?:this|the) power, you can move up to your speed and make one melee weapon attack/i.test(text)) {
    return { ...base, kind: "dash", range: 6, damage: dice(/deals an extra (\d+d\d+)/i) || 5.5, rider: /knocked prone/i.test(text) ? { stagger: 1 } : undefined };
  }
  if (/As (?:a )?part of the action used to cast this power, you must make a (?:melee|ranged) weapon attack/i.test(text)) {
    const grown = text.match(/(\d+)(?:st|nd|rd|th) level,? (?:the|your) (?:melee|ranged|weapon)? ?attack deals an extra (\d+d\d+)/i);
    const extra = text.match(/(?:takes?|deals?) (?:an extra |an additional )?(\d+d\d+) (\w+) damage/i);
    const steps = Array.from(text.matchAll(/(\d+)(?:st|nd|rd|th) level/gi)).filter((m) => level >= Number(m[1])).length;
    const kind = typeIn(text) ?? "force";
    const damage = extra ? avgDice(extra[1]) * (1 + steps) : grown && level >= Number(grown[1]) ? avgDice(grown[2]) * steps : Math.max(1, mod);
    return { ...base, kind: "imbue", damage, type: extra && TYPES.includes(extra[2].toLowerCase()) ? extra[2].toLowerCase() : kind, rider: { ...(/knocked prone|can't take reactions|speed is reduced|slowed/i.test(text) ? { stagger: 0.6 } : {}), ...(/slowed|speed is reduced/i.test(text) ? { slow: true } : {}) } };
  }
  // A lightweapon thrown by the Force ("ranged force attack with a lightweapon or vibroweapon ... returns to your hand")
  if (/ranged force attack with a lightweapon or vibroweapon/i.test(text)) return { ...base, kind: "throw", damage: avgDice(grownDice(text, level, text.match(/takes (\d+d\d+) damage/i)?.[1] ?? "1d8")), targets: targetsAt(text, level) };
  // A kill or a stun below a number of hit points
  const kill = text.match(/If the creature you choose has (\d+) hit points or fewer, it dies/i);
  if (kill) return { ...base, kind: "kill", maxHp: Number(kill[1]) };
  const dart = text.match(/If the target has (\d+) hit points or fewer, it is stunned/i);
  if (dart) return { ...base, kind: "stun", maxHp: Number(dart[1]), seconds: 12 };
  // Shots split over the foes (projectiles, explosives, piles of debris)
  const split = text.match(/(?:launch|expel|lift) (?:(\d+d\d+)|a series of (\w+)|(\w+)) (?:tiny projectiles|small explosives|piles)[^.]*?(?:up to (\w+) creatures)?/i);
  if (split) {
    const n = split[1] ? Math.round(avgDice(split[1])) : NUM[(split[2] ?? split[3] ?? "three").toLowerCase()] ?? 3;
    const each = text.match(/(?:deals|takes) (\d+d\d+(?:\s*\+\s*\d+)?|\d+) (\w+) damage/i) ?? text.match(/takes (\d+) (\w+) damage per projectile/i);
    const upTo = text.match(/up to (\w+) creatures/i);
    return { ...base, kind: "damage", hits: n, damage: each ? avgDice(each[1].replace(/\s+/g, "")) : 1, type: each && TYPES.includes(each[2].toLowerCase()) ? each[2].toLowerCase() : "kinetic", targets: upTo ? NUM[upTo[1].toLowerCase()] ?? n : n };
  }
  // A gun pulled from a foe's hands
  if (/(?:weapon|item) (?:is )?pulled directly to you/i.test(text)) return { ...base, kind: "disarm" };
  // Droids turned, halted or shut down
  if (/scramble the targeting protocols|scramble its ability to differentiate/i.test(text)) return { ...base, kind: "turn", droids: true, seconds: Math.min(18, seconds), radius: /30-foot-radius/i.test(text) ? 4 : 0 };
  if (/command to a droid or construct|shutting down all electronic devices/i.test(text)) return { ...base, kind: "stun", droids: true, seconds: /shutting down/i.test(text) ? 12 : 6, radius: /shutting down/i.test(text) ? 4 : 0 };
  // The mind: a target not yet hostile kept unaware; a suggestion or calm that stops a fight a while
  if (/Choose a target within range that isn't hostile toward you/i.test(text)) return { ...base, kind: "mind", people: true, seconds: Math.min(60, seconds), buff: { name: base.name, t: 0, breaks: true } };
  if (/suggest a course of activity|suppress strong emotions|drawn to you, compelled/i.test(text)) return { ...base, kind: "mind", people: true, seconds: Math.min(12, seconds), radius: /20-foot-radius/i.test(text) ? 4 : 0 };
  // A curse or mark: more damage on each hit of the caster's ("you deal an extra 1d6 necrotic damage to the target whenever you hit it"), or the
  // foe's defences read (advantage on attacks against it)
  const mark = text.match(/you deal an extra (\d+d\d+)(?: (\w+))? damage to the target whenever you hit it/i);
  if (mark) return { ...base, kind: "mark", damage: avgDice(mark[1]), type: mark[2] && TYPES.includes(mark[2].toLowerCase()) ? mark[2].toLowerCase() : "kinetic", seconds };
  if (/(?:advantage on (?:the (?:next|first) )?attack rolls? (?:you make )?against (?:it|the target|that creature)|insight into (?:its|the target's) defenses)/i.test(text)) return { ...base, kind: "mark", seconds: Math.min(60, seconds), targets: /up to three creatures/i.test(text) ? 3 : 1 };
  // Ground that hurts, slows or hides at a point ("a 20-foot-radius sphere ... heavily obscured", "takes 4d6 cold damage")
  if ((/(?:sphere|cloud|radius|cube)/i.test(text) && /(?:centered on a point|from a point|on a point|point (?:you choose )?within range)/i.test(text) || /caltrops across ground|Darkness spreads/i.test(text)) && /heavily obscured|takes \d+d\d+ \w+ damage|difficult terrain|darkness/i.test(text) && !self) {
    const hurtBy = text.match(/takes (\d+d\d+) (\w+) damage/i);
    return { ...base, kind: "zone", radius: Math.max(2, base.radius || 4), seconds: Math.min(60, seconds || 60), field: { type: hurtBy && TYPES.includes(hurtBy[2].toLowerCase()) ? hurtBy[2].toLowerCase() : /gas|toxic/i.test(text) ? "poison" : /darkness/i.test(text) ? "dark" : "smoke", dps: hurtBy ? avgDice(hurtBy[1]) / 6 : 0, ...(/heavily obscured|darkness/i.test(text) ? { obscure: true } : {}), ...(/difficult terrain|slowed/i.test(text) ? { slow: true } : {}), ...(/poisoned/i.test(text) ? { poison: true } : {}) } };
  }
  // Slowed (a slowed level, a penalty to AC), held fast (enclosed, restrained, grasped)
  if (/gains? 1 slowed level|speed is halved|gains? a level of slowed/i.test(text) && !/your (?:movement )?speed/i.test(text)) {
    const ac = text.match(/-(\d) penalty to AC/i);
    return { ...base, kind: "slow", seconds: Math.min(60, seconds), ac: ac ? Number(ac[1]) : 0, targets: /up to six creatures/i.test(text) ? 6 : targetsAt(text, level) };
  }
  if (/is enclosed for the duration|creature is restrained|restrained by the vine|grappled by/i.test(text)) return { ...base, kind: "restrain", seconds: Math.min(60, seconds) };
  // A hologram or image that draws fire
  if (/You create an image|illusory copy of yourself|create one of the following effects within range[^.]*image/i.test(text) && !/disguise/i.test(text)) return { ...base, kind: "decoy", seconds: Math.min(20, seconds || 20) };
  // A fallen companion brought back, poison cured, a body healed over time
  if (/return a dead creature you touch to life|restore it to life|creature that has 0 hit points\. The creature becomes stable|administer a shock to restore/i.test(text)) return { ...base, kind: "revive", damage: dice(/regains? (\d+d\d+(?: \+ \d+)?) hit points/i) || 1 };
  if (/neutralize the poison|end either one disease or one condition|undo a debilitating effect/i.test(text)) return { ...base, kind: "cure", buff: /resistance to poison damage/i.test(text) ? { name: base.name, t: secondsFor(seconds), resist: ["poison"] } : undefined };
  const healMany = text.match(/(?:causing it to )?regains? (\d+) hit points/i) ?? text.match(/regains? (\d+d\d+(?:\s*\+\s*\d+)?) hit points/i);
  if (healMany && !/temporary/i.test(healMany[0])) return { ...base, kind: "heal", damage: Math.max(1, Math.round(avgDice(healMany[1].replace(/\s+/g, "")))), type: "healing" };
  if (/regains? all (?:its|of its) hit points/i.test(text)) return { ...base, kind: "heal", damage: 999, type: "healing" };
  const station = text.match(/restore (\d+d\d+) hit points to that creature/i);
  if (station) return { ...base, kind: "buff", buff: { name: base.name, t: Math.min(secondsFor(seconds), 6 * (1 + Math.max(1, mod))), regen: avgDice(station[1]) / 6 } };
  // A teleport, a leap, a step aside
  const blink = text.match(/You teleport up to (\d+) feet|leap up to (\d+) feet to an unoccupied space|you can move up to (\d+) feet, and this movement/i);
  if (blink) return { ...base, kind: "blink", distance: Math.min(14, Number(blink[1] ?? blink[2] ?? blink[3]) / 5), range: Math.min(14, Number(blink[1] ?? blink[2] ?? blink[3]) / 5) };
  // A buff on the caster, from each thing the text gives (house rules for the turn-bound ones: a d4 on attacks is a steadier aim; the Dodge
  // action or a blur is AC 4; duplicates take hits)
  const buff: Buff = { name: base.name, t: secondsFor(seconds) };
  // (a power on companions as well is taken for the caster: the shooter's party is the one it plays)
  const temp = text.match(/(?:gain|gains) (\d+d\d+ \+ \d+|\d+d\d+|\d+) temporary hit points/i) ?? text.match(/hit point maximum and current hit points increase by (\d+)/i);
  if (temp) buff.temp = avgDice(temp[1].replace(/\s+/g, ""));
  const ac = text.match(/(?:have|gain|has|gains) a \+(\d+) bonus to (?:its )?AC/i);
  if (ac) buff.ac = Number(ac[1]);
  if (/any creature who targets the warded creature with an attack/i.test(text)) buff.ac = (buff.ac ?? 0) + 5;
  if (/take the Dodge action|disadvantage on attack rolls against you/i.test(text)) buff.ac = (buff.ac ?? 0) + 4;
  const res = text.match(/you have resistance (?:to|against) ([a-z, ]+?) damage/i);
  if (res) buff.resist = res[1].split(/,\s*|\s+and\s+|\s+or\s+/).map((t) => t.replace(/^and /, "").trim().toLowerCase()).filter((t) => TYPES.includes(t));
  if (/resistance to one damage type of your choice/i.test(text)) buff.resist = ["energy"];
  if (/you are immune to all damage|immune to unenhanced damage/i.test(text)) buff.immune = true;
  const fast = text.match(/speed increases by (\d+) feet/i);
  if (fast) buff.speed = Number(fast[1]) / 30;
  if (/take the Dash action|speed is doubled/i.test(text)) buff.speed = Math.max(buff.speed ?? 0, 1);
  const back = text.match(/hits you with a melee attack[^.]*?(?:the creature|it) takes (\d+d\d+|\d+) (\w+) damage/i);
  if (back) buff.retort = { damage: avgDice(back[1]), type: back[2].toLowerCase() };
  if (/(?:you|creature you touch|you or a creature you touch) becomes? invisible|You become invisible|heavily obscured to others|dampen sound and light/i.test(text)) {
    buff.cloak = true;
    if (/ends if (?:you|the target) attacks?|invisibility ends if you attack/i.test(text)) buff.breaks = true;
  }
  const empower = text.match(/(?:your weapon attacks deal|deals|the target takes|you deal|it deals)(?: an extra| an additional)? (\d+d\d+) (\w+) damage(?: with weapon attacks)?(?: on a hit)?/i);
  if (empower && /weapon/i.test(text)) buff.empower = { damage: avgDice(empower[1]), type: TYPES.includes(empower[2].toLowerCase()) ? empower[2].toLowerCase() : "kinetic" };
  const extraHit = text.match(/deals? an extra (\d+d\d+) damage with weapon attacks/i);
  if (extraHit) buff.empower = { damage: avgDice(extraHit[1]), type: "kinetic" };
  const images = text.match(/(\w+) illusory duplicates of yourself/i);
  if (images) buff.images = NUM[images[1].toLowerCase()] ?? 3;
  if (/roll a d4 and add the number rolled to the attack roll|add 1d4 to your attack rolls|\+(\d) bonus to attack rolls/i.test(text)) buff.aim = 0.2;
  if (/In response to being attacked|lessening its effect on you and storing it|as an attack begins to hit you/i.test(text)) buff.react = /storing it|absorbs damage/i.test(text) ? "absorb" : /teleport|collapses/i.test(text) ? "blink" : "reflect";
  if (/can't die from damage|first time the target would drop to 0 hit points/i.test(text)) buff.endure = true;
  if (/immune to being frightened/i.test(text)) buff.fearless = true;
  const dance = text.match(/spinning around your body[^.]*?(\d+)-foot radius[^]*?take (\d+d\d+) damage/i);
  if (dance) { buff.orbit = { dps: avgDice(dance[2]) / 6, radius: Number(dance[1]) / 5, type: "energy" }; buff.speed = -0.5; }
  const immuneTo = text.match(/immune to ([a-z]+) and ([a-z]+) damage/i);
  if (immuneTo) buff.resist = [...(buff.resist ?? []), immuneTo[1].toLowerCase(), immuneTo[2].toLowerCase()].filter((t) => TYPES.includes(t));
  if (!buff.resist?.length) delete buff.resist;
  const keys = Object.keys(buff).filter((k) => k !== "name" && k !== "t");
  if (keys.length) return { ...base, kind: "buff", buff };
  // Senses: seeing the invisible, sensing the Force or the living, transmissions, a sonar scan, darkvision
  if (/see invisible creatures|truesight|Living things glow|sense the (?:use of the Force|presence|emotions)|pick up the emotions|outlined in|detect electronic transmissions|sonar scan|see in the dark|darkvision|sense the direction to the creature|presence, general location, and nature of any trap/i.test(text) && self !== false) {
    const reach = text.match(/within (\d+) feet of you/i);
    return { ...base, kind: "sense", radius: Math.min(24, reach ? Number(reach[1]) / 5 : 12), seconds: Math.min(600, seconds || 60), buff: { name: base.name, t: 0, sense: { ...(/see invisible|truesight|true form/i.test(text) ? { truesight: 6 } : {}) } } };
  }
  // A beam or bolt of a type the caster chooses ("You choose acid, cold, fire, lightning, or sonic"): the first named (house rule)
  const chosen = text.match(/You (?:choose|can choose) ([a-z, ]+?)(?:\.|, and| damage)/i);
  const hit = text.match(/(?:takes|deals|deal) (\d+d\d+) (?:damage of the chosen type|\w+ damage)/i);
  if (chosen && hit) return { ...base, kind: "damage", damage: avgDice(grownDice(text, level, hit[1])), type: typeIn(chosen[1]) ?? "energy", targets: targetsAt(text, level) };
  return undefined;
}
const secondsFor = (s: number) => (s > 0 ? s : 60);
