// Which model stands for a piece of equipment (2026-10-19). One mapping serves the shelves (stock.ts), the people who carry things
// (figures hold, wear and carry them) and the list of what has no model yet (tools/model-coverage.ts). Pure: tests/interiors/gear.test.ts.
// An item's equipment category, name and class are the rules data's (shared/data/sw5e/equipment.json); nothing here is a rule.
import { hungWeapon, type Kind } from "./weapons";
import { KITBASH, type KitLook } from "./kitbash";
import { KENNEY_BLASTER } from "./weapons";

export interface Item {
  name: string;
  equipmentCategory: string;
  armorClassification?: string;
  weaponClassification?: string;
}

// How well an item is covered: `dedicated` has a model of its own, `shared` one model that stands for its kind or class (most weapons
// share one of a dozen designs), `code` is built by the map's own code, `none` has nothing yet
export type Bucket = "dedicated" | "shared" | "code" | "none";
export interface Coverage {
  bucket: Bucket;
  // The model, under /assets, without ".glb"
  model?: string;
  // What it is, in a few words
  what: string;
}

const kit = (name: string) => `${KITBASH.replace("/assets/", "")}/${name}`;
const blaster = (name: string) => `${KENNEY_BLASTER.replace("/assets/", "")}/${name}`;

// Medical items that have their own model, by name
const MEDICAL: [RegExp, string, Bucket][] = [
  [/^medpac$/i, "medpac", "dedicated"],
  [/^traumakit$/i, "trauma-case", "dedicated"],
  [/antitoxkit|repair kit/i, "medpac", "shared"],
  [/^arm prosthesis$/i, "prosthesis-arm", "dedicated"],
  [/^forearm prosthesis$/i, "prosthesis-arm", "shared"],
  [/^hand prosthesis$/i, "prosthesis-hand", "dedicated"],
  [/^leg prosthesis$/i, "prosthesis-leg", "dedicated"],
  [/^foot prosthesis$/i, "prosthesis-leg", "shared"],
  [/^eye prosthesis$/i, "prosthesis-eye", "dedicated"],
];

export function coverageOf(item: Item): Coverage {
  const { name, equipmentCategory: category } = item;
  switch (category) {
    case "Weapon": {
      const hung = hungWeapon(name, item.weaponClassification);
      if (hung.file) return { bucket: "shared", model: `${(hung.dir ?? KENNEY_BLASTER).replace("/assets/", "")}/${hung.file}`, what: `${hung.kind} design` };
      return { bucket: "code", what: `${hung.kind}, drawn in code` };
    }
    case "Armor": {
      if (item.armorClassification === "Shield") return /generator/i.test(name) ? { bucket: "shared", model: kit("shield-generator"), what: "shield generator" } : { bucket: "shared", model: kit("shield-physical"), what: "physical shield" };
      const weight = ({ Light: "armour-light", Medium: "armour-medium", Heavy: "armour-heavy" } as Record<string, string>)[item.armorClassification ?? ""];
      return weight ? { bucket: "shared", model: kit(weight), what: `${item.armorClassification!.toLowerCase()} armour suit` } : { bucket: "none", what: "armour of no class" };
    }
    case "Kit": return { bucket: "shared", model: kit("kit-case"), what: "kit case, roll or bag" };
    case "Tool": return { bucket: "shared", model: kit("tool-roll"), what: "tool roll" };
    case "Medical": {
      const found = MEDICAL.find(([m]) => m.test(name));
      return found ? { bucket: found[2], model: kit(found[1]), what: found[1] } : { bucket: "none", what: "no model" };
    }
    case "Explosive": return /^grenade|thermal detonator/i.test(name) ? { bucket: "shared", model: blaster("grenade-a"), what: "grenade" } : { bucket: "none", what: "no model (mines, charges)" };
    case "Ammunition": return /cell|clip|mag\b|cartridge|collimator|calibrator/i.test(name) ? { bucket: "shared", model: blaster("clip-large"), what: "power clip" } : { bucket: "none", what: "no model (arrows, bolts, darts, missiles)" };
    case "Storage": return /^crate$/i.test(name) ? { bucket: "dedicated", model: blaster("crate-medium"), what: "crate" } : { bucket: "none", what: "no model" };
    default: return { bucket: "none", what: "no model" };
  }
}

// The weight of armour a name stands for, from the rules data's own class (never from a list of names)
export const armourWeight = (item: Pick<Item, "armorClassification">): "light" | "medium" | "heavy" | "shield" | undefined =>
  ({ Light: "light", Medium: "medium", Heavy: "heavy", Shield: "shield" } as const)[(item.armorClassification ?? "") as "Light"];

// The kinds of weapon that are drawn in code (no model yet)
export const CODE_KINDS: Kind[] = ["saber", "dualsaber", "bow", "whip", "shield", "thrown", "other"];

// ---------------------------------------------------------------------------------------------
// What a figure carries, wears and holds (2026-10-19): the models that go on a person's body. `wantsOf` says which; the humanoid builder
// (models.tsx) knows where on the body each goes, and bakes them into the figure so that they swing with the limb they are on.
// ---------------------------------------------------------------------------------------------

