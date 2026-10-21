import { test } from "node:test";
import assert from "node:assert/strict";
import { pageDice, faceValues, playerRoll, throwFor, type TableDie } from "../../client/src/lib/sw5e/dice";

test("a d3 is thrown as a d6 and a d100 as two d10s", () => {
  assert.deepEqual(pageDice(["d3", "d100", "d20"]), ["d6", "d10", "d10", "d20"]);
});

test("the faces come back in the order of the dice asked for", () => {
  // The page builds d6, d10, d10, d10, d20 (by type, request order within a type) and reports them in that order
  const asked: TableDie[] = ["d3", "d100", "d20", "d10"];
  assert.deepEqual(faceValues(asked, [2, 3, 7, 0, 17]), [1, 37, 17, 10]);
});

test("a d100 of 00 and 0 is 100, and a d10 face 0 is 10", () => {
  assert.deepEqual(faceValues(["d100"], [0, 0]), [100]);
  assert.deepEqual(faceValues(["d10"], [0]), [10]);
});

test("the faces of a d4 and a d20 asked in that order are read back from the page's order", () => {
  // The page builds the d4 first, whatever the request order
  assert.deepEqual(faceValues(["d20", "d4"], [1, 17]), [17, 1]);
});

test("without a table a roll is random within its sides", () => {
  for (let i = 0; i < 50; i++) {
    const [d] = playerRoll(1, 20, "Attack roll");
    assert.ok(d >= 1 && d <= 20);
  }
});

test("throwFor runs the action again with the thrown faces, and only the last run is kept", async () => {
  let state = { hp: 10 };
  const requests: Array<[string, TableDie[]]> = [];
  const thrown: number[][] = [[15], [4, 6]];
  let results: number[] = [];
  const act = () => {
    state.hp -= 1;
    const [attack] = playerRoll(1, 20, "Attack roll");
    results = attack >= 10 ? [attack, ...playerRoll(2, 6, "Damage roll")] : [attack];
  };
  await throwFor(act, {
    save: () => ({ ...state }),
    restore: (saved) => {
      state = { ...saved };
    },
    request: async (label, dice) => {
      requests.push([label, dice]);
      return thrown.shift()!;
    },
  });
  assert.deepEqual(requests, [
    ["Attack roll", ["d20"]],
    ["Damage roll", ["d6", "d6"]],
  ]);
  assert.deepEqual(results, [15, 4, 6]);
  assert.equal(state.hp, 9);
});

test("the other random draws replay too, so every run takes the branch the thrown dice were for", async () => {
  // An enemy's choice is drawn before the player's dice; a run that drew differently would throw different dice
  const branches: string[] = [];
  let state = { hp: 10 };
  const requests: Array<[string, TableDie[]]> = [];
  const thrown: number[][] = [[9], [4]];
  const act = () => {
    state.hp -= 1;
    const special = Math.random() < 0.5;
    branches.push(special ? "special" : "plain");
    const [attack] = playerRoll(1, 20, "Attack roll");
    if (special && attack >= 1) playerRoll(1, 6, "Save");
  };
  await throwFor(act, {
    save: () => ({ ...state }),
    restore: (saved) => {
      state = { ...saved };
    },
    request: async (label, dice) => {
      requests.push([label, dice]);
      return thrown.shift() ?? [1];
    },
  });
  assert.ok(branches.length >= 2);
  assert.ok(branches.every((b) => b === branches[0]), `branches differ: ${branches.join(",")}`);
  assert.equal(requests.length, branches[0] === "special" ? 2 : 1);
  assert.equal(state.hp, 9);
});
