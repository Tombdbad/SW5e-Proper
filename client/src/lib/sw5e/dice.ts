
/**
 * Roll a die with the specified number of sides.
 * 
 * @param quantity The number of dice to roll
 * @param sides The number of sides on each die
 * @returns An array of the individual results
 */
export function rollDice(quantity: number, sides: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < quantity; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  return results;
}

/**
 * Sum the results of dice rolls
 * 
 * @param results Array of dice roll results
 * @returns Sum of all dice
 */
export function sumDiceResults(results: number[]): number {
  return results.reduce((sum, roll) => sum + roll, 0);
}

/**
 * Roll a die with advantage (roll twice, take the higher result).
 * 
 * @param sides The number of sides on the die
 * @returns The higher result of two dice rolls
 */
export function rollWithAdvantage(sides: number): number {
  const roll1 = sumDiceResults(rollDice(1, sides));
  const roll2 = sumDiceResults(rollDice(1, sides));
  return Math.max(roll1, roll2);
}

/**
 * Roll a die with disadvantage (roll twice, take the lower result).
 * 
 * @param sides The number of sides on the die
 * @returns The lower result of two dice rolls
 */
export function rollWithDisadvantage(sides: number): number {
  const roll1 = sumDiceResults(rollDice(1, sides));
  const roll2 = sumDiceResults(rollDice(1, sides));
  return Math.min(roll1, roll2);
}

/**
 * Roll an ability check with the given modifier.
 * 
 * @param modifier The bonus to add to the roll
 * @param advantage Whether to roll with advantage, disadvantage, or neither
 * @returns The result of the roll
 */
export function rollAbilityCheck(
  modifier: number,
  advantage: "advantage" | "disadvantage" | "normal" = "normal"
): number {
  let baseRoll: number;
  
  if (advantage === "advantage") {
    baseRoll = rollWithAdvantage(20);
  } else if (advantage === "disadvantage") {
    baseRoll = rollWithDisadvantage(20);
  } else {
    baseRoll = sumDiceResults(rollDice(1, 20));
  }
  
  return baseRoll + modifier;
}

/**
 * Roll initiative for combat.
 * 
 * @param dexModifier The dexterity modifier to add to the roll
 * @param advantage Whether to roll with advantage
 * @returns The initiative value
 */
export function rollInitiative(
  dexModifier: number,
  advantage: boolean = false
): number {
  if (advantage) {
    return rollWithAdvantage(20) + dexModifier;
  }
  return sumDiceResults(rollDice(1, 20)) + dexModifier;
}

/**
 * Roll damage for an attack.
 * 
 * @param diceCount Number of dice to roll
 * @param diceSides Number of sides on each die
 * @param modifier Bonus damage to add
 * @param critical Whether this is a critical hit (doubles dice)
 * @returns The total damage
 */
export function rollDamage(
  diceCount: number,
  diceSides: number,
  modifier: number = 0,
  critical: boolean = false
): number {
  // Critical hits roll dice twice
  const effectiveDiceCount = critical ? diceCount * 2 : diceCount;
  
  return sumDiceResults(rollDice(effectiveDiceCount, diceSides)) + modifier;
}

/**
 * Roll a saving throw.
 * 
 * @param modifier The bonus to add to the roll
 * @param advantage Whether to roll with advantage, disadvantage, or neither
 * @param dcValue The difficulty class to beat
 * @returns Whether the save succeeded
 */
export function rollSavingThrow(
  modifier: number,
  advantage: "advantage" | "disadvantage" | "normal" = "normal",
  dcValue: number
): boolean {
  const rollResult = rollAbilityCheck(modifier, advantage);
  return rollResult >= dcValue;
}

/**
 * Generate ability scores for a character using the 4d6 drop lowest method.
 * 
 * @returns An array of 6 ability scores
 */
export function generateAbilityScores(): number[] {
  const scores: number[] = [];
  
  for (let i = 0; i < 6; i++) {
    // Roll 4d6
    const rolls = rollDice(4, 6);
    
    // Sort and drop the lowest value
    rolls.sort((a, b) => a - b);
    
    // Sum the highest 3 values
    const score = rolls[1] + rolls[2] + rolls[3];
    scores.push(score);
  }
  
  return scores;
}

/**
 * Roll dice and return results according to standard dice notation
 * @param diceNotation Dice notation (e.g., "2d6+3")
 * @returns Object containing the total and individual roll results
 */
