
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
