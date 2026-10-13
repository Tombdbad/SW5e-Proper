// The manual game master loop: a report of where the game stands is copied to an outside LLM (or
// a human GM), and the reply is pasted back and applied to the saved character and campaign.
// Nothing here talks to an LLM; the functions take the game state from Play and return changes.
import { processCharacterNarrative } from "@/lib/sw5e/characterLanguageProcessor";
import { submitPlayerAction, processLLMResponse } from "@/lib/llm/debriefCompiler";
import { getClassById } from "@/lib/sw5e/classes";
import { getSpeciesById } from "@/lib/sw5e/species";
import { getBackgroundById } from "@/lib/sw5e/backgrounds";
import { carriedWeapons } from "@/lib/sw5e/characterCalculation";
import { trailOf, updateArea, type Area, type Exit, type Occupant, type Quest, type World } from "@shared/logic";

export const SYSTEM_MARKER = "---SYSTEM_DATA_FOLLOWS---";

// What Play knows when the report is made
export interface GameState {
  character: any;
  campaign: any;
  world: World | null;
  here: Area | null;
  exits: Exit[];
}

// One turn of the story, kept in the campaign's sessionLogs
export interface StoryEntry {
  date: string;
  location?: string;
  action: string;
  narrative: string;
  applied: string[];
}

// The structured part of a reply. Every field is optional; numbers are changes, not totals.
export interface GameMasterData {
  character?: {
    hp?: number;
    credits?: number;
    experience?: number;
    addItems?: string[];
    removeItems?: string[];
    addConditions?: string[];
    removeConditions?: string[];
  };
  here?: {
    description?: string;
    addOccupants?: { name: string; role?: string; species?: string; disposition?: string; statBlock?: string; count?: number }[];
  };
  quests?: { title: string; description?: string; objectives?: string[]; reward?: { credits?: number; experience?: number; items?: string[] } }[];
  completeObjectives?: { quest: string; objective: string }[];
}

const list = (lines: (string | false | undefined | null)[]) => lines.filter(Boolean).join("\n") || "- none";
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The report for the game master: the character, where they are, what is around them, the open
 * quests, the story so far, what the player does next, and how to answer.
 */
