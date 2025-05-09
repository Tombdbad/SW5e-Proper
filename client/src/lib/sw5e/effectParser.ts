
// Natural Language Effect Processor for SW5E
import { StatusEffect } from './statusEffects';
import { Combatant } from '../../stores/useCombat';

// Key effect patterns to look for in descriptions
interface EffectPattern {
  regex: RegExp;
  processor: (matches: RegExpMatchArray, sourceId?: string) => Partial<StatusEffect>;
}

export class EffectParser {
  private patterns: EffectPattern[] = [];
  
  constructor() {
    this.initializePatterns();
  }
  
  // Add all regex patterns for common effect types
  private initializePatterns(): void {
    // Charmed condition
    this.patterns.push({
      regex: /charmed:?\s(.*?)(?:\.|\n|$)/i,
      processor: (matches, sourceId) => ({
        id: 'charmed',
        name: 'Charmed',
        description: matches[1],
        duration: this.extractDuration(matches[1]) || 1,
        onApply: (target: Combatant) => {
          // Track the source of the charm
          target.conditions = target.conditions || {};
          target.conditions.charmedBy = sourceId;
        },
        // Block attacks against the charmer
        onTurnStart: (target: Combatant) => {
          console.log(`${target.name} is charmed by ${target.conditions?.charmedBy}`);
        }
      })
    });
    
    // Advantage/disadvantage on checks
    this.patterns.push({
      regex: /(advantage|disadvantage) on (.*?) (?:checks?|saves?|saving throws?|rolls?)/i,
      processor: (matches) => {
        const type = matches[1].toLowerCase();
        const checkType = matches[2].toLowerCase();
        
        return {
          id: `${type}_${checkType.replace(/\s/g, '_')}`,
          name: `${type === 'advantage' ? 'Advantage' : 'Disadvantage'} on ${checkType}`,
          description: matches[0],
          duration: this.extractDuration(matches[0]) || "permanent",
          // This would be used when calculating the check
          // The actual application would depend on your check system
        };
      }
    });
    
    // Damage modifiers
    this.patterns.push({
      regex: /(immunity|resistance|vulnerability) to (.*?) damage/i,
      processor: (matches) => {
        const modType = matches[1].toLowerCase();
        const damageType = matches[2].toLowerCase();
        
        return {
          id: `${modType}_${damageType}`,
          name: `${modType.charAt(0).toUpperCase() + modType.slice(1)} to ${damageType} damage`,
          description: matches[0],
          duration: this.extractDuration(matches[0]) || "permanent",
          // This would be used when calculating damage
        };
      }
    });
    
    // Additional damage
    this.patterns.push({
      regex: /(\d+)d(\d+)(?:\s*\+\s*(\d+))? additional (.*?) damage/i,
      processor: (matches) => {
        const dice = parseInt(matches[1]);
        const sides = parseInt(matches[2]);
        const bonus = matches[3] ? parseInt(matches[3]) : 0;
        const damageType = matches[4].toLowerCase();
        
        return {
          id: `additional_${damageType}_damage`,
          name: `Additional ${damageType} damage`,
          description: matches[0],
          duration: this.extractDuration(matches[0]) || 1,
          onApply: (target: Combatant) => {
            target.additionalDamage = target.additionalDamage || [];
            target.additionalDamage.push({
              type: damageType,
              dice,
              sides,
              bonus
            });
          },
          onRemove: (target: Combatant) => {
            if (!target.additionalDamage) return;
            // Remove this specific damage type
            target.additionalDamage = target.additionalDamage.filter(
              d => d.type !== damageType
            );
          }
        };
      }
    });
    
    // Movement modifiers
    this.patterns.push({
      regex: /(speed|movement) (is|becomes) (\d+|reduced to \d+|reduced by \d+|doubled|halved)/i,
      processor: (matches) => {
        const speedEffect = matches[3].toLowerCase();
        let modifier;
        
        if (speedEffect.includes('reduced by')) {
          const reduction = parseInt(speedEffect.replace('reduced by ', ''));
          modifier = (speed: number) => Math.max(0, speed - reduction);
        } else if (speedEffect.includes('reduced to')) {
          const newSpeed = parseInt(speedEffect.replace('reduced to ', ''));
          modifier = () => newSpeed;
        } else if (speedEffect === 'doubled') {
          modifier = (speed: number) => speed * 2;
        } else if (speedEffect === 'halved') {
          modifier = (speed: number) => Math.floor(speed / 2);
        } else {
          // Direct speed value
          const speed = parseInt(speedEffect);
          modifier = () => speed;
        }
        
        return {
          id: 'movement_modifier',
          name: 'Movement Modifier',
          description: matches[0],
          duration: this.extractDuration(matches[0]) || 1,
          onApply: (target: Combatant) => {
            // Store original speed if not already stored
            if (!target.originalSpeed) {
              target.originalSpeed = target.speed || 30;
            }
            // Apply the modifier
            target.speed = modifier(target.originalSpeed);
          },
          onRemove: (target: Combatant) => {
            // Restore original speed
            if (target.originalSpeed) {
              target.speed = target.originalSpeed;
              delete target.originalSpeed;
            }
          }
        };
      }
    });
    
    // Conditions like "stunned", "prone", etc.
    this.patterns.push({
      regex: /(stunned|prone|blinded|deafened|paralyzed|restrained|incapacitated|frightened)(?::|\.|\s|$)/i,
      processor: (matches) => {
        const condition = matches[1].toLowerCase();
        
        return {
          id: condition,
          name: condition.charAt(0).toUpperCase() + condition.slice(1),
          description: `Target is ${condition}`,
          duration: 1, // Default to 1 round if not specified
          onApply: (target: Combatant) => {
            target.conditions = target.conditions || {};
            target.conditions[condition] = true;
          },
          onRemove: (target: Combatant) => {
            if (target.conditions) {
              target.conditions[condition] = false;
            }
          }
        };
      }
    });
    
    // Rage/berserker type abilities
    this.patterns.push({
      regex: /(rage|fury|berserk|berserker)(?::|\.|\s).*?(advantage on|\\+(\d+) to) (strength|constitution|dexterity|intelligence|wisdom|charisma)/i,
      processor: (matches) => {
        const rageName = matches[1].toLowerCase();
        const effectType = matches[2].toLowerCase().includes('advantage') ? 'advantage' : 'bonus';
        const bonus = effectType === 'bonus' ? parseInt(matches[3]) : 0;
        const ability = matches[4].toLowerCase();
        
        return {
          id: `${rageName}_${ability}`,
          name: `${rageName.charAt(0).toUpperCase() + rageName.slice(1)} ${ability.charAt(0).toUpperCase() + ability.slice(1)}`,
          description: matches[0],
          duration: this.extractDuration(matches[0]) || "permanent",
          onApply: (target: Combatant) => {
            target.abilityModifiers = target.abilityModifiers || {};
            if (effectType === 'advantage') {
              target.abilityModifiers[ability] = { advantage: true };
            } else {
              target.abilityModifiers[ability] = { bonus: bonus };
            }
          },
          onRemove: (target: Combatant) => {
            if (target.abilityModifiers) {
              delete target.abilityModifiers[ability];
            }
          }
        };
      }
    });
    
    // Force-related effects
    this.patterns.push({
      regex: /(light|dark) side points?:?\s(.*?)(?:\.|\n|$)/i,
      processor: (matches) => {
        const side = matches[1].toLowerCase();
        const effect = matches[2];
        
        return {
          id: `${side}_side_point`,
          name: `${side.charAt(0).toUpperCase() + side.slice(1)} Side Point`,
          description: effect,
          duration: "permanent",
          onApply: (target: Combatant) => {
            target.forceAlignment = target.forceAlignment || { light: 0, dark: 0 };
            target.forceAlignment[side as 'light' | 'dark'] += 1;
          },
          onRemove: (target: Combatant) => {
            if (target.forceAlignment) {
              target.forceAlignment[side as 'light' | 'dark'] -= 1;
            }
          }
        };
      }
    });
  }
  
