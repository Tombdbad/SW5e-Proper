// The shooter mode has no top-down view (the user, 2026-10-29)
import test from "node:test";
import assert from "node:assert/strict";
import { coerceView, useView, viewsFor } from "../../client/src/components/Map/interiors/aim";

test("the tabletop has all three views, the shooter mode only the two seen from the character", () => {
  assert.deepEqual(viewsFor(false), ["overhead", "shoulder", "first"]);
  assert.deepEqual(viewsFor(true), ["shoulder", "first"]);
  assert.equal(coerceView("overhead", true), "shoulder");
  assert.equal(coerceView("first", true), "first");
  assert.equal(coerceView("overhead", false), "overhead");
});

test("turning the shooter mode on leaves the overhead view at once and V never comes back to it; turning it off lets it return", () => {
  useView.setState({ mode: "overhead", shooter: false });
  useView.getState().setShooter(true);
  assert.equal(useView.getState().mode, "shoulder");
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    useView.getState().next();
    seen.add(useView.getState().mode);
  }
  assert.deepEqual([...seen].sort(), ["first", "shoulder"]);
  useView.getState().set("overhead");
  assert.equal(useView.getState().mode, "shoulder", "asked for the overhead view, it is refused");
  useView.getState().setShooter(false);
  useView.getState().set("overhead");
  assert.equal(useView.getState().mode, "overhead");
});
