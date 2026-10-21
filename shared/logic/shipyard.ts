// Ship upgrades (Starships of the Galaxy, chapters 3 and 4; 2026-10-21, asked by the user). A leaf module (it imports no game state),
// so the rules can be read and tested without a world; index.ts applies them in `shipSheet` and the ship fight, and lays out who sells what.
//   - Modifications: what each costs (the category's base cost x the size's cost modifier x the grade from grade 1), the workforce a size
//     needs, the days it takes (base cost x size modifier / (250 x workforce)), the installation check (Intelligence (Mechanic's Kit) against
//     the grade-and-tier DC, +2 a modification over capacity for Tiny to Medium ships, +1 for larger), the slots a size has, the suites it
//     takes, prerequisites and the "only once" rules of the categories. A shipyard installs without a check (the book allows the GM to
//     assume it); a party that brings the part and provides the workforce pays only the material cost (half). Removal: half the cost and time.
//   - Tiers: the base upgrade cost by tier x the size's upgrade modifier, half with the party's own workforce, days = cost / (500 x workforce).
//   - What a modification does is read from its text where the wording is regular (ability scores, AC, damage reduction, resistances,
//     speeds, saving throw proficiency, fuel, hyperdrive, slots, weapon systems, crew actions with a saving throw, what a suite gives a long
//     rest aboard); everything else in the text is shown.
// The tables are the book's, derived by the importer into ships.json (`modifications`, `upgrade`).
import shipData from "../data/sw5e/ships.json";
import modData from "../data/sw5e/starshipModifications.json";

export const SHIP_ABILITY_NAMES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
export type ShipAbilityName = (typeof SHIP_ABILITY_NAMES)[number];
export type ModCategory = "Engineering" | "Operation" | "Suite" | "Universal" | "Weapon";

interface ModTables {
  baseCost: Record<string, number>;
  sizeCost: Record<string, number>;
  workforce: Record<string, number>;
  slots: Record<string, number>;
  suiteCapacity: Record<string, number>;
  installDc: number[][];
  maxSuites: Record<string, { base: number; con: number } | null>;
}
interface EquipmentTables {
  sizeCost: Record<string, number>;
  workforce: Record<string, number>;
  cargoTons: Record<string, number>;
}
interface UpgradeTables {
  tierCost: number[];
  sizeCost: Record<string, number>;
  workforce: Record<string, number>;
}
const TABLES = (shipData as unknown as { modifications: ModTables; upgrade: UpgradeTables; equipment: EquipmentTables });
export const MOD_TABLES: ModTables = TABLES.modifications;
export const EQUIPMENT_TABLES: EquipmentTables = TABLES.equipment;
export const UPGRADE_TABLES: UpgradeTables = TABLES.upgrade;
export const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const sizeAt = (size: string) => Math.max(0, SIZES.indexOf(size));

export interface ShipModRow {
  id: string;
  name: string;
  type: ModCategory;
  grade: number;
  content: string;
}
const clean = (s: string) => s.replace(/[’‘]/g, "'").replace(/\*/g, "").replace(/\s+/g, " ").trim();
export const SHIP_MODS: ShipModRow[] = (modData as ShipModRow[]).map((m) => ({ ...m, name: m.name.trim() }));
export const shipModNamed = (name: string) => SHIP_MODS.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());

// ---- What a modification does --------------------------------------------------------------------------------------------------

// A crew action of an engineering or operation system: everyone it reaches makes a saving throw; damage (half on a save where the text
// says so) and a condition on a failure
export interface ShipSpecial {
  save: ShipAbilityName;
  // The DC: 8 + the proficiency bonus or the ship's tier, + the ship's ability modifier
  dcBase: "proficiency" | "tier";
  dcAbility: ShipAbilityName;
  damage: { dice: string; type: string }[];
  // "increases by 1d6 for every tier your ship is above first tier"
  perTier?: boolean;
  half: boolean;
  // Who it reaches: ships round the user, round a point (a ship) within range, or one ship within range
  area: "self" | "point" | "single";
  radius: number;
  range: number;
  // Only within the forward arc (a cone or a line)
  forward?: boolean;
  condition?: ShipConditionName;
  uses: number | "tier";
}
export type ShipConditionName = "slowed" | "shocked" | "stunned" | "ionized" | "blinded" | "disabled" | "tractored";

// What a suite gives a long rest taken aboard (the party's ship's deck)
export interface SuiteRest {
  hitDice?: "all" | number;
  exhaustion?: number;
  // Medbay: a level of exhaustion for each two hours in a biobed
  biobed?: boolean;
  firstAttack?: boolean;
  firstCheck?: string[] | "any";
  tempForce?: boolean;
  tempTech?: boolean;
}

