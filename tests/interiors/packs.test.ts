import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PACKS, WALL_FILES, facing, fitPiece, maxHeightOf, packOf, pieceOf, stretches, wallTiles } from "../../client/src/components/Map/interiors/packs";
import { TONES } from "../../client/src/components/Map/interiors/tones";

test("a room takes its pack by its name, then by its building, one pack at most", () => {
  assert.equal(packOf("Guest rooms"), "station");
  assert.equal(packOf("Palatial suite", "palace"), "station");
  assert.equal(packOf("Servants' quarters", "palace"), "furniture", "a palace's servants live like servants");
  assert.equal(packOf("Apartments"), "furniture");
  assert.equal(packOf("Kitchens"), undefined);
  assert.equal(packOf("Workfloor", "workshop"), "industrial");
  assert.equal(packOf("Barracks", "garrison"), "military");
  assert.equal(packOf("Ward", "medcenter"), "medical");
  assert.equal(packOf("Bridge", "starship"), "hull");
  assert.equal(packOf("Den", "hideout"), "criminal");
  assert.equal(packOf("Main bar", "cantina"), undefined);
});

test("every piece a pack draws is in its folder, converted, with its licence, and every pack has a palette", () => {
  for (const [id, pack] of Object.entries(PACKS)) {
    assert.ok(TONES[pack.tone], `${id}: no tone ${pack.tone}`);
    for (const file of Object.values(pack.pieces)) {
      const [dir] = file.split("/");
      assert.ok(fs.existsSync(`client/public/assets/${dir}/License.txt`), `${id}: ${dir} has no licence`);
      assert.ok(fs.existsSync(`client/public/assets/${file}.glb`), `${id}: ${file}.glb missing`);
    }
  }
  for (const url of Object.values(WALL_FILES)) assert.ok(fs.existsSync(`client/public${url}`), url);
  assert.equal(pieceOf("station", "Couch"), "/assets/kenney-furniture/loungeSofa.glb");
  assert.equal(pieceOf("station", "Chaise"), undefined, "a piece the pack lacks is drawn by the code");
  assert.equal(pieceOf(undefined, "Bed"), undefined);
});

test("the packs with walls are the ones of built places, and the frontier's rooms keep their own", () => {
  const walled = Object.entries(PACKS).filter(([, p]) => "walls" in p && p.walls).map(([id]) => id).sort();
  assert.deepEqual(walled, ["hull", "industrial", "medical", "military", "station"]);
});

test("a piece faces away from the wall it stands against", () => {
  const room = [10, 8] as const;
  assert.equal(facing({ x: 3, y: 0, w: 2, h: 1 }, ...room), 0, "north wall: faces south");
  assert.equal(facing({ x: 3, y: 7, w: 2, h: 1 }, ...room), Math.PI, "south wall: faces north");
  assert.equal(facing({ x: 0, y: 3, w: 1, h: 2 }, ...room), Math.PI / 2, "west wall: faces east");
  assert.equal(facing({ x: 9, y: 3, w: 1, h: 2 }, ...room), -Math.PI / 2, "east wall: faces west");
  assert.equal(facing({ x: 4, y: 3, w: 1, h: 1 }, ...room), 0, "in the open: south");
});

test("a piece is turned to the long side of its footprint, kept inside it and under its height, and repeated along a long side", () => {
  // A bed (0.5 wide, 1 long along z) on a 2x1 footprint lies along x
  const bed = fitPiece([0.5, 0.35, 1], 2, 1, 0, maxHeightOf("Bed"));
  assert.equal(Math.round(Math.abs(bed.turn) * 100), Math.round((Math.PI / 2) * 100));
  assert.ok(bed.scale * 1 <= 2 + 1e-6 && bed.scale * 0.5 <= 1 + 1e-6);
  // A console (0.4 x 0.66 x 0.44) on a 2x1 counter: two of them, no taller than it may be
  const consoles = fitPiece([0.4, 0.66, 0.44], 2, 1, 0, maxHeightOf("Console"));
  assert.equal(consoles.offsets.length, 2);
  assert.ok(consoles.scale * 0.66 <= maxHeightOf("Console") + 1e-6);
  for (const o of consoles.offsets) assert.ok(Math.abs(o) + (0.4 * consoles.scale) / 2 <= 1 + 1e-6, "inside the footprint");
  // A tall piece reaches higher than a table; a square footprint is not turned
  assert.ok(maxHeightOf("Antenna mast") > maxHeightOf("Table"));
  assert.equal(fitPiece([0.57, 0.6, 0.57], 1, 1, Math.PI, 1).turn, Math.PI);
  // A counter is drawn longer, within its footprint
  assert.ok(stretches("Workbench") && stretches("Bench") && !stretches("Low table") && !stretches("Console"));
  const bench = fitPiece([1.1, 0.4, 0.6], 3, 1, 0, 0.6, true);
  assert.equal(bench.offsets.length, 1);
  assert.ok(bench.stretch > 1 && bench.stretch <= 2.2);
  assert.ok(1.1 * bench.scale * bench.stretch <= 3 + 1e-6, "inside the footprint");
});