  // Extract duration information from a description
  private extractDuration(text: string): number | "permanent" | null {
    // Look for duration patterns
    const durationPatterns = [
      { regex: /for (\d+) rounds?/i, processor: (m: string[]) => parseInt(m[1]) },
      { regex: /for (\d+) turns?/i, processor: (m: string[]) => parseInt(m[1]) },
      { regex: /for (\d+) minutes?/i, processor: (m: string[]) => parseInt(m[1]) * 10 }, // Assuming 10 rounds per minute
      { regex: /for (\d+) hours?/i, processor: (m: string[]) => parseInt(m[1]) * 600 }, // Assuming 600 rounds per hour
      { regex: /until the end of (its|your|their) next turn/i, processor: () => 1 },
      { regex: /until the start of (its|your|their) next turn/i, processor: () => 1 },
      { regex: /end of combat/i, processor: () => "permanent" },
      { regex: /permanent(ly)?/i, processor: () => "permanent" },
    ];
    
    for (const pattern of durationPatterns) {
      const match = text.match(pattern.regex);
      if (match) {
        return pattern.processor(match);
      }
    }
    
    return null;
  }
  
  // Main parsing method
  parseEffect(description: string, sourceId?: string): StatusEffect | null {
    // Try each pattern in order
    for (const pattern of this.patterns) {
      const match = description.match(pattern.regex);
      if (match) {
        const partialEffect = pattern.processor(match, sourceId);
        
        // Fill in defaults for any missing properties
        return {
          id: partialEffect.id || 'generic_effect',
          name: partialEffect.name || 'Effect',
          description: partialEffect.description || description,
          duration: partialEffect.duration || 1,
          onApply: partialEffect.onApply,
          onRemove: partialEffect.onRemove,
          onTurnStart: partialEffect.onTurnStart,
          onTurnEnd: partialEffect.onTurnEnd,
        };
      }
    }
    
    // If no pattern matched, return a generic effect
    return {
      id: 'generic_effect',
      name: 'Generic Effect',
      description: description,
      duration: 1,
    };
  }
  
