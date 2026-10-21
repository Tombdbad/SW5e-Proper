// Data and comms gear in play (2026-10-21). The books give datapads, wristpads, stylus pens, holorecorders, translators, scramblers and
// holotrace devices a line of text and no mechanics; everything here is a labelled house rule, kept as small pure functions (a leaf
// module, like gear.ts) so that it is tested alone (tests/items/comms.test.ts).

// ---- Notes: a datapad or a wristpad stores them, a stylus pen alone writes a few on whatever there is to write on ------------------
export const PAD_NOTES = 50;
export const STYLUS_NOTES = 5;
export interface Note { text: string; day: number; where?: string }
// How many notes the gear carried allows (none without any of them)
export function notesAllowed(names: string[]): number {
  if (names.some((n) => /^(datapad|wristpad|repelling wristpad)/i.test(n))) return PAD_NOTES;
  return names.some((n) => /^stylus pen/i.test(n)) ? STYLUS_NOTES : 0;
}
export function addNote(notes: Note[], text: string, day: number, where: string | undefined, allowed: number): { notes: Note[]; error?: string } {
  const clean = text.trim().slice(0, 400);
  if (!clean) return { notes, error: "Nothing to write." };
  if (allowed <= 0) return { notes, error: "Notes need a datapad, a wristpad or a stylus pen." };
  if (notes.length >= allowed) return { notes, error: `Full: ${allowed} notes at most with what you carry. Delete one first.` };
  return { notes: [...notes, { text: clean, day, ...(where ? { where } : {}) }] };
}

// ---- Recordings: a holorecorder takes a room's scene; a recording of a place is a piece of lore of it ---------------------------------
export const RECORD_LIMIT = 5;
export const RECORD_MINUTES = 10;
export interface Recording { id: string; areaId: string; where: string; day: number; people: string[] }
export function addRecording(list: Recording[], rec: Recording): Recording[] {
  return [...list.filter((r) => r.areaId !== rec.areaId), rec].slice(-RECORD_LIMIT);
}

// ---- Languages: a translator or a vocoder mask stands in for languages the character does not know -------------------------------
// House rule: everyone speaks Galactic Basic and their own people's language, but for the peoples that speak only their own (the data's
// `language` of the species): their words are not understood without a common language, a translator set to it, or a vocoder
export const OWN_TONGUE_ONLY = ["Shyriiwook", "Jawaese", "Ewokese", "Tusken", "Binary", "Rakata"];
export const TRANSLATOR_SLOTS: Record<string, number> = { "personal translator": 5, "vocoder mask": 15 };
export const translatorSlots = (name: string): number => TRANSLATOR_SLOTS[Object.keys(TRANSLATOR_SLOTS).find((k) => name.toLowerCase().startsWith(k)) ?? ""] ?? 0;
// A device's chosen languages, cut to what it holds
export const setLanguages = (name: string, chosen: string[]) => Array.from(new Set(chosen)).slice(0, translatorSlots(name));
// True when someone who speaks `native` only can't be understood by a character who knows `known` (and has `translated` on a device)
export function languageBarrier(native: string | undefined, known: string[], translated: string[]): boolean {
  if (!native || !OWN_TONGUE_ONLY.includes(native)) return false;
  const have = [...known, ...translated].map((l) => l.toLowerCase());
  return !have.includes(native.toLowerCase());
}

// ---- Tracing a call: a holotrace device follows a transmission back to where it was made -----------------------------------------
export interface Report { area: string; at: number; who: string }
// The calls to security still to be put through, from anywhere (not only the room the party is in), with where they come from
export function tracedCalls(reports: Report[] | undefined, nameOf: (areaId: string) => string, now: number): { who: string; area: string; where: string; minutes: number }[] {
  return (reports ?? []).filter((r) => r.at > now).map((r) => ({ who: r.who, area: r.area, where: nameOf(r.area), minutes: r.at - now })).sort((a, b) => a.minutes - b.minutes);
}

// ---- A call over a commlink while the law is searching is overheard unless it is scrambled ---------------------------------------
export const callOverheard = (searching: boolean, names: string[]) => searching && !names.some((n) => /^pocket scrambler/i.test(n));
