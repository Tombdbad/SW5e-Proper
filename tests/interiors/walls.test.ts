// A door or window takes only what is inside its frame out of its square of wall (2026-10-26): the wall piece round it covers the
// whole square but for the frame's outline, and a piece bent onto a curve keeps its points on the curve
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { boxUV } from "../../client/src/components/Map/surfaces";
import { holeOf, piercedWall, bendAlong } from "../../client/src/components/Map/interiors/Walls";
import { outline, outlineAt, radiiOf } from "../../shared/logic/footprint";

// The area of the faces of a geometry that look along +z (the wall's face toward the room)
function frontArea(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.z > 1e-9 && Math.abs(n.z) > Math.abs(n.x) && Math.abs(n.z) > Math.abs(n.y)) area += n.length() / 2;
  }
  return area;
}
// A window 0.5 wide from 0.4 to 1.0 high (a rectangle), in a wall 2.4 high
const rect: [number, number][] = [[-0.25, 0.4], [0.25, 0.4], [0.25, 1.0], [-0.25, 1.0]];

test("a window's wall covers the square but for the window", () => {
  const g = piercedWall(holeOf(rect), 2.4, 0.16)!;
  assert.ok(Math.abs(frontArea(g) - (2.4 - 0.5 * 0.6)) < 1e-6, `front ${frontArea(g)}`);
});
test("a window taller than a low wall leaves the wall beside and under it", () => {
  const g = piercedWall(holeOf(rect), 0.8, 0.16)!;
  // beside: 2 x 0.25 x 0.8; under: 0.5 x 0.4
  assert.ok(Math.abs(frontArea(g) - (0.4 + 0.2)) < 1e-6, `front ${frontArea(g)}`);
});
test("an arched doorway leaves the wall over its arch", () => {
  const arch: [number, number][] = [[-0.5, 0], [0.5, 0], [0.5, 0.92], ...Array.from({ length: 17 }, (_, i) => [Math.cos((i / 16) * Math.PI) * 0.5, 0.92 + Math.sin((i / 16) * Math.PI) * 0.5] as [number, number]).slice(1, -1), [-0.5, 0.92]];
  const g = piercedWall(holeOf(arch, 48), 2.4, 0.16)!;
  const opening = 0.92 + (Math.PI * 0.25) / 2;
  assert.ok(Math.abs(frontArea(g) - (2.4 - opening)) < 0.01, `front ${frontArea(g)} want ${2.4 - opening}`);
});
test("a piece bent onto a round room's curve stays on the curve", () => {
  const o = outline(6, 6, radiiOf("round", 6, 6));
  const s0 = 1.2;
  const flat = new THREE.BoxGeometry(1, 1, 0.0001, 8, 1, 1).toNonIndexed();
  const bent = bendAlong(flat, o, s0, 1);
  const base = outlineAt(o, s0);
  const p = bent.getAttribute("position");
  const [ax, az] = [base.t, base.n];
  for (let i = 0; i < p.count; i++) {
    // back from the point's frame to the room's plan: every point is on the circle (radius 3 about the middle)
    const [x, z] = [p.getX(i), p.getZ(i)];
    const wx = base.p[0] + x * ax[0] + z * az[0];
    const wz = base.p[1] + x * ax[1] + z * az[1];
    assert.ok(Math.abs(Math.hypot(wx - 3, wz - 3) - 3) < 1e-3, `point ${i} at ${Math.hypot(wx - 3, wz - 3)}`);
  }
});

test("a wall's texture is laid out in its building's frame: two boxes meeting in one plane get the same coordinates there", () => {
  // a wall seen from room A (its own middle at x = 5) and from room B (its middle at x = 9) that meet at x = 7
  const a = boxUV(new THREE.BoxGeometry(4, 2, 0.2).toNonIndexed(), 0.5, [5, 1, 0]);
  const b = boxUV(new THREE.BoxGeometry(4, 2, 0.2).toNonIndexed(), 0.5, [9, 1, 0]);
  const at = (g: THREE.BufferGeometry, x: number, y: number) => {
    const [p, uv, n] = [g.getAttribute("position"), g.getAttribute("uv"), g.getAttribute("normal")];
    for (let i = 0; i < p.count; i++) if (n.getZ(i) > 0.5 && Math.abs(p.getX(i) + (g === a ? 5 : 9) - x) < 1e-6 && Math.abs(p.getY(i) + 1 - y) < 1e-6) return [uv.getX(i), uv.getY(i)];
    return null;
  };
  assert.deepEqual(at(a, 7, 2), at(b, 7, 2));
  assert.ok(at(a, 7, 2));
});