// A thing carried, as the rules data names it
export type GearItem = Item;
// What a character has on them, resolved from the equipment they chose (equippedNow) and carry
export interface Gear {
  // The weapons wielded, the main one first
  weapons: GearItem[];
  // The weight of armour worn, from the rules data's class (never from its name), and the shield carried
  bodyClass?: "light" | "medium" | "heavy";
  shield?: GearItem;
  // Everything else carried: kits, tools, medical supplies, prostheses
  carried: GearItem[];
}
export type Hand = "" | "pistol" | "rifle" | "saber" | "saber2" | "pike" | "gaffi" | "vibro" | "axe" | "bowcaster" | "tool" | "tray" | "datapad" | "staff";
// Where on the body a model goes: the main hand, the other arm (a shield), either hip, the back, the right arm or the left leg (prostheses)
export type Slot = "weapon" | "shield" | "hipR" | "hipL" | "back" | "armR" | "legL";
export interface Want {
  slot: Slot;
  // Under /assets, without ".glb"
  model: string;
  look: KitLook;
  // How big, against its own size (a person's hand is smaller than a rack's reach)
  scale: number;
}

// The pose a weapon is held in, from its kind: a blaster pistol at the side, a rifle across the body, a blade up and forward
export function handOf(item: GearItem | undefined): Hand | undefined {
  if (!item || item.equipmentCategory !== "Weapon") return undefined;
  const kind = hungWeapon(item.name, item.weaponClassification).kind;
  const by: Partial<Record<Kind, Hand>> = { pistol: "pistol", carbine: "rifle", rifle: "rifle", heavy: "rifle", launcher: "rifle", saber: "saber", dualsaber: "saber2", sword: "vibro", dagger: "vibro", axe: "axe", mace: "axe", spear: "pike", staff: "staff", bow: "bowcaster" };
  return by[kind];
}

// What an NPC holds, by the pose their outfit gives (the name stands for a design of that kind; the data has them all)
export const HAND_WEAPON: Partial<Record<Hand, string>> = { pistol: "Blaster pistol", rifle: "Blaster rifle", vibro: "Vibroblade", axe: "Vibroaxe", pike: "Vibropike", staff: "Electrostaff" };

const weaponWant = (name: string, classification?: string): Want | undefined => {
  const hung = hungWeapon(name, classification);
  return hung.file ? { slot: "weapon", model: `${(hung.dir ?? KENNEY_BLASTER).replace("/assets/", "")}/${hung.file}`, look: "weapon", scale: hung.scale * 0.85 } : undefined;
};

const BY_ROLE: [RegExp, Want][] = [
  [/medic|doctor|surgeon|healer|nurse/i, { slot: "hipL", model: kit("medpac"), look: "medical", scale: 0.5 }],
  [/mechanic|engineer|technician|tinker|repair|smith/i, { slot: "hipR", model: kit("tool-roll"), look: "kit", scale: 0.45 }],
  [/merchant|trader|dealer|vendor|clerk/i, { slot: "hipR", model: kit("kit-bag"), look: "kit", scale: 0.5 }],
  [/scout|ranger|hunter|trapper|trailblazer/i, { slot: "back", model: kit("kit-roll"), look: "kit", scale: 0.55 }],
];

// The models a person has: their weapon (by their outfit's pose for an NPC, by what they wield for a character), a shield, kits and
// tools on the hips and back, prostheses on the limbs they replace
export function wantsOf(hand: Hand, gear?: Gear, role = ""): Want[] {
  const out: Want[] = [];
  const main = gear ? gear.weapons[0] : undefined;
  const w = main ? weaponWant(main.name, main.weaponClassification) : !gear && HAND_WEAPON[hand] ? weaponWant(HAND_WEAPON[hand]!) : undefined;
  if (w) out.push(w);
  if (!gear) {
    const r = BY_ROLE.find(([m]) => m.test(role));
    if (r) out.push(r[1]);
    return out;
  }
  if (gear.shield) out.push(/generator/i.test(gear.shield.name) ? { slot: "shield", model: kit("shield-generator"), look: "armour", scale: 0.5 } : { slot: "shield", model: kit("shield-physical"), look: "armour", scale: 0.5 });
  const free: Slot[] = ["hipR", "hipL", "back"];
  for (const item of gear.carried) {
    const c = coverageOf(item);
    const name = c.model?.replace("kenney-kitbash/", "");
    if (!name) continue;
    if (/^(arm|forearm|hand) prosthesis$/i.test(item.name) && !out.some((x) => x.slot === "armR")) out.push({ slot: "armR", model: kit("prosthesis-arm"), look: "prosthetic", scale: 1 });
    else if (/^(leg|foot) prosthesis$/i.test(item.name) && !out.some((x) => x.slot === "legL")) out.push({ slot: "legL", model: kit("prosthesis-leg"), look: "prosthetic", scale: 1 });
    else if (/^(kit-case|kit-bag|kit-roll|tool-roll|medpac|trauma-case)$/.test(name) && free.length) {
      const slot = name === "kit-roll" && free.includes("back") ? "back" : free.find((s) => s !== "back") ?? free[0];
      free.splice(free.indexOf(slot), 1);
      out.push({ slot, model: c.model!, look: KIT_LOOK[name], scale: slot === "back" ? 0.55 : 0.45 });
    }
  }
  return out;
}
const KIT_LOOK: Record<string, KitLook> = { "kit-case": "kit", "kit-bag": "kit", "kit-roll": "kit", "tool-roll": "kit", medpac: "medical", "trauma-case": "medical" };
