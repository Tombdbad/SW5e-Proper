// client/src/lib/sw5e/rules.ts
export const calculateModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

export const calculateProficiencyBonus = (level: number): number => {
  return Math.floor((level - 1) / 4) + 2;
};

export const calculateMaxPowerPoints = (
  level: number,
  abilityModifier: number,
): number => {
  const basePowerPoints = [
    0, 4, 6, 14, 17, 27, 32, 38, 44, 57, 64, 73, 73, 83, 83, 94, 94, 107, 114,
    123, 133,
  ];
  return basePowerPoints[level] + abilityModifier;
};

export const calculateMaxPowerLevel = (level: number): number => {
  if (level < 3) return 1;
  if (level < 5) return 2;
  if (level < 7) return 3;
  if (level < 9) return 4;
  if (level < 11) return 5;
  if (level < 13) return 6;
  if (level < 15) return 7;
  if (level < 17) return 8;
  return 9;
};

export const calculateHitPoints = (
  level: number,
  hitDie: number,
  constitutionModifier: number,
): number => {
  // Max HP at level 1, average for subsequent levels
  if (level <= 1) return hitDie + constitutionModifier;

  // For level > 1, use average roll + constitution modifier per level
  const averageHitDieRoll = Math.floor(hitDie / 2) + 1;
  const levelOneHP = hitDie + constitutionModifier;
  const additionalLevelsHP =
    (level - 1) * (averageHitDieRoll + constitutionModifier);

  return levelOneHP + additionalLevelsHP;
};

export const calculateArmorClass = (
  dexterityModifier: number,
  armorType: string | null,
  armorBonus: number = 0,
  shieldBonus: number = 0,
): number => {
  if (!armorType) {
    // Unarmored
    return 10 + dexterityModifier + armorBonus;
  }

  switch (armorType.toLowerCase()) {
    case "light":
      return 12 + dexterityModifier + armorBonus + shieldBonus;
    case "medium":
      return 14 + Math.min(2, dexterityModifier) + armorBonus + shieldBonus;
    case "heavy":
      return 16 + armorBonus + shieldBonus; // No DEX bonus with heavy armor
    case "powered":
      return 18 + armorBonus + shieldBonus; // No DEX bonus with powered armor
    default:
      return 10 + dexterityModifier + armorBonus + shieldBonus;
  }
};

export const calculateInitiative = (
  dexterityModifier: number,
  bonuses: number = 0,
): number => {
  return dexterityModifier + bonuses;
};

export const calculatePassiveSkill = (
  abilityModifier: number,
  proficient: boolean = false,
  expertise: boolean = false,
  proficiencyBonus: number,
): number => {
  let total = 10 + abilityModifier;

  if (proficient) {
    total += proficiencyBonus;
  }

  if (expertise) {
    total += proficiencyBonus;
  }

  return total;
};

export const getAbilityModifiers = (
  abilities: Record<string, number>,
): Record<string, number> => {
  const modifiers: Record<string, number> = {};

  Object.entries(abilities).forEach(([ability, score]) => {
    modifiers[ability] = calculateModifier(score);
  });

  return modifiers;
};

export const pointBuyCost = (score: number): number => {
  // Standard point buy costs
  const costs: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
  };

  return costs[score] || 0;
};

export const calculateTotalPointBuyPoints = (
  abilities: Record<string, number>,
): number => {
  return Object.values(abilities).reduce(
    (total, score) => total + pointBuyCost(score),
    0,
  );
};

export const MAX_POINT_BUY_POINTS = 27;
