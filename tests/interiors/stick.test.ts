import test from "node:test";
import assert from "node:assert/strict";
import { DEAD, EXPO, FULL, GRID_DIRS, gridSteps, groundPush, paceOf, RUN_SPEED, shaped, STICK, stickOf, stickWalk, WALK_FACTOR, type Walk } from "../../client/src/components/Map/interiors/stick";
import { lookDirection, rightOf } from "../../client/src/components/Map/interiors/aim";

test("the stick is a tenth smaller than it was (176 px), still big enough for a thumb, and its knob fits in it", () => {
  assert.equal(STICK.size, Math.round(176 * 0.9));
  assert.equal(STICK.knob, Math.round(64 * 0.9));
  assert.equal(STICK.travel, Math.round(56 * 0.9));
  assert.ok(STICK.size >= 150);
  assert.ok(STICK.knob * 0.5 + STICK.travel <= STICK.size / 2 + 1e-9, "the knob stays inside the pad");
  assert.equal(STICK.radius, STICK.size / 2);
});

test("the response is dead in the middle, nearly straight, and full a little before the rim", () => {
  assert.equal(shaped(0), 0);
  assert.equal(shaped(DEAD * 0.9), 0);
  assert.ok(Math.abs(shaped(1) - 1) < 1e-9, "full deflection is full speed");
  assert.ok(Math.abs(shaped(FULL) - 1) < 1e-9, "and so is the part of the way FULL");
  let last = 0;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const v = shaped(d);
    assert.ok(v >= last - 1e-12, `non-decreasing at ${d}`);
    last = v;
  }
  // It used to be a quarter of the speed at half the stick, which was the crawl: half the stick is now about half the speed
  assert.ok(shaped(0.5) > 0.4 && shaped(0.5) < 0.6, `half deflection is ${shaped(0.5)} of the speed`);
  assert.ok(shaped(0.25) > 0.1 && shaped(0.25) < 0.3, `a quarter is ${shaped(0.25)}`);
  // With no expo it is a straight line past the dead zone
  assert.ok(Math.abs(shaped(0.5, 0) - (0.5 - DEAD) / (FULL - DEAD)) < 1e-9);
  assert.ok(EXPO >= 0 && EXPO < 0.5);
});

test("walking is a little slower than running, and running is the party's old speed", () => {
  assert.equal(RUN_SPEED, 7);
  assert.equal(paceOf(1, true), 1);
  assert.ok(Math.abs(paceOf(1, false) - WALK_FACTOR) < 1e-9);
  assert.ok(WALK_FACTOR > 0.7 && WALK_FACTOR < 1);
  assert.ok(Math.abs(paceOf(0.5, false) - paceOf(0.5, true) * WALK_FACTOR) < 1e-9);
  assert.equal(paceOf(0.05, true), 0);
  // A thumb at ordinary pressure (half the pad) walks at least two squares a second even on Walk, and runs at three or more
  assert.ok(paceOf(0.5, false) * RUN_SPEED >= 2.5, `${paceOf(0.5, false) * RUN_SPEED} squares a second`);
  assert.ok(paceOf(0.5, true) * RUN_SPEED >= 3, `${paceOf(0.5, true) * RUN_SPEED} squares a second`);
});

test("a thumb on the pad is a stick of up to 1 in the direction pointed, up being forward", () => {
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.deepEqual(stickOf(0, 0), [0, 0]);
  assert.ok(near(stickOf(0, -STICK.travel), [0, 1]), "up is forward");
  assert.ok(near(stickOf(0, STICK.travel), [0, -1]), "down is back");
  assert.ok(near(stickOf(STICK.travel, 0), [1, 0]), "right is strafe right");
  assert.ok(near(stickOf(-STICK.travel / 2, 0), [-0.5, 0]), "half way left");
  // Past the travel (a thumb at the rim of the pad) the stick stays 1 long, in the same direction
  const [sx, sy] = stickOf(STICK.radius, -STICK.radius);
  assert.ok(Math.abs(Math.hypot(sx, sy) - 1) < 1e-9);
  assert.ok(sx > 0 && sy > 0 && Math.abs(sx - sy) < 1e-9);
});

