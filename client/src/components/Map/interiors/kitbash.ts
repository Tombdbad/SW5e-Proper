// The models built from pieces of the downloaded kits (tools/kitbash.mjs, recipes in tools/kitbash-recipes.mjs): armour on stands,
// shields, kit and medical cases, prosthetics, tools, and the melee weapons and launcher the Blaster Kit lacks. The folder is
// under client/public/assets, each model with a low-detail file beside it (".lod.glb"). Pure: tests/interiors/kitbash.test.ts.
export const KITBASH = "/assets/kenney-kitbash";

// What a model is, for the palette it takes where its room has none, and where it is shown
// "plain": a model whose colours mean something (a blade, a grenade, a suit) and is never recoloured to a room palette
export type KitLook = "armour" | "kit" | "medical" | "prosthetic" | "weapon" | "plain";
export const KIT_MODELS: Record<string, KitLook> = {
  "armour-light": "armour", "armour-medium": "armour", "armour-heavy": "armour", "shield-physical": "armour", "shield-generator": "armour",
  "kit-case": "kit", "kit-roll": "kit", "kit-bag": "kit", "tool-roll": "kit",
  medpac: "medical", "trauma-case": "medical",
  "prosthesis-arm": "prosthetic", "prosthesis-leg": "prosthetic", "prosthesis-hand": "prosthetic", "prosthesis-eye": "prosthetic",
  "vibro-dagger": "weapon", "vibro-blade": "weapon", "vibro-axe": "weapon", "vibro-mace": "weapon", "vibro-pike": "weapon", electrostaff: "weapon", launcher: "weapon",
};
// Where a palette is not the room's own: armour in gunmetal, kits in the workshop's steel, medicine in white and teal
export const DEFAULT_TONE: Record<Exclude<KitLook, "plain">, string> = { armour: "gunmetal", kit: "industrial", medical: "medical", prosthetic: "medical", weapon: "gunmetal" };
// The palette name of a look, or none for a plain one
export const toneNameOf = (look: KitLook): string | undefined => (look === "plain" ? undefined : DEFAULT_TONE[look]);
export const kitUrl = (model: string, detail: "hero" | "low" = "hero") => `${KITBASH}/${model}${detail === "low" ? ".lod" : ""}.glb`;
