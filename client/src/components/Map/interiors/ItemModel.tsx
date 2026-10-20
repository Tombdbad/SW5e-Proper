// One model of the item catalogue (items.ts), drawn as the game draws it: its colours, and each part in its finish (metal shines, glass-like
// parts and lamps glow, cloth is seen from both sides). For the developer's gallery and for anywhere an item should be looked at: an
// inventory card, a cache, a shop window. A model whose colours mean something is never put in a room's palette.
import { useMemo } from "react";
import * as THREE from "three";
import { MATERIALS } from "../models";
import { useModels, splitByFinish } from "./assets";
import { lookOfModel } from "./gear";
import { toneNameOf } from "./kitbash";
import { ITEM_MODELS, modelUrl } from "./items";
import { TONES, type Tone } from "./tones";

export function ItemModel({ model, tone, scale = 1, detail = "hero" }: { model: string; tone?: Tone; scale?: number; detail?: "hero" | "low" }) {
  const url = modelUrl(model, detail)!;
  const look = lookOfModel(model);
  const name = toneNameOf(look);
  const t = look === "plain" ? undefined : tone ?? (name ? TONES[name] : undefined);
  const got = useModels([url], "base", t)[url];
  const parts = useMemo(() => (got ? splitByFinish(got) : []), [got]);
  if (!got) return null;
  return (
    <group scale={scale}>
      {parts.map((p) => (
        <mesh key={p.finish} geometry={p.geo} material={MATERIALS[p.finish]} castShadow raycast={() => null} />
      ))}
    </group>
  );
}

// How much to enlarge a model so that its longest side is about `size` squares (the small ones are tiny beside a figure)
export function lookScale(model: string, size = 0.5): number {
  const b = ITEM_MODELS[model]?.box;
  if (!b) return 1;
  const longest = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  return Math.min(8, Math.max(1, size / Math.max(longest, 0.01)));
}