test("the push on the ground agrees with where the camera looks, at every heading", () => {
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += Math.PI / 12) {
    const [f, r] = [lookDirection(yaw, 0), rightOf(yaw)];
    const [fx, fz] = groundPush(1, 0, yaw);
    const [rx, rz] = groundPush(0, 1, yaw);
    assert.ok(Math.abs(fx - f.x) < 1e-9 && Math.abs(fz - f.z) < 1e-9, `forward at ${yaw}`);
    assert.ok(Math.abs(rx - r.x) < 1e-9 && Math.abs(rz - r.z) < 1e-9, `right at ${yaw}`);
  }
  // Looking along +z (yaw 0), forward is +z and the right hand is -x; turned a quarter to look along +x, forward is +x and right is +z
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(groundPush(1, 0, 0), [0, 1]));
  assert.ok(near(groundPush(0, 1, 0), [-1, 0]));
  assert.ok(near(groundPush(1, 0, Math.PI / 2), [1, 0]));
  assert.ok(near(groundPush(0, 1, Math.PI / 2), [0, 1]));
  assert.ok(near(groundPush(-1, 0, Math.PI), [0, 1]), "back, looking along -z, is +z");
});

test("a push is a step to the nearest of the eight directions, and gives way to its neighbours, not to the other side of the compass", () => {
  assert.deepEqual(gridSteps(0, 0), []);
  assert.deepEqual(gridSteps(0, 1)[0], [0, 1]);
  assert.deepEqual(gridSteps(1, 0)[0], [1, 0]);
  assert.deepEqual(gridSteps(-1, -1)[0], [-1, -1]);
  assert.deepEqual(gridSteps(0.3, 1)[0], [0, 1], "17 degrees off straight on is still straight on");
  assert.deepEqual(gridSteps(1, 1)[0], [1, 1]);
  // The turn from one direction to the next happens half way between them, 22.5 degrees
  assert.deepEqual(gridSteps(Math.tan((20 * Math.PI) / 180), 1)[0], [0, 1]);
  assert.deepEqual(gridSteps(Math.tan((25 * Math.PI) / 180), 1)[0], [1, 1]);
  // Every one of the eight comes up for a push straight at it, and the first choice never differs from the push by more than 22.5 degrees
  GRID_DIRS.forEach((d, i) => assert.deepEqual(gridSteps(Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4))[0], d, `direction ${i}`));
  for (let a = 0; a < 360; a += 3) {
    const [dx, dz] = [Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)];
    const [mx, my] = gridSteps(dx, dz)[0];
    const off = (Math.acos((dx * mx + dz * my) / Math.hypot(mx, my)) * 180) / Math.PI;
    assert.ok(off <= 22.5 + 1e-6, `${a} degrees steps ${off.toFixed(1)} degrees off`);
    for (const [sx, sy] of gridSteps(dx, dz)) {
      const o = (Math.acos((dx * sx + dz * sy) / Math.hypot(sx, sy)) * 180) / Math.PI;
      assert.ok(o <= 90 + 1e-6, `${a} degrees never tries ${o.toFixed(0)} degrees away`);
    }
  }
  // A diagonal slides along a wall: its two straight steps, the one the push leans toward first
  assert.deepEqual(gridSteps(1, 0.8), [[1, 1], [1, 0], [0, 1]]);
  assert.deepEqual(gridSteps(0.8, 1), [[1, 1], [0, 1], [1, 0]]);
  // A straight one tries the diagonals either side, the nearer first
  assert.deepEqual(gridSteps(0.2, 1), [[0, 1], [1, 1], [-1, 1]]);
  assert.deepEqual(gridSteps(-0.2, 1), [[0, 1], [-1, 1], [1, 1]]);
});

test("turning the stick turns the party: the same thumb, looking another way, steps another way", () => {
  // A thumb forward and a bit right, looking along each of the four walls
  const expected: [number, [number, number]][] = [[0, [0, 1]], [Math.PI / 2, [1, 0]], [Math.PI, [0, -1]], [-Math.PI / 2, [-1, 0]]];
  for (const [yaw, step] of expected) {
    const [px, pz] = groundPush(1, 0, yaw);
    assert.deepEqual(gridSteps(px, pz)[0], step, `forward at yaw ${yaw}`);
  }
  // Strafe right at yaw 0 goes -x
  const [sx, sz] = groundPush(0, 1, 0);
  assert.deepEqual(gridSteps(sx, sz)[0], [-1, 0]);
});

