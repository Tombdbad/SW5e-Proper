// What tools/kitbash.mjs builds: armour on stands, shields, kit cases, medical cases, prosthetics, tools and a few melee weapons and
// launchers, from the converted Space Kit and Space Station Kit (`space/<model>`, `station/<model>`) and plain solids. Colours are
// roles, not looks: steel greys are what a room's palette turns into its own greys, and the one saturated colour (ACC) is what
// it turns into its accent (client/src/components/Map/interiors/tones.ts). Units are the map's squares: a model stands on its
// floor in the middle of its footprint (a weapon lies along z, its middle on the origin, as the Blaster Kit's do).
export const OUT = "client/public/assets/kenney-kitbash";

const DARK = "#2b2f36";
const MID = "#6f7a86";
const LIGHT = "#cfd5db";
const WHITE = "#e9eef0";
const CLOTH = "#7a766e";
const ACC = "#e0742a";

// Part helpers
const box = (size, at, color, rot) => ({ box: size, at, color, rot });
const cyl = (r, h, at, color, rot, seg = 12) => ({ cyl: [r, h, seg], at, color, rot });
const cone = (r, h, at, color, rot, seg = 8) => ({ cone: [r, h, seg], at, color, rot });
const ball = (r, at, color, scale, seg = 10) => ({ sphere: [r, seg], at, color, scale });
// A piece of the astronaut suit (islands: 0 and 1 the arms, 2 and 3 the legs, 4 the body with its helmet and pack), kept in the
// suit's own arrangement so that the limbs meet the body; `at` and `scale` move the whole of what is picked
const SUIT_A = "space/astronautA";
const SUIT_B = "space/astronautB";
const suit = (from, islands, extra = {}) => ({ from, islands, origin: [2, 0, 1.5], ...extra });

// An armour stand: a round foot and a pole to `top`
const stand = (top, color = DARK) => [cyl(0.26, 0.04, [0, 0.02, 0], color, undefined, 16), cyl(0.025, top, [0, top / 2, 0], MID, undefined, 8)];
// A cross for the medical cases, on a face at +z
const cross = (at, size) => [box([size, size * 0.3, 0.012], at, ACC), box([size * 0.3, size, 0.012], at, ACC)];
// A carrying handle on top of a case `w` wide and `h` high
const handle = (w, h, d) => [box([w * 0.32, 0.03, 0.04], [0, h + 0.05, 0], DARK), box([0.03, 0.06, 0.04], [-w * 0.16, h + 0.02, 0], DARK), box([0.03, 0.06, 0.04], [w * 0.16, h + 0.02, 0], DARK)];
// A case of w by h by d with a lid seam and two latches on its front
const hardCase = (w, h, d, body, latch = ACC) => [
  box([w, h, d], [0, h / 2, 0], body),
  box([w + 0.01, 0.018, d + 0.01], [0, h * 0.62, 0], DARK),
  box([0.05, 0.075, 0.02], [-w * 0.3, h * 0.62, d / 2 + 0.006], latch),
  box([0.05, 0.075, 0.02], [w * 0.3, h * 0.62, d / 2 + 0.006], latch),
  ...handle(w, h, d),
];
// Fingers of a hand lying along +x, palm at the origin: `n` boxes
const fingers = (n, len, spread, at = [0, 0, 0], color = MID) => Array.from({ length: n }, (_, i) => box([len, 0.022, 0.026], [at[0] + len / 2 + 0.05, at[1], at[2] + (i - (n - 1) / 2) * spread], color));
// The hand of a prosthesis lying along +x with its palm at `at`: palm, four fingers, a thumb and a plate on the back
const hand = (at) => [
  box([0.1, 0.04, 0.11], at, MID),
  ...fingers(4, 0.1, 0.03, at, DARK),
  box([0.06, 0.026, 0.03], [at[0] + 0.02, at[1], at[2] - 0.085], DARK, [0, 25, 0]),
  box([0.06, 0.012, 0.07], [at[0], at[1] + 0.026, at[2]], ACC),
];

