import { Character } from "../stores/useCharacter";
import { classes } from "./classes";
import { species } from "./species";
import { backgrounds } from "./backgrounds";

interface ParsedCharacterData {
  archetype: string;
  combatStyle: string;
  primaryMotivation: string;
  suggestedAllies: string[];
  suggestedEnemies: string[];
}

export function parseCharacterData(character: Character): ParsedCharacterData {
  const charClass = classes.find((c) => c.id === character.class);
  const charSpecies = species.find((s) => s.id === character.species);
  const charBackground = backgrounds.find((b) => b.id === character.background);

  // Determine combat style based on ability scores and class
  const combatStyle = determineCombatStyle(character);

  // Generate suggested allies and enemies based on background and alignment
  const allies = generateSuggestedAllies(character);
  const enemies = generateSuggestedEnemies(character);

  return {
    archetype: determineArchetype(character),
    combatStyle,
    primaryMotivation: determinePrimaryMotivation(character),
    suggestedAllies: allies,
    suggestedEnemies: enemies,
  };
}

function determineCombatStyle(character: Character): string {
  if (character.abilityScores.strength > character.abilityScores.dexterity) {
    return "Melee Combat Specialist";
  } else if (
    character.abilityScores.dexterity > character.abilityScores.strength
  ) {
    return "Ranged Combat Specialist";
  }
  return "Balanced Fighter";
}

function determineArchetype(character: Character): string {
  const forceUser = ["consular", "guardian", "sentinel"].includes(
    character.class,
  );
  const techUser = ["engineer", "scholar"].includes(character.class);

  if (forceUser) return "Force Practitioner";
  if (techUser) return "Tech Specialist";
  return "Martial Combatant";
}

function determinePrimaryMotivation(character: Character): string {
  switch (character.background) {
    case "criminal":
      return "Profit and Power";
    case "noble":
      return "Status and Influence";
    case "soldier":
      return "Duty and Honor";
    case "pilot":
      return "Freedom and Adventure";
    default:
      return "Personal Achievement";
  }
}

function generateSuggestedAllies(character: Character): string[] {
  const allies: string[] = [];

  switch (character.background) {
    case "criminal":
      allies.push("Underworld Contacts");
      allies.push("Black Market Dealers");
      break;
    case "noble":
      allies.push("Political Allies");
      allies.push("Wealthy Merchants");
      break;
    case "soldier":
      allies.push("Military Contacts");
      allies.push("Fellow Veterans");
      break;
  }

  return allies;
}

function generateSuggestedEnemies(character: Character): string[] {
  const enemies: string[] = [];

  if (character.alignment.includes("Light")) {
    enemies.push("Dark Side Cultists");
    enemies.push("Criminal Organizations");
  } else if (character.alignment.includes("Dark")) {
    enemies.push("Law Enforcement");
    enemies.push("Jedi Remnants");
  }

  return enemies;
}