  // Process class features or special abilities
  parseClassFeature(featureName: string, description: string): StatusEffect | null {
    // Special handling for common class features
    switch (featureName.toLowerCase()) {
      case "berserker rage":
        return {
          id: 'berserker_rage',
          name: 'Berserker Rage',
          description: description,
          duration: 10, // Typically 1 minute = 10 rounds
          onApply: (target: Combatant) => {
            // Apply rage bonuses
            target.damageBonus = (target.damageBonus || 0) + 2;
            target.abilityModifiers = target.abilityModifiers || {};
            target.abilityModifiers.strength = { advantage: true };
            target.abilityModifiers.constitution = { advantage: true };
          },
          onRemove: (target: Combatant) => {
            // Remove rage bonuses
            if (target.damageBonus) target.damageBonus -= 2;
            if (target.abilityModifiers) {
              delete target.abilityModifiers.strength;
              delete target.abilityModifiers.constitution;
            }
          }
        };
        
      case "sneak attack":
        return {
          id: 'sneak_attack',
          name: 'Sneak Attack',
          description: description,
          duration: 1, // Until next attack
          onApply: (target: Combatant) => {
            // Calculate sneak attack damage based on level
            const level = target.level || 1;
            const sneakDice = Math.ceil(level / 2);
            
            target.additionalDamage = target.additionalDamage || [];
            target.additionalDamage.push({
              type: 'kinetic',
              dice: sneakDice,
              sides: 6,
              bonus: 0,
              oneTime: true // Only applies once
            });
          }
        };
        
      // Add more class features as needed
        
      default:
        // Try to parse using the general patterns
        return this.parseEffect(description);
    }
  }
}

// Helper function to create an effect quickly
export function createEffect(
  effectDescription: string,
  sourceId?: string
): StatusEffect | null {
  const parser = new EffectParser();
  return parser.parseEffect(effectDescription, sourceId);
}

// Helper function to apply an effect from description
export function applyEffectFromDescription(
  target: Combatant,
  effectDescription: string,
  sourceId?: string,
  statusEffectManager?: any
): void {
  const effect = createEffect(effectDescription, sourceId);
  if (effect && statusEffectManager) {
    statusEffectManager.applyEffect(target.id, effect);
  } else if (effect && effect.onApply) {
    effect.onApply(target);
  }
}