export function rollDiceNotation(diceNotation: string): { total: number; rolls: number[]; modifier: number } {
  // Parse the dice notation
  const regex = /(\d+)d(\d+)(?:([+-])(\d+))?/;
  const match = diceNotation.match(regex);
  
  if (!match) {
    throw new Error(`Invalid dice notation: ${diceNotation}`);
  }
  
  const quantity = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const hasModifier = match[3] !== undefined;
  const modifierType = hasModifier ? match[3] : '+';
  const modifierValue = hasModifier ? parseInt(match[4]) : 0;
  const modifier = modifierType === '+' ? modifierValue : -modifierValue;
  
  // Roll the dice
  const rolls = rollDice(quantity, sides);
  
  // Calculate the total
  const total = sumDiceResults(rolls) + modifier;
  
  return {
    total,
    rolls,
    modifier
  };
}

// ---------- Rolls thrown on the table ----------
// A roll the player makes is thrown on the dice-roller page. The logic that needs it runs from the
// start each time a die is not thrown yet (NeedDice); the state is put back first, so only the run
// that finishes is kept. Each run reads the same faces in the same order, so the result matches them.
export type TableDie = "d3" | "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export class NeedDice extends Error {
  constructor(readonly dice: TableDie[], readonly label: string) {
    super(`${dice.length} die(s) needed for ${label}`);
  }
}

let table: { faces: number[]; cursor: number } | null = null;

// The faces thrown for the next dice the logic reads, or a random roll when no table is in use
export function playerRoll(quantity: number, sides: number, label: string): number[] {
  if (!table) return rollDice(quantity, sides);
  const from = table.cursor;
  const to = from + quantity;
  if (to > table.faces.length) {
    throw new NeedDice(Array.from({ length: to - table.faces.length }, () => `d${sides}` as TableDie), label);
  }
  table.cursor = to;
  return table.faces.slice(from, to);
}

// One synchronous run of the action. Math.random is replayed from `randoms` (the values drawn so far, in
// order), so a run that goes on from where the last one stopped sees the same draws; the other dice a
// run reads (enemy AI, the prepared dice) therefore do not change between runs. Returns the missing dice.
function runOnce(act: () => void, faces: number[], randoms: number[]): NeedDice | undefined {
  table = { faces, cursor: 0 };
  const real = Math.random;
  let at = 0;
  Math.random = () => {
    if (at < randoms.length) return randoms[at++];
    const r = real();
    randoms.push(r);
    at++;
    return r;
  };
  try {
    act();
    return undefined;
  } catch (e) {
    if (e instanceof NeedDice) return e;
    throw e;
  } finally {
    table = null;
    Math.random = real;
  }
}

/**
 * Runs `act` with the player's dice thrown on the table. `save` copies the store's data, `restore`
 * puts a copy back, and `request` throws the dice a roll needs (its promise gives their faces).
 */
export async function throwFor<S>(
  act: () => void,
  state: { save: () => S; restore: (saved: S) => void; request: (label: string, dice: TableDie[]) => Promise<number[]> }
): Promise<void> {
  const saved = state.save();
  let faces: number[] = [];
  const randoms: number[] = [];
  for (;;) {
    const missing = runOnce(act, faces, randoms);
    if (!missing) return;
    state.restore(saved);
    faces = [...faces, ...(await state.request(missing.label, missing.dice))];
  }
}

// The dice-roller page throws d4 to d20 only: a d3 is thrown as a d6, a d100 as two d10s (tens, then units)
export type PageDie = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
const PAGE_ORDER: PageDie[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

export function pageDice(dice: TableDie[]): PageDie[] {
  return dice.flatMap((d): PageDie[] => (d === "d3" ? ["d6"] : d === "d100" ? ["d10", "d10"] : [d as PageDie]));
}

// The page builds its dice by type in PAGE_ORDER, in request order within a type, and reports its faces in that order
function pageOrder(dice: PageDie[]): number[] {
  return dice.map((_, i) => i).sort((a, b) => PAGE_ORDER.indexOf(dice[a]) - PAGE_ORDER.indexOf(dice[b]) || a - b);
}

// The faces the page reported (in its order), read back as the dice that were asked for
export function faceValues(dice: TableDie[], reported: number[]): number[] {
  const raw: number[] = [];
  pageOrder(pageDice(dice)).forEach((index, k) => {
    raw[index] = reported[k];
  });
  let at = 0;
  return dice.map((d) => {
    if (d === "d3") return Math.ceil(raw[at++] / 2);
    if (d === "d100") {
      const tens = raw[at++];
      const units = raw[at++];
      return tens * 10 + units || 100;
    }
    const face = raw[at++];
    return d === "d10" && face === 0 ? 10 : face;
  });
}