export function generateGameMasterReport({ character, campaign, world, here, exits }: GameState, action: string): string {
  const klass = getClassById(character.class);
  const scores = character.abilityScores ?? {};
  const story: StoryEntry[] = Array.isArray(campaign.sessionLogs) ? campaign.sessionLogs : [];
  const quests: Quest[] = Array.isArray(campaign.quests) ? campaign.quests : [];
  const powers = [...(character.forcePowers ?? []), ...(character.techPowers ?? [])].filter((p: any) => p?.name);
  // Themes, motivations and hooks read from the backstory and personality, when there are any
  const narrative = processCharacterNarrative(character);
  const personal = [
    ...(character.personalityTraits ?? []).map((t: string) => `- Trait: ${t}`),
    ...(character.ideals ?? []).map((t: string) => `- Ideal: ${t}`),
    ...(character.bonds ?? []).map((t: string) => `- Bond: ${t}`),
    ...(character.flaws ?? []).map((t: string) => `- Flaw: ${t}`),
    character.appearance && `- Appearance: ${[character.appearance.gender, character.appearance.age && `${character.appearance.age} years old`, character.appearance.height, character.appearance.weight, character.appearance.description].filter(Boolean).join(", ")}`,
    character.backstory && `- Backstory: ${character.backstory}`,
    narrative.mainThemes.length > 0 && `- Themes: ${narrative.mainThemes.join(", ")}`,
    narrative.motivations.length > 0 && `- Motivations: ${narrative.motivations.join(", ")}`,
    ...narrative.plotHooks.slice(0, 3).map((hook) => `- Possible hook: ${hook}`),
  ];

  const place = world && here
    ? [
        `## WHERE THEY ARE: ${here.name} (${here.kind}${here.type !== here.kind ? `, ${here.type}` : ""})`,
        `Path: ${trailOf(world, here.id).map((a) => a.name).join(" > ")}`,
        here.description,
        `Enemy faction of this campaign: ${world.antagonist}`,
        "### Who is here",
        list(here.occupants.map((o) => `- ${o.count > 1 ? `${o.count} x ` : ""}${o.name} (${[o.species, o.role, o.disposition, o.cr && `CR ${o.cr}`].filter(Boolean).join(", ")})`)),
        "### Ships here",
        list(here.ships.map((s) => `- ${s.name} (${s.size} ${s.role.toLowerCase()}, ${s.status}, ${s.owner})`)),
        "### Containers in sight",
        list(here.loot.filter((c) => !c.hidden).map((c) => `- ${c.name}${c.looted ? " (empty)" : c.locked ? ` (locked, DC ${c.locked})` : ""}`)),
        "### Ways on",
        list(exits.filter((e) => !e.hidden).map((e) => `- ${e.label} ${world.areas[e.to]?.name ?? e.to}${e.locked ? ` (locked, DC ${e.locked})` : ""}${e.travel ? ` (${e.travel})` : ""}`)),
      ]
    : [`## WHERE THEY ARE: ${campaign.currentLocation || campaign.startingLocation || "Unknown"}`];

  return [
    "# STAR WARS 5E GAME MASTER REPORT",
    `Campaign: ${campaign.name}`,
    campaign.description,
    "",
    `## CHARACTER: ${character.name}`,
    `Level ${character.level} ${getSpeciesById(character.species)?.name ?? character.species} ${klass?.name ?? character.class}, ${getBackgroundById(character.background)?.name ?? character.background}, ${character.alignment}`,
    `HP ${character.currentHp}/${character.maxHp} | AC ${character.armorClass} | ${klass?.casterType === "Tech" ? "Tech" : "Force"} points ${character.currentForcePoints}/${character.maxForcePoints} | ${character.credits ?? 0} credits | ${character.experience ?? 0} XP`,
    `STR ${scores.strength} DEX ${scores.dexterity} CON ${scores.constitution} INT ${scores.intelligence} WIS ${scores.wisdom} CHA ${scores.charisma}`,
    `Skills: ${(character.skillProficiencies ?? []).join(", ") || "none"}`,
    `Conditions: ${(character.conditions ?? []).join(", ") || "none"}`,
    `Weapons: ${carriedWeapons(character).map((w) => `${w.name} (${signed(w.attackBonus)} to hit, ${w.dice} ${signed(w.damageBonus)} ${w.damageType})`).join("; ") || "unarmed"}`,
    `Carrying: ${(character.equipment ?? []).join(", ") || "nothing"}`,
    `Powers: ${powers.map((p: any) => p.name).join(", ") || "none"}`,
    "### Who they are",
    list(personal),
    "",
    ...place,
    "",
    "## QUESTS",
    list(quests.filter((q) => q.status === "active").map((q) => `- ${q.title}: ${q.objectives.map((o) => `${o.completed ? "[done]" : "[open]"} ${o.description}`).join("; ")}`)),
    "",
    "## THE STORY SO FAR",
    list(story.slice(-3).map((entry) => `- ${entry.location ? `(${entry.location}) ` : ""}The player: ${entry.action || "waits"}. Then: ${entry.narrative.slice(0, 600)}`)),
    "",
    "## WHAT THE PLAYER DOES NOW",
    action.trim() || "Looks around and waits to see what happens.",
    "",
    "## HOW TO ANSWER",
    "You are the game master of this Star Wars 5e game. Answer in two parts.",
    "1. The story: a few paragraphs telling what happens, in the second person. Use the people, places and enemies listed above. Call for no dice: the app rolls fights, locks and searches itself.",
    `2. A line reading exactly ${SYSTEM_MARKER} and after it one JSON object with only the changes that follow from your story. Leave out what does not change. All fields are optional:`,
    JSON.stringify(
      {
        character: { hp: -3, credits: 50, experience: 100, addItems: ["Medpac"], removeItems: [], addConditions: ["Poisoned"], removeConditions: [] },
        here: { description: "new description of this place, if it changed", addOccupants: [{ name: "Vess Tarn", role: "informant", species: "Rodian", disposition: "friendly" }, { name: "Trooper", disposition: "hostile", count: 2 }] },
        quests: [{ title: "A new quest", description: "what is asked", objectives: ["first step"], reward: { credits: 200, experience: 100 } }],
        completeObjectives: [{ quest: "title of an open quest", objective: "the objective's text" }],
      },
      null,
      1,
    ),
    "Numbers under character are changes, not totals. Items are names from the SW5e equipment lists. Conditions are SW5e conditions. A hostile occupant should be named as an SW5e creature or NPC stat block (Trooper, Gamorrean Guard, Womp Rat ...) so that it can be fought; anyone else is a person to talk to. Only complete objectives marked [open] that say nothing the app checks itself (reaching, defeating, looting).",
  ]
    .filter((line) => line !== undefined && line !== false && line !== null)
    .join("\n");
}

