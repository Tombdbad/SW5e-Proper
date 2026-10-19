// Which model stands for a piece of equipment (2026-10-19). One mapping serves the shelves (stock.ts), the people who carry things
// (figures hold, wear and carry them) and the list of what has no model yet (tools/model-coverage.ts). Pure: tests/interiors/gear.test.ts.
// An item's equipment category, name and class are the rules data's (shared/data/sw5e/equipment.json); nothing here is a rule.
import { hungWeapon, type Kind } from "./weapons";
import { KITBASH } from "./kitbash";
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