test("a wall run is tiles that fill it, the ends plain and some panels between", () => {
  for (const length of [1, 2, 3.16, 5, 9]) {
    const tiles = wallTiles(length, 1);
    assert.ok(Math.abs(tiles.reduce((n, t) => n + t.length, 0) - length) < 1e-9);
    assert.ok(tiles.every((t) => t.length > 0.6 && t.length < 1.6), `${length}: tiles stay near one square`);
    assert.equal(tiles[0].file, WALL_FILES.plain);
    assert.equal(tiles[tiles.length - 1].file, WALL_FILES.plain);
  }
  assert.ok(wallTiles(9, 0).some((t) => t.file === WALL_FILES.panel));
});

test("the kit's wall tiles bend round a rounded corner: on the ring, in its quarter, meeting the straight walls", async () => {
  const { cornerCentre, cornerGeometries, wallsGeometry } = await import("../../client/src/components/Map/interiors/Walls");
  const { loadGlb } = await import("../helpers");
  const files = Object.fromEntries(await Promise.all(Object.values(WALL_FILES).map(async (url) => [url, await loadGlb(`client/public${url}`)])));
  const [width, height, wallH, thick] = [11, 7, 0.8, 0.16];
  for (const r of [1, 2.5, 3.5, 5.5]) for (const corner of [0, 1, 2, 3] as const) {
    const c = { corner, r };
    const [cx, cz] = cornerCentre(c, width, height);
    const tiles = cornerGeometries(c, width, height, wallH, thick, files)!;
    assert.ok(tiles.length >= 2, `r ${r}: ${tiles.length} tiles`);
    const sx = corner === 0 || corner === 3 ? -1 : 1;
    const sz = corner === 0 || corner === 1 ? -1 : 1;
    for (const g of tiles) {
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = [pos.getX(i) - cx, pos.getY(i), pos.getZ(i) - cz];
        const rho = Math.hypot(x, z);
        assert.ok(rho > r - 0.3 && rho < r + 0.3, `r ${r} corner ${corner}: a vertex at ${rho.toFixed(2)} from the centre`);
        assert.ok(y >= -1e-6 && y <= wallH + 1e-6, `height ${y}`);
        assert.ok(x * sx >= -1e-6 && z * sz >= -1e-6, `r ${r} corner ${corner}: a vertex outside the quarter`);
        // The room's walls stand inside the 11 by 7 floor, on its outside edge
        assert.ok(pos.getX(i) > -0.3 && pos.getX(i) < width + 0.3 && pos.getZ(i) > -0.3 && pos.getZ(i) < height + 0.3);
      }
    }
  }
  // A whole room: straight runs trimmed back to the corners' tangent points, and the corners, make one mesh
  const rr = 2.5;
  const runs = [{ side: "n" as const, a: rr, b: width - rr }, { side: "s" as const, a: rr, b: width - rr }, { side: "w" as const, a: rr, b: height - rr }, { side: "e" as const, a: rr, b: height - rr }];
  const corners = ([0, 1, 2, 3] as const).map((corner) => ({ corner, r: rr }));
  const whole = wallsGeometry(runs, width, height, wallH, thick, files, corners)!;
  assert.ok(whole.getAttribute("position").count > 0);
  assert.equal(wallsGeometry(runs, width, height, wallH, thick, {}, corners), null, "nothing until the kit is in");
});