/**
 * Extract JSON from text that might contain non-JSON content
 */
function extractJSONFromText(text: string): any {
  const fenced = text.replace(/```(?:json)?/gi, "");
  try {
    return JSON.parse(fenced);
  } catch (e) {
    const match = fenced.match(/(\{[\s\S]*\})/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (err) {
      return null;
    }
  }
}

/**
 * Splits a reply into its story and its structured data. A reply without the marker is all story.
 */
export function parseGameMasterResponse(response: string): { narrative: string; data: GameMasterData | null; problem?: string } {
  const [before, ...after] = response.split(SYSTEM_MARKER);
  const narrative = before.trim();
  if (!after.length) return { narrative, data: null };
  const data = extractJSONFromText(after.join(SYSTEM_MARKER).trim());
  if (!data || typeof data !== "object") return { narrative, data: null, problem: "The system data after the marker is not valid JSON, so only the story is kept." };
  return { narrative, data };
}

const names = (value: any): string[] => (Array.isArray(value) ? value.map((v) => String(v?.name ?? v).trim()).filter(Boolean) : []);
const amount = (value: any): number => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0);

// A creature named by the game master, as someone who can be fought: its stat block from the rules data
async function statBlockOccupant(name: string): Promise<Occupant | null> {
  try {
    const found = await (await fetch(`/api/sw5e/monsters?limit=20&fields=id,name&search=${encodeURIComponent(name)}`)).json();
    const wanted = name.toLowerCase();
    const match = (found as any[]).find((m) => m.name.toLowerCase() === wanted) ?? (found as any[])[0];
    if (!match) return null;
    const response = await fetch("/api/world/occupant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statBlock: match.id }) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Turns a parsed reply into the fields to save on the character and the campaign, with a line
 * for each thing that changed. Nothing is saved here.
 */
export async function applyGameMasterResponse(
  { character, campaign, world, here }: GameState,
  parsed: { narrative: string; data: GameMasterData | null },
  action: string,
): Promise<{ characterChanges: Record<string, any>; campaignChanges: Record<string, any>; applied: string[] }> {
  const data = parsed.data ?? {};
  const applied: string[] = [];
  const characterChanges: Record<string, any> = {};
  const campaignChanges: Record<string, any> = {};

  const c = data.character ?? {};
  const hp = amount(c.hp);
  if (hp) {
    // House rule: the story alone cannot kill. Outside a fight hit points stop at 1.
    const next = Math.min(character.maxHp, Math.max(1, character.currentHp + hp));
    if (next !== character.currentHp) {
      characterChanges.currentHp = next;
      applied.push(`Hit points ${character.currentHp} to ${next}${character.currentHp + hp < 1 ? " (house rule: the story cannot take the last hit point)" : ""}`);
    }
  }
  const credits = amount(c.credits);
  if (credits) {
    characterChanges.credits = Math.max(0, (character.credits ?? 0) + credits);
    applied.push(`Credits ${signed(credits)}`);
  }
  const experience = Math.max(0, amount(c.experience));
  if (experience) {
    characterChanges.experience = (character.experience ?? 0) + experience;
    applied.push(`${experience} XP`);
  }
  const added = names(c.addItems);
  const removed = names(c.removeItems);
  if (added.length || removed.length) {
    const carried: string[] = [...(character.equipment ?? [])];
    const lost: string[] = [];
    for (const name of removed) {
      const index = carried.findIndex((item) => String(item).toLowerCase() === name.toLowerCase());
      if (index >= 0) lost.push(...carried.splice(index, 1));
    }
    characterChanges.equipment = [...carried, ...added];
    if (added.length) applied.push(`Gained: ${added.join(", ")}`);
    if (lost.length) applied.push(`Lost: ${lost.join(", ")}`);
  }
  const gainedConditions = names(c.addConditions).filter((name) => name.toLowerCase() !== "dead");
  const lostConditions = names(c.removeConditions).map((name) => name.toLowerCase());
  if (gainedConditions.length || lostConditions.length) {
    const current: string[] = character.conditions ?? [];
    const next = Array.from(new Set([...current.filter((name) => !lostConditions.includes(name.toLowerCase())), ...gainedConditions]));
    if (next.join("|") !== current.join("|")) {
      characterChanges.conditions = next;
      applied.push(`Conditions: ${next.join(", ") || "none"}`);
    }
  }

  // The place the party is in: its description and who has arrived
  if (world && here && data.here) {
    const changes: Partial<Area> = {};
    if (typeof data.here.description === "string" && data.here.description.trim()) {
      changes.description = data.here.description.trim();
      applied.push(`${here.name} is described anew`);
    }
    const arrivals = Array.isArray(data.here.addOccupants) ? data.here.addOccupants.filter((o) => o?.name) : [];
    if (arrivals.length) {
      const occupants = [...here.occupants];
      for (const [index, arrival] of arrivals.entries()) {
        const disposition = arrival.disposition === "hostile" || arrival.disposition === "friendly" ? arrival.disposition : "neutral";
        const count = Math.min(8, Math.max(1, amount(arrival.count) || 1));
        const id = `gm-${Date.now().toString(36)}-${index}`;
        // Someone to fight needs a stat block; the name the game master gave is looked up
        const fromRules = disposition === "hostile" || arrival.statBlock ? await statBlockOccupant(String(arrival.statBlock ?? arrival.name)) : null;
        if (fromRules) {
          occupants.push({ ...fromRules, id, disposition, count, role: arrival.role ?? fromRules.role });
          applied.push(`${count > 1 ? `${count} x ` : ""}${fromRules.name} (${disposition}) at ${here.name}`);
        } else {
          occupants.push({ id, name: String(arrival.name), role: arrival.role ?? "stranger", species: arrival.species, disposition: disposition === "hostile" ? "neutral" : disposition, count: 1, loadout: [] });
          applied.push(`${arrival.name} (${arrival.role ?? "stranger"}) at ${here.name}${disposition === "hostile" ? ": no stat block by that name, so not an enemy to fight" : ""}`);
        }
      }
      changes.occupants = occupants;
    }
    if (Object.keys(changes).length) campaignChanges.galaxyMap = updateArea(world, here.id, changes).world;
  }

  // Quests: new ones, and objectives the story completed (only those the world does not check itself)
  let quests: Quest[] = Array.isArray(campaign.quests) ? campaign.quests : [];
  let questsChanged = false;
  for (const [index, quest] of (Array.isArray(data.quests) ? data.quests : []).entries()) {
    if (!quest?.title || quests.some((q) => q.title.toLowerCase() === String(quest.title).toLowerCase())) continue;
    const objectives = names(quest.objectives).map((description) => ({ description, completed: false }));
    quests = [...quests, {
      id: `gm-${Date.now().toString(36)}-${index}`,
      title: String(quest.title),
      description: String(quest.description ?? ""),
      status: "active",
      objectives: objectives.length ? objectives : [{ description: String(quest.title), completed: false }],
      reward: { credits: Math.max(0, amount(quest.reward?.credits)), experience: Math.max(0, amount(quest.reward?.experience)), items: names(quest.reward?.items) },
    }];
    questsChanged = true;
    applied.push(`New quest: ${quest.title}`);
  }
  const finished: Quest[] = [];
  for (const done of Array.isArray(data.completeObjectives) ? data.completeObjectives : []) {
    const quest = quests.find((q) => q.status === "active" && q.title.toLowerCase() === String(done?.quest ?? "").toLowerCase());
    const wanted = String(done?.objective ?? "").toLowerCase();
    const index = quest ? quest.objectives.findIndex((o) => !o.completed && !o.target && (o.description.toLowerCase() === wanted || quest.objectives.length === 1)) : -1;
    if (!quest || index < 0) continue;
    const objectives = quest.objectives.map((o, i) => (i === index ? { ...o, completed: true } : o));
    const complete = objectives.every((o) => o.completed);
    const next: Quest = { ...quest, objectives, status: complete ? "completed" : quest.status };
    quests = quests.map((q) => (q.id === quest.id ? next : q));
    questsChanged = true;
    applied.push(complete ? `Quest complete: ${quest.title}` : `Objective done: ${quest.objectives[index].description}`);
    if (complete) finished.push(next);
  }
  if (questsChanged) campaignChanges.quests = quests;
  // A quest the story finished pays its reward, as one finished in Play does
  for (const quest of finished) {
    const reward = quest.reward;
    if (!reward) continue;
    if (reward.credits) characterChanges.credits = (characterChanges.credits ?? character.credits ?? 0) + reward.credits;
    if (reward.experience) characterChanges.experience = (characterChanges.experience ?? character.experience ?? 0) + reward.experience;
    if (reward.items?.length) characterChanges.equipment = [...(characterChanges.equipment ?? character.equipment ?? []), ...reward.items];
    const paid = [reward.credits && `${reward.credits} credits`, reward.experience && `${reward.experience} XP`, ...(reward.items ?? [])].filter(Boolean);
    if (paid.length) applied.push(`Reward: ${paid.join(", ")}`);
  }

  // The story itself is kept with the campaign
  const story: StoryEntry[] = Array.isArray(campaign.sessionLogs) ? campaign.sessionLogs : [];
  const entry: StoryEntry = { date: new Date().toISOString(), location: here?.name, action: action.trim(), narrative: parsed.narrative, applied };
  campaignChanges.sessionLogs = [...story, entry].slice(-50);

  return { characterChanges, campaignChanges, applied };
}

/**
 * Keeps a record of the exchange on the server (the debriefs table). The game does not depend on it.
 */
export async function recordGameMasterReport(state: GameState, action: string): Promise<string | null> {
  try {
    const debrief = await submitPlayerAction(state.character, state.campaign, action);
    return debrief.id;
  } catch {
    return null;
  }
}

export async function recordGameMasterResponse(debriefId: string | null, parsed: { narrative: string; data: GameMasterData | null }): Promise<void> {
  if (!debriefId) return;
  try {
    await processLLMResponse(debriefId, { narrative: parsed.narrative, data: parsed.data ?? {} } as any);
  } catch {
    // The record is a convenience; the reply has been applied either way
  }
}

export default {
  generateGameMasterReport,
  parseGameMasterResponse,
  applyGameMasterResponse,
};
