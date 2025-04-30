
import fs from 'fs';
import path from 'path';

interface OldSpecies {
  id: string;
  name: string;
  summary: string;
  description: string;
  abilityScoreIncrease: {
    [key: string]: number;
  };
  size: string;
  speed: {
    [key: string]: number;
  };
  vision: {
    type: string;
    range?: number;
  };
  traits: {
    name: string;
    description: string;
  }[];
  languages: string[];
  source: string;
  commonClasses?: string[];
}

interface NewSpecies {
  id: string;
  name: string;
  description: string;
  abilityScoreIncrease: {
    [key: string]: number;
  };
  age: {
    maturity: number;
    lifespan: number;
  };
  alignment: string;
  size: "tiny" | "small" | "medium" | "large" | "huge";
  sizeDescription: string;
  speed: number;
  languages: string[];
  traits: {
    name: string;
    description: string;
  }[];
}

function convertSpecies(oldSpecies: OldSpecies): NewSpecies {
  // Default age values based on general Star Wars lore
  const defaultAge = {
    maturity: 18,
    lifespan: 80
  };

  // Map size to new format
  const sizeMap: { [key: string]: "tiny" | "small" | "medium" | "large" | "huge" } = {
    "Small": "small",
    "Medium": "medium",
    "Large": "large",
  };

  return {
    id: oldSpecies.id,
    name: oldSpecies.name,
    description: `${oldSpecies.summary} ${oldSpecies.description}`,
    abilityScoreIncrease: oldSpecies.abilityScoreIncrease,
    age: defaultAge,
    alignment: "Any alignment",
    size: sizeMap[oldSpecies.size] || "medium",
    sizeDescription: `${oldSpecies.name}s are typically ${oldSpecies.size.toLowerCase()} sized creatures.`,
    speed: oldSpecies.speed.walk || 30,
    languages: oldSpecies.languages,
    traits: [
      ...oldSpecies.traits,
      // Add speed traits for non-walking speeds
      ...Object.entries(oldSpecies.speed)
        .filter(([type]) => type !== 'walk')
      ]