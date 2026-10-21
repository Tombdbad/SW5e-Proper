/**
 * Imports every SW5e dataset (core books and expanded content) from the sw5e.com API into
 * shared/data/sw5e/*.json. Those files are the single source of rules data for client and server:
 * nothing else in the repo should define species, classes, powers, equipment, monsters and so on.
 *
 * Run: npm run import:sw5e
 *   SW5E_CACHE=<dir>  read <dir>/<endpoint>.json instead of the network when the file exists
 *   SW5E_API=<url>    another API base (default https://sw5eapi.azurewebsites.net/api)
 *   DERIVE_ONLY=1     rebuild only the datasets derived from book text (transport, tools), without the network
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const API = process.env.SW5E_API || "https://sw5eapi.azurewebsites.net/api";
const CACHE = process.env.SW5E_CACHE;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/sw5e");

// output file -> API endpoint
const DATASETS: Record<string, string> = {
  species: "species",
  classes: "class",
  archetypes: "archetype",
  backgrounds: "background",
  feats: "feat",
  powers: "power",
  equipment: "equipment",
  enhancedItems: "enhancedItem",
  monsters: "monster",
  maneuvers: "maneuvers",
  fightingStyles: "fightingStyle",
  fightingMasteries: "fightingMastery",
  lightsaberForms: "lightsaberForm",
  classImprovements: "classImprovement",
  multiclassImprovements: "multiclassImprovement",
  splashclassImprovements: "splashclassImprovement",
  weaponFocuses: "weaponFocus",
  weaponSupremacies: "weaponSupremacy",
  weaponProperties: "weaponProperty",
  armorProperties: "armorProperty",
  skills: "skills",
  conditions: "conditions",
  characterAdvancement: "characterAdvancement",
  referenceTables: "referenceTable",
  starshipSizes: "starshipBaseSize",
  starshipDeployments: "starshipDeployment",
  starshipEquipment: "starshipEquipment",
  starshipModifications: "starshipModification",
  starshipVentures: "starshipVenture",
  rulesPlayersHandbook: "PlayerHandbookRule",
  rulesStarships: "StarshipRule",
  rulesWretchedHives: "WretchedHivesRule",
  rulesVariant: "VariantRule",
  rulesExpandedContent: "ExpandedContent",
};

const DROP_KEYS = new Set(["partitionKey", "rowKey", "timestamp", "eTag", "descriptionWithLinks"]);

async function fetchJson(endpoint: string): Promise<any> {
  const cached = CACHE && path.join(CACHE, `${endpoint}.json`);
  if (cached && fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, "utf8"));
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${API}/${endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw new Error(`${endpoint}: ${lastError}`);
}

// The API has U+FFFD where the books have an apostrophe or a dash
function cleanText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/([A-Za-z])�(s|t|d|m|re|ll|ve)\b/g, "$1'$2")
    .replace(/�/g, "—");
}

const isEmpty = (v: any) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

// Drops storage metadata, "...Json" string copies and "...Enum" number copies of fields that are
// also present as real values, and empty fields.
function clean(value: any): any {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, any> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (DROP_KEYS.has(key)) continue;
    if (key.endsWith("Json")) {
      const twin = key.slice(0, -4);
      const plural = twin + "s";
      if (!isEmpty((value as any)[twin]) || !isEmpty((value as any)[plural])) continue;
      if (typeof raw === "string" && raw.trim()) {
        try {
          const parsed = clean(JSON.parse(raw));
          if (!isEmpty(parsed)) out[twin] = parsed;
        } catch {
          out[key] = cleanText(raw);
        }
      }
      continue;
    }
    if (key.endsWith("Enum") && (value as any)[key.slice(0, -4)] !== undefined) continue;
    if (key.endsWith("Parsed") && (value as any)[key.slice(0, -6)] !== undefined) continue;
    const cleaned = clean(raw);
    if (!isEmpty(cleaned)) out[key] = cleaned;
  }
  return out;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/['’]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");

function withIds(rows: any[]): any[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = slug(
      row.chapterName ??
        (row.sourceName ? `${row.sourceName} ${row.name} ${row.level ?? ""}` : row.name ?? String(row.level ?? "")),
    );
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { id: n === 1 ? base : `${base}-${n}`, ...row };
  });
}

function sortRows(rows: any[]): any[] {
  const key = (r: any) =>
    r.chapterNumber !== undefined ? String(r.chapterNumber + 100).padStart(4, "0") :
    r.name !== undefined ? String(r.name).toLowerCase() : String(r.level ?? 0).padStart(3, "0");
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)) || String(a.sourceName ?? "").localeCompare(String(b.sourceName ?? "")));
}

function write(name: string, rows: any[] | Record<string, any>) {
  const body = Array.isArray(rows)
    ? "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n"
    : JSON.stringify(rows, null, 1) + "\n";
  fs.writeFileSync(path.join(OUT, `${name}.json`), body);
  return body.length;
}

// Markdown tables in a chapter, with the heading above each
function tables(markdown: string): { title: string; header: string[]; rows: string[][] }[] {
  const found: { title: string; header: string[]; rows: string[][] }[] = [];
  const lines = markdown.split("\n");
  let title = "";
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{2,6}\s+(.*?)\s*$/);
    if (heading) title = heading[1].replace(/\*/g, "").trim();
    if (!lines[i].trim().startsWith("|") || !/^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) continue;
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/\*/g, "").trim());
    const header = cells(lines[i]);
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith("|"); j++) rows.push(cells(lines[j]));
    found.push({ title, header, rows });
    i = j;
  }
  return found;
}

