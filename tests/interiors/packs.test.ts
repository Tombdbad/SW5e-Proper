import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PACKS, packOf, pieceOf } from "../../client/src/components/Map/interiors/packs";

test("a room takes its pack by its name, one pack at most", () => {
  assert.equal(packOf("Guest rooms"), "station");
  assert.equal(packOf("Palatial suite"), "station");
  assert.equal(packOf("Servants' quarters"), "furniture");
  assert.equal(packOf("Apartments"), "furniture");
  assert.equal(packOf("Kitchens"), undefined);
});

test("every piece a pack draws is in its folder, converted, and the pack has its licence", () => {
  for (const [id, pack] of Object.entries(PACKS)) {
    const dir = `client/public${pack.dir}`;
    assert.ok(fs.existsSync(`${dir}/License.txt`), `${id} has no licence`);
    for (const file of Object.values(pack.pieces)) assert.ok(fs.existsSync(`${dir}/${file}.glb`), `${id}: ${file}.glb missing`);
  }
  assert.equal(pieceOf("station", "Couch"), "/assets/kenney-station/furniture-kit-sofa.glb", "the palace sofa is the Furniture Kit sofa in the Imperial palette");
  assert.equal(pieceOf("station", "Chaise"), undefined, "a piece the pack lacks is drawn by the code");
  assert.equal(pieceOf(undefined, "Bed"), undefined);
});
