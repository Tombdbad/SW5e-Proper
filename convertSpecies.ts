
import { z } from 'zod';
import { Schemas } from './shared/unifiedSchema';
import fs from 'fs/promises';

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

async function convertSpecies(oldSpecies: OldSpecies[]) {
  const newSpecies = oldSpecies.map((species) => ({
    id: species.id,
    name: species.name,
    description: `${species.summary} ${species.description}`,
    abilityScoreIncrease: species.abilityScoreIncrease,
    age: {
      maturity: 18,
      lifespan: 80
    },
    alignment: "Any",
    size: species.size.toLowerCase() as "tiny" | "small" | "medium" | "large" | "huge",
    sizeDescription: `${species.name}s are typically ${species.size.toLowerCase()} sized creatures.`,
    speed: species.speed.walk || 30,
    languages: species.languages,
    traits: [
      ...species.traits,
      species.vision && {
        name: `${species.vision.type} Vision`,
        description: `You have ${species.vision.type.toLowerCase()} vision up to ${species.vision.range || 60} feet.`
      }
    ].filter(Boolean),
    source: species.source,
    recommendedClasses: species.commonClasses || []
  }));

  // Validate converted data
  for (const species of newSpecies) {
    try {
      Schemas.Species.parse(species);
    } catch (error) {
      console.error(`Validation failed for species ${species.name}:`, error);
      throw error;
    }
  }

  return newSpecies;
}

export async function runConversion() {
  const oldData = JSON.parse(await fs.readFile('./data/species-old.json', 'utf-8'));
  const converted = await convertSpecies(oldData);
  await fs.writeFile('./data/species-new.json', JSON.stringify(converted, null, 2));
  console.log('Species conversion completed successfully');
}

if (require.main === module) {
  runConversion().catch(console.error);
}