export interface WeaponSystem {
  reload?: number;
  range?: number;
  attack?: number;
  turret?: boolean;
  helmFree?: boolean;
  rerollLow?: boolean;
  // On a critical hit (and the other triggers the book lists), the target saves (Constitution) or takes the condition
  onCrit?: ShipConditionName;
  // A mount for a weapon more
  hardpoint?: boolean;
  // Applies to every primary weapon, not one chosen
  allPrimary?: boolean;
}

export interface ShipModEffects {
  abilities: Partial<Record<ShipAbilityName, number>>;
  // A makeshift system lowers one other ability score by 1 (the GM's choice: see makeshiftLoss)
  makeshift?: ShipAbilityName;
  maxRaise: Partial<Record<ShipAbilityName, number>>;
  ac: number;
  dr?: number;
  hullResist: string[];
  shieldResist: string[];
  speed: number;
  turning: number;
  noCrit?: boolean;
  saves: ShipAbilityName[];
  fuel: number;
  hyperdrive?: string;
  slots: number;
  crew: number;
  weapon?: WeaponSystem;
  special?: ShipSpecial;
  rest?: SuiteRest;
  // An ejection pod or escape pods: the crew gets away whole when the ship is lost
  escape?: boolean;
  // What the crew can do with it in a fight, read from the wording: a Patch, a helm action (Fly, Evade) or a Boost without spending an
  // action (house rule: a bonus action is a free action once a turn in the ship fight), the reactions that keep a ship going at 0 hull or
  // shields, flares for a Dexterity saving throw, and a shield that strikes back at whoever hit it (the die by size)
  bonus?: ("patch" | "helm" | "boost")[];
  backup?: "hull" | "shield";
  flares?: boolean;
  feedback?: Record<string, string>;
  // Advantage on Dexterity (Hide) and the like are shown, not applied
  applied: string[];
}

const ABILITY_RE = "(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)";
const ability = (s: string) => s.toLowerCase() as ShipAbilityName;
const CONDITIONS: [RegExp, ShipConditionName][] = [
  [/stunned/i, "stunned"], [/stalled|disabled/i, "disabled"], [/shocked/i, "shocked"], [/ionized/i, "ionized"],
  [/blinded/i, "blinded"], [/tractored/i, "tractored"], [/slowed|Slowed Level/i, "slowed"],
];