export const MODELS = {
  // ---- Armour: light (a fibre vest), medium (a plated cuirass with sleeves), heavy (a full suit); they stand on 1 by 1 squares
  "armour-light": {
    parts: [
      ...stand(0.34),
      suit(SUIT_A, [4], { clip: { y: [0, 0.6] }, at: [0, 0.12, 0], scale: 1.05 }),
      box([0.3, 0.05, 0.22], [0, 0.42, 0], DARK),
      box([0.22, 0.04, 0.012], [0, 0.55, 0.17], ACC),
    ],
  },
  "armour-medium": {
    parts: [
      ...stand(0.3),
      suit(SUIT_B, [4], { clip: { y: [0, 0.65] }, at: [0, 0.1, 0], scale: 1.15 }),
      suit(SUIT_B, [0, 1], { at: [0, 0.1, 0], scale: 1.15 }),
      ball(0.1, [-0.25, 0.66, 0], MID, [1, 0.8, 1.15]),
      ball(0.1, [0.25, 0.66, 0], MID, [1, 0.8, 1.15]),
      box([0.3, 0.2, 0.03], [0, 0.6, 0.19], MID),
      box([0.3, 0.05, 0.26], [0, 0.44, 0], DARK),
      box([0.08, 0.2, 0.012], [0, 0.6, 0.208], ACC),
    ],
  },
  "armour-heavy": {
    parts: [
      cyl(0.3, 0.05, [0, 0.025, 0], DARK, undefined, 16),
      suit(SUIT_A, [0, 1, 2, 3, 4], { at: [0, 0.08, 0], scale: 1.18 }),
      ball(0.13, [-0.31, 0.75, 0], MID, [1, 0.85, 1.2]),
      ball(0.13, [0.31, 0.75, 0], MID, [1, 0.85, 1.2]),
      box([0.36, 0.26, 0.05], [0, 0.66, 0.2], MID),
      box([0.36, 0.06, 0.3], [0, 0.46, 0], DARK),
      box([0.1, 0.3, 0.03], [0, 0.6, -0.26], DARK),
      box([0.1, 0.08, 0.012], [0, 0.7, 0.228], ACC),
      box([0.08, 0.12, 0.06], [-0.1, 0.2, 0.08], MID),
      box([0.08, 0.12, 0.06], [0.1, 0.2, 0.08], MID),
      cone(0.03, 0.14, [0, 1.12, -0.04], ACC, [-20, 0, 0], 4),
    ],
  },
  // ---- Shields: a physical one with a boss and a rim on a foot, and a generator with its emitter
  "shield-physical": {
    parts: [
      box([0.34, 0.03, 0.2], [0, 0.015, 0], DARK),
      cyl(0.34, 0.05, [0, 0.4, 0], MID, [90, 0, 0], 20),
      cyl(0.355, 0.035, [0, 0.4, -0.02], DARK, [90, 0, 0], 20),
      ball(0.1, [0, 0.4, 0.04], LIGHT, [1, 1, 0.6]),
      box([0.5, 0.05, 0.012], [0, 0.4, 0.03], ACC),
      cyl(0.02, 0.28, [0, 0.14, -0.06], DARK, undefined, 6),
    ],
  },
  "shield-generator": {
    parts: [
      cyl(0.15, 0.06, [0, 0.03, 0], DARK, undefined, 14),
      cyl(0.07, 0.2, [0, 0.16, 0], MID, undefined, 10),
      cyl(0.11, 0.025, [0, 0.27, 0], DARK, undefined, 14),
      ball(0.09, [0, 0.35, 0], ACC),
      box([0.16, 0.06, 0.04], [0, 0.1, 0.1], DARK),
    ],
  },
  // ---- Kits and tools: a hard case, a roll and a bag for the kits, a roll of implements, and the tools that lie in it
  "kit-case": { parts: hardCase(0.5, 0.26, 0.34, MID).concat([box([0.2, 0.07, 0.012], [0, 0.12, 0.176], LIGHT)]) },
  "kit-roll": {
    parts: [
      cyl(0.12, 0.5, [0, 0.12, 0], CLOTH, [0, 0, 90], 14),
      cyl(0.127, 0.05, [-0.14, 0.12, 0], ACC, [0, 0, 90], 14),
      cyl(0.127, 0.05, [0.14, 0.12, 0], ACC, [0, 0, 90], 14),
      box([0.05, 0.05, 0.03], [-0.14, 0.12, 0.13], LIGHT),
      box([0.05, 0.05, 0.03], [0.14, 0.12, 0.13], LIGHT),
      cyl(0.04, 0.04, [0.27, 0.12, 0], DARK, [0, 0, 90], 8),
    ],
  },
  "kit-bag": {
    parts: [
      box([0.42, 0.22, 0.2], [0, 0.11, 0], CLOTH),
      box([0.43, 0.05, 0.22], [0, 0.245, 0], DARK),
      box([0.12, 0.2, 0.012], [0, 0.17, 0.106], ACC),
      box([0.04, 0.04, 0.02], [0, 0.17, 0.115], LIGHT),
      cyl(0.015, 0.36, [0, 0.3, 0], DARK, [0, 0, 90], 6),
    ],
  },
  "tool-roll": {
    parts: [
      box([0.5, 0.04, 0.3], [0, 0.02, 0], CLOTH),
      box([0.5, 0.012, 0.03], [0, 0.046, -0.12], DARK),
      box([0.36, 0.022, 0.026], [-0.04, 0.062, -0.06], MID),
      box([0.08, 0.022, 0.07], [0.17, 0.062, -0.06], MID, [0, 20, 0]),
      cyl(0.016, 0.3, [-0.06, 0.064, 0.02], DARK, [0, 0, 90], 8),
      cone(0.014, 0.08, [0.13, 0.064, 0.02], ACC, [0, 0, -90], 6),
      cyl(0.02, 0.2, [-0.02, 0.066, 0.1], ACC, [0, 0, 90], 8),
      box([0.1, 0.03, 0.04], [0.1, 0.066, 0.1], MID),
    ],
  },
  // ---- Medical: a medpac (a white box with a cross), a trauma case, and a repair kit in the industrial yellow of its palette
  medpac: {
    parts: [box([0.34, 0.2, 0.24], [0, 0.1, 0], WHITE), ...cross([0, 0.11, 0.126], 0.12), ...handle(0.34, 0.2, 0.24), box([0.3, 0.014, 0.25], [0, 0.13, 0], MID)],
  },
  "trauma-case": {
    parts: [box([0.5, 0.3, 0.34], [0, 0.15, 0], WHITE), ...cross([0, 0.18, 0.176], 0.16), ...handle(0.5, 0.3, 0.34), box([0.52, 0.02, 0.36], [0, 0.19, 0], MID), box([0.06, 0.08, 0.02], [-0.18, 0.19, 0.18], DARK), box([0.06, 0.08, 0.02], [0.18, 0.19, 0.18], DARK)],
  },
  // ---- Prosthetics, lying along x on a display: an arm (the suit's sleeve with a joint and a hand), a leg, a hand, an eye on its stand
  "prosthesis-arm": {
    parts: [
      suit(SUIT_A, [0], { rot: [0, 0, 90], origin: [1.81, 0, 1.48], at: [0, 0.07, 0] }),
      ball(0.045, [-0.37, 0.07, 0], MID),
      cyl(0.035, 0.14, [-0.47, 0.07, 0], LIGHT, [0, 0, 90], 10),
      cyl(0.045, 0.04, [-0.2, 0.07, 0], DARK, [0, 0, 90], 10),
      ...hand([0.05, 0.07, 0]),
      cyl(0.009, 0.45, [-0.18, 0.13, 0.03], ACC, [0, 0, 90], 5),
    ],
  },
  "prosthesis-leg": {
    parts: [
      suit(SUIT_A, [2], { rot: [0, 0, 90], origin: [1.93, 0, 1.49], scale: 1.1, at: [0, 0.07, 0] }),
      ball(0.05, [-0.27, 0.07, 0], MID),
      cyl(0.04, 0.2, [-0.4, 0.07, 0], LIGHT, [0, 0, 90], 10),
      cyl(0.052, 0.04, [-0.13, 0.07, 0], DARK, [0, 0, 90], 10),
      cyl(0.011, 0.38, [-0.18, 0.14, 0.04], ACC, [0, 0, 90], 5),
    ],
  },
  "prosthesis-hand": {
    parts: [cyl(0.04, 0.12, [-0.1, 0.05, 0], LIGHT, [0, 0, 90], 10), ...hand([-0.02, 0.05, 0]), cyl(0.008, 0.18, [-0.12, 0.09, 0.02], ACC, [0, 0, 90], 5)],
  },
  "prosthesis-eye": {
    parts: [
      cyl(0.09, 0.025, [0, 0.0125, 0], DARK, undefined, 14),
      cyl(0.012, 0.1, [0, 0.07, 0], MID, undefined, 6),
      ball(0.07, [0, 0.16, 0], WHITE),
      ball(0.04, [0, 0.16, 0.045], ACC, [1, 1, 0.5]),
      ball(0.02, [0, 0.16, 0.066], DARK, [1, 1, 0.5]),
      cyl(0.075, 0.012, [0, 0.16, 0], MID, [90, 0, 0], 14),
    ],
  },
  // ---- Melee weapons and a launcher, lying along z with their middle on the origin
  "vibro-dagger": {
    parts: [
      cyl(0.016, 0.07, [0, 0.0, -0.065], DARK, [90, 0, 0], 8),
      box([0.07, 0.016, 0.012], [0, 0, -0.03], MID),
      box([0.028, 0.01, 0.13], [0, 0, 0.04], LIGHT),
      box([0.006, 0.012, 0.11], [0, 0, 0.045], ACC),
    ],
    origin: "centre",
  },
  "vibro-blade": {
    parts: [
      cyl(0.02, 0.16, [0, 0, -0.17], DARK, [90, 0, 0], 8),
      ball(0.025, [0, 0, -0.26], MID),
      box([0.14, 0.022, 0.02], [0, 0, -0.085], MID),
      box([0.05, 0.012, 0.34], [0, 0, 0.09], LIGHT),
      box([0.008, 0.014, 0.3], [0, 0, 0.1], ACC),
    ],
    origin: "centre",
  },
  "vibro-axe": {
    parts: [
      cyl(0.02, 0.46, [0, 0, 0], DARK, [90, 0, 0], 8),
      box([0.2, 0.02, 0.17], [0, 0, 0.2], LIGHT),
      box([0.2, 0.014, 0.012], [0, 0, 0.28], ACC),
      cone(0.025, 0.06, [0, 0, 0.2], MID, [90, 0, 0], 6),
      ball(0.025, [0, 0, -0.23], MID),
    ],
    origin: "centre",
  },
  "vibro-mace": {
    parts: [cyl(0.02, 0.45, [0, 0, 0], DARK, [90, 0, 0], 8), box([0.12, 0.12, 0.14], [0, 0, 0.26], MID), box([0.125, 0.125, 0.025], [0, 0, 0.3], ACC), box([0.125, 0.125, 0.025], [0, 0, 0.21], ACC)],
    origin: "centre",
  },
  "vibro-pike": {
    parts: [
      cyl(0.016, 0.8, [0, 0, -0.05], DARK, [90, 0, 0], 8),
      cone(0.04, 0.2, [0, 0, 0.45], LIGHT, [90, 0, 0], 4),
      box([0.01, 0.012, 0.16], [0, 0, 0.46], ACC),
      ball(0.02, [0, 0, -0.45], MID),
      cyl(0.025, 0.05, [0, 0, 0.32], MID, [90, 0, 0], 8),
    ],
    origin: "centre",
  },
  electrostaff: {
    parts: [
      cyl(0.017, 0.8, [0, 0, 0], DARK, [90, 0, 0], 8),
      cyl(0.026, 0.1, [0, 0, 0.4], MID, [90, 0, 0], 8),
      cyl(0.026, 0.1, [0, 0, -0.4], MID, [90, 0, 0], 8),
      ball(0.03, [0, 0, 0.47], ACC),
      ball(0.03, [0, 0, -0.47], ACC),
      box([0.05, 0.05, 0.1], [0, 0, 0], MID),
    ],
    origin: "centre",
  },
  launcher: {
    parts: [
      cyl(0.07, 0.62, [0, 0.02, 0.06], DARK, [90, 0, 0], 12),
      cyl(0.085, 0.1, [0, 0.02, 0.4], MID, [90, 0, 0], 12),
      cyl(0.075, 0.06, [0, 0.02, -0.26], MID, [90, 0, 0], 12),
      box([0.06, 0.16, 0.08], [0, -0.1, 0.0], DARK, [15, 0, 0]),
      box([0.04, 0.05, 0.14], [0, 0.11, 0.1], MID),
      box([0.05, 0.03, 0.12], [0, 0.02, 0.0], ACC),
      cyl(0.025, 0.08, [0, -0.1, 0.26], DARK, undefined, 6),
    ],
    origin: "centre",
  },
};
