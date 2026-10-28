// Going up to a roof and down from it (2026-10-27): the figure's path starts where the party stands, ends where it arrives, and goes up or down
// without a jump in it (interiors/transit.ts)
import test from "node:test";
import assert from "node:assert/strict";
import { transitAt, transitMs, geomOf, type TransitKind } from "../../client/src/components/Map/interiors/transit";

const layout = { x: 10, y: 10, width: 8, height: 6 };
const KINDS: TransitKind[] = ["ladder", "grips", "hook", "fly", "leap", "jump", "descent"];
const g = geomOf(layout, 3.02, { side: "s", x: 3, y: 5 }, [13.5, 17.5]);

test("the wall's geometry from the way that joins a roof: the pad in the street, the roof's square across the wall", () => {
  assert.deepEqual(g.wall, [13.5, 16]);
  assert.deepEqual(g.out, [0, 1]);
  assert.deepEqual(g.pad, [13.5, 16.5]);
  assert.deepEqual(g.roof, [13.5, 15.5]);
  // with no way: the edge nearest the party
  const near = geomOf(layout, 3, undefined, [9, 12.5]);
  assert.deepEqual(near.out, [-1, 0]);
  assert.equal(near.wall[0], 10);
});

test("up: from where the party stands to the roof's square, rising to the roof's height; down: back to the street's foot", () => {
  for (const kind of KINDS) {
    const up = [transitAt(kind, true, g, [13.5, 17.5], 0), transitAt(kind, true, g, [13.5, 17.5], 1)];
    assert.ok(Math.hypot(up[0].x - 13.5, up[0].z - 17.5) < 0.05 && Math.abs(up[0].y) < 0.01, `${kind} up starts on the street`);
    assert.ok(Math.hypot(up[1].x - g.roof[0], up[1].z - g.roof[1]) < 0.05 && Math.abs(up[1].y - g.top) < 0.05, `${kind} up ends on the roof ${JSON.stringify(up[1])}`);
    const down = [transitAt(kind, false, g, [13.5, 15.5], 0), transitAt(kind, false, g, [13.5, 15.5], 1)];
    assert.ok(Math.abs(down[0].y - g.top) < 0.05, `${kind} down starts on the roof`);
    assert.ok(Math.hypot(down[1].x - g.pad[0], down[1].z - g.pad[1]) < 0.05 && Math.abs(down[1].y) < 0.01, `${kind} down ends in the street ${JSON.stringify(down[1])}`);
  }
});

test("no jumps in the path: a small step in time is a small step in space; a ladder is climbed steadily", () => {
  for (const kind of KINDS) {
    for (const up of [true, false]) {
      const start: [number, number] = up ? [13.5, 17.5] : [13.5, 15.5];
      let last = transitAt(kind, up, g, start, 0);
      for (let i = 1; i <= 200; i++) {
        const p = transitAt(kind, up, g, start, i / 200);
        assert.ok(Math.hypot(p.x - last.x, p.z - last.z, p.y - last.y) < 0.45, `${kind} ${up ? "up" : "down"} jumps at ${i / 200}`);
        assert.ok(Number.isFinite(p.yaw));
        last = p;
      }
    }
  }
  let y = -1;
  for (let i = 0; i <= 100; i++) {
    const p = transitAt("ladder", true, g, [13.5, 17.5], i / 100);
    assert.ok(p.y >= y - 0.2, "a ladder is climbed up, not down");
    y = Math.max(y, p.y);
  }
  assert.equal(transitAt("ladder", true, g, [13.5, 17.5], 0.5).climbing, true);
  assert.equal(transitAt("fly", true, g, [13.5, 17.5], 0.4).burning, true);
});

test("how long: a floor more takes longer; a flight is faster than a ladder, a drop faster than a climb", () => {
  for (const kind of KINDS) assert.ok(transitMs(kind, 2) > transitMs(kind, 1) && transitMs(kind, 1) > 400);
  assert.ok(transitMs("fly", 1) < transitMs("ladder", 1));
  assert.ok(transitMs("jump", 2) < transitMs("ladder", 2));
});
