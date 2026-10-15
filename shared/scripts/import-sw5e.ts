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
  return {
    wealthByLevel,
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
  write("manifest", manifest);
  const total = Object.values(manifest.datasets).reduce((sum: number, d: any) => sum + d.bytes, 0);
  console.log(`\n${Object.keys(manifest.datasets).length} datasets, ${(total / 1048576).toFixed(1)} MB, data version ${manifest.dataVersion} -> ${OUT}`);
}

// DERIVE_ONLY=1: rebuild only the datasets derived from book text, from the files already imported
// (no network): the transport and tools sets and their manifest entries
async function deriveOnly() {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(OUT, `${name}.json`), "utf8"));
  const manifest = read("manifest");
  const transport = deriveTransport(read("rulesExpandedContent"), read("rulesPlayersHandbook"));
  manifest.datasets.transport = { derivedFrom: "rulesExpandedContent", mounts: transport.mounts.length, vehicles: transport.vehicles.length, bytes: write("transport", transport) };
  const tools = deriveTools(read("rulesWretchedHives"), read("equipment"));
  manifest.datasets.tools = { derivedFrom: "rulesWretchedHives", count: tools.length, bytes: write("tools", tools) };
  write("manifest", manifest);
  console.log(`transport: ${transport.mounts.length} mounts, ${transport.vehicles.length} vehicles; tools: ${tools.length}`);
}

(process.env.DERIVE_ONLY ? deriveOnly() : main()).catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
