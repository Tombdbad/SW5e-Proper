import { CombatantType } from "../stores/useCombat";
import { rollDice } from "./dice";
import type { StarshipCombatant, VehicleCombatant } from "../stores/useCombat";

export class StarshipCombatManager {
  calculateInitiative(ship: StarshipCombatant): number {
    const pilotMod = ship.crew.pilot.modifier;
    return rollDice(1, 20) + pilotMod;
  }

  handleDamage(ship: StarshipCombatant, damage: number): StarshipCombatant {
    // Apply damage to shields first if available
    let remainingDamage = damage;
    let currentShields = ship.shields.current;
    let currentHull = ship.hullPoints.current;

    if (currentShields > 0) {
      if (currentShields >= remainingDamage) {
        currentShields -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= currentShields;
        currentShields = 0;
      }
    }

    // Apply remaining damage to hull
    if (remainingDamage > 0) {
      currentHull = Math.max(0, currentHull - remainingDamage);
    }

    return {
      ...ship,
      shields: { ...ship.shields, current: currentShields },
      hullPoints: { ...ship.hullPoints, current: currentHull },
    };
  }

  regenerateShields(ship: StarshipCombatant): StarshipCombatant {
    const newShieldValue = Math.min(
      ship.shields.max,
      ship.shields.current + ship.shields.regen,
    );

    return {
      ...ship,
      shields: { ...ship.shields, current: newShieldValue },
    };
  }

  calculateAttackRoll(ship: StarshipCombatant): number {
    const gunnerMod = ship.crew.gunner.modifier;
    return rollDice(1, 20) + gunnerMod;
  }
}

export class VehicleCombatManager {
  calculateInitiative(vehicle: VehicleCombatant): number {
    const driverMod = vehicle.crew.driver.modifier;
    return rollDice(1, 20) + driverMod;
  }

  handleDamage(vehicle: VehicleCombatant, damage: number): VehicleCombatant {
    const newHitPoints = Math.max(0, vehicle.hitPoints.current - damage);

    return {
      ...vehicle,
      hitPoints: { ...vehicle.hitPoints, current: newHitPoints },
    };
  }

  calculateAttackRoll(vehicle: VehicleCombatant): number {
    if (!vehicle.crew.gunner) return 0;
    const gunnerMod = vehicle.crew.gunner.modifier;
    return rollDice(1, 20) + gunnerMod;
  }

  calculateEvasion(vehicle: VehicleCombatant): number {
    const driverMod = vehicle.crew.driver.modifier;
    return rollDice(1, 20) + driverMod;
  }
}