// A room 12 squares across with a wall along its north edge (y < 1 is wall) and a pillar at (6, 6)
const room = (x: number, y: number) => x >= 0 && y >= 1 && x < 12 && y < 12 && !(x === 6 && y === 6);

test("the stick queues the square being entered and one more, and never a long queue", () => {
  let walk: Walk | null = null;
  const feet = { x: 2, y: 5 };
  for (let frame = 0; frame < 6; frame++) {
    walk = stickWalk(walk, feet, 1, 0, 0.8, room);
    assert.ok(walk && walk.path.length <= 2, `${walk?.path.length} squares queued`);
    // (the square being entered is reached after each frame, as the map's walk does it)
    if (walk!.path.length > 1) { feet.x = walk!.path[0].x; feet.y = walk!.path[0].y; walk!.path.shift(); }
  }
  assert.ok(feet.x >= 6 || feet.x === 5, `walked east to ${feet.x}`);
  assert.equal(walk!.pace, 0.8);
});

test("a turn of the stick shows in the very next square; a walk begun by a tap gives way to it", () => {
  // Sent a long way by a tap (to the east, with something to do on arriving), the party is pushed north-west
  const tap: Walk = { path: [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }], then: () => {}, total: 5 };
  const walk = stickWalk(tap, { x: 2.4, y: 5 }, -1, -1, 1, room)!;
  assert.deepEqual(walk.path, [{ x: 3, y: 5 }, { x: 2, y: 4 }], "the square being entered is kept, the next goes the way pushed");
  assert.equal(walk.then, undefined, "the tap's errand is dropped");
  assert.equal(walk.total, 2);
  // And turned again, it is only the square after that which changes
  const again = stickWalk(walk, { x: 2.6, y: 5 }, 0, 1, 1, room)!;
  assert.deepEqual(again.path, [{ x: 3, y: 5 }, { x: 3, y: 6 }]);
});

test("a wall is slid along, not walked into, and a pillar is gone round", () => {
  // At the north wall, pushed north-east: the diagonal needs both its straight squares open, so the walk goes east along the wall
  assert.deepEqual(stickWalk(null, { x: 4, y: 1 }, 1, -1, 1, room)!.path, [{ x: 5, y: 1 }]);
  // Straight into it: nothing, the party stands (the old walk, here none)
  assert.equal(stickWalk(null, { x: 4, y: 1 }, 0, -1, 1, room), null);
  // A little off straight into the wall, leaning east: still nothing, the diagonal past a wall is not allowed either
  assert.equal(stickWalk(null, { x: 4, y: 1 }, 0.3, -1, 1, room), null);
  // Straight at the pillar from the west, the party stands; pushed past its corner, it slides round by the open square
  assert.equal(stickWalk(null, { x: 5, y: 6 }, 1, 0, 1, room), null);
  assert.deepEqual(stickWalk(null, { x: 5, y: 6 }, 1, -1, 1, room)!.path, [{ x: 5, y: 5 }]);
});

test("the stair rule is asked of every step, and of the straight ones of a diagonal", () => {
  const asked: string[] = [];
  const rule = (a: { x: number; y: number }, b: { x: number; y: number }) => { asked.push(`${a.x},${a.y}>${b.x},${b.y}`); return true; };
  stickWalk(null, { x: 3, y: 5 }, 1, 1, 1, room, rule);
  assert.deepEqual(asked, ["3,5>4,6", "3,5>4,5", "3,5>3,6"]);
  // A rule that forbids the diagonal's straight steps sends the party along the other one or nowhere
  const only = (a: { x: number; y: number }, b: { x: number; y: number }) => b.y === a.y;
  assert.deepEqual(stickWalk(null, { x: 3, y: 5 }, 1, 1, 1, room, only)!.path.length, 1);
});
