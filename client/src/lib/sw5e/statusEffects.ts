
import { Combatant } from "../../stores/useCombat";

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  duration: number | "permanent";
  onApply?: (target: Combatant) => void;
  onRemove?: (target: Combatant) => void;
  onTurnStart?: (target: Combatant) => void;
  onTurnEnd?: (target: Combatant) => void;
}

export interface StatusEffectManager {
  applyEffect: (targetId: string, effect: StatusEffect) => void;
  removeEffect: (targetId: string, effectId: string) => void;
  getEffects: (targetId: string) => StatusEffect[];
}