export function shipModEffects(row: Pick<ShipModRow, "name" | "type" | "content">): ShipModEffects {
  const text = clean(row.content);
  const out: ShipModEffects = { abilities: {}, maxRaise: {}, ac: 0, hullResist: [], shieldResist: [], speed: 0, turning: 0, saves: [], fuel: 0, slots: 0, crew: 0, applied: [] };
  const say = (s: string) => out.applied.push(s);
  for (const m of text.matchAll(new RegExp(`${ABILITY_RE} score increases by (\\d+)`, "gi"))) {
    out.abilities[ability(m[1])] = (out.abilities[ability(m[1])] ?? 0) + Number(m[2]);
    say(`${m[1]} +${m[2]}`);
  }
  const lower = text.match(new RegExp(`One ability score other than ${ABILITY_RE} \\(chosen by the GM\\) decreases by 1`, "i"));
  if (lower) out.makeshift = ability(lower[1]);
  const raise = text.match(new RegExp(`${ABILITY_RE} score increases by \\d+\\. Your ship's maximum for this score increases by (\\d+)`, "i"));
  if (raise) out.maxRaise[ability(raise[1])] = Number(raise[2]);
  const inAtmosphere = /While you are in atmosphere/i.test(text);
  if (!inAtmosphere) {
    const ac = text.match(/\+(\d+) bonus to AC/i);
    if (ac) {
      out.ac = Number(ac[1]);
      say(`AC +${ac[1]}`);
    }
    const speed = text.match(/flying speed (increases|decreases) by (\d+) feet/i);
    if (speed) {
      out.speed = Number(speed[2]) * (speed[1].toLowerCase() === "increases" ? 1 : -1);
      say(`speed ${out.speed > 0 ? "+" : ""}${out.speed} ft.`);
    }
    const add = text.match(/adding (\d+) feet to your speed/i);
    if (add) {
      out.speed += Number(add[1]);
      say(`speed +${add[1]} ft.`);
    }
    const turning = text.match(/turning speed (increases|decreases) by (\d+) feet/i);
    if (turning) {
      out.turning = Number(turning[2]) * (turning[1].toLowerCase() === "increases" ? 1 : -1);
      say(`turning ${out.turning > 0 ? "+" : ""}${out.turning} ft.`);
    }
  }
  const dr = text.match(/total DR of (\d+)/i);
  if (dr) {
    out.dr = Number(dr[1]);
    say(`damage reduction ${dr[1]}`);
  }
  for (const m of text.matchAll(/granting your (hull|shields) resistance to (\w+) damage/gi)) {
    (m[1].toLowerCase() === "hull" ? out.hullResist : out.shieldResist).push(m[2].toLowerCase());
    say(`${m[1]} resist ${m[2].toLowerCase()}`);
  }
  if (/critical hits made on attack rolls against you to be treated as normal hits/i.test(text)) {
    out.noCrit = true;
    say("no critical hits against it");
  }
  for (const m of text.matchAll(new RegExp(`proficiently equipped for ${ABILITY_RE} saving throws`, "gi"))) {
    out.saves.push(ability(m[1]));
    say(`proficient ${m[1]} saves`);
  }
  if (/adds fuel capacity to your ship equal to half/i.test(text)) {
    out.fuel = 0.5;
    say("fuel capacity +50%");
  }
  const hyper = text.match(/includes a class (\d+) hyperdrive/i);
  if (hyper && row.type === "Operation") {
    out.hyperdrive = `Class ${hyper[1]}`;
    say(`a class ${hyper[1]} hyperdrive`);
  }
  const slots = text.match(/adding (\d+) modification slots/i);
  if (slots) {
    out.slots = Number(slots[1]);
    say(`${slots[1]} modification slots`);
  }
  const crew = text.match(/maximum crew capacity increases by (\d+)/i);
  if (crew) {
    out.crew = Number(crew[1]);
    say(`crew +${crew[1]}`);
  }
  if (/ejection pod|escape pods/i.test(row.name)) {
    out.escape = true;
    say("the crew gets away if the ship is lost");
  }
  const bonus: ("patch" | "helm" | "boost")[] = [];
  if (/take the Patch action as a bonus action/i.test(text)) bonus.push("patch");
  if (/take the Fly or Evade action as a bonus action/i.test(text)) bonus.push("helm");
  if (/take the Boost \w+ action as a bonus action/i.test(text)) bonus.push("boost");
  if (bonus.length) {
    out.bonus = bonus;
    say(`${bonus.join(", ")} without an action once a turn`);
  }
  if (/reduced to 0 hull points but not destroyed outright, a crewmember can use their reaction to have it drop to 1 hull point/i.test(text)) {
    out.backup = "hull";
    say("once a fight, 1 hull point instead of 0");
  } else if (/reduced to 0 shield points[^.]*drop to 1 shield point/i.test(text)) {
    out.backup = "shield";
    say("once a fight, 1 shield point instead of 0");
  }
  if (/forced to make a Dexterity saving throw, a crewmember can use their reaction to release a flare/i.test(text)) {
    out.flares = true;
    say("advantage on Dexterity saving throws (a use a tier)");
  }
  const fb = text.match(/deal damage to the attacking ship\. The damage depends on your ship's size: ([^.]*)\./i);
  if (fb) {
    out.feedback = Object.fromEntries(Array.from(fb[1].matchAll(/(\d+d\d+) for a (\w+) ship/gi)).map((m) => [m[2], m[1]]));
    say("strikes back at a ship that hits it with a primary or secondary weapon");
  }
  // Weapon systems
  if (row.type === "Weapon") {
    const w: WeaponSystem = {};
    if (/reload value of the chosen weapon increases by half/i.test(text)) w.reload = 1.5;
    if (/ranges of the chosen weapon[^.]* increase by half/i.test(text)) w.range = 1.5;
    if (/^Hardpoint$/i.test(row.name)) w.hardpoint = true;
    if (/unlimited firing arc/i.test(text)) w.turret = true;
    if (/at the helm[^.]*no longer suffers disadvantage/i.test(text)) w.helmFree = true;
    if (/roll a 1 or 2 on a damage die/i.test(text)) w.rerollLow = true;
    const s = text.match(/Unlocked:[^.]*\+(\d+) bonus to attack rolls/i);
    if (s) {
      w.attack = Number(s[1]);
      w.allPrimary = true;
    }
    const rounds = text.match(/the ship is (ionized|shocked|stunned|blinded) until the start of your next turn/i);
    if (rounds && /critical hit|advantage on the attack roll/i.test(text)) w.onCrit = rounds[1].toLowerCase() as ShipConditionName;
    if (Object.keys(w).length) {
      out.weapon = w;
      say(
        [w.hardpoint && "a hardpoint for one more weapon", w.reload && "reload +50%", w.range && "range +50%", w.turret && "fires all round", w.helmFree && "no disadvantage from the helm",
          w.rerollLow && "rerolls 1s and 2s on damage", w.attack && `primary weapons +${w.attack} to hit (S-foils unlocked in a fight)`, w.onCrit && `a critical hit can leave the target ${w.onCrit}`]
          .filter(Boolean).join(", "),
      );
    }
  }
  // A crew action with a saving throw
  if (row.type === "Engineering" || row.type === "Operation") {
    const special = specialOf(text);
    if (special) {
      out.special = special;
      say(`crew action: ${special.save} save${special.damage.length ? `, ${special.damage.map((d) => `${d.dice} ${d.type}`).join(" + ")}` : ""}${special.condition ? `, ${special.condition}` : ""}`);
    }
  }
  // Suites: what a long rest aboard gives
  if (row.type === "Suite") {
    const rest: SuiteRest = {};
    if (/regain all spent Hit Dice/i.test(text)) rest.hitDice = "all";
    const more = text.match(/regain (two|three|\d+) additional Hit Dice/i);
    if (more) rest.hitDice = ({ two: 2, three: 3 } as Record<string, number>)[more[1].toLowerCase()] ?? Number(more[1]);
    const ex = text.match(/exhaustion level is reduced by (\d+)/i);
    if (ex && /completes a long rest/i.test(text)) rest.exhaustion = Number(ex[1]);
    if (/every two hours spent in a biobed/i.test(text)) rest.biobed = true;
    if (/advantage on the first attack roll/i.test(text)) rest.firstAttack = true;
    if (/advantage on the first ability check they make/i.test(text)) rest.firstCheck = "any";
    const first = text.match(/advantage on the first ([^.]*?) check they make/i);
    if (first && !rest.firstCheck) rest.firstCheck = Array.from(first[1].matchAll(/\(([A-Za-z ]+)\)/g)).map((m) => m[1].toLowerCase());
    if (/gain temporary force points/i.test(text)) rest.tempForce = true;
    if (/gain temporary tech points/i.test(text)) rest.tempTech = true;
    if (Object.keys(rest).length) {
      out.rest = rest;
      say("a long rest aboard: " + [
        rest.hitDice === "all" ? "all Hit Dice back" : rest.hitDice ? `${rest.hitDice} Hit Dice more` : "",
        rest.exhaustion ? `exhaustion -${rest.exhaustion}` : "",
        rest.biobed ? "a level of exhaustion for every two hours in a biobed" : "",
        rest.firstAttack ? "advantage on the first attack" : "",
        rest.firstCheck ? `advantage on the first ${rest.firstCheck === "any" ? "ability" : rest.firstCheck.join("/")} check` : "",
        rest.tempForce ? "temporary force points" : "",
        rest.tempTech ? "temporary tech points" : "",
      ].filter(Boolean).join(", "));
    }
  }
  return out;
}

function specialOf(text: string): ShipSpecial | undefined {
  const save = text.match(new RegExp(`${ABILITY_RE} saving throw \\(DC = 8 \\+ ([^)]*?)\\)`, "i")) ?? text.match(new RegExp(`${ABILITY_RE} \\(DC = 8 \\+ ([^)]*?)\\)(?: saving throw)?`, "i"));
  if (!save) return undefined;
  const dcAbility = save[2].match(/ship'?s? (strength|dexterity|constitution|intelligence|wisdom|charisma|iwisdom) modifier/i);
  // What a failure does: from the saving throw on, up to what a success does (and leaving out what a collision deals)
  const after = text.slice((save.index ?? 0) + save[0].length).split(/If at the end of this movement|On a success(?:ful save)?[,.]/i)[0];
  const damage = Array.from(after.matchAll(/(\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage/gi)).map((m) => ({ dice: m[1].replace(/\s+/g, ""), type: m[2].toLowerCase() }));
  const condition = CONDITIONS.find(([re]) => re.test(after))?.[1];
  if (!damage.length && !condition) return undefined;
  let area: ShipSpecial["area"] = "single";
  let radius = 0;
  let range = 600;
  let forward = false;
  const sphere = text.match(/(\d+)-foot-radius sphere centered on (?:a|that) point (?:you can see |it chooses )?within (\d+) feet/i) ?? (() => {
    const r = text.match(/(\d+)-foot-radius sphere/i);
    const w = text.match(/point (?:you can see |it chooses )?within (\d+) feet/i);
    return r && w ? [r[0], r[1], w[1]] as unknown as RegExpMatchArray : null;
  })();
  const cube = text.match(/(\d+)-foot cube within (\d+) feet/i);
  const around = text.match(/[Ee]ach ship,? within (\d+) feet/) ?? text.match(/within (\d+) feet must make/i) ?? text.match(/out to a distance of (\d+) feet around your ship/i);
  const cone = text.match(/(\d+)-foot cone/i);
  const line = text.match(/line (\d+) feet long/i) ?? text.match(/(\d+)-foot-long line/i);
  const single = text.match(/within (\d+) feet/i);
  if (sphere) [area, radius, range] = ["point", Number(sphere[1]), Number(sphere[2])];
  else if (cube) [area, radius, range] = ["point", Number(cube[1]) / 2, Number(cube[2])];
  else if (cone) [area, radius, range, forward] = ["self", Number(cone[1]), Number(cone[1]), true];
  else if (line) [area, radius, range, forward] = ["self", Number(line[1]), Number(line[1]), true];
  else if (around && /each ship/i.test(text)) [area, radius, range] = ["self", Number(around[1]), Number(around[1])];
  else if (single) range = Number(single[1]);
  return {
    save: ability(save[1]),
    dcBase: /tier/i.test(save[2]) ? "tier" : "proficiency",
    dcAbility: dcAbility ? (ability(dcAbility[1].replace(/^iwisdom$/i, "wisdom"))) : "strength",
    damage,
    perTier: /increases by \d+d\d+ for every tier/i.test(text),
    half: /half as much|half damage/i.test(text),
    area,
    radius,
    range,
    forward,
    condition,
    uses: /number of times equal to your ship'?s tier/i.test(text) ? "tier" : 1,
  };
}

// The prerequisites a modification names: ability scores and other modifications (by name, as the data has them)
export function prerequisitesOf(row: Pick<ShipModRow, "content">): { abilities: Partial<Record<ShipAbilityName, number>>; mods: string[] } {
  const text = clean(row.content);
  const at = text.match(/Prerequisite:\s*(.*?)(?=\s(?:You|Your|This|When|A|The|While|As|Over)\s)/i);
  if (!at) return { abilities: {}, mods: [] };
  const list = at[1];
  const abilities: Partial<Record<ShipAbilityName, number>> = {};
  for (const m of list.matchAll(new RegExp(`${ABILITY_RE} (\\d+)`, "gi"))) abilities[ability(m[1])] = Number(m[2]);
  const names = [...SHIP_MODS].sort((a, b) => b.name.length - a.name.length);
  let rest = list.replace(new RegExp(`${ABILITY_RE} \\d+`, "gi"), "");
  const mods: string[] = [];
  for (const n of names) {
    const idx = rest.toLowerCase().indexOf(n.name.toLowerCase());
    if (idx < 0) continue;
    mods.push(n.name);
    rest = rest.slice(0, idx) + rest.slice(idx + n.name.length);
  }
  return { abilities, mods };
}

// What a modification rules out ("cannot be installed in a ship that already has X installed")
export function excludedBy(row: Pick<ShipModRow, "content">): string[] {
  const m = clean(row.content).match(/cannot be installed in a ship that already has (.*?) installed/i);
  return m ? [m[1].trim()] : [];
}

// ---- Cost, time and the check -----------------------------------------------------------------------------------------------------

// The installed cost of a modification on a ship of a size: the category's base cost x the size's modifier, x the grade from grade 1.
// The Storage Compartment's base cost is 500 cr; the Warhead Launcher always costs as for a Large ship.
export function modBaseCost(row: Pick<ShipModRow, "name" | "type" | "content">): number {
  const own = clean(row.content).match(/Base Cost\]?\([^)]*\)? is only ([\d,]+) cr/i) ?? clean(row.content).match(/Base Cost is only ([\d,]+) cr/i);
  return own ? Number(own[1].replace(/,/g, "")) : MOD_TABLES.baseCost[row.type] ?? 4000;
}
export function modSizeFactor(row: Pick<ShipModRow, "content">, size: string): number {
  if (/Modification Cost\]?\([^)]*\)? for this modification is Large/i.test(clean(row.content))) return MOD_TABLES.sizeCost.Large;
  return MOD_TABLES.sizeCost[size] ?? 1;
}
export function modCost(row: Pick<ShipModRow, "name" | "type" | "grade" | "content">, size: string): { installed: number; material: number; raw: number } {
  const installed = Math.round(modBaseCost(row) * modSizeFactor(row, size) * Math.max(1, row.grade));
  return { installed, material: Math.round(installed / 2), raw: Math.round(installed / 4) };
}
// The least workforce for a modification on a ship of this size, and the days it takes a workforce of `workers`
export const modWorkforce = (size: string) => MOD_TABLES.workforce[size] ?? 2;
export function modDays(row: Pick<ShipModRow, "name" | "type" | "content">, size: string, workers: number): number {
  const days = (modBaseCost(row) * modSizeFactor(row, size)) / (250 * Math.max(1, workers));
  return Math.max(0.5, Math.round(days * 2) / 2);
}
// The Intelligence (Mechanic's Kit) DC: by grade and tier, more for each modification over capacity
export function installDC(grade: number, tier: number, size: string, over = 0): number {
  const row = MOD_TABLES.installDc[Math.max(0, Math.min(5, grade))] ?? MOD_TABLES.installDc[0];
  const base = row[Math.max(0, Math.min(5, tier))] ?? 10;
  return base + Math.max(0, over) * (sizeAt(size) <= sizeAt("Medium") ? 2 : 1);
}

