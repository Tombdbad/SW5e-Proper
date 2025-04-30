import { Character } from "../stores/useCharacter";
import { Campaign } from "../stores/useCampaign";
import { SPECIES } from "./species";
import { CLASSES } from "./classes";
import { BACKGROUNDS } from "./backgrounds";
import { LOCATIONS } from "./locations";
import { NPCS } from "./npcs";

interface ObjectiveContext {
  character: Character;
  campaign: Campaign;
  locationData: any;
  factionStanding: Record<string, number>;
}

export function generateObjectives(context: ObjectiveContext) {
  const { character, campaign, locationData } = context;

  // Extract relevant character traits
  const characterTraits = {
    class: CLASSES.find((c) => c.name === character.class),
    species: SPECIES.find((s) => s.name === character.species),
    background: BACKGROUNDS.find((b) => b.name === character.background),
    alignment: character.biography?.alignment,
    level: character.level,
  };

  // Generate objectives based on character traits
  const objectives = [];

  // Class-based objectives
  if (characterTraits.class) {
    objectives.push({
      type: "class",
      title: `${characterTraits.class.name} Training`,
      description: `Complete training specific to your ${characterTraits.class.name} abilities`,
      difficulty: character.level,
      reward: {
        experience: character.level * 100,
        credits: character.level * 50,
      },
    });
  }

  // Background-based objectives
  if (characterTraits.background) {
    objectives.push({
      type: "background",
      title: `${characterTraits.background.name} Connection`,
      description: `Leverage your ${characterTraits.background.name} connections`,
      difficulty: Math.floor(character.level * 0.8),
      reward: {
        experience: character.level * 75,
        credits: character.level * 40,
      },
    });
  }

  // Location-based objectives
  if (campaign.currentLocation && locationData) {
    objectives.push({
      type: "location",
      title: `Explore ${locationData.name}`,
      description: `Discover secrets of ${locationData.name}`,
      difficulty: character.level,
      reward: {
        experience: character.level * 150,
        items: locationData.availableItems || [],
      },
    });
  }

  return objectives;
}