const number = (s: string) => {
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

// The API lists class, archetype and species features in one flat table. Each feature is stored
// with its owner instead, so it has one home. Species already carry most of theirs as traits.
function attachFeatures(loaded: Record<string, any[]>, features: any[]) {
  const owners: Record<string, any[]> = { Class: loaded.classes, Archetype: loaded.archetypes, Species: loaded.species };
  let attached = 0;
  for (const [source, rows] of Object.entries(owners)) {
    for (const owner of rows) {
      const known = new Set((owner.traits ?? []).map((t: any) => t.name));
      const own = features
        .filter((f) => f.source === source && f.sourceName === owner.name && !known.has(f.name))
        .map(({ name, level, text, metadata }) => ({ name, ...(level !== undefined ? { level } : {}), text, ...(metadata ? { metadata } : {}) }))
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
      if (own.length) owner.features = own;
      attached += own.length;
    }
  }
  return attached;
}

// Short lists the books give as prose or tables
function deriveLookups(handbook: any[], loaded: Record<string, any[]>) {
  const personality = handbook.find((c) => c.chapterName === "Personality and Backgrounds")?.contentMarkdown ?? "";
  const languageTables = tables(personality).filter((t) => t.title === "Common Languages");
  const languages = languageTables.flatMap((t) => [...t.header, ...t.rows.flat()]).map((l) => l.trim()).filter(Boolean).sort();
  const pick = (title: RegExp) =>
    tables(personality)
      .filter((t) => title.test(t.header[1] ?? ""))
      .flatMap((t) => t.rows.map((r) => (r[1].match(/^([A-Za-z]+):/) ?? [])[1]))
      .filter(Boolean);
  const morality = pick(/Morality/);
  const society = pick(/Society/);
  if (languages.length < 20 || morality.length !== 3 || society.length !== 3) {
    throw new Error("could not read the language or alignment tables from the Player's Handbook");
  }
  const pointCost = loaded.referenceTables.find((t) => t.name === "Ability Score Point Cost");
  // Credits a character should have earned by each level (index 0 is 1st level)
  const equipment = handbook.find((c) => c.chapterName === "Equipment")?.contentMarkdown ?? "";
  const wealthByLevel = tables(equipment)
    .filter((t) => t.title === "Wealth by Level")
    .flatMap((t) => t.rows.map((r) => number(r[1]) ?? 0));
  if (wealthByLevel.length !== 20) throw new Error("could not read the Wealth by Level table from the Player's Handbook");
  // "2 for d4, 2 for d6, 3 for d8, 4 for d10, 5 for d12, and 8 for d20": what a die can no longer roll below
  const abilityScores = handbook.find((c) => c.chapterName === "Using Ability Scores")?.contentMarkdown ?? "";
  const minimumRollThreshold: Record<string, number> = Object.fromEntries(
    Array.from(abilityScores.slice(abilityScores.indexOf("Minimum Roll Threshold")).matchAll(/(\d+) for (d\d+)/g)).map((m) => [m[2], Number(m[1])]),
  );
  if (!minimumRollThreshold.d4 || !minimumRollThreshold.d12) throw new Error("could not read the Minimum Roll Threshold from the Player's Handbook");
  return {
    wealthByLevel,
    minimumRollThreshold,
    languages,
    alignments: society.flatMap((s) => morality.map((m) => `${s} ${m}`)),
    abilities: ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"],
    abilityScorePointCost: Object.fromEntries(tables(pointCost?.content ?? "").flatMap((t) => t.rows.map((r) => [r[0], Number(r[1])]))),
  };
}

// Facts the world generator needs that the API only has as book text
function deriveTravel(starshipChapters: any[]) {
  const all = starshipChapters.flatMap((c) => tables(c.contentMarkdown ?? "").map((t) => ({ ...t, chapter: c.chapterName })));
  const hyper = all.find((t) => t.header.includes("Deep Core") && t.rows.length >= 9);
  if (!hyper) throw new Error("hyperspace travel table not found in the Starships book");
  const regions = hyper.header.slice(1);
  const hyperspaceHours: Record<string, Record<string, number>> = {};
  for (const row of hyper.rows) {
    hyperspaceHours[row[0]] = Object.fromEntries(regions.map((r, i) => [r, Number(row[i + 1])]));
  }
  const realspace = all.find((t) => t.title === "Sample Realspace Travel Times");
  const sizeNames = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
  const sizes: Record<string, Record<string, string>> = Object.fromEntries(sizeNames.map((s) => [s, {}]));
  for (const t of all) {
    if (!sizeNames.every((s) => t.rows.some((r) => r[0] === s))) continue;
    for (const row of t.rows) {
      if (!sizes[row[0]]) continue;
      row.slice(1).forEach((cell, i) => {
        const column = t.header[i + 1] || "value";
        sizes[row[0]][t.header.length > 2 ? `${t.title}: ${column}` : t.title || column] = cell;
      });
    }
  }
  return {
    regions,
    hyperspaceHours,
    realspaceTravel: (realspace?.rows ?? []).map(([distance, time]) => ({ distance, time })),
    starshipSizes: sizeNames.map((name) => ({
      name,
      space: sizes[name]["Size Categories"],
      stockCost: number(sizes[name]["Starship Size Stock Cost"] ?? ""),
      modificationSlots: number(sizes[name]["Modification Capacity by Ship Size"] ?? ""),
      fuelCapacity: number(sizes[name]["Starship Size Fuel Capacity"] ?? ""),
      tables: sizes[name],
    })),
  };
}


// Ground transport from the Expanded Content equipment chapter (mounts, tack and vehicles) and
// the Player's Handbook travel pace table; each mount's carrying capacity is in pounds, its
// speed in feet, and a vehicle's speed in miles an hour
function deriveTransport(expanded: any[], handbook: any[]) {
  const chapter = expanded.find((c) => c.chapterName === "Equipment")?.contentMarkdown ?? "";
  const all = tables(chapter);
  const mountTable = all.find((t) => t.title === "Mounts and Other Animals");
  const vehicleTable = all.find((t) => t.title === "Vehicles");
  const tackTable = all.find((t) => /^Tack, Harness/.test(t.title));
  if (!mountTable || !vehicleTable) throw new Error("could not read the Mounts and Vehicles tables from the Expanded Content");
  const adventuring = handbook.find((c) => c.chapterName === "Adventuring")?.contentMarkdown ?? "";
  const pace = tables(adventuring).find((t) => t.title === "Travel Pace");
  if (!pace) throw new Error("could not read the Travel Pace table from the Player's Handbook");
  return {
    mounts: mountTable.rows.map((r) => ({ name: r[0], cost: number(r[1]) ?? 0, speed: number(r[3]) ?? 0, capacity: number(r[4]) ?? 0 })),
    vehicles: vehicleTable.rows.map((r) => ({ name: r[0], cost: number(r[1]) ?? 0, mph: number(r[2]) ?? 0 })),
    tack: (tackTable?.rows ?? [])
      .filter((r) => r[1])
      .map((r) => ({ name: r[0].replace(/&emsp;|_/g, "").replace(/\s+/g, " ").trim(), cost: r[1], weight: r[2] })),
    pace: pace.rows.map((r) => ({ pace: r[0], feetPerMinute: number(r[1]) ?? 0, milesPerHour: number(r[2]) ?? 0, milesPerDay: number(r[3]) ?? 0, effect: r[4] ?? "" })),
  };
}

// The downtime activities of Wretched Hives' Entertainment and Downtime chapter: for each, what it
// costs and asks for (the text), the d100 result table, the uptime table, and the complications
// tables; and the tables the activities share (roll modifiers by DC, enhanced items by rarity).
// The engine in shared/logic reads these; nothing about an activity's outcomes is written there.
function deriveDowntime(hives: any[]) {
  const chapter: string = hives.find((c) => c.chapterName === "Entertainment and Downtime")?.contentMarkdown ?? "";
  const items: string = hives.find((c) => c.chapterName === "Enhanced Items")?.contentMarkdown ?? "";
  if (!chapter) throw new Error("could not find the Entertainment and Downtime chapter in Wretched Hives");
  const all = [...tables(chapter), ...tables(items)];
  const band = (cell: string): { min?: number; max?: number } => {
    const text = cell.replace(/,/g, "").trim();
    let m: RegExpMatchArray | null;
    if ((m = text.match(/^(\d+) or lower/i))) return { max: Number(m[1]) };
    if ((m = text.match(/^(\d+) or higher/i))) return { min: Number(m[1]) };
    if ((m = text.match(/^(\d+)\s*[-–]\s*(\d+)/))) return { min: Number(m[1]), max: Number(m[2]) };
    return {};
  };
  const modifierTable = all.find((t) => /Roll Modifier$/.test(t.title) && /DC/i.test(t.header[0]) && t.rows.length === 5);
  if (!modifierTable) throw new Error("could not read a Roll Modifier table from Wretched Hives");
  const rollModifier = modifierTable.rows.map((r) => ({ dc: number(r[0]) ?? 0, bonus: number(r[1]) ?? 0 }));
  const byRarity = (title: string) => all.find((t) => t.title === title)?.rows ?? [];
  const sections = chapter.split(/^## /m).slice(1);
  const activities: any[] = [];
  let rivals: string[] = [];
  for (const section of sections) {
    const name = section.split("\n")[0].trim();
    const found = tables(`## ${section}`);
    if (name === "Rivals") {
      rivals = found.find((t) => t.title === "Example Rivals")?.rows.map((r) => r[1]) ?? [];
      continue;
    }
    const part = (heading: string) => {
      const m = section.match(new RegExp(`^### ${heading}\\s*$([\\s\\S]*?)(?=^### |^## |^#### |$(?![\\s\\S]))`, "m"));
      return (m?.[1] ?? "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    };
    // Everything under Resources, its sub-headings too (Training lists what it takes for each thing trained)
    const full = section.match(/^### Resources\s*$([\s\S]*?)(?=^### |^## |$(?![\s\S]))/m)?.[1] ?? "";
    const resourcesFull = full.replace(/^#{4,6}\s+(.*)$/gm, " [$1] ").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    const upIndex = section.indexOf("### Uptime");
    const upText = upIndex >= 0 ? section.slice(upIndex) : "";
    const upTables = tables(`## ${upText}`);
    // The d100 table (not the roll modifiers, not the uptime table)
    const results = found.filter((t) => /^d100$/i.test(t.header[0]) && !/Uptime/i.test(t.title) && !/Roll Modifier/i.test(t.title));
    const complications = found
      .filter((t) => /Complications$/.test(t.title))
      .map((t) => ({ title: t.title, die: number(t.header[0]) ?? 6, rows: t.rows.map((r) => ({ roll: number(r[0]) ?? 0, text: r[1] })) }));
    // By the successes in five checks, or by the DC met (Work)
    const upTable = upTables.find((t) => /\(Uptime\)$/.test(t.title));
    const upResults = upTable?.rows.map((r) => ({ [/success/i.test(upTable.header[0]) ? "successes" : "dc"]: number(r[0]) ?? 0, text: r[1] }));
    activities.push({
      id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
      name,
      intro: section.split("\n").slice(1).find((l) => l.trim() && !l.startsWith("#")) ?? "",
      resources: part("Resources"),
      resourcesFull,
      resolution: part("Resolution"),
      complicationText: part("Complications") || part("Crafting Complications"),
      results: results.length ? results[0].rows.map((r) => ({ ...band(r[0]), text: r[1] })) : [],
      complications,
      uptime: upText
        ? {
            resources: (upText.match(/#### Resources\s+([\s\S]*?)(?=\n#### |$)/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
            resolution: (upText.match(/#### Resolution\s+([\s\S]*?)(?=\n#### |$)/)?.[1] ?? "").replace(/\s+/g, " ").trim(),
            ...(upResults ? { results: upResults } : {}),
          }
        : undefined,
    });
  }
  const rarityRows = (title: string, pick: (r: string[]) => any) => Object.fromEntries(byRarity(title).map((r) => [r[0], pick(r)]));
  const range = (cell: string) => {
    const nums = Array.from(cell.replace(/,/g, "").matchAll(/\d+/g)).map((m) => Number(m[0]));
    return /up to/i.test(cell) ? { min: 0, max: nums[0] } : /at least/i.test(cell) ? { min: nums[0] } : { min: nums[0], max: nums[1] };
  };
  const out = {
    rollModifier,
    rivals,
    activities,
    // Enhanced items: the DC to find a seller and the d100 modifier by rarity (Buying Enhanced Items)
    sellers: rarityRows("Purchasable Enhanced Items", (r) => ({ dc: number(r[1]), modifier: number(r[2]) })),
    // The creature level to face for a rare ingredient, and the d100 modifier (Crafting)
    ingredients: rarityRows("Enhanced Item Ingredients", (r) => ({ cr: range(r[1].replace(/-/, " to ")), modifier: number(r[2]) })),
    blueprintDc: rarityRows("Blueprint Learning DC by Rarity", (r) => number(r[1])),
    reverseDc: rarityRows("Reverse Engineer DC by Rarity", (r) => number(r[1])),
    value: rarityRows("Enhanced Item Value by Rarity", (r) => range(r[1].replace(/ - /, " to "))),
    valueModifier: rarityRows("Value Modifier by Rarity", (r) => number(r[1])),
    // Selling an enhanced item: the dice of days to find a buyer and the d100 modifier by rarity
    buyers: rarityRows("Salable Enhanced Items", (r) => ({ days: r[1], modifier: number(r[2]) })),
  };
  if (activities.length < 13 || activities.some((a) => !a.results.length) || !Object.keys(out.sellers).length || !Object.keys(out.value).length) {
    throw new Error(`could not read the downtime tables from Wretched Hives: ${activities.map((a) => `${a.name}:${a.results.length}`).join(", ")}`);
  }
  return out;
}

// What a starship of each size is made of, from Starships of the Galaxy's size texts: the ability
// score adjustments, the hull die and the hull and shield dice and AC upgrade of each tier, and the
// roles (their ability adjustment, armor, shields, reactor, power coupling, speed and turning speed)
function deriveShips(sizes: any[], starshipChapters: any[]) {
  const out: Record<string, any> = {};
  for (const size of sizes) {
    const text: string = size.fullText ?? "";
    const header = text.match(/##### [A-Za-z ]+\n\|[^\n]+\n\|[^\n]+\n((?:\|[^\n]+\n?)+)/);
    if (!header) throw new Error(`could not read the tier table of ${size.name} ships`);
    const rows = header[1].trim().split("\n").map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const dice = rows.map((r) => r[3].match(/(\d+)d(\d+)/)).map((m) => (m ? [Number(m[1]), Number(m[2])] : [0, 0]));
    const acUpgrade = rows.map((r) => Number((r[4] ?? "").replace(/[^\d]/g, "")) || 0);
    const abilities: Record<string, number> = {};
    const adjust = text.match(/#### Ability Score Adjustments\n___\n((?:- [^\n]+\n?)+)/)?.[1] ?? "";
    for (const m of adjust.matchAll(/\*\*(\w+)\*\*\s*([+-]?\d+)/g)) abilities[m[1].toLowerCase()] = Number(m[2]);
    const firstHull = Number(text.match(/Hull Points for 1st Hull Die:\*\*\s*(\d+)/)?.[1] ?? dice[0][1]);
    const slots = Number(text.match(/Base Modification Slots:\*\*\s*(\d+)/)?.[1] ?? 0);
    const roleSection = text.split(/### Role\n/)[1]?.split(/\n### /)[0] ?? "";
    const roles = roleSection.split(/\n#### /).slice(1).map((block) => {
      const name = block.split("\n")[0].trim();
      const get = (key: string) => block.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*([^\\n]*)`))?.[1]?.trim() ?? "";
      const adj: Record<string, number> = {};
      for (const m of get("Ability Score Adjustment").matchAll(/([+-]\d+)\s+(\w+)/g)) adj[m[2].toLowerCase()] = Number(m[1]);
      const speed = get("Speed/Turning").match(/(\d+)\s*\/\s*(\d+)/);
      return { name, abilities: adj, armor: get("Armor"), shields: get("Shields"), reactor: get("Reactor"), coupling: get("Power Coupling"), speed: speed ? Number(speed[1]) : 0, turning: speed ? Number(speed[2]) : 0 };
    });
    if (!roles.length) throw new Error(`could not read the roles of ${size.name} ships`);
    out[size.name] = { abilities, hullDie: dice[0][1], hullDice: dice.map((d) => d[0]), firstHull, acUpgrade, slots, roles };
  }
  // Ammunition: the damage of missiles, rockets and torpedoes (a dice figure for Large and smaller
  // ships and one in brackets for Huge and larger), and the area and saving throw of bombs and mines
  const equipment: string = starshipChapters.find((c) => c.chapterName === "Equipment")?.contentMarkdown ?? "";
  const dice = (cell: string) => {
    const m = cell.match(/(\d+d\d+)(?:\s*\((\d+d\d+)\))?\s*(\w+)?/);
    return m ? { dice: m[1], diceHuge: m[2] ?? m[1], type: (m[3] ?? "").toLowerCase() } : null;
  };
  const tertiary: any[] = [];
  const grouped = tables(equipment).find((t) => t.title === "Tertiary Ammunition");
  let launcher = "";
  for (const row of grouped?.rows ?? []) {
    const name = row[0].replace(/^_|_$/g, "").trim();
    if (!row[1] && !row[2]) {
      launcher = name.replace(/^\(Assault\)\s*/i, "");
      continue;
    }
    const hit = dice(row[2] ?? "");
    const range = (row[4] ?? "").match(/Range (\d+)\/(\d+)/i);
    tertiary.push({ launcher, name, cost: number(row[1]) ?? 0, ...(hit ?? {}), normal: range ? Number(range[1]) : 0, long: range ? Number(range[2]) : 0, properties: (row[4] ?? "").replace(/[()]/g, "") });
  }
  const bombs: any[] = [];
  const descriptions = equipment.split("## Ammunition Descriptions")[1] ?? equipment.split(/Ammunition Descriptions/i)[1] ?? "";
  for (const block of descriptions.split(/\n#### /).slice(1)) {
    const name = block.split("\n")[0].trim();
    const body = block.split("\n").slice(1).join(" ");
    const save = body.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw \(DC (\d+)\)/);
    const hit = body.match(/takes (\d+d\d+) \[(\d+d\d+)\] (\w+) damage/);
    const radius = body.match(/within (\d+) \[(\d+)\] feet/);
    bombs.push({ name, ...(save ? { save: save[1].toLowerCase(), dc: Number(save[2]) } : {}), ...(hit ? { dice: hit[1], diceHuge: hit[2], type: hit[3].toLowerCase() } : {}), ...(radius ? { radius: Number(radius[1]), radiusHuge: Number(radius[2]) } : {}), text: body.slice(0, 400) });
  }
  out.ammunition = { tertiary, quaternary: bombs };
  // Armor (the most of the Dexterity modifier that counts, and the damage reduction) and shields
  // (capacity and regeneration rate as multiples), from the armor and shields table
  const fraction = (cell: string) => {
    const f = cell.match(/(\d+)\s*\/\s*(\d+)/);
    if (f) return Number(f[1]) / Number(f[2]);
    const n = cell.match(/(\d+(?:\.\d+)?)/);
    return n ? Number(n[1]) : null;
  };
  const armorTable = tables(equipment).find((t) => t.header[0] === "Name" && t.header.some((h) => /Shield\s+Capacity/i.test(h)));
  if (!armorTable) throw new Error("could not read the armor and shields table of Starships of the Galaxy");
  const armor: Record<string, { cap: number | null; dr: number }> = {};
  const shields: Record<string, { capacity: number; regen: number }> = {};
  for (const row of armorTable.rows) {
    const name = row[0].replace(/_/g, "").trim();
    if (/armor$/i.test(name) && /\s/.test(name)) {
      const max = (row[2] ?? "").match(/max (\d+)/i);
      armor[name.replace(/ armor$/i, "")] = { cap: max ? Number(max[1]) : null, dr: Number((row[3] ?? "").replace(/[^\d]/g, "")) || 0 };
    } else if (/shield$/i.test(name)) {
      shields[name.replace(/ shield$/i, "")] = { capacity: fraction(row[5] ?? "") ?? 1, regen: fraction(row[6] ?? "") ?? 1 };
    }
  }
  out.armor = armor;
  out.shields = shields;
  // Refitting: 100 credits for each hull die missing, times the size's cost modifier; the time by size
  const chapter3: string = starshipChapters.find((c) => c.chapterName === "Starships")?.contentMarkdown ?? "";
  const chapter8: string = starshipChapters.find((c) => c.chapterName === "Adventuring")?.contentMarkdown ?? "";
  const costTable = tables(chapter3).find((t) => /Starship Size Upgrade Cost/i.test(t.title));
  const timeTable = tables(chapter8).find((t) => /Refitting Time/i.test(t.title));
  const hours = (cell: string) => {
    const n = number(cell) ?? 0;
    return /week/i.test(cell) ? n * 168 : /month/i.test(cell) ? n * 720 : /day/i.test(cell) ? n * 24 : n;
  };
  out.refit = {
    cost: Object.fromEntries((costTable?.rows ?? []).map((r) => [r[0].trim(), number(r[1].replace(/x/i, "")) ?? 1])),
    hours: Object.fromEntries((timeTable?.rows ?? []).map((r) => [r[0].trim(), hours(r[1])])),
  };
  if (!Object.keys(out.refit.cost).length || !Object.keys(out.refit.hours).length) throw new Error("could not read the refitting tables of Starships of the Galaxy");
  // Modifications (chapter 4): the base cost by category, the cost modifier, workforce and slots by size, the
  // installation DC by the modification's grade and the ship's tier, and the most suites a size takes
  const chapter4: string = starshipChapters.find((c) => c.chapterName === "Modifications")?.contentMarkdown ?? "";
  const bySize = (title: RegExp, from: string) => Object.fromEntries((tables(from).find((t) => title.test(t.title))?.rows ?? []).map((r) => [r[0].trim(), number(r[1].replace(/^x\s*/i, "")) ?? 0]));
  const dcTable = tables(chapter4).find((t) => /Installation by Ship Tier/i.test(t.title));
  const suites = tables(chapter4).find((t) => /Maximum Suites/i.test(t.title));
  out.modifications = {
    baseCost: Object.fromEntries((tables(chapter4).find((t) => /Category Base Cost/i.test(t.title))?.rows ?? []).map((r) => [r[0].trim(), number(r[1]) ?? 0])),
    sizeCost: bySize(/Size Modification Cost/i, chapter4),
    workforce: bySize(/Size Modification Workforce/i, chapter4),
    slots: bySize(/Capacity by Ship Size/i, chapter4),
    suiteCapacity: bySize(/Suite Capacity/i, chapter4),
    // Grade 0 to 5, tier 0 to 5
    installDc: (dcTable?.rows ?? []).map((r) => r.slice(1, 7).map((c) => number(c) ?? 0)),
    // "3 + con. mod.": a base and the multiple of the Constitution modifier; none for a Tiny ship
    maxSuites: Object.fromEntries((suites?.rows ?? []).map((r) => {
      const m = r[1].replace(/\s/g, "").match(/^(-?\d+)\+(\d*)x?con/i);
      return [r[0].trim(), m ? { base: Number(m[1]), con: Number(m[2] || 1) } : null];
    })),
  };
  // Upgrading a ship's tier (chapter 3): the base cost of each tier, the size's cost modifier and the least workforce
  out.upgrade = {
    tierCost: (tables(chapter3).find((t) => /Base Upgrade Cost by Tier/i.test(t.title))?.rows ?? []).map((r) => number(r[1]) ?? 0),
    sizeCost: bySize(/Starship Size Upgrade Cost/i, chapter3),
    workforce: bySize(/Starship Size Upgrade Workforce/i, chapter3),
  };
  // Equipment (chapter 5): the cost modifier and least workforce by size (weapons and ammunition cost the same for any size), and the
  // cargo capacity in tons; each table is printed in two halves
  const bySizeAll = (title: RegExp, from: string) =>
    Object.fromEntries(tables(from).filter((t) => title.test(t.title)).flatMap((t) => t.rows).map((r) => [r[0].trim(), r[1].trim() === "—" ? 0 : number(r[1].replace(/^x\s*/i, "")) ?? 0]));
  out.equipment = {
    sizeCost: bySizeAll(/Size Equipment Cost/i, equipment),
    workforce: bySizeAll(/Size Equipment Workforce/i, equipment),
    cargoTons: bySizeAll(/Size Cargo Capacity/i, equipment),
  };
  if (Object.keys(out.equipment.sizeCost).length !== 6 || Object.keys(out.equipment.workforce).length !== 6) throw new Error("could not read the equipment cost and workforce tables of Starships of the Galaxy");
  const mods = out.modifications;
  if (Object.keys(mods.baseCost).length !== 5 || mods.installDc.length !== 6 || Object.keys(mods.slots).length !== 6 || out.upgrade.tierCost.length !== 6) throw new Error("could not read the modification and upgrade tables of Starships of the Galaxy");
  return out;
}

// What each tool is for, from Wretched Hives' Tool Proficiencies chapter: the three skills it helps
// (with proficiency in both, advantage), its special use (once a rest), and sample activities
// with their DCs. Entries the book left as a template are kept with what they do have.
function deriveTools(hives: any[], equipment: any[]) {
  const markdown: string = hives.find((c) => c.chapterName === "Tool Proficiencies")?.contentMarkdown ?? "";
  if (!markdown) throw new Error("could not find the Tool Proficiencies chapter in Wretched Hives");
  const template = /\*(Tool description|Skill and tool description interaction|Feature that utilizes the tool in some capacity|Activity description)\.?\*/i;
  const tableOfItems = tables(markdown).find((t) => t.title === "Item Specific Tools");
  const worksOn = new Map((tableOfItems?.rows ?? []).map((r) => [r[0].toLowerCase(), r[1] ?? ""]));
  const sections = markdown.split(/^## /m).slice(1).filter((s) => !/^(Tool Descriptions)\b/.test(s));
  const tools: any[] = [];
  for (const section of sections) {
    const lines = section.split("\n");
    const name = lines[0].trim();
    if (!name) continue;
    const body = lines.slice(1);
    const intro: string[] = [];
    const skills: { skill: string[]; text: string }[] = [];
    let feature: { name: string; text: string } | undefined;
    const activities: { activity: string; dc: number | null }[] = [];
    let mode: "intro" | "skill" | "feature" | "activities" = "intro";
    let current: { skill: string[]; text: string[] } | undefined;
    let featureLines: string[] = [];
    let featureName = "";
    const closeSkill = () => {
      if (current) {
        const text = current.text.join(" ").trim();
        if (text && !template.test(text) && !current.skill.some((x) => /^Skill \d$/.test(x))) skills.push({ skill: current.skill, text });
      }
      current = undefined;
    };
    for (const raw of body) {
      const line = raw.replace(/^>\s?/, "").trim();
      const heading = line.match(/^(#{3,6})\s+(.*)$/);
      if (heading) {
        const title = heading[2].replace(/\*/g, "").trim();
        const level = heading[1].length;
        if (/^Sample Activities/i.test(title)) { closeSkill(); mode = "activities"; continue; }
        if (level === 4 && !/^Feature$/i.test(title) && !/^Hidden Compartment$/i.test(title) && mode !== "feature") {
          closeSkill();
          mode = "skill";
          current = { skill: title.split(/\s*(?:,|\/|\band\b)\s*/).map((x) => x.trim()).filter(Boolean), text: [] };
          continue;
        }
        closeSkill();
        mode = "feature";
        if (!/^Feature$/i.test(title)) featureName = title;
        continue;
      }
      if (!line) continue;
      if (mode === "activities") {
        const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
        if (row && !/^[:\-\s]+$/.test(row[1]) && !/^Activity$/i.test(row[1]) && !template.test(row[1])) activities.push({ activity: row[1].replace(/\*/g, ""), dc: number(row[2]) ?? null });
      } else if (mode === "skill" && current) current.text.push(line);
      else if (mode === "feature") featureLines.push(line);
      else if (mode === "intro" && !template.test(line)) intro.push(line);
    }
    closeSkill();
    const featureText = featureLines.filter((l) => !template.test(l) && !(/^Over the course of a short or long rest, you can make a DC 15/.test(l) && l.length < 120 && !/[.]$/.test(l))).join(" ").trim();
    if (featureText) feature = { name: featureName || "Special use", text: featureText };
    const key = name.toLowerCase().replace(/’/g, "'");
    const known = equipment.find((e) => e.name.toLowerCase() === key || e.name.toLowerCase() === key.replace(/ kit$/, " kit"));
    tools.push({
      name: known?.name ?? name,
      kind: /gaming set/i.test(name) ? "gaming" : /musical instrument/i.test(name) ? "instrument" : /kit$/i.test(name) ? "kit" : "implements",
      ...(intro.length ? { summary: intro.join(" ") } : {}),
      ...(skills.length ? { skills } : {}),
      ...(feature ? { feature } : {}),
      ...(activities.length ? { activities } : {}),
      ...(worksOn.get(key) && worksOn.get(key) !== "—" ? { worksOn: worksOn.get(key) } : {}),
    });
  }
  return tools;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const versions: any[] = await fetchJson("dataVersion");
  const master = versions.find((v) => v.name === "MASTERVERSION");
  const manifest: Record<string, any> = {
    source: API,
    dataVersion: master?.version,
    dataLastUpdated: master?.lastUpdated?.slice(0, 10),
    importedAt: new Date().toISOString().slice(0, 10),
    datasets: {},
  };
  const loaded: Record<string, any[]> = {};
  for (const [name, endpoint] of Object.entries(DATASETS)) {
    const raw = await fetchJson(endpoint);
    if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${endpoint}: expected a non-empty list`);
    loaded[name] = withIds(sortRows(raw.map(clean)));
  }
  const features = (await fetchJson("feature")).map(clean);
  const attached = attachFeatures(loaded, features);
  if (attached < features.length - 1700) throw new Error(`only ${attached} of ${features.length} features found an owner`);
  manifest.features = { fromEndpoint: "feature", total: features.length, storedWithOwner: attached, alreadySpeciesTraits: features.length - attached };

  for (const [name, endpoint] of Object.entries(DATASETS)) {
    const rows = loaded[name];
    const bytes = write(name, rows);
    const bySource: Record<string, number> = {};
    for (const r of rows) if (r.contentSource) bySource[r.contentSource] = (bySource[r.contentSource] ?? 0) + 1;
    manifest.datasets[name] = { endpoint, count: rows.length, bytes, ...(Object.keys(bySource).length ? { bySource } : {}) };
    console.log(`${name.padEnd(24)} ${String(rows.length).padStart(5)} rows ${String(Math.round(bytes / 1024)).padStart(6)} kB`);
  }
  const travel = deriveTravel(loaded.rulesStarships);
  manifest.datasets.travel = { derivedFrom: "rulesStarships", regions: travel.regions.length, bytes: write("travel", travel) };
  const lookups = deriveLookups(loaded.rulesPlayersHandbook, loaded);
  manifest.datasets.lookups = { derivedFrom: "rulesPlayersHandbook", languages: lookups.languages.length, bytes: write("lookups", lookups) };
  const transport = deriveTransport(loaded.rulesExpandedContent, loaded.rulesPlayersHandbook);
  manifest.datasets.transport = { derivedFrom: "rulesExpandedContent", mounts: transport.mounts.length, vehicles: transport.vehicles.length, bytes: write("transport", transport) };
  const tools = deriveTools(loaded.rulesWretchedHives, loaded.equipment);
  manifest.datasets.tools = { derivedFrom: "rulesWretchedHives", count: tools.length, bytes: write("tools", tools) };
  const downtime = deriveDowntime(loaded.rulesWretchedHives);
  manifest.datasets.downtime = { derivedFrom: "rulesWretchedHives", activities: downtime.activities.length, bytes: write("downtime", downtime) };
  const ships = deriveShips(loaded.starshipSizes, loaded.rulesStarships);
  manifest.datasets.ships = { derivedFrom: "starshipBaseSize", sizes: Object.keys(ships).filter((k) => !/^(ammunition|armor|shields|refit|modifications|upgrade|equipment)$/.test(k)).length, bytes: write("ships", ships) };
  write("manifest", manifest);
  const total = Object.values(manifest.datasets).reduce((sum: number, d: any) => sum + d.bytes, 0);
  console.log(`\n${Object.keys(manifest.datasets).length} datasets, ${(total / 1048576).toFixed(1)} MB, data version ${manifest.dataVersion} -> ${OUT}`);
}

// DERIVE_ONLY=1: rebuild only the datasets derived from book text, from the files already imported
// (no network): the lookups, transport, tools and downtime sets and their manifest entries
async function deriveOnly() {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(OUT, `${name}.json`), "utf8"));
  const manifest = read("manifest");
  const transport = deriveTransport(read("rulesExpandedContent"), read("rulesPlayersHandbook"));
  manifest.datasets.transport = { derivedFrom: "rulesExpandedContent", mounts: transport.mounts.length, vehicles: transport.vehicles.length, bytes: write("transport", transport) };
  const tools = deriveTools(read("rulesWretchedHives"), read("equipment"));
  manifest.datasets.tools = { derivedFrom: "rulesWretchedHives", count: tools.length, bytes: write("tools", tools) };
  const downtime = deriveDowntime(read("rulesWretchedHives"));
  manifest.datasets.downtime = { derivedFrom: "rulesWretchedHives", activities: downtime.activities.length, bytes: write("downtime", downtime) };
  const ships = deriveShips(read("starshipSizes"), read("rulesStarships"));
  manifest.datasets.ships = { derivedFrom: "starshipBaseSize", sizes: Object.keys(ships).filter((k) => !/^(ammunition|armor|shields|refit|modifications|upgrade|equipment)$/.test(k)).length, bytes: write("ships", ships) };
  const lookups = deriveLookups(read("rulesPlayersHandbook"), { referenceTables: read("referenceTables") });
  manifest.datasets.lookups = { derivedFrom: "rulesPlayersHandbook", languages: lookups.languages.length, bytes: write("lookups", lookups) };
  write("manifest", manifest);
  console.log(`transport: ${transport.mounts.length} mounts, ${transport.vehicles.length} vehicles; tools: ${tools.length}`);
}

(process.env.DERIVE_ONLY ? deriveOnly() : main()).catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