// ---- What a ship can take ----------------------------------------------------------------------------------------------------------

export interface ShipModInstance {
  name: string;
  // A weapon system is fitted to one weapon (its name in the starship equipment data)
  weapon?: string;
  // The ability a makeshift system lowered (the GM's choice; see makeshiftLoss)
  lowers?: ShipAbilityName;
}
export interface Upgradable {
  id: string;
  size: string;
  tier: number;
  mods?: ShipModInstance[];
  equipment: string[];
}

export function slotsOf(ship: Upgradable): { capacity: number; used: number } {
  const room = (ship.mods ?? []).reduce((n, m) => n + (shipModEffects(shipModNamed(m.name) ?? { name: m.name, type: "Universal", content: "" }).slots ?? 0), 0);
  return { capacity: (MOD_TABLES.slots[ship.size] ?? 20) + room, used: (ship.mods ?? []).length };
}
export function maxSuitesOf(size: string, conMod: number): number {
  const rule = MOD_TABLES.maxSuites[size];
  return rule ? Math.max(0, rule.base + rule.con * conMod) : 0;
}

// The ability a makeshift system lowers (house rule: the book leaves it to the GM; here one of the other five, the same for a ship and a system)
export function makeshiftLoss(shipId: string, raised: ShipAbilityName): ShipAbilityName {
  const others = SHIP_ABILITY_NAMES.filter((a) => a !== raised);
  let h = 7;
  for (const ch of `${shipId}|${raised}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return others[(h >>> 0) % others.length];
}

// Whether the modification can go into this ship now; the reason when it cannot (scores are the ship's as it stands)
export function canInstall(ship: Upgradable, row: ShipModRow, scores: Record<ShipAbilityName, number>, weapon?: string): string {
  const mods = ship.mods ?? [];
  const has = (name: string) => mods.some((m) => m.name.toLowerCase() === name.toLowerCase());
  if (row.type === "Suite" && sizeAt(ship.size) < sizeAt("Small")) return "Suites need a ship of size Small or larger.";
  if ((row.type === "Universal" || row.type === "Operation") && has(row.name)) return `${row.name} is installed already (a ${row.type.toLowerCase()} system is taken once).`;
  if (row.type === "Suite") {
    if (mods.filter((m) => m.name === row.name).length >= 10) return "A suite is taken ten times at most.";
    const suites = mods.filter((m) => shipModNamed(m.name)?.type === "Suite").length;
    const max = maxSuitesOf(ship.size, Math.floor((scores.constitution - 10) / 2));
    if (suites >= max) return `A ${ship.size} ship with this Constitution takes ${max} suite${max === 1 ? "" : "s"}.`;
  }
  if (row.type === "Weapon" && !/^Hardpoint$/i.test(row.name) && !shipModEffects(row).weapon?.allPrimary && !weapon) return "Choose the weapon it is fitted to.";
  const pre = prerequisitesOf(row);
  for (const [a, n] of Object.entries(pre.abilities)) if ((scores[a as ShipAbilityName] ?? 10) < (n ?? 0)) return `Needs ${a} ${n} (the ship has ${scores[a as ShipAbilityName]}).`;
  for (const m of pre.mods) if (!has(m)) return `Needs ${m} first.`;
  for (const x of excludedBy(row)) if (has(x)) return `Cannot be installed beside ${x}.`;
  return "";
}

// ---- Tier upgrades ---------------------------------------------------------------------------------------------------------------

// Going up to `to` (one tier at a time): the cost with a hired workforce (half with the party's own), the least workforce, the days
export function tierUpgrade(size: string, to: number, workers?: number): { cost: number; own: number; workforce: number; days: number } {
  const cost = Math.round((UPGRADE_TABLES.tierCost[to] ?? 0) * (UPGRADE_TABLES.sizeCost[size] ?? 1));
  const workforce = UPGRADE_TABLES.workforce[size] ?? 1;
  const crew = Math.max(workforce, workers ?? workforce);
  return { cost, own: Math.round(cost / 2), workforce, days: Math.max(0.5, Math.round((cost / (500 * crew)) * 2) / 2) };
}

// ---- Enhanced ship parts ----------------------------------------------------------------------------------------------------------

// An enhanced ship armor, shield or weapon (the enhanced items' ShipArmor, ShipShield, ShipWeapon), with the bonus its text gives:
// "+N bonus to AC", "+N bonus to Strength, Dexterity, and Constitution saving throws", "+N bonus to attack and damage rolls"
export interface EnhancedShipPart {
  name: string;
  bonus: number;
}
export const SHIP_PART_TYPES = ["ShipArmor", "ShipShield", "ShipWeapon"];
export function enhancedShipPart(row: { name: string; type: string; text?: string }): (EnhancedShipPart & { slot: "armor" | "shield" | "weapon" }) | undefined {
  if (!SHIP_PART_TYPES.includes(row.type)) return undefined;
  const bonus = Number((row.text ?? "").match(/\+(\d+) bonus to/i)?.[1] ?? 0);
  return { name: row.name, bonus, slot: row.type === "ShipArmor" ? "armor" : row.type === "ShipShield" ? "shield" : "weapon" };
}

// ---- A shipyard's crew ------------------------------------------------------------------------------------------------------------

// House rule: a shipyard puts twice the least workforce on a job (the book sets only the least)
export const yardWorkforce = (size: string, kind: "mod" | "tier") => 2 * (kind === "mod" ? modWorkforce(size) : UPGRADE_TABLES.workforce[size] ?? 1);

// ---- Starship equipment (chapter 5) ------------------------------------------------------------------------------------------------

// The installed cost of a piece of starship equipment on a ship of a size (weapons and ammunition cost the same for any size), the
// least workforce, and the days: cost x size modifier / (500 x workforce)
export function equipmentCost(row: { type: string; cost: number }, size: string): { installed: number; material: number } {
  const factor = row.type === "Weapon" || row.type === "Ammunition" ? 1 : EQUIPMENT_TABLES.sizeCost[size] ?? 1;
  const installed = Math.round(row.cost * factor);
  return { installed, material: Math.round(installed / 2) };
}
export const equipmentWorkforce = (size: string) => EQUIPMENT_TABLES.workforce[size] ?? 1;
export function equipmentDays(row: { type: string; cost: number }, size: string, workers: number): number {
  const factor = row.type === "Weapon" || row.type === "Ammunition" ? 1 : EQUIPMENT_TABLES.sizeCost[size] ?? 1;
  return Math.max(0.5, Math.round(((row.cost * factor) / (500 * Math.max(1, workers))) * 2) / 2);
}

// ---- Parts: what is bought, carried and installed --------------------------------------------------------------------------------

// A ship part the party owns (kept with the character, `playState.shipParts`): an assembled modification or piece of equipment
// (for a ship of `size`, the size its price was worked for), or an enhanced ship armor, shield or weapon
export interface ShipPart {
  id: string;
  kind: "mod" | "equipment" | "enhanced";
  name: string;
  size?: string;
  grade?: number;
  type?: string;
  rarity?: string;
  bonus?: number;
  // What it is worth (its material cost, or an enhanced item's value), for selling it on
  worth: number;
  // Taken from a wreck or a scrapyard (house rule: sold at 60%)
  salvaged?: boolean;
}

// Who sells parts where (house rules; the books leave stock to the GM, the user set the rule on 2026-10-21): a scrapyard (junkyard or
// scrap dealer) sells salvaged parts, of grade 0 and 1 and premium at best, only in a settlement with a port, away from the Core worlds or
// where the law hardly reaches; a shipyard's showroom sells new parts up to a grade that rises with the wealth of the place.
export const RICH_REGIONS = ["Deep Core", "Core", "Colonies", "Inner Rim"];
export const MID_REGIONS = ["Expansion Region", "Mid Rim"];
export interface PartsPlace {
  // The trader (seeds the stock) and the day
  seed: string;
  day: number;
  kind: "salvage" | "yard";
  region: string;
  settlementType: string;
  law: number;
  hasPort: boolean;
  // Prices move with the region and the settlement, as in any market
  factor: number;
}
export function scrapSellsParts(place: Pick<PartsPlace, "region" | "law" | "hasPort">): boolean {
  return place.hasPort && (!RICH_REGIONS.includes(place.region) || place.law <= 1);
}
// The best grade of modification a shipyard has: a city of the Core worlds the best (5), a far town or an outpost the least
export function yardGrade(place: Pick<PartsPlace, "region" | "settlementType">): number {
  const wealth = RICH_REGIONS.includes(place.region) ? 2 : MID_REGIONS.includes(place.region) ? 1 : 0;
  const by: Record<string, number[]> = { city: [3, 4, 5], station: [2, 3, 4], town: [2, 2, 3], outpost: [1, 1, 1], village: [1, 1, 1] };
  return (by[place.settlementType] ?? [1, 1, 2])[wealth];
}
export const ENHANCED_BY_GRADE = (grade: number) => ["premium", "prototype", "advanced"].filter((_, i) => grade >= [2, 3, 4][i]);
export const SALVAGE_PRICE = 0.6;
export const SALVAGE_BUYS = 0.4;
export const YARD_BUYS = 0.5;

export interface PartLine {
  part: Omit<ShipPart, "id">;
  // The price of the part (its material cost, moved by the market; less for salvage)
  price: number;
  // At a shipyard: the price to buy it installed (no check), and the days the yard's crew takes
  installed?: number;
  days?: number;
}

const stream = (seed: string) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
};
const shuffled = <T>(list: T[], r: () => number) => list.map((x) => ({ x, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.x);

// What a scrapyard or a shipyard has today for a ship of `size`. `equipment` is the starship equipment data; `enhanced` the ship parts
// of the enhanced items, with their value
export function partsStock(
  place: PartsPlace,
  size: string,
  equipment: { name: string; type: string; cost: number }[],
  enhanced: { name: string; type: string; searchableRarity: string; text?: string; value: number }[],
): PartLine[] {
  if (place.kind === "salvage" && !scrapSellsParts(place)) return [];
  const r = stream(`${place.seed}|${place.day}`);
  const salvage = place.kind === "salvage";
  const top = salvage ? 1 : yardGrade(place);
  const cut = salvage ? SALVAGE_PRICE : 1;
  const price = (n: number) => Math.max(1, Math.round(n * place.factor * cut));
  const lines: PartLine[] = [];
  const yardCrew = (kind: "mod" | "tier") => 2 * (kind === "mod" ? modWorkforce(size) : UPGRADE_TABLES.workforce[size] ?? 1);
  // Modifications of the grades on offer (a suite only for a ship that takes suites)
  const mods = SHIP_MODS.filter((m) => m.grade <= top && (salvage ? true : m.grade >= 0) && (m.type !== "Suite" || sizeAt(size) >= sizeAt("Small")));
  for (const m of shuffled(mods, r).slice(0, salvage ? 4 + Math.floor(r() * 4) : 10 + Math.floor(r() * 5))) {
    const c = modCost(m, size);
    lines.push({
      part: { kind: "mod", name: m.name, size, grade: m.grade, type: m.type, worth: c.material, salvaged: salvage || undefined },
      price: price(c.material),
      ...(salvage ? {} : { installed: price(c.installed), days: modDays(m, size, yardCrew("mod")) }),
    });
  }
  // Equipment: a scrapyard has the cheaper pieces, salvaged; a shipyard has some of everything
  const sellable = equipment.filter((e) => e.cost > 0 && e.type !== "Ammunition" && (!salvage || e.cost <= 5000));
  for (const e of shuffled(sellable, r).slice(0, salvage ? 2 + Math.floor(r() * 3) : 0)) {
    const c = equipmentCost(e, size);
    lines.push({ part: { kind: "equipment", name: e.name, size, type: e.type, worth: c.material, salvaged: true }, price: price(c.material) });
  }
  // Enhanced ship armor, shields and weapons: premium at a scrapyard one day in three; by the yard's grade at a shipyard
  const rarities = salvage ? (r() < 1 / 3 ? ["premium"] : []) : ENHANCED_BY_GRADE(top);
  for (const e of enhanced.filter((x) => rarities.includes(x.searchableRarity.toLowerCase()) && SHIP_PART_TYPES.includes(x.type))) {
    const p = enhancedShipPart(e)!;
    lines.push({ part: { kind: "enhanced", name: e.name, type: e.type, rarity: e.searchableRarity, bonus: p.bonus, worth: e.value, salvaged: salvage || undefined }, price: price(e.value) });
  }
  return lines.sort((a, b) => a.price - b.price);
}

// What a trader pays for a part the party sells (house rule): a scrapyard 40% of its worth, a shipyard 50%
export const partOffer = (part: Pick<ShipPart, "worth">, kind: "salvage" | "yard") => Math.max(1, Math.round(part.worth * (kind === "salvage" ? SALVAGE_BUYS : YARD_BUYS)));

// ---- Who does the work -------------------------------------------------------------------------------------------------------------

// The party's own work on its ship (the book: half the cost, the party's time and workforce; the foremost mechanic makes the
// Intelligence (Mechanic's Kit) check). Away from a port the book allows up to twice the time and a harder check: house rule, twice the
// time and DC +5. A failed check costs half the time and half the part's worth in spoiled components, and the part is kept.
export interface CrewPlan {
  days: number;
  dc: number;
  workforce: number;
  enough: boolean;
  reason: string;
}
export function crewModPlan(ship: Upgradable & { tier: number }, row: ShipModRow, workers: number, atPort: boolean): CrewPlan {
  const need = modWorkforce(ship.size);
  const { capacity, used } = slotsOf(ship);
  const over = Math.max(0, used + 1 - capacity);
  const days = modDays(row, ship.size, workers) * (atPort ? 1 : 2);
  const dc = installDC(row.grade, ship.tier, ship.size, over) + (atPort ? 0 : 5);
  const enough = workers >= need;
  return { days, dc, workforce: need, enough, reason: enough ? "" : `A ${ship.size} ship takes a workforce of ${need} for a modification; you have ${workers}.` };
}
export function crewEquipmentPlan(ship: { size: string }, row: { type: string; cost: number }, workers: number, atPort: boolean): CrewPlan {
  const need = equipmentWorkforce(ship.size);
  const enough = workers >= need;
  // House rule: fitting equipment yourself is an Intelligence (Mechanic's Kit) check of DC 10 (the book names no DC for equipment)
  return { days: equipmentDays(row, ship.size, workers) * (atPort ? 1 : 2), dc: 10 + (atPort ? 0 : 5), workforce: need, enough, reason: enough ? "" : `A ${ship.size} ship takes a workforce of ${need} for its equipment; you have ${workers}.` };
}
