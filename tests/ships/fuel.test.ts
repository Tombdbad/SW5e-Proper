// Low fuel and the tanker (house rules, shared/logic "Low fuel"), and the fuel attendant's refuelling in the trade panel:
// a ship with fuel flies as before; a ship with none limps (any trip, LIMP_FACTOR times the time, no fuel burnt); a tanker's
// fee is its call-out and the fuel it brings, at the size's price; the attendant's wares say so.
import test from "node:test";
import assert from "node:assert/strict";
import { shipForTrip, isLowFuel, fuelAfter, tankerCall, TANKER, waresOf, type PartyShip, type Exit } from "../../shared/logic/index";

const exit = (fuel: number): Exit => ({ to: "b", via: "path", label: "Fly to", travel: "2 hours", fuel } as Exit);
const ship = (id: string, fuel: number) => ({ id, name: id, areaId: "here", fuel, hyperdriveClass: 1 } as unknown as PartyShip);

test("a ship with the fuel for a trip is chosen as before", () => {
  const r = shipForTrip([ship("a", 3)], "here", exit(2));
  assert.equal(r.ship?.id, "a");
  assert.equal(r.reason, "");
});

test("a ship with no fuel limps: any trip is allowed, and it is low on fuel", () => {
  const dry = ship("dry", 0);
  const r = shipForTrip([dry], "here", exit(2));
  assert.equal(r.ship?.id, "dry");
  assert.equal(isLowFuel(dry), true);
  assert.equal(isLowFuel(ship("ok", 1)), false);
});

test("a ship that has some fuel, but not enough, is not chosen (it does not limp)", () => {
  const r = shipForTrip([ship("short", 1)], "here", exit(2));
  assert.equal(r.ship, undefined);
  assert.equal(r.reason, "your ship is out of fuel");
});

test("a fuelled ship is preferred to a dry one", () => {
  const r = shipForTrip([ship("dry", 0), ship("full", 4)], "here", exit(2));
  assert.equal(r.ship?.id, "full");
});

test("a trip burns the fuel it needs, and a limping ship burns none", () => {
  assert.equal(fuelAfter(ship("a", 5), 2), 3);
  assert.equal(fuelAfter(ship("dry", 0), 2), 0);
});

test("a tanker costs its call-out and the fuel it brings, at the size's price", () => {
  const call = tankerCall(100, 10);
  assert.equal(call.units, TANKER.units);
  assert.equal(call.fee, (TANKER.callOut + TANKER.units) * 100);
  assert.equal(call.minutes, TANKER.hours * 60);
});

test("a tanker never brings more fuel than the ship holds", () => {
  const call = tankerCall(100, 1);
  assert.equal(call.units, 1);
  assert.equal(call.fee, (TANKER.callOut + 1) * 100);
});

test("the fuel attendant sells the fuel and ship service, not goods", () => {
  const attendant = { role: "fuel attendant", trade: undefined, disposition: "neutral" } as const;
  const wares = waresOf(attendant);
  assert.equal(wares?.label, "Fuel and ship service");
  assert.deepEqual(wares?.categories, []);
});
