// Weapons as things (2026-10-19, the interiors overhaul). One catalogue serves the rack in an armsmith's
// shop and the hand of a guard: a weapon is known by its kind, drawn in detail where it hangs (a
// model from the Kenney Blaster Kit, under client/public/assets/kenney-blaster, for blasters; built in
// code for the rest) and in a few dozen triangles where someone holds it. Pure: nothing here draws
// (tests/interiors/weapons.test.ts); `StockDraw.tsx` does.
import type { Kit } from "../models";
import { KITBASH } from "./kitbash";

export type Kind =
  | "pistol" | "carbine" | "rifle" | "heavy" | "launcher" | "bow"
  | "dagger" | "sword" | "axe" | "mace" | "spear" | "staff" | "whip" | "shield"
  | "saber" | "dualsaber" | "thrown" | "other";

// The first rule that matches the name decides; the weapon's class (as the data gives it) is the fallback
const RULES: [RegExp, Kind][] = [
  [/saberstaff|doublesaber|double-?blade|lightstaff|saber ?staff|doubleshoto|splitsaber|splitshoto|pikesaber|lightsaber pike|sunsaber/i, "dualsaber"],
  [/saber|lightfoil|lightkatana|lightnodachi|lightblade|lightcutlass|lightdagger|lightaxe|lightfist|lightclub|lightbaton|light(?:glaive|ring)|phase knife|wristsaber|sabermace|saberspear|sicklesaber|shoto|brightsaber|bustersaber|warsaber|claymoresaber/i, "saber"],
  [/launcher|mortar|cannon|chaingun|heavy repeater|disruptor sniper|anti-materiel|assault/i, "heavy"],
  [/grenade|mine|bolas|dart|chakram|net\b|atlatl/i, "thrown"],
  [/bow|slingshot|crossbow|bolt-thrower/i, "bow"],
  [/pistol|hold-out|wristblaster|needler|hand blaster|hand cannon|hand bkg|wrist launcher|scattergun/i, "pistol"],
  [/carbine|shotgun|switch/i, "carbine"],
  [/rifle|blaster|bkg|sniper|iws|radrifle|bo-rifle/i, "rifle"],
  [/shield/i, "shield"],
  [/whip|chained|flail/i, "whip"],
  [/dagger|knife|vibroknife|shiv|hidden blade|disguised blade|techblade|claw|knuckler|rapier|cutter/i, "dagger"],
  [/axe|hatchet|voulge|buster|battleaxe/i, "axe"],
  [/mace|hammer|club|baton|prod|gauntlet|shocker|stun/i, "mace"],
  [/spear|lance|pike|glaive|mancatcher|naginata/i, "spear"],
  [/staff|echostaff|techstaff/i, "staff"],
  [/sword|blade|sabre|cutlass|katana|claymore|nodachi|diresword|vibro/i, "sword"],
];
const BY_CLASS: Record<string, Kind> = { SimpleBlaster: "pistol", MartialBlaster: "rifle", ExoticBlaster: "rifle", SimpleVibroweapon: "sword", MartialVibroweapon: "sword", ExoticVibroweapon: "sword", SimpleLightweapon: "saber", MartialLightweapon: "saber", ExoticLightweapon: "saber" };

export function kindOfWeapon(name: string, classification = ""): Kind {
  for (const [pattern, kind] of RULES) if (pattern.test(name)) return kind;
  return BY_CLASS[classification] ?? "other";
}

// How long each kind is when it hangs, in squares (a square is a little under two metres)
export const LENGTH: Record<Kind, number> = {
  pistol: 0.26, carbine: 0.42, rifle: 0.58, heavy: 0.8, launcher: 0.8, bow: 0.7,
  dagger: 0.2, sword: 0.5, axe: 0.55, mace: 0.45, spear: 0.95, staff: 0.95, whip: 0.4, shield: 0.45,
  saber: 0.28, dualsaber: 0.7, thrown: 0.1, other: 0.3,
};

// The blasters of the Blaster Kit, by length (units of the kit; see tools/convert-assets.mjs), one file for each
// design. A hung weapon takes the design its name picks, scaled to LENGTH of its kind.
export const BLASTER_FILES: Record<"pistol" | "carbine" | "rifle" | "heavy", { file: string; length: number }[]> = {
  pistol: [{ file: "blaster-b", length: 0.42 }, { file: "blaster-c", length: 0.48 }, { file: "blaster-k", length: 0.46 }, { file: "blaster-o", length: 0.48 }, { file: "blaster-i", length: 0.52 }],
  carbine: [{ file: "blaster-h", length: 0.65 }, { file: "blaster-j", length: 0.61 }, { file: "blaster-l", length: 0.55 }, { file: "blaster-m", length: 0.62 }, { file: "blaster-n", length: 0.64 }, { file: "blaster-q", length: 0.71 }, { file: "blaster-r", length: 0.68 }],
  rifle: [{ file: "blaster-a", length: 0.8 }, { file: "blaster-g", length: 0.79 }, { file: "blaster-p", length: 0.86 }, { file: "blaster-d", length: 0.91 }],
  heavy: [{ file: "blaster-f", length: 1.31 }, { file: "blaster-e", length: 1.39 }],
};
export const KENNEY_BLASTER = "/assets/kenney-blaster";

// The blades, hafted weapons and launcher the Blaster Kit lacks, built from pieces of the other kits (kitbash.ts), one design for each kind
// and, for the heavy weapons, a launcher beside the blasters. Lengths are the files' own (tests/interiors/assets.test.ts holds them to it).
export const MELEE_FILES: Partial<Record<Kind, { file: string; length: number }>> = {
  dagger: { file: "vibro-dagger", length: 0.21 },
  sword: { file: "vibro-blade", length: 0.54 },
  axe: { file: "vibro-axe", length: 0.54 },
  mace: { file: "vibro-mace", length: 0.56 },
  spear: { file: "vibro-pike", length: 1.02 },
  staff: { file: "electrostaff", length: 0.99 },
};
export const LAUNCHER_FILE = { file: "launcher", length: 0.74 };

// A small hash of the name (the same weapon is the same design each time)
const hashOf = (text: string) => Array.from(text).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

export interface Hung {
  kind: Kind;
  // The model file (without ".glb"; the low detail is "<file>.lod"), the folder it is in, and the scale that sets it to its kind's length;
  // none where it is built in code
  file?: string;
  dir?: string;
  scale: number;
}
export function hungWeapon(name: string, classification = ""): Hung {
  const kind = kindOfWeapon(name, classification);
  if (kind === "heavy" && /launcher|mortar/i.test(name)) return { kind, file: LAUNCHER_FILE.file, dir: KITBASH, scale: LENGTH.heavy / LAUNCHER_FILE.length };
  const melee = MELEE_FILES[kind];
  if (melee) return { kind, file: melee.file, dir: KITBASH, scale: LENGTH[kind] / melee.length };
  const designs = kind === "pistol" || kind === "carbine" || kind === "rifle" || kind === "heavy" ? BLASTER_FILES[kind] : kind === "launcher" ? BLASTER_FILES.heavy : undefined;
  if (!designs) return { kind, scale: 1 };
  const d = designs[hashOf(name) % designs.length];
  return { kind, file: d.file, dir: KENNEY_BLASTER, scale: LENGTH[kind] / d.length };
}

// Built in code, lying along z and centred, `length` long: `detail` "hero" for where it hangs and "low" where it is held.
// Blasters have a model of their own where they hang, and these as the held ones (a few dozen triangles).
const STEEL = "#7b8794";
const DARK = "#2b2f36";
const GRIP = "#3a3530";
export function buildWeapon(k: Kit, kind: Kind, length: number, detail: "hero" | "low", blade = "#7fe3ff") {
  const L = length;
  const hero = detail === "hero";
  const seg = hero ? 10 : 5;
  switch (kind) {
    case "pistol":
    case "carbine":
    case "rifle":
    case "heavy":
    case "launcher": {
      const barrel = kind === "pistol" ? 0.5 : 0.62;
      k.box([L * 0.07, L * 0.12, L * 0.62], DARK, { at: [0, 0.02 * L, L * 0.08], round: hero ? 0.01 : 0, finish: "sheen" });
      k.rod([0, 0.02 * L, L * 0.2], [0, 0.02 * L, L * barrel * 0.95], L * 0.025, STEEL, { seg, finish: "sheen" });
      k.box([L * 0.06, L * 0.22, L * 0.1], GRIP, { at: [0, -L * 0.14, -L * 0.06], rot: [0.25, 0, 0] });
      if (kind !== "pistol") k.box([L * 0.06, L * 0.1, L * 0.34], GRIP, { at: [0, -L * 0.02, -L * 0.34] });
      if (hero) k.box([L * 0.02, L * 0.02, L * 0.05], "#ff5a4a", { at: [0, L * 0.09, L * 0.1], finish: "glow" });
      break;
    }
    case "bow":
      k.tube([[0, L * 0.5, 0], [0, L * 0.18, L * 0.12], [0, -L * 0.18, L * 0.12], [0, -L * 0.5, 0]], L * 0.02, "#6b4f36", { along: hero ? 8 : 3, around: 4, caps: false });
      k.rod([0, L * 0.5, 0], [0, -L * 0.5, 0], 0.004, "#d8d2c0", { seg: 3 });
      break;
    case "dagger":
    case "sword":
    case "axe":
    case "mace":
    case "spear":
    case "staff":
    case "whip": {
      const blade = kind === "dagger" || kind === "sword";
      const hilt = L * (kind === "spear" || kind === "staff" ? 1 : kind === "whip" ? 0.4 : 0.28);
      k.rod([0, 0, -L / 2], [0, 0, -L / 2 + hilt], L * 0.025, GRIP, { seg });
      if (blade) k.box([L * 0.05, L * 0.015, L * 0.66], "#b9c3cc", { at: [0, 0, L * 0.17], finish: "sheen" });
      if (kind === "sword" || kind === "dagger") k.box([L * 0.2, L * 0.03, L * 0.03], STEEL, { at: [0, 0, -L / 2 + hilt], finish: "sheen" });
      if (kind === "axe") k.box([L * 0.3, L * 0.02, L * 0.2], "#b9c3cc", { at: [0, 0, L * 0.38], finish: "sheen" });
      if (kind === "mace") k.sphere(L * 0.12, STEEL, { at: [0, 0, L * 0.4], seg: [seg, seg - 2], finish: "sheen" });
      if (kind === "spear" || kind === "staff") {
        k.rod([0, 0, -L / 2], [0, 0, L / 2], L * 0.02, kind === "staff" ? DARK : "#7b6a4a", { seg });
        k.cone(L * 0.04, L * 0.12, kind === "staff" ? "#ffd166" : "#c9ccd2", { at: [0, 0, L / 2 + L * 0.04], rot: [Math.PI / 2, 0, 0], finish: kind === "staff" ? "glow" : "sheen", seg: 6 });
      }
      if (kind === "whip") k.tube([[0, 0, -L * 0.1], [0, -L * 0.06, L * 0.15], [0, L * 0.02, L * 0.4]], L * 0.012, "#3a2a20", { along: hero ? 6 : 2, around: 4 });
      break;
    }
    case "saber":
    case "dualsaber": {
      // A hilt in the middle of the length and a blade (two for a dual saber) out of each end of it
      const dual = kind === "dualsaber";
      const hilt = L * 0.3;
      const long = dual ? L * 0.35 : L * 0.7;
      k.cyl(L * 0.035, hilt, "#9aa3ac", { rot: [Math.PI / 2, 0, 0], at: [0, 0, dual ? 0 : -L * 0.35 + hilt / 2], seg, finish: "sheen" });
      k.cyl(L * 0.04, L * 0.04, DARK, { at: [0, 0, dual ? hilt / 2 - L * 0.03 : -L * 0.35 + hilt - L * 0.03], rot: [Math.PI / 2, 0, 0], seg });
      const end = dual ? hilt / 2 : -L * 0.35 + hilt;
      k.cyl(L * 0.018, long, blade, { at: [0, 0, end + long / 2], rot: [Math.PI / 2, 0, 0], seg: 5, finish: "glow" });
      if (dual) k.cyl(L * 0.018, long, blade, { at: [0, 0, -end - long / 2], rot: [Math.PI / 2, 0, 0], seg: 5, finish: "glow" });
      break;
    }
    case "shield":
      k.cyl(L * 0.42, L * 0.04, STEEL, { rot: [Math.PI / 2, 0, 0], seg: hero ? 18 : 8, finish: "sheen" });
      k.cyl(L * 0.1, L * 0.07, "#d8b45a", { rot: [Math.PI / 2, 0, 0], seg: 8, finish: "sheen" });
      break;
    case "thrown":
      k.sphere(L * 0.5, "#4a5a3a", { seg: [seg, seg - 1] });
      k.cyl(L * 0.12, L * 0.18, STEEL, { at: [0, L * 0.5, 0], seg: 5, finish: "sheen" });
      break;
    default:
      k.box([L * 0.12, L * 0.12, L * 0.8], STEEL, { finish: "sheen" });
  }
}
